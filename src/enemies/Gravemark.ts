import * as THREE from 'three';
import { T } from '../core/Tuning';
import { RNG } from '../core/RNG';
import { Enemy } from './Enemy';
import { Archetype, ARCHETYPES, AttackId } from './Archetypes';
import { CombatContext } from '../frame/Context';
import { DamageSource } from '../frame/Types';
import { MechPalette } from '../entities/Materials';

const GRAVEMARK_PALETTE: MechPalette = {
  armor: 0x3a4148, armor2: 0x1d2328, dark: 0x101417, metal: 0x64707a, joint: 0x1c2226,
  accent: 0x4ad0c0, glow: 0x5ae8d4,
};

/** GDD §9 class FORMATION. Same roster, arranged so that rotation is the win condition. */
export const GRAVEMARK_SPEC: Archetype = {
  id: 'warden', name: 'GRAVEMARK',
  structure: 26000, impactMax: 2400,
  band: [45, 95], speed: 34, accel: 120, scale: 1.5,
  attacks: [
    { id: 'shield-advance', weight: 30 },
    { id: 'lance', weight: 26 },
    { id: 'volley', weight: 24 },
    { id: 'sweep', weight: 20 },
  ],
  flying: false, cruiseAltitude: 0, frontalShield: false,
  palette: GRAVEMARK_PALETTE, chassis: 'heavy',
};

/** GRAVEMARK's escort. Steers to hold station in the commander's rear arc. */
export class Relay extends Enemy {
  /** Set every frame by the commander: is this escort currently inside the rear 180°? */
  inRearArc = false;

  constructor(ctx: CombatContext, position: THREE.Vector3, private commander: Gravemark) {
    super(ARCHETYPES.relay, ctx, position);
  }

  /**
   * A RELAY inside a live screen is protected by the same field it is projecting. This is what
   * makes the boss a rotation exam rather than a damage race: while the screen holds you cannot
   * shoot your way through it, and the only thing that moves an escort out of the rear arc is
   * moving yourself. Driven into your front arc, it is the flimsiest frame in the roster and
   * dies in under three seconds.
   */
  applyHit(damage: number, impact: number, source: DamageSource) {
    if (!this.alive) return;
    if (this.commander.alive && this.commander.screened && this.inRearArc) {
      this.commander.noteRefused(damage);
      super.applyHit(0, impact, source);
      this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 6), 0x5ae8d4, 1.4, 3);
      return;
    }
    super.applyHit(damage, impact, source);
  }

  /**
   * A RELAY does not fight you, it screens for GRAVEMARK. It seeks the station point directly
   * behind the commander relative to you — and it turns at a finite rate, which is the entire
   * exploit: rotate the fight faster than the screen can re-form and the commander is exposed.
   */
  /** Angle around the commander this escort currently holds. The authority on its position. */
  private angle: number | null = null;

  /**
   * The escort holds a station on a ring around the commander, and its ANGLE around that ring
   * is rate-limited. That single cap is the whole fight:
   *
   *   escort angular rate  = 1.6 rad/s
   *   pilot at 60m on assault boost = 200 / 60 = 3.3 rad/s
   *
   * Rotate the fight and the screen cannot follow: the escorts sweep out of the rear arc and
   * into your front one, exactly as the design describes. Fly straight at an escort and the
   * commander's facing barely moves, the screen holds, and your damage is refused.
   */
  protected steer(dt: number, dist: number) {
    if (!this.commander.alive) { super.steer(dt, dist); return; }
    const c = this.commander.pos;
    const rear = this.commander.rearDir();
    const spread = ((this.id % 4) - 1.5) * 0.55;
    const want = Math.atan2(rear.x, rear.z) + spread;

    if (this.angle === null) {
      const rel = this.pos.clone().sub(c).setY(0);
      this.angle = rel.lengthSq() > 1 ? Math.atan2(rel.x, rel.z) : want;
    }
    let dA = want - this.angle;
    while (dA > Math.PI) dA -= Math.PI * 2;
    while (dA < -Math.PI) dA += Math.PI * 2;
    const maxStep = Relay.ANGULAR_RATE * dt;
    this.angle += Math.max(-maxStep, Math.min(maxStep, dA));

    const station = new THREE.Vector3(
      c.x + Math.sin(this.angle) * Relay.SCREEN_RADIUS,
      0,
      c.z + Math.cos(this.angle) * Relay.SCREEN_RADIUS,
    );
    // follow the station point translationally; the angle above is what is rate-limited
    const to = station.sub(this.pos).setY(0);
    const d = to.length();
    const speed = Math.min(this.spec.speed * 2.2, d * 4);
    const wish = d > 0.5 ? to.divideScalar(d) : new THREE.Vector3();
    this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, 12 * dt);
    this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, 12 * dt);
    const ground = this.ctx.groundAt(this.pos.x, this.pos.z);
    this.vel.y = this.pos.y > ground + 0.2 ? this.vel.y - T.gravity * dt : 0;
    const face = this.ctx.target.pos.clone().sub(this.pos);
    const faceWant = Math.atan2(face.x, face.z);
    this.yaw += Math.atan2(Math.sin(faceWant - this.yaw), Math.cos(faceWant - this.yaw)) * Math.min(1, 6 * dt);
  }

  /** Radians per second the screen can swing around the commander. */
  static readonly ANGULAR_RATE = 1.6;
  static readonly SCREEN_RADIUS = 34;
}

