import * as THREE from 'three';
import { Effects } from '../fx/Effects';
import { Vitals } from '../frame/Vitals';

/**
 * CONVOY INTERCEPTION's targets: frames that do not fight back and do not wait.
 *
 * A transport is a Vitals with a heading. It exists to make "destroy-targets" a real objective
 * rather than a relabelled clear — the pressure comes from the clock and from the escorts, and
 * the transport itself is only a deadline with a hull.
 */
export interface Transport {
  pos: THREE.Vector3;
  vitals: Vitals;
  speed: number;
  exitZ: number;
  escaped: boolean;
  mesh: THREE.Group;
}

export class Transports {
  list: Transport[] = [];
  group = new THREE.Group();
  escaped = 0;
  destroyed = 0;

  constructor(scene: THREE.Scene, private fx: Effects) { scene.add(this.group); }

  clear() {
    for (const t of this.list) this.group.remove(t.mesh);
    this.list = [];
    this.escaped = 0;
    this.destroyed = 0;
  }

  spawn(pos: THREE.Vector3, exitZ: number, speed = 46) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 20), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.7, metalness: 0.5 }));
    const fin = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8, metalness: 0.4 }));
    fin.position.set(0, 3.4, -5);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(6, 0.9, 0.6), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0, -10.4);
    g.add(hull, fin, glow);
    g.position.copy(pos);
    this.group.add(g);
    this.list.push({ pos: pos.clone(), vitals: new Vitals(2600, 600, 2.0), speed, exitZ, escaped: false, mesh: g });
  }

  update(dt: number, groundAt: (x: number, z: number) => number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.pos.z += t.speed * dt;
      t.pos.y = groundAt(t.pos.x, t.pos.z) + 24 + Math.sin(t.pos.z * 0.02) * 3;
      t.mesh.position.copy(t.pos);
      if (!t.vitals.alive) {
        this.fx.vfx.explosion(t.pos.clone(), 1.8);
        this.fx.ring(t.pos, 3, 40, 0xffd24a, 0.6);
        this.group.remove(t.mesh);
        this.list.splice(i, 1);
        this.destroyed++;
      } else if (t.pos.z >= t.exitZ) {
        this.group.remove(t.mesh);
        this.list.splice(i, 1);
        this.escaped++;
      }
    }
  }

  /** Nearest live transport to a point, for auto-target and HUD. */
  nearest(p: THREE.Vector3): Transport | null {
    let best: Transport | null = null, bd = Infinity;
    for (const t of this.list) { const d = t.pos.distanceTo(p); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  get remaining() { return this.list.length; }
}
