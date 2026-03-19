export type PlayerAction = 'idle' | 'move' | 'attack' | 'dodge' | 'special' | 'ultimate';

export type AbilitySlot = 'basic' | 'dodge' | 'special' | 'ultimate';
export type PlayerRole = 'vanguard' | 'assassin' | 'chaos' | 'arcane_bruiser' | 'sustain_fighter' | 'sustain_mage' | 'pending';
export type StatusKind = 'bleed' | 'golden_armor' | 'cat_rage' | 'petrify' | 'slow' | 'hidden' | 'vampire_puddle';
export type EnemyTier = 'normal' | 'medium' | 'high' | 'boss';

export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 2400;
export const VISIBILITY_RADIUS = 980;

export type CreepDesign = 'ghost' | 'bat' | 'cat' | 'vampire' | 'zombie' | 'medusa' | 'sphynx';
export type EnemyType = 'skeleton' | 'ghoul' | 'gravekeeper' | 'gargoyle';

export interface CooldownState {
  slot: AbilitySlot;
  durationMs: number;
  expiresAtMs: number;
}

export interface ActiveStatus {
  id: string;
  kind: StatusKind;
  sourcePlayerId?: string;
  remainingMs: number;
  tickIntervalMs?: number;
  tickTimerMs?: number;
  value?: number;
}

export interface AbilityCastState {
  slot: AbilitySlot;
  startedAtMs: number;
  castDurationMs: number;
  targetX?: number;
  targetY?: number;
}

export interface Summon {
  id: string;
  ownerPlayerId: string;
  type: 'sphynx_pyramid';
  x: number;
  y: number;
  createdAtMs: number;
  lifeMs: number;
  data?: {
    pullRadius?: number;
    missileRadius?: number;
    pullStrength?: number;
    missileDamage?: number;
    missileIntervalMs?: number;
    missileTimerMs?: number;
  };
}

export interface Enemy {
  id: string;
  type: EnemyType;
  isBoss: boolean;
  tier: EnemyTier;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  homeX: number;
  homeY: number;
  speed: number;
  maxHealth: number;
  health: number;
  aggroRange: number;
  attackRange: number;
  damage: number;
  attackCooldownMs: number;
  lastAttackTime: number;
  activeStatuses?: ActiveStatus[];
}

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
  // Character design assigned by server
  design: CreepDesign;
  // Index into client palette (SPRITE_COLORS)
  colorIdx: number;
  maxHealth: number;
  health: number;
  statDamage: number;
  statSpeed: number;
  statDodge: number;
  lastActionTime: number;
  role: PlayerRole;
  activeCooldowns: Record<AbilitySlot, CooldownState | null>;
  activeStatuses: ActiveStatus[];
  castState: AbilityCastState | null;
}

export interface GameState {
  players: Record<string, Player>;
  enemies: Record<string, Enemy>;
  summons: Record<string, Summon>;
  totalPlayers: number;
  tick: number;
  obstacles: Obstacle[];
  visibilityRadius: number;
}

// Client -> Server events
export interface PlayerJoinEvent {
  type: 'player_join';
  nickname: string;
  creepDesign?: CreepDesign;
}

export interface PlayerMoveEvent {
  type: 'player_move';
  x: number;
  y: number;
}

export interface PlayerAttackEvent {
  type: 'player_attack';
  x?: number;
  y?: number;
}

export interface PlayerDodgeEvent {
  type: 'player_dodge';
  // Optional target world coordinates for a dash towards the mouse
  x?: number;
  y?: number;
}

export interface AbilityCastEvent {
  type: 'ability_cast';
  slot: AbilitySlot;
  x?: number;
  y?: number;
}

export interface AbilityHoldEvent {
  type: 'ability_hold';
  slot: AbilitySlot;
  isHolding: boolean;
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
  | AbilityCastEvent
  | AbilityHoldEvent
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
