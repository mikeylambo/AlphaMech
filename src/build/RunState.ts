import { RNG } from '../core/RNG';
import { ReactorId, REACTORS } from './Reactors';
import { UpgradeId, UPGRADE_IDS, UPGRADES } from './Upgrades';
import { EvolutionId, HardpointId, HARDPOINT_ORDER, evolutionFor } from './Weapons';
import { ChainSpec, selectChains } from '../director/Chains';
import { StressTag } from '../director/Encounters';
import { classify, Classification } from './Disciplines';
import { EncounterScore } from '../score/Metrics';

export interface ForgeOffer {
  upgrades: UpgradeId[];
  /** One card per un-evolved hardpoint — every currently eligible evolution, take one. */
  evolutions: { hardpoint: HardpointId; evolution: EvolutionId }[];
}

/** GDD §11 — in-run progression carried by RunState. */
export class RunState {
  seed = '';
  sector = 1;
  reactor: ReactorId = 'vector';
  upgrades: UpgradeId[] = [];
  evolutions: EvolutionId[] = [];
  evolvedHardpoints: HardpointId[] = [];
  chains: ChainSpec[] = [];
  chainIndex = 0;
  nodeIndex = 0;
  forgesTaken = 0;
  law2 = { chainAStress: 'ROTATION' as StressTag, chainBStress: 'BOOST' as StressTag, distinct: true };
  encounterScores: EncounterScore[] = [];
  /** Upgrade usage tally — THE LAST FRAME reads this in Sector 4; the results screen reads it now. */
  verbUsage: Record<string, number> = {};
  completed = false;
  victory = false;
  elapsed = 0;

  begin(seed: string, reactor: ReactorId) {
    RNG.init(seed);
    this.seed = seed;
    this.reactor = reactor;
    this.sector = 1;
    this.upgrades = [];
    this.evolutions = [];
    this.evolvedHardpoints = [];
    this.chainIndex = 0;
    this.nodeIndex = 0;
    this.forgesTaken = 0;
    this.encounterScores = [];
    this.verbUsage = {};
    this.completed = false;
    this.victory = false;
    this.elapsed = 0;
    const sel = selectChains(this.sector, null);
    this.chains = [sel.chains[0], sel.chains[1]];
    this.law2 = sel.law2;
  }

  get currentChain() { return this.chains[this.chainIndex]; }
  get previousChainStress(): StressTag | null { return this.chainIndex > 0 ? this.chains[this.chainIndex - 1].dominantStress : null; }
  get maxStructure() { return REACTORS[this.reactor].structure; }
  get classification(): Classification { return classify(this.upgrades, this.evolutions); }

  hasUpgrade(id: UpgradeId) { return this.upgrades.includes(id); }
  hasEvolution(id: EvolutionId) { return this.evolutions.includes(id); }

  /**
   * A FORGE offers three upgrade cards (take one) and a weapon evolution row showing every
   * currently eligible evolution — one card per un-evolved hardpoint (take one).
   * FORGE 1 therefore shows four evolution cards and FORGE 2 shows three.
   */
  rollOffer(): ForgeOffer {
    const rng = RNG.stream('offers');
    const pool = UPGRADE_IDS.filter((id) => !this.upgrades.includes(id));
    const picked: UpgradeId[] = [];
    // Spread the three cards across verbs where possible, so a FORGE reads as a real decision
    // rather than three flavours of the same axis.
    const byVerb = new Map<string, UpgradeId[]>();
    for (const id of pool) {
      const v = UPGRADES[id].verb;
      const a = byVerb.get(v) ?? [];
      a.push(id);
      byVerb.set(v, a);
    }
    const verbs = rng.shuffle([...byVerb.keys()]);
    for (const v of verbs) {
      if (picked.length >= 3) break;
      const options = byVerb.get(v)!;
      picked.push(options[Math.floor(rng.next() * options.length)]);
    }
    const rest = rng.shuffle(pool.filter((id) => !picked.includes(id)));
    while (picked.length < 3 && rest.length) picked.push(rest.pop()!);

    const evolutions = HARDPOINT_ORDER
      .filter((h) => !this.evolvedHardpoints.includes(h))
      .map((h) => ({ hardpoint: h, evolution: evolutionFor(h).id }));

    return { upgrades: picked, evolutions };
  }

  takeUpgrade(id: UpgradeId) {
    if (!this.upgrades.includes(id)) this.upgrades.push(id);
    const v = UPGRADES[id].verb;
    this.verbUsage[v] = (this.verbUsage[v] ?? 0) + 1;
  }

  takeEvolution(id: EvolutionId, hardpoint: HardpointId) {
    if (!this.evolutions.includes(id)) this.evolutions.push(id);
    if (!this.evolvedHardpoints.includes(hardpoint)) this.evolvedHardpoints.push(hardpoint);
  }

  snapshot() {
    return {
      seed: this.seed,
      streamCursors: RNG.cursors(),
      streamStates: RNG.states(),
      sector: this.sector,
      chainId: this.currentChain?.id ?? null,
      chainName: this.currentChain?.name ?? null,
      nodeIndex: this.nodeIndex,
      previousChainStress: this.previousChainStress,
      chainLaw2: this.law2,
    };
  }
}
