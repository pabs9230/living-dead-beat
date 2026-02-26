import { GameClient } from '../network/gameClient';

const MOVE_SPEED = 4;
const SEND_RATE = 50; // Send position updates every 50ms

export class InputHandler {
  private keys = new Set<string>();
  private playerX = 400;
  private playerY = 300;
  private client: GameClient;
  private lastSendTime = 0;

  constructor(client: GameClient, _canvas: HTMLCanvasElement) {
    this.client = client;
    
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.keys.add(e.key);
      
      if (e.key === 'z' || e.key === 'Z') {
        client.sendAttack();
      }
      if (e.key === 'x' || e.key === 'X') {
        client.sendDodge();
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.key);
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
      this.playerX = Math.max(0, Math.min(800, this.playerX + dx));
      this.playerY = Math.max(0, Math.min(600, this.playerY + dy));

      const now = Date.now();
      if (now - this.lastSendTime >= SEND_RATE) {
        this.client.sendMove(this.playerX, this.playerY);
        this.lastSendTime = now;
      }
    }

    requestAnimationFrame(() => this.update());
  }
}