/**
 * ============================================================================================
 * GRAVEMARK — Sector 1's FORMATION boss (v0.2 §3.2)
 *
 * SEVERANCE tests execution: read the windup, land the vanish, survive the reverse rally.
 * GRAVEMARK tests ROTATION, and it does so by making Law II the literal win condition.
 *
 * It takes ZERO structural damage while two or more RELAYs sit inside its rear 180°. The RELAYs
 * are individually flimsy and continuously reposition to re-establish that screen. The solve is
 * not "kill the escorts fast" — they respawn. It is to rotate the whole formation, so the
 * screen is dragged out of the commander's rear arc and into your front one.
 *
 * A player who chases individual escorts loses. A player who manoeuvres the group wins.
 * ============================================================================================
 */
export class Gravemark extends Enemy {
  phase: 1 | 2 = 1;
  relays: Relay[] = [];
  /** RELAYs currently inside the rear 180°. Two or more and the commander is untouchable. */
  screening = 0;
  screened = true;
  /** Total structural damage refused by the screen — the number that proves the rule bit. */
  damageRefused = 0;
  noteRefused(d: number) { this.damageRefused += d; }
  damageTaken = 0;
  private respawnT = 0;
  private screenPulse = 0;
  onPhaseChange: ((phase: 2) => void) | null = null;
  onScreenChange: ((screened: boolean) => void) | null = null;
  private screenMesh: THREE.Mesh;

  /**
   * Yaw rate cap. GRAVEMARK is a heavy command frame, not a turret: it cannot pirouette to keep
   * its back to you. Without this cap a pilot could walk around it at any speed and the rear arc
   * would follow them for free, which makes "chase an escort" a winning line and the boss a
   * damage race. Capped, the arc is something you can genuinely outrun — and outrunning it is
   * the fight.
   */
  static readonly YAW_RATE = 1.5;

  static readonly SCREEN_THRESHOLD = 2;
  static readonly MAX_RELAYS = 4;
  static readonly RESPAWN_P1 = 14;
  static readonly RESPAWN_P2 = 9;

