import { UpgradeId, UPGRADES, Verb, Axis } from './Upgrades';
import { HardpointId } from './Weapons';

/**
 * GDD §8.2 — corrupted variants. Stronger effect, one downside.
 *
 * The GDD gives the downside table exactly and leaves the amplified magnitudes to the build.
 * The rule adopted here: a corrupted variant amplifies its upgrade's own headline magnitude —
 * never a generic multiplier bolted onto everything — and the card prints both the amplified
 * value and the downside in full, because "exact values on every card" applies to costs as
 * hard as it applies to benefits.
 */
export type DownsideId = 'en-ceiling' | 'structure' | 'vanish-window' | 'hardpoint-lockout' | 'flank-debt';

export interface Downside {
  id: DownsideId;
  label: string;
  machinery: string;
}

export const DOWNSIDES: Record<DownsideId, Downside> = {
  'en-ceiling': { id: 'en-ceiling', label: 'EN CEILING', machinery: 'Energy ceiling 100 → 75' },
  structure: { id: 'structure', label: 'STRUCTURE', machinery: 'Structure 9,000 → 7,200' },
  'vanish-window': { id: 'vanish-window', label: 'VANISH WINDOW', machinery: 'Perfect Vanish window 0.30s → 0.24s' },
  'hardpoint-lockout': { id: 'hardpoint-lockout', label: 'HARDPOINT LOCKOUT', machinery: 'One hardpoint disabled for the run' },
  'flank-debt': { id: 'flank-debt', label: 'FLANK DEBT', machinery: 'Non-attacking hostile forward bias 0.18 → 0.34' },
};

export const DOWNSIDE_IDS = Object.keys(DOWNSIDES) as DownsideId[];

/** Exact downside magnitudes, shared by the card text and the simulation. */
export const DOWNSIDE_VALUES = {
  energyCeiling: 75,
  structureScale: 7200 / 9000,
  vanishWindowScale: 0.24 / 0.30,
  flankDebtBias: 0.34,
} as const;

export interface CorruptedUpgrade {
  id: UpgradeId;
  name: string;
  verb: Verb;
  axes: Partial<Record<Axis, number>>;
  fantasy: string;
  /** The amplified machinery line. Always states the clean value it replaces. */
  machinery: string;
  lawIII: string;
}

/**
 * One corrupted variant per upgrade. Every amplification is an amplification of that upgrade's
 * OWN identity, so a corrupted card still reads as the same decision made louder.
 */
