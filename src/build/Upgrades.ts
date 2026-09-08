/**
 * GDD §8.2 and LAW III.
 *
 * Every upgrade here introduces or alters a condition, interaction, timing rule, spatial rule,
 * resource conversion, tradeoff, or verb behaviour. None of them is an unconditional numerical
 * increase. Every card states its exact magnitudes: `machinery` is rendered verbatim on the card
 * so no mechanical value ever hides behind flavour text.
 */
export type Verb = 'BOOST' | 'VANISH' | 'LOCK' | 'STAGGER';
export type Axis = Verb | 'GEOMETRY';

export type UpgradeId =
  | 'zero-point-reactor' | 'rail-core' | 'slipstream'
  | 'mirror-chassis' | 'vanish-battery' | 'predator-read'
  | 'split-lock' | 'weight-of-attention' | 'chain-read'
  | 'execution-protocol' | 'cascade-break' | 'reactor-bleed';

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
  'zero-point-reactor': {
    id: 'zero-point-reactor', name: 'ZERO-POINT REACTOR', verb: 'BOOST',
    axes: { BOOST: 3 },
    fantasy: 'The ground stops feeding you. Altitude becomes the only place your reactor breathes.',
    machinery: 'Ground EN regen 43 → 0/sec · Airborne EN regen 16 → 129/sec',
    lawIII: 'resource conversion + spatial rule',
  },
  'rail-core': {
    id: 'rail-core', name: 'RAIL CORE', verb: 'BOOST',
    axes: { BOOST: 3 },
    fantasy: 'Your weapons draw from your momentum. Standing still is a damage penalty.',
    machinery: 'Weapon damage scales with velocity · +0% at 62 → +100% at 200',
    lawIII: 'condition on every damage instance',
  },
  slipstream: {
    id: 'slipstream', name: 'SLIPSTREAM', verb: 'BOOST',
    axes: { BOOST: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Cutting close to a hostile at speed throws you forward off their wake.',
    machinery: 'Pass within 8m above 120 velocity → +100% acceleration for 0.5s · stacks to 3×',
    lawIII: 'spatial rule + timing rule',
  },
  'mirror-chassis': {
    id: 'mirror-chassis', name: 'MIRROR CHASSIS', verb: 'VANISH',
    axes: { VANISH: 3 },
    fantasy: 'The frame you left behind keeps shooting. Your vanishes start holding ground.',
    machinery: 'Perfect Vanish leaves a clone for 4.0s firing your rifle at 60% (37 dmg) · one at a time',
    lawIII: 'verb behaviour — the vanish now creates a combatant',
  },
  'vanish-battery': {
    id: 'vanish-battery', name: 'VANISH BATTERY', verb: 'VANISH',
    axes: { VANISH: 3 },
    fantasy: 'Reading an attack correctly charges you instead of costing you.',
    machinery: 'Perfect Vanish −18 EN → +30 EN (absolute sign flip) · net improvement +48 EN',
    lawIII: 'resource conversion',
  },
  'predator-read': {
    id: 'predator-read', name: 'PREDATOR READ', verb: 'VANISH',
    axes: { VANISH: 2.5, LOCK: 0.5 },
    fantasy: 'You see the windup sooner and you are asked to answer it later. Both at once.',
    machinery: 'Telegraphs appear 0.4s earlier · Perfect Vanish window 0.30s → 0.22s',
    lawIII: 'timing rule + tradeoff',
  },
  'split-lock': {
    id: 'split-lock', name: 'SPLIT LOCK', verb: 'LOCK',
    axes: { LOCK: 3 },
    fantasy: 'Two frames wear your attention at once. Neither of them gets all of it.',
    machinery: 'Hold 2 locks · rifle alternates at full rate · each target receives 50% of your uptime',
    lawIII: 'verb behaviour + tradeoff',
  },
  'weight-of-attention': {
    id: 'weight-of-attention', name: 'WEIGHT OF ATTENTION', verb: 'LOCK',
    axes: { LOCK: 3 },
    fantasy: 'What you look at breaks faster. What you ignore hits harder.',
    machinery: 'Locked target takes +35% damage · unlocked hostiles deal +25% damage to you',
    lawIII: 'tradeoff + condition',
  },
  'chain-read': {
    id: 'chain-read', name: 'CHAIN READ', verb: 'LOCK',
    axes: { LOCK: 2.5, VANISH: 0.5 },
    fantasy: 'A kill hands you the next target and a moment to use it.',
    machinery: 'Killing a locked hostile locks the nearest within 220m · grants 1.0s bullet time',
    lawIII: 'interaction + timing rule',
  },
  'execution-protocol': {
    id: 'execution-protocol', name: 'EXECUTION PROTOCOL', verb: 'STAGGER',
    axes: { STAGGER: 3 },
    fantasy: 'Against a broken frame the blade never needs to cool.',
    machinery: 'Blade vs staggered +200% (620 → 1,860) · immediately refunds the 0.72s cooldown',
    lawIII: 'condition + timing rule',
  },
  'cascade-break': {
    id: 'cascade-break', name: 'CASCADE BREAK', verb: 'STAGGER',
    axes: { STAGGER: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Breaking one of them puts a crack through the whole formation.',
    machinery: 'Staggering a target applies 40% of that target’s Impact Max to every other hostile',
    lawIII: 'interaction across the formation',
  },
  'reactor-bleed': {
    id: 'reactor-bleed', name: 'REACTOR BLEED', verb: 'STAGGER',
    axes: { STAGGER: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Every frame you break leaves fuel on the floor. Staggering becomes your economy.',
    machinery: 'Staggering a target drops a 40 EN core · persists 8.0s',
    lawIII: 'resource conversion + spatial rule',
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Exact magnitudes referenced by the simulation, so card text and behaviour cannot drift. */
export const UPGRADE_VALUES = {
  zeroPointGroundRegen: 0,
  zeroPointAirRegen: 129,
  railCoreMinSpeed: 62,
  railCoreMaxSpeed: 200,
  railCoreMaxBonus: 1.0,
  slipstreamRadius: 8,
  slipstreamMinSpeed: 120,
  slipstreamDuration: 0.5,
  slipstreamAccelBonus: 1.0,
  slipstreamMaxStacks: 3,
  mirrorCloneDuration: 4.0,
  mirrorCloneDamageScale: 0.60,
  vanishBatteryGain: 30,
  predatorTelegraphLead: 0.4,
  predatorVanishWindow: 0.22,
  splitLockCount: 2,
  weightLockedDamage: 0.35,
  weightUnlockedIncoming: 0.25,
  chainReadRange: 220,
  chainReadSlow: 1.0,
  executionBladeMult: 3.0,       // +200%
  cascadeBreakShare: 0.40,
  reactorBleedEnergy: 40,
  reactorBleedLife: 8.0,
  reactorBleedPickupRadius: 12,
} as const;
