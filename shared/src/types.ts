export type PlayerAction = 'idle' | 'move' | 'attack' | 'dodge';

export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1200;

export type ObstacleType = 'tomb' | 'dead_tree' | 'dry_branch';
// Add 'lake' as a new obstacle type for scenario features
export type ExtendedObstacleType = ObstacleType | 'lake' | 'bush';

export interface Obstacle {
  id: number;
  type: ExtendedObstacleType;
  x: number;
  y: number;
  // optional size for elliptical obstacles (like lakes)
  rx?: number;
  ry?: number;
  // optional shape hint: 'ellipse' | 'irregular'
  shape?: string;
}

export interface Player {
  id: string;
  nickname: string;
  x: number;
  y: number;
  action: PlayerAction;
  spriteVariant: number; // 0-3 for different sprite variations
  // Character design assigned by server (one of: 'ghost','bat','cat','vampire','zombie','medusa','sphynx')
  design?: string;
  // Index into client palette (SPRITE_COLORS)
  colorIdx?: number;
  lastActionTime: number;
}

export interface GameState {
  players: Record<string, Player>;
  tick: number;
  obstacles: Obstacle[];
}

// Client -> Server events
export interface PlayerJoinEvent {
  type: 'player_join';
  nickname: string;
}

export interface PlayerMoveEvent {
  type: 'player_move';
  x: number;
  y: number;
}

export interface PlayerAttackEvent {
  type: 'player_attack';
}

export interface PlayerDodgeEvent {
  type: 'player_dodge';
  // Optional target world coordinates for a dash towards the mouse
  x?: number;
  y?: number;
}

export interface ChatMessageEvent {
  type: 'chat_message';
  text: string;
}

export type ClientToServerEvent = 
  | PlayerJoinEvent 
  | PlayerMoveEvent 
  | PlayerAttackEvent 
  | PlayerDodgeEvent 
  | ChatMessageEvent;

// Server -> Client events
export interface GameStateUpdateEvent {
  type: 'game_state_update';
  state: GameState;
}

export interface PlayerJoinedEvent {
  type: 'player_joined';
  player: Player;
}

export interface PlayerLeftEvent {
  type: 'player_left';
  playerId: string;
}

export interface ChatBroadcastEvent {
  type: 'chat_broadcast';
  playerId: string;
  nickname: string;
  text: string;
  timestamp: number;
}

export interface ServerFullEvent {
  type: 'server_full';
}

export interface JoinSuccessEvent {
  type: 'join_success';
  playerId: string;
  state: GameState;
}

export type ServerToClientEvent = 
  | GameStateUpdateEvent 
  | PlayerJoinedEvent 
  | PlayerLeftEvent 
  | ChatBroadcastEvent 
  | ServerFullEvent 
  | JoinSuccessEvent;
