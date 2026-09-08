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
import { CORRUPTED_VALUES, DOWNSIDE_VALUES } from '../build/Corrupted';
import { HardpointId, EVOLUTION_VALUES } from '../build/Weapons';
import { InputManager } from '../core/Input';
import { RNG } from '../core/RNG';
import { ATTACKS, AttackId } from '../enemies/Archetypes';
import { settings } from '../core/Settings';

/** The player's saturated, additive palette — the only high-value silhouette on screen. */
export const PLAYER_PAL: MechPalette = {
  armor: 0xcfd4d8, armor2: 0x232a31, dark: 0x14181c, metal: 0x707880, joint: 0x22262a,
  accent: 0x2fd0e8, glow: 0x8ff4ff,
};
export const PLAYER_GLOW = 0x8ff4ff;

/** Seconds a hard lock survives a line-of-sight break without GHOST LOCK. */
const LOS_GRACE = 0.45;

export type PlayerStateLabel = 'STANDBY' | 'BOOST SKATE' | 'QUICK BOOST' | 'ASSAULT BOOST' | 'VERTICAL THRUST' | 'DESCENT' | 'AIRBORNE' | 'STAGGERED' | 'VANISH';

/**
 * Modifiers derived from the reactor, upgrades and weapon evolutions.
 *
 * Every magnitude here is read from UPGRADE_VALUES / CORRUPTED_VALUES / EVOLUTION_VALUES, which
 * are the same constants the FORGE card prints. There is no second copy of any number: if a card
 * says 45 m/s, the simulation reads the field the card rendered.
 */
export interface BuildMods {
  structure: number;
  /** Energy ceiling. Lowered by the EN CEILING corrupted downside. */
  energyMax: number;
  /** Disabled for the run by the HARDPOINT LOCKOUT corrupted downside. */
  lockedHardpoint: HardpointId | null;
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
  /** BREAKER moves this. Every other chassis skates at the baseline. */
  boostSpeed: number;
  /** PUNISH DOCTRINE trades magnitude for duration on the Exposed window. */
  exposedMult: number;
  exposedDuration: number;

  // --- BOOST ---
  gravityThrusters: boolean;
  gtRadius: number; gtDeflection: number; gtDuration: number;
  contrailWeave: boolean;
  contrailLife: number; contrailDamage: number; contrailImpact: number; contrailWidth: number;
  overburn: boolean;
  overburnFree: number; overburnLockout: number;
  groundEffect: boolean;
  geRate: number; geDamage: number; geImpact: number; geRadius: number;
  kineticBank: boolean;
  kbShare: number; kbMax: number; kbDamage: number; kbImpact: number; kbRange: number;

  // --- VANISH ---
  echoSplit: boolean;
  echoCount: number; echoDuration: number; echoRetarget: number;
  cascade: boolean;
  cascadeWindow: number; cascadeStep: number; cascadeMax: number;
  counterweight: boolean;
  counterweightRadius: number;
  blindAngle: boolean;
  blindAngleDuration: number;
  impactReflection: boolean;
  reflectionShare: number;

  // --- LOCK ---
  sensorBloom: boolean;
  bloomLead: number; bloomCooldown: number;
  ghostLock: boolean;
  ghostPersist: number;
  targetDebt: boolean;
  debtRate: number; debtMax: number;

  // --- STAGGER ---
  singularity: boolean;
  singRadius: number; singSpeed: number; singDuration: number;
  overpressure: boolean;
  overpressureHold: number;
  sharedFault: boolean;
  sfRadius: number; sfSlow: number;
  faultLine: boolean;
  flRadius: number; flTargets: number;
  // corrupted-scalable magnitudes
  railCoreBonus: number;
  slipstreamDur: number;
  slipstreamStacksMax: number;
  vanishRefundAmount: number;
  lockCapacity: number;
  weightLocked: number;
  chainRange: number;
  chainSlow: number;
  executionMult: number;
  cascadeShare: number;
  bleedEnergy: number;
  bleedLife: number;
  // --- evolutions, twelve tier-1 branches ---
  phaseBlade: boolean;
  tetherBlade: boolean;
  executionBlade: boolean;
  ricochetRifle: boolean;
  lockSplittingRifle: boolean;
  momentumRailgun: boolean;
  orbitingInterceptors: boolean;
  mineLattice: boolean;
  swarmLock: boolean;
  seismicDriver: boolean;
  anchorDriver: boolean;
  breachDriver: boolean;
}

