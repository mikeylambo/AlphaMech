import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { concreteTex, metalPanelTex, rustTex, asphaltTex } from '../core/Textures';
import { Rng } from '../core/MathUtil';

/**
 * Procedural construction kit. No authored meshes anywhere in BLINKFALL (GDD §12) — every
 * structure is primitives, merged per material so a whole arena is a handful of draw calls.
 *
 * Cover is height-capped by the arena builder, not here: nothing may occlude the horizon during
 * a fight (the silhouette contract).
 */
export interface KitMaterials {
  concrete: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  rust: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  warn: THREE.MeshStandardMaterial;
}

let cached: KitMaterials | null = null;

export function kitMaterials(): KitMaterials {
  if (cached) return cached;
  const c = concreteTex(512), p = metalPanelTex(512), r = rustTex(512), a = asphaltTex(512);
  const std = (t: { map: THREE.Texture; rough: THREE.Texture }, color: number, rough: number, metal: number) =>
    new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.rough, color, roughness: rough, metalness: metal });
  cached = {
    concrete: std(c, 0x9a8f81, 0.95, 0.05),
    panel: std(p, 0x8e8377, 0.62, 0.55),
    rust: std(r, 0x8a6a4e, 0.88, 0.35),
    deck: std(a, 0x6c655e, 0.9, 0.1),
    dark: new THREE.MeshStandardMaterial({ color: 0x27231f, roughness: 0.85, metalness: 0.35 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x120a04, emissive: 0xff7a2a, emissiveIntensity: 2.6, roughness: 0.4 }),
    warn: new THREE.MeshStandardMaterial({ color: 0xd8a032, roughness: 0.65, metalness: 0.2 }),
  };
  return cached;
}

/** Box geometry with world-scale UVs so tiling textures do not stretch across large plates. */
export function boxGeo(w: number, h: number, d: number, tile = 8): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = sizes[f];
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * (su / tile), uv.getY(i) * (sv / tile));
  }
  uv.needsUpdate = true;
  return g;
}

export function cylGeo(rt: number, rb: number, h: number, seg = 14, tile = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((Math.PI * 2 * rt) / tile), uv.getY(i) * (h / tile));
  uv.needsUpdate = true;
  return g;
}

const tf = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };

/** A merged batch: geometry accumulates per material, then bakes into one mesh each. */
export class Batch {
  private byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, m: THREE.Material) {
    let a = this.byMat.get(m);
    if (!a) { a = []; this.byMat.set(m, a); }
    a.push(g);
    return this;
  }
  bake(target: THREE.Object3D, castShadow = true) {
    for (const [m, geos] of this.byMat) {
      const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      target.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.byMat.clear();
    return target;
  }
}

/** A cover block. `top` is the walkable world height of its roof. */
export interface Cover { x: number; z: number; r: number; h: number; top: number }

/**
 * Low blocks and bunkers. `maxHeight` is enforced by the caller so the horizon stays clear.
 * Returns collidable cylinders — cheap, forgiving to skate around, and enough to break line of
 * sight without ever hiding a ground telegraph.
 */
