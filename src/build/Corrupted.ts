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
  structure: { id: 'structure', label: 'STRUCTURE', machinery: 'Structure −20%' },
  'vanish-window': { id: 'vanish-window', label: 'VANISH WINDOW', machinery: 'Perfect Vanish window 0.30s → 0.24s' },
  'hardpoint-lockout': { id: 'hardpoint-lockout', label: 'HARDPOINT LOCKOUT', machinery: 'One hardpoint disabled for the run' },
  /**
   * v2.3 PATCH 4. The GDD specced 0.34, which measurement then proved is inside the forward-bias
   * dead zone: below ~0.35 the lever turns a hostile 10–15° off its orbit and that does not
   * survive into the encirclement arc. A downside that costs the player nothing makes the
   * corrupted card a free strict upgrade and silently breaks the risk economy, so the value is
   * raised past the threshold AND the spawn bearing spread widens one step alongside it.
   *
   * Acceptance bar, verified on the ladder harness (tools/fallcheck.mjs --flank): mean
   * encirclement arc must rise at least 12° against the same composition without it.
   */
  'flank-debt': { id: 'flank-debt', label: 'FLANK DEBT', machinery: 'Non-attacking hostile forward bias 0.18 → 0.45 · spawn bearing spread widened one step' },
};

export const DOWNSIDE_IDS = Object.keys(DOWNSIDES) as DownsideId[];

