import * as THREE from 'three';
import { T } from '../core/Tuning';
import { clamp, clamp01, damp } from '../core/MathUtil';
import { Vitals } from './Vitals';
import { Hostile, PressureTarget, DamageSource } from './Types';
import { LockSystem } from './Lock';
import { CombatContext } from './Context';
import { buildPlayerMech } from '../entities/MechModels';
import { MechRig } from '../entities/MechRig';
import { RigDriver } from '../entities/RigDriver';
import { MechPalette } from '../entities/Materials';
import { RunState } from '../build/RunState';
import { REACTORS } from '../build/Reactors';
import { UPGRADE_VALUES } from '../build/Upgrades';
import { EVOLUTION_VALUES } from '../build/Weapons';
import { InputManager } from '../core/Input';

/** The player's saturated, additive palette — the only high-value silhouette on screen. */
export const PLAYER_PAL: MechPalette = {
  armor: 0xcfd4d8, armor2: 0x232a31, dark: 0x14181c, metal: 0x707880, joint: 0x22262a,
  accent: 0x2fd0e8, glow: 0x8ff4ff,
};
export const PLAYER_GLOW = 0x8ff4ff;

export type PlayerStateLabel = 'STANDBY' | 'BOOST SKATE' | 'QUICK BOOST' | 'ASSAULT BOOST' | 'VERTICAL THRUST' | 'DESCENT' | 'AIRBORNE' | 'STAGGERED' | 'VANISH';

/** Modifiers derived from the reactor, upgrades and weapon evolutions. */
export interface BuildMods {
  structure: number;
  vanishCost: number;
  vanishWindow: number;
  vanishRefunds: boolean;
  cloneDuration: number;
  cloneScale: number;
  regenGround: number;
  regenAir: number;
  railCore: boolean;
  slipstream: boolean;
  splitLock: boolean;
  weightOfAttention: boolean;
  chainRead: boolean;
  executionProtocol: boolean;
  cascadeBreak: boolean;
  reactorBleed: boolean;
  telegraphLead: number;
  bladeImpact: number;
  pileCooldown: number;
  impactNeverDecays: boolean;
  // evolutions
  tetherBlade: boolean;
  momentumRailgun: boolean;
  orbitingInterceptors: boolean;
  seismicDriver: boolean;
}

export function defaultMods(): BuildMods {
  return {
    structure: T.playerStructure, vanishCost: T.vanishCost, vanishWindow: T.vanishWindow, vanishRefunds: false,
    cloneDuration: 0, cloneScale: UPGRADE_VALUES.mirrorCloneDamageScale,
    regenGround: T.regenGround, regenAir: T.regenAir,
    railCore: false, slipstream: false, splitLock: false, weightOfAttention: false, chainRead: false,
    executionProtocol: false, cascadeBreak: false, reactorBleed: false, telegraphLead: 0,
    bladeImpact: T.bladeImpact, pileCooldown: T.pileCooldown, impactNeverDecays: false,
    tetherBlade: false, momentumRailgun: false, orbitingInterceptors: false, seismicDriver: false,
  };
}

export interface PlayerEvents {
  onPerfectVanish(target: Hostile): void;
  onQuickBoost(): void;
  onHostileStaggered(h: Hostile, by: DamageSource): void;
  onHostileKilled(h: Hostile, by: DamageSource): void;
  /** A hit landed on an already-staggered hostile: a stagger conversion, for CONVERSION scoring. */
  onConversion(h: Hostile): void;
  onDamageTaken(amount: number): void;
  onStaggered(): void;
  onDeath(): void;
  onFlash(text: string, colour: string): void;
  enterSlow(scale: number, realDuration: number): void;
}

/**
 * The player frame. Movement, vitals, energy, the four hardpoints, the vanish, and every
 * upgrade hook. This is the class the GDD calls the Frame: it knows nothing about chains,
 * FORGEs or scoring.
 */
export class Player implements PressureTarget {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = Math.PI;
  pitch = -0.06;
  energy = T.energyMax;
  vitals: Vitals;
  grounded = true;
  state: PlayerStateLabel = 'STANDBY';
  lock = new LockSystem();
  mods = defaultMods();
  rig: MechRig;
  driver: RigDriver;

  // --- movement timers ---
  private quickT = 0;
  quickCD = 0;
  private dash = new THREE.Vector3();
  assault = false;
  private regenT = 0;
  private slipstreamStacks = 0;
  private slipstreamT = 0;
  invuln = 0;
  vanishStreak = 0;
  private lastVanishAt = -99;
  private railgunCharge = 0;
  private railgunCharging = false;