export function scatterCover(batch: Batch, m: KitMaterials, rng: Rng, opts: {
  count: number; inner: number; outer: number; maxHeight: number; centerX?: number; centerZ?: number; lateral?: number;
  /** Floor height under a point. Volumes that ramp must pass this or their cover floats. */
  floorAt?: (x: number, z: number) => number;
}): Cover[] {
  const out: Cover[] = [];
  const cx = opts.centerX ?? 0, cz = opts.centerZ ?? 0;
  for (let i = 0; i < opts.count; i++) {
    let x: number, z: number;
    if (opts.lateral !== undefined) {
      x = cx + rng.range(-opts.lateral, opts.lateral);
      z = cz + rng.range(opts.inner, opts.outer);
    } else {
      const a = (i / opts.count) * Math.PI * 2 + rng.range(-0.28, 0.28);
      const d = rng.range(opts.inner, opts.outer);
      x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d;
    }
    const w = rng.range(11, 30), dp = rng.range(11, 30);
    const h = rng.range(opts.maxHeight * 0.45, opts.maxHeight);
    const ry = rng.range(0, Math.PI);
    const mat = rng.chance(0.55) ? m.concrete : m.panel;
    const base = opts.floorAt ? opts.floorAt(x, z) : 0;
    batch.add(tf(boxGeo(w, h, dp, 9), x, base + h / 2, z, ry), mat);
    // capping band + a warm strip so the block reads as machinery, not a grey crate
    batch.add(tf(boxGeo(w * 1.06, 0.7, dp * 1.06, 9), x, base + h + 0.1, z, ry), m.dark);
    if (rng.chance(0.45)) batch.add(tf(boxGeo(w * 0.5, 0.35, 0.4, 4), x, base + h * 0.55, z + dp / 2 + 0.2, ry), m.glow);
    out.push({ x, z, r: Math.max(w, dp) * 0.55, h, top: base + h });
  }
  return out;
}

/** Tall silhouettes outside the play space: speed reference and parallax, never cover. */
export function skylinePillars(batch: Batch, m: KitMaterials, rng: Rng, opts: { count: number; inner: number; outer: number; centerX?: number; centerZ?: number; baseY?: number }) {
  // never casts shadows: the skyline sits outside the shadow frustum and outside the fight
  const cx = opts.centerX ?? 0, cz = opts.centerZ ?? 0, by = opts.baseY ?? 0;
  for (let i = 0; i < opts.count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(opts.inner, opts.outer);
    const h = rng.range(110, 420);
    const w = rng.range(20, 62);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    batch.add(tf(boxGeo(w, h, w * rng.range(0.6, 1.4), 14), x, by + h / 2 - 30, z, rng.range(0, 3)), rng.chance(0.5) ? m.concrete : m.panel);
    if (rng.chance(0.5)) batch.add(tf(boxGeo(w * 0.2, h * 0.02, 0.6, 4), x, by + h * rng.range(0.35, 0.9), z + w / 2, 0), m.glow);
  }
}

/** Gantries, pipes and buttresses that frame a corridor without narrowing the flight path. */
export function corridorDressing(batch: Batch, m: KitMaterials, rng: Rng, opts: { z0: number; z1: number; halfWidth: number; floorAt: (x: number, z: number) => number }) {
  const span = opts.z1 - opts.z0;
  const bays = Math.max(3, Math.round(span / 190));
  for (let i = 0; i <= bays; i++) {
    const z = opts.z0 + (i / bays) * span;
    const hw = opts.halfWidth;
    const h = rng.range(64, 118);
    const y = opts.floorAt(0, z);
    for (const s of [-1, 1]) {
      batch.add(tf(boxGeo(16, h, 22, 12), s * (hw + 10), y + h / 2, z), m.concrete);
      batch.add(tf(boxGeo(20, 5, 26, 8), s * (hw + 10), y + h, z), m.dark);
      batch.add(tf(boxGeo(3, 1.4, 24, 4), s * (hw + 2), y + 6, z), m.warn);
    }
    if (i % 2 === 0) {
      // overhead gantry, kept high so it never blocks the horizon at eye level
      batch.add(tf(boxGeo(hw * 2 + 30, 5, 9, 14), 0, y + h + 8, z), m.rust);
      batch.add(tf(boxGeo(hw * 2 + 24, 0.7, 1.4, 6), 0, y + h + 5.2, z), m.glow);
    }
    if (rng.chance(0.6)) {
      const px = rng.sign() * rng.range(hw * 0.45, hw * 0.92);
      const ph = rng.range(20, 46);
      const pz = z + rng.range(-40, 40);
      batch.add(tf(cylGeo(3.4, 3.9, ph, 12, 9), px, opts.floorAt(px, pz) + ph / 2, pz), m.rust);
    }
  }
}
