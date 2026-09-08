import { Axis, UPGRADES, UpgradeId } from './Upgrades';
import { EVOLUTIONS, EvolutionId } from './Weapons';

/**
 * GDD §8.4 — build disciplines are emergent, not selected.
 *
 * "Score taken upgrades across the four verbs plus a geometry axis. Match to nearest discipline;
 * if no axis exceeds 55% of the total, generate a hybrid name from the two strongest."
 *
 * The end screen leads with the discipline, not the score.
 */
export const AXES: Axis[] = ['BOOST', 'VANISH', 'LOCK', 'STAGGER', 'GEOMETRY'];

export interface Discipline {
  id: string;
  name: string;
  feelsLike: string;
  /** Affinity over the five axes, derived from the discipline's core upgrades. */
  affinity: Partial<Record<Axis, number>>;
  core: string[];
}

export const DISCIPLINES: Discipline[] = [
  { id: 'ghost', name: 'GHOST FRAME', feelsLike: 'a teleporting assassination mech', affinity: { VANISH: 3, LOCK: 1 }, core: ['Mirror Chassis', 'Echo Split', 'Blind Angle', 'Chain Read'] },
  { id: 'kinetic', name: 'KINETIC FRAME', feelsLike: 'a combat racing game', affinity: { BOOST: 3.5, GEOMETRY: 0.5 }, core: ['Rail Core', 'Kinetic Bank', 'Slipstream', 'Momentum Railgun'] },
  { id: 'gravity', name: 'GRAVITY FRAME', feelsLike: 'positioning enemies is the weapon', affinity: { GEOMETRY: 3, STAGGER: 2, BOOST: 1 }, core: ['Gravity Thrusters', 'Singularity Engine', 'Cascade Break', 'Anchor Driver'] },
  { id: 'contrail', name: 'CONTRAIL FRAME', feelsLike: 'you draw prisons around enemies', affinity: { BOOST: 3, GEOMETRY: 3 }, core: ['Contrail Weave', 'Ground Effect', 'Overburn', 'Mine Lattice'] },
  { id: 'breaker', name: 'BREAKER FRAME', feelsLike: 'you win by stagger economy', affinity: { STAGGER: 4 }, core: ['Overpressure', 'Execution Protocol', 'Fault Line', 'Shared Fault'] },
];

/** Axis vocabulary for hybrid naming. Each axis owns one word. */
const AXIS_WORD: Record<Axis, string> = {
  BOOST: 'KINETIC',
  VANISH: 'GHOST',
  LOCK: 'PREDATOR',
  STAGGER: 'BREAKER',
  GEOMETRY: 'GRAVITY',
};

export interface Classification {
  name: string;
  feelsLike: string;
  hybrid: boolean;
  scores: Record<Axis, number>;
  shares: Record<Axis, number>;
  dominant: Axis;
  dominantShare: number;
  matchedDiscipline: string | null;
}

const HYBRID_FEEL: Record<string, string> = {
  'GHOST-BREAKER': 'you appear where the frame is already broken',
  'BREAKER-GHOST': 'you appear where the frame is already broken',
  'GHOST-KINETIC': 'the blink is just the fastest part of the run',
  'KINETIC-GHOST': 'the blink is just the fastest part of the run',
  'KINETIC-BREAKER': 'you arrive at speed and something comes apart',
  'BREAKER-KINETIC': 'you arrive at speed and something comes apart',
  'GHOST-PREDATOR': 'you never lose the frame you decided to kill',
  'PREDATOR-GHOST': 'you never lose the frame you decided to kill',
  'KINETIC-PREDATOR': 'the lock holds while the world blurs',
  'PREDATOR-KINETIC': 'the lock holds while the world blurs',
  'PREDATOR-BREAKER': 'attention is the pressure and the break is the payment',
  'BREAKER-PREDATOR': 'attention is the pressure and the break is the payment',
};

/**
 * Classify a build. `upgrades` and `evolutions` are what the player actually took.
 * An empty build classifies as the baseline chassis rather than a nonsense hybrid.
 */
export function classify(upgrades: UpgradeId[], evolutions: EvolutionId[]): Classification {
  const scores: Record<Axis, number> = { BOOST: 0, VANISH: 0, LOCK: 0, STAGGER: 0, GEOMETRY: 0 };
  for (const id of upgrades) for (const [a, w] of Object.entries(UPGRADES[id].axes)) scores[a as Axis] += w as number;
  for (const id of evolutions) for (const [a, w] of Object.entries(EVOLUTIONS[id].axes)) scores[a as Axis] += w as number;

  const total = AXES.reduce((s, a) => s + scores[a], 0);
  const shares = {} as Record<Axis, number>;
  for (const a of AXES) shares[a] = total > 0 ? scores[a] / total : 0;

  const ranked = [...AXES].sort((a, b) => scores[b] - scores[a]);
  const dominant = ranked[0];
  const dominantShare = shares[dominant];

  if (total === 0) {
    return { name: 'UNWRITTEN FRAME', feelsLike: 'the chassis you were handed, unchanged', hybrid: false, scores, shares, dominant, dominantShare, matchedDiscipline: null };
  }

  // No axis above 55% of the total -> hybrid from the two strongest.
  if (dominantShare <= 0.55) {
    const a = AXIS_WORD[ranked[0]], b = AXIS_WORD[ranked[1]];
    const key = `${a}-${b}`;
    return {
      name: `${a}-${b} FRAME`,
      feelsLike: HYBRID_FEEL[key] ?? 'two disciplines sharing one machine',
      hybrid: true, scores, shares, dominant, dominantShare, matchedDiscipline: null,
    };
  }

  // Otherwise: nearest authored discipline by cosine similarity over the axis vector.
  let best = DISCIPLINES[0], bestSim = -1;
  for (const d of DISCIPLINES) {
    let dot = 0, na = 0, nb = 0;
    for (const a of AXES) {
      const x = scores[a], y = d.affinity[a] ?? 0;
      dot += x * y; na += x * x; nb += y * y;
    }
    const sim = dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
    if (sim > bestSim) { bestSim = sim; best = d; }
  }
  return { name: best.name, feelsLike: best.feelsLike, hybrid: false, scores, shares, dominant, dominantShare, matchedDiscipline: best.id };
}
