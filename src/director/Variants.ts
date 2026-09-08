import { RNG } from '../core/RNG';
import { ArchetypeId } from '../enemies/Archetypes';
import { EliteId } from '../enemies/Elites';
import { EncounterId, ENCOUNTERS, StressTag } from './Encounters';

/**
 * ============================================================================================
 * ENCOUNTER VARIANTS  (v0.2 §3.3)
 *
 * Four authored configurations for each of the six shipped states. Same systems, different
 * composition, geometry and objective — the cheapest variety in the project, because none of it
 * is a new mechanic, it is the existing mechanics arranged to ask a different question.
 *
 * Every variant INHERITS its state's primaryStress and secondaryStress. Chain Law 2 continues
 * to operate on the state, never on the variant, so chain generation is untouched by any of
 * this: the seed picks a chain, the chain names states, and the state's variant is drawn
 * afterwards.
 * ============================================================================================
 */
export type GeometryMode =
  | 'baseline'
  | 'shrinking'        // usable space collapses inward over the encounter
  | 'hazard-grid'      // static pulsing emitters across the floor
  | 'dropping-floor'   // floor sectors fail in rotation; altitude becomes mandatory
  | 'en-drain'         // drain fields punish the obvious route
  | 'rotating-hazards' // sweeping arms through a vertical descent
  | 'wake';            // a large machine hazards the corridor ahead of you

export type ObjectiveMode =
  | 'clear'            // destroy every hostile
  | 'reach-exit'       // fly it, survive it
  | 'survive'          // hold out for a duration under continuous pressure
  | 'destroy-targets'  // kill the transports before they leave
  | 'intercept';       // bring down a runner before it escapes

export interface VariantSpec {
  id: string;
  state: EncounterId;
  name: string;
  /** The objective line the HUD leads with. */
  brief: string;
  /** One line of designer intent — what this configuration is asking of the pilot. */
  asks: string;

  // --- composition ---
  pool?: ArchetypeId[];
  count?: [number, number];
  waves?: number;
  /** Elites this variant adds on top of the FALL tier's allocation. */
  elites?: number;
  eliteBias?: EliteId;

  // --- geometry ---
  geometry: GeometryMode;
  /** Scales the geometry's aggression. Multiplied by the FALL tier's geometryPressure. */
  geometryScale?: number;

  // --- objective ---
  objective: ObjectiveMode;
  /** Seconds, for survive and for the timers on destroy-targets / intercept. */
  duration?: number;
  targets?: number;

  // --- behaviour modifiers ---
  /** The opponent mirrors the player's reactor behaviour. */
  mirrorReactor?: boolean;
  /** Opponent opens at this fraction of structure, with everything at sweep-tier windup. */
  suddenStart?: number;
  /** Weight attack selection toward the tightest reads in each frame's table. */
  tightWindups?: boolean;
  /** Missiles home continuously; no stationary point is safe. */
  homingPressure?: boolean;
}

const V = (v: VariantSpec) => v;

