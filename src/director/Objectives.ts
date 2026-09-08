import * as THREE from 'three';
import { Vitals } from '../frame/Vitals';
import { Hostile } from '../frame/Types';
import { Effects } from '../fx/Effects';

/**
 * ============================================================================================
 * OBJECTIVE — the seventh encounter state  (RC brief §2.6, GDD §3)
 *
 * "defend / intercept / destroy under interference · ROTATION · STAGGER"
 *
 * The state exists to ask a different question from ARENA with the same systems: ARENA asks
 * "can you keep them in front of you", OBJECTIVE asks "can you keep them in front of you while
 * the thing you must protect is behind you". That is the same skill under a positional
 * constraint you did not choose, which is why its primary stress is still ROTATION.
 *
 * Two of the four configurations need a thing in the world to protect: DEFEND (a static
 * emplacement) and ESCORT (a moving one). One class serves both — an escort is a defend point
 * with a velocity, and pretending otherwise would be two systems for one idea.
 *
 * The Director Law still holds here in full. A hostile damaging the point does so with its
 * ORDINARY attacks under the ORDINARY token budget; nothing about an objective grants aggression
 * the encirclement arc did not pay for. What the point adds is a place you cannot abandon.
 * ============================================================================================
 */

/** Metres of hostile proximity within which the point takes attrition. */
const THREAT_RADIUS = 46;
/** Structure per second per hostile inside the threat radius. */
const ATTRITION = 34;

export type ObjectiveKind = 'defend' | 'escort';

export class ObjectivePoint {
  vitals: Vitals;
  pos = new THREE.Vector3();
  group = new THREE.Group();
  /** ESCORT only: where it is going, and how fast. */
  private route: { to: THREE.Vector3; speed: number } | null = null;
  private ring: THREE.Mesh;
  private core: THREE.Mesh;
  private pulse = 0;
  /** Hostiles that were inside the threat radius on the last tick — surfaced on the HUD. */
  threats = 0;
  arrived = false;

  constructor(scene: THREE.Scene, public kind: ObjectiveKind, at: THREE.Vector3, structure: number) {
    this.vitals = new Vitals(structure, structure, 0);
    this.pos.copy(at);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 9.5, 16, 10),
      new THREE.MeshStandardMaterial({ color: 0x2e3840, roughness: 0.55, metalness: 0.7 }),
    );
    body.position.y = 8;
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.2, 0),
      new THREE.MeshBasicMaterial({ color: 0x8ff4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.core.position.y = 20;
    // the threat radius is drawn on the ground plane, because everything that matters is
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(THREAT_RADIUS - 1.6, THREAT_RADIUS, 56).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8ff4ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring.position.y = 0.5;
    this.group.add(body, this.core, this.ring);
    this.group.position.copy(at);
    scene.add(this.group);
  }

  /** ESCORT: give the point somewhere to be. It dictates your position by going there. */
  setRoute(to: THREE.Vector3, speed: number) { this.route = { to: to.clone(), speed }; }

  get alive() { return this.vitals.alive; }
  get structure01() { return this.vitals.structure01; }

  update(dt: number, time: number, hostiles: Hostile[], fx: Effects, groundAt: (x: number, z: number) => number) {
    if (!this.alive) return;

    if (this.route) {
      const to = this.route.to.clone().sub(this.pos);
      to.y = 0;
      const d = to.length();
      if (d < 12) this.arrived = true;
      else this.pos.addScaledVector(to.divideScalar(d), this.route.speed * dt);
      this.pos.y = groundAt(this.pos.x, this.pos.z);
    }

    // Attrition, not an attack. The point is not a combatant and never takes a token: it simply
    // degrades while hostiles are standing on it, which is what makes leaving it a real cost.
    let n = 0;
    for (const h of hostiles) {
      if (!h.alive) continue;
      if (h.pos.distanceTo(this.pos) < THREAT_RADIUS) n++;
    }
    this.threats = n;
    if (n > 0) {
      this.vitals.structure = Math.max(0, this.vitals.structure - ATTRITION * n * dt);
      if (Math.floor(time * 3) !== Math.floor((time - dt) * 3)) {
        fx.ring(this.pos, THREAT_RADIUS * 0.5, THREAT_RADIUS, 0xff5a5a, 0.3);
      }
    }

    this.pulse += dt * (n > 0 ? 9 : 2.2);
    this.group.position.copy(this.pos);
    this.core.rotation.set(this.pulse * 0.5, this.pulse * 0.8, 0);
    this.core.scale.setScalar(1 + Math.sin(this.pulse) * 0.12);
    const mat = this.ring.material as THREE.MeshBasicMaterial;
    mat.color.setHex(n > 0 ? 0xff5a5a : 0x8ff4ff);
    mat.opacity = 0.16 + (n > 0 ? 0.26 : 0.08) * (0.5 + 0.5 * Math.sin(this.pulse));
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(this.structure01 > 0.35 ? 0x8ff4ff : 0xff5a5a);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    });
  }

  snapshot() {
    return {
      kind: this.kind,
      structure: Math.round(this.vitals.structure),
      structureMax: this.vitals.structureMax,
      threats: this.threats,
      arrived: this.arrived,
      position: [+this.pos.x.toFixed(1), +this.pos.y.toFixed(1), +this.pos.z.toFixed(1)],
    };
  }
}

/** Structure an objective point carries. One value, so both configurations read the same. */
export const OBJECTIVE_STRUCTURE = 6000;
/** How fast an ESCORT asset travels. Slow enough to fight around, fast enough to chase. */
export const ESCORT_SPEED = 21;