  // --- weapon timers ---
  private fireCD = 0;
  private bladeCD = 0;
  private rackCD = 0;
  private missileQueue = 0;
  private missileT = 0;
  private pileCD = 0;
  private piling = false;
  private tether: { target: Hostile; t: number } | null = null;

  /** Set true while the FORGE owns the machine — the only place it is completely still. */
  frozen = false;

  constructor(private ctx: CombatContext, private events: PlayerEvents) {
    this.vitals = new Vitals(T.playerStructure, T.playerImpactMax, T.staggerPlayer);
    this.rig = buildPlayerMech(PLAYER_PAL);
    this.driver = new RigDriver(this.rig);
    ctx.scene.add(this.rig.root);
  }

  // ------------------------------------------------------------------ PressureTarget
  forward(): THREE.Vector3 { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(): THREE.Vector3 { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get energy01() { return this.energy / T.energyMax; }
  get altitude() { return this.pos.y - this.ctx.groundAt(this.pos.x, this.pos.z); }

  receiveHit(damage: number, impact: number, from: Hostile | null, attack: string) {
    if (T.godMode || this.invuln > 0 || !this.vitals.alive) return;
    let dmg = damage;
    // WEIGHT OF ATTENTION: unlocked hostiles deal +25% damage to you.
    if (this.mods.weightOfAttention && from && !this.lock.all.includes(from)) dmg *= 1 + UPGRADE_VALUES.weightUnlockedIncoming;
    const before = this.vitals.structure;
    const r = this.vitals.hit(dmg, impact, this.ctx.time);
    this.events.onDamageTaken(before - this.vitals.structure);
    this.vanishStreak = 0;
    this.ctx.audio.playerHit(r === 2);
    this.ctx.shake(r === 2 ? 1.1 : 0.42);
    this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 9), from ? 0xff8a5c : 0xff5a5a, 3, 8);
    void attack;
    if (r === 2) { this.assault = false; this.events.onStaggered(); }
    if (!this.vitals.alive) this.events.onDeath();
  }

  // ------------------------------------------------------------------ build
  applyBuild(run: RunState) {
    const m = defaultMods();
    const reactor = REACTORS[run.reactor];
    m.structure = reactor.structure;
    m.vanishCost = reactor.vanishCost;
    m.cloneDuration = reactor.vanishCloneDuration;
    m.regenGround = reactor.regenGround;
    m.regenAir = reactor.regenAir;
    m.pileCooldown = reactor.pileCooldown;
    m.bladeImpact = reactor.bladeImpact;
    m.impactNeverDecays = reactor.impactNeverDecays;

    for (const id of run.upgrades) {
      switch (id) {
        case 'zero-point-reactor': m.regenGround = UPGRADE_VALUES.zeroPointGroundRegen; m.regenAir = UPGRADE_VALUES.zeroPointAirRegen; break;
        case 'rail-core': m.railCore = true; break;
        case 'slipstream': m.slipstream = true; break;
        case 'mirror-chassis': m.cloneDuration = Math.max(m.cloneDuration, UPGRADE_VALUES.mirrorCloneDuration); break;
        case 'vanish-battery': m.vanishRefunds = true; break;
        case 'predator-read': m.telegraphLead = UPGRADE_VALUES.predatorTelegraphLead; m.vanishWindow = UPGRADE_VALUES.predatorVanishWindow; break;
        case 'split-lock': m.splitLock = true; break;
        case 'weight-of-attention': m.weightOfAttention = true; break;
        case 'chain-read': m.chainRead = true; break;
        case 'execution-protocol': m.executionProtocol = true; break;
        case 'cascade-break': m.cascadeBreak = true; break;
        case 'reactor-bleed': m.reactorBleed = true; break;
      }
    }
    for (const e of run.evolutions) {
      if (e === 'tether-blade') m.tetherBlade = true;
      if (e === 'momentum-railgun') m.momentumRailgun = true;
      if (e === 'orbiting-interceptors') m.orbitingInterceptors = true;
      if (e === 'seismic-driver') m.seismicDriver = true;
    }
    this.mods = m;
    this.lock.capacity = m.splitLock ? UPGRADE_VALUES.splitLockCount : 1;
    this.vitals.noDecay = m.impactNeverDecays;
    this.ctx.ordnance.setInterceptors(m.orbitingInterceptors ? EVOLUTION_VALUES.interceptorCount : 0, PLAYER_GLOW);
  }