export const VARIANTS: VariantSpec[] = [
  // ------------------------------------------------------------------------------ ARENA
  V({ id: 'arena-standard', state: 'ARENA', name: 'STANDARD FORMATION', brief: 'HOLD THE FORMATION IN FRONT OF YOU',
      asks: 'the baseline rotation exam', geometry: 'baseline', objective: 'clear' }),
  V({ id: 'arena-reinforced', state: 'ARENA', name: 'REINFORCED', brief: 'A SECOND WAVE IS INBOUND',
      asks: 'rotate while the shape of the fight changes underneath you',
      waves: 2, geometry: 'baseline', objective: 'clear' }),
  V({ id: 'arena-elite-core', state: 'ARENA', name: 'ELITE CORE', brief: 'BREAK THE ANCHOR OR THE ARC NEVER CLOSES',
      asks: 'the formation orients on one frame — deal with it or rotate forever',
      elites: 1, eliteBias: 'anchor', geometry: 'baseline', objective: 'clear' }),
  V({ id: 'arena-contested', state: 'ARENA', name: 'CONTESTED GROUND', brief: 'THE FLOOR IS CLOSING',
      asks: 'rotation with a shrinking circle to rotate inside',
      geometry: 'shrinking', geometryScale: 1, objective: 'clear' }),

  // ------------------------------------------------------------------------------- DUEL
  V({ id: 'duel-ace', state: 'DUEL', name: 'ACE', brief: 'ONE FRAME. READ THE WINDUP',
      asks: 'pure execution against a full attack table',
      count: [1, 1], elites: 1, eliteBias: 'phased', geometry: 'baseline', objective: 'clear' }),
  V({ id: 'duel-mirror', state: 'DUEL', name: 'MIRROR', brief: 'IT FLIES THE WAY YOU DO',
      asks: 'fight your own reactor',
      count: [1, 1], mirrorReactor: true, elites: 1, eliteBias: 'relentless', geometry: 'baseline', objective: 'clear' }),
  V({ id: 'duel-sudden', state: 'DUEL', name: 'SUDDEN', brief: 'IT IS ALREADY BROKEN. IT IS ALSO ALREADY SWINGING',
      asks: 'a short fight at the tightest read in the roster',
      count: [1, 1], suddenStart: 0.4, tightWindups: true, geometry: 'baseline', objective: 'clear' }),
  V({ id: 'duel-warden', state: 'DUEL', name: "WARDEN'S TEST", brief: 'THE SHIELD ONLY BREAKS TO A PUNISH',
      asks: 'the vanish is not optional here',
      count: [1, 1], pool: ['warden'], elites: 1, eliteBias: 'screened', geometry: 'baseline', objective: 'clear' }),

  // ------------------------------------------------------------------------------ STORM
  V({ id: 'storm-curtain', state: 'STORM', name: 'CURTAIN', brief: 'WALK THE GAPS',
      asks: 'sustained mortar lattice — read the floor, not the frames',
      pool: ['sentry'], count: [2, 2], elites: 2, eliteBias: 'phased', geometry: 'baseline', objective: 'clear' }),
  V({ id: 'storm-grid', state: 'STORM', name: 'GRID', brief: 'THE GROUND IS ALREADY TAKEN',
      asks: 'static hazard geometry plus one frame that punishes standing still',
      pool: ['lancer'], count: [1, 1], geometry: 'hazard-grid', geometryScale: 1, objective: 'clear' }),
  V({ id: 'storm-tracking', state: 'STORM', name: 'TRACKING', brief: 'NOTHING STATIONARY IS SAFE',
      asks: 'continuous homing pressure — boost is the answer, EN is the cost',
      pool: ['sentry', 'harrier'], count: [2, 2], homingPressure: true, geometry: 'baseline', objective: 'clear' }),
  V({ id: 'storm-collapse', state: 'STORM', name: 'COLLAPSE', brief: 'THE FLOOR IS LEAVING',
      asks: 'altitude becomes mandatory, and altitude costs EN',
      pool: ['sentry', 'warden'], count: [1, 2], geometry: 'dropping-floor', geometryScale: 1, objective: 'clear' }),

  // ---------------------------------------------------------------------------- PURSUIT
  V({ id: 'pursuit-rival', state: 'PURSUIT', name: 'RIVAL PURSUIT', brief: 'RUN IT DOWN BEFORE IT REACHES THE EXIT',
      asks: 'chase at speed and still land the read',
      pool: ['harrier', 'lancer'], count: [2, 3], objective: 'intercept', duration: 60, geometry: 'baseline' }),
  V({ id: 'pursuit-convoy', state: 'PURSUIT', name: 'CONVOY INTERCEPTION', brief: 'DESTROY THE TRANSPORTS BEFORE THEY EXIT',
      asks: 'a target that does not fight back and does not wait',
      pool: ['lancer', 'brawler'], count: [2, 2], objective: 'destroy-targets', targets: 3, duration: 70, geometry: 'baseline' }),
  V({ id: 'pursuit-escape', state: 'PURSUIT', name: 'ESCAPE PURSUIT', brief: 'YOU ARE THE ONE BEING CHASED. REACH THE EXIT',
      asks: 'rotation while retreating — the hardest version of Law II',
      pool: ['harrier', 'brawler'], count: [3, 3], waves: 2, objective: 'reach-exit', geometry: 'baseline' }),
  V({ id: 'pursuit-wake', state: 'PURSUIT', name: 'MACHINE WAKE', brief: 'SOMETHING LARGER IS USING THIS CORRIDOR',
      asks: 'fight inside a moving hazard',
      pool: ['lancer', 'harrier'], count: [2, 3], geometry: 'wake', geometryScale: 1, objective: 'clear' }),

  // ------------------------------------------------------------------------------- HUNT
  V({ id: 'hunt-flock', state: 'HUNT', name: 'FLOCK', brief: 'MANY, AND NONE OF THEM ALONE',
      asks: 'a wide arc at altitude, low individual threat',
      pool: ['harrier'], count: [4, 5], geometry: 'baseline', objective: 'clear' }),
  V({ id: 'hunt-anchor', state: 'HUNT', name: 'HIGH ANCHOR', brief: 'THE SCREEN IS NOT THE TARGET',
      asks: 'reach the elevated frame through the frames protecting it',
      pool: ['harrier', 'sentry'], count: [3, 4], elites: 1, eliteBias: 'anchor', geometry: 'baseline', objective: 'clear' }),
  V({ id: 'hunt-descent', state: 'HUNT', name: 'DESCENT HUNT', brief: 'THE FIGHT IS THE FALL',
      asks: 'the whole encounter happens on the way down',
      pool: ['harrier'], count: [3, 4], geometry: 'rotating-hazards', geometryScale: 0.85, objective: 'clear' }),
  V({ id: 'hunt-interceptors', state: 'HUNT', name: 'INTERCEPTORS', brief: 'THEY ARE MINING YOUR ALTITUDE',
      asks: 'the altitude band you want is the one they have seeded',
      pool: ['harrier'], count: [3, 4], waves: 2, tightWindups: true, geometry: 'baseline', objective: 'clear' }),

  // -------------------------------------------------------------------------- TRAVERSAL
  V({ id: 'traversal-conduit', state: 'TRAVERSAL', name: 'CONDUIT RUN', brief: 'FLY IT CLEAN',
      asks: 'the speed course', geometry: 'baseline', objective: 'reach-exit' }),
  V({ id: 'traversal-collapsing', state: 'TRAVERSAL', name: 'COLLAPSING SPAN', brief: 'IT IS FAILING BEHIND YOU',
      asks: 'no route planning — commit forward',
      geometry: 'baseline', objective: 'reach-exit', duration: 44 }),
  V({ id: 'traversal-vent', state: 'TRAVERSAL', name: 'PRESSURE VENT', brief: 'THE SHORT ROUTE COSTS ENERGY',
      asks: 'route choice priced in EN',
      geometry: 'en-drain', geometryScale: 1, objective: 'reach-exit' }),
  V({ id: 'traversal-blind', state: 'TRAVERSAL', name: 'BLIND DESCENT', brief: 'DOWN, THROUGH MOVING GEOMETRY',
      asks: 'vertical piloting with rotating hazards',
      geometry: 'rotating-hazards', geometryScale: 1.15, objective: 'reach-exit' }),
];

export const VARIANTS_BY_STATE: Record<EncounterId, VariantSpec[]> = (() => {
  const m = {} as Record<EncounterId, VariantSpec[]>;
  for (const v of VARIANTS) (m[v.state] ??= []).push(v);
  return m;
})();

export const variantById = (id: string) => VARIANTS.find((v) => v.id === id) ?? null;

/**
 * Draw a variant for a state. Uses the layout stream so a seed's encounter configurations are
 * fixed at the same point every run, exactly like its geometry.
 */
export function pickVariant(state: EncounterId): VariantSpec {
  const pool = VARIANTS_BY_STATE[state];
  if (!pool || !pool.length) {
    return { id: `${state.toLowerCase()}-default`, state, name: 'STANDARD', brief: ENCOUNTERS[state].brief, asks: '', geometry: 'baseline', objective: 'clear' };
  }
  return RNG.stream('layout').pick(pool);
}

/** Variants never override stress: Chain Law 2 operates on the state. */
export function variantStress(v: VariantSpec): { primary: StressTag; secondary: StressTag } {
  const s = ENCOUNTERS[v.state];
  return { primary: s.primaryStress, secondary: s.secondaryStress };
}
