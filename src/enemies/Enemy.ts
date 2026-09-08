import * as THREE from 'three';
import { T } from '../core/Tuning';
import { RNG } from '../core/RNG';
import { clamp, clamp01, damp, dampAngle } from '../core/MathUtil';
import { Vitals } from '../frame/Vitals';
import { Hostile, HostileState, DamageSource } from '../frame/Types';
import { CombatContext } from '../frame/Context';
import { Archetype, ATTACKS, AttackId, SHIELD_ADVANCE, HARPOON, SPLIT, SHARD, ARCHETYPE_PALETTES } from './Archetypes';
import { rigFor, Chassis } from '../entities/RigCache';
import { MechRig } from '../entities/MechRig';
import { RigDriver } from '../entities/RigDriver';
import { Telegraph } from '../fx/Effects';
import { EliteModifier } from './Elites';

let nextId = 1;
export const resetHostileIds = () => { nextId = 1; };

/**
 * One hostile. Nine-state lifecycle: approach, orbit, windup, strike, recover, evade, staggered,
 * dead — plus the shield-advance traversal that WARDEN owns.
 *
 * Every attack telegraphs on the ground plane and every windup is vanishable. The Director Law
 * (GDD §6.4) is respected here: nothing in this class reads difficulty, changes damage numbers,
 * or makes an attack unvanishable.
 */
export class Enemy implements Hostile {
  readonly id = nextId++;
  readonly archetype: string;
  readonly displayName: string;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  vitals: Vitals;
  band: readonly [number, number];
  hasAttackToken = false;
  tokenCooldown = 0;
  state: HostileState = 'approach';
  currentAttack: AttackId | null = null;
  windupRemaining = 0;
  windupMax = 0;
  targetId = 0;
  rig: MechRig;
  driver: RigDriver;
  /** WARDEN's frontal shield. Breaks only to a Perfect Vanish punish or a pile driver from above. */
  shieldUp: boolean;
  shieldBroken = false;
  get isElite() { return !!this.elite; }
  protected shieldMesh: THREE.Mesh | null = null;
  protected telegraph: Telegraph | null = null;
  protected recoverT = 0;
  private strafeDir: number;
  private strafeT: number;
  protected evadeT = 0;
  protected advance = 0;
  private lockedCentre = new THREE.Vector3();
  private centreLocked = false;
  protected beamT = 0;
  private spawnFade = 0;
  private hitFlash = 0;
  /** Set by upgrades that slow hostile windups (Shared Fault). */
  windupSlow = 1;
  /**
   * ECHO SPLIT: an afterimage this frame has been fooled into aiming at. Steering still uses the
   * real pilot — being fooled is an AIMING error, not a navigation one, which is what makes the
   * upgrade a survivability tool rather than a crowd-control one.
   */
  decoy: THREE.Vector3 | null = null;
  decoyT = 0;
  /** ANCHOR DRIVER: pinned to the floor. No movement, no flight. Attacks still resolve. */
  pinned = 0;
  /** SINGULARITY ENGINE: an external pull applied for a short window after a nearby stagger. */
  pull: { to: THREE.Vector3; speed: number; t: number } | null = null;
  /** SPLITTER: set on the shards so a shard can never split again. */
  isShard = false;
  private hasSplit = false;
  /** Behavioural elite modifier, or null. Elites carry no stat inflation (non-negotiable 7). */
  elite: EliteModifier | null = null;
  protected lastGround = 0;
  protected baseScale = 1;
  /** PREDATOR READ lead-in: the attack is chosen and shown before the windup opens. */
  private leadT = 0;
  private pending: AttackId | null = null;

