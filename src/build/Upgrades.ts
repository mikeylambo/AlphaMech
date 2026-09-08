/**
 * GDD §8.2 and LAW III — the complete thirty.
 *
 * Every upgrade here introduces or alters a condition, interaction, timing rule, spatial rule,
 * resource conversion, tradeoff, or verb behaviour. None of them is an unconditional numerical
 * increase. Every card states its exact magnitudes: `machinery` is rendered verbatim on the card
 * so no mechanical value ever hides behind flavour text.
 *
 * v0.3 completes the roster the GDD names: BOOST 8 · VANISH 9 · LOCK 6 · STAGGER 7 = 30.
 * The values below are transcribed from §8.2, not invented; where the simulation needs a
 * magnitude the card quotes, it reads it from UPGRADE_VALUES so the two can never drift.
 */
export type Verb = 'BOOST' | 'VANISH' | 'LOCK' | 'STAGGER';
export type Axis = Verb | 'GEOMETRY';

export type UpgradeId =
  // BOOST — 8
  | 'zero-point-reactor' | 'gravity-thrusters' | 'rail-core' | 'contrail-weave'
  | 'overburn' | 'ground-effect' | 'kinetic-bank' | 'slipstream'
  // VANISH — 9
  | 'mirror-chassis' | 'echo-split' | 'cascade' | 'punish-doctrine' | 'vanish-battery'
  | 'counterweight' | 'blind-angle' | 'predator-read' | 'impact-reflection'
  // LOCK — 6
  | 'split-lock' | 'chain-read' | 'weight-of-attention' | 'sensor-bloom' | 'ghost-lock' | 'target-debt'
  // STAGGER — 7
  | 'singularity-engine' | 'cascade-break' | 'execution-protocol' | 'overpressure'
  | 'shared-fault' | 'reactor-bleed' | 'fault-line';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  verb: Verb;
  /** Contribution to the discipline classifier's axes. */
  axes: Partial<Record<Axis, number>>;
  /** The fantasy line. One sentence, present tense, describing what changes about piloting. */
  fantasy: string;
  /** The machinery line. Exact values, separated by a middle dot. Never elided. */
  machinery: string;
  /** Which of Law III's categories this upgrade satisfies — surfaced in the debug panel. */
  lawIII: string;
}

