import { T } from '../core/Tuning';

export type HitResult = 0 | 1 | 2; // 0 = no effect, 1 = damage, 2 = damage + stagger

/**
 * Structure / Impact / Stagger (GDD §5.2).
 *
 * Deliberately agnostic about what it is attached to: the player, a hostile, a boss, or a static
 * objective in MECH DEFENDERS (GDD §17). It knows nothing about meshes, AI or the director.
 */
export class Vitals {
  structure: number;
  structureMax: number;
  impact = 0;
  impactMax: number;
  stagger = 0;
  staggerDur: number;
  exposed = 0;
  private holdT = 0;
  /** Total structure lost, for INTEGRITY scoring. */
  damageTaken = 0;
  /** Set by the owner when impact must not decay (Overpressure, BREAKER reactor). */
  impactFrozenFor = 0;
  noDecay = false;
  /** Rises when this entity is staggered — the scoring layer reads and clears it. */
  staggersTaken = 0;
  lastStaggerAt = -999;

  constructor(structure: number, impactMax: number, staggerDur: number) {
    this.structure = this.structureMax = structure;
    this.impactMax = impactMax;
    this.staggerDur = staggerDur;
  }

  get alive() { return this.structure > 0; }
  get staggered() { return this.stagger > 0; }
  get isExposed() { return this.exposed > 0; }
  get structure01() { return this.structure / this.structureMax; }
  get impact01() { return this.impact / this.impactMax; }

  tick(dt: number, now: number) {
    void now;
    this.stagger = Math.max(0, this.stagger - dt);
    this.exposed = Math.max(0, this.exposed - dt);
    this.holdT = Math.max(0, this.holdT - dt);
    this.impactFrozenFor = Math.max(0, this.impactFrozenFor - dt);
    if (this.holdT <= 0 && this.stagger <= 0 && this.impactFrozenFor <= 0 && !this.noDecay)
      this.impact = Math.max(0, this.impact - T.impactDecay * dt);
  }

  /**
   * Apply damage and impact. Damage is amplified while staggered; impact is amplified while
   * Exposed and is not accumulated while already staggered (a staggered target cannot re-stagger).
   */
  hit(damage: number, impact: number, now = 0): HitResult {
    if (!this.alive) return 0;
    const vulnerable = this.staggered;
    const dealt = damage * (vulnerable ? T.staggerDmgMult : 1);
    this.structure = Math.max(0, this.structure - dealt);
    this.damageTaken += Math.min(dealt, this.structure + dealt);
    this.holdT = T.impactHoldAfterHit;
    if (!vulnerable && impact > 0) {
      this.impact += impact * (this.exposed > 0 ? T.exposedMult : 1);
      if (this.impact >= this.impactMax) {
        this.impact = 0;
        this.stagger = this.staggerDur;
        this.staggersTaken++;
        this.lastStaggerAt = now;
        return 2;
      }
    }
    return 1;
  }

  /** Impact-only application, used by upgrades that spread stagger pressure (Cascade Break). */
  addImpact(impact: number, now = 0): HitResult {
    if (!this.alive || this.staggered) return 0;
    this.impact += impact * (this.exposed > 0 ? T.exposedMult : 1);
    if (this.impact >= this.impactMax) {
      this.impact = 0; this.stagger = this.staggerDur; this.staggersTaken++; this.lastStaggerAt = now;
      return 2;
    }
    return 1;
  }

  forceStagger(now = 0) {
    if (!this.alive || this.staggered) return false;
    this.impact = 0; this.stagger = this.staggerDur; this.staggersTaken++; this.lastStaggerAt = now;
    return true;
  }

  reset(structure = this.structureMax) {
    this.structureMax = structure; this.structure = structure;
    this.impact = 0; this.stagger = 0; this.exposed = 0; this.holdT = 0; this.damageTaken = 0;
  }
}
