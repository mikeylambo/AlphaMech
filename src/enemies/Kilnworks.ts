import * as THREE from 'three';
import { T } from '../core/Tuning';
import { RNG } from '../core/RNG';
import { clamp, dampAngle } from '../core/MathUtil';
import { Enemy } from './Enemy';
import { Archetype, AttackId } from './Archetypes';
import { CombatContext } from '../frame/Context';
import { DamageSource } from '../frame/Types';
import { MechPalette } from '../entities/Materials';

const KILN_PALETTE: MechPalette = {
  armor: 0x4a3a2c, armor2: 0x2a2018, dark: 0x14100c, metal: 0x74655a, joint: 0x231a14,
  accent: 0xff8c3a, glow: 0xffa04a,
};

/** The pour head. Structure is the pool minus the arms, so the total is exactly the spec. */
const HEAD_SPEC: Archetype = {
  id: 'warden', name: 'KILNWORKS',
  structure: T.kilnworksStructure - T.kilnworksArms * T.kilnworksArmStructure,
  impactMax: 3200,
  band: [30, 150], speed: 0, accel: 0, scale: 1.0,
  attacks: [{ id: 'pour', weight: 46 }, { id: 'mortar', weight: 30 }, { id: 'lance', weight: 24 }],
  flying: false, cruiseAltitude: 0, frontalShield: false,
  palette: KILN_PALETTE, chassis: 'heavy',
};

/** A feed arm. Four of them, each holding its own bearing on the line. */
const ARM_SPEC: Archetype = {
  id: 'sentry', name: 'FEED ARM',
  structure: T.kilnworksArmStructure, impactMax: 1400,
  band: [40, 120], speed: 0, accel: 0, scale: 1.0,
  attacks: [{ id: 'volley', weight: 40 }, { id: 'scatter', weight: 30 }, { id: 'mortar', weight: 30 }],
  flying: false, cruiseAltitude: 0, frontalShield: true,
  palette: KILN_PALETTE, chassis: 'heavy',
};

/**
 * A feed arm. It does not steer — it holds a fixed station on the casting line and travels with
 * it. Everything it is comes from where the line has taken it.
 */
export class KilnArm extends Enemy {
  constructor(ctx: CombatContext, private machine: Kilnworks, public armIndex: number, position: THREE.Vector3) {
    super({ ...ARM_SPEC, attacks: ARM_SPEC.attacks.map((a) => ({ ...a })) }, ctx, position);
    this.rig.root.visible = false;
    this.body = buildArm(armIndex);
    ctx.scene.add(this.body);
  }

  private body: THREE.Group;

  /** Station relative to the machine's head, in the line's local frame. */
  station(): THREE.Vector3 {
    const side = this.armIndex % 2 === 0 ? -1 : 1;
    const along = this.armIndex < 2 ? -1 : 1;
    return new THREE.Vector3(side * ARM_LATERAL, 0, along * ARM_ALONG);
  }

  protected steer(dt: number, dist: number) {
    void dist;
    const want = this.machine.pos.clone().add(this.station());
    want.y = this.ctx.groundAt(want.x, want.z);
    // the arm is bolted to the line: it tracks its station exactly, at the line's speed
    const to = want.sub(this.pos);
    this.vel.copy(to).multiplyScalar(Math.min(12, 1 / Math.max(dt, 1e-3)));
    this.yaw = dampAngle(this.yaw, Math.atan2(this.ctx.target.pos.x - this.pos.x, this.ctx.target.pos.z - this.pos.z), 3, dt);
    this.lastGround = this.ctx.groundAt(this.pos.x, this.pos.z);
  }

  protected present(dt: number) {
    void dt;
    this.body.position.copy(this.pos);
    this.body.rotation.y = this.yaw;
    const hurt = 1 - this.vitals.structure01;
    const glow = this.body.getObjectByName('glow') as THREE.Mesh | undefined;
    if (glow) {
      const m = glow.material as THREE.MeshBasicMaterial;
      m.opacity = 0.35 + 0.4 * Math.abs(Math.sin(this.ctx.time * (2 + hurt * 6)));
      m.color.setHex(this.vitals.isExposed ? 0xffffff : this.vitals.staggered ? 0xffd24a : 0xffa04a);
    }
    this.body.visible = this.alive;
  }

