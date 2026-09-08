/**
 * BLINKFALL — every feel constant. Nothing in the simulation may read a magic number.
 * The live tuning panel (ui/Debug.ts) binds directly to this object, so edits apply mid-fight.
 * Values are the GDD's; where the GDD is silent, the value comes from the OUTNUMBERED prototype
 * or the ASHFALL donor and is marked.
 */
export const T = {
  // ---------------------------------------------------------------- movement (GDD §5.1)
  speed: 62,
  accel: 16,
  thrust: 92,
  gravity: 50,
  quickSpeed: 200,
  quickDur: 0.22,
  quickCost: 20,
  quickCooldown: 0.34,
  assaultSpeed: 200,
  assaultDrain: 6,
  assaultAccel: 12,          // donor: ASHFALL profile
  energyMax: 100,
  hoverCost: 14,
  regenGround: 43,
  regenAir: 16,
  regenDelay: 0.5,
  descentSpeed: 130,         // donor
  ceiling: 240,              // altitude cap, m

  // ---------------------------------------------------------------- vitals (GDD §5.2)
  playerStructure: 9000,
  playerImpactMax: 900,
  impactDecay: 150,
  staggerPlayer: 2.2,
  staggerEnemy: 3.0,
  staggerDmgMult: 1.9,
  impactHoldAfterHit: 1.8,   // donor: seconds before impact begins decaying

  // ---------------------------------------------------------------- vanish (GDD §5.3)
  vanishWindow: 0.30,
  vanishTimeScale: 0.13,
  vanishSlowDur: 0.85,
  vanishBlink: 17,
  vanishCost: 18,
  vanishCooldown: 0.18,
  exposedDur: 1.5,
  exposedMult: 2.4,

  // ---------------------------------------------------------------- rally (GDD §5.4)
  rallyChance: 0.55,
  rallyWindow: 1.05,
  rallyRamp: 0.82,
  rallyMax: 5,
  rallyWinImpact: 1400,
  rallyWinDamage: 900,
  rallyFailDamage: 520,
  rallyFailImpact: 340,

  // ---------------------------------------------------------------- director (GDD §6.1)
  arcSafe: 145,
  arcFlank: 235,
  arcSwarm: 275,
  tokenCooldown: 1.5,
  tokenCooldownS4: 1.0,
  orbitForwardBias: 0.18,
  flankDebtBias: 0.34,       // FLANK DEBT corrupted downside (GDD §8.2)

  // ---------------------------------------------------------------- pilot model (GDD §6.3)
  pilotBlendCurrent: 0.70,
  pilotBlendProfile: 0.30,
  pilotForgeDecay: 0.25,

  // ---------------------------------------------------------------- hardpoints (GDD §8.1)
  rifleRate: 0.10,
  rifleDamage: 62,
  rifleImpact: 26,
  rifleSpread: 0.011,
  rifleRange: 600,
  bladeRange: 17,
  bladeDamage: 620,
  bladeImpact: 300,
  bladeCooldown: 0.72,
  missileCount: 6,
  missileDamage: 140,
  missileImpact: 90,
  missileRackCooldown: 1.8,
  missileSpacing: 0.08,
  missileSpeed: 118,
  missileTurn: 2.6,
  missileLife: 5.0,
  pileDamage: 900,
  pileImpact: 520,
  pileCooldown: 4.0,
  pileMinAltitude: 8,
  pileSlamSpeed: 260,

  // ---------------------------------------------------------------- camera (donor: ASHFALL)
  camDist: 30,
  camHeight: 6.4,
  camLag: 13,
  camFov: 62,
  camFovBoost: 76,
  mouseSens: 0.0023,
  padLookSens: 2.9,
  padDeadzone: 0.16,
  pitchMin: -0.85,
  pitchMax: 1.0,

  // ---------------------------------------------------------------- boss (GDD §9)
  severanceStructure: 22000,
  severanceImpactMax: 2600,
  severancePhase2At: 0.50,
  counterVanishP1Every: 2,
  counterVanishP2Chance: 0.60,
  counterVanishP2Cooldown: 4.0,

  // ---------------------------------------------------------------- scoring (GDD §10)
  scoreWeightControl: 0.30,
  scoreWeightVanish: 0.20,
  scoreWeightConversion: 0.20,
  scoreWeightFlow: 0.15,
  scoreWeightIntegrity: 0.15,
  flowReferenceSpeed: 120,
  staggerPunishWindow: 3.0,   // seconds after a stagger a hit counts as a conversion

  // ---------------------------------------------------------------- debug
  godMode: false,
  infiniteEnergy: false,
  aiEnabled: true,
  showTelemetry: false,
};

export type TuningKey = keyof typeof T;

/** Groups drive the live tuning panel's layout. */
export const TUNING_GROUPS: { title: string; keys: TuningKey[] }[] = [
  { title: 'MOVEMENT', keys: ['speed', 'accel', 'thrust', 'gravity', 'quickSpeed', 'quickDur', 'quickCost', 'quickCooldown', 'assaultSpeed', 'assaultDrain', 'energyMax', 'hoverCost', 'regenGround', 'regenAir', 'regenDelay'] },
  { title: 'VITALS', keys: ['playerStructure', 'playerImpactMax', 'impactDecay', 'staggerPlayer', 'staggerEnemy', 'staggerDmgMult'] },
  { title: 'VANISH', keys: ['vanishWindow', 'vanishTimeScale', 'vanishSlowDur', 'vanishBlink', 'vanishCost', 'vanishCooldown', 'exposedDur', 'exposedMult'] },
  { title: 'RALLY', keys: ['rallyChance', 'rallyWindow', 'rallyRamp', 'rallyMax', 'rallyWinImpact', 'rallyWinDamage', 'rallyFailDamage', 'rallyFailImpact'] },
  { title: 'DIRECTOR', keys: ['arcSafe', 'arcFlank', 'arcSwarm', 'tokenCooldown', 'orbitForwardBias', 'pilotBlendCurrent', 'pilotForgeDecay'] },
  { title: 'HARDPOINTS', keys: ['rifleRate', 'rifleDamage', 'rifleImpact', 'bladeRange', 'bladeDamage', 'bladeImpact', 'bladeCooldown', 'missileCount', 'missileDamage', 'missileImpact', 'missileRackCooldown', 'missileSpacing', 'pileDamage', 'pileImpact', 'pileCooldown'] },
  { title: 'CAMERA', keys: ['camDist', 'camHeight', 'camLag', 'camFov', 'camFovBoost', 'mouseSens', 'padLookSens'] },
  { title: 'SEVERANCE', keys: ['severanceStructure', 'severancePhase2At', 'counterVanishP1Every', 'counterVanishP2Chance', 'counterVanishP2Cooldown'] },
  { title: 'DEBUG', keys: ['godMode', 'infiniteEnergy', 'aiEnabled', 'showTelemetry'] },
];

const DEFAULTS = { ...T };
export function resetTuning() { Object.assign(T, DEFAULTS); }
export function tuningDefault(k: TuningKey) { return DEFAULTS[k]; }
