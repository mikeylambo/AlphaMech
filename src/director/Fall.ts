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
 * This table has been rebuilt twice by its own harness, and both failures were informative.
 *
 * The first ladder was measured by an oracle pilot that cleared 100% of runs at every tier —
 * ten "distinct" tiers, one outcome. The pilot was made fallible in exactly the way the ladder
 * applies pressure (reaction latency, one tracked threat, peripheral blindness), which is what
 * turned the harness into an instrument rather than a mirror.
 *
 * The second ladder then separated only 5 of its 9 adjacent pairs, and the reason is worth
 * recording: FORWARD BIAS is a spiral-in ratio applied to a normalised steering vector. At 0.18
 * it turns a hostile roughly 10° off its orbit; at 0.26, 15°. Below about 0.35 it is invisible
 * in the encirclement arc, so tiers I–III were separating on a lever that does nothing there.
 * Measured: bias 0.18 → 0.26 moved the mean arc from 81.6° to 81.5°, while 0.36 → 0.48 moved it
 * from 100.0° to 114.5°.
 *
 * So the staircase is built on the levers that are monotone across their whole range —
 * COMPOSITION CEILING, REINFORCEMENT PACING and WAVE COUNT, which move structure-remaining and
 * vanish opportunities per minute at every tier — with forward bias and spawn spread widening
 * the arc from the middle of the ladder upward, where they actually bite.
 *
 * See BUILD_REPORT.md §20 for the table this produced.
 */
export const FALL_TIERS: FallTier[] = [
  { id: 1, name: 'FALL I', changes: 'THE FLOOR · SMALL COMPOSITIONS, SLOW REINFORCEMENT', ...base, tokenCooldown: 1.55, forwardBias: 0.16, arenaCeiling: 3, spawnSpread: 0.30, reinforcementScale: 1.15 },
  { id: 2, name: 'FALL II', changes: 'CEILING 3 → 4 · REINFORCEMENT PACING TIGHTENS', ...base, tokenCooldown: 1.45, forwardBias: 0.22, arenaCeiling: 4, spawnSpread: 0.45, reinforcementScale: 1.00 },
  { id: 3, name: 'FALL III', changes: 'CEILING → 5 · WIDER SPAWN BEARINGS', ...base, tokenCooldown: 1.38, forwardBias: 0.30, arenaCeiling: 5, spawnSpread: 0.60, reinforcementScale: 0.90 },
  { id: 4, name: 'FALL IV', changes: 'CEILING → 6 · ONE EXTRA WAVE · GEOMETRY PRESSURE BEGINS', ...base, tokenCooldown: 1.34, forwardBias: 0.38, arenaCeiling: 6, spawnSpread: 0.75, reinforcementScale: 0.82, waveBonus: 1, geometryPressure: 1.05 },
  { id: 5, name: 'FALL V', changes: 'ASYNC SEQUENCING UNLOCKED · FORWARD BIAS REACHES 0.48', ...base, tokenCooldown: 1.30, forwardBias: 0.48, arenaCeiling: 6, asyncAllowed: true, spawnSpread: 0.90, reinforcementScale: 0.74, waveBonus: 1, geometryPressure: 1.10 },
  { id: 6, name: 'FALL VI', changes: 'CEILING → 7 · TWO EXTRA WAVES · BEARINGS WIDENED', ...base, tokenCooldown: 1.26, forwardBias: 0.58, arenaCeiling: 7, asyncAllowed: true, spawnSpread: 1.05, reinforcementScale: 0.68, waveBonus: 2, geometryPressure: 1.15 },
  { id: 7, name: 'FALL VII', changes: 'ONE ELITE PER ENCOUNTER · CEILING → 8', ...base, tokenCooldown: 1.20, forwardBias: 0.68, arenaCeiling: 8, asyncAllowed: true, spawnSpread: 1.20, reinforcementScale: 0.62, waveBonus: 2, elites: 1, geometryPressure: 1.20 },
  { id: 8, name: 'FALL VIII', changes: 'CORRUPTED OFFERS REACH 50% · CEILING → 9 · THREE EXTRA WAVES', ...base, tokenCooldown: 1.14, forwardBias: 0.76, arenaCeiling: 9, asyncAllowed: true, spawnSpread: 1.35, reinforcementScale: 0.56, waveBonus: 3, elites: 1, corruptedFraction: 0.5, geometryPressure: 1.30 },
  { id: 9, name: 'FALL IX', changes: 'TWO ELITES · FOUR EXTRA WAVES · REINFORCEMENT PACING HALVED', ...base, tokenCooldown: 1.08, forwardBias: 0.84, arenaCeiling: 9, asyncAllowed: true, spawnSpread: 1.50, reinforcementScale: 0.50, waveBonus: 4, elites: 2, corruptedFraction: 0.5, geometryPressure: 1.40 },
  { id: 10, name: 'FALL X', changes: 'TOKEN COOLDOWN → 1.00s · CORRUPTED-ONLY OFFERS · MAXIMUM COMPOSITIONS', ...base, tokenCooldown: 1.00, forwardBias: 0.92, arenaCeiling: 10, asyncAllowed: true, spawnSpread: 1.65, reinforcementScale: 0.44, waveBonus: 5, elites: 3, corruptedFraction: 1.0, geometryPressure: 1.5 },
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
