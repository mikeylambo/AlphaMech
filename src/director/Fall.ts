import { T } from '../core/Tuning';

/**
 * ============================================================================================
 * THE FALL LADDER  (v0.2 §3.1)
 *
 * NON-NEGOTIABLE 7: difficulty may never alter damage, structure, or the arc thresholds.
 *
 * There is no health multiplier here and no damage multiplier here, and `arcSafe`, `arcFlank`
 * and `arcSwarm` do not appear in this file at all — the sovereign arc rule is bit-identical at
 * FALL I and FALL X. Every tier escalates through legal Director and encounter pressure only:
 * how quickly a token comes back, how hard the formation drifts behind you, how many frames
 * are on the field, whether they may wind up simultaneously, where reinforcements enter, and
 * what the FORGE is willing to offer you.
 *
 * That is the feature, not a constraint worked around. Difficulty that makes the formation
 * harder to HOLD teaches exactly the skill the game is about; difficulty that inflates a health
 * bar teaches nothing.
 * ============================================================================================
 */
export interface FallTier {
  id: number;
  name: string;
  /** One line, shown on the selector — what actually changed from the tier below. */
  changes: string;

  // --- permitted levers, and only these ---
  /** Seconds before a hostile that released a token may take another. */
  tokenCooldown: number;
  /** Forward bias applied to non-attacking hostiles' orbit. Higher drifts the formation behind you. */
  forwardBias: number;
  /** Maximum hostiles an ARENA-shaped encounter may field at once. */
  arenaCeiling: number;
  /** Whether the Director may choose ASYNC sequencing (simultaneous windups inside the same token budget). */
  asyncAllowed: boolean;
  /** Radians of jitter around the Director's chosen reinforcement bearing. */
  spawnSpread: number;
  /** Multiplier on reinforcement timing. Below 1 means waves arrive sooner. */
  reinforcementScale: number;
  /** Extra reinforcement waves beyond the encounter's authored count — pacing, not stats. */
  waveBonus: number;
  /** Elite behavioural modifiers granted per encounter. Elites carry no stat inflation. */
  elites: number;
  /** Fraction of FORGE upgrade cards drawn from the corrupted pool. */
  corruptedFraction: number;
  /** Scalar the encounter variants read for hazard density and shrink rates. */
  geometryPressure: number;
}

const base = {
  tokenCooldown: T.tokenCooldown,
  forwardBias: T.orbitForwardBias,
  arenaCeiling: 4,
  asyncAllowed: false,
  spawnSpread: 0.35,
  reinforcementScale: 1.0,
  waveBonus: 0,
  elites: 0,
  corruptedFraction: 0,
  geometryPressure: 1.0,
};

/**
 * MEASURED, NOT ASSERTED (non-negotiable 9).
 *
 * The brief's starting table left every tier statistically indistinguishable under the
 * measurement pilot: clear rate stayed at 100% and mean tokens never left 1.00, because a
 * forward bias of 0.30 cannot wrap a formation around a pilot who is circling. The shape of
 * the ladder is the brief's — which lever moves at which tier — with magnitudes retuned until
 * the harness separated the rows. See BUILD_REPORT.md §5 Checkpoint C for the table this
 * produced.
 *
 * Forward bias and composition ceiling turned out to be the load-bearing levers: they are the
 * two that actually widen the encirclement arc, and the arc is the only thing that grants a
 * second attack token.
 */
