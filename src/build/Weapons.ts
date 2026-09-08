import { Axis } from './Upgrades';

/**
 * GDD §8.1 base hardpoints and §8.3 weapon evolution.
 *
 * A FORGE shows one card per un-evolved hardpoint and the player takes one. An evolved hardpoint
 * leaves the pool, so the row shrinks by one at each subsequent FORGE (four cards at FORGE 1,
 * three at FORGE 2 — the player leaves Sector 1 with two evolved hardpoints).
 */
export type HardpointId = 'rifle' | 'blade' | 'missiles' | 'pile';
export type EvolutionId = 'tether-blade' | 'momentum-railgun' | 'orbiting-interceptors' | 'seismic-driver';

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
  'tether-blade': {
    id: 'tether-blade', hardpoint: 'blade', name: 'TETHER BLADE',
    axes: { GEOMETRY: 2, STAGGER: 1 },
    fantasy: 'The blade throws a line. Range stops being a reason not to swing — and a staggered frame comes to you instead.',
    machinery: '15m tether · pulls you to the target at 90 m/s, or the target to you if staggered · 420 dmg · 220 impact',
    lawIII: 'spatial rule + conditional reversal',
  },
  'momentum-railgun': {
    id: 'momentum-railgun', hardpoint: 'rifle', name: 'MOMENTUM RAILGUN',
    axes: { BOOST: 2.5, LOCK: 0.5 },
    fantasy: 'It will not fire from a standstill. Your rifle now demands that you keep flying.',
    machinery: '0.55s charge · 380 dmg · 160 impact · cannot fire below 90 velocity',
    lawIII: 'condition + timing rule',
  },
  'orbiting-interceptors': {
    id: 'orbiting-interceptors', hardpoint: 'missiles', name: 'ORBITING INTERCEPTORS',
    axes: { GEOMETRY: 2, VANISH: 1 },
    fantasy: 'The rack stops firing outward and starts holding a shell around you.',
    machinery: '4 interceptors orbit you · destroy incoming projectiles within 25m · rebuild 1 per 3.0s',
    lawIII: 'verb behaviour — an offensive slot becomes a spatial one',
  },
  'seismic-driver': {
    id: 'seismic-driver', hardpoint: 'pile', name: 'SEISMIC DRIVER',
    axes: { STAGGER: 2, GEOMETRY: 1 },
    fantasy: 'The landing matters as much as the hit. Where you come down is now a weapon.',
    machinery: 'Landing shockwave 320 dmg · 260 impact · radius 28m · in addition to the direct hit',
    lawIII: 'spatial rule + added interaction',
  },
};

export const EVOLUTION_IDS = Object.keys(EVOLUTIONS) as EvolutionId[];
export const evolutionFor = (h: HardpointId): Evolution => EVOLUTION_IDS.map((e) => EVOLUTIONS[e]).find((e) => e.hardpoint === h)!;

/** Exact magnitudes, shared by the card text and the simulation. */
export const EVOLUTION_VALUES = {
  tetherRange: 15,
  tetherSpeed: 90,
  tetherDamage: 420,
  tetherImpact: 220,
  railgunCharge: 0.55,
  railgunDamage: 380,
  railgunImpact: 160,
  railgunMinVelocity: 90,
  interceptorCount: 4,
  interceptorRadius: 25,
  interceptorRebuild: 3.0,
  interceptorOrbit: 11,
  seismicDamage: 320,
  seismicImpact: 260,
  seismicRadius: 28,
} as const;
