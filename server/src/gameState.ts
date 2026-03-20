import {
  AbilitySlot,
  ActiveStatus,
  Enemy,
  EnemyTier,
  EnemyType,
  GameState,
  Obstacle,
  ObstacleType,
  Player,
  PlayerAction,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  VISIBILITY_RADIUS,
} from '../../shared/src/types';
import { CREEP_KITS, createEmptyCooldowns } from '../../shared/src/abilityCatalog';

const MOVE_SPEED = 5;
const ACTION_COOLDOWN_MS = 500; // 500ms cooldown on attack/dodge

// Collision half-sizes per obstacle type (axis-aligned bounding boxes)
const OBSTACLE_HALF_W: Record<string, number> = { tomb: 14, dead_tree: 12, dry_branch: 20, lake: 140, bush: 18 };
const OBSTACLE_HALF_H: Record<string, number> = { tomb: 20, dead_tree: 12, dry_branch: 6, lake: 80, bush: 12 };

// Player collision half-sizes
const PLAYER_HALF_W = 14;
const PLAYER_HALF_H = 20;
const OBSTACLE_VISIBILITY_PADDING = 56;

// Obstacle placement constants
const OBSTACLE_PLACEMENT_MARGIN = 60;
const OBSTACLE_CENTER_CLEAR_RADIUS = 80; // keep the center start area clear
const MAX_PLACEMENT_ATTEMPTS_MULTIPLIER = 20;
const ENEMY_SEPARATION_DISTANCE = 72;
const ENEMY_PLAYER_SPAWN_BUFFER = 84;
const SERVER_TICK_MS = 50;

const SPHYNX_GOLDEN_ARMOR_DURATION_MS = 15000;
const CAT_RAGE_DURATION_MS = 15000;
const ZOMBIE_DODGE_HIDDEN_MS = 2000;
const VAMPIRE_PUDDLE_MS = 3000;
const BAT_SPECIAL_PARALYZE_MS = 2000;
const BAT_CHANNEL_MAX_MS = 5000;
const BAT_CHANNEL_TICK_MS = 220;
const BAT_CHANNEL_RADIUS = 220;
const MEDUSA_SPECIAL_CAST_LOCK_MS = 1000;
const MEDUSA_SPECIAL_RETURN_ANIM_MS = 450;
const MEDUSA_SPECIAL_FRONT_MIN_DISTANCE = 24;
const MEDUSA_SPECIAL_HALF_WIDTH = 39;
const MEDUSA_DODGE_TRIGGER_RATIO = 0.52;
const MEDUSA_ULTIMATE_PETRIFY_MS = 2000;
const MEDUSA_ULTIMATE_CONE_RANGE = 220;
const MEDUSA_ULTIMATE_CONE_ARC_DEGREES = 54;
const PLAYER_DEATH_DECISION_MS = 10000;

const PLAYER_RADIUS = 18;
const ENEMY_RADIUS = 20;

type PendingAreaStrike = {
  id: string;
  ownerPlayerId: string;
  kind: 'medusa_special';
  triggerAtMs: number;
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  depth: number;
  halfWidth: number;
  damage: number;
};

type PendingMedusaDodge = {
  playerId: string;
  triggerAtMs: number;
  dashTargetX: number;
  dashTargetY: number;
  dodgeDistance: number;
};

type BatChannelState = {
  playerId: string;
  startedAtMs: number;
  lastTickAtMs: number;
  targetX: number;
  targetY: number;
};

type EnemyArchetype = {
  type: EnemyType;
  isBoss: boolean;
  tier: EnemyTier;
  count: number;
  speed: number;
  maxHealth: number;
  aggroRange: number;
  attackRange: number;
  damage: number;
  attackCooldownMs: number;
};

const ENEMY_ARCHETYPES: EnemyArchetype[] = [
  { type: 'skeleton', isBoss: false, tier: 'normal', count: 10, speed: 2.1, maxHealth: 85, aggroRange: 420, attackRange: 34, damage: 7, attackCooldownMs: 1300 },
  { type: 'ghoul', isBoss: false, tier: 'medium', count: 7, speed: 2.6, maxHealth: 95, aggroRange: 460, attackRange: 40, damage: 9, attackCooldownMs: 1150 },
  { type: 'gravekeeper', isBoss: false, tier: 'high', count: 4, speed: 1.7, maxHealth: 140, aggroRange: 500, attackRange: 48, damage: 12, attackCooldownMs: 1500 },
  { type: 'gargoyle', isBoss: true, tier: 'boss', count: 1, speed: 1.85, maxHealth: 420, aggroRange: 680, attackRange: 62, damage: 20, attackCooldownMs: 1700 },
];

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distanceSq(ax, ay, bx, by));
}

function statusId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function hasStatus(target: { activeStatuses?: ActiveStatus[] }, kind: ActiveStatus['kind']): boolean {
  return Boolean(target.activeStatuses?.some((s) => s.kind === kind && s.remainingMs > 0));
}

function addOrRefreshStatus(target: { activeStatuses?: ActiveStatus[] }, next: ActiveStatus): void {
  if (!target.activeStatuses) target.activeStatuses = [];
  const existing = target.activeStatuses.find((s) => s.kind === next.kind && s.sourcePlayerId === next.sourcePlayerId);
  if (existing) {
    existing.remainingMs = Math.max(existing.remainingMs, next.remainingMs);
    existing.value = next.value ?? existing.value;
    existing.tickIntervalMs = next.tickIntervalMs ?? existing.tickIntervalMs;
    existing.tickTimerMs = 0;
    return;
  }
  target.activeStatuses.push(next);
}

