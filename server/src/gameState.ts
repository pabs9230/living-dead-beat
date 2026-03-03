import { Player, GameState, PlayerAction, WORLD_WIDTH, WORLD_HEIGHT, Obstacle, ObstacleType } from '../../shared/src/types';

const MOVE_SPEED = 5;
const ACTION_COOLDOWN_MS = 500; // 500ms cooldown on attack/dodge

// Collision half-sizes per obstacle type (axis-aligned bounding boxes)
const OBSTACLE_HALF_W: Record<ObstacleType, number> = { tomb: 14, dead_tree: 12, dry_branch: 20 };
const OBSTACLE_HALF_H: Record<ObstacleType, number> = { tomb: 20, dead_tree: 12, dry_branch: 6 };

// Player collision half-sizes
const PLAYER_HALF_W = 14;
const PLAYER_HALF_H = 20;

// Obstacle placement constants
const OBSTACLE_PLACEMENT_MARGIN = 60;
const OBSTACLE_CENTER_CLEAR_RADIUS = 80; // keep the center start area clear
const MAX_PLACEMENT_ATTEMPTS_MULTIPLIER = 20;

function generateObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = [];
  let id = 0;

  const spawn = (type: ObstacleType, count: number) => {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * MAX_PLACEMENT_ATTEMPTS_MULTIPLIER) {
      attempts++;
      const x = OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_WIDTH - OBSTACLE_PLACEMENT_MARGIN * 2);
      const y = OBSTACLE_PLACEMENT_MARGIN + Math.random() * (WORLD_HEIGHT - OBSTACLE_PLACEMENT_MARGIN * 2);
      // Avoid spawning obstacles in the center starting area
      if (Math.abs(x - WORLD_WIDTH / 2) < OBSTACLE_CENTER_CLEAR_RADIUS &&
          Math.abs(y - WORLD_HEIGHT / 2) < OBSTACLE_CENTER_CLEAR_RADIUS) continue;
      obstacles.push({ id: id++, type, x: Math.round(x), y: Math.round(y) });
      placed++;
    }
  };

  spawn('tomb', 18);
  spawn('dead_tree', 14);
  spawn('dry_branch', 24);

  return obstacles;
}

function overlapsObstacle(px: number, py: number, obstacle: Obstacle): boolean {
  const hw = OBSTACLE_HALF_W[obstacle.type];
  const hh = OBSTACLE_HALF_H[obstacle.type];
  return (
    px + PLAYER_HALF_W > obstacle.x - hw &&
    px - PLAYER_HALF_W < obstacle.x + hw &&
    py + PLAYER_HALF_H > obstacle.y - hh &&
    py - PLAYER_HALF_H < obstacle.y + hh
  );
}

export class GameStateManager {
  private state: GameState = {
    players: {},
    tick: 0,
    obstacles: generateObstacles(),
  };

  addPlayer(player: Player): void {
    this.state.players[player.id] = player;
  }

  removePlayer(playerId: string): void {
    delete this.state.players[playerId];
  }

  getPlayer(playerId: string): Player | undefined {
    return this.state.players[playerId];
  }

  updatePlayerPosition(playerId: string, x: number, y: number): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;

    // Validate coordinates are within world bounds
    const clampedX = Math.max(0, Math.min(WORLD_WIDTH, x));
    const clampedY = Math.max(0, Math.min(WORLD_HEIGHT, y));

    // Validate movement speed (anti-cheat: max distance per update)
    const dx = clampedX - player.x;
    const dy = clampedY - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > MOVE_SPEED * 10) {
      return false; // Reject teleport
    }

    // Check obstacle collision
    for (const obstacle of this.state.obstacles) {
      if (overlapsObstacle(clampedX, clampedY, obstacle)) {
        return false;
      }
    }

    player.x = clampedX;
    player.y = clampedY;
    player.action = 'move';
    return true;
  }

  setPlayerAction(playerId: string, action: PlayerAction): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;

    const now = Date.now();
    if (action === 'attack' || action === 'dodge') {
      if (now - player.lastActionTime < ACTION_COOLDOWN_MS) {
        return false; // Rate limit
      }
      player.lastActionTime = now;
    }

    player.action = action;
    return true;
  }

  setPlayerIdle(playerId: string): void {
    const player = this.state.players[playerId];
    if (player && player.action === 'move') {
      player.action = 'idle';
    }
  }

  getState(): GameState {
    return this.state;
  }

  incrementTick(): void {
    this.state.tick++;
  }

  getPlayerCount(): number {
    return Object.keys(this.state.players).length;
  }
}
