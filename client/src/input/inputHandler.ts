import { GameClient } from '../network/gameClient';
import { WORLD_WIDTH, WORLD_HEIGHT, Obstacle, ExtendedObstacleType } from '../../../shared/src/types';

const MOVE_SPEED = 4;
const SEND_RATE = 50; // Send position updates every 50ms
const MOVE_KEY_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS']);
const DASH_DIRECTION_BLEND = 0.2;
const DASH_AIM_DISTANCE = 240;
const AUTHORITATIVE_SNAP_DISTANCE = 48;

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
  private pressedCodes = new Set<string>();
  private playerX = 800;
  private playerY = 600;
  private client: GameClient;
  private lastSendTime = 0;
  private obstacles: Obstacle[] = [];
  // optional function to convert canvas coords to world coords
  private screenToWorld?: (cx: number, cy: number) => { x: number; y: number };
  private pointerDown = false;
  private pointerId: number | null = null;
  private pointerType: string | null = null;
  private pointerCanvasX = 0;
  private pointerCanvasY = 0;
  private hasPointerPosition = false;
  private pointerDownTime = 0;
  private pointerMoved = false;
  private mobileControlsEnabled = false;
  private mobileMoveX = 0;
  private mobileMoveY = 0;
  private lastMobileDirection = { x: 1, y: 0 };
  private ultimateHoldActive = false;

  private getCursorWorldPoint(): { x: number; y: number } | undefined {
    if (this.screenToWorld && this.hasPointerPosition) {
      return this.screenToWorld(this.pointerCanvasX, this.pointerCanvasY);
    }
    return undefined;
  }

  private getAbilityAimPoint(): { x: number; y: number } | undefined {
    const cursor = this.getCursorWorldPoint();
    if (cursor) return cursor;

    const dashDir = this.getDashBiasDirection();
    if (Math.hypot(dashDir.x, dashDir.y) > 0.001) {
      return {
        x: this.playerX + dashDir.x * DASH_AIM_DISTANCE,
        y: this.playerY + dashDir.y * DASH_AIM_DISTANCE,
      };
    }

    return undefined;
  }

  private castAbility(slot: 'special' | 'ultimate'): void {
    const aim = this.getAbilityAimPoint();
    if (aim) {
      this.client.sendAbilityCast(slot, Math.round(aim.x), Math.round(aim.y));
      return;
    }
    this.client.sendAbilityCast(slot);
  }

  private startUltimateHold(): void {
    if (this.ultimateHoldActive) return;
    this.ultimateHoldActive = true;
    const aim = this.getAbilityAimPoint();
    if (aim) {
      this.client.sendAbilityHold('ultimate', true, Math.round(aim.x), Math.round(aim.y));
      return;
    }
    this.client.sendAbilityHold('ultimate', true);
  }

  private stopUltimateHold(): void {
    if (!this.ultimateHoldActive) return;
    this.ultimateHoldActive = false;
    this.client.sendAbilityHold('ultimate', false);
  }

  private sendBasicAttack(targetWorld?: { x: number; y: number }): void {
    const cursor = targetWorld ?? this.getCursorWorldPoint();
    if (cursor) {
      this.client.sendAttack(Math.round(cursor.x), Math.round(cursor.y));
      return;
    }

    const dir = this.getDashBiasDirection();
    if (Math.hypot(dir.x, dir.y) > 0.001) {
      this.client.sendAttack(
        Math.round(this.playerX + dir.x * DASH_AIM_DISTANCE),
        Math.round(this.playerY + dir.y * DASH_AIM_DISTANCE)
      );
      return;
    }

    this.client.sendAttack();
  }

  private getKeyboardDirection(): { x: number; y: number } {
    const left = this.pressedCodes.has('ArrowLeft') || this.pressedCodes.has('KeyA');
    const right = this.pressedCodes.has('ArrowRight') || this.pressedCodes.has('KeyD');
    const up = this.pressedCodes.has('ArrowUp') || this.pressedCodes.has('KeyW');
    const down = this.pressedCodes.has('ArrowDown') || this.pressedCodes.has('KeyS');

    let x = (right ? 1 : 0) - (left ? 1 : 0);
    let y = (down ? 1 : 0) - (up ? 1 : 0);

    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }

    return { x, y };
  }

  private getDashBiasDirection(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    const keyboard = this.getKeyboardDirection();
    x += keyboard.x;
    y += keyboard.y;

    if (this.pointerDown && this.pointerMoved && this.screenToWorld) {
      const world = this.screenToWorld(this.pointerCanvasX, this.pointerCanvasY);
      const dirX = world.x - this.playerX;
      const dirY = world.y - this.playerY;
      const mag = Math.hypot(dirX, dirY);
      if (mag > 0.001) {
        x += dirX / mag;
        y += dirY / mag;
      }
    }

    const totalMag = Math.hypot(x, y);
    if (totalMag <= 0.001) return { x: 0, y: 0 };

    return { x: x / totalMag, y: y / totalMag };
  }

  private sendContextualDodge(targetWorld?: { x: number; y: number }): void {
    const bias = this.getDashBiasDirection();

    if (targetWorld) {
      let dirX = targetWorld.x - this.playerX;
      let dirY = targetWorld.y - this.playerY;
      const baseMag = Math.hypot(dirX, dirY);

      if (baseMag > 0.001) {
        dirX /= baseMag;
        dirY /= baseMag;
      } else {
        dirX = 0;
        dirY = 0;
      }

      if (bias.x !== 0 || bias.y !== 0) {
        if (baseMag > 0.001) {
          dirX = dirX * (1 - DASH_DIRECTION_BLEND) + bias.x * DASH_DIRECTION_BLEND;
          dirY = dirY * (1 - DASH_DIRECTION_BLEND) + bias.y * DASH_DIRECTION_BLEND;
        } else {
          dirX = bias.x;
          dirY = bias.y;
        }
      }

      const finalMag = Math.hypot(dirX, dirY);
      if (finalMag > 0.001) {
        const aimX = this.playerX + (dirX / finalMag) * DASH_AIM_DISTANCE;
        const aimY = this.playerY + (dirY / finalMag) * DASH_AIM_DISTANCE;
        this.client.sendDodgeTo(Math.round(aimX), Math.round(aimY));
        return;
      }
    } else if (bias.x !== 0 || bias.y !== 0) {
      const aimX = this.playerX + bias.x * DASH_AIM_DISTANCE;
      const aimY = this.playerY + bias.y * DASH_AIM_DISTANCE;
      this.client.sendDodgeTo(Math.round(aimX), Math.round(aimY));
      return;
    }

    this.client.sendDodge();
  }

  private sendDodgeWithDirection(direction: { x: number; y: number }): void {
    const mag = Math.hypot(direction.x, direction.y);
    if (mag <= 0.001) {
      this.sendContextualDodge();
      return;
    }
    const nx = direction.x / mag;
    const ny = direction.y / mag;
    const aimX = this.playerX + nx * DASH_AIM_DISTANCE;
    const aimY = this.playerY + ny * DASH_AIM_DISTANCE;
    this.client.sendDodgeTo(Math.round(aimX), Math.round(aimY));
  }

  constructor(client: GameClient, canvas: HTMLCanvasElement, screenToWorld?: (cx: number, cy: number) => { x: number; y: number }) {
    this.client = client;
    this.screenToWorld = screenToWorld;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!MOVE_KEY_CODES.has(e.code)) return;
      e.preventDefault();
      this.pressedCodes.add(e.code);
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (MOVE_KEY_CODES.has(e.code)) {
        e.preventDefault();
        this.pressedCodes.delete(e.code);
        return;
      }

      if (e.code === 'KeyE') {
        e.preventDefault();
        this.stopUltimateHold();
      }
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.repeat) return;

      if (e.code === 'KeyQ') {
        e.preventDefault();
        this.castAbility('special');
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        this.startUltimateHold();
      }
    });

    window.addEventListener('blur', () => {
      this.pressedCodes.clear();
      this.pointerDown = false;
      this.pointerId = null;
      this.pointerMoved = false;
      this.stopUltimateHold();
    });

    // Pointer events (touch / pen) — prefer pointer API when available
    if ((window as any).PointerEvent) {
      canvas.addEventListener('pointerdown', (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        this.hasPointerPosition = true;
        this.pointerDown = true;
        this.pointerId = e.pointerId;
        this.pointerType = e.pointerType || 'mouse';
        this.pointerCanvasX = canvasX;
        this.pointerCanvasY = canvasY;
        this.pointerDownTime = Date.now();
        this.pointerMoved = false;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }

        if (e.pointerType === 'mouse') {
          if (e.button === 0) {
            if (this.screenToWorld) {
              const world = this.screenToWorld(canvasX, canvasY);
              this.sendContextualDodge(world);
            } else {
              this.sendContextualDodge();
            }
          } else if (e.button === 2) {
            if (this.screenToWorld) {
              const world = this.screenToWorld(canvasX, canvasY);
              this.sendBasicAttack(world);
            } else {
              this.sendBasicAttack();
            }
          }
        }
      });

      canvas.addEventListener('pointermove', (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        this.hasPointerPosition = true;
        if (this.pointerDown && e.pointerId === this.pointerId) {
          const dx = canvasX - this.pointerCanvasX;
          const dy = canvasY - this.pointerCanvasY;
          if (Math.hypot(dx, dy) >= 6) this.pointerMoved = true;
        }
        this.pointerCanvasX = canvasX;
        this.pointerCanvasY = canvasY;
      });

      const handlePointerUp = (e: PointerEvent) => {
        if (e.pointerId !== this.pointerId) return;
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const duration = Date.now() - this.pointerDownTime;
        const pointerType = this.pointerType || e.pointerType || 'mouse';
        this.pointerDown = false;
        this.pointerId = null;
        this.pointerType = null;
        this.hasPointerPosition = true;
        this.pointerCanvasX = canvasX;
        this.pointerCanvasY = canvasY;
        if (pointerType === 'mouse') {
          return;
        }
        // If pointer didn't move significantly, treat as tap / long-press
        if (!this.pointerMoved) {
          if (duration < 350) {
            if (this.screenToWorld) {
              const world = this.screenToWorld(canvasX, canvasY);
              this.sendContextualDodge(world);
            } else {
              this.sendContextualDodge();
            }
          } else {
            if (this.screenToWorld) {
              const world = this.screenToWorld(canvasX, canvasY);
              this.sendBasicAttack(world);
            } else {
              this.sendBasicAttack();
            }
          }
        }
      };

      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointercancel', (e: PointerEvent) => {
        if (e.pointerId !== this.pointerId) return;
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        this.pointerDown = false;
        this.pointerId = null;
        this.pointerType = null;
        this.pointerMoved = false;
      });
    } else {
      // Fallback for mouse-only environments: left click = dodge, right click = attack
      canvas.addEventListener('mousedown', (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        this.hasPointerPosition = true;
        this.pointerCanvasX = canvasX;
        this.pointerCanvasY = canvasY;
        if (e.button === 0) {
          if (this.screenToWorld) {
            const world = this.screenToWorld(canvasX, canvasY);
            this.sendContextualDodge(world);
          } else {
            this.sendContextualDodge();
          }
        } else if (e.button === 2) {
          if (this.screenToWorld) {
            const world = this.screenToWorld(canvasX, canvasY);
            this.sendBasicAttack(world);
          } else {
            this.sendBasicAttack();
          }
        }
      });

      canvas.addEventListener('mousemove', (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        this.hasPointerPosition = true;
        this.pointerCanvasX = e.clientX - rect.left;
        this.pointerCanvasY = e.clientY - rect.top;
      });
    }

    // Prevent context menu on right-click inside canvas
    canvas.addEventListener('contextmenu', (e: Event) => {
      e.preventDefault();
    });

    this.update();
  }

  setPosition(x: number, y: number, force = false): void {
    if (force) {
      this.playerX = x;
      this.playerY = y;
      return;
    }

    // Keep local prediction responsive, but snap when drift is too large
    // (e.g. after authoritative server dash position changes).
    const drift = Math.hypot(x - this.playerX, y - this.playerY);
    if (drift >= AUTHORITATIVE_SNAP_DISTANCE) {
      this.playerX = x;
      this.playerY = y;
    }
  }

  updateObstacles(obstacles: Obstacle[]): void {
    this.obstacles = obstacles;
  }

  setMobileControlsEnabled(enabled: boolean): void {
    this.mobileControlsEnabled = enabled;
    if (!enabled) {
      this.mobileMoveX = 0;
      this.mobileMoveY = 0;
    }
  }

  setMobileMoveVector(x: number, y: number, magnitude: number): void {
    const clamped = Math.max(0, Math.min(1, magnitude));
    const mag = Math.hypot(x, y);
    if (mag <= 0.001 || clamped <= 0.01) {
      this.mobileMoveX = 0;
      this.mobileMoveY = 0;
      return;
    }

    const nx = x / mag;
    const ny = y / mag;
    this.mobileMoveX = nx * clamped;
    this.mobileMoveY = ny * clamped;
    this.lastMobileDirection = { x: nx, y: ny };
  }

  triggerMobileAttack(): void {
    this.sendBasicAttack({
      x: this.playerX + this.lastMobileDirection.x * DASH_AIM_DISTANCE,
      y: this.playerY + this.lastMobileDirection.y * DASH_AIM_DISTANCE,
    });
  }

  triggerMobileDodge(): void {
    this.sendDodgeWithDirection(this.lastMobileDirection);
  }

  triggerMobileSpecial(): void {
    this.castAbility('special');
  }

  triggerMobileUltimate(): void {
    this.startUltimateHold();
  }

  triggerMobileUltimateRelease(): void {
    this.stopUltimateHold();
  }

  // Called by the main loop when server state updates arrive so we know
  // whether the local player is currently dashing (server authoritative)
  setLocalAction(action: string): void {
    // no-op: we keep this handler so callers can inform us of the server-side action,
    // but local movement isn't blocked by it in this client implementation.
    void action;
  }

  private update(): void {
    let dx = 0;
    let dy = 0;

    const hasMobileMove = this.mobileControlsEnabled && Math.hypot(this.mobileMoveX, this.mobileMoveY) > 0.01;

    if (hasMobileMove) {
      dx += this.mobileMoveX * MOVE_SPEED;
      dy += this.mobileMoveY * MOVE_SPEED;
    }

    const keyboard = this.getKeyboardDirection();
    const hasKeyboardInput = !hasMobileMove && (keyboard.x !== 0 || keyboard.y !== 0);
    if (!hasMobileMove) {
      dx += keyboard.x * MOVE_SPEED;
      dy += keyboard.y * MOVE_SPEED;
    }

    // Pointer drag -> continuous movement toward pointer (touch/pen)
    let hasPointerInput = false;
    if (!this.mobileControlsEnabled && this.pointerDown && this.pointerMoved && this.screenToWorld) {
      const world = this.screenToWorld(this.pointerCanvasX, this.pointerCanvasY);
      const dirX = world.x - this.playerX;
      const dirY = world.y - this.playerY;
      const mag = Math.hypot(dirX, dirY);
      if (mag > 0.5) {
        hasPointerInput = true;
        dx += (dirX / mag) * MOVE_SPEED;
        dy += (dirY / mag) * MOVE_SPEED;
      }
    }

    // If mixed inputs almost cancel each other, keep keyboard intent to avoid
    // getting stuck while trying to combine movement controls.
    if (!hasMobileMove && hasKeyboardInput && hasPointerInput && Math.hypot(dx, dy) < MOVE_SPEED * 0.25) {
      dx = keyboard.x * MOVE_SPEED;
      dy = keyboard.y * MOVE_SPEED;
    }

    // Keep speed stable when mixing keyboard and pointer input at the same time.
    const inputMag = Math.hypot(dx, dy);
    if (inputMag > MOVE_SPEED && inputMag > 0.001) {
      const scale = MOVE_SPEED / inputMag;
      dx *= scale;
      dy *= scale;
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