  protected pickAttack(): AttackId {
    return RNG.stream('boss').weighted(this.spec.attacks.map((a) => a.id), this.spec.attacks.map((a) => a.weight));
  }

  die() {
    this.body.visible = false;
    this.ctx.fx.ring(this.pos, 4, 60, 0xffa04a, 0.8);
    this.ctx.shake(0.9);
    this.machine.onArmSevered(this);
    super.die();
  }

  dispose() {
    this.ctx.scene.remove(this.body);
    super.dispose();
  }
}

/**
 * ============================================================================================
 * KILNWORKS — Sector 2's WAR MACHINE  (RC brief §2.2)
 *
 * "The foundry line is the boss. You fight along a continuously moving casting line: sever four
 * feed arms, ride the line inward against its travel, disable the pour. The arena translates for
 * the entire fight, so no position is holdable and rotation must be continuous."
 *
 * WHY IT IS A DIFFERENT EXAM FROM CHORUS.
 *
 * Every sector offers two different CLASSES, so the exam changes with the seed rather than just
 * the model. CHORUS is a FORMATION: it asks whether you can collapse three bearings into a
 * narrow span. KILNWORKS is a WAR MACHINE: it asks whether you can hold ANY relationship at all
 * while the floor of the fight is moving out from under it.
 *
 * The head has no speed of its own and the arms have none either — they are bolted to a line
 * that travels at a fixed rate for the entire fight. Nothing about the machine chases you. What
 * it does is leave, continuously, so a position that solved the fight one second ago is behind
 * you the next. That is a piloting exam by construction rather than by pressure.
 *
 * THE COMBAT CONTRACT IS UNTOUCHED. The head and the four arms are ordinary hostiles: they take
 * ordinary attack tokens out of the ordinary budget the encirclement arc pays for, they telegraph
 * on the ground plane, and every windup is vanishable. A war machine is large, so the arc it
 * subtends is wide, and a wide arc buys tokens — that is the sovereign rule working, not an
 * exception to it.
 * ============================================================================================
 */
export class Kilnworks extends Enemy {
  arms: KilnArm[] = [];
  phase: 1 | 2 | 3 = 1;
  /** Direction the line is travelling, along z. Phase 2 reverses it. */
  travel = 1;
  /** Structural damage the arms refused on the head's behalf. */
  damageRefused = 0;
  damageTaken = 0;
  armsSevered = 0;
  /** Seconds the pilot has spent behind the pour head while it is exposed — phase 3's win condition. */
  ridingFor = 0;

  onPhaseChange: ((phase: 2 | 3) => void) | null = null;
  onArmSever: ((remaining: number) => void) | null = null;

  private body: THREE.Group;
  private z0: number;
  private z1: number;
  private pourT = 0;

  constructor(ctx: CombatContext, position: THREE.Vector3, span: { z0: number; z1: number }) {
    super({ ...HEAD_SPEC, attacks: HEAD_SPEC.attacks.map((a) => ({ ...a })) }, ctx, position);
    this.rig.root.visible = false;
    this.body = buildHead();
    ctx.scene.add(this.body);
    this.z0 = span.z0 + 120;
    this.z1 = span.z1 - 120;
    this.pos.z = this.z0 + (this.z1 - this.z0) * 0.25;
    this.pos.y = ctx.groundAt(this.pos.x, this.pos.z);
  }

  /** Bolt the four feed arms onto the line. */
  deployArms() {
    for (let i = 0; i < T.kilnworksArms; i++) {
      const p = this.pos.clone();
      const arm = new KilnArm(this.ctx, this, i, p);
      p.add(arm.station());
      p.y = this.ctx.groundAt(p.x, p.z);
      arm.pos.copy(p);
      this.arms.push(arm);
      this.ctx.hostiles.push(arm);
    }
  }

