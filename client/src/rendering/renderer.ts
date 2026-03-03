import { GameState, Obstacle, WORLD_WIDTH, WORLD_HEIGHT } from '../../../shared/src/types';

// Creepy/cute slasher sprite palettes
const SPRITE_COLORS = [
  { body: '#ff6eb4', outline: '#cc0060', name: 'Rose' },
  { body: '#7fff7a', outline: '#1aaa15', name: 'Sickly' },
  { body: '#ffcf5c', outline: '#cc8800', name: 'Amber' },
  { body: '#a0c8ff', outline: '#2255cc', name: 'Pallid' },
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
  private obstacles: Obstacle[] = [];

  constructor(canvas: HTMLCanvasElement, localPlayerId: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.localPlayerId = localPlayerId;
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

  private getCamera(): { x: number; y: number } {
    const local = this.interpolated.get(this.localPlayerId);
    if (!local) return { x: 0, y: 0 };
    const { width, height } = this.canvas;
    const cx = local.currentX - width / 2;
    const cy = local.currentY - height / 2;
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH - width, cx)),
      y: Math.max(0, Math.min(WORLD_HEIGHT - height, cy)),
    };
  }

  private render(timestamp: number): void {
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

    // Draw grid (subtle earth marks)
    this.drawGrid(ctx, cam.x, cam.y, width, height);

    // Draw obstacles
    for (const obs of this.obstacles) {
      this.drawObstacle(ctx, obs);
    }

    // Draw players
    for (const [id, interp] of this.interpolated) {
      const isLocal = id === this.localPlayerId;
      this.drawPlayer(ctx, interp, isLocal);
    }

    ctx.restore();

    requestAnimationFrame((t) => this.render(t));
  }

  private drawGround(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number, vw: number, vh: number
  ): void {
    // Base dark earthy ground
    ctx.fillStyle = '#111a0d';
    ctx.fillRect(camX, camY, vw, vh);

    // Scattered dark-green ground patches, generated deterministically from world grid
    ctx.fillStyle = '#162210';
    const patchSpacingX = WORLD_WIDTH / 10;
    const patchSpacingY = WORLD_HEIGHT / 8;
    // Use a simple deterministic jitter based on grid index
    for (let gi = 0; gi < 10; gi++) {
      for (let gj = 0; gj < 8; gj++) {
        // Pseudo-random offset from grid cell using a deterministic formula
        const jx = ((gi * 7 + gj * 13) % 60) - 30;
        const jy = ((gi * 11 + gj * 5) % 40) - 20;
        const px = patchSpacingX * (gi + 0.5) + jx;
        const py = patchSpacingY * (gj + 0.5) + jy;
        const rx = 40 + ((gi * 3 + gj * 7) % 30);
        const ry = 20 + ((gi * 5 + gj * 11) % 16);
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    camX: number, camY: number, vw: number, vh: number
  ): void {
    ctx.strokeStyle = 'rgba(30,60,20,0.25)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    const startX = Math.floor(camX / gridSize) * gridSize;
    const startY = Math.floor(camY / gridSize) * gridSize;
    for (let x = startX; x < camX + vw; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, camY);
      ctx.lineTo(x, camY + vh);
      ctx.stroke();
    }
    for (let y = startY; y < camY + vh; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(camX, y);
      ctx.lineTo(camX + vw, y);
      ctx.stroke();
    }
  }

  private drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle): void {
    const { x, y, type } = obs;
    ctx.save();
    ctx.translate(x, y);

    if (type === 'tomb') {
      this.drawTomb(ctx);
    } else if (type === 'dead_tree') {
      this.drawDeadTree(ctx);
    } else {
      this.drawDryBranch(ctx);
    }

    ctx.restore();
  }

  private drawTomb(ctx: CanvasRenderingContext2D): void {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 22, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stone slab body
    ctx.fillStyle = '#5c5c5c';
    ctx.fillRect(-14, -10, 28, 30);
    // Rounded top (arch)
    ctx.beginPath();
    ctx.arc(0, -10, 14, Math.PI, 0);
    ctx.fill();

    // Stone texture / darker outline
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-14, -10, 28, 30);
    ctx.beginPath();
    ctx.arc(0, -10, 14, Math.PI, 0);
    ctx.stroke();

    // Cross carved into stone
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -1);
    ctx.lineTo(6, -1);
    ctx.stroke();

    // Moss patches
    ctx.fillStyle = 'rgba(50,120,30,0.5)';
    ctx.fillRect(-14, 14, 8, 6);
    ctx.fillRect(6, 8, 8, 5);
  }

  private drawDeadTree(ctx: CanvasRenderingContext2D): void {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(4, 10, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2d1f0a';
    ctx.lineCap = 'round';

    // Trunk
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(-2, -30);
    ctx.stroke();

    // Main branches
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-2, -15);
    ctx.lineTo(-22, -28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -20);
    ctx.lineTo(18, -35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -25);
    ctx.lineTo(-14, -42);
    ctx.stroke();

    // Smaller twigs
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-22, -28);
    ctx.lineTo(-30, -38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, -28);
    ctx.lineTo(-18, -38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, -35);
    ctx.lineTo(26, -42);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, -35);
    ctx.lineTo(14, -44);
    ctx.stroke();

    ctx.lineCap = 'butt';
  }

  private drawDryBranch(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#3a2808';
    ctx.lineCap = 'round';

    // Main stem
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-28, 2);
    ctx.lineTo(28, -4);
    ctx.stroke();

    // Small offshoots
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-16, -10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.lineTo(14, -12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, -3);
    ctx.lineTo(22, 6);
    ctx.stroke();

    ctx.lineCap = 'butt';
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

    // Action-based effects
    if (interp.action === 'attack') {
      ctx.shadowColor = '#ff2244';
      ctx.shadowBlur = 22;
      const swingAngle = (interp.animFrame / ATTACK_FRAMES) * Math.PI;
      ctx.strokeStyle = '#ff2244';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 28, -Math.PI / 4, -Math.PI / 4 + swingAngle);
      ctx.stroke();
    } else if (interp.action === 'dodge') {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(interp.animFrame * Math.PI / 2);
      ctx.shadowColor = '#a0c8ff';
      ctx.shadowBlur = 15;
    }

    const bobOffset = interp.action === 'idle'
      ? Math.sin(interp.animFrame * Math.PI / 2) * 1.5
      : 0;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (cute chibi – big round head, small body)
    const headR = 16;
    const bodyW = 20;
    const bodyH = 18;
    const headY = -headR - bodyH / 2 + bobOffset;
    const bodyY = -bodyH / 2 + bobOffset;

    // Body (torso)
    ctx.fillStyle = colors.body;
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = isLocal ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(-bodyW / 2, bodyY, bodyW, bodyH, 4);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = '#ece8d0'; // bone-white skin
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = isLocal ? 2 : 1.5;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cute eyes
    const eyeY = headY - 2;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-5, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();
    // Eye shine
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-4, eyeY - 1, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, eyeY - 1, 1, 0, Math.PI * 2);
    ctx.fill();

    // Creepy smile
    ctx.strokeStyle = interp.action === 'attack' ? '#ff2244' : '#553322';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, headY + 5, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Weapon (small cleaver drawn on right side)
    ctx.save();
    ctx.translate(bodyW / 2 + 2, bodyY + 2);
    if (interp.action === 'attack') {
      ctx.rotate(-0.8);
    }
    ctx.fillStyle = '#aaa';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    // Blade
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, -4);
    ctx.lineTo(12, 4);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Handle
    ctx.fillStyle = '#7a4010';
    ctx.fillRect(-3, 3, 4, 8);
    ctx.restore();

    // Local player indicator
    if (isLocal) {
      ctx.strokeStyle = '#ff6eb4';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, bobOffset, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Nickname label
    ctx.save();
    ctx.font = `${isLocal ? 'bold ' : ''}11px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const labelY = y - 36;
    const textWidth = ctx.measureText(interp.nickname).width;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - textWidth / 2 - 3, labelY - 14, textWidth + 6, 14);
    ctx.fillStyle = isLocal ? '#ff6eb4' : colors.body;
    ctx.fillText(interp.nickname, x, labelY);
    ctx.restore();
  }
}