export const UPGRADES: Record<UpgradeId, Upgrade> = {
  // =============================================================================== BOOST
  'zero-point-reactor': {
    id: 'zero-point-reactor', name: 'ZERO-POINT REACTOR', verb: 'BOOST',
    axes: { BOOST: 3 },
    fantasy: 'The ground stops feeding you. Altitude becomes the only place your reactor breathes.',
    machinery: 'Ground EN regen 43 → 0/sec · Airborne EN regen 16 → 129/sec',
    lawIII: 'resource conversion + spatial rule',
  },
  'gravity-thrusters': {
    id: 'gravity-thrusters', name: 'GRAVITY THRUSTERS', verb: 'BOOST',
    axes: { BOOST: 2, GEOMETRY: 2 },
    fantasy: 'Quick Boost toward what you are looking at and their fire follows you instead of leading you.',
    machinery: 'Quick Boost toward your locked target bends hostile projectiles into your wake · radius 18m · deflection 65° · duration 0.45s',
    lawIII: 'spatial rule + condition on incoming ordnance',
  },
  'rail-core': {
    id: 'rail-core', name: 'RAIL CORE', verb: 'BOOST',
    axes: { BOOST: 3 },
    fantasy: 'Your weapons draw from your momentum. Standing still is a damage penalty.',
    machinery: 'Weapon damage scales with velocity · +0% at 62 → +100% at 200',
    lawIII: 'condition on every damage instance',
  },
  'contrail-weave': {
    id: 'contrail-weave', name: 'CONTRAIL WEAVE', verb: 'BOOST',
    axes: { BOOST: 2, GEOMETRY: 3 },
    fantasy: 'Where you have been is a wall. You stop flying lines and start drawing rooms.',
    machinery: 'Boost trail persists 3.0s as damaging geometry · 140 dmg + 60 impact per second to hostiles crossing it · width 4m',
    lawIII: 'verb behaviour — movement becomes the weapon and the wall',
  },
  overburn: {
    id: 'overburn', name: 'OVERBURN', verb: 'BOOST',
    axes: { BOOST: 3, GEOMETRY: 0.5 },
    fantasy: 'The first second and a half of every burn is free. The rhythm of the fight becomes tap, tap, tap.',
    machinery: 'Assault Boost costs 0 EN for the first 1.5s of each activation · re-toggle lockout 2.0s',
    lawIII: 'timing rule + tradeoff',
  },
  'ground-effect': {
    id: 'ground-effect', name: 'GROUND EFFECT', verb: 'BOOST',
    axes: { BOOST: 2.5, GEOMETRY: 1 },
    fantasy: 'Skate low enough for long enough and the landing is the attack.',
    machinery: 'Skating below 6m builds charge at 12/sec (max 100) · landing discharges 8 dmg + 6 impact per charge · radius 22m',
    lawIII: 'spatial rule + resource conversion',
  },
  'kinetic-bank': {
    id: 'kinetic-bank', name: 'KINETIC BANK', verb: 'BOOST',
    axes: { BOOST: 3, GEOMETRY: 0.5 },
    fantasy: 'Every unit of energy you spend moving is stored, and you can hand it back to them.',
    machinery: '40% of EN spent on movement banks (max 120) · discharge for 5 dmg + 3 impact per point in a 30m cone',
    lawIII: 'resource conversion + spatial rule',
  },
  slipstream: {
    id: 'slipstream', name: 'SLIPSTREAM', verb: 'BOOST',
    axes: { BOOST: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Cutting close to a hostile at speed throws you forward off their wake.',
    machinery: 'Pass within 8m above 120 velocity → +100% acceleration for 0.5s · stacks to 3×',
    lawIII: 'spatial rule + timing rule',
  },

  // ============================================================================== VANISH
  'mirror-chassis': {
    id: 'mirror-chassis', name: 'MIRROR CHASSIS', verb: 'VANISH',
    axes: { VANISH: 3 },
    fantasy: 'The frame you left behind keeps shooting. Your vanishes start holding ground.',
    machinery: 'Perfect Vanish leaves a clone for 4.0s firing your rifle at 60% (37 dmg) · one at a time',
    lawIII: 'verb behaviour — the vanish now creates a combatant',
  },
  'echo-split': {
    id: 'echo-split', name: 'ECHO SPLIT', verb: 'VANISH',
    axes: { VANISH: 2.5, GEOMETRY: 1 },
    fantasy: 'You leave two of yourself behind, and most of them shoot the wrong one.',
    machinery: 'Perfect Vanish spawns 2 afterimages for 2.0s · hostiles retarget to them 70% of the time',
    lawIII: 'interaction — the vanish rewrites hostile targeting',
  },
  cascade: {
    id: 'cascade', name: 'CASCADE', verb: 'VANISH',
    axes: { VANISH: 3 },
    fantasy: 'Read two in a row and the world stays slow for the third.',
    machinery: 'Each Perfect Vanish within 6.0s of the last extends bullet time by +0.25s · max +1.25s',
    lawIII: 'timing rule + condition on the previous read',
  },
  'punish-doctrine': {
    id: 'punish-doctrine', name: 'PUNISH DOCTRINE', verb: 'VANISH',
    axes: { VANISH: 2, STAGGER: 1.5 },
    fantasy: 'The punish window stops being a moment and becomes a sentence.',
    machinery: 'Exposed impact bonus 2.4× → 1.8× · Exposed duration 1.5s → 3.0s',
    lawIII: 'tradeoff — magnitude traded for duration',
  },
  'vanish-battery': {
    id: 'vanish-battery', name: 'VANISH BATTERY', verb: 'VANISH',
    axes: { VANISH: 3 },
    fantasy: 'Reading an attack correctly charges you instead of costing you.',
    machinery: 'Perfect Vanish −18 EN → +30 EN (absolute sign flip) · net improvement +48 EN',
    lawIII: 'resource conversion',
  },
  counterweight: {
    id: 'counterweight', name: 'COUNTERWEIGHT', verb: 'VANISH',
    axes: { VANISH: 2, STAGGER: 2 },
    fantasy: 'Winning the exchange does not break one frame. It breaks the ones standing near it.',
    machinery: 'Rally wins apply the full 1,400 impact to every hostile within 40m',
    lawIII: 'interaction across the formation',
  },
  'blind-angle': {
    id: 'blind-angle', name: 'BLIND ANGLE', verb: 'VANISH',
    axes: { VANISH: 3, LOCK: 0.5 },
    fantasy: 'For a second and a bit after the blink, nothing in the arena knows where you went.',
    machinery: 'Untargetable 1.2s after a Perfect Vanish · hostiles in windup against you abort',
    lawIII: 'condition + interaction — targeting is suspended, not damage',
  },
  'predator-read': {
    id: 'predator-read', name: 'PREDATOR READ', verb: 'VANISH',
    axes: { VANISH: 2.5, LOCK: 0.5 },
    fantasy: 'You see the windup sooner and you are asked to answer it later. Both at once.',
    machinery: 'Telegraphs appear 0.4s earlier · Perfect Vanish window 0.30s → 0.22s',
    lawIII: 'timing rule + tradeoff',
  },
  'impact-reflection': {
    id: 'impact-reflection', name: 'IMPACT REFLECTION', verb: 'VANISH',
    axes: { VANISH: 2.5, STAGGER: 1.5 },
    fantasy: 'The attack you dodged still lands. It lands on them.',
    machinery: 'Vanished attacks convert 100% of their impact onto the attacker (lance = 190)',
    lawIII: 'resource conversion — their commitment becomes your stagger economy',
  },

  // ================================================================================ LOCK
  'split-lock': {
    id: 'split-lock', name: 'SPLIT LOCK', verb: 'LOCK',
    axes: { LOCK: 3 },
    fantasy: 'Two frames wear your attention at once. Neither of them gets all of it.',
    machinery: 'Hold 2 locks · rifle alternates at full rate · each target receives 50% of your uptime',
    lawIII: 'verb behaviour + tradeoff',
  },
  'chain-read': {
    id: 'chain-read', name: 'CHAIN READ', verb: 'LOCK',
    axes: { LOCK: 2.5, VANISH: 0.5 },
    fantasy: 'A kill hands you the next target and a moment to use it.',
    machinery: 'Killing a locked hostile locks the nearest within 220m · grants 1.0s bullet time',
    lawIII: 'interaction + timing rule',
  },
  'weight-of-attention': {
    id: 'weight-of-attention', name: 'WEIGHT OF ATTENTION', verb: 'LOCK',
    axes: { LOCK: 3 },
    fantasy: 'What you look at breaks faster. What you ignore hits harder.',
    machinery: 'Locked target takes +35% damage · unlocked hostiles deal +25% damage to you',
    lawIII: 'tradeoff + condition',
  },
  'sensor-bloom': {
    id: 'sensor-bloom', name: 'SENSOR BLOOM', verb: 'LOCK',
    axes: { LOCK: 2.5, VANISH: 1 },
    fantasy: 'Your locked frame tells you what it is about to do before it has started doing it.',
    machinery: "Locked target's next telegraph is revealed 1.0s before windup · 2.0s cooldown on lock change",
    lawIII: 'timing rule + condition on the lock',
  },
  'ghost-lock': {
    id: 'ghost-lock', name: 'GHOST LOCK', verb: 'LOCK',
    axes: { LOCK: 3, GEOMETRY: 0.5 },
    fantasy: 'Cover stops being an answer to you. The lock paints them through it.',
    machinery: 'Lock persists 3.0s through line-of-sight breaks · position painted through geometry',
    lawIII: 'spatial rule — geometry no longer breaks the lock',
  },
  'target-debt': {
    id: 'target-debt', name: 'TARGET DEBT', verb: 'LOCK',
    axes: { LOCK: 2.5, STAGGER: 1 },
    fantasy: 'Every second you keep looking at one frame is a debt the blade collects.',
    machinery: 'Holding a lock builds +8% blade damage per second (max +120%) · dumped and reset on the next blade hit',
    lawIII: 'resource conversion + timing rule',
  },

  // ============================================================================= STAGGER
  'singularity-engine': {
    id: 'singularity-engine', name: 'SINGULARITY ENGINE', verb: 'STAGGER',
    axes: { STAGGER: 2, GEOMETRY: 3 },
    fantasy: 'Breaking a frame drags the ones around it into the wreck. You stop chasing formations and start collapsing them.',
    machinery: 'Staggering a target pulls all hostiles within 30m toward it at 45 m/s for 0.6s',
    lawIII: 'spatial rule — the stagger moves the formation',
  },
  'cascade-break': {
    id: 'cascade-break', name: 'CASCADE BREAK', verb: 'STAGGER',
    axes: { STAGGER: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Breaking one of them puts a crack through the whole formation.',
    machinery: 'Staggering a target applies 40% of that target’s Impact Max to every other hostile',
    lawIII: 'interaction across the formation',
  },
  'execution-protocol': {
    id: 'execution-protocol', name: 'EXECUTION PROTOCOL', verb: 'STAGGER',
    axes: { STAGGER: 3 },
    fantasy: 'Against a broken frame the blade never needs to cool.',
    machinery: 'Blade vs staggered +200% (620 → 1,860) · immediately refunds the 0.72s cooldown',
    lawIII: 'condition + timing rule',
  },
  overpressure: {
    id: 'overpressure', name: 'OVERPRESSURE', verb: 'STAGGER',
    axes: { STAGGER: 3.5 },
    fantasy: 'Nothing you have put into a frame drains away while you are still working on it.',
    machinery: 'Impact you deal does not decay for 5.0s',
    lawIII: 'timing rule — the decay clock is suspended, not the ceiling raised',
  },
  'shared-fault': {
    id: 'shared-fault', name: 'SHARED FAULT', verb: 'STAGGER',
    axes: { STAGGER: 3, GEOMETRY: 1 },
    fantasy: 'A broken frame is contagious. Everything near it starts swinging late.',
    machinery: 'Staggered enemies emit a 35m field slowing other hostiles’ windups by 40%',
    lawIII: 'timing rule + spatial rule',
  },
  'reactor-bleed': {
    id: 'reactor-bleed', name: 'REACTOR BLEED', verb: 'STAGGER',
    axes: { STAGGER: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Every frame you break leaves fuel on the floor. Staggering becomes your economy.',
    machinery: 'Staggering a target drops a 40 EN core · persists 8.0s',
    lawIII: 'resource conversion + spatial rule',
  },
  'fault-line': {
    id: 'fault-line', name: 'FAULT LINE', verb: 'STAGGER',
    axes: { STAGGER: 3.5 },
    fantasy: 'Break a frame you had already read, and the break jumps to its neighbour.',
    machinery: 'Staggering a target while it is Exposed also staggers the nearest hostile within 45m',
    lawIII: 'condition + interaction',
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Per-verb totals, asserted at runtime by tools/content.mjs against the GDD's 8 / 9 / 6 / 7. */
export const UPGRADES_BY_VERB: Record<Verb, UpgradeId[]> = {
  BOOST: UPGRADE_IDS.filter((id) => UPGRADES[id].verb === 'BOOST'),
  VANISH: UPGRADE_IDS.filter((id) => UPGRADES[id].verb === 'VANISH'),
  LOCK: UPGRADE_IDS.filter((id) => UPGRADES[id].verb === 'LOCK'),
  STAGGER: UPGRADE_IDS.filter((id) => UPGRADES[id].verb === 'STAGGER'),
};

/** Exact magnitudes referenced by the simulation, so card text and behaviour cannot drift. */
export const UPGRADE_VALUES = {
  // BOOST
  zeroPointGroundRegen: 0,
  zeroPointAirRegen: 129,
  gravityThrustersRadius: 18,
  gravityThrustersDeflection: (65 * Math.PI) / 180,
  gravityThrustersDuration: 0.45,
  railCoreMinSpeed: 62,
  railCoreMaxSpeed: 200,
  railCoreMaxBonus: 1.0,
  contrailLife: 3.0,
  contrailDamagePerSec: 140,
  contrailImpactPerSec: 60,
  contrailWidth: 4,
  overburnFreeSeconds: 1.5,
  overburnLockout: 2.0,
  groundEffectAltitude: 6,
  groundEffectRate: 12,
  groundEffectMax: 100,
  groundEffectDamagePerCharge: 8,
  groundEffectImpactPerCharge: 6,
  groundEffectRadius: 22,
  kineticBankShare: 0.40,
  kineticBankMax: 120,
  kineticBankDamagePerPoint: 5,
  kineticBankImpactPerPoint: 3,
  kineticBankConeRange: 30,
  slipstreamRadius: 8,
  slipstreamMinSpeed: 120,
  slipstreamDuration: 0.5,
  slipstreamAccelBonus: 1.0,
  slipstreamMaxStacks: 3,

  // VANISH
  mirrorCloneDuration: 4.0,
  mirrorCloneDamageScale: 0.60,
  echoSplitCount: 2,
  echoSplitDuration: 2.0,
  echoSplitRetargetChance: 0.70,
  cascadeWindow: 6.0,
  cascadeStep: 0.25,
  cascadeMax: 1.25,
  punishExposedMult: 1.8,
  punishExposedDuration: 3.0,
  vanishBatteryGain: 30,
  counterweightRadius: 40,
  counterweightImpact: 1400,
  blindAngleDuration: 1.2,
  predatorTelegraphLead: 0.4,
  predatorVanishWindow: 0.22,
  impactReflectionShare: 1.0,

  // LOCK
  splitLockCount: 2,
  chainReadRange: 220,
  chainReadSlow: 1.0,
  weightLockedDamage: 0.35,
  weightUnlockedIncoming: 0.25,
  sensorBloomLead: 1.0,
  sensorBloomCooldown: 2.0,
  ghostLockPersist: 3.0,
  targetDebtRate: 0.08,
  targetDebtMax: 1.20,

  // STAGGER
  singularityRadius: 30,
  singularitySpeed: 45,
  singularityDuration: 0.6,
  cascadeBreakShare: 0.40,
  executionBladeMult: 3.0,       // +200%
  overpressureHold: 5.0,
  sharedFaultRadius: 35,
  sharedFaultSlow: 0.40,
  reactorBleedEnergy: 40,
  reactorBleedLife: 8.0,
  reactorBleedPickupRadius: 12,
  faultLineRadius: 45,
} as const;
