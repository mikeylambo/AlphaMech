import { ArchetypeId } from '../enemies/Archetypes';

/**
 * GDD §3 — eight encounter states with **authored** stress metadata. The generator never infers
 * meaning from a state; it reads it from this table.
 */
export type StressTag = 'ROTATION' | 'BOOST' | 'VANISH' | 'LOCK' | 'STAGGER' | 'EN' | 'ALTITUDE';
export type EncounterId = 'ARENA' | 'DUEL' | 'STORM' | 'PURSUIT' | 'HUNT' | 'OBJECTIVE' | 'COLOSSUS' | 'TRAVERSAL';

export interface EncounterSpec {
  id: EncounterId;
  shape: string;
  primaryStress: StressTag;
  secondaryStress: StressTag;
  /** Volume the world builder lays down for this state. */
  volume: 'arena' | 'corridor' | 'shaft';
  /** Hostile count range and the archetypes eligible to fill it. */
  hostiles: [number, number];
  pool: ArchetypeId[];
  /** Reinforcement waves after the opening spawn. */
  waves: number;
  /**
   * The first sector this state may appear in. OBJECTIVE arrives with Sector 2's manufacturing
   * volumes, which are the first places in the descent that contain something worth holding;
   * COLOSSUS waits for Sector 3, where the war machines are.
   */
  fromSector: number;
  brief: string;
}

export const ENCOUNTERS: Record<EncounterId, EncounterSpec> = {
  ARENA: {
    id: 'ARENA', shape: '3-5 peers, full director', primaryStress: 'ROTATION', secondaryStress: 'LOCK',
    volume: 'arena', hostiles: [3, 5], pool: ['lancer', 'brawler', 'sentry', 'harrier', 'warden'], waves: 1, fromSector: 1,
    brief: 'HOLD THE FORMATION IN FRONT OF YOU',
  },
  DUEL: {
    id: 'DUEL', shape: 'one opponent, no adds', primaryStress: 'VANISH', secondaryStress: 'STAGGER',
    volume: 'arena', hostiles: [1, 1], pool: ['brawler', 'lancer', 'warden'], waves: 0, fromSector: 1,
    brief: 'ONE FRAME. READ THE WINDUP',
  },
  STORM: {
    id: 'STORM', shape: '1-2 enemies owning the arena with patterns', primaryStress: 'BOOST', secondaryStress: 'EN',
    volume: 'arena', hostiles: [1, 2], pool: ['sentry', 'warden'], waves: 0, fromSector: 1,
    brief: 'THE ARENA IS THEIRS. TAKE IT BACK',
  },
  PURSUIT: {
    id: 'PURSUIT', shape: 'continuous combat down a streamed corridor', primaryStress: 'BOOST', secondaryStress: 'LOCK',
    volume: 'corridor', hostiles: [2, 3], pool: ['harrier', 'lancer', 'brawler'], waves: 2, fromSector: 1,
    brief: 'KEEP MOVING. THEY WILL NOT STOP',
  },
  HUNT: {
    id: 'HUNT', shape: 'flying enemies only, vertical arena', primaryStress: 'ALTITUDE', secondaryStress: 'LOCK',
    volume: 'shaft', hostiles: [3, 4], pool: ['harrier'], waves: 1, fromSector: 1,
    brief: 'ALTITUDE IS THE AXIS',
  },
  OBJECTIVE: {
    id: 'OBJECTIVE', shape: 'defend / intercept / destroy under interference', primaryStress: 'ROTATION', secondaryStress: 'STAGGER',
    volume: 'arena', hostiles: [3, 5], pool: ['lancer', 'sentry', 'splitter', 'hook', 'warden'], waves: 2, fromSector: 2,
    brief: 'HOLD THE POINT',
  },
  COLOSSUS: {
    id: 'COLOSSUS', shape: 'the environment is the enemy', primaryStress: 'ALTITUDE', secondaryStress: 'BOOST',
    volume: 'shaft', hostiles: [0, 2], pool: ['harrier'], waves: 0, fromSector: 3,
    brief: 'THE STRUCTURE IS FIGHTING YOU',
  },
  TRAVERSAL: {
    id: 'TRAVERSAL', shape: 'pure piloting, environmental damage, no combat', primaryStress: 'BOOST', secondaryStress: 'EN',
    volume: 'corridor', hostiles: [0, 0], pool: [], waves: 0, fromSector: 1,
    brief: 'FLY IT CLEAN',
  },
};

export const statesForSector = (sector: number): EncounterId[] =>
  (Object.keys(ENCOUNTERS) as EncounterId[]).filter((k) => sector >= ENCOUNTERS[k].fromSector);

export const SECTOR1_STATES: EncounterId[] = statesForSector(1);

/**
 * Sector 2's roster additions, applied on top of a state's authored pool.
 *
 * SPLITTER and HOOK are MANUFACTURE natives: one forces target switching, the other argues with
 * your position. They are added to the states whose questions they sharpen rather than to
 * everything — a DUEL against a SPLITTER would just be two duels, and a HUNT is airborne.
 */
export const SECTOR2_POOL: Partial<Record<EncounterId, ArchetypeId[]>> = {
  ARENA: ['splitter', 'hook'],
  PURSUIT: ['hook'],
  STORM: ['splitter'],
  OBJECTIVE: ['splitter', 'hook'],
};

/** The archetypes eligible in this state at this depth. Authored pool first, never replaced. */
export function poolFor(id: EncounterId, sector: number): ArchetypeId[] {
  const base = ENCOUNTERS[id].pool;
  if (sector < 2) return base;
  const extra = (SECTOR2_POOL[id] ?? []).filter((a) => !base.includes(a));
  return [...base, ...extra];
}
