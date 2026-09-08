import { Axis } from './Upgrades';
import { RNG } from '../core/RNG';

/**
 * GDD §8.1 base hardpoints and §8.3 weapon evolution — the complete tier-1 twelve.
 *
 * A FORGE shows one card per un-evolved hardpoint and the player takes one. An evolved hardpoint
 * leaves the pool, so the row shrinks by one at each subsequent FORGE (four cards at FORGE 1,
 * three at FORGE 2 — the player leaves Sector 1 with two evolved hardpoints).
 *
 * v0.3 completes the roster: three evolutions per hardpoint rather than one, so which branch a
 * hardpoint is *offered* is now a seeded draw. That is the whole difference between "the blade
 * becomes the tether blade" and "the blade becomes something, and the seed decides what" — the
 * same FORGE cost, three times the run variance.
 */
export type HardpointId = 'rifle' | 'blade' | 'missiles' | 'pile';

export type EvolutionId =
  | 'phase-blade' | 'tether-blade' | 'execution-blade'
  | 'ricochet-rifle' | 'lock-splitting-rifle' | 'momentum-railgun'
  | 'orbiting-interceptors' | 'mine-lattice' | 'swarm-lock'
  | 'seismic-driver' | 'anchor-driver' | 'breach-driver';

export interface Hardpoint {
  id: HardpointId;
  slot: string;
  name: string;
  machinery: string;
}

export const HARDPOINTS: Record<HardpointId, Hardpoint> = {
  rifle: { id: 'rifle', slot: 'PRIMARY', name: 'RIFLE', machinery: '0.10s rate · 62 dmg · 26 impact' },
  blade: { id: 'blade', slot: 'MELEE', name: 'ENERGY BLADE', machinery: '17m · 620 dmg · 300 impact · 0.72s cooldown' },
  missiles: { id: 'missiles', slot: 'SHOULDER A', name: 'MISSILE RACK', machinery: '6 missiles · 140 dmg · 90 impact each · 1.8s rack cooldown · 0.08s launch spacing · soft-homing' },
  pile: { id: 'pile', slot: 'SHOULDER B', name: 'PILE DRIVER', machinery: 'air-only · 900 dmg · 520 impact · 4.0s cooldown' },
};

export const HARDPOINT_ORDER: HardpointId[] = ['rifle', 'blade', 'missiles', 'pile'];

export interface Evolution {
  id: EvolutionId;
  hardpoint: HardpointId;
  name: string;
  axes: Partial<Record<Axis, number>>;
  fantasy: string;
  machinery: string;
  lawIII: string;
}

export const EVOLUTIONS: Record<EvolutionId, Evolution> = {
  // ------------------------------------------------------------------------------ BLADE
  'phase-blade': {
    id: 'phase-blade', hardpoint: 'blade', name: 'PHASE BLADE',
    axes: { STAGGER: 1, VANISH: 1.5, GEOMETRY: 0.5 },
    fantasy: 'The blade stops acknowledging armour. A WARDEN’s shield is now a decoration it walks through.',
    machinery: 'Passes shields and plates outright · 620 dmg · 0 impact · 0.72s cooldown',
    lawIII: 'condition removed — and impact traded away for it',
  },
  'tether-blade': {
    id: 'tether-blade', hardpoint: 'blade', name: 'TETHER BLADE',
    axes: { GEOMETRY: 2, STAGGER: 1 },
    fantasy: 'The blade throws a line. Range stops being a reason not to swing — and a staggered frame comes to you instead.',
    machinery: '15m tether · pulls you to the target at 90 m/s, or the target to you if staggered · 420 dmg · 220 impact',
    lawIII: 'spatial rule + conditional reversal',
  },
  'execution-blade': {
    id: 'execution-blade', hardpoint: 'blade', name: 'EXECUTION BLADE',
    axes: { STAGGER: 2.5, VANISH: 0.5 },
    fantasy: 'Against a frame you have already beaten it is a finisher. Against a healthy one it is barely a weapon.',
    machinery: '1,550 dmg vs staggered or Exposed · 240 dmg otherwise · 300 impact · 0.72s cooldown',
    lawIII: 'condition — the whole magnitude lives behind a state check',
  },

  // ------------------------------------------------------------------------------ RIFLE
  'ricochet-rifle': {
    id: 'ricochet-rifle', hardpoint: 'rifle', name: 'RICOCHET RIFLE',
    axes: { LOCK: 1.5, GEOMETRY: 1.5 },
    fantasy: 'Every round looks for somewhere else to be. Tight formations stop being a shield.',
    machinery: 'Each hit bounces to a second hostile within 40m at 60% · 37 dmg · 16 impact on the bounce',
    lawIII: 'interaction — proximity between hostiles becomes your damage',
  },
  'lock-splitting-rifle': {
    id: 'lock-splitting-rifle', hardpoint: 'rifle', name: 'LOCK-SPLITTING RIFLE',
    axes: { LOCK: 3 },
    fantasy: 'It fires at everything you are holding, at once, without alternating.',
    machinery: 'Fires at every lock simultaneously at 70% each · 43 dmg · 18 impact per target',
    lawIII: 'verb behaviour — the lock stops being a target and becomes a list',
  },
  'momentum-railgun': {
    id: 'momentum-railgun', hardpoint: 'rifle', name: 'MOMENTUM RAILGUN',
    axes: { BOOST: 2.5, LOCK: 0.5 },
    fantasy: 'It will not fire from a standstill. Your rifle now demands that you keep flying.',
    machinery: '0.55s charge · 380 dmg · 160 impact · cannot fire below 90 velocity',
    lawIII: 'condition + timing rule',
  },

  // --------------------------------------------------------------------------- MISSILES
  'orbiting-interceptors': {
    id: 'orbiting-interceptors', hardpoint: 'missiles', name: 'ORBITING INTERCEPTORS',
    axes: { GEOMETRY: 2, VANISH: 1 },
    fantasy: 'The rack stops firing outward and starts holding a shell around you.',
    machinery: '4 interceptors orbit you · destroy incoming projectiles within 25m · rebuild 1 per 3.0s',
    lawIII: 'verb behaviour — an offensive slot becomes a spatial one',
  },
  'mine-lattice': {
    id: 'mine-lattice', hardpoint: 'missiles', name: 'MINE LATTICE',
    axes: { GEOMETRY: 3 },
    fantasy: 'You stop shooting at where they are and start pricing where they are going.',
    machinery: '6 mines · 12.0s life · 260 dmg · 180 impact · 9m trigger · 1.8s rack cooldown',
    lawIII: 'spatial rule — damage is placed, not aimed',
  },
  'swarm-lock': {
    id: 'swarm-lock', hardpoint: 'missiles', name: 'SWARM LOCK',
    axes: { LOCK: 2, GEOMETRY: 1 },
    fantasy: 'Fourteen of them leave the rack and the arena divides itself between everything you are holding.',
    machinery: '14 micro-missiles · 55 dmg · 30 impact each · distributed across all locks · 1.8s rack cooldown',
    lawIII: 'interaction — the rack reads the lock list rather than one target',
  },

  // ------------------------------------------------------------------------------- PILE
  'seismic-driver': {
    id: 'seismic-driver', hardpoint: 'pile', name: 'SEISMIC DRIVER',
    axes: { STAGGER: 2, GEOMETRY: 1 },
    fantasy: 'The landing matters as much as the hit. Where you come down is now a weapon.',
    machinery: 'Landing shockwave 320 dmg · 260 impact · radius 28m · in addition to the direct hit',
    lawIII: 'spatial rule + added interaction',
  },
  'anchor-driver': {
    id: 'anchor-driver', hardpoint: 'pile', name: 'ANCHOR DRIVER',
    axes: { GEOMETRY: 2.5, STAGGER: 1 },
    fantasy: 'It does not just hit them. It nails them to the floor and leaves them there.',
    machinery: 'Pins the target for 2.2s — no movement, no flight · 640 dmg · 520 impact · 4.0s cooldown',
    lawIII: 'spatial rule — the target loses the verb, not the health',
  },
  'breach-driver': {
    id: 'breach-driver', hardpoint: 'pile', name: 'BREACH DRIVER',
    axes: { STAGGER: 2, LOCK: 1 },
    fantasy: 'Plates and shields are a problem you solve once, from above, permanently.',
    machinery: 'Destroys plates and shields outright · 900 dmg · 300 impact · 4.0s cooldown',
    lawIII: 'interaction — armour state is removed rather than out-damaged',
  },
};