  resetForEncounter(keepStructure = true) {
    const s = keepStructure ? this.vitals.structure : this.mods.structure;
    this.vitals.reset(this.mods.structure);
    this.vitals.structure = Math.min(this.mods.structure, s);
    this.vitals.noDecay = this.mods.impactNeverDecays;
    this.energy = T.energyMax;
    this.vel.set(0, 0, 0);
    this.assault = false;
    this.quickT = 0; this.quickCD = 0; this.invuln = 1.2;
    this.fireCD = 0; this.bladeCD = 0; this.rackCD = 0; this.missileQueue = 0; this.pileCD = 0;
    this.piling = false; this.tether = null; this.vanishStreak = 0;
    this.lock.targets = []; this.lock.hard = false;
    this.railgunCharge = 0; this.railgunCharging = false;
    // every field that can influence a later simulation step is reset here, so a RETRY SEED
    // starts from the same state and not merely the same seed
    this.grounded = true; this.pitch = -0.06; this.state = 'STANDBY';
    this.slipstreamStacks = 0; this.slipstreamT = 0; this.missileQueue = 0; this.missileT = 0;
    this.regenT = 0; this.lastVanishAt = -99; this.frozen = false;
    this.driver = new RigDriver(this.rig);
  }

  healToFull() { this.vitals.reset(this.mods.structure); this.energy = T.energyMax; }