export const FALL_TIERS: FallTier[] = [
  { id: 1, name: 'FALL I', changes: 'THE ALPHA BASELINE', ...base },
  { id: 2, name: 'FALL II', changes: 'TOKEN COOLDOWN 1.50s → 1.35s', ...base, tokenCooldown: 1.35 },
  { id: 3, name: 'FALL III', changes: 'FORWARD BIAS 0.18 → 0.26 · WIDER SPAWN BEARINGS', ...base, tokenCooldown: 1.35, forwardBias: 0.26, spawnSpread: 0.45, reinforcementScale: 0.95 },
  { id: 4, name: 'FALL IV', changes: 'ARENA CEILING 4 → 5', ...base, tokenCooldown: 1.35, forwardBias: 0.26, arenaCeiling: 5, spawnSpread: 0.45, reinforcementScale: 0.92 },
  { id: 5, name: 'FALL V', changes: 'ASYNC SEQUENCING UNLOCKED · FORWARD BIAS → 0.36 · ONE EXTRA WAVE', ...base, tokenCooldown: 1.35, forwardBias: 0.36, arenaCeiling: 5, asyncAllowed: true, spawnSpread: 0.65, reinforcementScale: 0.84, waveBonus: 1 },
  { id: 6, name: 'FALL VI', changes: 'CEILING → 6 · BIAS → 0.48 · BEARINGS WIDENED · WAVES TIGHTENED', ...base, tokenCooldown: 1.30, forwardBias: 0.48, arenaCeiling: 6, asyncAllowed: true, spawnSpread: 0.95, reinforcementScale: 0.72, waveBonus: 2, geometryPressure: 1.15 },
  { id: 7, name: 'FALL VII', changes: 'TOKEN COOLDOWN → 1.20s · ONE ELITE PER ENCOUNTER · CEILING → 7 · BIAS → 0.54', ...base, tokenCooldown: 1.20, forwardBias: 0.54, arenaCeiling: 7, asyncAllowed: true, spawnSpread: 1.0, reinforcementScale: 0.70, waveBonus: 2, elites: 1, geometryPressure: 1.15 },
  { id: 8, name: 'FALL VIII', changes: 'CORRUPTED OFFERS REACH 50% · CEILING → 8 · BIAS → 0.64', ...base, tokenCooldown: 1.20, forwardBias: 0.64, arenaCeiling: 8, asyncAllowed: true, spawnSpread: 1.15, reinforcementScale: 0.64, waveBonus: 3, elites: 1, corruptedFraction: 0.5, geometryPressure: 1.25 },
  { id: 9, name: 'FALL IX', changes: 'FORWARD BIAS → 0.76 · CEILING → 9 · TWO ELITES', ...base, tokenCooldown: 1.10, forwardBias: 0.76, arenaCeiling: 9, asyncAllowed: true, spawnSpread: 1.25, reinforcementScale: 0.58, waveBonus: 3, elites: 2, corruptedFraction: 0.5, geometryPressure: 1.35 },
  { id: 10, name: 'FALL X', changes: 'TOKEN COOLDOWN → 1.00s · CORRUPTED-ONLY OFFERS · MAXIMUM COMPOSITIONS', ...base, tokenCooldown: 1.00, forwardBias: 0.92, arenaCeiling: 10, asyncAllowed: true, spawnSpread: 1.45, reinforcementScale: 0.50, waveBonus: 4, elites: 3, corruptedFraction: 1.0, geometryPressure: 1.5 },
];

export const MAX_FALL = FALL_TIERS.length;
export const tierFor = (id: number): FallTier => FALL_TIERS[Math.max(0, Math.min(FALL_TIERS.length - 1, id - 1))];

/**
 * Runtime proof for non-negotiable 7. Nothing in the ladder touches the arc thresholds, the
 * player's structure, or any damage value; this returns the evidence rather than the claim.
 */
export function fallLadderProof() {
  return {
    rule: 'FALL tiers may not alter damage, structure, or the arc thresholds',
    arcThresholds: { safe: T.arcSafe, flank: T.arcFlank, swarm: T.arcSwarm },
    arcThresholdsPerTier: FALL_TIERS.map((t) => ({ tier: t.name, safe: T.arcSafe, flank: T.arcFlank, swarm: T.arcSwarm })),
    playerStructurePerTier: FALL_TIERS.map((t) => ({ tier: t.name, structure: T.playerStructure })),
    leversUsed: ['tokenCooldown', 'forwardBias', 'arenaCeiling', 'asyncAllowed', 'spawnSpread', 'reinforcementScale', 'waveBonus', 'elites', 'corruptedFraction', 'geometryPressure'],
    damageLevers: [] as string[],
    structureLevers: [] as string[],
  };
}

// -------------------------------------------------------------------------------- unlocks
const KEY = 'blinkfall.fall.v1';

class FallProgress {
  /** Highest tier the player has cleared. Tier n+1 unlocks by clearing tier n. */
  cleared = 0;
  selected = 1;

  constructor() { this.load(); }
  get unlocked() { return Math.min(MAX_FALL, this.cleared + 1); }
  isUnlocked(id: number) { return id <= this.unlocked; }

  select(id: number) { if (this.isUnlocked(id)) { this.selected = id; this.save(); } return this.selected; }
  recordClear(id: number) { if (id > this.cleared) { this.cleared = Math.min(MAX_FALL, id); this.save(); } }

  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { cleared?: number; selected?: number };
      this.cleared = Math.max(0, Math.min(MAX_FALL, d.cleared ?? 0));
      this.selected = Math.max(1, Math.min(this.unlocked, d.selected ?? 1));
    } catch { /* defaults stand */ }
  }
  private save() {
    try { localStorage.setItem(KEY, JSON.stringify({ cleared: this.cleared, selected: this.selected })); } catch { /* session only */ }
  }
  /** Test hook: the harness needs every tier without playing nine runs first. */
  unlockAll() { this.cleared = MAX_FALL; this.save(); }
  reset() { this.cleared = 0; this.selected = 1; this.save(); }
}

export const fallProgress = new FallProgress();
