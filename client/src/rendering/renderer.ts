import { GameState } from '../../../shared/src/types';

// Sprite color palettes for different variants
const SPRITE_COLORS = [
  { body: '#a78bfa', outline: '#7c3aed', name: 'Violet' },
  { body: '#34d399', outline: '#059669', name: 'Emerald' },
  { body: '#f87171', outline: '#dc2626', name: 'Crimson' },
  { body: '#60a5fa', outline: '#2563eb', name: 'Azure' },
];

interface InterpolatedPlayer {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  action: string;
  nickname: string;
  spriteVariant: number;
  animFrame: number;
  animTimer: number;
}

const ANIM_FRAME_DURATION = 150; // ms per animation frame
const IDLE_FRAMES = 4;
const ATTACK_FRAMES = 4;
const DODGE_FRAMES = 4;

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private localPlayerId: string;
  private interpolated: Map<string, InterpolatedPlayer> = new Map();
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement, localPlayerId: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.localPlayerId = localPlayerId;
  }

  updateState(state: GameState): void {
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
  }

  startRenderLoop(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.render(t));
  }

  private render(timestamp: number): void {
    const dt = timestamp - this.lastTime;
    this.lastTime = timestamp;

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Clear
    ctx.fillStyle = '#0d0d1f';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    this.drawGrid(ctx, width, height);

    // Update interpolation and draw players
    for (const [id, interp] of this.interpolated) {
      // Smooth interpolation
      const alpha = 0.2;
      interp.currentX += (interp.targetX - interp.currentX) * alpha;
      interp.currentY += (interp.targetY - interp.currentY) * alpha;

      // Update animation frame
      interp.animTimer += dt;
      if (interp.animTimer >= ANIM_FRAME_DURATION) {
        interp.animTimer = 0;
        const maxFrames = interp.action === 'attack' ? ATTACK_FRAMES
          : interp.action === 'dodge' ? DODGE_FRAMES
          : IDLE_FRAMES;
        interp.animFrame = (interp.animFrame + 1) % maxFrames;
      }

      const isLocal = id === this.localPlayerId;
      this.drawPlayer(ctx, interp, isLocal);
    }

    requestAnimationFrame((t) => this.render(t));
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.strokeStyle = 'rgba(76, 29, 149, 0.15)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    interp: InterpolatedPlayer,
    isLocal: boolean
  ): void {
    const x = Math.round(interp.currentX);
    const y = Math.round(interp.currentY);
    const variant = interp.spriteVariant % SPRITE_COLORS.length;
    const colors = SPRITE_COLORS[variant];

    ctx.save();
    ctx.translate(x, y);

    // Action-based visual effects
    if (interp.action === 'attack') {
      ctx.shadowColor = colors.body;
      ctx.shadowBlur = 20;
      // Attack swing indicator
      const swingAngle = (interp.animFrame / ATTACK_FRAMES) * Math.PI;
      ctx.strokeStyle = colors.body;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 30, -Math.PI / 4, -Math.PI / 4 + swingAngle);
      ctx.stroke();
    } else if (interp.action === 'dodge') {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(interp.animFrame * Math.PI / 2);
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = 15;
    }

    // Body - 32x48 pixel art style character
    const size = 32;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, size + 4, size * 0.8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cloak/body
    const bobOffset = interp.action === 'idle' ? Math.sin(interp.animFrame * Math.PI / 2) * 1 : 0;
    ctx.fillStyle = colors.body;
    ctx.fillRect(-size / 2, -size + bobOffset, size, size * 1.5);

    // Outline
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = isLocal ? 2 : 1;
    ctx.strokeRect(-size / 2, -size + bobOffset, size, size * 1.5);

    // Eyes
    ctx.fillStyle = '#f0f0f0';
    const eyeY = -size * 0.5 + bobOffset;
    ctx.fillRect(-size / 4 - 2, eyeY, 4, 4);
    ctx.fillRect(size / 4 - 2, eyeY, 4, 4);

    // Local player indicator (ring)
    if (isLocal) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Nickname label
    ctx.save();
    ctx.font = `${isLocal ? 'bold ' : ''}11px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Background for nickname
    const textWidth = ctx.measureText(interp.nickname).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - textWidth / 2 - 3, y - 32 - 16, textWidth + 6, 14);
    
    ctx.fillStyle = isLocal ? '#ffffff' : colors.body;
    ctx.fillText(interp.nickname, x, y - 32);
    ctx.restore();
  }
}
