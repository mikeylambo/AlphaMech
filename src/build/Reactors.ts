import { T } from '../core/Tuning';

/**
 * GDD §8.5. Reactors are piloting philosophies, not stat blocks — eight of them at 1.0 is eight
 * ways to play without authoring eight characters, which makes them the highest-ROI
 * replayability lever in the project.
 *
 * v0.3 ships four: VECTOR and MIRRORWORK from the Alpha, plus NULLPOINT and BREAKER. The two new
 * ones are deliberately opposite — NULLPOINT takes the floor away and hands you the sky;
 * BREAKER takes the sky away and hands you a hammer.
 */
export type ReactorId = 'vector' | 'mirrorwork' | 'nullpoint' | 'breaker';

export interface Reactor {
  id: ReactorId;
  name: string;
  tagline: string;
  machinery: string[];
  structure: number;
  vanishCost: number;
  /** Perfect Vanish leaves a clone for this long. 0 = none. */
  vanishCloneDuration: number;
  regenGround: number;
  regenAir: number;
  pileCooldown: number;
  bladeImpact: number;
  /** Boost-skate speed. BREAKER is the only chassis that moves this away from the baseline. */
  boostSpeed: number;
  impactNeverDecays: boolean;
}

export const REACTORS: Record<ReactorId, Reactor> = {
  vector: {
    id: 'vector', name: 'VECTOR', tagline: 'THE TEACHING CHASSIS',
    machinery: [
      `Structure ${T.playerStructure.toLocaleString()} · Impact ${T.playerImpactMax}`,
      `Perfect Vanish ${T.vanishCost} EN · window ${T.vanishWindow.toFixed(2)}s`,
      `EN regen ${T.regenGround}/sec ground · ${T.regenAir}/sec airborne`,
      'No modifiers. Every constant is the baseline.',
    ],
    structure: 9000, vanishCost: 18, vanishCloneDuration: 0,
    regenGround: 43, regenAir: 16, pileCooldown: 4.0, bladeImpact: 300, boostSpeed: 62, impactNeverDecays: false,
  },
  mirrorwork: {
    id: 'mirrorwork', name: 'MIRRORWORK', tagline: 'THE FRAME YOU LEAVE BEHIND',
    machinery: [
      'Perfect Vanish leaves a 2.0s clone',
      'Vanish cost 18 → 12 EN',
      'Structure 9,000 → 7,200',
      'Every read you win puts a second frame on the field.',
    ],
    structure: 7200, vanishCost: 12, vanishCloneDuration: 2.0,
    regenGround: 43, regenAir: 16, pileCooldown: 4.0, bladeImpact: 300, boostSpeed: 62, impactNeverDecays: false,
  },
  /**
   * NULLPOINT — the floor is not a place you may rest. Ground regen is zero and airborne regen is
   * triple the baseline, so the whole run is flown; the halved pile-driver cooldown is what you
   * are given in exchange, because from up there the driver is the natural verb.
   */
  nullpoint: {
    id: 'nullpoint', name: 'NULLPOINT', tagline: 'THE GROUND IS NOT A PLACE YOU REST',
    machinery: [
      'EN regen 43/sec ground → 0/sec · 16/sec airborne → 48/sec',
      'Pile driver cooldown 4.0s → 2.0s',
      `Structure ${T.playerStructure.toLocaleString()} · vanish ${T.vanishCost} EN`,
      'You do not land to recover. You climb to recover.',
    ],
    structure: 9000, vanishCost: 18, vanishCloneDuration: 0,
    regenGround: 0, regenAir: 48, pileCooldown: 2.0, bladeImpact: 300, boostSpeed: 62, impactNeverDecays: false,
  },
  /**
   * BREAKER — the slowest chassis in the roster, and the only one that never loses pressure it
   * has applied. Rotation gets genuinely harder (speed 62 → 37, so closing the arc costs real
   * commitment) and in return every point of impact you land stays landed.
   */
  breaker: {
    id: 'breaker', name: 'BREAKER', tagline: 'NOTHING YOU LAND EVER DRAINS AWAY',
    machinery: [
      'Boost skate speed 62 → 37',
      'Structure 9,000 → 11,500',
      'Blade impact 300 → 520',
      'Your impact never decays. Every frame you touch stays touched.',
    ],
    structure: 11500, vanishCost: 18, vanishCloneDuration: 0,
    regenGround: 43, regenAir: 16, pileCooldown: 4.0, bladeImpact: 520, boostSpeed: 37, impactNeverDecays: true,
  },
};

export const REACTOR_IDS: ReactorId[] = ['vector', 'mirrorwork', 'nullpoint', 'breaker'];
