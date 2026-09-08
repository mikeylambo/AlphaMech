import * as THREE from 'three';
import { RNG } from '../core/RNG';
import { clamp01 } from '../core/MathUtil';
import { Effects } from '../fx/Effects';
import { GeometryMode, VariantSpec } from './Variants';

/**
 * Runtime encounter geometry.
 *
 * A variant's geometry mode is applied as a FIELD layer over the sector rather than baked into
 * its generation, so the same arena can host four different configurations without four
 * different builds — and so a field can be raised and torn down at encounter boundaries without
 * touching the sector lifecycle.
 *
 * Every field reads on the ground plane, per the silhouette contract: a hazard the player
 * cannot see coming from the floor is not a hazard, it is a cheap hit.
 */
/** Minimum seconds between two hits from the same hazard. */
const HAZARD_CD = 1.1;

export interface FieldTarget {
  pos: THREE.Vector3;
  receiveHit(damage: number, impact: number, from: null, attack: string): void;
  addEnergy(amount: number): void;
  altitude: number;
}

interface Emitter { pos: THREE.Vector3; radius: number; period: number; phase: number; armed: boolean; mesh: THREE.Mesh }
interface Rotor { pos: THREE.Vector3; radius: number; period: number; phase: number; group: THREE.Group; cd: number }
interface Drain { pos: THREE.Vector3; radius: number; rate: number; mesh: THREE.Mesh }
interface VoidSector { a0: number; a1: number; period: number; phase: number; mesh: THREE.Mesh; cd: number }

export class EncounterFields {
  group = new THREE.Group();
  mode: GeometryMode = 'baseline';
  /** Centre of the volume the field is applied to. */
  centre = new THREE.Vector3();
  radius = 330;