  constructor(public spec: Archetype, protected ctx: CombatContext, position: THREE.Vector3) {
    this.archetype = spec.id;
    this.displayName = spec.name;
    this.pos.copy(position);
    this.band = spec.band;
    this.vitals = new Vitals(spec.structure, spec.impactMax, T.staggerEnemy);
    this.shieldUp = spec.frontalShield;
    const rng = RNG.stream('ai');
    this.strafeDir = rng.sign();
    this.strafeT = rng.range(1.2, 3.2);
    this.tokenCooldown = rng.range(0, 1.2);

    const chassis: Chassis = spec.chassis === 'standard'
      ? (spec.id === 'brawler' || spec.id === 'hook' ? 'brawler' : spec.id === 'lancer' ? 'sniper' : 'standard')
      : spec.chassis;
    this.rig = rigFor(chassis, spec.palette);
    this.rig.root.scale.setScalar(spec.scale * (spec.chassis === 'drone' ? 1.6 : 1));
    this.baseScale = spec.scale * (spec.chassis === 'drone' ? 1.6 : 1);
    this.driver = new RigDriver(this.rig);
    ctx.scene.add(this.rig.root);
    this.spawnFade = 0.6;

    if (this.shieldUp) {
      const g = new THREE.CylinderGeometry(6.2, 6.2, 11, 20, 1, true, -0.9, 1.8);
      const m = new THREE.MeshStandardMaterial({
        color: 0x1a1206, emissive: spec.palette.glow, emissiveIntensity: 1.5,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.3, metalness: 0.4,
      });
      this.shieldMesh = new THREE.Mesh(g, m);
      this.shieldMesh.position.set(0, 6, 4.6);
      this.rig.root.add(this.shieldMesh);
    }
  }

