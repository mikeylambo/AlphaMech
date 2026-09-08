import { MechPalette } from '../entities/Materials';

/**
 * GDD §7. Every value here is quoted from the design document; nothing is invented.
 * Attack weights are explicit percentages — the "lunge, lunge, sweep" of earlier drafts was
 * weighting, not a typo.
 */
export type AttackId = 'volley' | 'lance' | 'lunge' | 'sweep' | 'mortar' | 'strafe-run' | 'mine-drop' | 'shield-advance' | 'quake';

export interface AttackSpec {
  id: AttackId;
  label: string;
  windup: number;
  recovery: number;
  telegraph: number;   // radius, m
  damage: number;
  impact: number;
  /** How the strike resolves. Behaviour column of GDD §7. */
  kind: 'burst' | 'beam' | 'melee' | 'arc' | 'aoe' | 'pass' | 'mine' | 'advance';
  notes: string;
}

export const ATTACKS: Record<AttackId, AttackSpec> = {
  volley: { id: 'volley', label: 'VOLLEY', windup: 0.90, recovery: 0.60, telegraph: 12, damage: 210, impact: 95, kind: 'burst', notes: '3-round burst, light spread' },
  lance: { id: 'lance', label: 'LANCE', windup: 1.50, recovery: 1.00, telegraph: 9, damage: 430, impact: 190, kind: 'beam', notes: 'sustained beam, 0.24s' },
  lunge: { id: 'lunge', label: 'LUNGE', windup: 0.75, recovery: 0.85, telegraph: 15, damage: 380, impact: 260, kind: 'melee', notes: 'closes to 13m, melee swing' },
  sweep: { id: 'sweep', label: 'SWEEP', windup: 0.60, recovery: 0.70, telegraph: 19, damage: 300, impact: 330, kind: 'arc', notes: 'wide arc, tightest read in the roster' },
  mortar: { id: 'mortar', label: 'MORTAR', windup: 1.30, recovery: 0.90, telegraph: 26, damage: 340, impact: 150, kind: 'aoe', notes: 'arcing, lands at telegraph centre' },
  'strafe-run': { id: 'strafe-run', label: 'STRAFE RUN', windup: 1.10, recovery: 0.70, telegraph: 14, damage: 250, impact: 120, kind: 'pass', notes: 'airborne pass, fires along the run' },
  'mine-drop': { id: 'mine-drop', label: 'MINE DROP', windup: 0.80, recovery: 0.65, telegraph: 10, damage: 280, impact: 180, kind: 'mine', notes: 'arms after 0.55s · 10m trigger · persists 8.0s' },
  'shield-advance': { id: 'shield-advance', label: 'SHIELD ADVANCE', windup: 1.10, recovery: 0.90, telegraph: 22, damage: 260, impact: 300, kind: 'advance', notes: 'advances 22m behind the frontal shield; contact damage along the path' },
  quake: { id: 'quake', label: 'QUAKE', windup: 1.60, recovery: 1.20, telegraph: 34, damage: 480, impact: 420, kind: 'aoe', notes: 'ground shock, radius grows over the windup' },
};

/** Mine Drop specifics (GDD §7). */
export const MINE = { armTime: 0.55, trigger: 10, life: 8.0 };
/** Shield Advance specifics (GDD §7). */
export const SHIELD_ADVANCE = { distance: 22, speed: 30 };

export type ArchetypeId = 'lancer' | 'brawler' | 'sentry' | 'harrier' | 'warden' | 'relay';
export type BossId = 'severance';

export interface Archetype {
  id: ArchetypeId;
  name: string;
  structure: number;
  impactMax: number;
  band: readonly [number, number];
  speed: number;
  accel: number;
  scale: number;
  /** Attack ids paired with their selection weights (percentages, GDD §7). */
  attacks: { id: AttackId; weight: number }[];
  /** HARRIER never lands. */
  flying: boolean;
  cruiseAltitude: number;
  /** WARDEN's frontal shield: breaks only to a Perfect Vanish punish or a pile driver from above. */
  frontalShield: boolean;
  palette: MechPalette;
  chassis: 'standard' | 'heavy' | 'drone' | 'ace';
}

const P = (armor: number, armor2: number, dark: number, metal: number, joint: number, accent: number, glow: number): MechPalette =>
  ({ armor, armor2, dark, metal, joint, accent, glow });

