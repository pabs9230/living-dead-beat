import { AbilitySlot, CooldownState, CreepDesign, PlayerRole } from './types';

export interface AbilitySpec {
  id: string;
  slot: AbilitySlot;
  cooldownMs: number;
  castMs: number;
  range: number;
  description: string;
}

export interface CreepCombatKit {
  role: PlayerRole;
  abilities: Record<AbilitySlot, AbilitySpec>;
}

export const CREEP_KITS: Record<CreepDesign, CreepCombatKit> = {
  sphynx: {
    role: 'vanguard',
    abilities: {
      basic: {
        id: 'sphynx_stone_slam',
        slot: 'basic',
        cooldownMs: 850,
        castMs: 100,
        range: 74,
        description: 'Melee telekinetic stone drop with medium damage.',
      },
      dodge: {
        id: 'sphynx_short_leap',
        slot: 'dodge',
        cooldownMs: 5500,
        castMs: 60,
        range: 88,
        description: 'Short defensive leap.',
      },
      special: {
        id: 'sphynx_golden_armor',
        slot: 'special',
        cooldownMs: 25000,
        castMs: 120,
        range: 0,
        description: 'Reduce incoming damage by 2/3 for 15 seconds.',
      },
      ultimate: {
        id: 'sphynx_pyramid_legion',
        slot: 'ultimate',
        cooldownMs: 20000,
        castMs: 160,
        range: 540,
        description: 'Place a pyramid that pulls enemies and launches fire missiles.',
      },
    },
  },
  cat: {
    role: 'assassin',
    abilities: {
      basic: {
        id: 'cat_claw_slash',
        slot: 'basic',
        cooldownMs: 520,
        castMs: 60,
        range: 66,
        description: 'Quick melee claw slash.',
      },
      dodge: {
        id: 'cat_long_pounce',
        slot: 'dodge',
        cooldownMs: 7000,
        castMs: 70,
        range: 178,
        description: 'Long leap that lightly damages crossed targets.',
      },
      special: {
        id: 'cat_double_claw',
        slot: 'special',
        cooldownMs: 4000,
        castMs: 90,
        range: 66,
        description: 'Two rapid claw strikes.',
      },
      ultimate: {
        id: 'cat_rage_instinct',
        slot: 'ultimate',
        cooldownMs: 60000,
        castMs: 120,
        range: 0,
        description: 'Rage mode for 15 seconds with bleed and burst synergy.',
      },
    },
  },
  zombie: {
    role: 'chaos',
    abilities: {
      basic: {
        id: 'zombie_headbutt',
        slot: 'basic',
        cooldownMs: 900,
        castMs: 80,
        range: 64,
        description: 'Low damage melee headbutt.',
      },
      dodge: {
        id: 'zombie_stumble',
        slot: 'dodge',
        cooldownMs: 10000,
        castMs: 80,
        range: 120,
        description: 'Trip forward and crawl while hidden from non-boss enemies.',
      },
      special: {
        id: 'zombie_adrenaline',
        slot: 'special',
        cooldownMs: 40000,
        castMs: 100,
        range: 0,
        description: 'Increase damage, speed, and dodge-heal scaling.',
      },
      ultimate: {
        id: 'zombie_pandemic',
        slot: 'ultimate',
        cooldownMs: 120000,
        castMs: 180,
        range: 180,
        description: 'Infective bite that can spawn temporary zombies on kills.',
      },
    },
  },
  medusa: {
    role: 'arcane_bruiser',
    abilities: {
      basic: {
        id: 'medusa_serpent_bite',
        slot: 'basic',
        cooldownMs: 760,
        castMs: 70,
        range: 74,
        description: 'Hair-serpent bite attack.',
      },
      dodge: {
        id: 'medusa_serpent_burrow',
        slot: 'dodge',
        cooldownMs: 6500,
        castMs: 900,
        range: 450,
        description: 'Burrow and reappear, crossing obstacles and damaging on emerge.',
      },
      special: {
        id: 'medusa_snake_ground',
        slot: 'special',
        cooldownMs: 12000,
        castMs: 1000,
        range: 105,
        description: 'Frontal ground-snake strike after 1 second cast, damaging all targets in front.',
      },
      ultimate: {
        id: 'medusa_gorgon_gaze',
        slot: 'ultimate',
        cooldownMs: 35000,
        castMs: 500,
        range: 220,
        description: 'Cone petrify with tier-scaled control duration.',
      },
    },
  },
  vampire: {
    role: 'sustain_fighter',
    abilities: {
      basic: {
        id: 'vampire_blood_slash',
        slot: 'basic',
        cooldownMs: 720,
        castMs: 70,
        range: 72,
        description: 'Melee blood blade slash.',
      },
      dodge: {
        id: 'vampire_blood_puddle',
        slot: 'dodge',
        cooldownMs: 20000,
        castMs: 60,
        range: 92,
        description: 'Turn into blood puddle for sustain over time.',
      },
      special: {
        id: 'vampire_blood_flux',
        slot: 'special',
        cooldownMs: 6000,
        castMs: 100,
        range: 240,
        description: 'Drain target blood and heal based on dealt damage.',
      },
      ultimate: {
        id: 'vampire_beast_bat_form',
        slot: 'ultimate',
        cooldownMs: 60000,
        castMs: 140,
        range: 0,
        description: 'Beast bat form for 20 seconds with amplified sustain and damage.',
      },
    },
  },
  bat: {
    role: 'sustain_mage',
    abilities: {
      basic: {
        id: 'bat_drain_bite',
        slot: 'basic',
        cooldownMs: 900,
        castMs: 90,
        range: 82,
        description: 'Latch bite with channel drain and self-heal.',
      },
      dodge: {
        id: 'bat_dash_flight',
        slot: 'dodge',
        cooldownMs: 5800,
        castMs: 55,
        range: 170,
        description: 'Fast flight dash through obstacles.',
      },
      special: {
        id: 'bat_sonic_paralysis',
        slot: 'special',
        cooldownMs: 10000,
        castMs: 140,
        range: 1760,
        description: 'Large area paralysis for 2 seconds.',
      },
      ultimate: {
        id: 'bat_blood_fury_trance',
        slot: 'ultimate',
        cooldownMs: 30000,
        castMs: 5000,
        range: 2080,
        description: 'Wide blood aura drain and partial conversion to self-heal.',
      },
    },
  },
  ghost: {
    role: 'pending',
    abilities: {
      basic: {
        id: 'ghost_pending_basic',
        slot: 'basic',
        cooldownMs: 700,
        castMs: 50,
        range: 70,
        description: 'Pending implementation.',
      },
      dodge: {
        id: 'ghost_pending_dodge',
        slot: 'dodge',
        cooldownMs: 6000,
        castMs: 50,
        range: 120,
        description: 'Pending implementation.',
      },
      special: {
        id: 'ghost_pending_special',
        slot: 'special',
        cooldownMs: 10000,
        castMs: 100,
        range: 160,
        description: 'Pending implementation.',
      },
      ultimate: {
        id: 'ghost_pending_ultimate',
        slot: 'ultimate',
        cooldownMs: 45000,
        castMs: 150,
        range: 200,
        description: 'Pending implementation.',
      },
    },
  },
};

export function createEmptyCooldowns(): Record<AbilitySlot, CooldownState | null> {
  return {
    basic: null,
    dodge: null,
    special: null,
    ultimate: null,
  };
}