  /** Mark this frame as an elite. Behaviour only — structure, impact and damage are untouched. */
  makeElite(mod: EliteModifier) {
    this.elite = mod;
    if (mod.frontalShield && !this.shieldUp) {
      this.shieldUp = true;
      const g = new THREE.CylinderGeometry(6.2, 6.2, 11, 20, 1, true, -0.9, 1.8);
      const m = new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: this.spec.palette.glow, emissiveIntensity: 1.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.3, metalness: 0.4 });
      this.shieldMesh = new THREE.Mesh(g, m);
      this.shieldMesh.position.set(0, 6, 4.6);
      this.rig.root.add(this.shieldMesh);
    }
    // a visible mark: elites read at a glance without changing the silhouette contract
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(7.4, 0.34, 6, 30).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    halo.position.y = 0.9;
    halo.name = 'eliteHalo';
    this.rig.root.add(halo);
    this.baseScale *= 1.08;
  }

  get alive() { return this.vitals.alive; }
  get vanishable() { return this.state === 'windup' && this.windupRemaining > 0; }
  get glow() { return this.spec.palette.glow; }
  get eye() { return this.pos.clone().setY(this.pos.y + 8); }

  /** Distance to the pressure target, planar. Never fooled by a decoy: steering is navigation. */
  protected distance() { const d = this.ctx.target.pos.clone().sub(this.pos); d.y = 0; return d.length(); }

  /**
   * Where this frame BELIEVES the pilot is. Equal to the pilot's position unless an ECHO SPLIT
   * afterimage has taken this frame's attention. Every telegraph anchor and every strike reads
   * this; steering reads the real position.
   */
  protected aim(): THREE.Vector3 { return this.decoy ?? this.ctx.target.pos; }

  releaseToken() {
    if (this.hasAttackToken) { this.hasAttackToken = false; this.tokenCooldown = this.ctx.director.tokenCooldownSeconds; }
  }

  cancelAttack() {
    this.leadT = 0; this.pending = null;
    this.ctx.fx.killTelegraph(this.telegraph);
    this.telegraph = null;
    this.currentAttack = null;
    this.windupRemaining = 0;
    this.state = 'evade';
    this.evadeT = 1.0;
    this.releaseToken();
  }

  applyHit(damage: number, impact: number, source: DamageSource) {
    if (!this.alive) return;
    // WARDEN's frontal shield: only a Perfect Vanish punish (Exposed) or a pile driver from
    // above gets through the front. Anything else is stopped cold.
    if (this.shieldUp && !this.shieldBroken && !this.vitals.isExposed && source !== 'pile' && source !== 'breach' && source !== 'phase') {
      const toAttacker = this.ctx.target.pos.clone().sub(this.pos).setY(0).normalize();
      const facing = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      if (toAttacker.dot(facing) > 0.35) {
        this.ctx.fx.impact(this.pos.clone().setY(6).addScaledVector(facing, 5), 0xffd06a, 1.6, 4);
        this.ctx.audio.ricochet();
        return;
      }
    }
    // A plate breaks to a Perfect Vanish punish, a driver from above, or BREACH DRIVER — three
    // routes, all of them acts of piloting rather than sustained damage.
    if (this.shieldUp && !this.shieldBroken && (source === 'pile' || source === 'breach' || this.vitals.isExposed)) this.breakShield();

    const before = this.vitals.staggered;
    const r = this.vitals.hit(damage, impact, this.ctx.time, this.ctx.punish.exposedMult);
    this.hitFlash = 1;
    if (r === 2 && !before) {
      this.state = 'staggered';
      this.releaseToken();
      this.ctx.fx.killTelegraph(this.telegraph);
      this.telegraph = null;
      this.currentAttack = null;
      this.split();
      this.ctx.onHostileStagger(this, source);
    }
    if (!this.alive) this.die();
  }

  private breakShield() {
    this.shieldBroken = true;
    if (this.shieldMesh) { this.rig.root.remove(this.shieldMesh); this.shieldMesh.geometry.dispose(); (this.shieldMesh.material as THREE.Material).dispose(); this.shieldMesh = null; }
    this.ctx.fx.impact(this.pos.clone().setY(7), 0xffd06a, 5, 22);
    this.ctx.fx.ring(this.pos, 2, 22, 0xffd06a, 0.5);
    this.ctx.audio.stagger();
  }

  /**
   * SPLITTER. On stagger the frame comes apart into two shards holding their own bearings, so a
   * hostile you just beat becomes two hostiles you have not — and the encirclement arc widens as
   * a direct consequence of your own success. Shards never split again.
   */
  protected split() {
    if (this.spec.id !== 'splitter' || this.isShard || this.hasSplit) return;
    this.hasSplit = true;
    const side = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    for (const s of [-1, 1]) {
      const p = this.pos.clone().addScaledVector(side, s * SPLIT.separation * 0.5);
      this.ctx.confine(p, 12);
      p.y = this.ctx.groundAt(p.x, p.z);
      const shard = new Enemy(SHARD, this.ctx, p);
      shard.isShard = true;
      // the shards inherit the moment, not the damage: each opens on its own bearing, unstaggered
      shard.vel.copy(side).multiplyScalar(s * 34);
      this.ctx.hostiles.push(shard);
      this.ctx.fx.ring(p, 2, 22, ARCHETYPE_PALETTES.splitter.glow, 0.45);
    }
    this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 7), ARCHETYPE_PALETTES.splitter.glow, 4, 16);
    this.ctx.audio.deploy();
    this.ctx.onHostileSplit?.(this);
    // the parent is spent: its structure went into the shards
    this.vitals.structure = 0;
    this.die();
  }

  die() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.releaseToken();
    this.ctx.fx.killTelegraph(this.telegraph);
    this.telegraph = null;
    this.ctx.fx.impact(this.pos.clone().setY(7), this.glow, 7, 30);
    this.ctx.fx.vfx.explosion(this.pos.clone().setY(6), 1.4);
    this.ctx.fx.ring(this.pos, 2, 34, this.glow, 0.6);
    this.ctx.audio.explosion(1.1);
    this.ctx.scene.remove(this.rig.root);
    this.ctx.onHostileDeath(this);
  }

  dispose() { this.ctx.scene.remove(this.rig.root); }

  // ------------------------------------------------------------------------------ simulation
  update(dt: number) {
    this.vitals.tick(dt, this.ctx.time);
    if (!this.alive) return;
    this.spawnFade = Math.max(0, this.spawnFade - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.targetId = 0;
    this.decoyT = Math.max(0, this.decoyT - dt);
    if (this.decoyT <= 0) this.decoy = null;
    this.pinned = Math.max(0, this.pinned - dt);
    if (this.pull) {
      this.pull.t -= dt;
      if (this.pull.t <= 0) this.pull = null;
    }

    if (this.vitals.staggered) {
      this.state = 'staggered';
      this.releaseToken();
      this.vel.multiplyScalar(Math.exp(-3 * dt));
    } else if (this.state === 'staggered') {
      this.state = 'approach';
    }

    if (T.aiEnabled && !this.vitals.staggered) this.think(dt);
    this.integrate(dt);
    this.present(dt);
  }

  protected think(dt: number) {
    const dist = this.distance();
    switch (this.state) {
      case 'windup': {
        this.windupRemaining -= dt * this.windupSlow;
        if (this.telegraph && this.currentAttack) {
          const spec = ATTACKS[this.currentAttack];
          // The read tracks you until the attack commits, then locks. That final 0.18s is what
          // makes a ground telegraph honest: late repositioning beats it, not just a vanish.
          if (spec.kind !== 'mine' && spec.kind !== 'advance' && this.windupRemaining > 0.18) this.telegraph.follow = this.aim();
          else { this.telegraph.follow = null; this.lockedCentre.copy(this.telegraph.mesh.position); this.centreLocked = true; }
        }
        if (this.windupRemaining <= 0) this.strike();
        break;
      }
      case 'strike': {
        this.beamT -= dt;
        if (this.currentAttack === 'shield-advance') {
          const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const step = SHIELD_ADVANCE.speed * dt;
          this.advance -= step;
          this.pos.addScaledVector(dir, step);
          // contact damage along the path
          if (this.distance() < 13) { this.hitTarget('shield-advance'); this.advance = 0; }
          if (this.advance <= 0) this.enterRecover();
        } else if (this.beamT <= 0) this.enterRecover();
        break;
      }
      case 'recover': {
        this.recoverT -= dt;
        if (this.recoverT <= 0) { this.state = 'approach'; this.releaseToken(); }
        break;
      }
      case 'evade': {
        this.evadeT -= dt;
        if (this.evadeT <= 0) this.state = 'approach';
        break;
      }
      default: {
        if (this.leadT > 0) {
          this.leadT -= dt;
          if (this.leadT <= 0 && this.pending) { const a = this.pending; this.pending = null; this.beginAttack(a); }
          break;
        }
        if (this.ctx.director.mayOpenAttack(this, this.ctx.hostiles) && this.canOpen(dist)) {
          if (this.ctx.leadFor(this) > 0) this.prepareAttack();
          else this.beginAttack(this.pickAttack());
        } else this.state = dist > this.band[1] * 1.05 || dist < this.band[0] * 0.95 ? 'approach' : 'orbit';
      }
    }
    this.steer(dt, dist);
  }

  /**
   * A unit tangential vector pointing away from the nearest OTHER hostile's bearing around the
   * pilot, or zero when this frame already has the sky to itself. Bearings, not distances: two
   * frames 200m apart on the same bearing contribute one bearing to the arc, and the arc is the
   * only thing that buys tokens.
   */
  private bearingPush(toTarget: THREE.Vector3): THREE.Vector3 {
    const p = this.ctx.target.pos;
    const mine = Math.atan2(this.pos.x - p.x, this.pos.z - p.z);
    let closest = 0, best = Math.PI;
    for (const o of this.ctx.hostiles) {
      if (o === this || !o.alive) continue;
      const theirs = Math.atan2(o.pos.x - p.x, o.pos.z - p.z);
      let dd = mine - theirs;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      if (Math.abs(dd) < best) { best = Math.abs(dd); closest = dd; }
    }
    // The push runs all the way out to antipodal. Cutting it off earlier (at 119 degrees) left
    // the formation settling at a comfortable spacing well short of the arc the downside is
    // supposed to open: measured +7.4 degrees against a +12 bar. Frames now keep separating
    // until they are opposite each other, and the strafe and band clamps decide where that
    // actually lands.
    const tangent = new THREE.Vector3(-toTarget.z, 0, toTarget.x);
    const away = closest >= 0 ? 1 : -1;
    return tangent.multiplyScalar(away * (1 - best / Math.PI));
  }

  protected canOpen(dist: number) {
    if (!this.ctx.targetable()) return false;
    const spec = this.spec;
    return dist < spec.band[1] * 1.35 && dist > 4;
  }

  /** Distance-band steering. Hostiles hold their range and orbit; they never simply mob. */
  protected steer(dt: number, dist: number) {
    const toTarget = this.ctx.target.pos.clone().sub(this.pos);
    toTarget.y = 0;
    const d = toTarget.clone().normalize();
    const [lo, hi] = this.band;
    const wish = new THREE.Vector3();

    if (this.state === 'windup') {
      wish.copy(d).multiplyScalar(this.currentAttack === 'lunge' ? 0.9 : 0.12);
    } else if (this.state === 'strike') {
      wish.set(0, 0, 0);
    } else if (this.state === 'evade') {
      wish.set(-d.z, 0, d.x).multiplyScalar(this.strafeDir * 1.4).addScaledVector(d, -0.55);
    } else if (dist > hi) {
      wish.copy(d);
    } else if (dist < lo) {
      wish.copy(d).multiplyScalar(-1);
    } else {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = RNG.stream('ai').range(1.6, 3.4); }
      wish.set(-d.z, 0, d.x).multiplyScalar(this.strafeDir * (this.elite?.orbitScale ?? 1));
      // The forward bias is what turns orbiting into encirclement pressure. FLANK DEBT and the
      // FALL ladder both raise it; neither can touch how many tokens exist.
      wish.addScaledVector(d, this.ctx.director.forwardBias);
      // FLANK DEBT: push apart in BEARING, so the formation occupies a wider span around the
      // pilot. Tangential only — this moves where a frame stands, never what it is allowed to do.
      const sep = this.ctx.director.bearingSeparation;
      if (sep > 0) wish.addScaledVector(this.bearingPush(d), sep);
      // ANCHOR elites pull the rest of the formation onto themselves, so the arc will not close
      // until the anchor is dealt with.
      const anchor = this.ctx.hostiles.find((h) => h !== this && h.alive && (h as Enemy).elite?.cohesion);
      if (anchor) {
        const toAnchor = anchor.pos.clone().sub(this.pos).setY(0);
        if (toAnchor.lengthSq() > 1) wish.addScaledVector(toAnchor.normalize(), (anchor as Enemy).elite!.cohesion);
      }
    }

    // ANCHOR DRIVER: pinned means pinned. The frame still swings, it just cannot leave.
    if (this.pinned > 0) {
      this.vel.set(0, 0, 0);
      const g = this.ctx.groundAt(this.pos.x, this.pos.z);
      this.lastGround = g;
      if (this.pos.y > g + 0.2) this.vel.y = -T.gravity * 2;   // pinned means pinned to the FLOOR
      this.yaw = dampAngle(this.yaw, Math.atan2(toTarget.x, toTarget.z), 5, dt);
      return;
    }
    // SINGULARITY ENGINE: an external pull toward the frame that just broke.
    if (this.pull) {
      const to = this.pull.to.clone().sub(this.pos).setY(0);
      if (to.lengthSq() > 1) {
        to.normalize().multiplyScalar(this.pull.speed);
        this.vel.x = to.x; this.vel.z = to.z;
      }
      const g = this.ctx.groundAt(this.pos.x, this.pos.z);
      this.lastGround = g;
      if (!this.spec.flying) this.vel.y = this.pos.y > g + 0.2 ? this.vel.y - T.gravity * dt : 0;
      this.yaw = dampAngle(this.yaw, Math.atan2(toTarget.x, toTarget.z), 6, dt);
      return;
    }

    if (this.ctx.confine(this.pos.clone(), 0)) {
      // steer back toward the volume centre when pressed against the boundary
      const back = this.pos.clone().setY(0).normalize().multiplyScalar(-1.5);
      wish.add(back);
    }

    if (wish.lengthSq() > 0) wish.normalize();
    const speed = this.spec.speed * (this.state === 'windup' ? 0.35 : this.state === 'recover' ? 0.6 : 1);
    const lambda = this.spec.accel / 22;
    this.vel.x = damp(this.vel.x, wish.x * speed, lambda, dt);
    this.vel.z = damp(this.vel.z, wish.z * speed, lambda, dt);

    // vertical: HARRIER never lands
    const ground = this.ctx.groundAt(this.pos.x, this.pos.z);
    this.lastGround = ground;
    if (this.spec.flying) {
      const want = ground + this.spec.cruiseAltitude + Math.sin(this.ctx.time * 0.9 + this.id) * 5
        + (this.currentAttack === 'strafe-run' && this.state === 'strike' ? -12 : 0);
      this.vel.y = damp(this.vel.y, (want - this.pos.y) * 1.8, 6, dt);
    } else {
      this.vel.y = this.pos.y > ground + 0.2 ? this.vel.y - T.gravity * dt : 0;
    }

    this.yaw = dampAngle(this.yaw, Math.atan2(toTarget.x, toTarget.z), this.state === 'strike' ? 1.5 : 7, dt);
  }

  private integrate(dt: number) {
    this.pos.addScaledVector(this.vel, dt);
    const ground = this.lastGround || this.ctx.groundAt(this.pos.x, this.pos.z);
    if (!this.spec.flying && this.pos.y < ground) { this.pos.y = ground; this.vel.y = 0; }
    this.ctx.confine(this.pos, 6);
  }

  // ------------------------------------------------------------------------------ attacks
  /** Weighted attack selection, straight from the archetype's authored percentages. */
  protected pickAttack(): AttackId {
    const rng = RNG.stream('ai');
    // PHASED elites lean on the tightest read in their own table — a legal shaping of attack
    // selection, which the Director Law already permits.
    if (this.elite?.tightestRead) {
      const weights = this.spec.attacks.map((a) => a.weight * (ATTACKS[a.id].windup <= 0.8 ? 3 : 1));
      return rng.weighted(this.spec.attacks.map((a) => a.id), weights);
    }
    return rng.weighted(this.spec.attacks.map((a) => a.id), this.spec.attacks.map((a) => a.weight));
  }

  /** PREDATOR READ only: commit to the attack early and show a faint precursor ring. */
  private prepareAttack() {
    this.pending = this.pickAttack();
    this.leadT = this.ctx.leadFor(this);
    const spec = ATTACKS[this.pending];
    const anchor = spec.kind === 'mine' || spec.kind === 'advance' ? this.pos : this.aim();
    this.telegraph = this.ctx.fx.telegraph(anchor, spec.telegraph * 0.85, this.glow, this.leadT, false, spec.kind === 'mine' || spec.kind === 'advance' ? null : this.aim());
  }

  protected beginAttack(id: AttackId) {
    const spec = ATTACKS[id];
    this.ctx.fx.killTelegraph(this.telegraph);
    this.centreLocked = false;
    this.currentAttack = id;
    this.state = 'windup';
    this.windupRemaining = this.windupMax = spec.windup;
    this.recoverT = spec.recovery;

    const anchor = spec.kind === 'mine' ? this.pos : spec.kind === 'advance' ? this.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), SHIELD_ADVANCE.distance * 0.5) : this.aim();
    this.telegraph = this.ctx.fx.telegraph(anchor, spec.telegraph, this.glow, spec.windup, id === 'quake');
    this.ctx.audio.windup(spec.windup);
    this.ctx.onHostileWindupStart(this);
  }

  protected enterRecover() { this.state = 'recover'; this.recoverT = (this.currentAttack ? ATTACKS[this.currentAttack].recovery : 0.6) * (this.elite?.recoveryScale ?? 1); this.currentAttack = null; }

  protected hitTarget(attack: AttackId) {
    const spec = ATTACKS[attack];
    this.ctx.target.receiveHit(spec.damage, spec.impact, this, attack);
  }

  protected strike() {
    const id = this.currentAttack;
    if (!id) { this.enterRecover(); return; }
    const spec = ATTACKS[id];
    this.ctx.fx.killTelegraph(this.telegraph);
    this.telegraph = null;
    this.state = 'strike';
    this.beamT = 0.24;
    const from = this.eye;
    const believed = this.aim();
    const to = believed.clone().setY(believed.y + 8);
    const c = this.glow;
    const withinTelegraph = () => this.ctx.target.pos.distanceTo(this.telegraphCentre(id)) < spec.telegraph + 4;

    switch (id) {
      case 'volley': {
        // three travelling rounds with light spread: outrunnable, and interceptable by
        // ORBITING INTERCEPTORS, which is what makes that evolution a spatial upgrade.
        for (let k = 0; k < 3; k++) {
          const aim = to.clone().add(new THREE.Vector3(this.ctx.fx.jitter(3), this.ctx.fx.jitter(2), this.ctx.fx.jitter(3)));
          const dir = aim.clone().sub(from).normalize();
          this.ctx.ordnance.spawnBolt({ pos: from, vel: dir.multiplyScalar(230), damage: spec.damage / 3, impact: spec.impact / 3, hostile: true, colour: c, radius: 3, source: this, attack: id, life: 2.6 });
        }
        this.ctx.audio.enemyShot();
        this.beamT = 0.12;
        break;
      }
      case 'lance': {
        this.ctx.fx.beam(from, to, c, 0.24, 2.2);
        this.ctx.audio.lance();
        if (withinTelegraph()) this.hitTarget(id);
        this.beamT = 0.24;
        break;
      }
      case 'lunge': {
        this.ctx.fx.ghost(this.rig.root, c, 0.35);
        const dir = believed.clone().sub(this.pos).setY(0).normalize();
        const gap = Math.max(0, this.distance() - 13);
        this.pos.addScaledVector(dir, gap);
        this.ctx.fx.impact(to, c, 3.4, 10);
        this.ctx.audio.melee();
        this.driver.swingBlade();
        if (this.distance() < 20) this.hitTarget(id);
        this.beamT = 0.16;
        break;
      }
      case 'sweep': {
        this.ctx.fx.ring(this.pos, 3, spec.telegraph, c, 0.32);
        this.ctx.fx.impact(this.pos.clone().setY(6), c, 4.6, 14);
        this.ctx.audio.melee();
        this.driver.swingBlade();
        if (this.distance() < spec.telegraph + 3) this.hitTarget(id);
        this.beamT = 0.18;
        break;
      }
      case 'mortar': {
        // arcing shell that lands at the telegraph centre; the ring stays up so the read holds
        const centre = this.telegraphCentre(id).clone();
        const flight = 1.1;
        const g = 90;
        const d = centre.clone().sub(from);
        const vel = new THREE.Vector3(d.x / flight, d.y / flight + 0.5 * g * flight, d.z / flight);
        this.ctx.ordnance.spawnBolt({ pos: from, vel, damage: spec.damage, impact: spec.impact, hostile: true, colour: c, radius: spec.telegraph * 0.55, source: this, attack: id, life: flight + 0.6, gravity: g });
        this.ctx.fx.telegraph(centre, spec.telegraph, c, flight);
        this.ctx.audio.enemyShot();
        this.beamT = 0.2;
        break;
      }
      case 'strafe-run': {
        const dir = this.ctx.target.pos.clone().sub(this.pos).setY(0).normalize();
        this.vel.addScaledVector(dir, 90);
        for (let k = 0; k < 5; k++) {
          const aim = to.clone().add(new THREE.Vector3(this.ctx.fx.jitter(4), this.ctx.fx.jitter(2), this.ctx.fx.jitter(4)));
          const bdir = aim.clone().sub(from).normalize();
          this.ctx.ordnance.spawnBolt({ pos: from, vel: bdir.multiplyScalar(250), damage: spec.damage / 5, impact: spec.impact / 5, hostile: true, colour: c, radius: 3, source: this, attack: id, life: 2.2 });
        }
        this.ctx.audio.enemyShot();
        this.beamT = 0.35;
        break;
      }
      case 'mine-drop': {
        // GDD §7: arms after 0.55s, 10m trigger, persists 8.0s
        const at = this.pos.clone().setY(this.ctx.groundAt(this.pos.x, this.pos.z) + 1.6);
        this.ctx.ordnance.spawnMine(at, spec.damage, spec.impact, c, true);
        this.ctx.audio.deploy();
        this.beamT = 0.12;
        break;
      }
      case 'shield-advance': {
        // GDD §7: advances 22m behind the frontal shield; contact damage along the path
        this.advance = SHIELD_ADVANCE.distance;
        this.ctx.audio.advance();
        this.ctx.shake(0.25);
        this.beamT = 99; // ends when the advance completes
        break;
      }
      /**
       * SCATTER — SPLITTER's short-range fan. Six rounds across a wide cone: individually weak,
       * collectively a wall, and completely outrunnable sideways. It is the attack that makes
       * a SPLITTER's band worth respecting before you break it in half.
       */
      case 'scatter': {
        for (let k = 0; k < 6; k++) {
          const spread = (k - 2.5) * 0.085;
          const dir = to.clone().sub(from).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
          this.ctx.ordnance.spawnBolt({ pos: from, vel: dir.multiplyScalar(190), damage: spec.damage / 6, impact: spec.impact / 6, hostile: true, colour: c, radius: 3.4, source: this, attack: id, life: 1.5 });
        }
        this.ctx.audio.enemyShot();
        this.beamT = 0.16;
        break;
      }
      /**
       * HARPOON — HOOK's whole identity. It does not out-damage you, it relocates you: 30m
       * toward the frame that fired it, which is very often back into the middle of the
       * formation you had just broken out of. The telegraph is a tight 11m ring, so it is
       * readable and vanishable like everything else; what it costs you is position.
       */
      case 'harpoon': {
        this.ctx.fx.tracer(from, to, c, 1.6, 0.35);
        this.ctx.audio.deploy();
        if (withinTelegraph()) {
          this.hitTarget(id);
          const dir = this.pos.clone().sub(this.ctx.target.pos).setY(0);
          if (dir.lengthSq() > 1) this.ctx.target.applyPull(dir.normalize(), HARPOON.pull);
          this.ctx.fx.ring(this.ctx.target.pos, 3, 20, c, 0.4);
          this.ctx.shake(0.5);
        }
        this.beamT = 0.28;
        break;
      }
      /** POUR — KILNWORKS. Molten line along the casting run; the read is the floor, as always. */
      case 'pour': {
        const centre = this.telegraphCentre(id).clone();
        this.ctx.fx.ring(centre, 4, spec.telegraph, c, 0.7);
        this.ctx.fx.impact(centre.clone().setY(centre.y + 3), c, 6, 24);
        this.ctx.audio.explosion(1.1);
        this.ctx.shake(0.7);
        if (withinTelegraph() && this.ctx.target.pos.y < centre.y + 24) this.hitTarget(id);
        this.beamT = 0.34;
        break;
      }
      case 'quake': {
        const centre = this.pos.clone();
        this.ctx.fx.ring(centre, 4, spec.telegraph, c, 0.6);
        this.ctx.fx.impact(centre.clone().setY(2), c, 6, 26);
        this.ctx.audio.explosion(1.3);
        this.ctx.shake(0.9);
        if (this.distance() < spec.telegraph && this.ctx.target.pos.y < this.ctx.groundAt(this.ctx.target.pos.x, this.ctx.target.pos.z) + 22) this.hitTarget(id);
        this.beamT = 0.3;
        break;
      }
    }
    if (id !== 'shield-advance') this.beamT = Math.max(0.08, this.beamT);
  }

  protected telegraphCentre(id: AttackId): THREE.Vector3 {
    const spec = ATTACKS[id];
    if (this.centreLocked && spec.kind !== 'mine' && spec.kind !== 'advance') return this.lockedCentre;
    if (spec.kind === 'mine') return this.pos;
    if (spec.kind === 'advance') return this.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), SHIELD_ADVANCE.distance * 0.5);
    return this.aim();
  }

  // ------------------------------------------------------------------------------ presentation
  protected present(dt: number) {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    const grounded = this.spec.flying ? false : this.pos.y <= this.lastGround + 0.3;
    this.driver.update(dt, {
      pos: this.pos, vel: this.vel, yaw: this.yaw,
      aimYaw: Math.atan2(this.ctx.target.pos.x - this.pos.x, this.ctx.target.pos.z - this.pos.z),
      aimPitch: clamp((this.ctx.target.pos.y - this.pos.y) / 90, -0.4, 0.4),
      grounded, maxSpeed: this.spec.speed,
      thrust01: clamp01(Math.hypot(this.vel.x, this.vel.z) / this.spec.speed),
      thrustUp01: this.spec.flying ? 0.7 : clamp01(this.vel.y / 40),
      quickDir: null,
      stagger01: this.vitals.staggered ? 1 : 0,
    });

    // Exposed hostiles flare: the punish window has to be visible from across the arena.
    const exposed = this.vitals.isExposed;
    const flare = exposed ? 0.5 + Math.sin(this.ctx.time * 26) * 0.5 : 0;
    const em = 1 + flare * 3.5 + this.hitFlash * 2;
    this.rig.mats.glow.emissiveIntensity = 3.2 * em;
    this.rig.mats.sensor.emissiveIntensity = 2.4 * em;
    if (this.shieldMesh) (this.shieldMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + flare;
    const s = this.baseScale * (1 + flare * 0.04);
    this.rig.root.scale.setScalar(s * (1 - this.spawnFade * 0.35));
    // Articulated rigs are ~40 draws each. Past 210m the silhouette is all that reads, so the
    // merged rest-pose LOD takes over and a busy arena stays inside budget.
    this.rig.setLOD(this.distance() > 150);
    this.rig.root.visible = !(this.vitals.staggered && Math.sin(this.ctx.time * 40) > 0.62);
  }

  snapshot() {
    return {
      id: this.id,
      archetype: this.archetype,
      position: [+this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2)],
      velocity: [+this.vel.x.toFixed(2), +this.vel.y.toFixed(2), +this.vel.z.toFixed(2)],
      structure: Math.round(this.vitals.structure),
      impact: Math.round(this.vitals.impact),
      staggered: this.vitals.staggered,
      staggerRemaining: +this.vitals.stagger.toFixed(2),
      exposed: this.vitals.isExposed,
      exposedRemaining: +this.vitals.exposed.toFixed(2),
      currentAttack: this.currentAttack,
      windupRemaining: +this.windupRemaining.toFixed(3),
      preferredBand: [this.band[0], this.band[1]],
      hasAttackToken: this.hasAttackToken,
      targetId: this.targetId,
    };
  }
}