/** Hostiles are desaturated and low-value; the player is the only saturated thing on screen
 *  (GDD §12, the silhouette contract). Each archetype still owns a distinct accent hue so the
 *  roster reads at a glance in a five-way fight. */
export const ARCHETYPE_PALETTES: Record<ArchetypeId, MechPalette> = {
  lancer: P(0x4a4038, 0x2a2420, 0x181513, 0x6e655c, 0x241f1b, 0xff7a4c, 0xff8a5c),
  brawler: P(0x494a3a, 0x2a2b22, 0x171812, 0x6d6e5e, 0x232419, 0xc8e05a, 0xd8f06a),
  sentry: P(0x3a4048, 0x22262b, 0x14171a, 0x646b74, 0x1e2226, 0x7ba8e0, 0x8fc0ff),
  harrier: P(0x4a4450, 0x2a2630, 0x16141a, 0x6b6674, 0x221f28, 0xc07aff, 0xd08aff),
  warden: P(0x413f3a, 0x262522, 0x151413, 0x6a675f, 0x201f1c, 0xffc247, 0xffd06a),
  relay: P(0x33404a, 0x1e262c, 0x12171a, 0x5f6b74, 0x1c2226, 0x4ad0c0, 0x5ae8d4),
};

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  lancer: {
    id: 'lancer', name: 'LANCER', structure: 3400, impactMax: 620, band: [95, 175], speed: 44, accel: 130, scale: 1.0,
    attacks: [{ id: 'volley', weight: 50 }, { id: 'lance', weight: 50 }],
    flying: false, cruiseAltitude: 0, frontalShield: false, palette: ARCHETYPE_PALETTES.lancer, chassis: 'standard',
  },
  brawler: {
    id: 'brawler', name: 'BRAWLER', structure: 4200, impactMax: 820, band: [14, 52], speed: 66, accel: 210, scale: 0.94,
    attacks: [{ id: 'lunge', weight: 67 }, { id: 'sweep', weight: 33 }],
    flying: false, cruiseAltitude: 0, frontalShield: false, palette: ARCHETYPE_PALETTES.brawler, chassis: 'standard',
  },
  sentry: {
    id: 'sentry', name: 'SENTRY', structure: 5200, impactMax: 1050, band: [55, 120], speed: 36, accel: 100, scale: 1.12,
    attacks: [{ id: 'volley', weight: 50 }, { id: 'mortar', weight: 50 }],
    flying: false, cruiseAltitude: 0, frontalShield: false, palette: ARCHETYPE_PALETTES.sentry, chassis: 'standard',
  },
  harrier: {
    id: 'harrier', name: 'HARRIER', structure: 2600, impactMax: 480, band: [40, 90], speed: 82, accel: 240, scale: 0.9,
    attacks: [{ id: 'strafe-run', weight: 50 }, { id: 'mine-drop', weight: 50 }],
    flying: true, cruiseAltitude: 34, frontalShield: false, palette: ARCHETYPE_PALETTES.harrier, chassis: 'drone',
  },
  /**
   * RELAY — a formation unit, not a duellist. It is only dangerous while it is part of a
   * screen; isolated, it is the flimsiest frame in the roster. Introduced here as GRAVEMARK's
   * escort, and standing as a standard archetype for the 1.0 roster: one unit of work, two
   * purposes.
   */
  relay: {
    id: 'relay', name: 'RELAY', structure: 1800, impactMax: 400, band: [40, 90], speed: 58, accel: 190, scale: 0.86,
    attacks: [{ id: 'volley', weight: 70 }, { id: 'mine-drop', weight: 30 }],
    flying: false, cruiseAltitude: 0, frontalShield: false, palette: ARCHETYPE_PALETTES.relay, chassis: 'standard',
  },
  warden: {
    id: 'warden', name: 'WARDEN', structure: 7800, impactMax: 1900, band: [30, 70], speed: 28, accel: 90, scale: 1.0,
    attacks: [{ id: 'shield-advance', weight: 50 }, { id: 'quake', weight: 50 }],
    flying: false, cruiseAltitude: 0, frontalShield: true, palette: ARCHETYPE_PALETTES.warden, chassis: 'heavy',
  },
};

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as ArchetypeId[];