  constructor(ctx: CombatContext, position: THREE.Vector3) {
    super(GRAVEMARK_SPEC, ctx, position);
    this.respawnT = Gravemark.RESPAWN_P1;
    const g = new THREE.SphereGeometry(15, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
    this.screenMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x5ae8d4, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.screenMesh.position.y = 6;
    this.rig.root.add(this.screenMesh);
  }

  get structure01() { return this.vitals.structure / this.vitals.structureMax; }
  get liveRelays() { return this.relays.filter((r) => r.alive); }
  get bossName() { return 'GRAVEMARK'; }
  get gated() { return this.screened; }
  hudLine() {
    const pips = Array.from({ length: Gravemark.MAX_RELAYS }, (_, i) => (i < this.screening ? '■' : i < this.liveRelays.length ? '□' : '·')).join(' ');
    return this.screened
      ? `SCREENED — ${pips}  ${this.screening}/${Gravemark.SCREEN_THRESHOLD} RELAYS IN REAR ARC · ROTATE THE FORMATION`
      : `EXPOSED — ${pips}  ${this.screening}/${Gravemark.SCREEN_THRESHOLD} IN REAR ARC · HIT IT NOW`;
  }

  /** Spawn the opening escort. Called once, when the encounter begins. */
  deployEscort() {
    for (let i = 0; i < Gravemark.MAX_RELAYS; i++) this.spawnRelay();
    this.evaluateScreen();
  }

  private spawnRelay() {
    if (this.liveRelays.length >= Gravemark.MAX_RELAYS) return;
    const away = this.pos.clone().sub(this.ctx.target.pos).setY(0).normalize();
    const a = RNG.stream('boss').range(-0.8, 0.8);
    const dir = away.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    const p = this.pos.clone().addScaledVector(dir, Relay.SCREEN_RADIUS);
    p.y = this.ctx.groundAt(p.x, p.z);
    this.ctx.confine(p, 20);
    const r = new Relay(this.ctx, p, this);
    this.relays.push(r);
    this.ctx.hostiles.push(r);
    this.ctx.fx.ring(p, 2, 26, 0x5ae8d4, 0.5);
  }

  /**
   * Count RELAYs inside the rear 180°. GRAVEMARK faces the player, so its rear arc is the
   * hemisphere away from you — which is exactly why rotating the fight moves the arc out from
   * under the escorts.
   */
  /** Public so the encounter can settle the screen state before the first shot lands. */
  /** Unit vector along the 180° behind GRAVEMARK's facing. */
  rearDir(): THREE.Vector3 { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  evaluateScreen() {
    /**
     * The escorts hold station behind GRAVEMARK'S FACING — those are their orders, and the
     * facing is yaw-rate capped. The screen is tested against where YOU actually are.
     *
     * Those two references must not be the same vector. When they were, the test was
     * tautological: the escorts tracked the thing the test measured, so no amount of piloting
     * could break the screen and the only line was attrition. Splitting them is the fight:
     * out-rotate the commander's facing and its orders put the screen somewhere you are not.
     */
    const rear = this.pos.clone().sub(this.ctx.target.pos).setY(0);
    if (rear.lengthSq() < 1) { this.screening = 0; return; }
    rear.normalize();
    let n = 0;
    for (const r of this.liveRelays) {
      const d = r.pos.clone().sub(this.pos).setY(0);
      r.inRearArc = d.lengthSq() >= 1 && d.normalize().dot(rear) > 0;   // inside the rear 180 degrees
      if (r.inRearArc) n++;
    }
    const was = this.screened;
    this.screening = n;
    this.screened = n >= Gravemark.SCREEN_THRESHOLD;
    if (was !== this.screened) {
      this.onScreenChange?.(this.screened);
      this.ctx.fx.ring(this.pos, 4, 40, this.screened ? 0x5ae8d4 : 0xffd24a, 0.5);
      this.ctx.audio.lockOn();
    }
  }

  update(dt: number) {
    const yawBefore = this.yaw;
    this.evaluateScreen();
    this.relays = this.relays.filter((r) => r.alive);

    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = this.phase === 2 ? Gravemark.RESPAWN_P2 : Gravemark.RESPAWN_P1;
      this.spawnRelay();
    }
    if (this.phase === 1 && this.structure01 <= 0.5) this.enterPhase2();

    this.screenPulse += dt;
    const mat = this.screenMesh.material as THREE.MeshBasicMaterial;
    mat.opacity = this.screened ? 0.14 + Math.sin(this.screenPulse * 3) * 0.06 : 0.02;
    this.screenMesh.visible = this.screened;

    super.update(dt);

    // clamp however far the base steering just turned us
    let step = this.yaw - yawBefore;
    while (step > Math.PI) step -= Math.PI * 2;
    while (step < -Math.PI) step += Math.PI * 2;
    const maxStep = Gravemark.YAW_RATE * dt;
    if (Math.abs(step) > maxStep) this.yaw = yawBefore + Math.sign(step) * maxStep;
  }

  private enterPhase2() {
    this.phase = 2;
    this.spec.attacks = [
      { id: 'quake', weight: 30 },
      { id: 'shield-advance', weight: 24 },
      { id: 'lance', weight: 20 },
      { id: 'sweep', weight: 16 },
      { id: 'volley', weight: 10 },
    ];
    this.respawnT = Math.min(this.respawnT, Gravemark.RESPAWN_P2);
    this.ctx.fx.ring(this.pos, 4, 100, 0x5ae8d4, 0.8);
    this.ctx.shake(1.2);
    this.ctx.audio.bossRoar();
    this.onPhaseChange?.(2);
  }

  /** The screen refuses structural damage. Impact still lands, so the fight keeps its texture. */
  applyHit(damage: number, impact: number, source: DamageSource) {
    if (!this.alive) return;
    if (this.screened) {
      this.damageRefused += damage;
      super.applyHit(0, impact, source);
      this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 9), 0x5ae8d4, 1.8, 4);
      this.ctx.audio.ricochet();
      return;
    }
    this.damageTaken += damage;
    super.applyHit(damage, impact, source);
  }

  protected pickAttack(): AttackId {
    return RNG.stream('boss').weighted(this.spec.attacks.map((a) => a.id), this.spec.attacks.map((a) => a.weight));
  }

  die() {
    for (const r of this.liveRelays) { r.vitals.structure = 0; r.die(); }
    super.die();
  }

  snapshotBoss() {
    return {
      boss: 'GRAVEMARK',
      phase: this.phase,
      structure: Math.round(this.vitals.structure),
      structureMax: this.vitals.structureMax,
      relaysAlive: this.liveRelays.length,
      relaysScreening: this.screening,
      screenThreshold: Gravemark.SCREEN_THRESHOLD,
      screened: this.screened,
      damageRefused: Math.round(this.damageRefused),
      damageTaken: Math.round(this.damageTaken),
      respawnIn: +this.respawnT.toFixed(1),
    };
  }
}
