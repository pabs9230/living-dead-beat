import { GameClient } from '../network/gameClient';
import { WORLD_WIDTH, WORLD_HEIGHT, Obstacle, ObstacleType } from '../../../shared/src/types';

const MOVE_SPEED = 4;
const SEND_RATE = 50; // Send position updates every 50ms

// Player collision half-sizes (must match server constants)
const OBSTACLE_HALF_W: Record<ObstacleType, number> = { tomb: 14, dead_tree: 12, dry_branch: 20 };
const OBSTACLE_HALF_H: Record<ObstacleType, number> = { tomb: 20, dead_tree: 12, dry_branch: 6 };
const PLAYER_HALF_W = 14;
const PLAYER_HALF_H = 20;

function overlapsObstacle(px: number, py: number, obs: Obstacle): boolean {
  const hw = OBSTACLE_HALF_W[obs.type];
  const hh = OBSTACLE_HALF_H[obs.type];
  return (
    px + PLAYER_HALF_W > obs.x - hw &&
    px - PLAYER_HALF_W < obs.x + hw &&
    py + PLAYER_HALF_H > obs.y - hh &&
    py - PLAYER_HALF_H < obs.y + hh
  );
}

export class InputHandler {
  private keys = new Set<string>();
  private playerX = 800;
  private playerY = 600;
  private client: GameClient;
  private lastSendTime = 0;
  private obstacles: Obstacle[] = [];

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

  updateObstacles(obstacles: Obstacle[]): void {
    this.obstacles = obstacles;
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

      const fullBlocked = this.obstacles.some(o => overlapsObstacle(newX, newY, o));
      if (!fullBlocked) {
        this.playerX = newX;
        this.playerY = newY;
      } else {
        // Sliding: try each axis independently
        if (!this.obstacles.some(o => overlapsObstacle(newX, this.playerY, o))) {
          this.playerX = newX;
        }
        if (!this.obstacles.some(o => overlapsObstacle(this.playerX, newY, o))) {
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
