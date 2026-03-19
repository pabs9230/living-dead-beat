import { CreepDesign } from './types';

export interface CreepStatsProfile {
  maxHealth: number;
  damage: number;
  speed: number;
  dodge: number;
}

export const CREEP_DESIGNS: CreepDesign[] = [
  'ghost',
  'bat',
  'cat',
  'vampire',
  'zombie',
  'medusa',
  'sphynx',
];

export const CREEP_STATS: Record<CreepDesign, CreepStatsProfile> = {
  ghost: { maxHealth: 75, damage: 16, speed: 22, dodge: 24 },
  bat: { maxHealth: 62, damage: 18, speed: 28, dodge: 26 },
  cat: { maxHealth: 80, damage: 17, speed: 24, dodge: 20 },
  vampire: { maxHealth: 92, damage: 21, speed: 21, dodge: 17 },
  zombie: { maxHealth: 118, damage: 23, speed: 14, dodge: 10 },
  medusa: { maxHealth: 88, damage: 20, speed: 18, dodge: 16 },
  sphynx: { maxHealth: 96, damage: 19, speed: 20, dodge: 18 },
};

export function isCreepDesign(value: unknown): value is CreepDesign {
  return typeof value === 'string' && CREEP_DESIGNS.includes(value as CreepDesign);
}

export function randomCreepDesign(): CreepDesign {
  return CREEP_DESIGNS[Math.floor(Math.random() * CREEP_DESIGNS.length)];
}
