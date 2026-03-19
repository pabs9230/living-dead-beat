import { EnemyType, GameState, Obstacle, PlayerAction, Summon, VISIBILITY_RADIUS, WORLD_WIDTH, WORLD_HEIGHT } from '../../../shared/src/types';
import { drawGhost as spriteDrawGhost, drawBat as spriteDrawBat, drawCat as spriteDrawCat, drawVampire as spriteDrawVampire, drawZombie as spriteDrawZombie, drawMedusa as spriteDrawMedusa, drawSphynx as spriteDrawSphynx, type SpriteAnimationState } from './sprites';

// Gothic / redrum sprite palettes
const SPRITE_COLORS = [
  { body: '#8B0000', outline: '#3a0000', name: 'Crimson' },
  { body: '#B22222', outline: '#4a0000', name: 'Blood' },
  { body: '#7f1a1a', outline: '#2f0f0f', name: 'Gore' },
  { body: '#d9b7bb', outline: '#5a1e2a', name: 'Pallor' },
];

function getStatusRemainingMs(statuses: Array<{ kind: string; remainingMs: number }> | undefined, kind: string): number {
  if (!statuses || statuses.length === 0) return 0;
  let best = 0;
  for (const s of statuses) {
    if (s.kind !== kind) continue;
    if (s.remainingMs > best) best = s.remainingMs;
  }
  return best;
}

interface InterpolatedPlayer {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  action: PlayerAction;
  nickname: string;
  spriteVariant: number;
  design: string;
  colorIdx: number;
  health: number;
  maxHealth: number;
  statDamage: number;
  statSpeed: number;
  statDodge: number;
  visibilityAlpha: number;
  targetVisibility: number;
  animFrame: number;
  animTimer: number;
  facingAngle: number;
  aimAngle: number | null;
  castStartedAtMs: number | null;
  castDurationMs: number;
  castTargetX: number | null;
  castTargetY: number | null;
  isPetrified: boolean;
  petrifyRemainingMs: number;
}

interface InterpolatedEnemy {
  id: string;
  type: EnemyType;
  isBoss: boolean;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  health: number;
  maxHealth: number;
  visibilityAlpha: number;
  targetVisibility: number;
  lastAttackTime: number;
  facingAngle: number;
  isPetrified: boolean;
  petrifyRemainingMs: number;
}

interface InterpolatedSummon {
  id: string;
  ownerPlayerId: string;
  type: Summon['type'];
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  createdAtMs: number;
  lifeMs: number;
  data?: Summon['data'];
  visibilityAlpha: number;
  targetVisibility: number;
}

interface DamageBurst {
  id: number;
  x: number;
  y: number;
  amount: number;
  source: 'player' | 'enemy';
  createdAtMs: number;
  lifeMs: number;
}

const ANIM_FRAME_DURATION = 150; // ms per animation frame
const IDLE_FRAMES = 4;
const ATTACK_FRAMES = 4;
const DODGE_FRAMES = 4;
const ENEMY_ATTACK_ANIM_MS = 480;
// Uniform sprite scale multiplier (increase to make characters bigger)
const SPRITE_SCALE = 1.3;

type FogStyle = {
  edgeColor: string;
  edgeAlpha: number;
  clarityTint: string;
  clarityAlpha: number;
};

const DEFAULT_FOG_STYLE: FogStyle = {
  edgeColor: '12,16,22',
  edgeAlpha: 0.8,
  clarityTint: '255,255,255',
  clarityAlpha: 0.045,
};