/** Exact downside magnitudes, shared by the card text and the simulation. */
export const DOWNSIDE_VALUES = {
  energyCeiling: 75,
  structureScale: 7200 / 9000,
  vanishWindowScale: 0.24 / 0.30,
  /** v2.3 PATCH 4 — above the measured 0.35 dead-zone threshold, not inside it. */
  flankDebtBias: 0.45,
  /** Radians added to the FALL tier's spawn spread while FLANK DEBT is held. */
  flankDebtSpawnSpread: 0.30,
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

const C = (id: UpgradeId, fantasy: string, machinery: string): CorruptedUpgrade => {
  const clean = UPGRADES[id];
  return { id, name: `${clean.name} ◆`, verb: clean.verb, axes: clean.axes, fantasy, machinery, lawIII: clean.lawIII };
};

/**
 * One corrupted variant per upgrade. Every amplification is an amplification of that upgrade's
 * OWN identity, so a corrupted card still reads as the same decision made louder.
 */
export const CORRUPTED: Record<UpgradeId, CorruptedUpgrade> = {
  // ------------------------------------------------------------------------------ BOOST
  'zero-point-reactor': C('zero-point-reactor',
    'The ground is not merely quiet now. It is hostile. Altitude is the only place the reactor exists.',
    'Ground EN regen 43 → 0/sec · Airborne EN regen 16 → 168/sec (clean: 129)'),
  'gravity-thrusters': C('gravity-thrusters',
    'Their fire does not merely follow you. It arrives late, from the wrong side, having been somewhere else.',
    'Quick Boost toward your locked target bends hostile projectiles · radius 26m (clean: 18) · deflection 95° (clean: 65°) · duration 0.70s (clean: 0.45s)'),
  'rail-core': C('rail-core',
    'Momentum is no longer a bonus applied to your weapons. It is most of them.',
    'Weapon damage scales with velocity · +0% at 62 → +160% at 200 (clean: +100%)'),
  'contrail-weave': C('contrail-weave',
    'The line you leave behind stays up long enough to be a floor plan.',
    'Boost trail persists 5.0s (clean: 3.0s) · 210 dmg + 90 impact per second (clean: 140 + 60) · width 6m (clean: 4m)'),
  overburn: C('overburn',
    'Nearly three seconds of every burn are free, and the machine resents every one of them afterwards.',
    'Assault Boost costs 0 EN for the first 2.6s of each activation (clean: 1.5s) · re-toggle lockout 3.4s (clean: 2.0s)'),
  'ground-effect': C('ground-effect',
    'Skate low and the machine hoards it. The landing is no longer an attack, it is an event.',
    'Charge 20/sec (clean: 12) · max 100 · landing discharges 13 dmg + 9 impact per charge (clean: 8 + 6) · radius 30m (clean: 22m)'),
  'kinetic-bank': C('kinetic-bank',
    'Everything you spend moving comes back, and it comes back all at once.',
    '65% of movement EN banks (clean: 40%) · max 180 (clean: 120) · discharge 8 dmg + 5 impact per point (clean: 5 + 3) · 30m cone'),
  slipstream: C('slipstream',
    'Their wake carries further than it should, and you can ride five of them at once.',
    'Pass within 8m above 120 velocity → +100% acceleration for 0.7s · stacks to 5× (clean: 0.5s, 3×)'),

  // ----------------------------------------------------------------------------- VANISH
  'mirror-chassis': C('mirror-chassis',
    'The frame you leave behind barely knows it is a copy.',
    'Perfect Vanish leaves a clone for 6.0s firing your rifle at 85% (53 dmg) · one at a time (clean: 4.0s, 60%)'),
  'echo-split': C('echo-split',
    'Three of you walk away from the blink and the arena has to guess.',
    'Perfect Vanish spawns 3 afterimages for 3.0s (clean: 2 for 2.0s) · hostiles retarget to them 90% of the time (clean: 70%)'),
  cascade: C('cascade',
    'Read them back to back and the world barely restarts between the reads.',
    'Each Perfect Vanish within 8.0s of the last extends bullet time by +0.40s · max +2.40s (clean: 6.0s, +0.25s, +1.25s)'),
  'punish-doctrine': C('punish-doctrine',
    'The window stops closing. It just runs out eventually.',
    'Exposed impact bonus 2.4× → 1.5× (clean: 1.8×) · Exposed duration 1.5s → 4.5s (clean: 3.0s)'),
  'vanish-battery': C('vanish-battery',
    'Reading an attack correctly does not merely pay for itself. It pays for the next three.',
    'Perfect Vanish −18 EN → +48 EN (clean: +30) · net improvement +66 EN'),
  counterweight: C('counterweight',
    'You win the exchange and the whole ring of them takes the hit for it.',
    'Rally wins apply the full 1,400 impact to every hostile within 62m (clean: 40m)'),
  'blind-angle': C('blind-angle',
    'For two full seconds the arena is looking for something that is not there any more.',
    'Untargetable 2.0s after a Perfect Vanish (clean: 1.2s) · hostiles in windup against you abort'),
  'predator-read': C('predator-read',
    'You see it forming before they have committed to it — and you are asked to answer even later.',
    'Telegraphs appear 0.6s earlier (clean: 0.4s) · Perfect Vanish window ×0.73'),
  'impact-reflection': C('impact-reflection',
    'The attack you dodged lands twice as hard on the frame that threw it.',
    'Vanished attacks convert 180% of their impact onto the attacker (clean: 100% — lance 190 → 342)'),

  // ------------------------------------------------------------------------------- LOCK
  'split-lock': C('split-lock',
    'Three frames wear your attention. None of them gets enough of it.',
    'Hold 3 locks (clean: 2) · rifle alternates at full rate · each target receives 33% of your uptime'),
  'chain-read': C('chain-read',
    'A kill hands you the next target from across the arena, and a long moment to use it.',
    'Killing a locked hostile locks the nearest within 340m (clean: 220m) · grants 1.6s bullet time (clean: 1.0s)'),
  'weight-of-attention': C('weight-of-attention',
    'What you look at comes apart. What you ignore is a different fight entirely.',
    'Locked target takes +60% damage (clean: +35%) · unlocked hostiles deal +25% damage to you'),
  'sensor-bloom': C('sensor-bloom',
    'The frame you are watching announces itself two seconds early, and forgets it did.',
    "Locked target's next telegraph is revealed 2.0s before windup (clean: 1.0s) · 1.0s cooldown on lock change (clean: 2.0s)"),
  'ghost-lock': C('ghost-lock',
    'The lock does not care about walls, and it does not care much about distance either.',
    'Lock persists 6.0s through line-of-sight breaks (clean: 3.0s) · position painted through geometry'),
  'target-debt': C('target-debt',
    'The longer you stare, the larger the bill. It is a very large bill.',
    'Holding a lock builds +14% blade damage per second (max +240%) (clean: +8%, +120%) · dumped on the next blade hit'),

  // ---------------------------------------------------------------------------- STAGGER
  'singularity-engine': C('singularity-engine',
    'The wreck does not merely pull. It collects.',
    'Staggering a target pulls all hostiles within 44m toward it at 70 m/s for 0.9s (clean: 30m, 45 m/s, 0.6s)'),
  'cascade-break': C('cascade-break',
    'Breaking one of them is most of the way to breaking the next two.',
    'Staggering a target applies 65% of that target’s Impact Max to every other hostile (clean: 40%)'),
  'execution-protocol': C('execution-protocol',
    'A broken frame is not a target any more. It is an appointment.',
    'Blade vs staggered +320% (620 → 2,604) (clean: +200%) · immediately refunds the 0.72s cooldown'),
  overpressure: C('overpressure',
    'Nothing drains. The pressure you put into a frame just sits there waiting for you.',
    'Impact you deal does not decay for 9.0s (clean: 5.0s)'),
  'shared-fault': C('shared-fault',
    'One broken frame and the whole screen is swinging a beat behind.',
    'Staggered enemies emit a 52m field slowing other hostiles’ windups by 60% (clean: 35m, 40%)'),
  'reactor-bleed': C('reactor-bleed',
    'Every frame you break bleeds out most of a tank onto the floor.',
    'Staggering a target drops a 70 EN core (clean: 40) · persists 12.0s (clean: 8.0s)'),
  'fault-line': C('fault-line',
    'The break does not jump to a neighbour. It jumps to two, and further.',
    'Staggering an Exposed target also staggers the TWO nearest hostiles within 70m (clean: one within 45m)'),
};

/** Amplified magnitudes the simulation reads. Mirrors the printed card text exactly. */
export const CORRUPTED_VALUES = {
  zeroPointAirRegen: 168,
  gravityThrustersRadius: 26,
  gravityThrustersDeflection: (95 * Math.PI) / 180,
  gravityThrustersDuration: 0.70,
  railCoreMaxBonus: 1.6,
  contrailLife: 5.0,
  contrailDamagePerSec: 210,
  contrailImpactPerSec: 90,
  contrailWidth: 6,
  overburnFreeSeconds: 2.6,
  overburnLockout: 3.4,
  groundEffectRate: 20,
  groundEffectDamagePerCharge: 13,
  groundEffectImpactPerCharge: 9,
  groundEffectRadius: 30,
  kineticBankShare: 0.65,
  kineticBankMax: 180,
  kineticBankDamagePerPoint: 8,
  kineticBankImpactPerPoint: 5,
  slipstreamDuration: 0.7,
  slipstreamMaxStacks: 5,

  mirrorCloneDuration: 6.0,
  mirrorCloneDamageScale: 0.85,
  echoSplitCount: 3,
  echoSplitDuration: 3.0,
  echoSplitRetargetChance: 0.90,
  cascadeWindow: 8.0,
  cascadeStep: 0.40,
  cascadeMax: 2.40,
  punishExposedMult: 1.5,
  punishExposedDuration: 4.5,
  vanishBatteryGain: 48,
  counterweightRadius: 62,
  blindAngleDuration: 2.0,
  predatorTelegraphLead: 0.6,
  impactReflectionShare: 1.8,

  splitLockCount: 3,
  chainReadRange: 340,
  chainReadSlow: 1.6,
  weightLockedDamage: 0.60,
  sensorBloomLead: 2.0,
  sensorBloomCooldown: 1.0,
  ghostLockPersist: 6.0,
  targetDebtRate: 0.14,
  targetDebtMax: 2.40,

  singularityRadius: 44,
  singularitySpeed: 70,
  singularityDuration: 0.9,
  cascadeBreakShare: 0.65,
  executionBladeMult: 4.2,      // +320%
  overpressureHold: 9.0,
  sharedFaultRadius: 52,
  sharedFaultSlow: 0.60,
  reactorBleedEnergy: 70,
  reactorBleedLife: 12.0,
  faultLineRadius: 70,
  faultLineTargets: 2,
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