  get liveArms() { return this.arms.filter((a) => a.alive); }
  get structure01() { return this.poolStructure / this.poolMax; }
  get bossName() { return 'KILNWORKS'; }
  get gated() { return this.liveArms.length > 0 || (this.phase >= 3 && !this.behindHead()); }
  hudLine() {
    const pips = this.arms.map((a) => (a.alive ? '■' : '·')).join(' ');
    if (this.liveArms.length > 0) return `FEED ARMS — ${pips}  ${this.liveArms.length}/${T.kilnworksArms} STANDING · THE POUR HEAD IS BEHIND THEM`;
    if (this.phase < 3) return `ARMS SEVERED · THE LINE HAS REVERSED — RIDE IT ${this.travel > 0 ? 'DOWNSTREAM' : 'UPSTREAM'}`;
    return this.behindHead()
      ? `POUR EXPOSED — YOU ARE BEHIND THE HEAD · ${this.ridingFor.toFixed(1)}s HELD`
      : 'POUR HEAD ARMOURED FRONTALLY · GET BEHIND IT AGAINST THE TRAVEL';
  }
  /** The whole machine, arms included — what the boss bar should show. */
  get poolStructure() { return this.vitals.structure + this.liveArms.reduce((n, a) => n + a.vitals.structure, 0); }
  get poolMax() { return T.kilnworksStructure; }

  /**
   * The pour head is behind the feed. While any arm stands, the head refuses structural damage
   * and the arms are the fight. This is the same shape of rule as GRAVEMARK's screen and
   * CHORUS's harmony, and deliberately so — Sector 1 and Sector 2 both teach that a boss's
   * damage gate is a POSITION you have to earn, not a health bar you have to out-shoot.
   */
  applyHit(damage: number, impact: number, source: DamageSource) {
    if (!this.alive) return;
    if (this.liveArms.length > 0) {
      this.damageRefused += damage;
      super.applyHit(0, impact, source);
      this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 14), 0xffa04a, 2.0, 5);
      this.ctx.audio.ricochet();
      return;
    }
    // Phase 3: the pour head is frontally armoured. It only takes damage from BEHIND, which on a
    // line that is travelling means riding it against its own direction of travel.
    if (this.phase >= 3 && !this.behindHead()) {
      this.damageRefused += damage;
      super.applyHit(0, impact, source);
      this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 14), 0xffd24a, 1.8, 5);
      this.ctx.audio.ricochet();
      return;
    }
    this.damageTaken += damage;
    super.applyHit(damage, impact, source);
  }

  /** Is the pilot on the trailing side of the head, relative to the line's travel? */
  behindHead(): boolean {
    const rel = this.ctx.target.pos.z - this.pos.z;
    return rel * this.travel < 0;
  }

  onArmSevered(arm: KilnArm) {
    this.armsSevered++;
    void arm;
    this.onArmSever?.(this.liveArms.length - 1);
    if (this.liveArms.length <= 1 && this.phase === 1) this.enterPhase(2);
  }

  private enterPhase(p: 2 | 3) {
    this.phase = p;
    if (p === 2) {
      // the line reverses and speeds up: everything you learned about where to stand inverts
      this.travel *= -1;
      this.ctx.audio.bossRoar();
    }
    if (p === 3) {
      this.spec.attacks = [{ id: 'pour', weight: 62 }, { id: 'quake', weight: 20 }, { id: 'lance', weight: 18 }];
    }
    this.ctx.fx.ring(this.pos, 6, 140, 0xffa04a, 0.9);
    this.ctx.shake(1.3);
    this.ctx.audio.bossRoar();
    this.onPhaseChange?.(p);
  }

  update(dt: number) {
    // The line travels. It does this whatever else is happening, which is the whole design.
    const speed = T.kilnworksLineSpeed * (this.phase >= 2 ? 1.45 : 1);
    this.pos.z += this.travel * speed * dt;
    if (this.pos.z > this.z1) { this.pos.z = this.z1; this.travel = -1; }
    if (this.pos.z < this.z0) { this.pos.z = this.z0; this.travel = 1; }
    this.pos.y = this.ctx.groundAt(this.pos.x, this.pos.z);

    if (this.phase === 2 && this.liveArms.length === 0) this.enterPhase(3);
    if (this.phase >= 3 && this.behindHead()) this.ridingFor += dt;

    this.pourT += dt;
    super.update(dt);
  }

  /** The head does not steer. It faces the pilot and it travels; that is all it does. */
  protected steer(dt: number, dist: number) {
    void dist;
    this.vel.set(0, 0, 0);
    this.yaw = dampAngle(this.yaw, Math.atan2(this.ctx.target.pos.x - this.pos.x, this.ctx.target.pos.z - this.pos.z), 2.2, dt);
    this.lastGround = this.ctx.groundAt(this.pos.x, this.pos.z);
  }

  protected present(dt: number) {
    void dt;
    this.body.position.copy(this.pos);
    this.body.rotation.y = this.yaw;
    const open = this.phase >= 3;
    const shell = this.body.getObjectByName('shell') as THREE.Mesh | undefined;
    const core = this.body.getObjectByName('core') as THREE.Mesh | undefined;
    if (shell) shell.rotation.y = this.pourT * (open ? 1.9 : 0.5);
    if (core) {
      const m = core.material as THREE.MeshBasicMaterial;
      const gated = this.liveArms.length > 0 || (open && !this.behindHead());
      m.opacity = gated ? 0.22 : 0.55 + 0.35 * Math.abs(Math.sin(this.pourT * 3));
      m.color.setHex(gated ? 0x7a4a20 : 0xffd8a0);
      core.scale.setScalar(open ? 1.35 : 1);
    }
    this.body.visible = this.alive;
  }

  protected pickAttack(): AttackId {
    return RNG.stream('boss').weighted(this.spec.attacks.map((a) => a.id), this.spec.attacks.map((a) => a.weight));
  }

  die() {
    for (const a of this.liveArms) { a.vitals.structure = 0; a.die(); }
    this.body.visible = false;
    super.die();
  }

  dispose() {
    this.ctx.scene.remove(this.body);
    for (const a of this.arms) a.dispose();
    super.dispose();
  }

  snapshotBoss() {
    return {
      boss: 'KILNWORKS',
      class: 'WAR MACHINE',
      phase: this.phase,
      structure: Math.round(this.poolStructure),
      structureMax: this.poolMax,
      headStructure: Math.round(this.vitals.structure),
      armsAlive: this.liveArms.length,
      armsSevered: this.armsSevered,
      travel: this.travel,
      lineSpeed: +(T.kilnworksLineSpeed * (this.phase >= 2 ? 1.45 : 1)).toFixed(1),
      behindHead: this.behindHead(),
      ridingFor: +this.ridingFor.toFixed(1),
      damageRefused: Math.round(this.damageRefused),
      damageTaken: Math.round(this.damageTaken),
      z: +this.pos.z.toFixed(1),
      span: [Math.round(this.z0), Math.round(this.z1)],
      directorArc: +this.ctx.director.arc.toFixed(1),
      tokenSource: this.ctx.director.tokenSource,
    };
  }
}

