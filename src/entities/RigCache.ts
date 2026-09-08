import { MechRig } from './MechRig';
import { MechPalette } from './Materials';
import { buildPlayerMech, buildStandardMech, buildHeavyMech, buildDrone } from './MechModels';

/**
 * One built prototype per chassis, instanced for every spawn.
 *
 * The prototypes are built with a neutral palette and never enter the scene; instances get
 * their own materials so a hostile can flare while its siblings do not.
 */
export type Chassis = 'standard' | 'sniper' | 'brawler' | 'heavy' | 'drone' | 'ace';

const protos = new Map<Chassis, MechRig>();

function build(chassis: Chassis, palette: MechPalette): MechRig {
  switch (chassis) {
    case 'heavy': return buildHeavyMech(palette);
    case 'drone': return buildDrone(palette);
    case 'ace': return buildPlayerMech(palette);
    case 'sniper': return buildStandardMech(palette, 'sniper');
    case 'brawler': return buildStandardMech(palette, 'brawler');
    default: return buildStandardMech(palette, 'gun');
  }
}

export function rigFor(chassis: Chassis, palette: MechPalette): MechRig {
  let proto = protos.get(chassis);
  if (!proto) { proto = build(chassis, palette); protos.set(chassis, proto); }
  return MechRig.cloneFrom(proto, palette);
}

/** Build every chassis up front so the first ARENA of a run does not pay for it. */
export function prewarmRigs(palettes: Record<Chassis, MechPalette>) {
  for (const c of Object.keys(palettes) as Chassis[]) if (!protos.has(c)) protos.set(c, build(c, palettes[c]));
}