  // ------------------------------------------------------------------ per-frame
  /**
   * `dt` is simulation time (bullet-time scaled). Input edges are read on the real clock by the
   * caller, so a vanish still feels instant while the world crawls.
   */
  update(dt: number, input: InputManager, canAct: boolean) {
    this.vitals.tick(dt, this.ctx.time);
    this.quickCD = Math.max(0, this.quickCD - dt);
    this.regenT = Math.max(0, this.regenT - dt);
    this.fireCD = Math.max(0, this.fireCD - dt);
    this.bladeCD = Math.max(0, this.bladeCD - dt);
    this.rackCD = Math.max(0, this.rackCD - dt);
    this.missileT = Math.max(0, this.missileT - dt);
    this.pileCD = Math.max(0, this.pileCD - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.slipstreamT = Math.max(0, this.slipstreamT - dt);
    if (this.slipstreamT <= 0) this.slipstreamStacks = 0;
    this.lock.prune();

    if (this.frozen) { this.present(dt); return; }

    const f = this.forward(), r = this.right();
    const ix = canAct ? input.moveX : 0;
    const iz = canAct ? input.moveZ : 0;
    const wish = f.clone().multiplyScalar(iz).addScaledVector(r, ix);
    if (wish.lengthSq() > 1) wish.normalize();

    const V = this.vitals;

    if (canAct && input.pressed('assault') && this.energy > 5 && !V.staggered) this.assault = !this.assault;
    if (this.energy < 1 || V.staggered) this.assault = false;
    if (canAct && input.pressed('vanish')) this.tryVanish(wish);

    // ---- horizontal ----
    let consuming = false;
    const accelBoost = 1 + this.slipstreamStacks * UPGRADE_VALUES.slipstreamAccelBonus;
    if (this.quickT > 0) {
      this.quickT = Math.max(0, this.quickT - dt);
      this.vel.x = this.dash.x * T.quickSpeed;
      this.vel.z = this.dash.z * T.quickSpeed;
      this.state = 'QUICK BOOST';
    } else if (this.assault) {
      const d = f.clone().multiplyScalar(iz < 0 ? -1 : 1).addScaledVector(r, ix).normalize().multiplyScalar(T.assaultSpeed);
      this.vel.x = damp(this.vel.x, d.x, T.assaultAccel * accelBoost, dt);
      this.vel.z = damp(this.vel.z, d.z, T.assaultAccel * accelBoost, dt);
      this.energy -= dt * T.assaultDrain;
      consuming = true;
      this.state = 'ASSAULT BOOST';
    } else {
      const sc = V.staggered ? 0.15 : 1;
      this.vel.x = damp(this.vel.x, wish.x * T.speed * sc, T.accel * accelBoost, dt);
      this.vel.z = damp(this.vel.z, wish.z * T.speed * sc, T.accel * accelBoost, dt);
      this.state = V.staggered ? 'STAGGERED' : this.grounded ? (wish.lengthSq() > 0.01 ? 'BOOST SKATE' : 'STANDBY') : 'AIRBORNE';
    }

    // ---- vertical ----
    const ground = this.ctx.groundAt(this.pos.x, this.pos.z);
    const rise = canAct && input.held('rise');
    const fall = canAct && input.held('descend');
    if (V.staggered) {
      this.vel.y -= T.gravity * dt;
    } else if (this.piling) {
      this.vel.y = -T.pileSlamSpeed;
      this.state = 'DESCENT';
    } else if (rise && this.energy > 0) {
      this.vel.y = damp(this.vel.y, T.thrust, 6, dt);
      if (!this.assault) this.energy -= dt * T.hoverCost;
      consuming = true;
      this.grounded = false;
      this.state = 'VERTICAL THRUST';
    } else if (fall) {
      this.vel.y = damp(this.vel.y, -T.descentSpeed, 10, dt);
      this.state = 'DESCENT';
    } else if (this.pos.y > ground + 0.05) {
      this.vel.y = 0;   // ASHFALL profile: no free fall, altitude is held until you spend or descend
    } else {
      this.vel.y = 0;
    }

    // ---- energy ----
    if (consuming) this.regenT = T.regenDelay;
    if (!consuming && this.regenT <= 0) this.energy += dt * (this.grounded ? this.mods.regenGround : this.mods.regenAir);
    if (T.infiniteEnergy) this.energy = T.energyMax;
    this.energy = clamp(this.energy, 0, T.energyMax);

    // ---- integrate ----
    this.pos.addScaledVector(this.vel, dt);
    const wasAir = !this.grounded;
    this.grounded = false;
    const g = this.ctx.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y <= g) {
      this.pos.y = g;
      this.vel.y = 0;
      this.grounded = true;
      if (wasAir) this.onLand();
    }
    if (this.pos.y > g + T.ceiling) { this.pos.y = g + T.ceiling; this.vel.y = Math.min(0, this.vel.y); }
    this.ctx.confine(this.pos, 0);

    // ---- SLIPSTREAM: passing within 8m of a hostile above 120 velocity ----
    if (this.mods.slipstream && this.speed > UPGRADE_VALUES.slipstreamMinSpeed) {
      for (const h of this.ctx.hostiles) {
        if (!h.alive) continue;
        if (h.pos.distanceTo(this.pos) < UPGRADE_VALUES.slipstreamRadius + 6) {
          if (this.slipstreamT <= 0 || this.slipstreamStacks < UPGRADE_VALUES.slipstreamMaxStacks) {
            this.slipstreamStacks = Math.min(UPGRADE_VALUES.slipstreamMaxStacks, this.slipstreamStacks + 1);
            this.slipstreamT = UPGRADE_VALUES.slipstreamDuration;
            this.ctx.fx.ring(this.pos, 3, 14, PLAYER_GLOW, 0.28);
          }
          break;
        }
      }
    }

    // ---- tether traversal ----
    if (this.tether) {
      const tgt = this.tether.target;
      this.tether.t -= dt;
      if (!tgt.alive || this.tether.t <= 0) this.tether = null;
      else {
        const toward = tgt.pos.clone().sub(this.pos);
        const dist = toward.length();
        if (dist < 14) { this.resolveTetherStrike(tgt); this.tether = null; }
        else if (tgt.vitals.staggered) {
          tgt.pos.addScaledVector(toward.normalize().multiplyScalar(-1), EVOLUTION_VALUES.tetherSpeed * dt);
        } else {
          this.pos.addScaledVector(toward.normalize(), EVOLUTION_VALUES.tetherSpeed * dt);
        }
      }
    }

    if (canAct) this.weapons(dt, input);
    this.present(dt);
  }

  private onLand() {
    this.ctx.audio.land(clamp01(Math.abs(this.vel.y) / 160) + 0.3);
    this.ctx.fx.vfx.landingDust(this.pos, 1);
    if (this.piling) this.resolvePileDriver();
  }

