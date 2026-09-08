import { RNG } from '../core/RNG';
import { ReactorId, REACTORS } from './Reactors';
import { UpgradeId, UPGRADE_IDS, UPGRADES } from './Upgrades';
import { EvolutionId, HardpointId, HARDPOINT_ORDER, offeredEvolution } from './Weapons';
import { ChainSpec, selectChains } from '../director/Chains';
import { StressTag } from '../director/Encounters';
import { classify, Classification } from './Disciplines';
import { CorruptedOffer, DOWNSIDE_IDS, DownsideId } from './Corrupted';
import { FallTier, tierFor } from '../director/Fall';
import { EncounterScore } from '../score/Metrics';
import { settings, Assists, DEFAULT_ASSISTS, assistsAreDefault } from '../core/Settings';

/** A FORGE upgrade card is either clean or corrupted; corrupted carries exactly one downside. */
export interface UpgradeCard {
  id: UpgradeId;
  corrupted: CorruptedOffer | null;
}

export interface ForgeOffer {
  upgrades: UpgradeCard[];
  /** One card per un-evolved hardpoint — every currently eligible evolution, take one. */
  evolutions: { hardpoint: HardpointId; evolution: EvolutionId }[];
}

/** GDD §11 — in-run progression carried by RunState. */
export class RunState {
  seed = '';
  sector = 1;
  /** How many sectors this run plays. 1.0 ships four; Sector 1 is all that exists today, and
   *  the lifecycle proof chains three instances of it. */
  sectorPlan = 1;
  /** Selected FALL tier, 1..10. */
  fall = 1;
  /** Corrupted variants taken this run, with the downside each one carried. */
  corrupted: CorruptedOffer[] = [];
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
  /**
   * Non-negotiable 8: the assist configuration is captured on every run, including runs with
   * every assist off. Leaderboards ship later; if these flags are not written from the first
   * run, historical runs can never be segmented.
   */
  assists: Assists = { ...DEFAULT_ASSISTS };
  assistsAllDefault = true;
  assistSnapshot: Record<string, unknown> = {};

  get tier(): FallTier { return tierFor(this.fall); }

  begin(seed: string, reactor: ReactorId, fall = this.fall) {
    RNG.init(seed);
    this.seed = seed;
    this.reactor = reactor;
    this.fall = fall;
    this.corrupted = [];
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
    this.assists = { ...settings.assists };
    this.assistsAllDefault = assistsAreDefault(this.assists);
    this.assistSnapshot = settings.snapshot();
    const sel = selectChains(this.sector, null);
    this.chains = [sel.chains[0], sel.chains[1]];
    this.law2 = sel.law2;
  }

  get currentChain() { return this.chains[this.chainIndex]; }
  get previousChainStress(): StressTag | null { return this.chainIndex > 0 ? this.chains[this.chainIndex - 1].dominantStress : null; }
  get maxStructure() { return REACTORS[this.reactor].structure; }
  get classification(): Classification { return classify(this.upgrades, this.evolutions); }

  hasUpgrade(id: UpgradeId) { return this.upgrades.includes(id); }
  isCorrupted(id: UpgradeId) { return this.corrupted.some((c) => c.upgrade === id); }
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

    /**
     * Corrupted frequency is a FALL lever (§3.1). The GDD introduces corrupted variants
     * "always offered alongside a clean option"; the ladder's terminal tier deliberately
     * removes that guarantee, which is FALL X's identity. Below FALL X at least one clean
     * card is always present.
     */
    const fraction = this.tier.corruptedFraction;
    const cards: UpgradeCard[] = picked.map((id) => ({ id, corrupted: null }));
    if (fraction > 0) {
      const maxCorrupt = fraction >= 1 ? cards.length : Math.max(1, Math.min(cards.length - 1, Math.round(cards.length * fraction)));
      const order = rng.shuffle(cards.map((_, i) => i));
      for (let n = 0; n < maxCorrupt; n++) {
        const card = cards[order[n]];
        const downside = rng.pick(DOWNSIDE_IDS) as DownsideId;
        card.corrupted = {
          upgrade: card.id,
          downside,
          ...(downside === 'hardpoint-lockout' ? { lockedHardpoint: rng.pick(HARDPOINT_ORDER) } : {}),
        };
      }
    }

    // Three branches exist per hardpoint (§8.3); the seed decides which one this FORGE offers,
    // so an un-evolved hardpoint is a different card at a different FORGE of a different run.
    const evolutions = HARDPOINT_ORDER
      .filter((h) => !this.evolvedHardpoints.includes(h))
      .map((h) => ({ hardpoint: h, evolution: offeredEvolution(h) }));

    return { upgrades: cards, evolutions };
  }

  takeUpgrade(card: UpgradeCard | UpgradeId) {
    const id = typeof card === 'string' ? card : card.id;
    const corrupted = typeof card === 'string' ? null : card.corrupted;
    if (!this.upgrades.includes(id)) this.upgrades.push(id);
    if (corrupted && !this.isCorrupted(id)) this.corrupted.push(corrupted);
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
      assists: this.assistSnapshot,
      fall: { tier: this.fall, name: this.tier.name },
      corrupted: this.corrupted.map((c) => `${c.upgrade}:${c.downside}${c.lockedHardpoint ? `:${c.lockedHardpoint}` : ''}`),
      sectorPlan: this.sectorPlan,
    };
  }
}