export const CORRUPTED: Record<UpgradeId, CorruptedUpgrade> = {
  'zero-point-reactor': {
    id: 'zero-point-reactor', name: 'ZERO-POINT REACTOR ◆', verb: 'BOOST', axes: { BOOST: 3 },
    fantasy: 'The ground is not merely quiet now. It is hostile. Altitude is the only place the reactor exists.',
    machinery: 'Ground EN regen 43 → 0/sec · Airborne EN regen 16 → 168/sec (clean: 129)',
    lawIII: 'resource conversion + spatial rule',
  },
  'rail-core': {
    id: 'rail-core', name: 'RAIL CORE ◆', verb: 'BOOST', axes: { BOOST: 3 },
    fantasy: 'Momentum is no longer a bonus applied to your weapons. It is most of them.',
    machinery: 'Weapon damage scales with velocity · +0% at 62 → +160% at 200 (clean: +100%)',
    lawIII: 'condition on every damage instance',
  },
  slipstream: {
    id: 'slipstream', name: 'SLIPSTREAM ◆', verb: 'BOOST', axes: { BOOST: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Their wake carries further than it should, and you can ride five of them at once.',
    machinery: 'Pass within 8m above 120 velocity → +100% acceleration for 0.7s · stacks to 5× (clean: 0.5s, 3×)',
    lawIII: 'spatial rule + timing rule',
  },
  'mirror-chassis': {
    id: 'mirror-chassis', name: 'MIRROR CHASSIS ◆', verb: 'VANISH', axes: { VANISH: 3 },
    fantasy: 'The frame you leave behind barely knows it is a copy.',
    machinery: 'Perfect Vanish leaves a clone for 6.0s firing your rifle at 85% (53 dmg) · one at a time (clean: 4.0s, 60%)',
    lawIII: 'verb behaviour — the vanish creates a combatant',
  },
  'vanish-battery': {
    id: 'vanish-battery', name: 'VANISH BATTERY ◆', verb: 'VANISH', axes: { VANISH: 3 },
    fantasy: 'Reading an attack correctly does not merely pay for itself. It pays for the next three.',
    machinery: 'Perfect Vanish −18 EN → +48 EN (clean: +30) · net improvement +66 EN',
    lawIII: 'resource conversion',
  },
  'predator-read': {
    id: 'predator-read', name: 'PREDATOR READ ◆', verb: 'VANISH', axes: { VANISH: 2.5, LOCK: 0.5 },
    fantasy: 'You see it forming before they have committed to it — and you are asked to answer even later.',
    machinery: 'Telegraphs appear 0.6s earlier (clean: 0.4s) · Perfect Vanish window ×0.73',
    lawIII: 'timing rule + tradeoff',
  },
  'split-lock': {
    id: 'split-lock', name: 'SPLIT LOCK ◆', verb: 'LOCK', axes: { LOCK: 3 },
    fantasy: 'Three frames wear your attention. None of them gets enough of it.',
    machinery: 'Hold 3 locks (clean: 2) · rifle alternates at full rate · each target receives 33% of your uptime',
    lawIII: 'verb behaviour + tradeoff',
  },
  'weight-of-attention': {
    id: 'weight-of-attention', name: 'WEIGHT OF ATTENTION ◆', verb: 'LOCK', axes: { LOCK: 3 },
    fantasy: 'What you look at comes apart. What you ignore is a different fight entirely.',
    machinery: 'Locked target takes +60% damage (clean: +35%) · unlocked hostiles deal +25% damage to you',
    lawIII: 'tradeoff + condition',
  },
  'chain-read': {
    id: 'chain-read', name: 'CHAIN READ ◆', verb: 'LOCK', axes: { LOCK: 2.5, VANISH: 0.5 },
    fantasy: 'A kill hands you the next target from across the arena, and a long moment to use it.',
    machinery: 'Killing a locked hostile locks the nearest within 340m (clean: 220m) · grants 1.6s bullet time (clean: 1.0s)',
    lawIII: 'interaction + timing rule',
  },
  'execution-protocol': {
    id: 'execution-protocol', name: 'EXECUTION PROTOCOL ◆', verb: 'STAGGER', axes: { STAGGER: 3 },
    fantasy: 'A broken frame is not a target any more. It is an appointment.',
    machinery: 'Blade vs staggered +320% (620 → 2,604) (clean: +200%) · immediately refunds the 0.72s cooldown',
    lawIII: 'condition + timing rule',
  },
  'cascade-break': {
    id: 'cascade-break', name: 'CASCADE BREAK ◆', verb: 'STAGGER', axes: { STAGGER: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Breaking one of them is most of the way to breaking the next two.',
    machinery: 'Staggering a target applies 65% of that target’s Impact Max to every other hostile (clean: 40%)',
    lawIII: 'interaction across the formation',
  },
  'reactor-bleed': {
    id: 'reactor-bleed', name: 'REACTOR BLEED ◆', verb: 'STAGGER', axes: { STAGGER: 2.5, GEOMETRY: 0.5 },
    fantasy: 'Every frame you break bleeds out most of a tank onto the floor.',
    machinery: 'Staggering a target drops a 70 EN core (clean: 40) · persists 12.0s (clean: 8.0s)',
    lawIII: 'resource conversion + spatial rule',
  },
};

/** Amplified magnitudes the simulation reads. Mirrors the printed card text exactly. */
export const CORRUPTED_VALUES = {
  zeroPointAirRegen: 168,
  railCoreMaxBonus: 1.6,
  slipstreamDuration: 0.7,
  slipstreamMaxStacks: 5,
  mirrorCloneDuration: 6.0,
  mirrorCloneDamageScale: 0.85,
  vanishBatteryGain: 48,
  predatorTelegraphLead: 0.6,
  splitLockCount: 3,
  weightLockedDamage: 0.60,
  chainReadRange: 340,
  chainReadSlow: 1.6,
  executionBladeMult: 4.2,      // +320%
  cascadeBreakShare: 0.65,
  reactorBleedEnergy: 70,
  reactorBleedLife: 12.0,
} as const;

export interface CorruptedOffer {
  upgrade: UpgradeId;
  downside: DownsideId;
  /** Only set when the downside is a hardpoint lockout. */
  lockedHardpoint?: HardpointId;
}

export function corruptedCard(o: CorruptedOffer) {
  const c = CORRUPTED[o.upgrade];
  const d = DOWNSIDES[o.downside];
  const machinery = o.downside === 'hardpoint-lockout' && o.lockedHardpoint
    ? `${d.machinery} — ${o.lockedHardpoint.toUpperCase()}`
    : d.machinery;
  return { ...c, cleanName: UPGRADES[o.upgrade].name, downsideLabel: d.label, downsideMachinery: machinery };
}