  // ------------------------------------------------------------------ the vanish
  /**
   * GDD §5.3. Quick-boosting with an attack's remaining windup at or under the vanish window
   * produces a Perfect Vanish: time to 0.13x for 0.85s real, blink 17m to the attacker's flank,
   * attack cancelled, Exposed 1.5s at 2.4x impact, camera hard-locks, afterimage at the origin.
   */
  tryVanish(dirVec: THREE.Vector3): boolean {
    if (this.vitals.staggered || this.quickCD > 0) return false;
    let best: Hostile | null = null, bestT = Infinity;
    for (const h of this.ctx.hostiles) {
      if (!h.alive || !h.vanishable) continue;
      if (h.windupRemaining < bestT) { bestT = h.windupRemaining; best = h; }
    }
    const perfect = !!best && bestT <= this.mods.vanishWindow;
    const cost = perfect ? (this.mods.vanishRefunds ? -UPGRADE_VALUES.vanishBatteryGain : this.mods.vanishCost) : T.quickCost;
    if (this.energy < Math.max(0, cost)) { this.ctx.audio.empty(); return false; }

    this.energy = clamp(this.energy - cost, 0, T.energyMax);
    this.regenT = 0.6;
    this.quickCD = perfect ? T.vanishCooldown : T.quickCooldown;
    this.ctx.fx.ghost(this.rig.root, PLAYER_GLOW);

    if (perfect && best) {
      // blink to the attacker's flank — a teleport, not a sidestep
      const away = this.pos.clone().sub(best.pos).setY(0).normalize();
      const side = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(dirVec.x >= 0 ? 1 : -1);
      const dest = best.pos.clone()
        .addScaledVector(away, -T.vanishBlink * 0.35)
        .addScaledVector(side, T.vanishBlink);
      dest.y = Math.max(this.pos.y, this.ctx.groundAt(dest.x, dest.z) + 4);
      this.ctx.confine(dest, 0);
      this.pos.copy(dest);
      this.vel.set(0, 0, 0);
      this.yaw = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z) + Math.PI;
      this.lock.targets = [best];
      this.lock.hard = true;

      best.cancelAttack();
      best.vitals.exposed = T.exposedDur;
      this.vanishStreak++;
      this.lastVanishAt = this.ctx.time;
      this.invuln = 0.25;
      this.events.enterSlow(T.vanishTimeScale, T.vanishSlowDur);
      this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 11), PLAYER_GLOW, 4, 12);
      this.ctx.fx.ring(this.pos, 2, 26, PLAYER_GLOW, 0.5);
      this.ctx.audio.perfectVanish();
      if (this.mods.cloneDuration > 0) {
        this.ctx.ordnance.spawnClone(this.rig.root, away.clone().multiplyScalar(0).add(best.pos).addScaledVector(away, T.vanishBlink * 0.6), this.yaw, this.mods.cloneDuration, this.mods.cloneScale, PLAYER_GLOW);
      }
      this.events.onPerfectVanish(best);
      return true;
    }

    // ordinary quick boost
    this.quickT = T.quickDur;
    this.dash.copy(dirVec.lengthSq() > 0.01 ? dirVec : this.forward()).normalize();
    this.assault = false;
    this.ctx.audio.quickBoost();
    this.ctx.fx.vfx.qbBurst(this.pos.clone().setY(this.pos.y + 5), this.dash, PLAYER_GLOW);
    this.events.onQuickBoost();
    return true;
  }

  // ------------------------------------------------------------------ hardpoints
  private weapons(dt: number, input: InputManager) {
    const V = this.vitals;
    if (V.staggered) { this.railgunCharging = false; this.railgunCharge = 0; return; }

    if (input.pressed('lock')) {
      const on = this.lock.toggleHard(this.ctx.hostiles, this.pos, this.forward());
      if (on) this.ctx.audio.lockOn(); else this.ctx.audio.lockOff();
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) this.lock.cycle(this.ctx.hostiles, Math.sign(wheel));
    if (input.pressed('cycleNext')) this.lock.cycle(this.ctx.hostiles, 1);
    if (input.pressed('cyclePrev')) this.lock.cycle(this.ctx.hostiles, -1);
    if (!this.lock.hard) this.lock.acquire(this.ctx.hostiles, this.pos, this.forward());

    // ---- primary ----
    if (this.mods.momentumRailgun) this.railgun(dt, input);
    else if (input.held('rifle') && this.fireCD <= 0) { this.fireCD = T.rifleRate; this.fireRifle(); }

    // ---- melee ----
    if (input.pressed('blade') && this.bladeCD <= 0) this.blade();

    // ---- shoulder A ----
    if (!this.mods.orbitingInterceptors && input.pressed('missiles') && this.rackCD <= 0) {
      this.rackCD = T.missileRackCooldown;
      this.missileQueue = T.missileCount;
      this.missileT = 0;
    }
    if (this.missileQueue > 0 && this.missileT <= 0) {
      this.missileT = T.missileSpacing;
      this.missileQueue--;
      this.launchMissile();
    }

    // ---- shoulder B ----
    if (input.pressed('pile') && this.pileCD <= 0 && this.altitude > T.pileMinAltitude && !this.piling) {
      this.piling = true;
      this.pileCD = this.mods.pileCooldown;
      this.ctx.audio.assaultBoostOn();
      this.driver.fireShoulder();
    }
  }

  /** Rail Core: weapon damage scales with current velocity, +0% at 62 -> +100% at 200. */
  private damageScale(): number {
    if (!this.mods.railCore) return 1;
    const k = clamp01((this.speed - UPGRADE_VALUES.railCoreMinSpeed) / (UPGRADE_VALUES.railCoreMaxSpeed - UPGRADE_VALUES.railCoreMinSpeed));
    return 1 + k * UPGRADE_VALUES.railCoreMaxBonus;
  }

  /** Weight of Attention: the locked target takes +35% damage. */
  private targetScale(h: Hostile): number {
    return this.mods.weightOfAttention && this.lock.all.includes(h) ? 1 + UPGRADE_VALUES.weightLockedDamage : 1;
  }

  dealDamage(h: Hostile, damage: number, impact: number, source: DamageSource) {
    if (!h.alive) return;
    const scale = this.damageScale() * this.targetScale(h);
    const wasStaggered = h.vitals.staggered;
    h.applyHit(damage * scale, impact * scale, source);
    // Landing damage on a target you broke is the conversion the score is asking about.
    if (wasStaggered && source !== 'upgrade') this.events.onConversion(h);
    if (!h.alive) this.onKill(h, source);
  }

  onKill(h: Hostile, source: DamageSource) {
    this.events.onHostileKilled(h, source);
    // CHAIN READ: killing a locked hostile locks the nearest within 220m and grants 1.0s bullet time.
    if (this.mods.chainRead && this.lock.all.includes(h)) {
      const next = this.lock.chainTo(this.ctx.hostiles.filter((x) => x !== h), this.pos, UPGRADE_VALUES.chainReadRange);
      if (next) {
        this.events.enterSlow(0.28, UPGRADE_VALUES.chainReadSlow);
        this.events.onFlash('CHAIN READ', '#8ff4ff');
        this.ctx.audio.lockOn();
      }
    }
  }

  private fireRifle() {
    const tgt = this.mods.splitLock ? this.lock.nextFireTarget() : this.lock.primary ?? LockSystem.best(this.ctx.hostiles, this.pos, this.forward());
    const muzzle = new THREE.Vector3();
    this.rig.muzzleR.getWorldPosition(muzzle);
    const aim = tgt
      ? tgt.pos.clone().setY(tgt.pos.y + 7).add(new THREE.Vector3(this.ctx.fx.jitter(T.rifleSpread * 90), 0, this.ctx.fx.jitter(T.rifleSpread * 90)))
      : this.pos.clone().setY(this.pos.y + 9).addScaledVector(this.forward(), 320);
    this.ctx.fx.tracer(muzzle, aim, PLAYER_GLOW, 0.75);
    this.ctx.fx.vfx.muzzle(muzzle, this.forward(), 0.8);
    this.ctx.audio.rifle();
    this.driver.fireRifle();
    if (tgt && tgt.pos.distanceTo(this.pos) < T.rifleRange) this.dealDamage(tgt, T.rifleDamage, T.rifleImpact, 'rifle');
  }

  /** MOMENTUM RAILGUN: 0.55s charge, 380 dmg / 160 impact, cannot fire below 90 velocity. */
  private railgun(dt: number, input: InputManager) {
    const canFire = this.speed >= EVOLUTION_VALUES.railgunMinVelocity;
    if (input.held('rifle') && canFire) {
      if (!this.railgunCharging) { this.railgunCharging = true; this.railgunCharge = 0; this.ctx.audio.laserCharge(EVOLUTION_VALUES.railgunCharge); }
      this.railgunCharge += dt;
      if (this.railgunCharge >= EVOLUTION_VALUES.railgunCharge) {
        this.railgunCharge = 0;
        const tgt = this.lock.primary ?? LockSystem.best(this.ctx.hostiles, this.pos, this.forward());
        const muzzle = new THREE.Vector3();
        this.rig.muzzleR.getWorldPosition(muzzle);
        const aim = tgt ? tgt.pos.clone().setY(tgt.pos.y + 7) : this.pos.clone().setY(this.pos.y + 9).addScaledVector(this.forward(), 400);
        this.ctx.fx.beam(muzzle, aim, PLAYER_GLOW, 0.22, 2.6);
        this.ctx.fx.vfx.cannonBlast(muzzle, this.forward());
        this.ctx.audio.cannon();
        this.driver.fireShoulder();
        this.ctx.shake(0.35);
        if (tgt) this.dealDamage(tgt, EVOLUTION_VALUES.railgunDamage, EVOLUTION_VALUES.railgunImpact, 'rifle');
      }
    } else {
      if (this.railgunCharging && !canFire) this.ctx.audio.empty();
      this.railgunCharging = false;
      this.railgunCharge = 0;
    }
  }

  get railgunCharge01() { return this.mods.momentumRailgun ? clamp01(this.railgunCharge / EVOLUTION_VALUES.railgunCharge) : 0; }
  get railgunReady() { return !this.mods.momentumRailgun || this.speed >= EVOLUTION_VALUES.railgunMinVelocity; }
  /** Hardpoint readiness, 0..1, for the HUD. */
  get bladeReady01() { return 1 - clamp01(this.bladeCD / T.bladeCooldown); }
  get rackReady01() { return this.missileQueue > 0 ? 1 : 1 - clamp01(this.rackCD / T.missileRackCooldown); }
  get pileReady01() { return 1 - clamp01(this.pileCD / this.mods.pileCooldown); }

  private blade() {
    if (this.mods.tetherBlade) {
      const tgt = this.lock.primary ?? LockSystem.best(this.ctx.hostiles, this.pos, this.forward());
      if (tgt && tgt.pos.distanceTo(this.pos) < 220) {
        this.bladeCD = T.bladeCooldown;
        this.tether = { target: tgt, t: 1.4 };
        this.driver.swingBlade();
        this.ctx.audio.meleeActivate();
        this.ctx.fx.tracer(this.pos.clone().setY(this.pos.y + 9), tgt.pos.clone().setY(tgt.pos.y + 7), PLAYER_GLOW, 0.5, 0.2);
        return;
      }
    }
    this.bladeCD = T.bladeCooldown;
    this.driver.swingBlade();
    this.ctx.audio.meleeSwing();
    const f = this.forward();
    const swing = this.pos.clone().setY(this.pos.y + 9).addScaledVector(f, T.bladeRange * 0.6);
    this.ctx.fx.impact(swing, PLAYER_GLOW, 4, 10);
    let hit = false;
    for (const h of this.ctx.hostiles) {
      if (!h.alive) continue;
      const d = h.pos.clone().sub(this.pos);
      d.y = 0;
      if (d.length() < T.bladeRange + 6 && d.normalize().dot(f) > 0.2) {
        hit = true;
        this.bladeStrike(h, T.bladeDamage, this.mods.bladeImpact);
      }
    }
    if (hit) { this.ctx.audio.meleeHit(); this.ctx.shake(0.3); }
  }

  private resolveTetherStrike(tgt: Hostile) {
    this.driver.swingBlade();
    this.ctx.audio.meleeHit();
    this.ctx.shake(0.4);
    this.ctx.fx.impact(tgt.pos.clone().setY(tgt.pos.y + 7), PLAYER_GLOW, 4.5, 14);
    this.bladeStrike(tgt, EVOLUTION_VALUES.tetherDamage, EVOLUTION_VALUES.tetherImpact);
  }

  /** EXECUTION PROTOCOL: blade vs staggered deals +200% and immediately refunds the cooldown. */
  private bladeStrike(h: Hostile, damage: number, impact: number) {
    let dmg = damage;
    if (this.mods.executionProtocol && h.vitals.staggered) {
      dmg *= UPGRADE_VALUES.executionBladeMult;
      this.bladeCD = 0;
      this.events.onFlash('EXECUTION', '#ffd24a');
    }
    this.dealDamage(h, dmg, impact, 'blade');
  }

  private launchMissile() {
    const bay = this.rig.missileBays[this.missileQueue % Math.max(1, this.rig.missileBays.length)];
    const from = new THREE.Vector3();
    if (bay) bay.getWorldPosition(from); else from.copy(this.pos).setY(this.pos.y + 10);
    const tgt = this.mods.splitLock ? this.lock.nextFireTarget() : this.lock.primary ?? LockSystem.best(this.ctx.hostiles, this.pos, this.forward());
    const dir = this.forward().clone().add(new THREE.Vector3(this.ctx.fx.jitter(0.5), 0.55, this.ctx.fx.jitter(0.5)));
    this.ctx.ordnance.spawnMissile(from, dir, tgt, PLAYER_GLOW, T.missileDamage * this.damageScale(), T.missileImpact * this.damageScale());
    this.ctx.audio.missileLaunch();
  }

  /** PILE DRIVER: air-only, 900 dmg / 520 impact. SEISMIC DRIVER adds the landing shockwave. */
  private resolvePileDriver() {
    this.piling = false;
    this.ctx.audio.pileDriver();
    this.ctx.shake(1.0);
    this.ctx.fx.ring(this.pos, 3, this.mods.seismicDriver ? EVOLUTION_VALUES.seismicRadius : 16, PLAYER_GLOW, 0.5);
    this.ctx.fx.vfx.explosion(this.pos.clone().setY(this.pos.y + 2), 1.6, true);
    let direct: Hostile | null = null;
    let bd = 15;
    for (const h of this.ctx.hostiles) {
      if (!h.alive) continue;
      const d = h.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; direct = h; }
    }
    if (direct) this.dealDamage(direct, T.pileDamage, T.pileImpact, 'pile');
    if (this.mods.seismicDriver) {
      for (const h of this.ctx.hostiles) {
        if (!h.alive || h === direct) continue;
        if (h.pos.distanceTo(this.pos) < EVOLUTION_VALUES.seismicRadius) this.dealDamage(h, EVOLUTION_VALUES.seismicDamage, EVOLUTION_VALUES.seismicImpact, 'pile');
      }
    }
  }

  /** Called by the game when any hostile is staggered, so stagger-economy upgrades fire once. */
  onAnyHostileStagger(h: Hostile) {
    // CASCADE BREAK: 40% of that target's Impact Max to every other hostile.
    if (this.mods.cascadeBreak) {
      const share = h.vitals.impactMax * UPGRADE_VALUES.cascadeBreakShare;
      for (const o of this.ctx.hostiles) {
        if (o === h || !o.alive) continue;
        const r = o.vitals.addImpact(share, this.ctx.time);
        this.ctx.fx.tracer(h.pos.clone().setY(h.pos.y + 7), o.pos.clone().setY(o.pos.y + 7), PLAYER_GLOW, 0.5, 0.18);
        if (r === 2) this.events.onHostileStaggered(o, 'upgrade');
      }
      this.events.onFlash('CASCADE BREAK', '#8ff4ff');
    }
    // REACTOR BLEED: drop a 40 EN core for 8.0s.
    if (this.mods.reactorBleed) this.ctx.ordnance.spawnCore(h.pos.clone());
  }

  addEnergy(amount: number) { this.energy = clamp(this.energy + amount, 0, T.energyMax); }

  // ------------------------------------------------------------------ presentation
  private present(dt: number) {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw + Math.PI;
    const lockT = this.lock.primary;
    const aimYaw = lockT ? Math.atan2(lockT.pos.x - this.pos.x, lockT.pos.z - this.pos.z) + Math.PI : this.yaw + Math.PI;
    this.driver.update(dt, {
      pos: this.pos, vel: this.vel, yaw: this.yaw + Math.PI,
      aimYaw, aimPitch: this.pitch * 0.6,
      grounded: this.grounded, maxSpeed: T.speed,
      thrust01: this.assault ? 1 : clamp01(this.speed / T.speed) * 0.55,
      thrustUp01: this.state === 'VERTICAL THRUST' ? 1 : this.grounded ? 0 : 0.25,
      quickDir: this.quickT > 0 ? this.dash : null,
      stagger01: this.vitals.staggered ? 1 : 0,
    });
    const flicker = this.vitals.staggered && Math.sin(this.ctx.time * 40) > 0.62;
    this.rig.root.visible = !flicker;
    const vanishGlow = clamp01(1 - (this.ctx.time - this.lastVanishAt) / 0.8);
    this.rig.mats.glow.emissiveIntensity = 3.2 * (1 + vanishGlow * 2);
  }

  snapshot() {
    return {
      position: [+this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2)],
      velocity: [+this.vel.x.toFixed(2), +this.vel.y.toFixed(2), +this.vel.z.toFixed(2)],
      altitude: +this.altitude.toFixed(2),
      structure: Math.round(this.vitals.structure),
      impact: Math.round(this.vitals.impact),
      energy: +this.energy.toFixed(1),
      stagger: this.vitals.staggered,
      staggerRemaining: +this.vitals.stagger.toFixed(2),
      exposed: this.vitals.isExposed,
      exposedRemaining: +this.vitals.exposed.toFixed(2),
    };
  }
}
