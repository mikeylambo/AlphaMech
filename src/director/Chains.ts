import { RNG } from '../core/RNG';
import { EncounterId, ENCOUNTERS, StressTag } from './Encounters';

/**
 * GDD §4 — chains are 2-3 encounter states plus connective tissue, played without interruption,
 * ending at a FORGE or a boss.
 *
 * Chain laws
 *  1. No state repeats back-to-back, except ARENA -> ARENA, available from Sector 3.
 *  2. A chain's dominant stress must differ from the previous chain's dominant stress.
 *     Chain A of Sector 1 has no previous-chain constraint.
 *  3. Every chain ends at a decision point.
 *  4. DIRECT connective tissue is Sector 4 only.
 */
export type TissueId = 'CONDUIT' | 'OPEN FALL' | 'BREACH' | 'DIRECT';

export interface ChainSpec {
  id: string;
  name: string;
  sequence: EncounterId[];
  dominantStress: StressTag;
  /** Connective tissue between sequence[i] and sequence[i+1]. */
  tissue: TissueId[];
  sector: number;
}

/** Tonight's Sector 1 pool. Exactly the four chains named in the build brief. */
export const CHAIN_POOL: ChainSpec[] = [
  { id: 'opening-gambit', name: 'OPENING GAMBIT', sequence: ['TRAVERSAL', 'ARENA'], dominantStress: 'ROTATION', tissue: ['CONDUIT'], sector: 1 },
  { id: 'intercept', name: 'INTERCEPT', sequence: ['TRAVERSAL', 'PURSUIT', 'DUEL'], dominantStress: 'BOOST', tissue: ['CONDUIT', 'OPEN FALL'], sector: 1 },
  { id: 'pressure-cooker', name: 'PRESSURE COOKER', sequence: ['ARENA', 'STORM', 'ARENA'], dominantStress: 'ROTATION', tissue: ['OPEN FALL', 'CONDUIT'], sector: 1 },
  { id: 'long-way-down-a', name: 'LONG WAY DOWN α', sequence: ['TRAVERSAL', 'HUNT', 'ARENA'], dominantStress: 'ALTITUDE', tissue: ['CONDUIT', 'OPEN FALL'], sector: 1 },
];

/** Chain Law 1 — no state repeats back-to-back before Sector 3, ARENA included. */
export function obeysLaw1(chain: ChainSpec, sector: number): boolean {
  for (let i = 1; i < chain.sequence.length; i++) {
    if (chain.sequence[i] === chain.sequence[i - 1]) {
      if (!(chain.sequence[i] === 'ARENA' && sector >= 3)) return false;
    }
  }
  return true;
}

/** Chain Law 4 — DIRECT tissue is Sector 4 only. */
export function obeysLaw4(chain: ChainSpec, sector: number): boolean {
  return sector >= 4 || !chain.tissue.includes('DIRECT');
}

export interface ChainSelection {
  chains: [ChainSpec, ChainSpec];
  /** Filled in for __state() so Chain Law 2 is verifiable at runtime. */
  law2: { chainAStress: StressTag; chainBStress: StressTag; distinct: boolean };
}

/**
 * The seed picks two chains for the sector. Chain A has no previous-chain constraint;
 * Chain B's dominant stress must differ from Chain A's (Law 2).
 */
export function selectChains(sector: number, previousChainStress: StressTag | null = null): ChainSelection {
  const rng = RNG.stream('chains');
  const legal = CHAIN_POOL.filter((c) => c.sector === sector && obeysLaw1(c, sector) && obeysLaw4(c, sector));
  const aPool = previousChainStress ? legal.filter((c) => c.dominantStress !== previousChainStress) : legal;
  const a = rng.pick(aPool.length ? aPool : legal);
  const bPool = legal.filter((c) => c.dominantStress !== a.dominantStress && c.id !== a.id);
  // Law 2 is a hard constraint; the pool is authored so a legal partner always exists.
  const b = rng.pick(bPool.length ? bPool : legal.filter((c) => c.id !== a.id));
  return {
    chains: [a, b],
    law2: { chainAStress: a.dominantStress, chainBStress: b.dominantStress, distinct: a.dominantStress !== b.dominantStress },
  };
}

/** Node-level stress, read straight from the encounter table — never inferred. */
export function nodeStress(id: EncounterId): { primary: StressTag; secondary: StressTag } {
  const e = ENCOUNTERS[id];
  return { primary: e.primaryStress, secondary: e.secondaryStress };
}
