import { RNG } from '../core/RNG';
import { EncounterId, ENCOUNTERS, StressTag } from './Encounters';
import { ReactorId } from '../build/Reactors';

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
 *
 * v0.3 introduces the RC brief's four chain TYPES (§2.6). A sector's pool is 7 standard, 2 rare,
 * 1 reactor-specific and 1 secret. The types change which chains are ELIGIBLE, never the laws:
 * every chain below still passes Law 1 and Law 4, and Law 2 still operates on the state.
 */
export type TissueId = 'CONDUIT' | 'OPEN FALL' | 'BREACH' | 'DIRECT';

/**
 * Standard chains are always eligible. Rare ones are drawn at a lower weight. Reactor chains
 * only appear when running that reactor and are built around its identity. Secret chains require
 * a condition to reach.
 */
export type ChainKind = 'standard' | 'rare' | 'reactor' | 'secret';

/** What a secret chain asks of the run before it will appear. */
export type SecretCondition = 'previous-s-rank' | 'untouched-structure' | 'prototype-held';

export interface ChainSpec {
  id: string;
  name: string;
  sequence: EncounterId[];
  dominantStress: StressTag;
  /** Connective tissue between sequence[i] and sequence[i+1]. */
  tissue: TissueId[];
  sector: number;
  kind: ChainKind;
  /** Set on reactor-specific chains. */
  reactor?: ReactorId;
  /** Set on secret chains. */
  condition?: SecretCondition;
  /** One line on what this chain is for. Shown on the run banner. */
  note?: string;
}

/**
 * ============================================================================================
 * THE CHAIN POOL
 *
 * Sector 1 keeps the Alpha's four, which are the four the onboarding and every existing gate
 * are measured against. Sector 2 ships the RC brief's full complement of eleven.
 *
 * Sector 2's chains are written around what MANUFACTURE is for: OBJECTIVE exists here, the
 * volumes are vertical, and the machines move. Every sequence below uses that rather than being
 * Sector 1's shapes with a different fog colour.
 * ============================================================================================
 */
