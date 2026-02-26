import { Player, GameState, PlayerAction, WORLD_WIDTH, WORLD_HEIGHT } from '../../shared/src/types';

const MOVE_SPEED = 5;
const ACTION_COOLDOWN_MS = 500; // 500ms cooldown on attack/dodge

export class GameStateManager {
  private state: GameState = {
    players: {},
    tick: 0,
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
