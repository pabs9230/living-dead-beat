import { GameClient } from '../network/gameClient';
import { WORLD_WIDTH, WORLD_HEIGHT, OBSTACLES, Obstacle } from '../../../shared/src/types';

const MOVE_SPEED = 4;
const SEND_RATE = 50; // Send position updates every 50ms

// Player hitbox half-dimensions (relative to player world position).
// PLAYER_HALF_W matches SZ/2 from renderer (SZ=26 → half=13, using 12 for slight inset).
// PLAYER_TOP covers skull (HEAD_R*2=26) + body (BODY_H/2=16) ≈ 42, rounded to 44.
const PLAYER_HALF_W = 12;
const PLAYER_TOP = 44; // how far up the hitbox extends from world position

function collidesWithObstacle(x: number, y: number, obs: Obstacle): boolean {
  return (
    x + PLAYER_HALF_W > obs.x &&
    x - PLAYER_HALF_W < obs.x + obs.width &&
    y > obs.y &&
    y - PLAYER_TOP < obs.y + obs.height
  );
}

function collidesWithAny(x: number, y: number): boolean {
  return OBSTACLES.some((obs) => collidesWithObstacle(x, y, obs));
}

export class InputHandler {
  private keys = new Set<string>();
  private playerX = 400;
  private playerY = 300;
  private client: GameClient;
  private lastSendTime = 0;

  constructor(client: GameClient, canvas: HTMLCanvasElement) {
    this.client = client;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.keys.add(e.key);
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.key);
    });

    // Left click = dodge, right click = attack
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) {
        client.sendDodge();
      } else if (e.button === 2) {
        client.sendAttack();
      }
    });

    // Prevent context menu on right-click inside canvas
    canvas.addEventListener('contextmenu', (e: Event) => {
      e.preventDefault();
    });

    this.update();
  }

  setPosition(x: number, y: number): void {
    this.playerX = x;
    this.playerY = y;
  }

  private update(): void {
    let dx = 0;
    let dy = 0;

    if (this.keys.has('ArrowLeft') || this.keys.has('a') || this.keys.has('A')) dx -= MOVE_SPEED;
    if (this.keys.has('ArrowRight') || this.keys.has('d') || this.keys.has('D')) dx += MOVE_SPEED;
    if (this.keys.has('ArrowUp') || this.keys.has('w') || this.keys.has('W')) dy -= MOVE_SPEED;
    if (this.keys.has('ArrowDown') || this.keys.has('s') || this.keys.has('S')) dy += MOVE_SPEED;

    if (dx !== 0 || dy !== 0) {
      const newX = Math.max(0, Math.min(WORLD_WIDTH, this.playerX + dx));
      const newY = Math.max(0, Math.min(WORLD_HEIGHT, this.playerY + dy));

      if (!collidesWithAny(newX, newY)) {
        // Full movement is clear
        this.playerX = newX;
        this.playerY = newY;
      } else {
        // Try sliding along each axis independently
        if (!collidesWithAny(newX, this.playerY)) {
          this.playerX = newX;
        }
        if (!collidesWithAny(this.playerX, newY)) {
          this.playerY = newY;
        }
      }

      const now = Date.now();
      if (now - this.lastSendTime >= SEND_RATE) {
        this.client.sendMove(this.playerX, this.playerY);
        this.lastSendTime = now;
      }
    }

    requestAnimationFrame(() => this.update());
  }
}