function tickStatuses(target: { activeStatuses?: ActiveStatus[] }, deltaMs: number, onTick?: (status: ActiveStatus) => void): void {
  if (!target.activeStatuses || target.activeStatuses.length === 0) return;
  const next: ActiveStatus[] = [];
  for (const status of target.activeStatuses) {
    status.remainingMs -= deltaMs;
    if (status.tickIntervalMs && status.tickIntervalMs > 0) {
      status.tickTimerMs = (status.tickTimerMs ?? 0) + deltaMs;
      while (status.tickTimerMs >= status.tickIntervalMs && status.remainingMs > 0) {
        status.tickTimerMs -= status.tickIntervalMs;
        onTick?.(status);
      }
    }
    if (status.remainingMs > 0) next.push(status);
  }
  target.activeStatuses = next;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function generateObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = [];
  let id = 0;

  // Helper: check whether a candidate obstacle at (x,y) would intersect any already-placed obstacle.
  // Uses simple AABB tests; lakes use their rx/ry as half-sizes. Accept an optional extraBuffer
  // to increase separation (used for lakes).
  const intersectsExisting = (x: number, y: number, type: string, rx?: number, ry?: number, extraBuffer = 12): boolean => {
    const buffer = extraBuffer; // extra spacing to keep obstacles visually separate
    const candHW = (type === 'lake' && rx && rx > 0) ? rx : (OBSTACLE_HALF_W[type] || 12);
    const candHH = (type === 'lake' && ry && ry > 0) ? ry : (OBSTACLE_HALF_H[type] || 8);

    for (const o of obstacles) {
      const otherHW = ((o as any).rx && (o as any).rx > 0) ? (o as any).rx : (OBSTACLE_HALF_W[o.type] || 12);
      const otherHH = ((o as any).ry && (o as any).ry > 0) ? (o as any).ry : (OBSTACLE_HALF_H[o.type] || 8);
      if (Math.abs(x - o.x) < candHW + otherHW + buffer && Math.abs(y - o.y) < candHH + otherHH + buffer) return true;
    }
    return false;
  };

  const spawn = (type: ObstacleType, count: number) => {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * MAX_PLACEMENT_ATTEMPTS_MULTIPLIER) {
      attempts++;
      const x = OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN * 2);
      const y = OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN * 2);
      // Avoid spawning obstacles in the center starting area
      if (Math.abs(x - WORLD_WIDTH / 2) < OBSTACLE_CENTER_CLEAR_RADIUS &&
          Math.abs(y - WORLD_HEIGHT / 2) < OBSTACLE_CENTER_CLEAR_RADIUS) continue;
      // Avoid overlaps with previously placed obstacles
      if (intersectsExisting(x, y, type)) continue;
      obstacles.push({ id: id++, type, x: Math.round(x), y: Math.round(y) });
      placed++;
    }
  };

  // Add a deterministic medium lake at map center for Graves of Nihilia.
  // Place it before random obstacles so subsequent placement avoids overlaps.
  obstacles.push({
    id: id++,
    type: 'lake',
    x: Math.round(WORLD_WIDTH / 2),
    y: Math.round(WORLD_HEIGHT / 2),
    rx: 96,
    ry: 52,
    shape: 'ellipse'
  });

  spawn('tomb', 18);
  spawn('dead_tree', 14);
  spawn('dry_branch', 24);
  // Add several lakes with varied, singular forms near the moon area (center-top quarter).
  const lakeBaseX = Math.round(WORLD_WIDTH / 2);
  const lakeBaseY = Math.round(WORLD_HEIGHT / 4);
  // Place three smaller lakes near the moon area so they are visible easily
  const LAKE_COUNT = 3; // place three small lakes
  const lakeSizes = [
    { rx: 80, ry: 30 }, // small elongated
    { rx: 60, ry: 60 }, // small round pond
    { rx: 70, ry: 36 }, // small oval
  ];
  let lakesPlaced = 0;
  let lakeAttempts = 0;
  const LAKE_ATTEMPT_LIMIT = 1200;
  while (lakesPlaced < LAKE_COUNT && lakeAttempts < LAKE_ATTEMPT_LIMIT) {
    lakeAttempts++;
    // keep lakes relatively close to the moon area (smaller jitter)
    const dx = (Math.random() - 0.5) * 360;
    const dy = (Math.random() - 0.5) * 220;
    const x = lakeBaseX + dx;
    const y = lakeBaseY + dy;
    if (Math.abs(x - WORLD_WIDTH / 2) < OBSTACLE_CENTER_CLEAR_RADIUS && Math.abs(y - WORLD_HEIGHT / 2) < OBSTACLE_CENTER_CLEAR_RADIUS) continue;
    const sz = lakeSizes[lakesPlaced % lakeSizes.length];
    const jitterX = -12 + Math.round(Math.random() * 24);
    const jitterY = -8 + Math.round(Math.random() * 16);
    const rx = Math.max(30, sz.rx + jitterX);
    const ry = Math.max(20, sz.ry + jitterY);
    const shape = Math.random() < 0.6 ? 'ellipse' : 'irregular';
    if (intersectsExisting(x, y, 'lake', rx, ry, 64)) continue;
    obstacles.push({ id: id++, type: 'lake', x: Math.round(x), y: Math.round(y), rx, ry, shape });
    lakesPlaced++;
  }

  // Add two targeted small lakes with deterministic base positions (center-south and north-east).
  // Try jittered placement to avoid collisions; skip if suitable spot isn't found after attempts.
  const extraLakes = [
    { x: Math.round(WORLD_WIDTH / 2), y: Math.round(WORLD_HEIGHT * 0.85), rx: 64, ry: 28, shape: 'ellipse' },
    { x: Math.round(WORLD_WIDTH * 0.85), y: Math.round(WORLD_HEIGHT * 0.15), rx: 56, ry: 24, shape: 'ellipse' },
  ];
  for (const el of extraLakes) {
    let placed = false;
    for (let a = 0; a < 24 && !placed; a++) {
      const jitterX = (Math.random() - 0.5) * 80;
      const jitterY = (Math.random() - 0.5) * 60;
      const ex = Math.round(el.x + jitterX);
      const ey = Math.round(el.y + jitterY);
      if (ex < OBSTACLE_PLACEMENT_MARGIN || ex > WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN) continue;
      if (ey < OBSTACLE_PLACEMENT_MARGIN || ey > WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN) continue;
      if (Math.abs(ex - WORLD_WIDTH / 2) < OBSTACLE_CENTER_CLEAR_RADIUS && Math.abs(ey - WORLD_HEIGHT / 2) < OBSTACLE_CENTER_CLEAR_RADIUS) continue;
      if (intersectsExisting(ex, ey, 'lake', el.rx, el.ry, 64)) continue;
      obstacles.push({ id: id++, type: 'lake', x: ex, y: ey, rx: el.rx, ry: el.ry, shape: el.shape });
      placed = true;
    }
    if (!placed) {
      // last-ditch: try the exact base location with a smaller buffer before giving up
      if (!intersectsExisting(el.x, el.y, 'lake', el.rx, el.ry, 12) &&
          el.x > OBSTACLE_PLACEMENT_MARGIN && el.x < WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN &&
          el.y > OBSTACLE_PLACEMENT_MARGIN && el.y < WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN) {
        obstacles.push({ id: id++, type: 'lake', x: Math.round(el.x), y: Math.round(el.y), rx: el.rx, ry: el.ry, shape: el.shape });
      }
    }
  }

  // Surround each lake with decorative obstacles (bushes / occasional dead trees)
  const SURROUND_BUSHES = 6;
  const lakeObjs = obstacles.filter(o => o.type === 'lake');
  for (const lake of lakeObjs) {
    const lr = (lake as any).rx || OBSTACLE_HALF_W['lake'];
    const lry = (lake as any).ry || OBSTACLE_HALF_H['lake'];
    const ringBase = Math.max(lr, lry) + 28;
    for (let k = 0; k < SURROUND_BUSHES; k++) {
      const angle = (k / SURROUND_BUSHES) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = ringBase + Math.round(Math.random() * 36);
      const px = lake.x + Math.cos(angle) * dist;
      const py = lake.y + Math.sin(angle) * dist;
      if (px < OBSTACLE_PLACEMENT_MARGIN || px > WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN) continue;
      if (py < OBSTACLE_PLACEMENT_MARGIN || py > WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN) continue;
      if (Math.abs(px - WORLD_WIDTH / 2) < OBSTACLE_CENTER_CLEAR_RADIUS && Math.abs(py - WORLD_HEIGHT / 2) < OBSTACLE_CENTER_CLEAR_RADIUS) continue;
      const placeType = Math.random() < 0.18 ? 'dead_tree' : 'bush';
      if (intersectsExisting(px, py, placeType)) continue;
      obstacles.push({ id: id++, type: placeType as ObstacleType, x: Math.round(px), y: Math.round(py) });
    }
  }

  // Add several purple bushes as decorative obstacles
  const BUSH_COUNT = 28;
  let bushPlaced = 0;
  let bushAttempts = 0;
  while (bushPlaced < BUSH_COUNT && bushAttempts < BUSH_COUNT * 40) {
    bushAttempts++;
    const x = OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN * 2);
    const y = OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN * 2);
    // Avoid center start area
    if (Math.abs(x - WORLD_WIDTH / 2) < OBSTACLE_CENTER_CLEAR_RADIUS && Math.abs(y - WORLD_HEIGHT / 2) < OBSTACLE_CENTER_CLEAR_RADIUS) continue;
    // avoid placing directly overlapping any existing obstacle (including lakes)
    if (intersectsExisting(x, y, 'bush')) continue;
    obstacles.push({ id: id++, type: 'bush', x: Math.round(x), y: Math.round(y) });
    bushPlaced++;
  }

  return obstacles;
}

function overlapsObstacle(px: number, py: number, obstacle: Obstacle): boolean {
  // If obstacle specifies radii (for lakes), use expanded ellipse bounding box
  if ((obstacle as any).rx && (obstacle as any).ry) {
    const rx = (obstacle as any).rx;
    const ry = (obstacle as any).ry;
    return (
      px + PLAYER_HALF_W > obstacle.x - rx &&
      px - PLAYER_HALF_W < obstacle.x + rx &&
      py + PLAYER_HALF_H > obstacle.y - ry &&
      py - PLAYER_HALF_H < obstacle.y + ry
    );
  }

  const hw = OBSTACLE_HALF_W[obstacle.type];
  const hh = OBSTACLE_HALF_H[obstacle.type];
  return (
    px + PLAYER_HALF_W > obstacle.x - hw &&
    px - PLAYER_HALF_W < obstacle.x + hw &&
    py + PLAYER_HALF_H > obstacle.y - hh &&
    py - PLAYER_HALF_H < obstacle.y + hh
  );
}

