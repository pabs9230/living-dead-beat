import { GameClient } from '../network/gameClient';
import { WORLD_WIDTH, WORLD_HEIGHT, Obstacle, ObstacleType, ExtendedObstacleType } from '../../../shared/src/types';

const MOVE_SPEED = 4;
const SEND_RATE = 50; // Send position updates every 50ms

// Player collision half-sizes (must match server constants)
// Known obstacle half-sizes (use server constants where possible). Include bush and
// sensible defaults for lake (ellipse handled specially below).
const OBSTACLE_HALF_W: Record<ExtendedObstacleType, number> = { tomb: 14, dead_tree: 12, dry_branch: 20, bush: 18, lake: 160 };
const OBSTACLE_HALF_H: Record<ExtendedObstacleType, number> = { tomb: 20, dead_tree: 12, dry_branch: 6, bush: 12, lake: 80 };
const PLAYER_HALF_W = 14;
const PLAYER_HALF_H = 20;

function overlapsObstacle(px: number, py: number, obs: Obstacle): boolean {
  // Lakes and ellipse-shaped obstacles use an elliptical collision test.
  if (obs.type === 'lake' || obs.shape === 'ellipse' || typeof obs.rx === 'number') {
    const rx = (obs.rx && obs.rx > 6) ? obs.rx : OBSTACLE_HALF_W['lake'];
    const ry = (obs.ry && obs.ry > 6) ? obs.ry : OBSTACLE_HALF_H['lake'];
    // Expand the ellipse by the player's half-size to approximate collision with the player box
    const ex = rx + PLAYER_HALF_W;
    const ey = ry + PLAYER_HALF_H;
    const dx = px - obs.x;
    const dy = py - obs.y;
    return (dx * dx) / (ex * ex) + (dy * dy) / (ey * ey) <= 1;
  }

  // Fallback: axis-aligned box overlap for other obstacle kinds
  const hw = OBSTACLE_HALF_W[obs.type as ExtendedObstacleType] ?? 10;
  const hh = OBSTACLE_HALF_H[obs.type as ExtendedObstacleType] ?? 6;
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
  // optional function to convert canvas coords to world coords
  private screenToWorld?: (cx: number, cy: number) => { x: number; y: number };
  // local action state (used to suppress movement while dashing)
  private localAction: string = 'idle';

  constructor(client: GameClient, canvas: HTMLCanvasElement, screenToWorld?: (cx: number, cy: number) => { x: number; y: number }) {
    this.client = client;
    this.screenToWorld = screenToWorld;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.keys.add(e.key);
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.key);
    });

    // Left click = dodge (dash toward mouse), right click = attack
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      if (e.button === 0) {
        if (this.screenToWorld) {
          const world = this.screenToWorld(canvasX, canvasY);
          client.sendDodgeTo(Math.round(world.x), Math.round(world.y));
        } else {
          client.sendDodge();
        }
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

  // Called by the main loop when server state updates arrive so we know
  // whether the local player is currently dashing (server authoritative)
  setLocalAction(action: string): void {
    this.localAction = action;
  }

  private update(): void {
    // Map keyboard keys to normalized input tokens
    const KEY_TO_INPUT: Record<string, 'left'|'right'|'up'|'down' | undefined> = {
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down'
    };

    // Combination actions can be registered here in the future (e.g. 'up+left' => 'dash-nw')
    const COMBOS: Record<string, string> = {}; // empty for now

    const pressed = Array.from(this.keys);
    // Filter out non-valid keys (ignore them per requirement #3)
    const validKeys = pressed.filter(k => KEY_TO_INPUT[k] !== undefined);

    let dx = 0;
    let dy = 0;

    // Iterate through valid keys in order; if a consecutive pair matches a combo, handle it,
    // otherwise treat inputs as a sequence (requirement #1 & #2)
    for (let i = 0; i < validKeys.length; i++) {
      const key = validKeys[i];
      const input = KEY_TO_INPUT[key]!;
      const nextKey = validKeys[i + 1];
      const nextInput = nextKey ? KEY_TO_INPUT[nextKey] : undefined;

      if (nextInput) {
        const comboKey = `${input}+${nextInput}`;
        const comboKeyAlt = `${nextInput}+${input}`;
        const combo = COMBOS[comboKey] || COMBOS[comboKeyAlt];
        if (combo) {
          // If a combo is defined, handle it. Currently COMBOS is empty, but this is the hook.
          // Example: this.client.sendCombo(combo);
          i++; // consume the next input as part of the combo
          continue;
        }
      }

      // No combo: apply single input to movement (sequence handling)
      if (input === 'left') dx -= MOVE_SPEED;
      else if (input === 'right') dx += MOVE_SPEED;
      else if (input === 'up') dy -= MOVE_SPEED;
      else if (input === 'down') dy += MOVE_SPEED;
    }

    // Player movement should never be blocked by unhandled inputs or continuous dodges (requirement #4)
    // Therefore we do not early-return when localAction === 'dodge'. Movement still applies locally.

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
