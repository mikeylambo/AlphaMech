import { T } from '../core/Tuning';
import { clamp01 } from '../core/MathUtil';

/**
 * GDD §10 — mastery and scoring, sampled per simulation tick.
 *
 * CONTROL carries the heaviest weight because rotation is Law II, and its velocity term is
 * load-bearing: without it, backing into a corner scores 100.
 *
 * INTEGRITY's denominator is read at encounter start, never hardcoded — MIRRORWORK begins at
 * 7,200 and a corrupted downside can drop that again.
 */
export type MetricKey = 'control' | 'vanish' | 'conversion' | 'flow' | 'integrity';

export const METRIC_WEIGHTS: Record<MetricKey, number> = {
  control: T.scoreWeightControl,
  vanish: T.scoreWeightVanish,
  conversion: T.scoreWeightConversion,
  flow: T.scoreWeightFlow,
  integrity: T.scoreWeightIntegrity,
};

export interface EncounterScore {
  label: string;
  control: number | null;
  vanish: number | null;
  conversion: number | null;
  flow: number | null;
  integrity: number | null;
  final: number;
  rank: Rank;
  /** Metrics excluded because their denominator was zero. */
  excluded: MetricKey[];
}

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

export function rankFor(final: number): Rank {
  if (final >= 90) return 'S';
  if (final >= 80) return 'A';
  if (final >= 70) return 'B';
  if (final >= 55) return 'C';
  return 'D';
}

export const RANK_BLURB: Record<Rank, string> = {
  S: 'THE FORMATION NEVER GOT BEHIND YOU',
  A: 'CONTROLLED. ONE OR TWO READS SHORT',
  B: 'YOU WON THE FIGHT, NOT THE GEOMETRY',
  C: 'YOU WERE SURROUNDED MORE THAN YOU WERE NOT',
  D: 'ROTATION IS THE SKILL. START THERE',
};

/** Live sampler for a single encounter. */
export class MetricsSampler {
  label = '';
  private ticks = 0;
  private controlSum = 0;
  private speedSum = 0;
  private time = 0;

  vanishableAttacks = 0;
  perfectVanishes = 0;
  staggersCreated = 0;
  staggerPunishes = 0;

  maxStructureAtStart = 9000;
  structureDamageTaken = 0;

  /** True while the encounter has any combat content at all. */
  combat = true;

  begin(label: string, maxStructure: number, combat: boolean) {
    this.label = label;
    this.ticks = 0; this.controlSum = 0; this.speedSum = 0; this.time = 0;
    this.vanishableAttacks = 0; this.perfectVanishes = 0;
    this.staggersCreated = 0; this.staggerPunishes = 0;
    this.maxStructureAtStart = maxStructure;
    this.structureDamageTaken = 0;
    this.combat = combat;
  }

  /** One simulation tick. `arc` in degrees, `speed` in m/s. */
  tick(dt: number, arcDeg: number, speed: number) {
    this.ticks++;
    this.time += dt;
    this.controlSum += arcDeg < T.arcSafe ? clamp01(speed / T.speed) : 0;
    this.speedSum += speed * dt;
  }

  noteDamage(amount: number) { this.structureDamageTaken += amount; }

  result(): EncounterScore {
    const control = this.ticks > 0 ? (this.controlSum / this.ticks) * 100 : null;
    const vanish = this.vanishableAttacks > 0 ? (this.perfectVanishes / this.vanishableAttacks) * 100 : null;
    const conversion = this.staggersCreated > 0 ? (this.staggerPunishes / this.staggersCreated) * 100 : null;
    const flow = this.time > 0 ? clamp01(this.speedSum / this.time / T.flowReferenceSpeed) * 100 : null;
    const integrity = this.maxStructureAtStart > 0 ? clamp01(1 - this.structureDamageTaken / this.maxStructureAtStart) * 100 : null;
    return finalise(this.label, { control, vanish, conversion, flow, integrity });
  }
}

/**
 * The undefined-metric rule: a metric whose denominator is zero is excluded and its weight is
 * redistributed proportionally across the rest, so FINAL still totals out of 100.
 * A missing metric is never scored as 0.
 */
export function finalise(label: string, m: Record<MetricKey, number | null>): EncounterScore {
  const present = (Object.keys(METRIC_WEIGHTS) as MetricKey[]).filter((k) => m[k] !== null);
  const excluded = (Object.keys(METRIC_WEIGHTS) as MetricKey[]).filter((k) => m[k] === null);
  const presentWeight = present.reduce((s, k) => s + METRIC_WEIGHTS[k], 0);
  let final = 0;
  if (presentWeight > 0) {
    for (const k of present) final += (m[k] as number) * (METRIC_WEIGHTS[k] / presentWeight);
  }
  return {
    label,
    control: m.control, vanish: m.vanish, conversion: m.conversion, flow: m.flow, integrity: m.integrity,
    final, rank: rankFor(final), excluded,
  };
}

/** Ranks aggregate per sector and per run (GDD §10). */
export function aggregate(scores: EncounterScore[], label: string): EncounterScore {
  if (!scores.length) return finalise(label, { control: null, vanish: null, conversion: null, flow: null, integrity: null });
  const mean = (k: MetricKey): number | null => {
    const vals = scores.map((s) => s[k]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return finalise(label, { control: mean('control'), vanish: mean('vanish'), conversion: mean('conversion'), flow: mean('flow'), integrity: mean('integrity') });
}