function generateEnemies(obstacles: Obstacle[]): Record<string, Enemy> {
  const enemies: Record<string, Enemy> = {};
  const placed: Enemy[] = [];
  let enemyId = 0;

  const canPlace = (x: number, y: number, enemyType: EnemyType): boolean => {
    if (x < OBSTACLE_PLACEMENT_MARGIN || x > WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN) return false;
    if (y < OBSTACLE_PLACEMENT_MARGIN || y > WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN) return false;
    if (Math.abs(x - WORLD_WIDTH / 2) < OBSTACLE_CENTER_CLEAR_RADIUS && Math.abs(y - WORLD_HEIGHT / 2) < OBSTACLE_CENTER_CLEAR_RADIUS) return false;
    if (enemyType !== 'gargoyle' && obstacles.some(o => overlapsObstacle(x, y, o))) return false;
    if (placed.some(e => distanceSq(x, y, e.x, e.y) < ENEMY_SEPARATION_DISTANCE * ENEMY_SEPARATION_DISTANCE)) return false;
    return true;
  };

  const addEnemy = (archetype: EnemyArchetype, x: number, y: number) => {
    const id = `enemy_${enemyId++}`;
    const enemy: Enemy = {
      id,
      type: archetype.type,
      isBoss: archetype.isBoss,
      tier: archetype.tier,
      x,
      y,
      targetX: x,
      targetY: y,
      homeX: x,
      homeY: y,
      speed: archetype.speed,
      maxHealth: archetype.maxHealth,
      health: archetype.maxHealth,
      aggroRange: archetype.aggroRange,
      attackRange: archetype.attackRange,
      damage: archetype.damage,
      attackCooldownMs: archetype.attackCooldownMs,
      lastAttackTime: 0,
      activeStatuses: [],
    };
    enemies[id] = enemy;
    placed.push(enemy);
  };

  for (const archetype of ENEMY_ARCHETYPES) {
    for (let i = 0; i < archetype.count; i++) {
      let spawnX = Math.round(OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN * 2));
      let spawnY = Math.round(OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN * 2));

      if (archetype.type === 'gargoyle') {
        spawnX = Math.round(WORLD_WIDTH * 0.5);
        spawnY = Math.round(WORLD_HEIGHT * 0.18);
      }

      let placedEnemy = false;
      for (let attempt = 0; attempt < 400; attempt++) {
        if (canPlace(spawnX, spawnY, archetype.type)) {
          addEnemy(archetype, spawnX, spawnY);
          placedEnemy = true;
          break;
        }

        if (archetype.type === 'gargoyle') {
          spawnX = Math.round(WORLD_WIDTH * 0.5 + (Math.random() - 0.5) * 360);
          spawnY = Math.round(WORLD_HEIGHT * 0.18 + (Math.random() - 0.5) * 220);
        } else {
          spawnX = Math.round(OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN * 2));
          spawnY = Math.round(OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN * 2));
        }
      }

      if (!placedEnemy) {
        // Fallback placement if map is dense.
        addEnemy(archetype, Math.max(OBSTACLE_PLACEMENT_MARGIN, Math.min(WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN, spawnX)), Math.max(OBSTACLE_PLACEMENT_MARGIN, Math.min(WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN, spawnY)));
      }
    }
  }

  return enemies;
}

export class GameStateManager {
  private sphynxPyramidOrder: Record<string, string[]> = {};
  private pendingAreaStrikes: PendingAreaStrike[] = [];
  private pendingMedusaDodges: PendingMedusaDodge[] = [];
  private batChannels: Record<string, BatChannelState> = {};

  private state: GameState = {
    players: {},
    enemies: {},
    summons: {},
    totalPlayers: 0,
    tick: 0,
    obstacles: generateObstacles(),
    visibilityRadius: VISIBILITY_RADIUS,
  };

  constructor() {
    this.state.enemies = generateEnemies(this.state.obstacles);
  }

  addPlayer(player: Player): void {
    player.activeCooldowns = player.activeCooldowns || createEmptyCooldowns();
    player.activeStatuses = player.activeStatuses || [];
    player.castState = player.castState ?? null;
    player.isDead = Boolean(player.isDead);
    player.deathStartedAtMs = player.deathStartedAtMs || 0;
    player.deathDeadlineMs = player.deathDeadlineMs || 0;
    player.pvpEnabled = Boolean(player.pvpEnabled);
    this.state.players[player.id] = player;
    this.state.totalPlayers = Object.keys(this.state.players).length;
    this.sphynxPyramidOrder[player.id] = [];
  }

