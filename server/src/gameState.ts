import { Player, GameState, PlayerAction, WORLD_WIDTH, WORLD_HEIGHT, Obstacle, ObstacleType } from '../../shared/src/types';

const MOVE_SPEED = 5;
const ACTION_COOLDOWN_MS = 500; // 500ms cooldown on attack/dodge

// Collision half-sizes per obstacle type (axis-aligned bounding boxes)
const OBSTACLE_HALF_W: Record<string, number> = { tomb: 14, dead_tree: 12, dry_branch: 20, lake: 140, bush: 18 };
const OBSTACLE_HALF_H: Record<string, number> = { tomb: 20, dead_tree: 12, dry_branch: 6, lake: 80, bush: 12 };

// Player collision half-sizes
const PLAYER_HALF_W = 14;
const PLAYER_HALF_H = 20;

// Obstacle placement constants
const OBSTACLE_PLACEMENT_MARGIN = 60;
const OBSTACLE_CENTER_CLEAR_RADIUS = 80; // keep the center start area clear
const MAX_PLACEMENT_ATTEMPTS_MULTIPLIER = 20;

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

export class GameStateManager {
  private state: GameState = {
    players: {},
    tick: 0,
    obstacles: generateObstacles(),
  };

  addPlayer(player: Player): void {
    this.state.players[player.id] = player;
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
        const dx = p.x - x;
        const dy = p.y - y;
        return Math.sqrt(dx * dx + dy * dy) < (PLAYER_HALF_W + 8); // buffer
      });
      if (tooCloseToPlayer) continue;

      return { x, y };
    }

    // Fallback: return a clamped random position
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH, Math.floor(Math.random() * WORLD_WIDTH))),
      y: Math.max(0, Math.min(WORLD_HEIGHT, Math.floor(Math.random() * WORLD_HEIGHT))),
    };
  }

  removePlayer(playerId: string): void {
    delete this.state.players[playerId];
  }

  getPlayer(playerId: string): Player | undefined {
    return this.state.players[playerId];
  }

  updatePlayerPosition(playerId: string, x: number, y: number): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;

    // Validate coordinates are within world bounds
    const clampedX = Math.max(0, Math.min(WORLD_WIDTH, x));
    const clampedY = Math.max(0, Math.min(WORLD_HEIGHT, y));

    // Validate movement speed (anti-cheat: max distance per update)
    const dx = clampedX - player.x;
    const dy = clampedY - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > MOVE_SPEED * 10) {
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
    return true;
  }

  setPlayerAction(playerId: string, action: PlayerAction): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;

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

  incrementTick(): void {
    this.state.tick++;
  }

  getPlayerCount(): number {
    return Object.keys(this.state.players).length;
  }

  // Dash the player toward target world coordinates by up to DASH_DISTANCE,
  // avoiding obstacles. Returns true if the player was moved.
  dashPlayer(playerId: string, targetX: number, targetY: number): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;

    const DASH_DISTANCE = 120; // pixels

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 0.001) return false;

    const nx = dx / dist;
    const ny = dy / dist;

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
