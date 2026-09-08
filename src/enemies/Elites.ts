import { RNG } from '../core/RNG';

/**
 * ELITE MODIFIERS.
 *
 * Non-negotiable 7 forbids difficulty from altering damage or structure, so an elite here is
 * never "the same frame with more health". Every modifier changes BEHAVIOUR — where the frame
 * stands, how the formation orients around it, how quickly it re-engages, what it opens with.
 * That is both legal and better: a spongy elite teaches nothing, and a frame that drags the
 * formation behind you teaches exactly the skill the game is about.
 */
export type EliteId = 'anchor' | 'relentless' | 'screened' | 'vectored' | 'phased';

export interface EliteModifier {
  id: EliteId;
  name: string;
  /** What the player is being asked to do differently. */
  blurb: string;
  /**
   * While this frame lives, the rest of the formation holds its bearings APART, so the
   * encirclement arc resists closing. Fed into the same bearing-separation term FLANK DEBT uses.
   *
   * This was `cohesion` — other hostiles biased their orbit TOWARD the elite, tightening the
   * formation around it. It read well and it did the opposite of what its own card promises:
   * clustering the formation narrows the span it subtends from the pilot, which LOWERS the arc
   * and therefore lowers the attack-token budget. Measured over six seeds on one composition,
   * the same fight with an ANCHOR present ran at a mean arc of 86.7 degrees against 92.8 without
   * it — so the elite that arrives at FALL VII to make the tier harder was making it easier, and
   * the ladder's VI -> VII clear rate inverted in both v0.2 and v0.3.
   */
  separation: number;
  /** Multiplier on post-attack recovery. Below 1 re-engages sooner. Never touches damage. */
  recoveryScale: number;
  /** Grants the WARDEN frontal-shield rule to a frame that would not have it. */
  frontalShield: boolean;
  /** Multiplier on orbit speed — a wider, faster circle drags the arc open. */
  orbitScale: number;
  /** Biases attack selection toward the tightest read in the frame's own table. */
  tightestRead: boolean;
}

export const ELITES: Record<EliteId, EliteModifier> = {
  anchor: {
    id: 'anchor', name: 'ANCHOR', blurb: 'the formation orients on it — break the anchor or the arc never closes',
    separation: 1.6, recoveryScale: 1, frontalShield: false, orbitScale: 1, tightestRead: false,
  },
  relentless: {
    id: 'relentless', name: 'RELENTLESS', blurb: 're-engages before you have finished the punish',
    separation: 0, recoveryScale: 0.55, frontalShield: false, orbitScale: 1.1, tightestRead: false,
  },
  screened: {
    id: 'screened', name: 'SCREENED', blurb: 'frontal shield — only a vanish punish or a driver from above gets through',
    separation: 0, recoveryScale: 1, frontalShield: true, orbitScale: 0.9, tightestRead: false,
  },
  vectored: {
    id: 'vectored', name: 'VECTORED', blurb: 'orbits wide and fast, dragging the arc open behind you',
    separation: 0, recoveryScale: 1, frontalShield: false, orbitScale: 1.55, tightestRead: false,
  },
  phased: {
    id: 'phased', name: 'PHASED', blurb: 'opens with the tightest read in its table, every time',
    separation: 0, recoveryScale: 0.85, frontalShield: false, orbitScale: 1, tightestRead: true,
  },
};

export const ELITE_IDS = Object.keys(ELITES) as EliteId[];

/** Seeded elite selection — never Math.random(). */
export function pickElite(): EliteModifier {
  return ELITES[RNG.stream('spawn').pick(ELITE_IDS)];
}
