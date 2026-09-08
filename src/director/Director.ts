import * as THREE from 'three';
import { T } from '../core/Tuning';
import { RNG } from '../core/RNG';
import { clamp01, deg } from '../core/MathUtil';
import { Hostile, PressureTarget } from '../frame/Types';
import { ArchetypeId, ARCHETYPE_IDS } from '../enemies/Archetypes';
import { PilotModel } from './PilotModel';
import { FallTier, tierFor } from './Fall';

/**
 * ============================================================================================
 * THE SOVEREIGN ARC RULE  (GDD §6.1 — a build non-negotiable)
 *
 * The encirclement arc EXCLUSIVELY determines simultaneous attack tokens. Nothing else may
 * write this value.
 *
 * This is enforced structurally, not by convention: `tokenCount` is a getter over the pure
 * function `arcTokens(arc, sector)`. There is no setter and no field to assign, so no other
 * system — pressure model, pilot model, difficulty, boss script, upgrade — is even able to
 * write it. `tokenSource` returns the derivation, so the rule is provable at runtime through
 * `__state().director.tokenSource`.
 * ============================================================================================
 */
export interface TokenDerivation { count: number; source: string; }

export function arcTokens(arcDeg: number, sector: number): TokenDerivation {
  if (sector >= 3 && arcDeg > T.arcSwarm) return { count: 3, source: `encirclement-arc(${arcDeg.toFixed(1)}°) > ${T.arcSwarm}° [S3+] -> 3` };
  if (arcDeg > T.arcFlank) return { count: 2, source: `encirclement-arc(${arcDeg.toFixed(1)}°) > ${T.arcFlank}° -> 2` };
  return { count: 1, source: `encirclement-arc(${arcDeg.toFixed(1)}°) <= ${T.arcFlank}° -> 1` };
}

export type SequencingMode = 'SEQUENCED' | 'ASYNC';
export type BandPressure = 'CLOSE' | 'MID' | 'FAR';

/** GDD §6.2 — the complete permitted output set. Token count is not on this list. */
export interface PressureOutputs {
  bearing: number;                              // radians, relative to the target's facing
  archetype: Record<ArchetypeId, number>;       // spawn weighting
  sequencing: SequencingMode;
  reinforcementTiming: number;                  // seconds until the next wave may arrive
  bandPressure: BandPressure;
}

export class Director {
  /** Minimal arc, in degrees, containing every hostile bearing relative to the target's facing. */
  private _arc = 0;
  sector = 1;
  pilot = new PilotModel();
  tokenHolders: number[] = [];
  pressure: PressureOutputs = {
    bearing: 0,
    archetype: Object.fromEntries(ARCHETYPE_IDS.map((a) => [a, 1])) as Record<ArchetypeId, number>,
    sequencing: 'SEQUENCED',
    reinforcementTiming: 14,
    bandPressure: 'MID',
  };
  /** Raised by FLANK DEBT (GDD §8.2) and by the FALL ladder. Shapes orbit, never token count. */
  forwardBias = T.orbitForwardBias;
  /**
   * BEARING SEPARATION — how hard non-attacking hostiles push apart in BEARING around the pilot.
   *
   * Added in v0.3 because measurement forced it. v2.3 PATCH 4 raised FLANK DEBT's forward bias
   * from 0.34 to 0.45 to escape the dead zone, and paired it with a spawn-spread step. Both
   * levers were then verified to be SET (0.16 -> 0.45, spread 0.30 -> 0.60) and the mean
   * encirclement arc still did not move: 69.9 degrees clean against 68.2 with the downside held,
   * a delta of -1.6 where the patch requires +12.
   *
   * The reason is structural. Forward bias is a spiral-in ratio on a normalised steering vector,
   * and the band clamp catches the spiral: a hostile pulled inward stops at the band's inner
   * edge and resumes orbiting. It therefore shapes the APPROACH and leaves the steady-state
   * bearing distribution — which is what the arc measures — essentially untouched. Spawn spread
   * jitters arrivals around one Director-chosen bearing, so it does not distribute them either.
   *
   * The arc is `360 - largest bearing gap`. To widen it you must widen BEARINGS, which is what
   * this does: each hostile pushes tangentially away from the nearest other hostile's bearing,
   * capped by its own speed. It is positional pressure and nothing else — it cannot change how
   * many tokens exist, how much anything hits for, or how much structure anything has.
   */
  bearingSeparation = 0;
  /**
   * The active FALL tier. It may move token COOLDOWN, orbit bias, composition, sequencing
   * availability, bearing spread and wave pacing — and nothing else. It cannot reach
   * `arcTokens`, which is a pure function of the arc and the sector.
   */
  fall: FallTier = tierFor(1);
  /** FLANK DEBT, taken as a corrupted downside, stacks on top of the tier's bias. */
  flankDebt = false;
  private enFloorHits = 0;
  private enWasFloor = false;
  private encounterTime = 0;
  private repathT = 0;

  get arc() { return this._arc; }
  /** Sovereign: derived, never assigned. */
  get tokenCount() { return arcTokens(this._arc, this.sector).count; }
  get tokenSource() { return arcTokens(this._arc, this.sector).source; }

