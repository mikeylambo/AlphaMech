import * as THREE from 'three';
import { T } from '../core/Tuning';
import { RNG } from '../core/RNG';
import { Enemy } from './Enemy';
import { Archetype, AttackId } from './Archetypes';
import { CombatContext } from '../frame/Context';
import { MechPalette } from '../entities/Materials';

/** SEVERANCE wears your chassis. That is the point of an ACE: same rules as you, pushed to mastery. */
const SEVERANCE_PALETTE: MechPalette = {
  armor: 0x3a3038, armor2: 0x1e1a1f, dark: 0x121013, metal: 0x6a5f66, joint: 0x201c21,
  accent: 0xff4d6a, glow: 0xff5a7a,
};

export const SEVERANCE_SPEC: Archetype = {
  id: 'lancer', name: 'SEVERANCE',
  structure: T.severanceStructure, impactMax: T.severanceImpactMax,
  band: [22, 120], speed: 78, accel: 260, scale: 1.35,
  // A full spread of the roster's verbs — SEVERANCE is not one archetype, it is all of them at once.
  attacks: [
    { id: 'lunge', weight: 26 },
    { id: 'sweep', weight: 22 },
    { id: 'lance', weight: 20 },
    { id: 'volley', weight: 18 },
    { id: 'quake', weight: 14 },
  ],
  flying: false, cruiseAltitude: 0, frontalShield: false,
  palette: SEVERANCE_PALETTE, chassis: 'ace',
};

/**
 * SEVERANCE — Sector 1 boss, class ACE (GDD §9). 22,000 structure, phase 2 at 50%.
 *
 * COUNTER-VANISH, deterministic enough to test:
 *   Phase 1 — every second successful Perfect Vanish against SEVERANCE triggers Counter-Vanish.
 *   Phase 2 — 60% seeded chance per successful Perfect Vanish, 4.0s internal cooldown.
 * Counter-Vanish always starts a Reverse Rally.
 */
export class Severance extends Enemy {
  phase: 1 | 2 = 1;
  /** Successful Perfect Vanishes the player has landed on SEVERANCE this fight. */
  vanishesTaken = 0;
  counterVanishes = 0;
  private counterCooldown = 0;
  private blinkCD = 0;
  onPhaseChange: ((phase: 2) => void) | null = null;
  onCounterVanish: (() => void) | null = null;

  constructor(ctx: CombatContext, position: THREE.Vector3) {
    super(SEVERANCE_SPEC, ctx, position);
  }

  get structure01() { return this.vitals.structure / this.vitals.structureMax; }
  get bossName() { return 'SEVERANCE'; }
  /** ACE: nothing is gated. The whole fight is the read. */
  get gated() { return false; }
  hudLine() {
    const next = this.phase === 1
      ? `COUNTER-VANISH ON VANISH ${(Math.floor(this.vanishesTaken / T.counterVanishP1Every) + 1) * T.counterVanishP1Every}`
      : `COUNTER-VANISH ${(T.counterVanishP2Chance * 100) | 0}% · CD ${T.counterVanishP2Cooldown.toFixed(1)}s`;
    return `VANISHES ${this.vanishesTaken} · COUNTERS ${this.counterVanishes} · ${next}`;
  }

  update(dt: number) {
    this.counterCooldown = Math.max(0, this.counterCooldown - dt);
    this.blinkCD = Math.max(0, this.blinkCD - dt);
    if (this.phase === 1 && this.structure01 <= T.severancePhase2At) this.enterPhase2();
    super.update(dt);
  }

  private enterPhase2() {
    this.phase = 2;
    this.spec.speed = 96;
    this.vitals.exposed = 0;
    this.ctx.fx.ring(this.pos, 4, 90, 0xff5a7a, 0.8);
    this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 10), 0xff5a7a, 7, 34);
    this.ctx.shake(1.2);
    this.ctx.audio.bossRoar();
    this.onPhaseChange?.(2);
  }

  /**
   * Called by the game the moment a Perfect Vanish against SEVERANCE resolves.
   * Returns true when Counter-Vanish fires — and Counter-Vanish always starts a Reverse Rally.
   */
  onPerfectVanished(): boolean {
    this.vanishesTaken++;
    let fire = false;
    if (this.phase === 1) {
      fire = this.vanishesTaken % T.counterVanishP1Every === 0;
    } else if (this.counterCooldown <= 0) {
      fire = RNG.stream('boss').chance(T.counterVanishP2Chance);
      if (fire) this.counterCooldown = T.counterVanishP2Cooldown;
    }
    if (fire) {
      this.counterVanishes++;
      // SEVERANCE answers the blink with its own: it appears on the player's flank.
      const target = this.ctx.target;
      const away = this.pos.clone().sub(target.pos).setY(0).normalize();
      const side = new THREE.Vector3(-away.z, 0, away.x);
      const dest = target.pos.clone().addScaledVector(side, 15).addScaledVector(away, 6);
      dest.y = this.ctx.groundAt(dest.x, dest.z);
      this.ctx.confine(dest, 8);
      this.ctx.fx.ghost(this.rig.root, 0xff5a7a, 0.5);
      this.pos.copy(dest);
      this.vitals.exposed = 0;
      this.state = 'evade';
      this.evadeT = 0.2;
      this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 10), 0xff5a7a, 5, 16);
      this.ctx.audio.counterVanish();
      this.ctx.shake(0.7);
      this.onCounterVanish?.();
    }
    return fire;
  }

  /** Phase 2 adds a blink reposition between attacks — the ACE fights the way you do. */
  protected think(dt: number) {
    super.think(dt);
    if (this.phase === 2 && this.blinkCD <= 0 && this.state === 'orbit' && this.distance() > 60) {
      this.blinkCD = 4.5;
      const t = this.ctx.target;
      const a = RNG.stream('boss').range(0, Math.PI * 2);
      const dest = t.pos.clone().add(new THREE.Vector3(Math.cos(a) * 34, 0, Math.sin(a) * 34));
      dest.y = this.ctx.groundAt(dest.x, dest.z);
      this.ctx.confine(dest, 8);
      this.ctx.fx.ghost(this.rig.root, 0xff5a7a, 0.4);
      this.pos.copy(dest);
      this.ctx.audio.quickBoost();
    }
  }

  protected pickAttack(): AttackId {
    // phase 2 leans on the tightest reads in the roster; the vanish skill must stay live
    if (this.phase === 2) {
      return RNG.stream('boss').weighted(
        ['sweep', 'lunge', 'lance', 'quake', 'volley'] as AttackId[],
        [32, 26, 18, 14, 10],
      );
    }
    return super.pickAttack();
  }

  snapshotBoss() {
    return {
      phase: this.phase,
      structure: Math.round(this.vitals.structure),
      structureMax: this.vitals.structureMax,
      vanishesTaken: this.vanishesTaken,
      counterVanishes: this.counterVanishes,
      counterCooldown: +this.counterCooldown.toFixed(2),
    };
  }
}
