import { T } from '../core/Tuning';
import { clamp01 } from '../core/MathUtil';

/**
 * GDD §6.3 — "Persist the pilot model. Reset tactical state."
 *
 * Six axes, each normalised 0..1, sampled continuously during an encounter. The run-level
 * profile carries between encounters and decays 25% at every FORGE, so the Director keeps a
 * memory of how you fly without ever locking you into a read of you from ten minutes ago.
 */
export interface PilotAxes {
  airborne: number;         // fraction of time off the ground
  velocity: number;         // average speed / assault speed
  vanishReliance: number;   // perfect vanishes per vanishable attack
  lockHold: number;         // average continuous lock duration, normalised to 6s
  staggerConversion: number;// stagger punishes landed / staggers created
  buildBehaviour: number;   // verb dominance skew: 0 = spread, 1 = single-verb specialist
}

export const zeroAxes = (): PilotAxes => ({ airborne: 0, velocity: 0, vanishReliance: 0, lockHold: 0, staggerConversion: 0, buildBehaviour: 0 });

export class PilotModel {
  /** Run-level profile. Persists across encounters; decays at each FORGE. */
  profile: PilotAxes = zeroAxes();
  /** Current-encounter sampling. Reset at every encounter start. */
  current: PilotAxes = zeroAxes();

  // --- raw accumulators for the current encounter ---
  private t = 0;
  private airborneT = 0;
  private speedSum = 0;
  private lockSum = 0;
  private lockRuns = 0;
  private lockRun = 0;
  vanishableAttacks = 0;
  perfectVanishes = 0;
  staggersCreated = 0;
  staggerPunishes = 0;
  private verbUse: Record<string, number> = { BOOST: 0, VANISH: 0, LOCK: 0, STAGGER: 0 };

  resetEncounter() {
    this.t = 0; this.airborneT = 0; this.speedSum = 0; this.lockSum = 0; this.lockRuns = 0; this.lockRun = 0;
    this.vanishableAttacks = 0; this.perfectVanishes = 0; this.staggersCreated = 0; this.staggerPunishes = 0;
    this.verbUse = { BOOST: 0, VANISH: 0, LOCK: 0, STAGGER: 0 };
    this.current = zeroAxes();
  }

  sample(dt: number, o: { airborne: boolean; speed: number; locked: boolean }) {
    this.t += dt;
    if (o.airborne) this.airborneT += dt;
    this.speedSum += o.speed * dt;
    if (o.locked) { this.lockRun += dt; this.verbUse.LOCK += dt * 0.25; }
    else if (this.lockRun > 0) { this.lockSum += this.lockRun; this.lockRuns++; this.lockRun = 0; }
    if (o.speed > T.speed * 1.4) this.verbUse.BOOST += dt;
    this.recompute();
  }

  noteVerb(verb: 'BOOST' | 'VANISH' | 'LOCK' | 'STAGGER', amount = 1) { this.verbUse[verb] += amount; }

  private recompute() {
    const t = Math.max(0.001, this.t);
    const runs = this.lockRuns + (this.lockRun > 0 ? 1 : 0);
    const lockTotal = this.lockSum + this.lockRun;
    const verbs = Object.values(this.verbUse);
    const sum = verbs.reduce((a, b) => a + b, 0) || 1;
    const top = Math.max(...verbs) / sum;
    this.current = {
      airborne: clamp01(this.airborneT / t),
      velocity: clamp01(this.speedSum / t / T.assaultSpeed),
      vanishReliance: this.vanishableAttacks > 0 ? clamp01(this.perfectVanishes / this.vanishableAttacks) : 0,
      lockHold: runs > 0 ? clamp01(lockTotal / runs / 6) : 0,
      staggerConversion: this.staggersCreated > 0 ? clamp01(this.staggerPunishes / this.staggersCreated) : 0,
      buildBehaviour: clamp01((top - 0.25) / 0.75),
    };
  }

  /** `pressure = 0.70 x current-encounter sampling + 0.30 x run pilot model` (GDD §6.3). */
  blended(): PilotAxes {
    const c = this.current, p = this.profile;
    const k = T.pilotBlendCurrent, j = T.pilotBlendProfile;
    return {
      airborne: c.airborne * k + p.airborne * j,
      velocity: c.velocity * k + p.velocity * j,
      vanishReliance: c.vanishReliance * k + p.vanishReliance * j,
      lockHold: c.lockHold * k + p.lockHold * j,
      staggerConversion: c.staggerConversion * k + p.staggerConversion * j,
      buildBehaviour: c.buildBehaviour * k + p.buildBehaviour * j,
    };
  }

  /** Fold the finished encounter into the run profile. */
  commitEncounter() {
    const c = this.current, p = this.profile;
    const keys = Object.keys(p) as (keyof PilotAxes)[];
    for (const key of keys) p[key] = p[key] * 0.55 + c[key] * 0.45;
  }

  /** The pilot model decays 25% at each FORGE (GDD §6.3). */
  decayAtForge() {
    const keys = Object.keys(this.profile) as (keyof PilotAxes)[];
    for (const k of keys) this.profile[k] *= 1 - T.pilotForgeDecay;
  }

  resetRun() { this.profile = zeroAxes(); this.resetEncounter(); }
}