export function defaultMods(): BuildMods {
  return {
    structure: T.playerStructure, energyMax: T.energyMax, lockedHardpoint: null, vanishCost: T.vanishCost, vanishWindow: T.vanishWindow, vanishRefunds: false,
    cloneDuration: 0, cloneScale: UPGRADE_VALUES.mirrorCloneDamageScale,
    regenGround: T.regenGround, regenAir: T.regenAir,
    railCore: false, slipstream: false, splitLock: false, weightOfAttention: false, chainRead: false,
    executionProtocol: false, cascadeBreak: false, reactorBleed: false, telegraphLead: 0,
    bladeImpact: T.bladeImpact, pileCooldown: T.pileCooldown, impactNeverDecays: false,
    boostSpeed: T.speed, exposedMult: T.exposedMult, exposedDuration: T.exposedDur,
    gravityThrusters: false, gtRadius: UPGRADE_VALUES.gravityThrustersRadius, gtDeflection: UPGRADE_VALUES.gravityThrustersDeflection, gtDuration: UPGRADE_VALUES.gravityThrustersDuration,
    contrailWeave: false, contrailLife: UPGRADE_VALUES.contrailLife, contrailDamage: UPGRADE_VALUES.contrailDamagePerSec, contrailImpact: UPGRADE_VALUES.contrailImpactPerSec, contrailWidth: UPGRADE_VALUES.contrailWidth,
    overburn: false, overburnFree: UPGRADE_VALUES.overburnFreeSeconds, overburnLockout: UPGRADE_VALUES.overburnLockout,
    groundEffect: false, geRate: UPGRADE_VALUES.groundEffectRate, geDamage: UPGRADE_VALUES.groundEffectDamagePerCharge, geImpact: UPGRADE_VALUES.groundEffectImpactPerCharge, geRadius: UPGRADE_VALUES.groundEffectRadius,
    kineticBank: false, kbShare: UPGRADE_VALUES.kineticBankShare, kbMax: UPGRADE_VALUES.kineticBankMax, kbDamage: UPGRADE_VALUES.kineticBankDamagePerPoint, kbImpact: UPGRADE_VALUES.kineticBankImpactPerPoint, kbRange: UPGRADE_VALUES.kineticBankConeRange,
    echoSplit: false, echoCount: UPGRADE_VALUES.echoSplitCount, echoDuration: UPGRADE_VALUES.echoSplitDuration, echoRetarget: UPGRADE_VALUES.echoSplitRetargetChance,
    cascade: false, cascadeWindow: UPGRADE_VALUES.cascadeWindow, cascadeStep: UPGRADE_VALUES.cascadeStep, cascadeMax: UPGRADE_VALUES.cascadeMax,
    counterweight: false, counterweightRadius: UPGRADE_VALUES.counterweightRadius,
    blindAngle: false, blindAngleDuration: UPGRADE_VALUES.blindAngleDuration,
    impactReflection: false, reflectionShare: UPGRADE_VALUES.impactReflectionShare,
    sensorBloom: false, bloomLead: UPGRADE_VALUES.sensorBloomLead, bloomCooldown: UPGRADE_VALUES.sensorBloomCooldown,
    ghostLock: false, ghostPersist: UPGRADE_VALUES.ghostLockPersist,
    targetDebt: false, debtRate: UPGRADE_VALUES.targetDebtRate, debtMax: UPGRADE_VALUES.targetDebtMax,
    singularity: false, singRadius: UPGRADE_VALUES.singularityRadius, singSpeed: UPGRADE_VALUES.singularitySpeed, singDuration: UPGRADE_VALUES.singularityDuration,
    overpressure: false, overpressureHold: UPGRADE_VALUES.overpressureHold,
    sharedFault: false, sfRadius: UPGRADE_VALUES.sharedFaultRadius, sfSlow: UPGRADE_VALUES.sharedFaultSlow,
    faultLine: false, flRadius: UPGRADE_VALUES.faultLineRadius, flTargets: 1,
    railCoreBonus: UPGRADE_VALUES.railCoreMaxBonus,
    slipstreamDur: UPGRADE_VALUES.slipstreamDuration,
    slipstreamStacksMax: UPGRADE_VALUES.slipstreamMaxStacks,
    vanishRefundAmount: UPGRADE_VALUES.vanishBatteryGain,
    lockCapacity: 1,
    weightLocked: UPGRADE_VALUES.weightLockedDamage,
    chainRange: UPGRADE_VALUES.chainReadRange,
    chainSlow: UPGRADE_VALUES.chainReadSlow,
    executionMult: UPGRADE_VALUES.executionBladeMult,
    cascadeShare: UPGRADE_VALUES.cascadeBreakShare,
    bleedEnergy: UPGRADE_VALUES.reactorBleedEnergy,
    bleedLife: UPGRADE_VALUES.reactorBleedLife,
    phaseBlade: false, tetherBlade: false, executionBlade: false,
    ricochetRifle: false, lockSplittingRifle: false, momentumRailgun: false,
    orbitingInterceptors: false, mineLattice: false, swarmLock: false,
    seismicDriver: false, anchorDriver: false, breachDriver: false,
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
  // --- v0.3 upgrade state ---
  /** GROUND EFFECT charge, 0..100. */
  groundCharge = 0;
  /** KINETIC BANK, 0..kbMax. */
  bank = 0;
  private overburnT = 0;
  private overburnLock = 0;
  private wasAssault = false;
  /** BLIND ANGLE: seconds remaining of untargetability. */
  blindT = 0;
  /**
   * TARGET DEBT: seconds the current lock has been held, and the frame it is being held on.
   *
   * This tracks the OBJECT, not its id. Hostile ids restart at 1 on every encounter, so an
   * id-keyed comparison silently treats "the fourth frame of this fight" and "the fourth frame
   * of the last one" as the same lock — which leaked both the debt accrual and the
   * line-of-sight grace across encounter and run boundaries, and could drop a freshly acquired
   * lock on its first frame. Identity cannot be recycled; an integer can.
   */
  private debtT = 0;
  private debtLock: Hostile | null = null;
  /** SENSOR BLOOM: cooldown after a lock change, during which the reveal is suppressed. */
  private bloomCD = 0;
  /** CASCADE: bullet-time extension earned by consecutive reads. */
  private cascadeBonus = 0;
  /** GHOST LOCK: seconds a hard lock may survive without line of sight. */
  private lostSightT = 0;
  private trailPrev: THREE.Vector3 | null = null;
  private trailT = 0;

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
  get energy01() { return this.energy / this.mods.energyMax; }
  get altitude() { return this.pos.y - this.ctx.groundAt(this.pos.x, this.pos.z); }

  /**
   * HOOK's harpoon, and the only channel through which a hostile may move the pilot.
   *
   * It is a translation, not a teleport: the frame is dragged along the ground plane and the
   * move is confined like any other, so it cannot put you inside geometry. What it costs you is
   * the position you had just earned — which is the whole point of the archetype.
   */
  applyPull(dir: THREE.Vector3, distance: number) {
    if (!this.vitals.alive) return;
    const dest = this.pos.clone().addScaledVector(dir, distance);
    dest.y = Math.max(this.ctx.groundAt(dest.x, dest.z), this.pos.y - 6);
    this.ctx.confine(dest, 4);
    this.ctx.fx.trailQuad(this.pos.clone().setY(this.pos.y + 6), dest.clone().setY(dest.y + 6), 2.4, 0xff7ae0, 0.35);
    this.pos.copy(dest);
    this.vel.multiplyScalar(0.25);
    this.events.onFlash('HOOKED', '#ff7ae0');
  }

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
    // The vanish-window assist sets the BASELINE. Upgrades that move the window keep their
    // ratio, so PREDATOR READ is still the same tradeoff at every assist level rather than
    // becoming a trap for players who need a wider read.
    m.vanishWindow = settings.assists.vanishWindow;
    const reactor = REACTORS[run.reactor];
    m.structure = reactor.structure;
    m.vanishCost = reactor.vanishCost;
    m.cloneDuration = reactor.vanishCloneDuration;
    m.regenGround = reactor.regenGround;
    m.regenAir = reactor.regenAir;
    m.pileCooldown = reactor.pileCooldown;
    m.bladeImpact = reactor.bladeImpact;
    m.impactNeverDecays = reactor.impactNeverDecays;
    m.boostSpeed = reactor.boostSpeed;

    // Corrupted variants amplify the upgrade's own identity and carry exactly one downside.
    const corrupt = new Set(run.corrupted.map((c) => c.upgrade));
    for (const id of run.upgrades) {
      const C = corrupt.has(id);
      switch (id) {
        case 'zero-point-reactor': m.regenGround = UPGRADE_VALUES.zeroPointGroundRegen; m.regenAir = C ? CORRUPTED_VALUES.zeroPointAirRegen : UPGRADE_VALUES.zeroPointAirRegen; break;
        case 'rail-core': m.railCore = true; m.railCoreBonus = C ? CORRUPTED_VALUES.railCoreMaxBonus : UPGRADE_VALUES.railCoreMaxBonus; break;
        case 'slipstream': m.slipstream = true; m.slipstreamDur = C ? CORRUPTED_VALUES.slipstreamDuration : UPGRADE_VALUES.slipstreamDuration; m.slipstreamStacksMax = C ? CORRUPTED_VALUES.slipstreamMaxStacks : UPGRADE_VALUES.slipstreamMaxStacks; break;
        case 'mirror-chassis': m.cloneDuration = Math.max(m.cloneDuration, C ? CORRUPTED_VALUES.mirrorCloneDuration : UPGRADE_VALUES.mirrorCloneDuration); m.cloneScale = C ? CORRUPTED_VALUES.mirrorCloneDamageScale : UPGRADE_VALUES.mirrorCloneDamageScale; break;
        case 'vanish-battery': m.vanishRefunds = true; m.vanishRefundAmount = C ? CORRUPTED_VALUES.vanishBatteryGain : UPGRADE_VALUES.vanishBatteryGain; break;
        case 'predator-read': m.telegraphLead = C ? CORRUPTED_VALUES.predatorTelegraphLead : UPGRADE_VALUES.predatorTelegraphLead; m.vanishWindow *= UPGRADE_VALUES.predatorVanishWindow / T.vanishWindow; break;
        case 'split-lock': m.splitLock = true; m.lockCapacity = C ? CORRUPTED_VALUES.splitLockCount : UPGRADE_VALUES.splitLockCount; break;
        case 'weight-of-attention': m.weightOfAttention = true; m.weightLocked = C ? CORRUPTED_VALUES.weightLockedDamage : UPGRADE_VALUES.weightLockedDamage; break;
        case 'chain-read': m.chainRead = true; m.chainRange = C ? CORRUPTED_VALUES.chainReadRange : UPGRADE_VALUES.chainReadRange; m.chainSlow = C ? CORRUPTED_VALUES.chainReadSlow : UPGRADE_VALUES.chainReadSlow; break;
        case 'execution-protocol': m.executionProtocol = true; m.executionMult = C ? CORRUPTED_VALUES.executionBladeMult : UPGRADE_VALUES.executionBladeMult; break;
        case 'cascade-break': m.cascadeBreak = true; m.cascadeShare = C ? CORRUPTED_VALUES.cascadeBreakShare : UPGRADE_VALUES.cascadeBreakShare; break;
        case 'reactor-bleed': m.reactorBleed = true; m.bleedEnergy = C ? CORRUPTED_VALUES.reactorBleedEnergy : UPGRADE_VALUES.reactorBleedEnergy; m.bleedLife = C ? CORRUPTED_VALUES.reactorBleedLife : UPGRADE_VALUES.reactorBleedLife; break;

        // ---------------------------------------------------------------- v0.3 BOOST
        case 'gravity-thrusters':
          m.gravityThrusters = true;
          m.gtRadius = C ? CORRUPTED_VALUES.gravityThrustersRadius : UPGRADE_VALUES.gravityThrustersRadius;
          m.gtDeflection = C ? CORRUPTED_VALUES.gravityThrustersDeflection : UPGRADE_VALUES.gravityThrustersDeflection;
          m.gtDuration = C ? CORRUPTED_VALUES.gravityThrustersDuration : UPGRADE_VALUES.gravityThrustersDuration;
          break;
        case 'contrail-weave':
          m.contrailWeave = true;
          m.contrailLife = C ? CORRUPTED_VALUES.contrailLife : UPGRADE_VALUES.contrailLife;
          m.contrailDamage = C ? CORRUPTED_VALUES.contrailDamagePerSec : UPGRADE_VALUES.contrailDamagePerSec;
          m.contrailImpact = C ? CORRUPTED_VALUES.contrailImpactPerSec : UPGRADE_VALUES.contrailImpactPerSec;
          m.contrailWidth = C ? CORRUPTED_VALUES.contrailWidth : UPGRADE_VALUES.contrailWidth;
          break;
        case 'overburn':
          m.overburn = true;
          m.overburnFree = C ? CORRUPTED_VALUES.overburnFreeSeconds : UPGRADE_VALUES.overburnFreeSeconds;
          m.overburnLockout = C ? CORRUPTED_VALUES.overburnLockout : UPGRADE_VALUES.overburnLockout;
          break;
        case 'ground-effect':
          m.groundEffect = true;
          m.geRate = C ? CORRUPTED_VALUES.groundEffectRate : UPGRADE_VALUES.groundEffectRate;
          m.geDamage = C ? CORRUPTED_VALUES.groundEffectDamagePerCharge : UPGRADE_VALUES.groundEffectDamagePerCharge;
          m.geImpact = C ? CORRUPTED_VALUES.groundEffectImpactPerCharge : UPGRADE_VALUES.groundEffectImpactPerCharge;
          m.geRadius = C ? CORRUPTED_VALUES.groundEffectRadius : UPGRADE_VALUES.groundEffectRadius;
          break;
        case 'kinetic-bank':
          m.kineticBank = true;
          m.kbShare = C ? CORRUPTED_VALUES.kineticBankShare : UPGRADE_VALUES.kineticBankShare;
          m.kbMax = C ? CORRUPTED_VALUES.kineticBankMax : UPGRADE_VALUES.kineticBankMax;
          m.kbDamage = C ? CORRUPTED_VALUES.kineticBankDamagePerPoint : UPGRADE_VALUES.kineticBankDamagePerPoint;
          m.kbImpact = C ? CORRUPTED_VALUES.kineticBankImpactPerPoint : UPGRADE_VALUES.kineticBankImpactPerPoint;
          break;

        // -------------------------------------------------------------- v0.3 VANISH
        case 'echo-split':
          m.echoSplit = true;
          m.echoCount = C ? CORRUPTED_VALUES.echoSplitCount : UPGRADE_VALUES.echoSplitCount;
          m.echoDuration = C ? CORRUPTED_VALUES.echoSplitDuration : UPGRADE_VALUES.echoSplitDuration;
          m.echoRetarget = C ? CORRUPTED_VALUES.echoSplitRetargetChance : UPGRADE_VALUES.echoSplitRetargetChance;
          break;
        case 'cascade':
          m.cascade = true;
          m.cascadeWindow = C ? CORRUPTED_VALUES.cascadeWindow : UPGRADE_VALUES.cascadeWindow;
          m.cascadeStep = C ? CORRUPTED_VALUES.cascadeStep : UPGRADE_VALUES.cascadeStep;
          m.cascadeMax = C ? CORRUPTED_VALUES.cascadeMax : UPGRADE_VALUES.cascadeMax;
          break;
        case 'punish-doctrine':
          m.exposedMult = C ? CORRUPTED_VALUES.punishExposedMult : UPGRADE_VALUES.punishExposedMult;
          m.exposedDuration = C ? CORRUPTED_VALUES.punishExposedDuration : UPGRADE_VALUES.punishExposedDuration;
          break;
        case 'counterweight':
          m.counterweight = true;
          m.counterweightRadius = C ? CORRUPTED_VALUES.counterweightRadius : UPGRADE_VALUES.counterweightRadius;
          break;
        case 'blind-angle':
          m.blindAngle = true;
          m.blindAngleDuration = C ? CORRUPTED_VALUES.blindAngleDuration : UPGRADE_VALUES.blindAngleDuration;
          break;
        case 'impact-reflection':
          m.impactReflection = true;
          m.reflectionShare = C ? CORRUPTED_VALUES.impactReflectionShare : UPGRADE_VALUES.impactReflectionShare;
          break;

        // ---------------------------------------------------------------- v0.3 LOCK
        case 'sensor-bloom':
          m.sensorBloom = true;
          m.bloomLead = C ? CORRUPTED_VALUES.sensorBloomLead : UPGRADE_VALUES.sensorBloomLead;
          m.bloomCooldown = C ? CORRUPTED_VALUES.sensorBloomCooldown : UPGRADE_VALUES.sensorBloomCooldown;
          break;
        case 'ghost-lock':
          m.ghostLock = true;
          m.ghostPersist = C ? CORRUPTED_VALUES.ghostLockPersist : UPGRADE_VALUES.ghostLockPersist;
          break;
        case 'target-debt':
          m.targetDebt = true;
          m.debtRate = C ? CORRUPTED_VALUES.targetDebtRate : UPGRADE_VALUES.targetDebtRate;
          m.debtMax = C ? CORRUPTED_VALUES.targetDebtMax : UPGRADE_VALUES.targetDebtMax;
          break;

        // ------------------------------------------------------------- v0.3 STAGGER
        case 'singularity-engine':
          m.singularity = true;
          m.singRadius = C ? CORRUPTED_VALUES.singularityRadius : UPGRADE_VALUES.singularityRadius;
          m.singSpeed = C ? CORRUPTED_VALUES.singularitySpeed : UPGRADE_VALUES.singularitySpeed;
          m.singDuration = C ? CORRUPTED_VALUES.singularityDuration : UPGRADE_VALUES.singularityDuration;
          break;
        case 'overpressure':
          m.overpressure = true;
          m.overpressureHold = C ? CORRUPTED_VALUES.overpressureHold : UPGRADE_VALUES.overpressureHold;
          break;
        case 'shared-fault':
          m.sharedFault = true;
          m.sfRadius = C ? CORRUPTED_VALUES.sharedFaultRadius : UPGRADE_VALUES.sharedFaultRadius;
          m.sfSlow = C ? CORRUPTED_VALUES.sharedFaultSlow : UPGRADE_VALUES.sharedFaultSlow;
          break;
        case 'fault-line':
          m.faultLine = true;
          m.flRadius = C ? CORRUPTED_VALUES.faultLineRadius : UPGRADE_VALUES.faultLineRadius;
          m.flTargets = C ? CORRUPTED_VALUES.faultLineTargets : 1;
          break;
      }
    }
    for (const e of run.evolutions) {
      switch (e) {
        case 'phase-blade': m.phaseBlade = true; break;
        case 'tether-blade': m.tetherBlade = true; break;
        case 'execution-blade': m.executionBlade = true; break;
        case 'ricochet-rifle': m.ricochetRifle = true; break;
        case 'lock-splitting-rifle': m.lockSplittingRifle = true; break;
        case 'momentum-railgun': m.momentumRailgun = true; break;
        case 'orbiting-interceptors': m.orbitingInterceptors = true; break;
        case 'mine-lattice': m.mineLattice = true; break;
        case 'swarm-lock': m.swarmLock = true; break;
        case 'seismic-driver': m.seismicDriver = true; break;
        case 'anchor-driver': m.anchorDriver = true; break;
        case 'breach-driver': m.breachDriver = true; break;
      }
    }
    // ---- corrupted downsides: exactly one per corrupted card taken ----
    this.ctx.director.flankDebt = false;
    for (const c of run.corrupted) {
      switch (c.downside) {
        case 'en-ceiling': m.energyMax = Math.min(m.energyMax, DOWNSIDE_VALUES.energyCeiling); break;
        case 'structure': m.structure = Math.round(m.structure * DOWNSIDE_VALUES.structureScale); break;
        case 'vanish-window': m.vanishWindow *= DOWNSIDE_VALUES.vanishWindowScale; break;
        case 'hardpoint-lockout': m.lockedHardpoint = c.lockedHardpoint ?? 'pile'; break;
        case 'flank-debt': this.ctx.director.flankDebt = true; break;
      }
    }

    this.mods = m;
    this.lock.capacity = m.splitLock ? m.lockCapacity : 1;
    /**
     * BREAKER reads "YOUR impact never decays" — the impact you DEAL, on the frames you deal it
     * to. It was being applied to the pilot's own impact bar, which is the opposite of the card:
     * it made the chassis easier to stagger and did nothing at all to the fight. The flag now
     * travels with the damage (see dealDamage) and the pilot's own bar behaves normally.
     */
    this.vitals.noDecay = false;
    this.ctx.ordnance.setInterceptors(m.orbitingInterceptors ? EVOLUTION_VALUES.interceptorCount : 0, PLAYER_GLOW);
    // the punish window belongs to the build, and the whole simulation reads it from one place
    this.ctx.punish.exposedMult = m.exposedMult;
    this.ctx.punish.exposedDuration = m.exposedDuration;
  }

  resetForEncounter(keepStructure = true) {
    const s = keepStructure ? this.vitals.structure : this.mods.structure;
    this.vitals.reset(this.mods.structure);
    this.vitals.structure = Math.min(this.mods.structure, s);
    // the pilot's own impact bar always decays; BREAKER's rule is about the impact you DEAL
    this.vitals.noDecay = false;
    this.energy = this.mods.energyMax;
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
    this.groundCharge = 0; this.bank = 0; this.overburnT = 0; this.overburnLock = 0; this.wasAssault = false;
    this.blindT = 0; this.debtT = 0; this.debtLock = null; this.bloomCD = 0; this.cascadeBonus = 0;
    this.lostSightT = 0; this.trailPrev = null; this.trailT = 0;
    this.driver = new RigDriver(this.rig);
  }

  healToFull() { this.vitals.reset(this.mods.structure); this.energy = this.mods.energyMax; }

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
    this.blindT = Math.max(0, this.blindT - dt);
    this.overburnLock = Math.max(0, this.overburnLock - dt);
    this.bloomCD = Math.max(0, this.bloomCD - dt);
    this.lock.prune();
    this.tickLockHold(dt);

    if (this.frozen) { this.present(dt); return; }

    const f = this.forward(), r = this.right();
    const ix = canAct ? input.moveX : 0;
    const iz = canAct ? input.moveZ : 0;
    const wish = f.clone().multiplyScalar(iz).addScaledVector(r, ix);
    if (wish.lengthSq() > 1) wish.normalize();

    const V = this.vitals;

    // ASSAULT BOOST is a toggle by default; the hold-to-toggle assist converts it for players
    // who cannot comfortably hold a modifier for a whole encounter.
    const overburnBlocked = this.mods.overburn && this.overburnLock > 0;
    if (settings.assists.holdAssaultBoost) this.assault = canAct && input.held('assault') && this.energy > 1 && !V.staggered && !overburnBlocked;
    else if (canAct && input.pressed('assault') && this.energy > 5 && !V.staggered && !overburnBlocked) this.assault = !this.assault;
    if (this.energy < 1 || V.staggered) this.assault = false;
    // OVERBURN: each ACTIVATION gets its free window, and pays a lockout when it ends.
    if (this.mods.overburn) {
      if (this.assault && !this.wasAssault) this.overburnT = this.mods.overburnFree;
      if (!this.assault && this.wasAssault) this.overburnLock = this.mods.overburnLockout;
      if (this.assault) this.overburnT = Math.max(0, this.overburnT - dt);
    }
    this.wasAssault = this.assault;
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
      const free = this.mods.overburn && this.overburnT > 0;
      if (!free) this.spendMovementEnergy(dt * T.assaultDrain);
      consuming = true;
      this.state = 'ASSAULT BOOST';
    } else {
      const sc = V.staggered ? 0.15 : 1;
      const cruise = this.mods.boostSpeed;
      this.vel.x = damp(this.vel.x, wish.x * cruise * sc, T.accel * accelBoost, dt);
      this.vel.z = damp(this.vel.z, wish.z * cruise * sc, T.accel * accelBoost, dt);
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
      if (!this.assault) this.spendMovementEnergy(dt * T.hoverCost);
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
    if (T.infiniteEnergy) this.energy = this.mods.energyMax;
    this.energy = clamp(this.energy, 0, this.mods.energyMax);

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

    // ---- GROUND EFFECT: skate low, land loud ----
    if (this.mods.groundEffect) {
      if (this.altitude < UPGRADE_VALUES.groundEffectAltitude && this.speed > 20) {
        this.groundCharge = Math.min(UPGRADE_VALUES.groundEffectMax, this.groundCharge + this.mods.geRate * dt);
      }
    }

    // ---- CONTRAIL WEAVE: the line you leave behind is solid ----
    if (this.mods.contrailWeave) {
      this.trailT -= dt;
      const moving = this.speed > 40;
      if (!moving) this.trailPrev = null;
      else if (this.trailT <= 0) {
        this.trailT = 0.06;
        const here = this.pos.clone().setY(this.pos.y + 4);
        if (this.trailPrev) {
          this.ctx.ordnance.pushTrail(this.trailPrev, here, this.mods.contrailLife, this.mods.contrailDamage, this.mods.contrailImpact, this.mods.contrailWidth, PLAYER_GLOW);
        }
        this.trailPrev = here;
      }
    } else this.trailPrev = null;

    // ---- SLIPSTREAM: passing within 8m of a hostile above 120 velocity ----
    if (this.mods.slipstream && this.speed > UPGRADE_VALUES.slipstreamMinSpeed) {
      for (const h of this.ctx.hostiles) {
        if (!h.alive) continue;
        if (h.pos.distanceTo(this.pos) < UPGRADE_VALUES.slipstreamRadius + 6) {
          if (this.slipstreamT <= 0 || this.slipstreamStacks < this.mods.slipstreamStacksMax) {
            this.slipstreamStacks = Math.min(this.mods.slipstreamStacksMax, this.slipstreamStacks + 1);
            this.slipstreamT = this.mods.slipstreamDur;
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
    this.dischargeGroundEffect();
  }

  /** GROUND EFFECT: the charge you built skating low is spent the moment you touch down. */
  private dischargeGroundEffect() {
    if (!this.mods.groundEffect || this.groundCharge < 1) return;
    const charge = Math.round(this.groundCharge);
    this.groundCharge = 0;
    const damage = charge * this.mods.geDamage;
    const impact = charge * this.mods.geImpact;
    this.ctx.fx.ring(this.pos, 3, this.mods.geRadius, PLAYER_GLOW, 0.5);
    this.ctx.shake(clamp01(charge / 100) * 0.8);
    this.ctx.audio.pileDriver();
    for (const h of this.ctx.hostiles) {
      if (!h.alive) continue;
      if (h.pos.distanceTo(this.pos) < this.mods.geRadius) this.dealDamage(h, damage, impact, 'upgrade');
    }
    this.events.onFlash(`GROUND EFFECT · ${charge}`, '#8ff4ff');
  }

  /**
   * KINETIC BANK. Every unit of EN spent MOVING is taxed at 40% into the bank, so the upgrade is
   * a conversion rather than a discount: you pay the same to fly, and the flying becomes ammunition.
   */
  private spendMovementEnergy(amount: number) {
    this.energy -= amount;
    if (this.mods.kineticBank) this.bank = Math.min(this.mods.kbMax, this.bank + amount * this.mods.kbShare);
  }

  /**
   * Vent the bank forward. Bound to the SHOULDER B input while GROUNDED, which is otherwise a
   * dead press — the pile driver is air-only — so the upgrade needs no new binding and the
   * grounded/airborne split reads as one rule rather than two buttons.
   */
  private ventBank() {
    const points = Math.round(this.bank);
    if (points < 1) { this.ctx.audio.empty(); return; }
    this.bank = 0;
    const f = this.forward();
    const damage = points * this.mods.kbDamage;
    const impact = points * this.mods.kbImpact;
    const tip = this.pos.clone().setY(this.pos.y + 8).addScaledVector(f, this.mods.kbRange * 0.5);
    this.ctx.fx.impact(tip, PLAYER_GLOW, 5, 20);
    this.ctx.fx.ring(this.pos, 3, this.mods.kbRange, PLAYER_GLOW, 0.4);
    this.ctx.audio.cannon();
    this.ctx.shake(0.5);
    for (const h of this.ctx.hostiles) {
      if (!h.alive) continue;
      const d = h.pos.clone().sub(this.pos).setY(0);
      const dist = d.length();
      if (dist < this.mods.kbRange && dist > 0.1 && d.normalize().dot(f) > 0.4) this.dealDamage(h, damage, impact, 'upgrade');
    }
    this.events.onFlash(`BANK VENTED · ${points}`, '#8ff4ff');
  }

  /**
   * TARGET DEBT and SENSOR BLOOM both key off how long the current lock has been held, and
   * GHOST LOCK off whether it can still be seen. One place decides all three.
   */
  private tickLockHold(dt: number) {
    const primary = this.lock.primary;
    if (primary !== this.debtLock) {
      this.debtLock = primary;
      this.debtT = 0;
      this.lostSightT = 0;
      if (this.mods.sensorBloom) this.bloomCD = this.mods.bloomCooldown;
    } else if (primary) {
      this.debtT += dt;
    }
    // GHOST LOCK: a hard lock survives a line-of-sight break for the stated window.
    if (this.lock.hard && primary) {
      const seen = this.ctx.hasLineOfSight(this.pos.clone().setY(this.pos.y + 8), primary.pos.clone().setY(primary.pos.y + 7));
      if (seen) this.lostSightT = 0;
      else {
        this.lostSightT += dt;
        const budget = this.mods.ghostLock ? this.mods.ghostPersist : LOS_GRACE;
        if (this.lostSightT > budget) { this.lock.hard = false; this.lock.targets = []; this.ctx.audio.lockOff(); }
      }
    }
  }

  /** TARGET DEBT's current multiplier, for the blade and the HUD. */
  get debtMultiplier() {
    if (!this.mods.targetDebt) return 1;
    return 1 + Math.min(this.mods.debtMax, this.debtT * this.mods.debtRate);
  }
  get debtCharged01() { return this.mods.targetDebt ? clamp01((this.debtMultiplier - 1) / this.mods.debtMax) : 0; }
  get bank01() { return this.mods.kineticBank ? clamp01(this.bank / this.mods.kbMax) : 0; }
  get groundCharge01() { return this.mods.groundEffect ? clamp01(this.groundCharge / UPGRADE_VALUES.groundEffectMax) : 0; }
  /** BLIND ANGLE. Read by the Director's hostiles through CombatContext.targetable(). */
  get untargetable() { return this.blindT > 0; }

  /**
   * How early THIS hostile's telegraph should appear. PREDATOR READ is global; SENSOR BLOOM adds
   * its reveal only to the frame you are holding, and only once the lock has settled past its
   * change cooldown. The larger of the two wins — they are two ways of seeing one windup, not
   * two windups.
   */
  telegraphLeadFor(h: Hostile): number {
    let lead = this.mods.telegraphLead;
    if (this.mods.sensorBloom && this.bloomCD <= 0 && this.lock.all.includes(h)) lead = Math.max(lead, this.mods.bloomLead);
    return lead;
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
    const cost = perfect ? (this.mods.vanishRefunds ? -this.mods.vanishRefundAmount : this.mods.vanishCost) : T.quickCost;
    if (this.energy < Math.max(0, cost)) { this.ctx.audio.empty(); return false; }

    const origin = this.pos.clone();
    this.energy = clamp(this.energy - cost, 0, this.mods.energyMax);
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

      // IMPACT REFLECTION reads the attack BEFORE it is cancelled: the impact you are converting
      // is the impact of the thing they committed to, not of whatever they do next.
      const committed = best.currentAttack;
      best.cancelAttack();
      best.vitals.exposed = this.mods.exposedDuration;
      this.vanishStreak++;

      // CASCADE: consecutive reads inside the window stack bullet-time duration.
      if (this.mods.cascade) {
        const gap = this.ctx.time - this.lastVanishAt;
        this.cascadeBonus = gap <= this.mods.cascadeWindow
          ? Math.min(this.mods.cascadeMax, this.cascadeBonus + this.mods.cascadeStep)
          : 0;
      }
      this.lastVanishAt = this.ctx.time;
      this.invuln = 0.25;
      this.events.enterSlow(T.vanishTimeScale, T.vanishSlowDur + this.cascadeBonus);
      if (this.cascadeBonus > 0) this.events.onFlash(`CASCADE +${this.cascadeBonus.toFixed(2)}s`, '#8ff4ff');

      // IMPACT REFLECTION: their commitment becomes your stagger economy.
      if (this.mods.impactReflection && committed) {
        const back = ATTACKS[committed as AttackId].impact * this.mods.reflectionShare;
        const r = best.vitals.addImpact(back, this.ctx.time, this.mods.exposedMult);
        this.ctx.fx.tracer(this.pos.clone().setY(this.pos.y + 9), best.pos.clone().setY(best.pos.y + 7), PLAYER_GLOW, 0.7, 0.22);
        this.events.onFlash(`REFLECTED ${Math.round(back)} IMPACT`, '#8ff4ff');
        if (r === 2) this.events.onHostileStaggered(best, 'upgrade');
      }

      // ECHO SPLIT: afterimages at the origin, and the arena has to guess.
      if (this.mods.echoSplit) this.spawnEchoes(origin);

      // BLIND ANGLE: nothing may OPEN on you, and anything already winding up aborts.
      if (this.mods.blindAngle) {
        this.blindT = this.mods.blindAngleDuration;
        for (const h of this.ctx.hostiles) if (h.alive && h.state === 'windup') h.cancelAttack();
        this.events.onFlash('BLIND ANGLE', '#8ff4ff');
      }
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
    this.openGravityWake(origin);
    this.events.onQuickBoost();
    return true;
  }

  /**
   * GRAVITY THRUSTERS. A Quick Boost TOWARD the frame you are holding opens a window in which
   * hostile ordnance near you is bent toward the wake you just left — the place you were, not
   * the place you are.
   *
   * The condition is the card's and is checked here rather than assumed: there must be a lock,
   * and the boost has to be going at it. Boosting away from your target is an escape, and an
   * escape does not also get to be a defence.
   */
  private openGravityWake(origin: THREE.Vector3) {
    if (!this.mods.gravityThrusters) return;
    const target = this.lock.primary;
    if (!target) return;
    const toward = target.pos.clone().sub(origin).setY(0);
    if (toward.lengthSq() < 1) return;
    if (this.dash.clone().setY(0).normalize().dot(toward.normalize()) < 0.35) return;
    this.ctx.ordnance.setDeflect(this.mods.gtDuration, this.mods.gtRadius, this.mods.gtDeflection, origin);
    this.ctx.fx.ring(origin, 2, this.mods.gtRadius, PLAYER_GLOW, this.mods.gtDuration);
    this.events.onFlash('WAKE', '#8ff4ff');
  }

  /**
   * ECHO SPLIT. Afterimages stand where the vanish began; each live hostile then rolls once
   * against the retarget chance and, if it is fooled, aims at one of them for the duration.
   * The roll uses the AI stream, so a seed reproduces exactly who was fooled and by which image.
   */
  private spawnEchoes(origin: THREE.Vector3) {
    this.ctx.ordnance.spawnDecoys(this.rig.root, origin, this.mods.echoCount, this.mods.echoDuration, PLAYER_GLOW);
    const images = this.ctx.ordnance.decoys;
    if (!images.length) return;
    const rng = RNG.stream('ai');
    let fooled = 0;
    for (const h of this.ctx.hostiles) {
      if (!h.alive) continue;
      const e = h as unknown as { decoy: THREE.Vector3 | null; decoyT: number };
      if (rng.chance(this.mods.echoRetarget)) {
        e.decoy = rng.pick(images).pos;
        e.decoyT = this.mods.echoDuration;
        fooled++;
      }
    }
    if (fooled) this.events.onFlash(`ECHO SPLIT · ${fooled} MISLED`, '#8ff4ff');
  }

  // ------------------------------------------------------------------ hardpoints
  private weapons(dt: number, input: InputManager) {
    const V = this.vitals;
    if (V.staggered) { this.railgunCharging = false; this.railgunCharge = 0; return; }

    if (settings.assists.holdHardLock) {
      if (input.pressed('lock')) { this.lock.acquire(this.ctx.hostiles, this.pos, this.forward()); this.lock.hard = this.lock.targets.length > 0; if (this.lock.hard) this.ctx.audio.lockOn(); }
      else if (input.released('lock') && this.lock.hard) { this.lock.hard = false; this.lock.targets = []; this.ctx.audio.lockOff(); }
    } else if (input.pressed('lock')) {
      const on = this.lock.toggleHard(this.ctx.hostiles, this.pos, this.forward());
      if (on) this.ctx.audio.lockOn(); else this.ctx.audio.lockOff();
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) this.lock.cycle(this.ctx.hostiles, Math.sign(wheel));
    if (input.pressed('cycleNext')) this.lock.cycle(this.ctx.hostiles, 1);
    if (input.pressed('cyclePrev')) this.lock.cycle(this.ctx.hostiles, -1);
    if (!this.lock.hard) this.lock.acquire(this.ctx.hostiles, this.pos, this.forward());

    // ---- primary ----
    const locked = this.mods.lockedHardpoint;
    if (locked !== 'rifle') {
      if (this.mods.momentumRailgun) this.railgun(dt, input);
      else if (input.held('rifle') && this.fireCD <= 0) { this.fireCD = T.rifleRate; this.fireRifle(); }
    }

    // ---- melee ----
    if (locked !== 'blade' && input.pressed('blade') && this.bladeCD <= 0) this.blade();

    // ---- shoulder A ----
    if (locked !== 'missiles' && !this.mods.orbitingInterceptors && input.pressed('missiles') && this.rackCD <= 0) {
      this.rackCD = T.missileRackCooldown;
      if (this.mods.mineLattice) this.deployMineLattice();
      else { this.missileQueue = this.mods.swarmLock ? EVOLUTION_VALUES.swarmCount : T.missileCount; this.missileT = 0; }
    }
    if (this.missileQueue > 0 && this.missileT <= 0) {
      this.missileT = this.mods.swarmLock ? T.missileSpacing * 0.45 : T.missileSpacing;
      this.missileQueue--;
      this.launchMissile();
    }

    // ---- shoulder B ----
    // The driver is air-only. On the ground the same input vents the KINETIC BANK, which is
    // otherwise a dead press — one button, two states, no second binding to learn.
    if (locked !== 'pile' && input.pressed('pile')) {
      if (this.pileCD <= 0 && this.altitude > T.pileMinAltitude && !this.piling) {
        this.piling = true;
        this.pileCD = this.mods.pileCooldown;
        this.ctx.audio.assaultBoostOn();
        this.driver.fireShoulder();
      } else if (this.mods.kineticBank && this.altitude <= T.pileMinAltitude) {
        this.ventBank();
      }
    }
  }

  /** Rail Core: weapon damage scales with current velocity, +0% at 62 -> +100% at 200. */
  private damageScale(): number {
    if (!this.mods.railCore) return 1;
    const k = clamp01((this.speed - UPGRADE_VALUES.railCoreMinSpeed) / (UPGRADE_VALUES.railCoreMaxSpeed - UPGRADE_VALUES.railCoreMinSpeed));
    return 1 + k * this.mods.railCoreBonus;
  }

  /** Weight of Attention: the locked target takes +35% damage. */
  private targetScale(h: Hostile): number {
    return this.mods.weightOfAttention && this.lock.all.includes(h) ? 1 + this.mods.weightLocked : 1;
  }

  dealDamage(h: Hostile, damage: number, impact: number, source: DamageSource) {
    if (!h.alive) return;
    const scale = this.damageScale() * this.targetScale(h);
    const wasStaggered = h.vitals.staggered;
    // read lock membership BEFORE the hit: a killed hostile drops out of `lock.all` immediately,
    // which would make CHAIN READ silently never fire
    const wasLocked = this.lock.targets.includes(h);
    h.applyHit(damage * scale, impact * scale, source);
    // OVERPRESSURE: the decay clock is suspended for a stated window, not the ceiling raised.
    if (this.mods.overpressure && impact > 0) h.vitals.impactFrozenFor = Math.max(h.vitals.impactFrozenFor, this.mods.overpressureHold);
    // BREAKER: the clock is not suspended, it is removed. Every frame you touch stays touched.
    if (this.mods.impactNeverDecays && impact > 0) h.vitals.noDecay = true;
    // Landing damage on a target you broke is the conversion the score is asking about.
    if (wasStaggered && source !== 'upgrade') this.events.onConversion(h);
    if (!h.alive) this.onKill(h, source, wasLocked);
  }

  onKill(h: Hostile, source: DamageSource, wasLocked = this.lock.targets.includes(h)) {
    this.events.onHostileKilled(h, source);
    // CHAIN READ: killing a locked hostile locks the nearest within 220m and grants 1.0s bullet time.
    if (this.mods.chainRead && wasLocked) {
      const next = this.lock.chainTo(this.ctx.hostiles.filter((x) => x !== h), this.pos, this.mods.chainRange);
      if (next) {
        this.events.enterSlow(0.28, this.mods.chainSlow);
        this.events.onFlash('CHAIN READ', '#8ff4ff');
        this.ctx.audio.lockOn();
      }
    }
  }

  private fireRifle() {
    // LOCK-SPLITTING RIFLE fires at EVERY lock at once rather than alternating between them.
    if (this.mods.lockSplittingRifle && this.lock.all.length > 1) { this.fireLockSplitting(); return; }
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
    if (tgt && tgt.pos.distanceTo(this.pos) < T.rifleRange) {
      this.dealDamage(tgt, T.rifleDamage, T.rifleImpact, 'rifle');
      this.ricochet(tgt);
    }
  }

  /** LOCK-SPLITTING RIFLE: 43 dmg · 18 impact into every held lock, simultaneously. */
  private fireLockSplitting() {
    const muzzle = new THREE.Vector3();
    this.rig.muzzleR.getWorldPosition(muzzle);
    this.ctx.audio.rifle();
    this.driver.fireRifle();
    for (const tgt of this.lock.all) {
      if (tgt.pos.distanceTo(this.pos) > T.rifleRange) continue;
      this.ctx.fx.tracer(muzzle, tgt.pos.clone().setY(tgt.pos.y + 7), PLAYER_GLOW, 0.7);
      this.dealDamage(tgt, EVOLUTION_VALUES.lockSplitDamage, EVOLUTION_VALUES.lockSplitImpact, 'rifle');
      this.ricochet(tgt);
    }
  }

  /** RICOCHET RIFLE: every hit bounces to a second hostile within 40m at 60%. */
  private ricochet(from: Hostile) {
    if (!this.mods.ricochetRifle) return;
    let best: Hostile | null = null, bd: number = EVOLUTION_VALUES.ricochetRange;
    for (const h of this.ctx.hostiles) {
      if (!h.alive || h === from) continue;
      const d = h.pos.distanceTo(from.pos);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    this.ctx.fx.tracer(from.pos.clone().setY(from.pos.y + 7), best.pos.clone().setY(best.pos.y + 7), PLAYER_GLOW, 0.5, 0.09);
    this.dealDamage(best, EVOLUTION_VALUES.ricochetDamage, EVOLUTION_VALUES.ricochetImpact, 'rifle');
  }

  /** MINE LATTICE: the rack stops firing and starts placing. 6 mines, 12.0s, 9m trigger. */
  private deployMineLattice() {
    const f = this.forward(), r = this.right();
    for (let i = 0; i < EVOLUTION_VALUES.mineLatticeCount; i++) {
      const a = (i / EVOLUTION_VALUES.mineLatticeCount) * Math.PI * 2;
      const p = this.pos.clone().addScaledVector(f, Math.cos(a) * 26).addScaledVector(r, Math.sin(a) * 26);
      this.ctx.confine(p, 6);
      p.y = this.ctx.groundAt(p.x, p.z) + 1.6;
      this.ctx.ordnance.spawnMine(p, EVOLUTION_VALUES.mineLatticeDamage, EVOLUTION_VALUES.mineLatticeImpact, PLAYER_GLOW, false, EVOLUTION_VALUES.mineLatticeTrigger, EVOLUTION_VALUES.mineLatticeLife);
    }
    this.ctx.audio.deploy();
    this.events.onFlash('MINE LATTICE', '#8ff4ff');
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

  /**
   * Every blade hit funnels through here, so the branch evolutions and the STAGGER upgrades
   * compose in one auditable order:
   *   1. EXECUTION BLADE decides the base magnitude from the target's STATE.
   *   2. TARGET DEBT multiplies whatever that produced, then dumps and resets.
   *   3. EXECUTION PROTOCOL amplifies against a staggered frame and refunds the cooldown.
   *   4. PHASE BLADE changes the damage SOURCE, so plates do not get a vote.
   */
  private bladeStrike(h: Hostile, damage: number, impact: number) {
    let dmg = damage;
    let imp = impact;
    if (this.mods.executionBlade) {
      const finish = h.vitals.staggered || h.vitals.isExposed;
      dmg = finish ? EVOLUTION_VALUES.executionBladeHigh : EVOLUTION_VALUES.executionBladeLow;
      if (finish) this.events.onFlash('EXECUTION BLADE', '#ffd24a');
    }
    if (this.mods.phaseBlade) { dmg = EVOLUTION_VALUES.phaseBladeDamage; imp = EVOLUTION_VALUES.phaseBladeImpact; }
    if (this.mods.targetDebt && this.debtT > 0) {
      const mult = this.debtMultiplier;
      if (mult > 1.01) {
        dmg *= mult;
        this.events.onFlash(`TARGET DEBT ×${mult.toFixed(2)}`, '#ffd24a');
      }
      this.debtT = 0;
    }
    if (this.mods.executionProtocol && h.vitals.staggered) {
      dmg *= this.mods.executionMult;
      this.bladeCD = 0;
      this.events.onFlash('EXECUTION', '#ffd24a');
    }
    this.dealDamage(h, dmg, imp, this.mods.phaseBlade ? 'phase' : 'blade');
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
    if (direct) {
      if (this.mods.anchorDriver) {
        // ANCHOR DRIVER: the target loses the verb, not the health bar.
        (direct as unknown as { pinned: number }).pinned = EVOLUTION_VALUES.anchorPin;
        this.dealDamage(direct, EVOLUTION_VALUES.anchorDamage, EVOLUTION_VALUES.anchorImpact, 'pile');
        this.ctx.fx.ring(direct.pos, 2, 18, PLAYER_GLOW, EVOLUTION_VALUES.anchorPin);
        this.events.onFlash(`PINNED ${EVOLUTION_VALUES.anchorPin.toFixed(1)}s`, '#8ff4ff');
      } else if (this.mods.breachDriver) {
        // BREACH DRIVER: plates and shields are destroyed rather than out-damaged.
        this.dealDamage(direct, EVOLUTION_VALUES.breachDamage, EVOLUTION_VALUES.breachImpact, 'breach');
        this.events.onFlash('BREACH', '#ffd24a');
      } else {
        this.dealDamage(direct, T.pileDamage, T.pileImpact, 'pile');
      }
    }
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
      const share = h.vitals.impactMax * this.mods.cascadeShare;
      for (const o of this.ctx.hostiles) {
        if (o === h || !o.alive) continue;
        const r = o.vitals.addImpact(share, this.ctx.time);
        this.ctx.fx.tracer(h.pos.clone().setY(h.pos.y + 7), o.pos.clone().setY(o.pos.y + 7), PLAYER_GLOW, 0.5, 0.18);
        if (r === 2) this.events.onHostileStaggered(o, 'upgrade');
      }
      this.events.onFlash('CASCADE BREAK', '#8ff4ff');
    }
    // SINGULARITY ENGINE: the wreck pulls the formation onto itself for 0.6s.
    if (this.mods.singularity) {
      const to = h.pos.clone();
      let pulled = 0;
      for (const o of this.ctx.hostiles) {
        if (o === h || !o.alive) continue;
        if (o.pos.distanceTo(to) > this.mods.singRadius) continue;
        (o as unknown as { pull: { to: THREE.Vector3; speed: number; t: number } | null }).pull =
          { to, speed: this.mods.singSpeed, t: this.mods.singDuration };
        pulled++;
      }
      this.ctx.fx.ring(to, this.mods.singRadius, 4, PLAYER_GLOW, this.mods.singDuration);
      if (pulled) this.events.onFlash(`SINGULARITY · ${pulled} DRAWN IN`, '#8ff4ff');
    }
    // FAULT LINE: breaking a frame you had already READ breaks its neighbour too.
    if (this.mods.faultLine && h.vitals.isExposed) {
      const near = this.ctx.hostiles
        .filter((o) => o !== h && o.alive && !o.vitals.staggered && o.pos.distanceTo(h.pos) < this.mods.flRadius)
        .sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos))
        .slice(0, this.mods.flTargets);
      for (const o of near) {
        if (o.vitals.forceStagger(this.ctx.time)) {
          this.ctx.fx.tracer(h.pos.clone().setY(h.pos.y + 7), o.pos.clone().setY(o.pos.y + 7), 0xffd24a, 0.9, 0.3);
          this.events.onHostileStaggered(o, 'upgrade');
        }
      }
      if (near.length) this.events.onFlash('FAULT LINE', '#ffd24a');
    }
    // REACTOR BLEED: drop a 40 EN core for 8.0s.
    if (this.mods.reactorBleed) this.ctx.ordnance.spawnCore(h.pos.clone(), this.mods.bleedEnergy, this.mods.bleedLife);
  }

  /**
   * SHARED FAULT. A broken frame emits a 35m field that slows every OTHER hostile's windup by
   * 40%. Evaluated once per frame over the roster rather than pushed from the stagger event, so
   * a hostile that walks into the field mid-windup is slowed and one that leaves is not.
   */
  applySharedFault() {
    if (!this.mods.sharedFault) return;
    const broken = this.ctx.hostiles.filter((h) => h.alive && h.vitals.staggered);
    for (const h of this.ctx.hostiles) {
      if (!h.alive) continue;
      const e = h as unknown as { windupSlow: number };
      if (h.vitals.staggered) { e.windupSlow = 1; continue; }
      const inField = broken.some((b) => b.pos.distanceTo(h.pos) < this.mods.sfRadius);
      e.windupSlow = inField ? 1 - this.mods.sfSlow : 1;
    }
  }

  /** COUNTERWEIGHT. Rally wins apply the full 1,400 impact to everything within 40m. */
  applyCounterweight(at: THREE.Vector3) {
    if (!this.mods.counterweight) return 0;
    let n = 0;
    for (const h of this.ctx.hostiles) {
      if (!h.alive || h.pos.distanceTo(at) > this.mods.counterweightRadius) continue;
      const r = h.vitals.addImpact(UPGRADE_VALUES.counterweightImpact, this.ctx.time, this.mods.exposedMult);
      this.ctx.fx.tracer(at.clone().setY(at.y + 8), h.pos.clone().setY(h.pos.y + 7), 0xffd24a, 0.8, 0.3);
      if (r === 2) this.events.onHostileStaggered(h, 'upgrade');
      n++;
    }
    if (n) {
      this.ctx.fx.ring(at, 3, this.mods.counterweightRadius, 0xffd24a, 0.5);
      this.events.onFlash(`COUNTERWEIGHT · ${n}`, '#ffd24a');
    }
    return n;
  }

  addEnergy(amount: number) { this.energy = clamp(this.energy + amount, 0, this.mods.energyMax); }

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