  // Find a safe spawn position that does not overlap obstacles or other players
  findSpawnPosition(): { x: number; y: number } {
    const attempts = 1000;
    for (let i = 0; i < attempts; i++) {
      const x = OBSTACLE_PLACEMENT_MARGIN + Math.floor(Math.random() * (WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN * 2));
      const y = OBSTACLE_PLACEMENT_MARGIN + Math.floor(Math.random() * (WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN * 2));

      // Keep center clear as in obstacle placement
      if (Math.abs(x - WORLD_WIDTH / 2) < OBSTACLE_CENTER_CLEAR_RADIUS && Math.abs(y - WORLD_HEIGHT / 2) < OBSTACLE_CENTER_CLEAR_RADIUS) continue;

      // Avoid obstacles
      const hitObs = this.state.obstacles.some(o => overlapsObstacle(x, y, o));
      if (hitObs) continue;

      // Avoid spawning on top of other players (simple distance check)
      const tooCloseToPlayer = Object.values(this.state.players).some(p => {
        if (p.isDead) return false;
        const dx = p.x - x;
        const dy = p.y - y;
        return Math.sqrt(dx * dx + dy * dy) < (PLAYER_HALF_W + 8); // buffer
      });
      if (tooCloseToPlayer) continue;

      // Avoid spawning on top of enemies
      const tooCloseToEnemy = Object.values(this.state.enemies).some(e => {
        return distanceSq(e.x, e.y, x, y) < ENEMY_PLAYER_SPAWN_BUFFER * ENEMY_PLAYER_SPAWN_BUFFER;
      });
      if (tooCloseToEnemy) continue;

      return { x, y };
    }

    // Fallback: return a clamped random position
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH, Math.floor(Math.random() * WORLD_WIDTH))),
      y: Math.max(0, Math.min(WORLD_HEIGHT, Math.floor(Math.random() * WORLD_HEIGHT))),
    };
  }

  removePlayer(playerId: string): void {
    this.stopBatUltimateChannel(playerId, false);
    this.pendingAreaStrikes = this.pendingAreaStrikes.filter((s) => s.ownerPlayerId !== playerId);
    this.pendingMedusaDodges = this.pendingMedusaDodges.filter((d) => d.playerId !== playerId);
    delete this.state.players[playerId];
    delete this.sphynxPyramidOrder[playerId];
    for (const [id, summon] of Object.entries(this.state.summons)) {
      if (summon.ownerPlayerId === playerId) delete this.state.summons[id];
    }
    this.state.totalPlayers = Object.keys(this.state.players).length;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.state.players[playerId];
  }

  private markPlayerDead(player: Player): void {
    this.stopBatUltimateChannel(player.id, false);
    player.health = 0;
    player.action = 'idle';
    player.activeStatuses = [];
    player.castState = null;
    player.isDead = true;
    player.deathStartedAtMs = Date.now();
    player.deathDeadlineMs = player.deathStartedAtMs + PLAYER_DEATH_DECISION_MS;
  }

  reenterPlayer(playerId: string): boolean {
    const player = this.state.players[playerId];
    if (!player || !player.isDead) return false;
    this.respawnPlayer(player);
    return true;
  }

  getExpiredDeadPlayerIds(now = Date.now()): string[] {
    const expired: string[] = [];
    for (const player of Object.values(this.state.players)) {
      if (!player.isDead) continue;
      if (player.deathDeadlineMs > 0 && now >= player.deathDeadlineMs) {
        expired.push(player.id);
      }
    }
    return expired;
  }

  private isCooldownReady(player: Player, slot: AbilitySlot, now: number): boolean {
    const cooldown = player.activeCooldowns[slot];
    return !cooldown || cooldown.expiresAtMs <= now;
  }

  private setCooldown(player: Player, slot: AbilitySlot, durationMs: number, now: number): void {
    player.activeCooldowns[slot] = {
      slot,
      durationMs,
      expiresAtMs: now + durationMs,
    };
  }

  private directionFromPlayer(player: Player, targetX?: number, targetY?: number): { x: number; y: number } {
    if (typeof targetX === 'number' && typeof targetY === 'number') {
      const dx = targetX - player.x;
      const dy = targetY - player.y;
      const mag = Math.hypot(dx, dy);
      if (mag > 0.001) return { x: dx / mag, y: dy / mag };
    }
    return { x: 1, y: 0 };
  }

  private clampTargetToRange(player: Player, maxRange: number, targetX?: number, targetY?: number): { x: number; y: number } {
    if (typeof targetX !== 'number' || typeof targetY !== 'number') {
      return { x: player.x, y: player.y };
    }

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.001) return { x: player.x, y: player.y };
    if (dist <= maxRange) {
      return {
        x: Math.max(0, Math.min(WORLD_WIDTH, targetX)),
        y: Math.max(0, Math.min(WORLD_HEIGHT, targetY)),
      };
    }

    const nx = dx / dist;
    const ny = dy / dist;
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH, player.x + nx * maxRange)),
      y: Math.max(0, Math.min(WORLD_HEIGHT, player.y + ny * maxRange)),
    };
  }

  private computeCatSpecialAirTarget(player: Player, range: number, targetX?: number, targetY?: number): { x: number; y: number } {
    const maxRange = Math.max(24, range);
    if (typeof targetX === 'number' && typeof targetY === 'number') {
      return this.clampTargetToRange(player, maxRange, targetX, targetY);
    }

    const dir = this.directionFromPlayer(player, targetX, targetY);
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH, player.x + dir.x * maxRange)),
      y: Math.max(0, Math.min(WORLD_HEIGHT, player.y + dir.y * maxRange)),
    };
  }

  private resolveCatSpecialVisualTarget(player: Player, range: number, targetX?: number, targetY?: number): { x: number; y: number } {
    const airTarget = this.computeCatSpecialAirTarget(player, range, targetX, targetY);
    const aim = this.directionFromPlayer(player, airTarget.x, airTarget.y);
    const arcCos = Math.cos((120 * Math.PI / 180) / 2);

    let best: { x: number; y: number } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    const consider = (tx: number, ty: number, radiusPad: number) => {
      const dist = distance(player.x, player.y, tx, ty);
      if (dist > range + radiusPad) return;

      const safeDist = Math.max(0.001, dist);
      const dirX = (tx - player.x) / safeDist;
      const dirY = (ty - player.y) / safeDist;
      if ((dirX * aim.x + dirY * aim.y) < arcCos) return;

      const score = distanceSq(tx, ty, airTarget.x, airTarget.y) + dist * dist * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = { x: tx, y: ty };
      }
    };

    for (const enemy of Object.values(this.state.enemies)) {
      consider(enemy.x, enemy.y, ENEMY_RADIUS);
    }
    for (const target of Object.values(this.state.players)) {
      if (target.id === player.id || target.isDead) continue;
      if (!this.isPvpAllowed(player, target)) continue;
      consider(target.x, target.y, PLAYER_RADIUS);
    }

    return best ?? airTarget;
  }

  private isPvpAllowed(attacker: Player, target: Player): boolean {
    if (attacker.id === target.id) return false;
    if (attacker.isDead || target.isDead) return false;
    return attacker.pvpEnabled && target.pvpEnabled;
  }

  private applyAreaDamage(
    caster: Player,
    centerX: number,
    centerY: number,
    radius: number,
    damage: number,
    applyBleed = false
  ): number {
    const boostedDamage = this.computeOutgoingDamage(caster, damage);
    let hits = 0;

    for (const enemy of Object.values(this.state.enemies)) {
      if (distance(centerX, centerY, enemy.x, enemy.y) <= radius + ENEMY_RADIUS) {
        this.damageEnemyTarget(enemy, boostedDamage);
        if (applyBleed) this.tryApplyBleed(caster, enemy);
        hits++;
      }
    }

    for (const target of Object.values(this.state.players)) {
      if (target.id === caster.id) continue;
      if (target.isDead) continue;
      if (!this.isPvpAllowed(caster, target)) continue;
      if (distance(centerX, centerY, target.x, target.y) <= radius + PLAYER_RADIUS) {
        this.damagePlayerTarget(target, boostedDamage);
        if (applyBleed) this.tryApplyBleed(caster, target);
        hits++;
      }
    }

    return hits;
  }

  private applyConeDamageAndPetrify(
    caster: Player,
    damage: number,
    range: number,
    targetX?: number,
    targetY?: number,
    arcDegrees = 70,
    petrifyMs = MEDUSA_ULTIMATE_PETRIFY_MS
  ): number {
    const boostedDamage = this.computeOutgoingDamage(caster, damage);
    const hasAim = typeof targetX === 'number' && typeof targetY === 'number';
    const aim = hasAim ? this.directionFromPlayer(caster, targetX, targetY) : { x: 1, y: 0 };
    const arcCos = Math.cos((Math.max(15, Math.min(359, arcDegrees)) * Math.PI / 180) / 2);
    let hits = 0;

    const canHit = (tx: number, ty: number, radiusPad: number) => {
      const dist = distance(caster.x, caster.y, tx, ty);
      if (dist > range + radiusPad) return false;
      if (!hasAim || arcDegrees >= 359) return true;
      const safeDist = Math.max(0.001, dist);
      const dirX = (tx - caster.x) / safeDist;
      const dirY = (ty - caster.y) / safeDist;
      return (dirX * aim.x + dirY * aim.y) >= arcCos;
    };

    for (const enemy of Object.values(this.state.enemies)) {
      if (!canHit(enemy.x, enemy.y, ENEMY_RADIUS)) continue;
      this.damageEnemyTarget(enemy, boostedDamage);
      addOrRefreshStatus(enemy, {
        id: statusId('petrify'),
        kind: 'petrify',
        sourcePlayerId: caster.id,
        remainingMs: petrifyMs,
        value: 1,
      });
      hits++;
    }

    for (const target of Object.values(this.state.players)) {
      if (target.id === caster.id) continue;
      if (target.isDead) continue;
      if (!this.isPvpAllowed(caster, target)) continue;
      if (!canHit(target.x, target.y, PLAYER_RADIUS)) continue;
      this.damagePlayerTarget(target, boostedDamage);
      addOrRefreshStatus(target, {
        id: statusId('petrify'),
        kind: 'petrify',
        sourcePlayerId: caster.id,
        remainingMs: petrifyMs,
        value: 1,
      });
      hits++;
    }

    return hits;
  }

  private applyFrontalAreaDamage(
    caster: Player,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    depth: number,
    halfWidth: number,
    damage: number
  ): number {
    const boostedDamage = this.computeOutgoingDamage(caster, damage);
    const dirMag = Math.hypot(dirX, dirY);
    const nx = dirMag > 0.001 ? dirX / dirMag : 1;
    const ny = dirMag > 0.001 ? dirY / dirMag : 0;
    const rx = -ny;
    const ry = nx;
    let hits = 0;

    const canHit = (tx: number, ty: number, radiusPad: number): boolean => {
      const relX = tx - originX;
      const relY = ty - originY;
      const forward = relX * nx + relY * ny;
      if (forward < MEDUSA_SPECIAL_FRONT_MIN_DISTANCE - radiusPad) return false;
      if (forward > depth + radiusPad) return false;
      const lateral = Math.abs(relX * rx + relY * ry);
      if (lateral > halfWidth + radiusPad) return false;
      return true;
    };

    for (const enemy of Object.values(this.state.enemies)) {
      if (!canHit(enemy.x, enemy.y, ENEMY_RADIUS)) continue;
      this.damageEnemyTarget(enemy, boostedDamage);
      hits++;
    }

    for (const target of Object.values(this.state.players)) {
      if (target.id === caster.id) continue;
      if (target.isDead) continue;
      if (!this.isPvpAllowed(caster, target)) continue;
      if (!canHit(target.x, target.y, PLAYER_RADIUS)) continue;
      this.damagePlayerTarget(target, boostedDamage);
      hits++;
    }

    return hits;
  }

  private startBatUltimateChannel(player: Player, now: number): void {
    this.batChannels[player.id] = {
      playerId: player.id,
      startedAtMs: now,
      lastTickAtMs: now,
      targetX: player.x,
      targetY: player.y,
    };

    player.castState = {
      slot: 'ultimate',
      startedAtMs: now,
      castDurationMs: BAT_CHANNEL_MAX_MS,
      targetX: player.x,
      targetY: player.y,
    };
    player.action = 'ultimate';
  }

  private stopBatUltimateChannel(playerId: string, forceIdle = true): void {
    const channel = this.batChannels[playerId];
    if (!channel) return;
    delete this.batChannels[playerId];

    const player = this.state.players[playerId];
    if (!player) return;
    if (player.castState?.slot === 'ultimate') player.castState = null;
    if (forceIdle && player.action === 'ultimate') player.action = 'idle';
  }

  isBatUltimateChanneling(playerId: string): boolean {
    return Boolean(this.batChannels[playerId]);
  }

  releaseHeldAbility(playerId: string, slot: AbilitySlot): void {
    if (slot === 'ultimate') {
      this.stopBatUltimateChannel(playerId, true);
    }
  }

  private damagePlayerTarget(target: Player, amount: number): void {
    if (target.isDead) return;
    const reduced = hasStatus(target, 'golden_armor') ? Math.ceil(amount / 3) : amount;
    target.health = Math.max(0, target.health - reduced);
    if (reduced > 0 && this.isBatUltimateChanneling(target.id)) {
      this.stopBatUltimateChannel(target.id, true);
    }
    if (target.health <= 0) this.markPlayerDead(target);
  }

  private damageEnemyTarget(target: Enemy, amount: number): void {
    target.health = Math.max(0, target.health - amount);
    if (target.health <= 0) {
      const id = target.id;
      delete this.state.enemies[id];
    }
  }

  private healPlayer(player: Player, amount: number): void {
    if (player.isDead) return;
    if (amount <= 0) return;
    player.health = Math.min(player.maxHealth, player.health + amount);
  }

  private applyMeleeHit(
    caster: Player,
    damage: number,
    range: number,
    now: number,
    targetX?: number,
    targetY?: number,
    arcDegrees = 150,
    lifeStealRatio = 0
  ): number {
    const boostedDamage = this.computeOutgoingDamage(caster, damage);
    const hasAim = typeof targetX === 'number' && typeof targetY === 'number';
    const aim = hasAim ? this.directionFromPlayer(caster, targetX, targetY) : { x: 0, y: 0 };
    const arcCos = Math.cos((Math.max(15, Math.min(359, arcDegrees)) * Math.PI / 180) / 2);
    let totalDamageDealt = 0;

    const canHit = (tx: number, ty: number, radiusPad: number) => {
      const dist = distance(caster.x, caster.y, tx, ty);
      if (dist > range + radiusPad) return false;
      if (!hasAim || arcDegrees >= 359) return true;
      const safeDist = Math.max(0.001, dist);
      const dirX = (tx - caster.x) / safeDist;
      const dirY = (ty - caster.y) / safeDist;
      return (dirX * aim.x + dirY * aim.y) >= arcCos;
    };

    for (const enemy of Object.values(this.state.enemies)) {
      if (canHit(enemy.x, enemy.y, ENEMY_RADIUS)) {
        this.damageEnemyTarget(enemy, boostedDamage);
        this.tryApplyBleed(caster, enemy);
        totalDamageDealt += boostedDamage;
      }
    }

    for (const target of Object.values(this.state.players)) {
      if (target.id === caster.id) continue;
      if (target.isDead) continue;
      if (!this.isPvpAllowed(caster, target)) continue;
      if (canHit(target.x, target.y, PLAYER_RADIUS)) {
        this.damagePlayerTarget(target, boostedDamage);
        this.tryApplyBleed(caster, target);
        totalDamageDealt += boostedDamage;
      }
    }

    if (lifeStealRatio > 0 && totalDamageDealt > 0) {
      this.healPlayer(caster, Math.max(1, Math.round(totalDamageDealt * lifeStealRatio)));
    }

    void now;
    return totalDamageDealt;
  }

  private computeOutgoingDamage(caster: Player, baseDamage: number): number {
    if (!hasStatus(caster, 'cat_rage')) return baseDamage;
    return Math.round(baseDamage * 1.18);
  }

  private tryApplyBleed(caster: Player, target: { activeStatuses?: ActiveStatus[] }): void {
    if (!hasStatus(caster, 'cat_rage')) return;
    const alreadyBleeding = hasStatus(target, 'bleed');
    addOrRefreshStatus(target, {
      id: statusId('bleed'),
      kind: 'bleed',
      sourcePlayerId: caster.id,
      remainingMs: 15000,
      tickIntervalMs: 3000,
      tickTimerMs: 0,
      value: 1,
    });

    // Cat rage bonus: if target was already bleeding, apply extra burst.
    if (alreadyBleeding) {
      if ('type' in (target as Enemy)) {
        this.damageEnemyTarget(target as Enemy, Math.max(1, Math.round(caster.statDamage * 0.5)));
      } else {
        this.damagePlayerTarget(target as Player, Math.max(1, Math.round(caster.statDamage * 0.5)));
      }
    }
  }

  private applySphynxUltimate(player: Player, targetX?: number, targetY?: number): void {
    const spawnX = typeof targetX === 'number' ? Math.max(0, Math.min(WORLD_WIDTH, Math.round(targetX))) : player.x;
    const spawnY = typeof targetY === 'number' ? Math.max(0, Math.min(WORLD_HEIGHT, Math.round(targetY))) : player.y;

    const ownerQueue = this.sphynxPyramidOrder[player.id] || [];
    while (ownerQueue.length >= 3) {
      const removed = ownerQueue.shift();
      if (removed) delete this.state.summons[removed];
    }

    const summonId = `summon_pyramid_${player.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.state.summons[summonId] = {
      id: summonId,
      ownerPlayerId: player.id,
      type: 'sphynx_pyramid',
      x: spawnX,
      y: spawnY,
      createdAtMs: Date.now(),
      lifeMs: 18000,
      data: {
        pullRadius: 260,
        missileRadius: 180,
        pullStrength: 3.4,
        missileDamage: 9,
        missileIntervalMs: 700,
        missileTimerMs: 0,
      },
    };

    ownerQueue.push(summonId);
    this.sphynxPyramidOrder[player.id] = ownerQueue;
  }

  private applyCatDodgeTrailDamage(player: Player, fromX: number, fromY: number): void {
    const segmentLen = Math.max(1, distance(fromX, fromY, player.x, player.y));
    const threshold = 24;
    for (const enemy of Object.values(this.state.enemies)) {
      const d1 = distance(fromX, fromY, enemy.x, enemy.y);
      const d2 = distance(player.x, player.y, enemy.x, enemy.y);
      if (d1 + d2 <= segmentLen + threshold) {
        this.damageEnemyTarget(enemy, 6);
      }
    }
    for (const target of Object.values(this.state.players)) {
      if (target.id === player.id) continue;
      if (target.isDead) continue;
      if (!this.isPvpAllowed(player, target)) continue;
      const d1 = distance(fromX, fromY, target.x, target.y);
      const d2 = distance(player.x, player.y, target.x, target.y);
      if (d1 + d2 <= segmentLen + threshold) {
        this.damagePlayerTarget(target, 6);
      }
    }
  }

  tryCastAbility(playerId: string, slot: AbilitySlot, targetX?: number, targetY?: number): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;
    if (player.isDead) return false;

    const kit = CREEP_KITS[player.design];
    const ability = kit.abilities[slot];
    if (!ability) return false;

    const now = Date.now();
    if (
      player.design === 'medusa' &&
      player.castState?.slot === 'special' &&
      now - player.castState.startedAtMs < MEDUSA_SPECIAL_CAST_LOCK_MS
    ) {
      return false;
    }
    if (!this.isCooldownReady(player, slot, now)) return false;

    let assignedCastStateInSwitch = false;

    switch (slot) {
      case 'basic': {
        if (player.design === 'cat') {
          this.applyMeleeHit(player, Math.max(1, Math.round(player.statDamage * 0.72)), ability.range, now, targetX, targetY, 95);
        } else if (player.design === 'sphynx') {
          this.applyMeleeHit(player, Math.max(1, Math.round(player.statDamage * 0.82)), ability.range, now, targetX, targetY, 110);
        } else if (player.design === 'vampire') {
          this.applyMeleeHit(player, Math.max(1, Math.round(player.statDamage * 0.8)), ability.range + 2, now, targetX, targetY, 105, 0.22);
        } else if (player.design === 'bat') {
          this.applyMeleeHit(player, Math.max(1, Math.round(player.statDamage * 0.68)), ability.range + 16, now, targetX, targetY, 82, 0.35);
        } else if (player.design === 'medusa') {
          this.applyMeleeHit(player, Math.max(1, Math.round(player.statDamage * 0.76)), ability.range + 10, now, targetX, targetY, 98);
        } else if (player.design === 'zombie') {
          this.applyMeleeHit(player, Math.max(1, Math.round(player.statDamage * 0.88)), ability.range + 4, now, targetX, targetY, 122);
        } else {
          // Ghost and fallback: forgiving arc while role is pending.
          this.applyMeleeHit(player, Math.max(1, Math.round(player.statDamage * 0.78)), ability.range, now, targetX, targetY, 145);
        }
        player.action = 'attack';
        break;
      }
      case 'dodge': {
        const dir = this.directionFromPlayer(player, targetX, targetY);
        const fromX = player.x;
        const fromY = player.y;
        const dodgeDistance = player.design === 'cat'
          ? 176
          : player.design === 'sphynx'
            ? 88
            : player.design === 'vampire'
              ? 92
              : player.design === 'medusa'
                ? Math.max(150, ability.range)
                : player.design === 'bat'
                  ? 170
                  : player.design === 'zombie'
                    ? 120
                    : 120;
        const dashTargetX = player.x + dir.x * dodgeDistance;
        const dashTargetY = player.y + dir.y * dodgeDistance;
            const ignoreObstacles = player.design === 'bat' || player.design === 'medusa';

            if (player.design === 'medusa') {
              const castDurationMs = Math.max(560, ability.castMs);
              const triggerAtMs = now + Math.round(castDurationMs * MEDUSA_DODGE_TRIGGER_RATIO);
              this.pendingMedusaDodges.push({
                playerId: player.id,
                triggerAtMs,
                dashTargetX,
                dashTargetY,
                dodgeDistance,
              });

              player.castState = {
                slot: 'dodge',
                startedAtMs: now,
                castDurationMs,
                targetX: dashTargetX,
                targetY: dashTargetY,
              };
              assignedCastStateInSwitch = true;
            } else {
              const moved = this.dashPlayer(player.id, dashTargetX, dashTargetY, dodgeDistance, ignoreObstacles);
              if (!moved) return false;
            }

            if (player.design === 'cat') this.applyCatDodgeTrailDamage(player, fromX, fromY);
        if (player.design === 'zombie') {
          addOrRefreshStatus(player, {
            id: statusId('hidden'),
            kind: 'hidden',
            remainingMs: ZOMBIE_DODGE_HIDDEN_MS,
            value: 1,
          });
        }
        if (player.design === 'vampire') {
          addOrRefreshStatus(player, {
            id: statusId('vampire_puddle'),
            kind: 'vampire_puddle',
            remainingMs: VAMPIRE_PUDDLE_MS,
            tickIntervalMs: 500,
            tickTimerMs: 0,
            value: Math.max(2, Math.round(player.maxHealth * 0.03)),
          });
        }
        if (player.design === 'medusa' && !assignedCastStateInSwitch) {
          this.applyAreaDamage(player, player.x, player.y, 72, Math.max(1, Math.round(player.statDamage * 0.55)));
        }

        player.action = 'dodge';
        break;
      }
      case 'special': {
        if (player.design === 'sphynx') {
          addOrRefreshStatus(player, {
            id: statusId('golden_armor'),
            kind: 'golden_armor',
            remainingMs: SPHYNX_GOLDEN_ARMOR_DURATION_MS,
            value: 0.66,
          });
        } else if (player.design === 'cat') {
          // Two-hit slash burst; visual target locks to hit target in short range,
          // otherwise it is thrown to air at short range.
          const specialTarget = this.resolveCatSpecialVisualTarget(player, ability.range, targetX, targetY);
          this.applyMeleeHit(
            player,
            Math.max(1, Math.round(player.statDamage * 0.55)),
            ability.range,
            now,
            specialTarget.x,
            specialTarget.y,
            108
          );
          this.applyMeleeHit(
            player,
            Math.max(1, Math.round(player.statDamage * 0.55)),
            ability.range,
            now,
            specialTarget.x,
            specialTarget.y,
            122
          );
          player.castState = {
            slot: 'special',
            startedAtMs: now,
            castDurationMs: ability.castMs,
            targetX: specialTarget.x,
            targetY: specialTarget.y,
          };
          assignedCastStateInSwitch = true;
        } else if (player.design === 'bat') {
          const center = { x: player.x, y: player.y };

          for (const enemy of Object.values(this.state.enemies)) {
            const d = distance(center.x, center.y, enemy.x, enemy.y);
            if (d > ability.range + ENEMY_RADIUS) continue;
            addOrRefreshStatus(enemy, {
              id: statusId('petrify'),
              kind: 'petrify',
              sourcePlayerId: player.id,
              remainingMs: BAT_SPECIAL_PARALYZE_MS,
              value: 1,
            });
          }

          for (const target of Object.values(this.state.players)) {
            if (target.id === player.id) continue;
            if (target.isDead) continue;
            if (!this.isPvpAllowed(player, target)) continue;
            const d = distance(center.x, center.y, target.x, target.y);
            if (d > ability.range + PLAYER_RADIUS) continue;
            addOrRefreshStatus(target, {
              id: statusId('petrify'),
              kind: 'petrify',
              sourcePlayerId: player.id,
              remainingMs: BAT_SPECIAL_PARALYZE_MS,
              value: 1,
            });
          }

          player.castState = {
            slot: 'special',
            startedAtMs: now,
            castDurationMs: ability.castMs,
            targetX: player.x,
            targetY: player.y,
          };
          assignedCastStateInSwitch = true;
        } else if (player.design === 'medusa') {
          const facing = this.directionFromPlayer(player, targetX, targetY);
          const depth = Math.max(80, ability.range);
          const centerDistance = Math.max(64, depth * 0.56);
          const center = {
            x: Math.max(0, Math.min(WORLD_WIDTH, player.x + facing.x * centerDistance)),
            y: Math.max(0, Math.min(WORLD_HEIGHT, player.y + facing.y * centerDistance)),
          };
          this.pendingAreaStrikes.push({
            id: `medusa_special_${player.id}_${now.toString(36)}`,
            ownerPlayerId: player.id,
            kind: 'medusa_special',
            triggerAtMs: now + MEDUSA_SPECIAL_CAST_LOCK_MS,
            originX: player.x,
            originY: player.y,
            dirX: facing.x,
            dirY: facing.y,
            depth,
            halfWidth: MEDUSA_SPECIAL_HALF_WIDTH,
            damage: Math.max(1, Math.round(player.statDamage * 2.2)),
          });

          player.castState = {
            slot: 'special',
            startedAtMs: now,
            castDurationMs: MEDUSA_SPECIAL_CAST_LOCK_MS + MEDUSA_SPECIAL_RETURN_ANIM_MS,
            targetX: center.x,
            targetY: center.y,
          };
          assignedCastStateInSwitch = true;
        }
        player.action = 'special';
        break;
      }
      case 'ultimate': {
        if (player.design === 'sphynx') {
          this.applySphynxUltimate(player, targetX, targetY);
        } else if (player.design === 'cat') {
          addOrRefreshStatus(player, {
            id: statusId('cat_rage'),
            kind: 'cat_rage',
            remainingMs: CAT_RAGE_DURATION_MS,
            value: 1,
          });
        } else if (player.design === 'medusa') {
          this.applyConeDamageAndPetrify(
            player,
            Math.max(1, Math.round(player.statDamage * 3.5)),
            MEDUSA_ULTIMATE_CONE_RANGE,
            targetX,
            targetY,
            MEDUSA_ULTIMATE_CONE_ARC_DEGREES,
            MEDUSA_ULTIMATE_PETRIFY_MS
          );
        } else if (player.design === 'bat') {
          this.startBatUltimateChannel(player, now);
        }
        player.action = 'ultimate';
        break;
      }
    }

    if (!(slot === 'ultimate' && player.design === 'bat') && !assignedCastStateInSwitch) {
      player.castState = {
        slot,
        startedAtMs: now,
        castDurationMs: ability.castMs,
        targetX,
        targetY,
      };
    }
    this.setCooldown(player, slot, ability.cooldownMs, now);
    if (slot === 'basic' || slot === 'dodge') player.lastActionTime = now;

    return true;
  }

  updatePlayerPosition(playerId: string, x: number, y: number): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;
    if (player.isDead) return false;
    if (hasStatus(player, 'petrify')) return false;
    if (player.design === 'medusa' && player.castState?.slot === 'dodge') {
      return false;
    }
    if (
      player.design === 'medusa' &&
      player.castState?.slot === 'special' &&
      Date.now() - player.castState.startedAtMs < MEDUSA_SPECIAL_CAST_LOCK_MS
    ) {
      return false;
    }
    const prevX = player.x;
    const prevY = player.y;

    // Validate coordinates are within world bounds
    const clampedX = Math.max(0, Math.min(WORLD_WIDTH, x));
    const clampedY = Math.max(0, Math.min(WORLD_HEIGHT, y));

    // Validate movement speed (anti-cheat: max distance per update)
    const dx = clampedX - player.x;
    const dy = clampedY - player.y;
    const moveDist = Math.sqrt(dx * dx + dy * dy);
    if (moveDist > MOVE_SPEED * 10) {
      return false; // Reject teleport
    }

    // Check obstacle collision with sliding — try full move, then axis-independent
    const fullBlocked = this.state.obstacles.some(o => overlapsObstacle(clampedX, clampedY, o));
    if (fullBlocked) {
      // Slide along X axis
      const xFree = !this.state.obstacles.some(o => overlapsObstacle(clampedX, player.y, o));
      // Slide along Y axis
      const yFree = !this.state.obstacles.some(o => overlapsObstacle(player.x, clampedY, o));

      if (!xFree && !yFree) return false; // Fully blocked

      if (xFree) player.x = clampedX;
      if (yFree) player.y = clampedY;
    } else {
      player.x = clampedX;
      player.y = clampedY;
    }

    player.action = 'move';
    if (this.isBatUltimateChanneling(playerId) && distance(prevX, prevY, player.x, player.y) > 0.5) {
      this.stopBatUltimateChannel(playerId, false);
    }
    return true;
  }

  setPlayerAction(playerId: string, action: PlayerAction): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;
    if (player.isDead) return false;

    const now = Date.now();
    if (action === 'attack' || action === 'dodge') {
      if (now - player.lastActionTime < ACTION_COOLDOWN_MS) {
        return false; // Rate limit
      }
      player.lastActionTime = now;
    }

    player.action = action;
    return true;
  }

  setPlayerIdle(playerId: string): void {
    const player = this.state.players[playerId];
    if (player && player.action === 'move') {
      player.action = 'idle';
    }
  }

  getState(): GameState {
    return this.state;
  }

  getVisibleStateForPlayer(playerId: string): GameState {
    const local = this.state.players[playerId];
    if (!local) {
      return {
        players: {},
        enemies: {},
        summons: {},
        totalPlayers: this.state.totalPlayers,
        tick: this.state.tick,
        obstacles: [],
        visibilityRadius: this.state.visibilityRadius,
      };
    }

    const radius = this.state.visibilityRadius;
    const radiusSq = radius * radius;
    const visiblePlayers: Record<string, Player> = {};

    for (const [id, p] of Object.entries(this.state.players)) {
      const dx = p.x - local.x;
      const dy = p.y - local.y;
      if (id === playerId || (dx * dx + dy * dy) <= radiusSq) {
        visiblePlayers[id] = p;
      }
    }

    const visibleObstacles = this.state.obstacles.filter((o) => {
      const rx = ((o as any).rx && (o as any).rx > 0) ? (o as any).rx : (OBSTACLE_HALF_W[o.type] || 12);
      const ry = ((o as any).ry && (o as any).ry > 0) ? (o as any).ry : (OBSTACLE_HALF_H[o.type] || 8);
      const obstacleRadius = Math.max(rx, ry) + OBSTACLE_VISIBILITY_PADDING;
      const dx = o.x - local.x;
      const dy = o.y - local.y;
      const maxDist = radius + obstacleRadius;
      return (dx * dx + dy * dy) <= maxDist * maxDist;
    });

    const visibleEnemies: Record<string, Enemy> = {};
    for (const [id, enemy] of Object.entries(this.state.enemies)) {
      const enemyPadding = enemy.isBoss ? 90 : 54;
      const maxDist = radius + enemyPadding;
      if (distanceSq(enemy.x, enemy.y, local.x, local.y) <= maxDist * maxDist) {
        visibleEnemies[id] = enemy;
      }
    }

    const visibleSummons: GameState['summons'] = {};
    for (const [id, summon] of Object.entries(this.state.summons)) {
      if (distanceSq(summon.x, summon.y, local.x, local.y) <= (radius + 120) * (radius + 120)) {
        visibleSummons[id] = summon;
      }
    }

    return {
      players: visiblePlayers,
      enemies: visibleEnemies,
      summons: visibleSummons,
      totalPlayers: this.state.totalPlayers,
      tick: this.state.tick,
      obstacles: visibleObstacles,
      visibilityRadius: radius,
    };
  }

  private moveEnemy(enemy: Enemy, targetX: number, targetY: number, speedMultiplier = 1): void {
    if (hasStatus(enemy, 'petrify')) return;
    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return;

    const slowed = hasStatus(enemy, 'slow') ? 0.55 : 1;
    const step = enemy.speed * speedMultiplier * slowed;
    const nx = dx / dist;
    const ny = dy / dist;
    const candidateX = Math.max(0, Math.min(WORLD_WIDTH, enemy.x + nx * step));
    const candidateY = Math.max(0, Math.min(WORLD_HEIGHT, enemy.y + ny * step));

    if (enemy.type === 'gargoyle') {
      enemy.x = candidateX;
      enemy.y = candidateY;
      return;
    }

    const blocked = this.state.obstacles.some(o => overlapsObstacle(candidateX, candidateY, o));
    if (!blocked) {
      enemy.x = candidateX;
      enemy.y = candidateY;
      return;
    }

    const slideXFree = !this.state.obstacles.some(o => overlapsObstacle(candidateX, enemy.y, o));
    const slideYFree = !this.state.obstacles.some(o => overlapsObstacle(enemy.x, candidateY, o));
    if (slideXFree) enemy.x = candidateX;
    if (slideYFree) enemy.y = candidateY;
  }

  private respawnPlayer(player: Player): void {
    this.stopBatUltimateChannel(player.id, false);
    const spawn = this.findSpawnPosition();
    player.x = spawn.x;
    player.y = spawn.y;
    player.health = player.maxHealth;
    player.action = 'idle';
    player.activeStatuses = [];
    player.castState = null;
    player.isDead = false;
    player.deathStartedAtMs = 0;
    player.deathDeadlineMs = 0;
  }

  private updateEnemies(): void {
    const now = Date.now();
    const players = Object.values(this.state.players).filter((p) => !p.isDead);

    for (const enemy of Object.values(this.state.enemies)) {
      let closest: Player | undefined;
      let closestDistSq = Number.POSITIVE_INFINITY;

      for (const p of players) {
        if (!enemy.isBoss && hasStatus(p, 'hidden')) continue;
        const dSq = distanceSq(p.x, p.y, enemy.x, enemy.y);
        if (dSq < closestDistSq) {
          closestDistSq = dSq;
          closest = p;
        }
      }

      if (closest && closestDistSq <= enemy.aggroRange * enemy.aggroRange) {
        enemy.targetX = closest.x;
        enemy.targetY = closest.y;
        const dist = Math.sqrt(closestDistSq);

        if (dist > enemy.attackRange * 0.82) {
          this.moveEnemy(enemy, closest.x, closest.y, enemy.isBoss ? 1.06 : 1);
        }

        if (dist <= enemy.attackRange && now - enemy.lastAttackTime >= enemy.attackCooldownMs) {
          enemy.lastAttackTime = now;
          this.damagePlayerTarget(closest, enemy.damage);
        }
        continue;
      }

      // Wander around home point when no players are in aggro range.
      const phase = (this.state.tick + hashString(enemy.id) * 0.11) * 0.04;
      const radius = enemy.isBoss ? 210 : 135;
      const wanderX = enemy.homeX + Math.cos(phase) * radius;
      const wanderY = enemy.homeY + Math.sin(phase * 0.8) * radius * 0.72;
      enemy.targetX = wanderX;
      enemy.targetY = wanderY;
      this.moveEnemy(enemy, wanderX, wanderY, 0.58);
    }
  }

  private updateCombatTick(deltaMs: number): void {
    const now = Date.now();

    for (const player of Object.values(this.state.players)) {
      for (const slot of Object.keys(player.activeCooldowns) as AbilitySlot[]) {
        const cd = player.activeCooldowns[slot];
        if (!cd) continue;
        if (cd.expiresAtMs <= now) player.activeCooldowns[slot] = null;
      }

      if (player.isDead) continue;

      tickStatuses(player, deltaMs, (status) => {
        if (status.sourcePlayerId) {
          const source = this.state.players[status.sourcePlayerId];
          if (!source || !this.isPvpAllowed(source, player)) {
            status.remainingMs = 0;
            return;
          }
        }

        if (status.kind === 'bleed') {
          const bleedDamage = Math.max(1, Math.round(status.value ?? 1));
          this.damagePlayerTarget(player, bleedDamage);
        } else if (status.kind === 'vampire_puddle') {
          const heal = Math.max(1, Math.round(status.value ?? Math.max(1, player.maxHealth * 0.02)));
          this.healPlayer(player, heal);
        }
      });

      if (player.castState) {
        const elapsed = now - player.castState.startedAtMs;
        if (elapsed >= Math.max(120, player.castState.castDurationMs)) {
          if (player.castState.slot === 'ultimate' && this.isBatUltimateChanneling(player.id)) {
            this.stopBatUltimateChannel(player.id, true);
            continue;
          }
          player.castState = null;
          if (player.action !== 'move') player.action = 'idle';
        }
      }
    }

    for (const enemy of Object.values(this.state.enemies)) {
      tickStatuses(enemy, deltaMs, (status) => {
        if (status.kind === 'bleed') {
          const bleedDamage = Math.max(1, Math.round(status.value ?? 1));
          this.damageEnemyTarget(enemy, bleedDamage);
        }
      });
    }

    const pendingDodgesNext: PendingMedusaDodge[] = [];
    for (const dash of this.pendingMedusaDodges) {
      if (dash.triggerAtMs > now) {
        pendingDodgesNext.push(dash);
        continue;
      }

      const player = this.state.players[dash.playerId];
      if (!player) continue;
      if (player.isDead) continue;
      const moved = this.dashPlayer(player.id, dash.dashTargetX, dash.dashTargetY, dash.dodgeDistance, true);
      if (moved) {
        this.applyAreaDamage(player, player.x, player.y, 72, Math.max(1, Math.round(player.statDamage * 0.55)));
      }
    }
    this.pendingMedusaDodges = pendingDodgesNext;

    const pendingNext: PendingAreaStrike[] = [];
    for (const strike of this.pendingAreaStrikes) {
      if (strike.triggerAtMs > now) {
        pendingNext.push(strike);
        continue;
      }

      const owner = this.state.players[strike.ownerPlayerId];
      if (!owner) continue;
      if (owner.isDead) continue;
      if (strike.kind === 'medusa_special') {
        this.applyFrontalAreaDamage(
          owner,
          strike.originX,
          strike.originY,
          strike.dirX,
          strike.dirY,
          strike.depth,
          strike.halfWidth,
          strike.damage
        );
      }
    }
    this.pendingAreaStrikes = pendingNext;

    for (const [playerId, channel] of Object.entries(this.batChannels)) {
      const owner = this.state.players[playerId];
      if (!owner) {
        delete this.batChannels[playerId];
        continue;
      }
      if (owner.isDead) {
        this.stopBatUltimateChannel(playerId, false);
        continue;
      }

      // Bat channel is self-centered, not a skillshot target.
      channel.targetX = owner.x;
      channel.targetY = owner.y;
      if (owner.castState?.slot === 'ultimate') {
        owner.castState.targetX = owner.x;
        owner.castState.targetY = owner.y;
      }

      if (now - channel.startedAtMs >= BAT_CHANNEL_MAX_MS) {
        this.stopBatUltimateChannel(playerId, true);
        continue;
      }

      if (now - channel.lastTickAtMs < BAT_CHANNEL_TICK_MS) continue;
      channel.lastTickAtMs = now;

      let totalDamage = 0;
      const tickDamage = Math.max(1, Math.round(owner.statDamage * 0.32));

      for (const enemy of Object.values(this.state.enemies)) {
        if (distance(channel.targetX, channel.targetY, enemy.x, enemy.y) > BAT_CHANNEL_RADIUS + ENEMY_RADIUS) continue;
        this.damageEnemyTarget(enemy, tickDamage);
        totalDamage += tickDamage;
      }

      for (const target of Object.values(this.state.players)) {
        if (target.id === owner.id) continue;
        if (target.isDead) continue;
        if (!this.isPvpAllowed(owner, target)) continue;
        if (distance(channel.targetX, channel.targetY, target.x, target.y) > BAT_CHANNEL_RADIUS + PLAYER_RADIUS) continue;
        this.damagePlayerTarget(target, tickDamage);
        totalDamage += tickDamage;
      }

      if (totalDamage > 0) {
        this.healPlayer(owner, Math.max(1, Math.round(totalDamage * 0.3)));
      }
    }

    for (const [id, summon] of Object.entries(this.state.summons)) {
      if (now - summon.createdAtMs >= summon.lifeMs) {
        delete this.state.summons[id];
        continue;
      }

      if (summon.type === 'sphynx_pyramid') {
        const summonOwner = this.state.players[summon.ownerPlayerId];
        const pullRadius = summon.data?.pullRadius ?? 240;
        const pullStrength = summon.data?.pullStrength ?? 3;
        const missileRadius = summon.data?.missileRadius ?? 180;
        const missileDamage = summon.data?.missileDamage ?? 8;
        const missileIntervalMs = summon.data?.missileIntervalMs ?? 700;

        // Pull targets toward the pyramid center.
        for (const enemy of Object.values(this.state.enemies)) {
          const dist = distance(summon.x, summon.y, enemy.x, enemy.y);
          if (dist <= 0.001 || dist > pullRadius) continue;
          const nx = (summon.x - enemy.x) / dist;
          const ny = (summon.y - enemy.y) / dist;
          enemy.x += nx * pullStrength;
          enemy.y += ny * pullStrength;
        }

        for (const player of Object.values(this.state.players)) {
          if (player.id === summon.ownerPlayerId) continue;
          if (player.isDead) continue;
          if (!summonOwner || !this.isPvpAllowed(summonOwner, player)) continue;
          const dist = distance(summon.x, summon.y, player.x, player.y);
          if (dist <= 0.001 || dist > pullRadius) continue;
          const nx = (summon.x - player.x) / dist;
          const ny = (summon.y - player.y) / dist;
          player.x += nx * pullStrength * 0.7;
          player.y += ny * pullStrength * 0.7;
        }

        summon.data = summon.data || {};
        summon.data.missileTimerMs = (summon.data.missileTimerMs ?? 0) + deltaMs;
        if ((summon.data.missileTimerMs ?? 0) >= missileIntervalMs) {
          summon.data.missileTimerMs = 0;

          let nearestEnemy: Enemy | null = null;
          let enemyDist = Number.POSITIVE_INFINITY;
          for (const enemy of Object.values(this.state.enemies)) {
            const d = distanceSq(summon.x, summon.y, enemy.x, enemy.y);
            if (d < enemyDist && d <= missileRadius * missileRadius) {
              enemyDist = d;
              nearestEnemy = enemy;
            }
          }

          let nearestPlayer: Player | null = null;
          let playerDist = Number.POSITIVE_INFINITY;
          for (const player of Object.values(this.state.players)) {
            if (player.id === summon.ownerPlayerId) continue;
            if (player.isDead) continue;
            if (!summonOwner || !this.isPvpAllowed(summonOwner, player)) continue;
            const d = distanceSq(summon.x, summon.y, player.x, player.y);
            if (d < playerDist && d <= missileRadius * missileRadius) {
              playerDist = d;
              nearestPlayer = player;
            }
          }

          if (nearestEnemy && (!nearestPlayer || enemyDist <= playerDist)) {
            this.damageEnemyTarget(nearestEnemy, missileDamage);
          } else if (nearestPlayer) {
            this.damagePlayerTarget(nearestPlayer, missileDamage);
          }
        }
      }
    }
  }

  incrementTick(): void {
    this.updateCombatTick(SERVER_TICK_MS);
    this.updateEnemies();
    this.state.tick++;
  }

  getPlayerCount(): number {
    return Object.keys(this.state.players).length;
  }

  // Dash the player toward target world coordinates by up to maxDistance,
  // avoiding obstacles. Returns true if the player was moved.
  dashPlayer(playerId: string, targetX: number, targetY: number, maxDistance = 120, ignoreObstacles = false): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;
    if (player.isDead) return false;

    const DASH_DISTANCE = Math.max(12, maxDistance);

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 0.001) return false;

    const nx = dx / dist;
    const ny = dy / dist;

    if (ignoreObstacles) {
      const nxPos = Math.max(0, Math.min(WORLD_WIDTH, Math.round(player.x + nx * DASH_DISTANCE)));
      const nyPos = Math.max(0, Math.min(WORLD_HEIGHT, Math.round(player.y + ny * DASH_DISTANCE)));
      player.x = nxPos;
      player.y = nyPos;
      player.action = 'dodge';
      player.lastActionTime = Date.now();
      return true;
    }

    // Try full dash, then step down if blocked
    for (let d = DASH_DISTANCE; d > 0; d -= 4) {
      const nxPos = Math.max(0, Math.min(WORLD_WIDTH, Math.round(player.x + nx * d)));
      const nyPos = Math.max(0, Math.min(WORLD_HEIGHT, Math.round(player.y + ny * d)));

      const blocked = this.state.obstacles.some(o => overlapsObstacle(nxPos, nyPos, o));
      if (!blocked) {
        player.x = nxPos;
        player.y = nyPos;
        player.action = 'dodge';
        player.lastActionTime = Date.now();
        return true;
      }
    }

    return false;
  }
}
