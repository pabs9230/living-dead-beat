import { GameState, OBSTACLES } from '../../../shared/src/types';

// Monster/horror sprite palettes
const SPRITE_COLORS = [
  { body: '#2a4a18', outline: '#1a2e0d', eye: '#ff4400', name: 'Undead' },   // zombie green
  { body: '#3d1450', outline: '#240830', eye: '#cc00ff', name: 'Wraith' },   // purple wraith
  { body: '#7a1a1a', outline: '#4a0f0f', eye: '#ff8800', name: 'Demon' },    // blood red demon
  { body: '#0f2a3d', outline: '#081825', eye: '#00ccff', name: 'Specter' },  // spectral blue
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

// Character base size
const SZ = 26;
const HEAD_R = 13;
const BODY_H = 32;
// Vertical offset (0–1) within the skull where teeth begin
const SKULL_TEETH_Y = 0.42;

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

    // Graveyard ground
    ctx.fillStyle = '#111008';
    ctx.fillRect(0, 0, width, height);

    // Ground texture — subtle dirt patches
    this.drawGround(ctx, width, height);

    // Draw tombstone obstacles
    this.drawObstacles(ctx);

    // Update interpolation and draw players
    for (const [id, interp] of this.interpolated) {
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

  private drawGround(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Subtle dirt/dead-grass ground marks
    ctx.strokeStyle = 'rgba(40, 30, 10, 0.5)';
    ctx.lineWidth = 1;
    const gridSize = 60;
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
    // Moonlight fog at the edges
    const fog = ctx.createRadialGradient(width / 2, height / 2, height * 0.3, width / 2, height / 2, height * 0.8);
    fog.addColorStop(0, 'rgba(0,0,0,0)');
    fog.addColorStop(1, 'rgba(0,5,10,0.55)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, width, height);
  }

  private drawObstacles(ctx: CanvasRenderingContext2D): void {
    for (const obs of OBSTACLES) {
      ctx.save();
      // Translate to center of tombstone
      ctx.translate(obs.x + obs.width / 2, obs.y);
      const hw = obs.width / 2;
      const h = obs.height;

      // Shadow cast on ground
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(4, h + 3, hw * 0.8, 4, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Stone body
      ctx.fillStyle = '#4e4e5a';
      ctx.fillRect(-hw, h * 0.38, obs.width, h * 0.62);

      // Arched top
      ctx.fillStyle = '#5e5e6e';
      ctx.beginPath();
      ctx.arc(0, h * 0.38, hw, Math.PI, 0);
      ctx.rect(-hw, 0, obs.width, h * 0.38);
      ctx.fill();

      // Outline
      ctx.strokeStyle = '#2a2a38';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, h * 0.38, hw, Math.PI, 0);
      ctx.lineTo(hw, h);
      ctx.lineTo(-hw, h);
      ctx.closePath();
      ctx.stroke();

      // Engraved cross
      ctx.strokeStyle = '#383848';
      ctx.lineWidth = 2;
      const cx = 0;
      const cy = h * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9);
      ctx.lineTo(cx, cy + 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 2);
      ctx.lineTo(cx + 6, cy - 2);
      ctx.stroke();

      ctx.restore();
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
      ctx.shadowColor = '#ff2200';
      ctx.shadowBlur = 28;
      const swingAngle = (interp.animFrame / ATTACK_FRAMES) * Math.PI;
      ctx.strokeStyle = '#ff2200';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -BODY_H / 2, 36, -Math.PI / 4, -Math.PI / 4 + swingAngle);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (interp.action === 'dodge') {
      ctx.globalAlpha = 0.4 + 0.6 * Math.sin(interp.animFrame * Math.PI / 2);
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 18;
    }

    // Idle bob
    const bob = interp.action === 'idle' ? Math.sin(interp.animFrame * Math.PI / 2) * 1.5 : 0;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, BODY_H / 2 + 4, SZ * 0.55, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ragged cloak body (trapezoidal)
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.moveTo(-SZ / 2, -BODY_H / 2 + bob);
    ctx.lineTo(SZ / 2, -BODY_H / 2 + bob);
    ctx.lineTo(SZ / 2 + 5, BODY_H / 2 + bob);
    ctx.lineTo(-SZ / 2 - 5, BODY_H / 2 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Ragged bottom — jagged triangles
    ctx.fillStyle = colors.body;
    for (let i = 0; i < 3; i++) {
      const rx = -SZ / 2 - 4 + i * ((SZ + 8) / 2);
      ctx.beginPath();
      ctx.moveTo(rx, BODY_H / 2 + bob);
      ctx.lineTo(rx + (SZ + 8) / 4, BODY_H / 2 + 10 + bob);
      ctx.lineTo(rx + (SZ + 8) / 2, BODY_H / 2 + bob);
      ctx.closePath();
      ctx.fill();
    }

    // Gnarled arms
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-SZ / 2, -BODY_H / 4 + bob);
    ctx.quadraticCurveTo(-SZ * 0.95, bob, -SZ * 0.85, BODY_H / 4 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(SZ / 2, -BODY_H / 4 + bob);
    ctx.quadraticCurveTo(SZ * 0.95, bob, SZ * 0.85, BODY_H / 4 + bob);
    ctx.stroke();

    // Skull head
    const headY = -BODY_H / 2 - HEAD_R + bob;
    ctx.fillStyle = '#d0c498';
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, headY, HEAD_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing eyes
    ctx.fillStyle = colors.eye;
    ctx.shadowColor = colors.eye;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(-HEAD_R * 0.38, headY - 1, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(HEAD_R * 0.38, headY - 1, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Skull teeth
    ctx.fillStyle = '#f0e8d0';
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(i * 4 - 1.5, headY + HEAD_R * SKULL_TEETH_Y + bob, 3, 5);
    }

    // Local player indicator ring — sized to new character
    if (isLocal) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      // Ring radius tuned to encompass the ~SZ-wide, ~(BODY_H + HEAD_R*2)-tall character
      ctx.arc(0, 0, SZ + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Nickname label
    ctx.save();
    ctx.font = `${isLocal ? 'bold ' : ''}11px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const nicknameY = y - BODY_H / 2 - HEAD_R * 2 - 6;
    const textWidth = ctx.measureText(interp.nickname).width;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - textWidth / 2 - 3, nicknameY - 14, textWidth + 6, 14);
    ctx.fillStyle = isLocal ? '#ffffff' : colors.eye;
    ctx.fillText(interp.nickname, x, nicknameY);
    ctx.restore();
  }
}
