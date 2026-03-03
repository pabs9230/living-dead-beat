export type PlayerAction = 'idle' | 'move' | 'attack' | 'dodge';

export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const OBSTACLES: Obstacle[] = [
  { x: 70,  y: 70,  width: 34, height: 50 },
  { x: 180, y: 90,  width: 34, height: 50 },
  { x: 310, y: 60,  width: 34, height: 50 },
  { x: 450, y: 80,  width: 34, height: 50 },
  { x: 600, y: 65,  width: 34, height: 50 },
  { x: 720, y: 95,  width: 34, height: 50 },
  { x: 110, y: 250, width: 34, height: 50 },
  { x: 270, y: 220, width: 34, height: 50 },
  { x: 440, y: 260, width: 34, height: 50 },
  { x: 640, y: 240, width: 34, height: 50 },
  { x: 90,  y: 430, width: 34, height: 50 },
  { x: 260, y: 400, width: 34, height: 50 },
  { x: 430, y: 450, width: 34, height: 50 },
  { x: 600, y: 410, width: 34, height: 50 },
  { x: 730, y: 460, width: 34, height: 50 },
];

export interface Player {
  id: string;
  nickname: string;
  x: number;
  y: number;
  action: PlayerAction;
  spriteVariant: number; // 0-3 for different sprite variations
  lastActionTime: number;
}

export interface GameState {
  players: Record<string, Player>;
  tick: number;
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