export const CHAIN_POOL: ChainSpec[] = [
  // -------------------------------------------------------------------------------- SECTOR 1
  { id: 'opening-gambit', name: 'OPENING GAMBIT', sequence: ['TRAVERSAL', 'ARENA'], dominantStress: 'ROTATION', tissue: ['CONDUIT'], sector: 1, kind: 'standard' },
  { id: 'intercept', name: 'INTERCEPT', sequence: ['TRAVERSAL', 'PURSUIT', 'DUEL'], dominantStress: 'BOOST', tissue: ['CONDUIT', 'OPEN FALL'], sector: 1, kind: 'standard' },
  { id: 'pressure-cooker', name: 'PRESSURE COOKER', sequence: ['ARENA', 'STORM', 'ARENA'], dominantStress: 'ROTATION', tissue: ['OPEN FALL', 'CONDUIT'], sector: 1, kind: 'standard' },
  { id: 'long-way-down-a', name: 'LONG WAY DOWN α', sequence: ['TRAVERSAL', 'HUNT', 'ARENA'], dominantStress: 'ALTITUDE', tissue: ['CONDUIT', 'OPEN FALL'], sector: 1, kind: 'standard' },

  // ------------------------------------------------------------- SECTOR 2 · seven standard
  { id: 's2-cold-start', name: 'COLD START', sequence: ['TRAVERSAL', 'ARENA'], dominantStress: 'ROTATION', tissue: ['CONDUIT'], sector: 2, kind: 'standard',
    note: 'the sector introduces itself: one run down the line, one formation at the end of it' },
  { id: 's2-the-floor', name: 'THE FLOOR', sequence: ['OBJECTIVE', 'ARENA'], dominantStress: 'ROTATION', tissue: ['CONDUIT'], sector: 2, kind: 'standard',
    note: 'something worth holding, and then nothing worth holding' },
  { id: 's2-pour-line', name: 'POUR LINE', sequence: ['PURSUIT', 'OBJECTIVE'], dominantStress: 'BOOST', tissue: ['OPEN FALL'], sector: 2, kind: 'standard',
    note: 'chase the line down, then stand on it' },
  { id: 's2-stack-run', name: 'STACK RUN', sequence: ['TRAVERSAL', 'HUNT', 'OBJECTIVE'], dominantStress: 'ALTITUDE', tissue: ['CONDUIT', 'OPEN FALL'], sector: 2, kind: 'standard',
    note: 'up through the cooling stacks, then back down to something that cannot follow' },
  { id: 's2-annealing', name: 'ANNEALING', sequence: ['STORM', 'DUEL'], dominantStress: 'BOOST', tissue: ['CONDUIT'], sector: 2, kind: 'standard',
    note: 'the arena is theirs, and then it is one of theirs' },
  { id: 's2-two-shifts', name: 'TWO SHIFTS', sequence: ['ARENA', 'OBJECTIVE', 'DUEL'], dominantStress: 'ROTATION', tissue: ['CONDUIT', 'OPEN FALL'], sector: 2, kind: 'standard',
    note: 'the full working day' },
  { id: 's2-quench', name: 'QUENCH', sequence: ['HUNT', 'PURSUIT'], dominantStress: 'ALTITUDE', tissue: ['OPEN FALL'], sector: 2, kind: 'standard',
    note: 'they take the air, so you take the floor' },

  // ------------------------------------------------------------------- SECTOR 2 · two rare
  { id: 's2-full-tilt', name: 'FULL TILT', sequence: ['OBJECTIVE', 'STORM', 'ARENA'], dominantStress: 'ROTATION', tissue: ['OPEN FALL', 'CONDUIT'], sector: 2, kind: 'rare',
    note: 'three volumes, no quiet one' },
  { id: 's2-the-long-shift', name: 'THE LONG SHIFT', sequence: ['PURSUIT', 'HUNT', 'OBJECTIVE'], dominantStress: 'BOOST', tissue: ['CONDUIT', 'OPEN FALL'], sector: 2, kind: 'rare',
    note: 'every axis in one chain: the floor, the air, and the thing you must not drop' },

  // -------------------------------------------------------- SECTOR 2 · one reactor-specific
  /**
   * BREAKER is the slow chassis whose impact never decays, so its chain is built the way that
   * frame wants a fight: two consecutive holds where withdrawing is expensive and every point of
   * pressure you land is still there when you come back to it. On any other reactor this chain
   * does not exist.
   */
  { id: 's2-anvil-shift', name: 'ANVIL SHIFT', sequence: ['OBJECTIVE', 'ARENA'], dominantStress: 'STAGGER', tissue: ['CONDUIT'], sector: 2, kind: 'reactor', reactor: 'breaker',
    note: 'BREAKER only — nothing you land here ever drains away, so nothing here lets you leave' },

  // ------------------------------------------------------------------ SECTOR 2 · one secret
  /**
   * Reachable only on an untouched structure bar. It is the sector's reward for a clean sector,
   * and it is deliberately the hardest sequence in the pool: three volumes, no traversal, and
   * an OBJECTIVE at the end when you are already tired.
   */
  { id: 's2-the-clean-line', name: 'THE CLEAN LINE', sequence: ['DUEL', 'ARENA', 'OBJECTIVE'], dominantStress: 'VANISH', tissue: ['CONDUIT', 'CONDUIT'], sector: 2, kind: 'secret', condition: 'untouched-structure',
    note: 'SECRET — reached on an untouched structure bar. It does not intend to leave it that way' },
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

/** Every state a chain names must already exist at this depth (§3, `fromSector`). */
export function statesExistAt(chain: ChainSpec, sector: number): boolean {
  return chain.sequence.every((s) => sector >= ENCOUNTERS[s].fromSector);
}

/** What the run can currently prove about itself, for secret-chain gating. */
export interface RunContext {
  reactor: ReactorId;
  /** True when the previous encounter was ranked S. */
  previousSRank: boolean;
  /** True when the player has not lost structure this run. */
  untouchedStructure: boolean;
  /** True when a PROTOTYPE upgrade is held. Always false until v0.5 ships them. */
  prototypeHeld: boolean;
}

export const DEFAULT_RUN_CONTEXT: RunContext = {
  reactor: 'vector', previousSRank: false, untouchedStructure: true, prototypeHeld: false,
};

function conditionMet(c: SecretCondition, run: RunContext): boolean {
  switch (c) {
    case 'previous-s-rank': return run.previousSRank;
    case 'untouched-structure': return run.untouchedStructure;
    case 'prototype-held': return run.prototypeHeld;
  }
}

/** Is this chain reachable at all, for this sector and this run? */
export function eligible(chain: ChainSpec, sector: number, run: RunContext): boolean {
  if (chain.sector !== sector) return false;
  if (!obeysLaw1(chain, sector) || !obeysLaw4(chain, sector) || !statesExistAt(chain, sector)) return false;
  if (chain.kind === 'reactor') return chain.reactor === run.reactor;
  if (chain.kind === 'secret') return !!chain.condition && conditionMet(chain.condition, run);
  return true;
}

/** Draw weights by type. Rare is rare; a reactor or secret chain that is reachable is special. */
const WEIGHT: Record<ChainKind, number> = { standard: 10, rare: 3, reactor: 5, secret: 6 };

export interface ChainSelection {
  chains: [ChainSpec, ChainSpec];
  /** Filled in for __state() so Chain Law 2 is verifiable at runtime. */
  law2: { chainAStress: StressTag; chainBStress: StressTag; distinct: boolean };
}

/**
 * The seed picks two chains for the sector. Chain A has no previous-chain constraint;
 * Chain B's dominant stress must differ from Chain A's (Law 2).
 */
export function selectChains(sector: number, previousChainStress: StressTag | null = null, run: RunContext = DEFAULT_RUN_CONTEXT): ChainSelection {
  const rng = RNG.stream('chains');
  let legal = CHAIN_POOL.filter((c) => eligible(c, sector, run));
  // A sector with no authored pool falls back to Sector 1's, which is what the lifecycle proof
  // chains three instances of. Better a legal repeat than an empty descent.
  if (!legal.length) legal = CHAIN_POOL.filter((c) => eligible(c, 1, run));

  const draw = (pool: ChainSpec[]) => rng.weighted(pool, pool.map((c) => WEIGHT[c.kind]));
  const aPool = previousChainStress ? legal.filter((c) => c.dominantStress !== previousChainStress) : legal;
  const a = draw(aPool.length ? aPool : legal);
  const bPool = legal.filter((c) => c.dominantStress !== a.dominantStress && c.id !== a.id);
  // Law 2 is a hard constraint; the pool is authored so a legal partner always exists.
  const fallback = legal.filter((c) => c.id !== a.id);
  const b = draw(bPool.length ? bPool : fallback.length ? fallback : legal);
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

/** Pool census, for the content audit (tools/content.mjs). */
export function chainCensus(sector: number) {
  const pool = CHAIN_POOL.filter((c) => c.sector === sector);
  return {
    sector,
    total: pool.length,
    standard: pool.filter((c) => c.kind === 'standard').length,
    rare: pool.filter((c) => c.kind === 'rare').length,
    reactor: pool.filter((c) => c.kind === 'reactor').length,
    secret: pool.filter((c) => c.kind === 'secret').length,
    law1: pool.every((c) => obeysLaw1(c, sector)),
    law4: pool.every((c) => obeysLaw4(c, sector)),
    statesExist: pool.every((c) => statesExistAt(c, sector)),
  };
}