// ---------------------------------------------------------------------------- geometry
// No authored meshes (§12). The machine is primitives, merged into one group per part.
const ARM_LATERAL = 76;
const ARM_ALONG = 58;

const mat = {
  hull: new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.78, metalness: 0.55 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x5a4b3e, roughness: 0.6, metalness: 0.7 }),
  hot: new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
};

function buildHead(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(26, 34, 18, 12), mat.hull);
  base.position.y = 9;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(15, 20, 30, 10), mat.plate);
  stem.position.y = 32;
  const shell = new THREE.Mesh(new THREE.TorusGeometry(20, 4.4, 8, 18), mat.plate);
  shell.name = 'shell';
  shell.rotation.x = Math.PI / 2;
  shell.position.y = 46;
  const core = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), mat.hot.clone());
  core.name = 'core';
  core.position.y = 46;
  // the ladle: a broad hood facing forward, which is why the head is armoured from the front
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 16, 12, 1, true, -1.1, 2.2), mat.plate);
  hood.position.set(0, 44, 12);
  hood.rotation.x = Math.PI / 2;
  g.add(base, stem, shell, core, hood);
  g.castShadow = true;
  return g;
}

function buildArm(index: number): THREE.Group {
  const g = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(11, 15, 8, 10), mat.hull);
  foot.position.y = 4;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(9, 34, 9), mat.plate);
  mast.position.y = 22;
  const boom = new THREE.Mesh(new THREE.BoxGeometry(58, 6, 8), mat.plate);
  boom.position.set(index % 2 === 0 ? 24 : -24, 38, 0);
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(6, 12, 8), mat.hull);
  nozzle.position.set(index % 2 === 0 ? 50 : -50, 32, 0);
  nozzle.rotation.x = Math.PI;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(4.4, 12, 10), mat.hot.clone());
  glow.name = 'glow';
  glow.position.set(index % 2 === 0 ? 50 : -50, 26, 0);
  g.add(foot, mast, boom, nozzle, glow);
  g.castShadow = true;
  return g;
}

/** Clamp helper kept local so the module has no incidental dependency on the tuning table. */
export const kilnClamp = clamp;