const NIHILIA_FOG_STYLE: FogStyle = {
  edgeColor: '62,22,86',
  edgeAlpha: 0.86,
  clarityTint: '182,132,230',
  clarityAlpha: 0.065,
};

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private localPlayerId: string;
  private dpr = 1;
  private interpolated: Map<string, InterpolatedPlayer> = new Map();
  private interpolatedEnemies: Map<string, InterpolatedEnemy> = new Map();
  private interpolatedSummons: Map<string, InterpolatedSummon> = new Map();
  private lastTime = 0;
  private time = 0;
  private obstacles: Obstacle[] = [];
  private visibilityRadius = VISIBILITY_RADIUS;
  private fogStyle: FogStyle;
  private static DESIGNS = ['ghost','bat','cat','vampire','zombie','medusa','sphynx'];
  private centerScene = false; // when true, camera centers on world center instead of local player
  private viewScale = 1;
  // transient chat bubbles keyed by playerId
  private chatBubbles: Map<string, { text: string; start: number; duration: number; lines?: string[] }> = new Map();
  // ambient particles
  private particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; color: string; alpha: number; phase: number; freq: number }> = [];
  private PARTICLE_COUNT = 1500;
  private particleColors = ['#5fb1ff', '#8b5bff', '#2f0b3a', '#0b0610'];

  // Offscreen cache for pre-rendered particle sprites (color + quantized size)
  private particleSpriteCache: Map<string, HTMLCanvasElement> = new Map();
  private particleSpriteSizes: number[] = [0.8, 1.6, 2.4, 3.2];
  private damageBursts: DamageBurst[] = [];
  private nextDamageBurstId = 1;

  private resolveFogStyle(scenarioName: string): FogStyle {
    const normalized = scenarioName.trim().toLowerCase();
    if (normalized.includes('nihilia')) return NIHILIA_FOG_STYLE;
    return DEFAULT_FOG_STYLE;
  }

  constructor(canvas: HTMLCanvasElement, localPlayerId: string, scenarioName = 'Graves of Nihilia') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.localPlayerId = localPlayerId;
    this.fogStyle = this.resolveFogStyle(scenarioName);
    // default cursor for the game canvas
    this.canvas.style.cursor = 'crosshair';
    // Setup devicePixelRatio scaling so drawing uses CSS pixels while backing store
    // is in physical pixels for crisp rendering on high-DPI screens.
    this.syncCanvasMetrics();
    // Reduce particle load on touch devices for better mobile performance
    const isTouchDevice = (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (isTouchDevice) {
      this.PARTICLE_COUNT = 200;
      // On touch screens we zoom out slightly to approximate desktop-level battlefield visibility.
      this.viewScale = 0.86;
    }
    this.createParticleSprites();
    this.initParticles();
  }

  // Re-apply DPR transform after any canvas resize/orientation change.
  // Changing canvas width/height resets the 2D context transform to identity.
  syncCanvasMetrics(): void {
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // Change the canvas cursor style at runtime (e.g., 'default', 'pointer', 'crosshair', 'none')
  setCursorStyle(style: string) {
    this.canvas.style.cursor = style;
  }

  // --- Character drawing helpers (delegated to shared sprites module) ---
  private drawGhost(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean) {
    spriteDrawGhost(ctx, bob, colors, this.time, isLocal);
  }

  private drawBat(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean, variant = 0, anim?: SpriteAnimationState) {
    spriteDrawBat(ctx, bob, colors, this.time, isLocal, variant, anim);
  }

  private drawCat(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean, variant = 0, anim?: SpriteAnimationState) {
    spriteDrawCat(ctx, bob, colors, this.time, isLocal, variant, anim);
  }

  private drawVampire(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean, variant = 0, anim?: SpriteAnimationState) {
    spriteDrawVampire(ctx, bob, colors, this.time, isLocal, variant, anim);
  }

  private drawZombie(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean, variant = 0, anim?: SpriteAnimationState) {
    spriteDrawZombie(ctx, bob, colors, this.time, isLocal, variant, anim);
  }

  private drawMedusa(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean, variant = 0, anim?: SpriteAnimationState) {
    spriteDrawMedusa(ctx, bob, colors, this.time, isLocal, variant, anim);
  }

  private drawSphynx(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean, variant = 0, anim?: SpriteAnimationState) {
    spriteDrawSphynx(ctx, bob, colors, this.time, isLocal, variant, anim);
  }

  private drawLake(ctx: CanvasRenderingContext2D, obs: Obstacle) {
    // Dynamic lake drawing using obstacle rx/ry and renderer time for motion
    const rx = (obs.rx && obs.rx > 10) ? obs.rx : 160;
    const ry = (obs.ry && obs.ry > 6) ? obs.ry : Math.round(rx * 0.5);

    // Animated wobble factor based on time and position seed
    const seed = ((obs.x * 73856093) ^ (obs.y * 19349663)) >>> 0;
    const t = (this.time * 0.001) + (seed % 100) * 0.01;
    const wobble = 1 + Math.sin(t) * 0.02;

    // Water body gradient (shift slightly with time)
    const grad = ctx.createLinearGradient(-rx * wobble, -ry * wobble, rx * wobble, ry * wobble);
    grad.addColorStop(0, '#16021a');
    grad.addColorStop(0.5, '#4a1650');
    grad.addColorStop(1, '#0b0610');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * wobble, ry * wobble, 0, 0, Math.PI * 2); ctx.fill();

    // Animated ripples: several ellipses with time-based scaling
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const phase = t * (0.6 + i * 0.12) + i * 0.7;
      const s = 0.9 - i * 0.06 + Math.sin(phase) * 0.015;
      ctx.beginPath();
      ctx.ellipse(0, Math.sin(phase) * (i - 2) * 1.5, rx * s * wobble, ry * s * wobble, Math.sin(phase) * 0.05, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shore outline
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, rx * wobble, ry * wobble, 0, 0, Math.PI * 2); ctx.stroke();
  }

  private drawBush(ctx: CanvasRenderingContext2D, obs: Obstacle) {
    // Animated purple bush: subtle wind sway using a deterministic per-bush seed
    ctx.save();

    // Deterministic seed based on obstacle properties so each bush has a different motion
    const seed = (((obs.x | 0) * 73856093) ^ ((obs.y | 0) * 19349663) ^ ((obs.id || 0) * 83492791)) >>> 0;
    const t = (this.time * 0.001) + (seed % 100) * 0.017;

    // Per-bush parameters (vary amplitude and frequency slightly)
    const amp = 0.04 + (seed % 37) / 1000; // radians
    const freq = 0.8 + (seed % 13) / 20;
    const sway = Math.sin(t * freq) * amp;
    const bobx = Math.sin(t * (freq * 1.2) + (seed % 97) * 0.01) * 2;
    const boby = Math.cos(t * (freq * 0.95) + (seed % 61) * 0.013) * 1;

    // Apply tiny rotation so the bush 'leans' with the wind
    ctx.rotate(sway);

    // Base foliage
    ctx.fillStyle = '#4b1a3a';
    ctx.beginPath(); ctx.ellipse(bobx, boby, 18, 12, 0, 0, Math.PI * 2); ctx.fill();

    // Secondary lobe for silhouette variety (offset again deterministically)
    const offX = -6 + ((seed % 9) - 4) * 0.5;
    const offY = -4 + ((seed % 7) - 3) * 0.35;
    ctx.fillStyle = '#6f2b5f'; ctx.beginPath(); ctx.ellipse(offX + bobx * 0.4, offY + boby * 0.4, 6, 4, 0, 0, Math.PI * 2); ctx.fill();

    // Tiny flowers/dots with slight flicker (not synchronized)
    ctx.fillStyle = '#d8a6ff';
    const dotSeed = seed % 5;
    ctx.fillRect(-4 + (dotSeed % 3), -2 + (dotSeed % 2), 2, 2);
    ctx.fillRect(3 - (dotSeed % 2), 0 + ((dotSeed + 1) % 2), 2, 2);
    ctx.fillRect(6 - ((dotSeed + 2) % 3), -3 + ((dotSeed + 2) % 2), 2, 2);

    ctx.restore();
  }

  updateState(state: GameState): void {
    this.obstacles = state.obstacles || [];
    this.visibilityRadius = state.visibilityRadius || VISIBILITY_RADIUS;

    // Update interpolation targets
    Object.keys(state.players).forEach((id) => {
      const player = state.players[id];
      const petrifyRemainingMs = getStatusRemainingMs(player.activeStatuses as Array<{ kind: string; remainingMs: number }> | undefined, 'petrify');
      const interp = this.interpolated.get(id);
      if (interp) {
        const prevHealth = interp.health;
        interp.targetX = player.x;
        interp.targetY = player.y;
        interp.action = player.action;
        interp.nickname = player.nickname;
        interp.spriteVariant = player.spriteVariant;
        interp.design = player.design;
        interp.colorIdx = player.colorIdx;
        interp.health = player.health;
        interp.maxHealth = player.maxHealth;
        interp.statDamage = player.statDamage;
        interp.statSpeed = player.statSpeed;
        interp.statDodge = player.statDodge;
        interp.targetVisibility = 1;
        interp.isPetrified = petrifyRemainingMs > 0;
        interp.petrifyRemainingMs = petrifyRemainingMs;
        interp.castStartedAtMs = player.castState?.startedAtMs ?? null;
        interp.castDurationMs = player.castState?.castDurationMs ?? 0;
        if (typeof player.castState?.targetX === 'number' && typeof player.castState?.targetY === 'number') {
          const dx = player.castState.targetX - player.x;
          const dy = player.castState.targetY - player.y;
          if (Math.hypot(dx, dy) > 0.001) {
            interp.aimAngle = Math.atan2(dy, dx);
          }
          interp.castTargetX = player.castState.targetX;
          interp.castTargetY = player.castState.targetY;
        } else if (player.action === 'move' || player.action === 'idle' || player.action === 'dodge') {
          interp.aimAngle = null;
          interp.castTargetX = null;
          interp.castTargetY = null;
        } else {
          interp.castTargetX = null;
          interp.castTargetY = null;
        }
        const damage = Math.max(0, prevHealth - player.health);
        if (damage >= 1) {
          this.spawnDamageBurst(player.x, player.y - 24, damage, 'player');
        }
      } else {
        this.interpolated.set(id, {
          currentX: player.x,
          currentY: player.y,
          targetX: player.x,
          targetY: player.y,
          action: player.action,
          nickname: player.nickname,
          spriteVariant: player.spriteVariant,
          design: player.design || GameRenderer.DESIGNS[0],
          colorIdx: typeof player.colorIdx === 'number' ? player.colorIdx : (player.spriteVariant % SPRITE_COLORS.length),
          health: player.health,
          maxHealth: player.maxHealth,
          statDamage: player.statDamage,
          statSpeed: player.statSpeed,
          statDodge: player.statDodge,
          visibilityAlpha: id === this.localPlayerId ? 1 : 0,
          targetVisibility: 1,
          animFrame: 0,
          animTimer: 0,
          facingAngle: 0,
          aimAngle: null,
          castStartedAtMs: player.castState?.startedAtMs ?? null,
          castDurationMs: player.castState?.castDurationMs ?? 0,
          castTargetX: typeof player.castState?.targetX === 'number' ? player.castState.targetX : null,
          castTargetY: typeof player.castState?.targetY === 'number' ? player.castState.targetY : null,
          isPetrified: petrifyRemainingMs > 0,
          petrifyRemainingMs,
        });
      }
    });

    // Players omitted by server culling fade out instead of popping instantly.
    for (const [id, interp] of this.interpolated) {
      if (!state.players[id]) interp.targetVisibility = 0;
    }

    // Remove bubbles for players that no longer exist
    for (const pid of Array.from(this.chatBubbles.keys())) {
      if (!state.players[pid]) this.chatBubbles.delete(pid);
    }

    // Update enemy interpolation targets
    Object.keys(state.enemies || {}).forEach((id) => {
      const enemy = state.enemies[id];
      const petrifyRemainingMs = getStatusRemainingMs(enemy.activeStatuses as Array<{ kind: string; remainingMs: number }> | undefined, 'petrify');
      const interp = this.interpolatedEnemies.get(id);
      if (interp) {
        const prevHealth = interp.health;
        interp.targetX = enemy.x;
        interp.targetY = enemy.y;
        interp.health = enemy.health;
        interp.maxHealth = enemy.maxHealth;
        interp.targetVisibility = 1;
        interp.isPetrified = petrifyRemainingMs > 0;
        interp.petrifyRemainingMs = petrifyRemainingMs;
        interp.lastAttackTime = Math.max(interp.lastAttackTime, enemy.lastAttackTime);
        const damage = Math.max(0, prevHealth - enemy.health);
        if (damage >= 1) {
          this.spawnDamageBurst(enemy.x, enemy.y - (enemy.isBoss ? 48 : 28), damage, 'enemy');
        }
      } else {
        this.interpolatedEnemies.set(id, {
          id,
          type: enemy.type,
          isBoss: enemy.isBoss,
          currentX: enemy.x,
          currentY: enemy.y,
          targetX: enemy.x,
          targetY: enemy.y,
          health: enemy.health,
          maxHealth: enemy.maxHealth,
          visibilityAlpha: 0,
          targetVisibility: 1,
          lastAttackTime: enemy.lastAttackTime,
          facingAngle: 0,
          isPetrified: petrifyRemainingMs > 0,
          petrifyRemainingMs,
        });
      }
    });

    for (const [id, enemy] of this.interpolatedEnemies) {
      if (!state.enemies[id]) enemy.targetVisibility = 0;
    }

    // Update summon interpolation targets
    Object.keys(state.summons || {}).forEach((id) => {
      const summon = state.summons[id];
      const interp = this.interpolatedSummons.get(id);
      if (interp) {
        interp.targetX = summon.x;
        interp.targetY = summon.y;
        interp.ownerPlayerId = summon.ownerPlayerId;
        interp.createdAtMs = summon.createdAtMs;
        interp.lifeMs = summon.lifeMs;
        interp.data = summon.data;
        interp.targetVisibility = 1;
      } else {
        this.interpolatedSummons.set(id, {
          id,
          ownerPlayerId: summon.ownerPlayerId,
          type: summon.type,
          currentX: summon.x,
          currentY: summon.y,
          targetX: summon.x,
          targetY: summon.y,
          createdAtMs: summon.createdAtMs,
          lifeMs: summon.lifeMs,
          data: summon.data,
          visibilityAlpha: 0,
          targetVisibility: 1,
        });
      }
    });

    for (const [id, summon] of this.interpolatedSummons) {
      if (!state.summons[id]) summon.targetVisibility = 0;
    }
  }

  private spawnDamageBurst(x: number, y: number, amount: number, source: 'player' | 'enemy'): void {
    if (amount <= 0) return;
    this.damageBursts.push({
      id: this.nextDamageBurstId++,
      x,
      y,
      amount,
      source,
      createdAtMs: performance.now(),
      lifeMs: source === 'enemy' ? 640 : 560,
    });
    if (this.damageBursts.length > 90) {
      this.damageBursts.splice(0, this.damageBursts.length - 90);
    }
  }

  // --- Ambient particle helpers ---
  private initParticles(): void {
    this.particles = [];
    for (let i = 0; i < this.PARTICLE_COUNT; i++) {
      this.particles.push(this.createParticle());
    }
  }

  private createParticle() {
    const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    const vx = (Math.random() - 0.5) * 6; // px/sec
    const vy = (Math.random() - 0.5) * 4; // px/sec
    const size = 0.6 + Math.random() * 3.0;
    const color = this.particleColors[Math.floor(Math.random() * this.particleColors.length)];
    const alpha = 0.04 + Math.random() * 0.22;
    const phase = Math.random() * Math.PI * 2;
    const freq = 0.2 + Math.random() * 0.9;
    return { x, y, vx, vy, size, color, alpha, phase, freq };
  }

  // Pre-render a small set of glow sprites into offscreen canvases to avoid per-particle
  // `shadowBlur` calls each frame. We quantize particle sizes and bake the glow.
  private createParticleSprites(): void {
    this.particleSpriteCache.clear();
    for (const color of this.particleColors) {
      for (const s of this.particleSpriteSizes) {
        const key = `${color}_${s.toFixed(2)}`;
        this.particleSpriteCache.set(key, this.createParticleSprite(s, color));
      }
    }
  }

  private createParticleSprite(size: number, color: string): HTMLCanvasElement {
    const blur = Math.ceil(size * 6);
    const r = Math.max(1, Math.ceil(size));
    const pad = blur + 2;
    const dim = (r + pad) * 2;
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(dim));
    c.height = Math.max(2, Math.ceil(dim));
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    // Bake glow by drawing a filled circle with shadow blur into the offscreen canvas
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    const cx = c.width / 2;
    const cy = c.height / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  private getParticleSprite(color: string, size: number): HTMLCanvasElement {
    // find nearest quantized size
    let best = this.particleSpriteSizes[0];
    let bestDiff = Math.abs(size - best);
    for (const s of this.particleSpriteSizes) {
      const diff = Math.abs(size - s);
      if (diff < bestDiff) { best = s; bestDiff = diff; }
    }
    const key = `${color}_${best.toFixed(2)}`;
    let spr = this.particleSpriteCache.get(key);
    if (!spr) { spr = this.createParticleSprite(best, color); this.particleSpriteCache.set(key, spr); }
    return spr;
  }

  private updateAndDrawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    if (!this.particles || this.particles.length === 0) return;
    const dtSec = Math.max(0.001, dt / 1000);

    // particles are in world coordinates; we're already translated by -cam.x/-cam.y
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // subtle per-particle sway/pulse
      const sway = Math.sin((this.time * 0.001 + p.phase) * p.freq) * 6.0; // px effect
      // update position
      p.x += (p.vx + Math.cos(p.phase + this.time * 0.0006) * 0.2 + sway * 0.002) * dtSec;
      p.y += (p.vy + Math.sin(p.phase + this.time * 0.0009) * 0.15) * dtSec;

      // wrap around world bounds
      if (p.x < 0) p.x += WORLD_WIDTH;
      if (p.x > WORLD_WIDTH) p.x -= WORLD_WIDTH;
      if (p.y < 0) p.y += WORLD_HEIGHT;
      if (p.y > WORLD_HEIGHT) p.y -= WORLD_HEIGHT;

      // draw using a pre-rendered sprite (much faster than calling shadowBlur per-particle)
      const sprite = this.getParticleSprite(p.color, p.size);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + 0.25 * Math.sin((this.time * 0.001 + p.phase) * p.freq * 1.5);
      ctx.globalAlpha = Math.max(0.02, p.alpha * pulse);
      const sw = sprite.width;
      const sh = sprite.height;
      ctx.drawImage(sprite, p.x - sw / 2, p.y - sh / 2);
      ctx.restore();
    }
  }

  // Allow toggling whether the camera centers on the world or follows the local player
  setCenterScene(enabled: boolean) {
    this.centerScene = enabled;
  }

  startRenderLoop(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.render(t));
  }

  private getCamera(viewWidth: number, viewHeight: number): { x: number; y: number } {
    const maxCamX = Math.max(0, WORLD_WIDTH - viewWidth);
    const maxCamY = Math.max(0, WORLD_HEIGHT - viewHeight);
    if (this.centerScene) {
      const cx = WORLD_WIDTH / 2 - viewWidth / 2;
      const cy = WORLD_HEIGHT / 2 - viewHeight / 2;
      return {
        x: Math.max(0, Math.min(maxCamX, cx)),
        y: Math.max(0, Math.min(maxCamY, cy)),
      };
    }

    const local = this.interpolated.get(this.localPlayerId);
    if (!local) return { x: 0, y: 0 };
    const camX = local.currentX - viewWidth / 2;
    const camY = local.currentY - viewHeight / 2;
    return {
      x: Math.max(0, Math.min(maxCamX, camX)),
      y: Math.max(0, Math.min(maxCamY, camY)),
    };
  }

  // Convert canvas coordinates (relative to canvas top-left) to world coordinates
  screenToWorld(canvasX: number, canvasY: number): { x: number; y: number } {
    const width = Math.round(this.canvas.width / this.dpr);
    const height = Math.round(this.canvas.height / this.dpr);
    const viewWidth = Math.round(width / this.viewScale);
    const viewHeight = Math.round(height / this.viewScale);
    const cam = this.getCamera(viewWidth, viewHeight);
    return { x: cam.x + canvasX / this.viewScale, y: cam.y + canvasY / this.viewScale };
  }

  private render(timestamp: number): void {
    this.time = timestamp;
    const dt = timestamp - this.lastTime;
    this.lastTime = timestamp;

    // Keep transform in sync in case canvas size changed since last frame.
    this.syncCanvasMetrics();

    const width = Math.round(this.canvas.width / this.dpr);
    const height = Math.round(this.canvas.height / this.dpr);
    const ctx = this.ctx;

    // Clear CSS-pixel viewport to avoid ghost trails on resize/orientation transitions.
    ctx.clearRect(0, 0, width, height);

    // Smooth-interpolate all players first (needed for camera)
    for (const interp of this.interpolated.values()) {
      const alpha = 0.2;
      interp.currentX += (interp.targetX - interp.currentX) * alpha;
      interp.currentY += (interp.targetY - interp.currentY) * alpha;
      interp.visibilityAlpha += (interp.targetVisibility - interp.visibilityAlpha) * 0.22;
      const faceDX = interp.targetX - interp.currentX;
      const faceDY = interp.targetY - interp.currentY;
      if (Math.hypot(faceDX, faceDY) > 0.2) {
        interp.facingAngle = Math.atan2(faceDY, faceDX);
      }
      interp.animTimer += dt;
      if (interp.animTimer >= ANIM_FRAME_DURATION) {
        interp.animTimer = 0;
        const maxFrames = interp.action === 'attack' ? ATTACK_FRAMES
          : interp.action === 'dodge' ? DODGE_FRAMES
          : (interp.action === 'special' || interp.action === 'ultimate') ? ATTACK_FRAMES
          : IDLE_FRAMES;
        interp.animFrame = (interp.animFrame + 1) % maxFrames;
      }
    }

    for (const enemy of this.interpolatedEnemies.values()) {
      enemy.currentX += (enemy.targetX - enemy.currentX) * 0.16;
      enemy.currentY += (enemy.targetY - enemy.currentY) * 0.16;
      enemy.visibilityAlpha += (enemy.targetVisibility - enemy.visibilityAlpha) * 0.2;
      const headingDX = enemy.targetX - enemy.currentX;
      const headingDY = enemy.targetY - enemy.currentY;
      if (Math.hypot(headingDX, headingDY) > 0.2) {
        enemy.facingAngle = Math.atan2(headingDY, headingDX);
      }
    }

    for (const summon of this.interpolatedSummons.values()) {
      summon.currentX += (summon.targetX - summon.currentX) * 0.24;
      summon.currentY += (summon.targetY - summon.currentY) * 0.24;
      summon.visibilityAlpha += (summon.targetVisibility - summon.visibilityAlpha) * 0.25;
    }

    const viewWidth = Math.round(width / this.viewScale);
    const viewHeight = Math.round(height / this.viewScale);
    const cam = this.getCamera(viewWidth, viewHeight);

    ctx.save();
    ctx.scale(this.viewScale, this.viewScale);
    ctx.translate(-cam.x, -cam.y);

    // Draw graveyard ground
    this.drawGround(ctx, cam.x, cam.y, viewWidth, viewHeight);

    // Ambient particles (above ground, below obstacles/players)
    this.updateAndDrawParticles(ctx, dt);

    // Draw obstacles
    for (const obs of this.obstacles) {
      this.drawObstacle(ctx, obs);
    }

    // Draw persistent summon telegraphs (e.g., sphynx pyramids)
    for (const [id, summon] of this.interpolatedSummons) {
      if (summon.visibilityAlpha <= 0.02) {
        if (summon.targetVisibility <= 0) this.interpolatedSummons.delete(id);
        continue;
      }
      this.drawSummon(ctx, summon);
    }

    // Draw enemies
    for (const [id, enemy] of this.interpolatedEnemies) {
      if (enemy.visibilityAlpha <= 0.02) {
        if (enemy.targetVisibility <= 0) this.interpolatedEnemies.delete(id);
        continue;
      }
      this.drawEnemy(ctx, enemy);
    }

    // Draw players
    for (const [id, interp] of this.interpolated) {
      if (interp.visibilityAlpha <= 0.02) {
        if (interp.targetVisibility <= 0) this.interpolated.delete(id);
        continue;
      }
      const isLocal = id === this.localPlayerId;
      this.drawPlayer(ctx, interp, isLocal);
    }

    this.drawDamageBursts(ctx);

    this.drawVisibilityFog(ctx, cam.x, cam.y, viewWidth, viewHeight);

    // Draw chat bubbles that follow players
    for (const [playerId, bubble] of this.chatBubbles) {
      const interp = this.interpolated.get(playerId);
      if (!interp) { this.chatBubbles.delete(playerId); continue; }
      const elapsed = performance.now() - bubble.start;
      if (elapsed >= bubble.duration) { this.chatBubbles.delete(playerId); continue; }

      ctx.save();
      const alpha = Math.max(0, 1 - (elapsed / bubble.duration));
      ctx.globalAlpha = alpha;

      const lines = bubble.lines || this.wrapText(ctx, bubble.text, 240);
      ctx.font = '12px monospace';
      const lineH = 14;
      let maxW = 0;
      for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);

      const padX = 8;
      const padY = 6;
      const bw = Math.min(320, Math.round(maxW + padX * 2));
      const bh = Math.round(lines.length * lineH + padY * 2);

      let bx = Math.round(interp.currentX - bw / 2);
      const by = Math.round(interp.currentY - 44 - bh - 6);

      // clamp to viewport so bubble doesn't render off-screen
      const minX = cam.x + 8;
      const maxX = cam.x + viewWidth - 8 - bw;
      if (bx < minX) bx = minX;
      if (bx > maxX) bx = maxX;

      // background rounded rect
      this.drawRoundedPath(ctx, bx, by, bw, bh, 8);
      ctx.fillStyle = 'rgba(10,10,14,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // text
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      let ty = by + padY;
      for (const l of lines) {
        ctx.fillText(l, bx + padX, ty);
        ty += lineH;
      }

      // little pointer under bubble (triangle) pointing at the player
      const px = Math.round(interp.currentX);
      ctx.beginPath();
      ctx.moveTo(px - 6, by + bh);
      ctx.lineTo(px + 6, by + bh);
      ctx.lineTo(px, by + bh + 8);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,10,14,0.92)';
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();

    requestAnimationFrame((t) => this.render(t));
  }

  private drawGround(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number, vw: number, vh: number
  ): void {
    // Scenario: Graves of Nihilia - purple grass base with purple paths
    ctx.fillStyle = '#090216';
    ctx.fillRect(camX, camY, vw, vh);

    // Purple grass patches (base color)
    ctx.fillStyle = '#140a2a';
    const patchSpacingX = WORLD_WIDTH / 10;
    const patchSpacingY = WORLD_HEIGHT / 8;
    for (let gi = 0; gi < 10; gi++) {
      for (let gj = 0; gj < 8; gj++) {
        const jx = ((gi * 7 + gj * 13) % 60) - 30;
        const jy = ((gi * 11 + gj * 5) % 40) - 20;
        const px = patchSpacingX * (gi + 0.5) + jx;
        const py = patchSpacingY * (gj + 0.5) + jy;
        const rx = 40 + ((gi * 3 + gj * 7) % 30);
        const ry = 20 + ((gi * 5 + gj * 11) % 16);
        ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0.3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Subtle grass texture: many small blades (deterministic pattern)
    ctx.strokeStyle = 'rgba(180,120,200,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 300; i++) {
      const sx = camX + (i * 47 % vw);
      const sy = camY + ((i * 83) % vh);
      const bladeH = 4 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + 1.5, sy - bladeH / 2, sx + 0.5, sy - bladeH);
      ctx.stroke();
    }

    // Small highlights with subtle motion
    ctx.fillStyle = 'rgba(220,200,255,0.03)';
    for (let i = 0; i < 100; i++) {
      const seed = i * 9973;
      const offx = Math.sin((this.time * 0.001) + seed) * 6;
      const offy = Math.cos((this.time * 0.0015) + seed * 0.7) * 4;
      const sx = camX + ((i * 53) % vw) + offx;
      const sy = camY + ((i * 97) % vh) + offy;
      const r = 0.5 + (i % 2) * 0.6;
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Moonlight radial lighting
    const moonX = WORLD_WIDTH / 2 - camX;
    const moonY = WORLD_HEIGHT / 4 - camY;
    const grad = ctx.createRadialGradient(moonX, moonY, 30, moonX, moonY, Math.max(vw, vh));
    grad.addColorStop(0, 'rgba(210,200,255,0.14)');
    grad.addColorStop(0.4, 'rgba(150,130,200,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(camX, camY, vw, vh);

    // Volumetric moonlight rays distributed across the whole visible map area.
    const t = this.time * 0.001;
    const beamSpacing = 260;
    const beamStart = Math.floor((camX - 280) / beamSpacing) * beamSpacing;
    const beamLimit = camX + vw + 280;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let bx = beamStart, i = 0; bx <= beamLimit; bx += beamSpacing, i++) {
      const seed = (bx / beamSpacing) * 0.91;
      const sway = Math.sin(t * 0.34 + seed) * 34;
      const beamStartX = bx + sway;
      const beamStartY = camY - 160 + Math.cos(t * 0.23 + seed) * 18;
      const beamEndY = camY + vh + 180;
      const beamEndX = beamStartX + Math.sin(t * 0.29 + seed * 1.7) * 120;
      const beamWidth = 72 + (i % 3) * 14 + Math.sin(t * 0.85 + seed) * 8;

      const beamGrad = ctx.createLinearGradient(beamStartX, beamStartY, beamEndX, beamEndY);
      beamGrad.addColorStop(0, 'rgba(222,214,255,0.13)');
      beamGrad.addColorStop(0.35, 'rgba(196,178,255,0.08)');
      beamGrad.addColorStop(1, 'rgba(160,130,220,0)');

      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(beamStartX - beamWidth * 0.2, beamStartY);
      ctx.lineTo(beamStartX + beamWidth * 0.2, beamStartY);
      ctx.lineTo(beamEndX + beamWidth * 0.75, beamEndY);
      ctx.lineTo(beamEndX - beamWidth * 0.75, beamEndY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Moon subtle circle
    ctx.beginPath(); ctx.fillStyle = 'rgba(230,230,255,0.85)'; ctx.arc(moonX + 60, moonY - 40, 12, 0, Math.PI * 2); ctx.fill();
  }

  // (grid helper removed — unused in runtime)

  private drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle): void {
    const { x, y, type } = obs;
    ctx.save(); ctx.translate(x, y);
    ctx.save(); ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
    if (type === 'tomb') this.drawTomb(ctx);
    else if (type === 'dead_tree') this.drawDeadTree(ctx);
    else if (type === 'lake') this.drawLake(ctx, obs);
    else { if (type === 'bush') this.drawBush(ctx, obs); else this.drawDryBranch(ctx); }
    ctx.restore(); ctx.restore();
  }

  private drawTomb(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(2, 22, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5c5c5c'; ctx.fillRect(-14, -10, 28, 30);
    ctx.beginPath(); ctx.arc(0, -10, 14, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.5; ctx.strokeRect(-14, -10, 28, 30); ctx.beginPath(); ctx.arc(0, -10, 14, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(6, -1); ctx.stroke();
    ctx.fillStyle = 'rgba(50,120,30,0.5)'; ctx.fillRect(-14, 14, 8, 6); ctx.fillRect(6, 8, 8, 5);
  }

  private drawDeadTree(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(4, 10, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2d1f0a'; ctx.lineCap = 'round'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-2, -30); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, -15); ctx.lineTo(-22, -28); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-2, -20); ctx.lineTo(18, -35); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-2, -25); ctx.lineTo(-14, -42); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-22, -28); ctx.lineTo(-30, -38); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-22, -28); ctx.lineTo(-18, -38); ctx.stroke(); ctx.beginPath(); ctx.moveTo(18, -35); ctx.lineTo(26, -42); ctx.stroke(); ctx.beginPath(); ctx.moveTo(18, -35); ctx.lineTo(14, -44); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  private drawDryBranch(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#3a2808'; ctx.lineCap = 'round'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-28, 2); ctx.lineTo(28, -4); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-16, -10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(8, -2); ctx.lineTo(14, -12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(18, -3); ctx.lineTo(22, 6); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: InterpolatedEnemy): void {
    const x = Math.round(enemy.currentX);
    const y = Math.round(enemy.currentY);
    const moveDX = enemy.targetX - enemy.currentX;
    const moveDY = enemy.targetY - enemy.currentY;
    const moveMag = Math.hypot(moveDX, moveDY);
    const isMoving = moveMag > 0.28;
    const attackElapsed = Date.now() - enemy.lastAttackTime;
    const isAttacking = attackElapsed >= 0 && attackElapsed <= ENEMY_ATTACK_ANIM_MS;
    const attackProgress = isAttacking ? Math.min(1, attackElapsed / ENEMY_ATTACK_ANIM_MS) : 0;
    const attackPulse = isAttacking ? Math.sin(attackProgress * Math.PI) : 0;

    let bob = Math.sin(this.time * 0.002 + x * 0.01) * (enemy.isBoss ? 2.6 : 1.9);
    if (enemy.type === 'ghoul') bob += Math.sin(this.time * 0.0048 + x * 0.021) * 2.7;
    if (enemy.type === 'gargoyle') bob += Math.sin(this.time * 0.0041 + x * 0.017) * 3.8;
    if (enemy.type === 'ghoul' && isAttacking) bob -= attackPulse * 2.8;
    if (enemy.type === 'gravekeeper' && isAttacking) bob -= attackPulse * 1.8;

    const facingSign = Math.cos(enemy.facingAngle) >= 0 ? 1 : -1;
    const movementTilt = isMoving ? Math.max(-0.3, Math.min(0.3, enemy.facingAngle * 0.11)) : 0;

    ctx.save();
    ctx.globalAlpha = Math.max(0.1, Math.min(1, enemy.visibilityAlpha));
    ctx.translate(x, y + bob);
    if (movementTilt !== 0) ctx.rotate(movementTilt);
    ctx.scale(facingSign, 1);

    if (enemy.type === 'skeleton') {
      const shakeX = Math.sin(this.time * 0.023 + x * 0.17) * 0.85;
      const shakeY = Math.cos(this.time * 0.018 + y * 0.12) * 0.65;
      const shakeRot = Math.sin(this.time * 0.025 + x * 0.07) * 0.06;
      const walkCycle = isMoving ? Math.sin(this.time * 0.015 + x * 0.08) : 0;
      const armAttackSwing = isAttacking ? Math.sin(attackProgress * Math.PI * 5.4) * (1 - attackProgress * 0.25) * 1.05 : 0;
      const armSwing = Math.sin(this.time * 0.007 + x * 0.11) * 0.2 + armAttackSwing;

      ctx.save();
      ctx.translate(shakeX, shakeY);
      ctx.rotate(shakeRot);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 15, 12, 4, 0, 0, Math.PI * 2); ctx.fill();

      // Skull
      ctx.fillStyle = '#f0ece2';
      ctx.beginPath(); ctx.arc(0, -13, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1f1917';
      ctx.fillRect(-3, -15, 2, 2); ctx.fillRect(1, -15, 2, 2);
      ctx.fillRect(-1, -11, 2, 2);

      ctx.strokeStyle = '#ddd7cc'; ctx.lineWidth = 2.1;
      // Spine
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 8); ctx.stroke();
      // Rib cage
      for (let r = 0; r < 4; r++) {
        const ry = -3 + r * 3;
        const rw = 7 - r * 1.1;
        ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(-rw, ry + 0.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(rw, ry + 0.8); ctx.stroke();
      }

      // Pelvis / coxis (tailbone)
      ctx.fillStyle = '#d8d2c5';
      ctx.beginPath();
      ctx.moveTo(-4, 8);
      ctx.lineTo(4, 8);
      ctx.lineTo(2, 11);
      ctx.lineTo(-2, 11);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c2bcaf'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(0, 14); ctx.stroke();

      // Arms (attack: agita con fuerza)
      ctx.strokeStyle = '#d8d2c5';
      ctx.lineWidth = 2;
      ctx.save();
      ctx.translate(-6, -2);
      ctx.rotate(-0.9 - armSwing);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, 7);
      ctx.lineTo(-12, 10);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(6, -2);
      ctx.rotate(0.9 + armSwing);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(8, 7);
      ctx.lineTo(12, 10);
      ctx.stroke();
      ctx.restore();

      // Legs
      ctx.beginPath();
      ctx.moveTo(-2, 11);
      ctx.lineTo(-6 - walkCycle * 0.7, 16 + Math.abs(walkCycle) * 0.7);
      ctx.moveTo(2, 11);
      ctx.lineTo(6 + walkCycle * 0.7, 16 + Math.abs(walkCycle) * 0.7);
      ctx.stroke();

      if (isAttacking) {
        ctx.strokeStyle = 'rgba(255,236,212,0.6)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(8, -2, 10, -0.65, 0.45);
        ctx.stroke();
      }
      ctx.restore();
    } else if (enemy.type === 'ghoul') {
      const runCycle = isMoving ? Math.sin(this.time * 0.018 + x * 0.047) : 0;
      const tackleLunge = isAttacking ? attackPulse * 13 : 0;
      const tackleTilt = isAttacking ? attackPulse * 0.24 : runCycle * 0.03;
      ctx.save();
      ctx.translate(tackleLunge, -Math.abs(runCycle) * 0.9);
      ctx.rotate(tackleTilt);

      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 14, 13, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4f6f42'; ctx.beginPath(); ctx.ellipse(0, 3, 11, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7ca15f'; ctx.beginPath(); ctx.arc(0, -10, 7.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d6ff9a'; ctx.fillRect(-3, -12, 2, 2); ctx.fillRect(1, -12, 2, 2);

      const armBack = isAttacking ? -attackPulse * 0.85 : runCycle * 0.25;
      ctx.strokeStyle = '#3b4a31';
      ctx.lineWidth = 2.3;
      ctx.save();
      ctx.translate(-7, 0);
      ctx.rotate(-0.35 + armBack);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, 8); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(7, 0);
      ctx.rotate(0.35 - armBack);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, 8); ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = '#314129';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 12);
      ctx.lineTo(-7 - runCycle * 0.9, 18);
      ctx.moveTo(4, 12);
      ctx.lineTo(7 + runCycle * 0.9, 18);
      ctx.stroke();

      // Green stench puffs
      const stinkT = this.time * 0.0028;
      for (let i = 0; i < 4; i++) {
        const phase = stinkT + i * 0.9 + x * 0.01;
        const px = Math.sin(phase * 0.75) * (6 + i * 1.6);
        const py = -18 - (phase % (Math.PI * 2)) * 2.6;
        const pr = 2.4 + i * 0.7;
        const alpha = Math.max(0, 0.22 - i * 0.045 + Math.sin(phase) * 0.03);
        ctx.fillStyle = `rgba(132,220,92,${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      }

      if (isAttacking) {
        ctx.fillStyle = 'rgba(206,255,158,0.7)';
        ctx.beginPath();
        ctx.ellipse(17, -2, 6 + attackPulse * 2, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (enemy.type === 'gravekeeper') {
      const idleBreath = Math.sin(this.time * 0.0022 + x * 0.013);
      const stampCycle = isMoving ? Math.abs(Math.sin(this.time * 0.014 + x * 0.035)) : 0;
      const bodyLift = isMoving ? -stampCycle * 1.8 : idleBreath * 0.7;
      const shovelStamp = isMoving ? stampCycle * 7.2 : idleBreath * 0.8;
      const shovelAngle = isAttacking
        ? (-1.08 + attackProgress * 1.96)
        : (0.02 * Math.sin(this.time * 0.003 + x * 0.01));

      ctx.save();
      ctx.scale(1.38, 1.38);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 16, 15, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(0, bodyLift);
      ctx.fillStyle = '#2a2f43'; ctx.fillRect(-11, -6, 22, 22);
      ctx.fillStyle = '#404867'; ctx.fillRect(-8, -15, 16, 11);
      ctx.fillStyle = '#7a83a4'; ctx.fillRect(-9, -4, 18, 2);
      ctx.fillStyle = '#d7def2'; ctx.fillRect(-4, -12, 3, 3); ctx.fillRect(1, -12, 3, 3);
      ctx.fillStyle = '#161b2e'; ctx.fillRect(-2, -6, 4, 2);
      ctx.fillStyle = '#23283a';
      ctx.fillRect(-8, 15, 5, 5);
      ctx.fillRect(3, 15, 5, 5);

      // Pala vertical al caminar (estampando) y swing de ataque.
      ctx.save();
      ctx.translate(11, 3 + shovelStamp);
      ctx.rotate(shovelAngle);
      ctx.strokeStyle = '#9eb1d8';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 8); ctx.stroke();
      ctx.fillStyle = '#9eb1d8';
      ctx.beginPath();
      ctx.moveTo(-4, 8);
      ctx.lineTo(4, 8);
      ctx.lineTo(6, 14);
      ctx.lineTo(-6, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (isAttacking) {
        ctx.strokeStyle = 'rgba(182,200,255,0.72)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(14, 6, 8 + attackPulse * 5, -0.95, 0.7);
        ctx.stroke();
      }

      ctx.restore();
      ctx.restore();
    } else {
      // Gargoyle boss: heavier stone anatomy, armored silhouette, and aggressive wing posture.
      const flap = Math.sin(this.time * 0.013 + x * 0.016) * 0.34;
      const hover = Math.sin(this.time * 0.0038 + x * 0.012) * 1.3;
      const wingSnap = isAttacking ? attackPulse * 0.34 : 0;
      const tailWhip = isAttacking ? attackPulse : Math.sin(this.time * 0.006 + x * 0.018) * 0.16;
      const tailTipX = -34 + tailWhip * 62;
      const tailTipY = 20 - Math.abs(tailWhip) * 11 + Math.cos(this.time * 0.007 + y * 0.02) * 1.8;

      ctx.save();
      ctx.scale(1.42, 1.42);
      ctx.translate(0, hover);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 25, 30, 8.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tail sits behind the body to emphasize aerial control.
      ctx.strokeStyle = '#3b4150';
      ctx.lineWidth = 4.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-13, 14);
      ctx.bezierCurveTo(-26, 12, -30 + tailWhip * 16, 27 - tailWhip * 5, tailTipX, tailTipY);
      ctx.stroke();
      ctx.strokeStyle = '#666f85';
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(-13, 14);
      ctx.bezierCurveTo(-26, 12, -30 + tailWhip * 16, 27 - tailWhip * 5, tailTipX, tailTipY);
      ctx.stroke();
      ctx.fillStyle = '#d66471';
      ctx.beginPath();
      ctx.moveTo(tailTipX + 8, tailTipY);
      ctx.lineTo(tailTipX - 3, tailTipY - 4.8);
      ctx.lineTo(tailTipX - 2, tailTipY + 4.8);
      ctx.closePath();
      ctx.fill();

      // Left wing
      ctx.save();
      ctx.translate(-11, -5);
      ctx.rotate(-1.05 - flap - wingSnap);
      ctx.fillStyle = '#3f4659';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-20, -19, -40, -15);
      ctx.quadraticCurveTo(-53, -7, -55, 9);
      ctx.quadraticCurveTo(-33, 11, -8, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(23,26,34,0.56)';
      ctx.beginPath();
      ctx.moveTo(-7, 4);
      ctx.lineTo(-27, 6);
      ctx.lineTo(-18, -1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2d3342';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-31, -7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(-36, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9, 3); ctx.lineTo(-42, 8); ctx.stroke();
      ctx.restore();

      // Right wing
      ctx.save();
      ctx.translate(11, -5);
      ctx.rotate(1.05 + flap + wingSnap);
      ctx.fillStyle = '#3f4659';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(20, -19, 40, -15);
      ctx.quadraticCurveTo(53, -7, 55, 9);
      ctx.quadraticCurveTo(33, 11, 8, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(23,26,34,0.56)';
      ctx.beginPath();
      ctx.moveTo(7, 4);
      ctx.lineTo(27, 6);
      ctx.lineTo(18, -1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2d3342';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(5, 2); ctx.lineTo(31, -7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, 3); ctx.lineTo(36, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, 3); ctx.lineTo(42, 8); ctx.stroke();
      ctx.restore();

      // Torso and armor plates.
      ctx.fillStyle = '#5f6880';
      ctx.beginPath(); ctx.ellipse(0, 7, 18.4, 22.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#465068';
      ctx.beginPath();
      ctx.moveTo(-10, -1);
      ctx.lineTo(0, 11);
      ctx.lineTo(10, -1);
      ctx.lineTo(6, 15);
      ctx.lineTo(-6, 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7b86a1';
      ctx.beginPath(); ctx.ellipse(-10.5, 0, 5.5, 6.7, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(10.5, 0, 5.5, 6.7, 0.5, 0, Math.PI * 2); ctx.fill();

      // Head and crown spikes.
      ctx.fillStyle = '#79839f';
      ctx.beginPath(); ctx.arc(0, -16, 13.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8f98b3';
      ctx.beginPath(); ctx.moveTo(-9, -22); ctx.lineTo(-15, -31); ctx.lineTo(-6, -25); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(9, -22); ctx.lineTo(15, -31); ctx.lineTo(6, -25); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-3, -32); ctx.lineTo(3, -32); ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#ffc55a';
      ctx.fillRect(-5, -18, 3, 3);
      ctx.fillRect(2, -18, 3, 3);
      ctx.fillStyle = 'rgba(255,190,75,0.38)';
      ctx.fillRect(-6, -19, 5, 5);
      ctx.fillRect(1, -19, 5, 5);
      ctx.fillStyle = '#25212a';
      ctx.fillRect(-6, -21, 12, 2);
      ctx.fillRect(-3, -13, 6, 2);
      ctx.strokeStyle = '#292028';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(-5, -10);
      ctx.lineTo(0, -8);
      ctx.lineTo(5, -10);
      ctx.stroke();
      ctx.fillStyle = '#ddd7d1';
      ctx.fillRect(-4, -9, 2, 3);
      ctx.fillRect(2, -9, 2, 3);

      // Arms, claws, and talons.
      ctx.strokeStyle = '#808aa4';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-13, 6);
      ctx.lineTo(-22, 18);
      ctx.moveTo(13, 6);
      ctx.lineTo(22, 18);
      ctx.stroke();
      ctx.fillStyle = '#949eb8';
      ctx.beginPath(); ctx.moveTo(-22, 18); ctx.lineTo(-28, 18); ctx.lineTo(-23, 13); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(22, 18); ctx.lineTo(28, 18); ctx.lineTo(23, 13); ctx.closePath(); ctx.fill();

      ctx.strokeStyle = '#707a95';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-6, 21);
      ctx.lineTo(-11, 33);
      ctx.moveTo(6, 21);
      ctx.lineTo(11, 33);
      ctx.stroke();
      ctx.fillStyle = '#8c96b0';
      ctx.beginPath(); ctx.moveTo(-11, 33); ctx.lineTo(-15, 34); ctx.lineTo(-11, 30); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(11, 33); ctx.lineTo(15, 34); ctx.lineTo(11, 30); ctx.closePath(); ctx.fill();

      // Stone weathering details.
      ctx.strokeStyle = 'rgba(26,30,39,0.78)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(-2, 8); ctx.lineTo(-6, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, -1); ctx.lineTo(3, 6); ctx.lineTo(6, 14); ctx.stroke();
      ctx.fillStyle = 'rgba(88,123,95,0.54)';
      ctx.beginPath(); ctx.ellipse(-11, 10, 4.2, 2.5, 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(12, 9, 3.8, 2.3, -0.2, 0, Math.PI * 2); ctx.fill();

      if (isAttacking) {
        ctx.strokeStyle = 'rgba(239,120,104,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(23, 7, 10 + attackPulse * 10, -0.85, 0.92);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (enemy.isPetrified) {
      const pulse = 0.5 + Math.sin(this.time * 0.012 + (enemy.id.length % 7) * 0.6) * 0.5;
      const w = enemy.isBoss ? 86 : enemy.type === 'gravekeeper' ? 58 : 48;
      const h = enemy.isBoss ? 106 : enemy.type === 'gravekeeper' ? 84 : 72;
      this.drawPetrifyOverlay(ctx, w, h, pulse);
    }

    ctx.restore();

    const barWidth = enemy.isBoss ? 70 : 46;
    const barY = y - (enemy.isBoss ? 64 : enemy.type === 'gravekeeper' ? 46 : 30);
    const hpColor = this.getHealthColor(enemy.health, enemy.maxHealth);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(x - barWidth / 2 - 1, barY - 1, barWidth + 2, 8);
    ctx.fillStyle = 'rgba(88,20,24,0.9)';
    ctx.fillRect(x - barWidth / 2, barY, barWidth, 6);
    const ratio = Math.max(0, Math.min(1, enemy.health / Math.max(1, enemy.maxHealth)));
    ctx.fillStyle = hpColor;
    ctx.fillRect(x - barWidth / 2, barY, Math.round(barWidth * ratio), 6);
    ctx.strokeStyle = enemy.isBoss ? '#ffadad' : 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - barWidth / 2, barY, barWidth, 6);

    ctx.font = `${enemy.isBoss ? 'bold ' : ''}11px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const label = enemy.isBoss ? 'Gargola' : (enemy.type === 'gravekeeper' ? 'Gravekeeper' : enemy.type === 'skeleton' ? 'Skeleton' : 'Ghoul');
    const textW = ctx.measureText(label).width;
    const labelY = barY - 2;
    ctx.fillRect(x - textW / 2 - 3, labelY - 13, textW + 6, 13);
    ctx.fillStyle = hpColor;
    ctx.fillText(label, x, labelY - 1);
    ctx.restore();
  }

  private drawSummon(ctx: CanvasRenderingContext2D, summon: InterpolatedSummon): void {
    if (summon.type !== 'sphynx_pyramid') return;

    const x = Math.round(summon.currentX);
    const y = Math.round(summon.currentY);
    const now = Date.now();
    const elapsed = Math.max(0, now - summon.createdAtMs);
    const lifeRatio = Math.max(0, Math.min(1, elapsed / Math.max(1, summon.lifeMs)));
    const lifeFade = 1 - lifeRatio;
    const pulse = 0.5 + Math.sin(this.time * 0.006 + x * 0.01) * 0.5;
    const pullRadius = summon.data?.pullRadius ?? 240;
    const missileRadius = summon.data?.missileRadius ?? 180;
    const local = this.interpolated.get(this.localPlayerId);
    let distanceFade = 1;
    if (local) {
      const dist = Math.hypot(local.currentX - x, local.currentY - y);
      distanceFade = Math.max(0.36, 1 - (dist / Math.max(280, this.visibilityRadius * 1.18)));
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0.08, Math.min(1, summon.visibilityAlpha * distanceFade * (0.45 + lifeFade * 0.55)));

    // Pull/missile telegraph circles
    ctx.strokeStyle = `rgba(255,206,122,${(0.14 + pulse * 0.12).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, pullRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = `rgba(255,166,88,${(0.26 + pulse * 0.2).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, missileRadius + Math.sin(this.time * 0.008) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pyramid body
    const h = 36;
    const w = 28;
    ctx.fillStyle = '#5a3c1c';
    ctx.strokeStyle = '#e7bf77';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - w, y + h * 0.12);
    ctx.lineTo(x + w, y + h * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,220,138,0.34)';
    ctx.beginPath();
    ctx.moveTo(x, y - h + 5);
    ctx.lineTo(x - w * 0.4, y + h * 0.02);
    ctx.lineTo(x + w * 0.4, y + h * 0.02);
    ctx.closePath();
    ctx.fill();

    // Arcane core pulse
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,230,160,${(0.34 + pulse * 0.38).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y - h * 0.36, 6 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ground shadow and label
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.2, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.56)';
    const label = 'PYRAMID';
    const textW = ctx.measureText(label).width;
    ctx.fillRect(x - textW / 2 - 3, y - h - 16, textW + 6, 12);
    ctx.fillStyle = '#ffd992';
    ctx.fillText(label, x, y - h - 6);

    ctx.restore();
  }

  private drawDamageBursts(ctx: CanvasRenderingContext2D): void {
    if (this.damageBursts.length === 0) return;

    const now = performance.now();
    const alive: DamageBurst[] = [];

    for (const burst of this.damageBursts) {
      const age = now - burst.createdAtMs;
      if (age >= burst.lifeMs) continue;
      alive.push(burst);

      const t = Math.max(0, Math.min(1, age / burst.lifeMs));
      const rise = 8 + t * 24;
      const jitter = Math.sin((burst.id % 9) + t * Math.PI * 3) * (1 - t) * 2.4;
      const alpha = Math.max(0, 1 - t);
      const scale = 1 + (1 - t) * 0.22;

      const x = burst.x + jitter;
      const y = burst.y - rise;
      const text = `${Math.max(1, Math.round(burst.amount))}`;
      const fill = burst.source === 'enemy' ? '#ffe3a6' : '#ff9ca7';
      const stroke = burst.source === 'enemy' ? 'rgba(70,36,6,0.92)' : 'rgba(68,8,18,0.9)';

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = burst.source === 'enemy' ? 'rgba(255,204,122,0.78)' : 'rgba(255,122,138,0.72)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y - 2, 8 + t * 18, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `bold ${Math.round(13 * scale)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = stroke;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    this.damageBursts = alive;
  }

  private drawPetrifyOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, pulse: number): void {
    const w = Math.max(18, width);
    const h = Math.max(24, height);

    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(166,173,181,${(0.38 + pulse * 0.16).toFixed(3)})`;
    ctx.fillRect(-w * 0.5, -h * 0.76, w, h);

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(220,226,232,${(0.52 + pulse * 0.2).toFixed(3)})`;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 4; i++) {
      const x = -w * 0.27 + i * w * 0.18 + Math.sin(this.time * 0.002 + i * 1.3) * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, -h * 0.55);
      ctx.lineTo(x + Math.sin(this.time * 0.003 + i * 0.7) * 4, -h * 0.16);
      ctx.lineTo(x - Math.cos(this.time * 0.003 + i * 0.6) * 3, h * 0.08);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.22 + pulse * 0.2;
    ctx.fillStyle = 'rgba(140,148,156,0.9)';
    ctx.beginPath();
    ctx.ellipse(0, 13, w * 0.34, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    interp: InterpolatedPlayer,
    isLocal: boolean
  ): void {
    const x = Math.round(interp.currentX);
    const y = Math.round(interp.currentY);
    const colors = SPRITE_COLORS[interp.colorIdx ?? (interp.spriteVariant % SPRITE_COLORS.length)];
    const design = interp.design || GameRenderer.DESIGNS[0];
    const isRoleAnimated = design === 'bat' || design === 'cat' || design === 'vampire' || design === 'zombie' || design === 'medusa' || design === 'sphynx';
    const actionFacing = (interp.action === 'attack' || interp.action === 'special' || interp.action === 'ultimate')
      ? (interp.aimAngle ?? interp.facingAngle)
      : interp.facingAngle;
    const facingAngle = actionFacing || 0;

    ctx.save();
    ctx.globalAlpha = Math.max(0.08, Math.min(1, interp.visibilityAlpha));
    ctx.translate(x, y);

    // Action effects
    if (interp.action === 'attack') {
      if (!isRoleAnimated) {
        ctx.save();
        ctx.rotate(facingAngle);
        ctx.shadowColor = '#ff2244';
        ctx.shadowBlur = 22;
        const swingAngle = (interp.animFrame / ATTACK_FRAMES) * Math.PI;
        ctx.strokeStyle = '#ff2244';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 28, -Math.PI / 4, -Math.PI / 4 + swingAngle);
        ctx.stroke();
        ctx.restore();
      }
    } else if (interp.action === 'dodge') {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(interp.animFrame * Math.PI / 2);
      if (!isRoleAnimated) {
        ctx.shadowColor = '#a0c8ff';
        ctx.shadowBlur = 15;
      }
    } else if (interp.action === 'special' && !isRoleAnimated) {
      const pulse = 0.5 + Math.sin(this.time * 0.02 + interp.spriteVariant * 0.3) * 0.5;
      ctx.globalAlpha = 0.68 + pulse * 0.25;
      ctx.shadowColor = '#ffd873';
      ctx.shadowBlur = 12 + pulse * 10;
      ctx.strokeStyle = 'rgba(255,220,134,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 24 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (interp.action === 'ultimate' && !isRoleAnimated) {
      const pulse = 0.5 + Math.sin(this.time * 0.024 + interp.spriteVariant * 0.5) * 0.5;
      ctx.globalAlpha = 0.64 + pulse * 0.28;
      ctx.shadowColor = '#ff827f';
      ctx.shadowBlur = 14 + pulse * 10;
      ctx.strokeStyle = 'rgba(255,133,126,0.92)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 29 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    const bobOffset = Math.sin((this.time * 0.001) + (interp.spriteVariant * 0.45)) * 2;

    // Compute tilt based on movement direction so the creep leans into movement.
    const dx = interp.targetX - interp.currentX;
    const dy = interp.targetY - interp.currentY;
    const moveMag = Math.sqrt(dx * dx + dy * dy);
    let tilt = 0;
    if (moveMag > 0.25) {
      const dirAngle = Math.atan2(dy, dx); // heading in radians
      // scale down the heading to a small tilt and clamp
      tilt = Math.max(-0.35, Math.min(0.35, dirAngle * 0.12));
    }

    ctx.save();
    if (isLocal) ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
    if (tilt !== 0) ctx.rotate(tilt);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 14, 12, 4, 0, 0, Math.PI * 2); ctx.fill();

    const spriteAnim: SpriteAnimationState = {
      action: interp.action,
      animFrame: interp.animFrame,
      facingAngle,
      castProgress: (interp.castStartedAtMs && interp.castDurationMs > 0)
        ? Math.max(0, Math.min(1, (Date.now() - interp.castStartedAtMs) / interp.castDurationMs))
        : 0,
      castTargetOffsetX: typeof interp.castTargetX === 'number' ? (interp.castTargetX - x) : undefined,
      castTargetOffsetY: typeof interp.castTargetY === 'number' ? (interp.castTargetY - y) : undefined,
    };

    switch (design) {
      case 'ghost': this.drawGhost(ctx, bobOffset, colors, isLocal); break;
      case 'bat': this.drawBat(ctx, bobOffset, colors, isLocal, interp.spriteVariant, spriteAnim); break;
      case 'cat': this.drawCat(ctx, bobOffset, colors, isLocal, interp.spriteVariant, spriteAnim); break;
      case 'vampire': this.drawVampire(ctx, bobOffset, colors, isLocal, interp.spriteVariant, spriteAnim); break;
      case 'zombie': this.drawZombie(ctx, bobOffset, colors, isLocal, interp.spriteVariant, spriteAnim); break;
      case 'medusa': this.drawMedusa(ctx, bobOffset, colors, isLocal, interp.spriteVariant, spriteAnim); break;
      case 'sphynx': this.drawSphynx(ctx, bobOffset, colors, isLocal, interp.spriteVariant, spriteAnim); break;
      default: this.drawGhost(ctx, bobOffset, colors, isLocal);
    }

    if (interp.isPetrified) {
      const pulse = 0.5 + Math.sin(this.time * 0.01 + interp.spriteVariant * 0.4) * 0.5;
      this.drawPetrifyOverlay(ctx, 46, 76, pulse);
    }

    ctx.restore();

    if (isLocal) {
      ctx.strokeStyle = '#ff6eb4'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(0, bobOffset, 24, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.restore();

    this.drawHealthBar(ctx, x, y - 46, interp.health, interp.maxHealth, isLocal);

    // Nickname label
    const healthColor = this.getHealthColor(interp.health, interp.maxHealth);
    ctx.save(); ctx.font = `${isLocal ? 'bold ' : ''}11px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const labelY = y - 50; const textWidth = ctx.measureText(interp.nickname).width;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - textWidth / 2 - 3, labelY - 14, textWidth + 6, 14);
    ctx.fillStyle = healthColor;
    ctx.fillText(interp.nickname, x, labelY);
    ctx.restore();
  }

  private getHealthColor(health: number, maxHealth: number): string {
    const safeMax = Math.max(1, maxHealth);
    const ratio = Math.max(0, Math.min(1, health / safeMax));
    if (ratio < 0.3) return '#ff6161';
    if (ratio < 0.55) return '#e6cf5f';
    return '#6de66d';
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number, health: number, maxHealth: number, isLocal: boolean): void {
    const width = 44;
    const height = 6;
    const safeMax = Math.max(1, maxHealth);
    const ratio = Math.max(0, Math.min(1, health / safeMax));

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, height + 2);

    ctx.fillStyle = 'rgba(80,18,24,0.9)';
    ctx.fillRect(x - width / 2, y, width, height);

    const fillColor = this.getHealthColor(health, maxHealth);
    ctx.fillStyle = fillColor;
    ctx.fillRect(x - width / 2, y, Math.round(width * ratio), height);

    ctx.strokeStyle = isLocal ? '#ff8fbd' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2, y, width, height);
    ctx.restore();
  }

  private drawVisibilityFog(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    vw: number,
    vh: number
  ): void {
    const local = this.interpolated.get(this.localPlayerId);
    if (!local) return;

    const centerX = local.currentX;
    const centerY = local.currentY;
    const t = this.time * 0.001;
    // Keep the visible area close to most of the viewport while still preserving a fog edge.
    const viewportTargetRadius = Math.hypot(vw, vh) * 0.47;
    const baseRadius = Math.max(this.visibilityRadius, viewportTargetRadius);
    const pulse = 1 + Math.sin(t * 0.9) * 0.035;
    const radius = baseRadius * pulse;
    const fogCenterX = centerX + Math.sin(t * 0.42 + centerY * 0.0018) * 18;
    const fogCenterY = centerY + Math.cos(t * 0.37 + centerX * 0.0015) * 14;
    const clearRadius = Math.max(180, radius * 0.74);
    const transitionStart = Math.max(clearRadius + 10, radius * 0.9);
    const edge = this.fogStyle;
    const fogGradient = ctx.createRadialGradient(fogCenterX, fogCenterY, clearRadius, fogCenterX, fogCenterY, radius);
    fogGradient.addColorStop(0, `rgba(${edge.edgeColor},0)`);
    fogGradient.addColorStop(Math.min(0.96, transitionStart / radius), `rgba(${edge.edgeColor},${(edge.edgeAlpha * 0.35).toFixed(3)})`);
    fogGradient.addColorStop(1, `rgba(${edge.edgeColor},${edge.edgeAlpha.toFixed(3)})`);

    // Subtle center tint boosts clarity perception and reinforces map mood.
    const clarityGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, clearRadius);
    const clarityAlpha = edge.clarityAlpha + 0.018 + (Math.sin(t * 1.25) * 0.007);
    clarityGradient.addColorStop(0, `rgba(${edge.clarityTint},${Math.max(0, clarityAlpha).toFixed(3)})`);
    clarityGradient.addColorStop(1, `rgba(${edge.clarityTint},0)`);

    // Gentle moving veil to give the fog body and motion without reducing gameplay readability.
    const veilShift = (t * 26) % (vw + vh);
    const veilGradient = ctx.createLinearGradient(camX - vh + veilShift, camY, camX + veilShift, camY + vh);
    veilGradient.addColorStop(0, `rgba(${edge.edgeColor},0)`);
    veilGradient.addColorStop(0.5, `rgba(${edge.edgeColor},${(edge.edgeAlpha * 0.08).toFixed(3)})`);
    veilGradient.addColorStop(1, `rgba(${edge.edgeColor},0)`);

    ctx.save();
    ctx.fillStyle = fogGradient;
    ctx.fillRect(camX, camY, vw, vh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = veilGradient;
    ctx.fillRect(camX, camY, vw, vh);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = clarityGradient;
    ctx.fillRect(camX, camY, vw, vh);
    ctx.restore();
  }

  // --- Chat bubble helpers ---
  showChatBubble(playerId: string, text: string): void {
    const start = performance.now();
    const duration = this.calcBubbleDuration(text);
    const lines = this.wrapText(this.ctx, text, 240);
    this.chatBubbles.set(playerId, { text, start, duration, lines });
  }

  private calcBubbleDuration(text: string): number {
    const min = 5000;
    const max = 10000;
    const maxLenForMax = 120;
    const t = Math.min(1, text.length / maxLenForMax);
    return Math.round(min + (max - min) * t);
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    ctx.font = '12px monospace';
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  private drawRoundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

}