export const EVOLUTION_IDS = Object.keys(EVOLUTIONS) as EvolutionId[];

/** Every branch a hardpoint may take. Three each, per §8.3. */
export const EVOLUTIONS_BY_HARDPOINT: Record<HardpointId, EvolutionId[]> = {
  rifle: EVOLUTION_IDS.filter((e) => EVOLUTIONS[e].hardpoint === 'rifle'),
  blade: EVOLUTION_IDS.filter((e) => EVOLUTIONS[e].hardpoint === 'blade'),
  missiles: EVOLUTION_IDS.filter((e) => EVOLUTIONS[e].hardpoint === 'missiles'),
  pile: EVOLUTION_IDS.filter((e) => EVOLUTIONS[e].hardpoint === 'pile'),
};

/**
 * Which branch this hardpoint is offering at this FORGE. Drawn from the offers stream so a seed
 * fixes the whole FORGE, evolution row included — the same guarantee RETRY SEED already makes
 * about upgrade cards.
 */
export function offeredEvolution(h: HardpointId): EvolutionId {
  return RNG.stream('offers').pick(EVOLUTIONS_BY_HARDPOINT[h]);
}

/** Exact magnitudes, shared by the card text and the simulation. */
export const EVOLUTION_VALUES = {
  // blade
  phaseBladeDamage: 620,
  phaseBladeImpact: 0,
  tetherRange: 15,
  tetherSpeed: 90,
  tetherDamage: 420,
  tetherImpact: 220,
  executionBladeHigh: 1550,
  executionBladeLow: 240,
  // rifle
  ricochetRange: 40,
  ricochetScale: 0.60,
  ricochetDamage: 37,
  ricochetImpact: 16,
  lockSplitScale: 0.70,
  lockSplitDamage: 43,
  lockSplitImpact: 18,
  railgunCharge: 0.55,
  railgunDamage: 380,
  railgunImpact: 160,
  railgunMinVelocity: 90,
  // missiles
  interceptorCount: 4,
  interceptorRadius: 25,
  interceptorRebuild: 3.0,
  interceptorOrbit: 11,
  mineLatticeCount: 6,
  mineLatticeLife: 12.0,
  mineLatticeDamage: 260,
  mineLatticeImpact: 180,
  mineLatticeTrigger: 9,
  swarmCount: 14,
  swarmDamage: 55,
  swarmImpact: 30,
  // pile
  seismicDamage: 320,
  seismicImpact: 260,
  seismicRadius: 28,
  anchorPin: 2.2,
  anchorDamage: 640,
  anchorImpact: 520,
  breachDamage: 900,
  breachImpact: 300,
} as const;
