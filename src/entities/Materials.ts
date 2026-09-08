import * as THREE from 'three';

/** Shared PBR material set for mechs. Roughness variation and emissives give material variety. */
export interface MechPalette { armor: number; armor2: number; dark: number; metal: number; joint: number; accent: number; glow: number; }

export const PLAYER_PALETTE: MechPalette = { armor: 0xd6d3c6, armor2: 0x2d3238, dark: 0x1a1d21, metal: 0x6a6f75, joint: 0x2a2a2c, accent: 0xd88a2c, glow: 0x4fd0ff };
export const ENEMY_PALETTE: MechPalette = { armor: 0x5f6a63, armor2: 0x2a2e2b, dark: 0x1b1d1c, metal: 0x777a78, joint: 0x262624, accent: 0xb33a2e, glow: 0xff7a3a };
export const HEAVY_PALETTE: MechPalette = { armor: 0x4d4a44, armor2: 0x2b2926, dark: 0x1a1918, metal: 0x807a70, joint: 0x262422, accent: 0xc7a23a, glow: 0xffb04a };
export const DRONE_PALETTE: MechPalette = { armor: 0x8a8f96, armor2: 0x3a3e44, dark: 0x1c1e22, metal: 0x9a9ea3, joint: 0x2a2c30, accent: 0xd8462e, glow: 0xff5e3a };
export const SNIPER_PALETTE: MechPalette = { armor: 0x2f3a46, armor2: 0x1e252c, dark: 0x15191d, metal: 0x6f7a86, joint: 0x22262a, accent: 0x3ec8ff, glow: 0x5ad8ff };
export const BRAWLER_PALETTE: MechPalette = { armor: 0x7a2e2a, armor2: 0x3a1f1c, dark: 0x1c1514, metal: 0x8a7f78, joint: 0x2a2220, accent: 0xffc247, glow: 0xff9a3a };
export const BOSS_PALETTE: MechPalette = { armor: 0x3c4148, armor2: 0x22262b, dark: 0x15171a, metal: 0x707880, joint: 0x2a2d31, accent: 0xc44a2a, glow: 0xff6a2a };

export interface MechMats {
  armor: THREE.MeshStandardMaterial; armor2: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial; joint: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial; sensor: THREE.MeshStandardMaterial; exhaust: THREE.MeshStandardMaterial; nozzle: THREE.MeshStandardMaterial;
  /**
   * Bake target for every non-emissive plate. A mech is ~700 primitives across seven opaque
   * materials; merging them per material costs ~120 draws each, which a five-hostile ARENA
   * cannot afford. Baking the plate colours into vertex colours collapses that to one draw per
   * bone, at the cost of a single shared roughness/metalness pair.
   */
  solid: THREE.MeshStandardMaterial;
}
export function makeMechMats(p: MechPalette): MechMats {
  const std = (color: number, rough: number, metal: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  return {
    armor: std(p.armor, 0.48, 0.55),
    armor2: std(p.armor2, 0.42, 0.7),
    dark: std(p.dark, 0.7, 0.4),
    metal: std(p.metal, 0.32, 0.9),
    joint: std(p.joint, 0.85, 0.2),
    accent: std(p.accent, 0.5, 0.5),
    glow: std(0x000000, 0.4, 0.2, { emissive: p.glow, emissiveIntensity: 3.2 }),
    sensor: std(0x111111, 0.15, 0.1, { emissive: p.accent, emissiveIntensity: 2.4 }),
    exhaust: std(0x151515, 0.9, 0.6),
    nozzle: std(0x1a0a05, 0.6, 0.3, { emissive: p.glow, emissiveIntensity: 0.55 }),
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.62 }),
  };
}
