import * as THREE from 'three';
import { VFXManager } from './VFX';
import { clamp01, rand } from '../core/MathUtil';
import { settings } from '../core/Settings';

/**
 * The readable layer: ground-plane telegraphs, tracers, beams, afterimages, decals.
 *
 * GDD §12 silhouette contract — all hostile threat reads on the ground plane as decals, so the
 * player can parse a five-way fight by looking at the floor. Particles live in VFXManager;
 * everything with a gameplay meaning lives here so it is never lost in a particle budget.
 */
export interface Telegraph {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  radius: number;
  grow: boolean;
  follow: THREE.Vector3 | null;
}

export class Effects {
  group = new THREE.Group();
  vfx = new VFXManager();
  private tracers: { m: THREE.Mesh; life: number; max: number }[] = [];
  private beams: { m: THREE.Mesh; life: number; max: number; w: number }[] = [];
  private ghosts: { m: THREE.Object3D; life: number; max: number; scale: number }[] = [];
  private telegraphs: Telegraph[] = [];
  private rings: { m: THREE.Mesh; life: number; max: number; from: number; to: number }[] = [];
  private trails: { m: THREE.Mesh; life: number; max: number }[] = [];
  private tracerGeo: THREE.CylinderGeometry;
  private ringGeo: THREE.RingGeometry;
  private discGeo: THREE.RingGeometry;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.group.add(this.vfx.group);
    this.tracerGeo = new THREE.CylinderGeometry(0.16, 0.16, 1, 5);
    this.tracerGeo.rotateX(Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 44);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.discGeo = new THREE.RingGeometry(0.0, 1, 44);
    this.discGeo.rotateX(-Math.PI / 2);
  }

  /** Ground telegraph. `grow` drives QUAKE, whose radius expands over the windup. */
  /** High-contrast mode replaces the archetype tint with one unmistakable ring colour. */
  static readonly HIGH_CONTRAST = 0xffffff;

  telegraph(pos: THREE.Vector3, radius: number, color: number, dur: number, grow = false, follow: THREE.Vector3 | null = null): Telegraph {
    const a = settings.assists;
    const tint = a.telegraphHighContrast ? Effects.HIGH_CONTRAST : color;
    const mat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.set(pos.x, 0.3, pos.z);
    m.scale.setScalar(radius);
    m.renderOrder = 6;
    const fill = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    fill.name = 'fill';
    m.add(fill);
    this.group.add(m);
    const t: Telegraph = { mesh: m, life: dur, max: dur, radius, grow, follow };
    this.telegraphs.push(t);
    return t;
  }

  killTelegraph(t: Telegraph | null) {
    if (!t) return;
    t.life = Math.min(t.life, 0.07);
    t.follow = null;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 1, life = 0.09) {
    const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const d = to.clone().sub(from);
    m.position.copy(from).addScaledVector(d, 0.5);
    m.lookAt(to);
    m.scale.set(width, width, Math.max(0.01, d.length()));
    this.group.add(m);
    this.tracers.push({ m, life, max: life });
  }

  beam(from: THREE.Vector3, to: THREE.Vector3, color: number, life = 0.24, w = 2.2) {
    const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    const d = to.clone().sub(from);
    m.position.copy(from).addScaledVector(d, 0.5);
    m.lookAt(to);
    m.scale.set(w, w, Math.max(0.01, d.length()));
    this.group.add(m);
    this.beams.push({ m, life, max: life, w });
  }

  /** Afterimage. The vanish reads as a teleport only because something is left behind. */
  ghost(source: THREE.Object3D, color: number, life = 0.42, grow = 0.5) {
    const c = source.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
    });
    this.group.add(c);
    this.ghosts.push({ m: c, life, max: life, scale: grow });
  }

  /** Expanding ground ring — impacts, stagger breaks, vanish origin. */
  ring(pos: THREE.Vector3, from: number, to: number, color: number, life = 0.5) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(pos.x, 0.35, pos.z);
    m.scale.setScalar(from);
    m.renderOrder = 7;
    this.group.add(m);
    this.rings.push({ m, life, max: life, from, to });
  }

  /** Persistent damaging geometry (boost trails, CONTRAIL). Visual half only. */
  trailQuad(a: THREE.Vector3, b: THREE.Vector3, width: number, color: number, life: number) {
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 0.01) return;
    const geo = new THREE.PlaneGeometry(width, len);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(a).addScaledVector(d, 0.5);
    m.position.y = 0.4;
    m.rotation.y = Math.atan2(d.x, d.z);
    this.group.add(m);
    this.trails.push({ m, life, max: life });
  }

  impact(pos: THREE.Vector3, color: number, size = 3, count = 8) {
    this.vfx.spawn({ pos, spread: 1, speed: 26 * size * 0.4, count, life: 0.36, size: size * 0.35, color, color2: 0xffffff, drag: 3.2, gravity: 26, stretch: 2.6, brightness: 2.4 });
  }

  update(dt: number) {
    this.vfx.update(dt);
    const cull = <E extends { life: number }>(arr: E[], obj: (e: E) => THREE.Object3D, step: (e: E) => void) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const e = arr[i];
        e.life -= dt;
        if (e.life <= 0) { const o = obj(e); this.group.remove(o); disposeTree(o); arr[i] = arr[arr.length - 1]; arr.pop(); }
        else step(e);
      }
    };
    cull(this.tracers, (e) => e.m, (e) => { mat(e.m).opacity = e.life / e.max; });
    cull(this.beams, (e) => e.m, (e) => { const k = e.life / e.max; mat(e.m).opacity = 0.9 * k; e.m.scale.x = e.m.scale.y = e.w * (0.4 + k * 0.9); });
    cull(this.ghosts, (e) => e.m, (e) => {
      const k = e.life / e.max;
      e.m.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.MeshBasicMaterial).opacity = 0.42 * k; });
      e.m.scale.multiplyScalar(1 + dt * e.scale);
    });
    cull(this.rings, (e) => e.m, (e) => { const k = 1 - e.life / e.max; e.m.scale.setScalar(e.from + (e.to - e.from) * k); mat(e.m).opacity = 0.9 * (1 - k); });
    cull(this.trails, (e) => e.m, (e) => { mat(e.m).opacity = 0.5 * clamp01(e.life / e.max); });
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.life -= dt;
      if (t.life <= 0) { this.group.remove(t.mesh); disposeTree(t.mesh); this.telegraphs.splice(i, 1); continue; }
      if (t.follow) t.mesh.position.set(t.follow.x, 0.3, t.follow.z);
      const k = 1 - t.life / t.max;
      const s = t.grow ? t.radius * (0.25 + 0.75 * k) : t.radius * (1.32 - k * 0.32);
      t.mesh.scale.setScalar(s);
      const m = mat(t.mesh);
      // telegraph intensity is independent of FX intensity: a player may turn the spectacle
      // down without turning the reads down, or the reads up without the spectacle
      const gain = settings.assists.telegraphIntensity * (settings.assists.telegraphHighContrast ? 1.25 : 1);
      m.opacity = (0.28 + k * 0.72) * gain;
      const fill = t.mesh.children[0] as THREE.Mesh | undefined;
      if (fill) (fill.material as THREE.MeshBasicMaterial).opacity = (0.04 + k * 0.18) * gain;
    }
  }

  /** Cosmetic jitter is allowed unseeded randomness (GDD §14). */
  jitter(scale = 1) { return rand(-scale, scale); }

  clear() {
    for (const a of [this.tracers, this.beams, this.rings, this.trails]) for (const e of a) { this.group.remove(e.m); disposeTree(e.m); }
    for (const g of this.ghosts) { this.group.remove(g.m); disposeTree(g.m); }
    for (const t of this.telegraphs) { this.group.remove(t.mesh); disposeTree(t.mesh); }
    this.tracers.length = 0; this.beams.length = 0; this.rings.length = 0; this.trails.length = 0; this.ghosts.length = 0; this.telegraphs.length = 0;
  }
}

const mat = (m: THREE.Mesh) => m.material as THREE.MeshBasicMaterial;
function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
    else m.material?.dispose();
  });
}