  /** Set once per run, before the first encounter. */
  setFall(tier: FallTier) { this.fall = tier; }

  resetEncounter(sector: number) {
    this.sector = sector;
    this.forwardBias = Math.max(this.fall.forwardBias, this.flankDebt ? T.flankDebtBias : 0);
    this.bearingSeparation = this.flankDebt ? T.flankDebtBearingSeparation : 0;
    this._arc = 0;
    this.tokenHolders = [];
    this.encounterTime = 0;
    this.enFloorHits = 0;
    this.enWasFloor = false;
    this.repathT = 0;
    // tactical state resets; the pilot model does not (GDD §6.3)
    this.pressure = {
      bearing: 0,
      archetype: Object.fromEntries(ARCHETYPE_IDS.map((a) => [a, 1])) as Record<ArchetypeId, number>,
      sequencing: 'SEQUENCED',
      reinforcementTiming: 14,
      bandPressure: 'MID',
    };
    this.pilot.resetEncounter();
  }

  /** Minimal arc containing every live hostile bearing, measured around the target. */
  private computeArc(hostiles: Hostile[], target: PressureTarget): number {
    const alive = hostiles.filter((h) => h.alive);
    if (alive.length < 2) return 0;
    const bearings = alive.map((h) => Math.atan2(h.pos.x - target.pos.x, h.pos.z - target.pos.z)).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 0; i < bearings.length; i++) {
      const a = bearings[i], b = bearings[(i + 1) % bearings.length];
      let g = b - a;
      if (g <= 0) g += Math.PI * 2;
      if (g > gap) gap = g;
    }
    return deg(Math.PI * 2 - gap);
  }

  update(dt: number, hostiles: Hostile[], target: PressureTarget, energy01: number) {
    this.encounterTime += dt;
    this._arc = this.computeArc(hostiles, target);

    // ---- EN floor frequency, one of the pressure model's inputs ----
    const atFloor = energy01 < 0.06;
    if (atFloor && !this.enWasFloor) this.enFloorHits++;
    this.enWasFloor = atFloor;

    this.updatePressure(dt, target);
    this.assignTokens(dt, hostiles);
  }

  // ------------------------------------------------------------------ token assignment
  /**
   * Tokens go to the candidate nearest its band centre, off cooldown, unstaggered (GDD §6.1).
   * The BUDGET comes from the arc and only from the arc. Sequencing may delay when a holder
   * opens, but never how many holders exist.
   */
  private assignTokens(dt: number, hostiles: Hostile[]) {
    const alive = hostiles.filter((h) => h.alive);
    for (const h of alive) h.tokenCooldown = Math.max(0, h.tokenCooldown - dt);
    // the ladder moves how quickly aggression RETURNS, never how much of it exists at once

    const budget = this.tokenCount;
    let held = alive.filter((h) => h.hasAttackToken);

    if (held.length < budget) {
      const cands = alive.filter((h) => !h.hasAttackToken && h.tokenCooldown <= 0 && !h.vitals.staggered && h.state !== 'recover' && h.state !== 'windup');
      if (cands.length) {
        const bandCentre = (h: Hostile) => (h.band[0] + h.band[1]) / 2;
        cands.sort((a, b) => Math.abs(dist(a) - bandCentre(a)) - Math.abs(dist(b) - bandCentre(b)));
        // preferred band pressure nudges WHICH candidate wins, not how many win
        const bias = this.pressure.bandPressure;
        if (bias !== 'MID') {
          cands.sort((a, b) => (bias === 'CLOSE' ? dist(a) - dist(b) : dist(b) - dist(a)));
        }
        cands[0].hasAttackToken = true;
        held = alive.filter((h) => h.hasAttackToken);
      }
    } else if (held.length > budget) {
      const releasable = held.filter((h) => h.state !== 'windup' && h.state !== 'strike' && h.state !== 'recover');
      if (releasable.length) releasable[0].releaseToken();
    }

    this.tokenHolders = held.map((h) => h.id);

    function dist(h: Hostile) { return h.pos.length(); }
  }

  /**
   * SEQUENCED (default) lets one holder be mid-windup at a time; ASYNC lifts that. Both operate
   * strictly inside the arc's budget — with two tokens and SEQUENCED, the second holder waits
   * its turn rather than being taken away.
   */
  mayOpenAttack(h: Hostile, hostiles: Hostile[]): boolean {
    if (!h.hasAttackToken) return false;
    if (this.fall.asyncAllowed && this.pressure.sequencing === 'ASYNC') return true;
    return !hostiles.some((o) => o !== h && o.alive && o.state === 'windup');
  }

  // ------------------------------------------------------------------ pressure model
  /**
   * GDD §6.2. Inputs: arc, average velocity, altitude fraction, EN floor frequency, Perfect
   * Vanish rate, stagger conversions per minute, average lock hold, verb dominance vector.
   * Outputs are exactly the five permitted ones. Simultaneous token count is not among them
   * and may not be added.
   */
  private updatePressure(dt: number, target: PressureTarget) {
    this.repathT -= dt;
    const p = this.pilot.blended();
    const arc01 = clamp01((this._arc - T.arcSafe) / (T.arcFlank - T.arcSafe));
    const enPressure = clamp01(this.enFloorHits / 6);
    const conversionsPerMin = this.encounterTime > 1 ? (this.pilot.staggerPunishes / this.encounterTime) * 60 : 0;

    // ---- spawn bearing bias: reinforce where the pilot is not looking ----
    // A pilot who rotates well earns pressure from behind; a pilot already surrounded gets a
    // frontal wave instead, so being overwhelmed is recoverable by piloting.
    const wantsFlank = p.velocity > 0.35 && arc01 < 0.6;
    const targetBearing = wantsFlank ? Math.PI * (0.55 + 0.35 * p.velocity) : Math.PI * 0.12;
    this.pressure.bearing = targetBearing * (this.pressure.bearing < 0 ? -1 : 1);
    if (this.repathT <= 0) {
      this.repathT = 3.5;
      const rng = RNG.stream('ai');
      if (rng.chance(0.5)) this.pressure.bearing *= -1;
    }

    // ---- archetype weighting: answer the pilot's habits ----
    const w = this.pressure.archetype;
    w.harrier = 1 + p.airborne * 2.4;                      // fly a lot, meet fliers
    w.brawler = 1 + (1 - p.vanishReliance) * 1.8 + arc01 * 0.6; // sweep is the tightest read
    w.lancer = 1 + p.velocity * 1.2;
    w.sentry = 1 + (1 - p.velocity) * 1.6 + enPressure * 0.8;   // camping meets mortars
    w.warden = 1 + p.staggerConversion * 1.6 + p.lockHold * 0.8;

    // ---- sequencing: async only for a pilot who is reading windups reliably ----
    this.pressure.sequencing = p.vanishReliance > 0.42 && arc01 > 0.35 ? 'ASYNC' : 'SEQUENCED';

    // ---- reinforcement timing ----
    const base = 16;
    this.pressure.reinforcementTiming = (base - p.velocity * 6 - conversionsPerMin * 0.25 + arc01 * 4) * this.fall.reinforcementScale;

    // ---- band pressure ----
    const altitude01 = clamp01(target.pos.y / 60);
    this.pressure.bandPressure = altitude01 > 0.45 ? 'FAR' : p.velocity > 0.5 ? 'CLOSE' : arc01 > 0.6 ? 'FAR' : 'MID';
  }

  /** Weighted archetype draw for spawning, restricted to the encounter's eligible pool. */
  pickArchetype(pool: ArchetypeId[]): ArchetypeId {
    const rng = RNG.stream('spawn');
    return rng.weighted(pool, pool.map((a) => this.pressure.archetype[a] ?? 1));
  }

  /**
   * Radians of jitter around the chosen reinforcement bearing.
   *
   * v2.3 PATCH 4 pairs FLANK DEBT's raised forward bias with a spawn-spread step, because the
   * bias alone shapes where hostiles DRIFT and the spread shapes where they ARRIVE. Both widen
   * the arc; neither can touch how many tokens exist.
   */
  get spawnSpread() { return this.fall.spawnSpread + (this.flankDebt ? T.flankDebtSpawnSpread : 0); }

  /** Spawn bearing for a reinforcement, in world radians. */
  spawnBearing(target: PressureTarget): number {
    const rng = RNG.stream('spawn');
    const facing = Math.atan2(target.forward().x, target.forward().z);
    return facing + this.pressure.bearing + rng.range(-this.spawnSpread, this.spawnSpread);
  }

  /** Seconds before a hostile that released a token may take another. */
  get tokenCooldownSeconds() { return this.sector >= 4 ? T.tokenCooldownS4 : this.fall.tokenCooldown; }

  snapshot() {
    return {
      arc: +this._arc.toFixed(2),
      fall: { tier: this.fall.id, name: this.fall.name, tokenCooldown: this.fall.tokenCooldown, forwardBias: this.forwardBias, spawnSpread: +this.spawnSpread.toFixed(2), bearingSeparation: this.bearingSeparation, flankDebt: this.flankDebt, arenaCeiling: this.fall.arenaCeiling, asyncAllowed: this.fall.asyncAllowed, elites: this.fall.elites, corruptedFraction: this.fall.corruptedFraction },
      tokenCount: this.tokenCount,
      tokenSource: this.tokenSource,
      tokenHolders: this.tokenHolders.slice(),
      pressureOutputs: {
        bearing: +this.pressure.bearing.toFixed(3),
        archetype: { ...this.pressure.archetype },
        sequencing: this.pressure.sequencing,
        reinforcementTiming: +this.pressure.reinforcementTiming.toFixed(2),
        bandPressure: this.pressure.bandPressure,
      },
      pilotModel: { current: { ...this.pilot.current }, profile: { ...this.pilot.profile }, blended: this.pilot.blended() },
    };
  }
}

/** Orbit bias helper shared by hostile steering, so FLANK DEBT has exactly one place to apply. */
export function orbitBias(director: Director): number { return director.forwardBias; }
export const _unusedVector = new THREE.Vector3();