  private emitters: Emitter[] = [];
  private rotors: Rotor[] = [];
  private drains: Drain[] = [];
  private voids: VoidSector[] = [];
  private shrink = { active: false, from: 330, to: 150, t: 0, duration: 95 };
  private wake = { active: false, z: 0, speed: 34, radius: 46, mesh: null as THREE.Mesh | null, cd: 0 };
  private ring: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, private fx: Effects) {
    scene.add(this.group);
  }

  /** Current usable radius. The shrinking arena is the only mode that narrows the volume. */
  get confineRadius(): number {
    if (!this.shrink.active) return Infinity;
    const k = clamp01(this.shrink.t / this.shrink.duration);
    return this.shrink.from + (this.shrink.to - this.shrink.from) * k;
  }

  clear() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.group.clear();
    this.emitters = []; this.rotors = []; this.drains = []; this.voids = [];
    this.shrink.active = false;
    this.wake.active = false;
    this.wake.mesh = null;
    this.ring = null;
    this.mode = 'baseline';
  }

  /** Raise the field for an encounter. `pressure` is the FALL tier's geometryPressure. */
  raise(v: VariantSpec, centre: THREE.Vector3, radius: number, pressure: number, groundAt: (x: number, z: number) => number) {
    this.clear();
    this.mode = v.geometry;
    this.centre.copy(centre);
    this.radius = radius;
    const scale = (v.geometryScale ?? 1) * pressure;
    const rng = RNG.stream('layout');

    switch (v.geometry) {
      case 'shrinking': {
        this.shrink.active = true;
        this.shrink.from = radius;
        this.shrink.to = Math.max(90, radius * (0.42 / Math.max(0.6, scale)));
        this.shrink.duration = Math.max(45, 110 / Math.max(0.6, scale));
        this.shrink.t = 0;
        const g = new THREE.TorusGeometry(1, 0.9, 6, 96).rotateX(Math.PI / 2);
        this.ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.ring.position.set(centre.x, centre.y + 1.2, centre.z);
        this.group.add(this.ring);
        break;
      }
      case 'hazard-grid': {
        const n = Math.round(7 * scale);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
          const d = rng.range(radius * 0.2, radius * 0.82);
          const p = new THREE.Vector3(centre.x + Math.cos(a) * d, 0, centre.z + Math.sin(a) * d);
          p.y = groundAt(p.x, p.z);
          this.emitters.push(this.makeEmitter(p, rng.range(34, 56), rng.range(2.4, 3.6) / Math.max(0.7, scale), rng.range(0, 1)));
        }
        break;
      }
      case 'dropping-floor': {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = a0 + (Math.PI * 2) / n;
          this.voids.push(this.makeVoid(centre, radius, a0, a1, 9 / Math.max(0.7, scale), i / n));
        }
        break;
      }
      case 'en-drain': {
        const n = Math.round(5 * scale);
        for (let i = 0; i < n; i++) {
          const p = new THREE.Vector3(centre.x + rng.range(-radius * 0.7, radius * 0.7), 0, centre.z + rng.range(-radius * 0.8, radius * 0.8));
          p.y = groundAt(p.x, p.z);
          this.drains.push(this.makeDrain(p, rng.range(38, 62), 26 * scale));
        }
        break;
      }
      case 'rotating-hazards': {
        const n = Math.round(4 * scale);
        for (let i = 0; i < n; i++) {
          const p = new THREE.Vector3(centre.x + rng.range(-radius * 0.4, radius * 0.4), 0, centre.z + rng.range(-radius * 0.75, radius * 0.75));
          p.y = groundAt(p.x, p.z);
          this.rotors.push(this.makeRotor(p, radius * rng.range(0.4, 0.62), rng.range(3.2, 4.8) / Math.max(0.7, scale), rng.range(0, 1)));
        }
        break;
      }
      case 'wake': {
        this.wake.active = true;
        this.wake.z = centre.z - radius;
        this.wake.speed = 30 * scale;
        this.wake.radius = 52;
        const g = new THREE.BoxGeometry(200, 26, 22);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.group.add(m);
        this.wake.mesh = m;
        break;
      }
      default: break;
    }
  }

  private makeEmitter(pos: THREE.Vector3, radius: number, period: number, phase: number): Emitter {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.86, radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.position.copy(pos).setY(pos.y + 0.4);
    this.group.add(mesh);
    return { pos: pos.clone(), radius, period, phase, armed: true, mesh };
  }

  private makeVoid(centre: THREE.Vector3, radius: number, a0: number, a1: number, period: number, phase: number): VoidSector {
    const shape = new THREE.RingGeometry(20, radius * 0.94, 26, 1, a0, a1 - a0).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(shape, new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(centre.x, centre.y + 0.5, centre.z);
    this.group.add(mesh);
    return { a0, a1, period, phase, mesh, cd: 0 };
  }

  private makeDrain(pos: THREE.Vector3, radius: number, rate: number): Drain {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.position.copy(pos).setY(pos.y + 0.35);
    this.group.add(mesh);
    return { pos: pos.clone(), radius, rate, mesh };
  }

  private makeRotor(pos: THREE.Vector3, radius: number, period: number, phase: number): Rotor {
    const g = new THREE.Group();
    g.position.copy(pos);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 2, 1.5, 3.0),
      new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    arm.position.y = 7;
    arm.name = 'arm';
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, 15, 12), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.7 }));
    hub.position.y = 7.5;
    g.add(hub, arm);
    this.group.add(g);
    return { pos: pos.clone(), radius, period, phase, group: g, cd: 0 };
  }

  update(dt: number, time: number, target: FieldTarget) {
    if (this.shrink.active) {
      this.shrink.t += dt;
      const r = this.confineRadius;
      if (this.ring) { this.ring.scale.set(r, 1, r); (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(time * 3); }
    }

    for (const e of this.emitters) {
      const phase = (time / e.period + e.phase) % 1;
      const mat = e.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.14 + phase * 0.6;
      e.mesh.scale.setScalar(0.35 + phase * 0.7);
      if (phase > 0.93 && e.armed) {
        e.armed = false;
        const d = target.pos.clone().sub(e.pos);
        if (Math.hypot(d.x, d.z) < e.radius && target.altitude < 26) {
          target.receiveHit(240, 120, null, 'grid');
          this.fx.ring(e.pos, e.radius * 0.4, e.radius, 0xff7a3a, 0.35);
        }
      }
      if (phase < 0.5) e.armed = true;
    }

    // Environmental damage is an EVENT, not a per-frame drain: a hazard that ticks every frame
    // deletes 9,000 structure in four seconds and teaches nothing. Each one re-arms on a cadence.
    for (const r of this.rotors) {
      r.cd = Math.max(0, r.cd - dt);
      const a = (time / r.period + r.phase) * Math.PI * 2;
      const arm = r.group.getObjectByName('arm');
      if (arm) arm.rotation.y = a;
      const d = target.pos.clone().sub(r.pos);
      if (r.cd <= 0 && Math.hypot(d.x, d.z) < r.radius && target.pos.y < r.pos.y + 14 && target.pos.y > r.pos.y - 6) {
        const ang = Math.atan2(d.x, d.z);
        let diff = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        diff = Math.min(diff, Math.abs(diff - Math.PI));
        if (diff < 0.15) { target.receiveHit(240, 120, null, 'sweeper'); r.cd = HAZARD_CD; }
      }
    }

    for (const dr of this.drains) {
      const d = target.pos.clone().sub(dr.pos);
      const inside = Math.hypot(d.x, d.z) < dr.radius && target.altitude < 34;
      (dr.mesh.material as THREE.MeshBasicMaterial).opacity = inside ? 0.3 : 0.14;
      if (inside) target.addEnergy(-dr.rate * dt);
    }

    for (const v of this.voids) {
      const phase = (time / v.period + v.phase) % 1;
      const open = phase > 0.55;             // the sector has fallen away
      const warning = phase > 0.4 && !open;
      const mat = v.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = open ? 0.42 : warning ? 0.12 + (phase - 0.4) * 2 : 0.03;
      v.cd = Math.max(0, v.cd - dt);
      if (open && v.cd <= 0) {
        const d = target.pos.clone().sub(this.centre);
        let ang = Math.atan2(d.z, d.x);
        if (ang < 0) ang += Math.PI * 2;
        const inSector = ang >= v.a0 % (Math.PI * 2) && ang < v.a1 % (Math.PI * 2) + (v.a1 > Math.PI * 2 ? Math.PI * 2 : 0);
        if (inSector && Math.hypot(d.x, d.z) < this.radius && target.altitude < 6) { target.receiveHit(180, 90, null, 'collapse'); v.cd = HAZARD_CD; }
      }
    }

    if (this.wake.active && this.wake.mesh) {
      this.wake.z += this.wake.speed * dt;
      const y = this.centre.y + 12;
      this.wake.mesh.position.set(this.centre.x, y, this.wake.z);
      this.wake.cd = Math.max(0, this.wake.cd - dt);
      const dz = Math.abs(target.pos.z - this.wake.z);
      if (this.wake.cd <= 0 && dz < this.wake.radius * 0.35 && target.altitude < 30) { target.receiveHit(210, 110, null, 'wake'); this.wake.cd = HAZARD_CD; }
      if (this.wake.z > this.centre.z + this.radius * 1.6) this.wake.z = this.centre.z - this.radius * 1.4;
    }
  }

  snapshot() {
    return {
      mode: this.mode,
      confineRadius: this.confineRadius === Infinity ? null : Math.round(this.confineRadius),
      emitters: this.emitters.length,
      rotors: this.rotors.length,
      drains: this.drains.length,
      voids: this.voids.length,
      wake: this.wake.active,
    };
  }
}
