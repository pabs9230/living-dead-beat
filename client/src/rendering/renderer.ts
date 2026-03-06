import { GameState, Obstacle, WORLD_WIDTH, WORLD_HEIGHT } from '../../../shared/src/types';
import { drawGhost as spriteDrawGhost, drawBat as spriteDrawBat, drawCat as spriteDrawCat, drawVampire as spriteDrawVampire, drawZombie as spriteDrawZombie, drawMedusa as spriteDrawMedusa, drawSphynx as spriteDrawSphynx } from './sprites';

// Gothic / redrum sprite palettes
const SPRITE_COLORS = [
  { body: '#8B0000', outline: '#3a0000', name: 'Crimson' },
  { body: '#B22222', outline: '#4a0000', name: 'Blood' },
  { body: '#7f1a1a', outline: '#2f0f0f', name: 'Gore' },
  { body: '#d9b7bb', outline: '#5a1e2a', name: 'Pallor' },
];

interface InterpolatedPlayer {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  action: string;
  nickname: string;
  spriteVariant: number;
  design: string;
  colorIdx: number;
  animFrame: number;
  animTimer: number;
}

const ANIM_FRAME_DURATION = 150; // ms per animation frame
const IDLE_FRAMES = 4;
const ATTACK_FRAMES = 4;
const DODGE_FRAMES = 4;
// Uniform sprite scale multiplier (increase to make characters bigger)
const SPRITE_SCALE = 1.3;

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private localPlayerId: string;
  private interpolated: Map<string, InterpolatedPlayer> = new Map();
  private lastTime = 0;
  private time = 0;
  private obstacles: Obstacle[] = [];
  private static DESIGNS = ['ghost','bat','cat','vampire','zombie','medusa','sphynx'];
  private centerScene = true; // when true, camera centers on world center instead of local player
  // transient chat bubbles keyed by playerId
  private chatBubbles: Map<string, { text: string; start: number; duration: number; lines?: string[] }> = new Map();
  // ambient particles
  private particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; color: string; alpha: number; phase: number; freq: number }> = [];
  private PARTICLE_COUNT = 1500;
  private particleColors = ['#5fb1ff', '#8b5bff', '#2f0b3a', '#0b0610'];

  // Offscreen cache for pre-rendered particle sprites (color + quantized size)
  private particleSpriteCache: Map<string, HTMLCanvasElement> = new Map();
  private particleSpriteSizes: number[] = [0.8, 1.6, 2.4, 3.2];

  constructor(canvas: HTMLCanvasElement, localPlayerId: string, scenarioName = 'Graves of Nihilia') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.localPlayerId = localPlayerId;
    void scenarioName;
    // default cursor for the game canvas
    this.canvas.style.cursor = 'crosshair';
    this.createParticleSprites();
    this.initParticles();
  }

  // Change the canvas cursor style at runtime (e.g., 'default', 'pointer', 'crosshair', 'none')
  setCursorStyle(style: string) {
    this.canvas.style.cursor = style;
  }

  // --- Character drawing helpers (delegated to shared sprites module) ---
  private drawGhost(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean) {
    spriteDrawGhost(ctx, bob, colors, this.time, isLocal);
  }

  private drawBat(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean) {
    spriteDrawBat(ctx, bob, colors, this.time, isLocal);
  }

  private drawCat(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean, variant = 0) {
    spriteDrawCat(ctx, bob, colors, this.time, isLocal, variant);
  }

  private drawVampire(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean) {
    spriteDrawVampire(ctx, bob, colors, this.time, isLocal);
  }

  private drawZombie(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean) {
    spriteDrawZombie(ctx, bob, colors, this.time, isLocal);
  }

  private drawMedusa(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean) {
    spriteDrawMedusa(ctx, bob, colors, this.time, isLocal);
  }

  private drawSphynx(ctx: CanvasRenderingContext2D, bob: number, colors: any, isLocal: boolean) {
    spriteDrawSphynx(ctx, bob, colors, this.time, isLocal);
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

    // Update interpolation targets
    Object.keys(state.players).forEach((id) => {
      const player = state.players[id];
      const interp = this.interpolated.get(id);
      if (interp) {
        interp.targetX = player.x;
        interp.targetY = player.y;
        interp.action = player.action;
        interp.nickname = player.nickname;
        interp.spriteVariant = player.spriteVariant;
      } else {
        this.interpolated.set(id, {
          currentX: player.x,
          currentY: player.y,
          targetX: player.x,
          targetY: player.y,
          action: player.action,
          nickname: player.nickname,
          spriteVariant: player.spriteVariant,
          // Use server-provided design/color if present; otherwise fall back to defaults
          design: player.design || GameRenderer.DESIGNS[0],
          colorIdx: typeof player.colorIdx === 'number' ? player.colorIdx : (player.spriteVariant % SPRITE_COLORS.length),
          animFrame: 0,
          animTimer: 0,
        });
      }
    });

    // Remove players that left
    for (const id of this.interpolated.keys()) {
      if (!state.players[id]) {
        this.interpolated.delete(id);
      }
    }

    // Remove bubbles for players that no longer exist
    for (const pid of Array.from(this.chatBubbles.keys())) {
      if (!state.players[pid]) this.chatBubbles.delete(pid);
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

  private getCamera(): { x: number; y: number } {
    const { width, height } = this.canvas;
    if (this.centerScene) {
      const cx = WORLD_WIDTH / 2 - width / 2;
      const cy = WORLD_HEIGHT / 2 - height / 2;
      return {
        x: Math.max(0, Math.min(WORLD_WIDTH - width, cx)),
        y: Math.max(0, Math.min(WORLD_HEIGHT - height, cy)),
      };
    }

    const local = this.interpolated.get(this.localPlayerId);
    if (!local) return { x: 0, y: 0 };
    const camX = local.currentX - width / 2;
    const camY = local.currentY - height / 2;
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH - width, camX)),
      y: Math.max(0, Math.min(WORLD_HEIGHT - height, camY)),
    };
  }

  // Convert canvas coordinates (relative to canvas top-left) to world coordinates
  screenToWorld(canvasX: number, canvasY: number): { x: number; y: number } {
    const cam = this.getCamera();
    return { x: cam.x + canvasX, y: cam.y + canvasY };
  }

  private render(timestamp: number): void {
    this.time = timestamp;
    const dt = timestamp - this.lastTime;
    this.lastTime = timestamp;

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Smooth-interpolate all players first (needed for camera)
    for (const interp of this.interpolated.values()) {
      const alpha = 0.2;
      interp.currentX += (interp.targetX - interp.currentX) * alpha;
      interp.currentY += (interp.targetY - interp.currentY) * alpha;
      interp.animTimer += dt;
      if (interp.animTimer >= ANIM_FRAME_DURATION) {
        interp.animTimer = 0;
        const maxFrames = interp.action === 'attack' ? ATTACK_FRAMES
          : interp.action === 'dodge' ? DODGE_FRAMES
          : IDLE_FRAMES;
        interp.animFrame = (interp.animFrame + 1) % maxFrames;
      }
    }

    const cam = this.getCamera();

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // Draw graveyard ground
    this.drawGround(ctx, cam.x, cam.y, width, height);

    // Ambient particles (above ground, below obstacles/players)
    this.updateAndDrawParticles(ctx, dt);

    // Draw obstacles
    for (const obs of this.obstacles) {
      this.drawObstacle(ctx, obs);
    }

    // Draw players
    for (const [id, interp] of this.interpolated) {
      const isLocal = id === this.localPlayerId;
      this.drawPlayer(ctx, interp, isLocal);
    }

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
      const maxX = cam.x + width - 8 - bw;
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

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    interp: InterpolatedPlayer,
    isLocal: boolean
  ): void {
    const x = Math.round(interp.currentX);
    const y = Math.round(interp.currentY);
    const colors = SPRITE_COLORS[interp.colorIdx ?? (interp.spriteVariant % SPRITE_COLORS.length)];

    ctx.save();
    ctx.translate(x, y);

    // Action effects
    if (interp.action === 'attack') {
      ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 22; const swingAngle = (interp.animFrame / ATTACK_FRAMES) * Math.PI; ctx.strokeStyle = '#ff2244'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 28, -Math.PI / 4, -Math.PI / 4 + swingAngle); ctx.stroke();
    } else if (interp.action === 'dodge') {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(interp.animFrame * Math.PI / 2);
      ctx.shadowColor = '#a0c8ff'; ctx.shadowBlur = 15;
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

    const design = interp.design || GameRenderer.DESIGNS[0];
    switch (design) {
      case 'ghost': this.drawGhost(ctx, bobOffset, colors, isLocal); break;
      case 'bat': this.drawBat(ctx, bobOffset, colors, isLocal); break;
      case 'cat': this.drawCat(ctx, bobOffset, colors, isLocal, interp.spriteVariant); break;
      case 'vampire': this.drawVampire(ctx, bobOffset, colors, isLocal); break;
      case 'zombie': this.drawZombie(ctx, bobOffset, colors, isLocal); break;
      case 'medusa': this.drawMedusa(ctx, bobOffset, colors, isLocal); break;
      case 'sphynx': this.drawSphynx(ctx, bobOffset, colors, isLocal); break;
      default: this.drawGhost(ctx, bobOffset, colors, isLocal);
    }

    ctx.restore();

    if (isLocal) {
      ctx.strokeStyle = '#ff6eb4'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(0, bobOffset, 24, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.restore();

    // Nickname label
    ctx.save(); ctx.font = `${isLocal ? 'bold ' : ''}11px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const labelY = y - 36; const textWidth = ctx.measureText(interp.nickname).width;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - textWidth / 2 - 3, labelY - 14, textWidth + 6, 14);
    ctx.fillStyle = isLocal ? '#ff6eb4' : colors.body; ctx.fillText(interp.nickname, x, labelY);
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
