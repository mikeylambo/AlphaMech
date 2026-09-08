import { T } from '../core/Tuning';

/**
 * GDD §8.5. Tonight ships VECTOR and MIRRORWORK: MIRRORWORK exercises the vanish system hardest,
 * which is exactly the system this build has to prove.
 */
export type ReactorId = 'vector' | 'mirrorwork';

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
};

export const REACTOR_IDS: ReactorId[] = ['vector', 'mirrorwork'];
