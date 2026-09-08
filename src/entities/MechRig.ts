import * as THREE from 'three';
import { MechMats, MechPalette, makeMechMats } from './Materials';
import { clamp, damp } from '../core/MathUtil';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural articulated mech. All pieces are built from primitives with bevels/chamfers so silhouettes
 * read as layered armor rather than plain boxes. The rig exposes named pivots which the animation
 * layer (MechAnimator) drives: torso aim, head, shoulders, arms, legs, ankles, thrusters, recoil, suspension.
 */
export interface RigPose {
  lean: THREE.Vector3;         // local-space lean (x = side, z = forward), radians
  aimYaw: number; aimPitch: number;
  legPhase: number;            // 0..1 skating stride
  airborne: number;            // 0..1 blend to tucked legs
  crouch: number;              // 0..1 landing compression
  thrust: number;              // 0..1 rear thruster output
  thrustUp: number;            // 0..1 vertical thrusters
  qb: THREE.Vector3;           // side thruster direction (local), magnitude 0..1
  recoilR: number; recoilL: number; cannonRecoil: number;
  bladeSwing: number;          // 0..1 melee arc progress (-1 = inactive)
  speed01: number;
  stagger: number;             // 0..1
}
export const newPose = (): RigPose => ({ lean: new THREE.Vector3(), aimYaw: 0, aimPitch: 0, legPhase: 0, airborne: 0, crouch: 0, thrust: 0, thrustUp: 0, qb: new THREE.Vector3(), recoilR: 0, recoilL: 0, cannonRecoil: 0, bladeSwing: -1, speed01: 0, stagger: 0 });

export function box(w: number, h: number, d: number, m: THREE.Material, bevel = 0.06): THREE.Mesh {
  // chamfered box via BoxGeometry with slight scale-in and an extra outline mesh is expensive; use ExtrudeGeometry chamfer for larger plates
  let g: THREE.BufferGeometry;
  if (bevel > 0 && Math.min(w, h, d) > bevel * 4) {
    const shape = new THREE.Shape();
    const hw = w / 2, hh = h / 2, b = Math.min(bevel, hw * 0.4, hh * 0.4);
    shape.moveTo(-hw + b, -hh); shape.lineTo(hw - b, -hh); shape.lineTo(hw, -hh + b); shape.lineTo(hw, hh - b);
    shape.lineTo(hw - b, hh); shape.lineTo(-hw + b, hh); shape.lineTo(-hw, hh - b); shape.lineTo(-hw, -hh + b); shape.closePath();
    g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, steps: 1 });
    g.translate(0, 0, -d / 2);
  } else g = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
export function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; }
export function grp(x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }

export interface ThrusterNode { obj: THREE.Object3D; kind: 'rear' | 'leg' | 'side' | 'up'; dir: THREE.Vector3; scale: number }

export class MechRig {
  root = new THREE.Group();
  pelvis = grp(); torso = grp(); head = grp();
  shoulderL = grp(); shoulderR = grp();
  armL = grp(); armR = grp(); forearmL = grp(); forearmR = grp();
  weaponR = grp(); weaponL = grp(); shoulderWeaponL = grp(); shoulderWeaponR = grp();
  hipL = grp(); hipR = grp(); kneeL = grp(); kneeR = grp(); footL = grp(); footR = grp();
  rearThrusters = grp(); sideThrusterL = grp(); sideThrusterR = grp();
  thrusters: ThrusterNode[] = [];
  bladeTip = grp(); bladeBase = grp();
  muzzleR = grp(); muzzleCannon = grp(); missileBays: THREE.Object3D[] = [];
  /** Height of the pelvis above ground when standing. */
  hipHeight = 5.4;
  height = 10;
  meshes: THREE.Mesh[] = [];
  private suspension = 0; private legPhase = 0; private torsoYaw = 0; private torsoPitch = 0;
  private headYaw = 0; private headPitch = 0; private leanX = 0; private leanZ = 0;
  private tuck = 0; private stride = 0; private cannonKick = 0; private idleT = 0; private idle = 0;

  constructor(public mats: MechMats, public scale = 1) {
    this.root.add(this.pelvis);
    this.pelvis.add(this.torso); this.torso.add(this.head);
    this.torso.add(this.shoulderL, this.shoulderR, this.rearThrusters);
    this.shoulderL.add(this.armL, this.shoulderWeaponL); this.shoulderR.add(this.armR, this.shoulderWeaponR);
    this.armL.add(this.forearmL); this.armR.add(this.forearmR);
    this.forearmL.add(this.weaponL); this.forearmR.add(this.weaponR);
    this.pelvis.add(this.hipL, this.hipR, this.sideThrusterL, this.sideThrusterR);
    this.hipL.add(this.kneeL); this.hipR.add(this.kneeR); this.kneeL.add(this.footL); this.kneeR.add(this.footR);
    this.root.scale.setScalar(scale);
  }

  register(mesh: THREE.Mesh) { this.meshes.push(mesh); return mesh; }

  /**
   * Instance a rig from an already-built prototype.
   *
   * Building a mech from primitives and merging it costs a few milliseconds; doing that five
   * times the instant an ARENA opens is a visible hitch at exactly the wrong moment. Cloning a
   * baked prototype shares every geometry, so a spawn costs a tree copy instead.
   *
   * Materials are NOT shared: hostiles flare their emissives when Exposed, and a shared
   * material would flare the whole archetype at once.
   */
  static cloneFrom(src: MechRig, palette: MechPalette): MechRig {
    const mats = makeMechMats(palette);
    const r = new MechRig(mats, src.scale);
    r.hipHeight = src.hipHeight;
    r.height = src.height;

    const bonePairs: [THREE.Group, THREE.Group][] = [
      [src.pelvis, r.pelvis], [src.torso, r.torso], [src.head, r.head],
      [src.shoulderL, r.shoulderL], [src.shoulderR, r.shoulderR],
      [src.armL, r.armL], [src.armR, r.armR], [src.forearmL, r.forearmL], [src.forearmR, r.forearmR],
      [src.weaponL, r.weaponL], [src.weaponR, r.weaponR],
      [src.shoulderWeaponL, r.shoulderWeaponL], [src.shoulderWeaponR, r.shoulderWeaponR],
      [src.hipL, r.hipL], [src.hipR, r.hipR], [src.kneeL, r.kneeL], [src.kneeR, r.kneeR],
      [src.footL, r.footL], [src.footR, r.footR],
      [src.rearThrusters, r.rearThrusters], [src.sideThrusterL, r.sideThrusterL], [src.sideThrusterR, r.sideThrusterR],
    ];
    const map = new Map<THREE.Object3D, THREE.Object3D>();
    for (const [a, b] of bonePairs) { b.position.copy(a.position); b.rotation.copy(a.rotation); b.scale.copy(a.scale); map.set(a, b); }

    const matMap = new Map<THREE.Material, THREE.Material>();
    const keys = Object.keys(src.mats) as (keyof MechMats)[];
    for (const k of keys) matMap.set(src.mats[k], mats[k]);
    const remap = (o: THREE.Object3D) => o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const replacement = matMap.get(m.material as THREE.Material);
      if (replacement) m.material = replacement;
      // per-instance blade glow: opacity is animated independently on every machine
      else if (m.name === 'blade' || m.name === 'bladeCore') m.material = (m.material as THREE.Material).clone();
    });

    const adopt = (from: THREE.Object3D, to: THREE.Object3D) => {
      for (const child of from.children) {
        if (map.has(child)) continue;
        const c = child.clone(true);
        remap(c);
        to.add(c);
        map.set(child, c);
      }
    };
    for (const [a, b] of bonePairs) adopt(a, b);
    for (const child of src.root.children) {
      if (child === src.pelvis) continue;
      const c = child.clone(true);
      remap(c);
      r.root.add(c);
      map.set(child, c);
      if (child === (src.lodMesh as unknown as THREE.Object3D)) r.lodMesh = c as THREE.Mesh;
    }

    r.bladeBase = (map.get(src.bladeBase) as THREE.Group) ?? r.bladeBase;
    r.bladeTip = (map.get(src.bladeTip) as THREE.Group) ?? r.bladeTip;
    r.muzzleR = (map.get(src.muzzleR) as THREE.Group) ?? r.muzzleR;
    r.muzzleCannon = (map.get(src.muzzleCannon) as THREE.Group) ?? r.muzzleCannon;
    r.missileBays = src.missileBays.map((b) => map.get(b) ?? b);
    r.thrusters = src.thrusters.map((t) => ({ obj: map.get(t.obj) ?? t.obj, kind: t.kind, dir: t.dir.clone(), scale: t.scale }));
    r.meshes = [];
    r.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) r.meshes.push(o as THREE.Mesh); });
    r.root.scale.setScalar(src.scale);
    return r;
  }

  /**
   * Bake: merge the static child meshes of every bone group by material so an articulated mech costs ~40 draw calls
   * instead of ~120. Named/special meshes (blade, flames, muzzles) and nested groups are left untouched.
   * Also builds a single-mesh far LOD (rest pose) toggled by setLOD().
   */
  lodMesh: THREE.Mesh | null = null; private lodFar = false;
  bake() {
    const bones = [this.pelvis, this.torso, this.head, this.shoulderL, this.shoulderR, this.armL, this.armR, this.forearmL, this.forearmR, this.weaponL, this.weaponR, this.shoulderWeaponL, this.shoulderWeaponR, this.hipL, this.hipR, this.kneeL, this.kneeR, this.footL, this.footR];
    // emissive plates keep their own material so Exposed flares and thruster heat still animate;
    // every opaque plate collapses into one vertex-coloured material
    const emissive = new Set<THREE.Material>([this.mats.glow, this.mats.sensor, this.mats.nozzle]);
    const allForLod: THREE.BufferGeometry[] = []; const lodMats: THREE.Material[] = [];
    this.root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();

    const tint = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const col = (m as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const clean = (g: THREE.BufferGeometry) => {
      const c = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') c.deleteAttribute(k);
      if (!c.attributes.uv) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
      return c;
    };

    for (const bone of bones) {
      const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>(); const remove: THREE.Object3D[] = [];
      const collect = (o: THREE.Object3D) => {
        for (const c of o.children) {
          const m = c as THREE.Mesh;
          if (m.isMesh && !m.name && !(m.material as THREE.ShaderMaterial).isShaderMaterial && !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
            const g = m.geometry.clone(); m.updateMatrix();
            // transform into bone space (c may be nested inside plain sub-groups like pistons/vents)
            const rel = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(m.matrixWorld);
            g.applyMatrix4(rel);
            const src = m.material as THREE.Material;
            const target = emissive.has(src) ? src : this.mats.solid;
            tint(g, src);
            (byMat.get(target) ?? byMat.set(target, []).get(target)!).push(g);
            remove.push(c);
          } else if (!(c as THREE.Mesh).isMesh && !bones.includes(c as THREE.Group) && !this.thrusters.some((t) => t.obj === c) && c !== this.bladeBase && c !== this.muzzleR && c !== this.muzzleCannon && !this.missileBays.includes(c)) {
            collect(c); if (c.children.length === 0) remove.push(c);
          }
        }
      };
      collect(bone);
      for (const r of remove) r.parent?.remove(r);
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos.map(clean));
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; bone.add(mesh);
        const lg = merged.clone(); lg.applyMatrix4(new THREE.Matrix4().copy(rootInv).multiply(bone.matrixWorld)); allForLod.push(lg); lodMats.push(mat);
      }
    }
    // far LOD: everything merged in rest pose, grouped by material
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    allForLod.forEach((g, i) => (groups.get(lodMats[i]) ?? groups.set(lodMats[i], []).get(lodMats[i])!).push(g));
    const lod = new THREE.Group(); lod.visible = false;
    for (const [mat, geos] of groups) { const m = mergeGeometries(geos); if (m) { const me = new THREE.Mesh(m, mat); me.castShadow = true; lod.add(me); } }
    this.root.add(lod); this.lodMesh = lod as unknown as THREE.Mesh;
    this.meshes.length = 0; this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) this.meshes.push(o as THREE.Mesh); });
  }
  /** Switch between articulated rig and merged rest-pose LOD. */
  setLOD(far: boolean) {
    if (far === this.lodFar || !this.lodMesh) return; this.lodFar = far;
    this.pelvis.visible = !far; this.lodMesh.visible = far;
  }
  addThruster(parent: THREE.Object3D, obj: THREE.Object3D, kind: ThrusterNode['kind'], dir: THREE.Vector3, scale = 1) {
    parent.add(obj); this.thrusters.push({ obj, kind, dir, scale });
  }

  /** Drive the articulation each frame. All motion is procedural: no baked clips. */
  animate(p: RigPose, dt: number) {
    // --- torso aim: yaw split between pelvis-torso and head, pitch mostly torso ---
    this.torsoYaw = damp(this.torsoYaw, clamp(p.aimYaw, -0.9, 0.9), 14, dt);
    this.torsoPitch = damp(this.torsoPitch, clamp(p.aimPitch, -0.5, 0.45), 12, dt);
    this.headYaw = damp(this.headYaw, clamp(p.aimYaw * 0.5, -0.5, 0.5), 20, dt);
    this.headPitch = damp(this.headPitch, clamp(p.aimPitch * 0.6, -0.4, 0.4), 18, dt);
    this.leanX = damp(this.leanX, p.lean.x, 10, dt);
    this.leanZ = damp(this.leanZ, p.lean.z, 10, dt);
    this.tuck = damp(this.tuck, p.airborne, 8, dt);
    this.suspension = damp(this.suspension, p.crouch, 16, dt);
    this.cannonKick = damp(this.cannonKick, p.cannonRecoil, 10, dt);
    const stag = p.stagger;

    // idle: slow breathing bob, subtle torso sway and head scanning when standing still
    this.idleT += dt; this.idle = damp(this.idle, p.speed01 < 0.05 && p.airborne < 0.1 && p.bladeSwing < 0 ? 1 : 0, 3, dt);
    const susp = this.suspension * 1.1 + stag * 0.6 + this.idle * (0.08 + Math.sin(this.idleT * 1.1) * 0.06);
    this.pelvis.position.y = this.hipHeight - susp;
    this.pelvis.rotation.set(this.leanZ * 0.5 + stag * -0.25, 0, -this.leanX * 0.5);
    this.torso.rotation.set(this.torsoPitch * 0.7 + this.leanZ * 0.35 + this.cannonKick * -0.12 + stag * -0.2 + this.idle * Math.sin(this.idleT * 1.1) * 0.015, this.torsoYaw + this.idle * Math.sin(this.idleT * 0.6) * 0.06, -this.leanX * 0.25 + stag * 0.12 + this.idle * Math.sin(this.idleT * 0.8) * 0.02);
    this.head.rotation.set(this.headPitch, this.headYaw + this.idle * Math.sin(this.idleT * 0.45) * 0.35, 0);

    // --- legs: skating stride + tuck in air + suspension ---
    const stride = p.speed01 * (1 - p.airborne);
    this.stride = damp(this.stride, stride, 8, dt);
    this.legPhase += dt * (2.2 + p.speed01 * 2.5) * (1 - p.airborne);
    const ph = this.legPhase;
    const sw = Math.sin(ph) * 0.28 * this.stride;
    const t = this.tuck;
    // hip forward/back, knee bend, ankle compensation
    const baseBend = 0.28 + susp * 0.35;
    const setLeg = (hip: THREE.Group, knee: THREE.Group, foot: THREE.Group, side: number, phase: number) => {
      const s = Math.sin(ph + phase) * this.stride;
      hip.rotation.x = -baseBend * 0.9 + s * 0.24 + t * -0.85 + this.leanZ * 0.4;
      hip.rotation.z = side * (0.04 + t * 0.12) - this.leanX * 0.2;
      knee.rotation.x = baseBend * 1.9 + Math.abs(s) * 0.25 + t * 1.55 + susp * 0.5;
      foot.rotation.x = -(hip.rotation.x + knee.rotation.x) + t * 0.5 + this.leanZ * -0.3;
      foot.rotation.z = -hip.rotation.z * 0.6;
    };
    setLeg(this.hipL, this.kneeL, this.footL, 1, 0);
    setLeg(this.hipR, this.kneeR, this.footR, -1, Math.PI);
    void sw;

    // --- arms track aim; right arm recoil; left arm blade swing ---
    const aimP = this.torsoPitch * 0.3;
    this.shoulderR.rotation.set(aimP * 0.5, 0, 0);
    this.shoulderL.rotation.set(aimP * 0.5, 0, 0);
    this.armR.rotation.set(-0.35 + aimP + p.recoilR * 0.35, 0.08, -0.1);
    this.forearmR.rotation.set(-0.55 + p.recoilR * 0.25, 0, 0);
    this.weaponR.position.z = -p.recoilR * 0.5;
    if (p.bladeSwing >= 0) {
      // wind-up then horizontal slash across the body
      const s = p.bladeSwing;
      const wind = s < 0.25 ? s / 0.25 : 1;
      const slash = s < 0.25 ? 0 : Math.min(1, (s - 0.25) / 0.35);
      const e = slash < 1 ? 1 - Math.pow(1 - slash, 3) : 1;
      this.armL.rotation.set(-1.3 + e * 0.5, 0.9 * wind - e * 2.1, 0.5 * wind - e * 0.6);
      this.forearmL.rotation.set(-0.3 - wind * 0.6 + e * 0.8, 0, 0);
      this.torso.rotation.y += (wind * 0.35 - e * 0.9);
    } else {
      this.armL.rotation.set(-0.25 + aimP * 0.5 + p.recoilL * 0.3, -0.12, 0.12);
      this.forearmL.rotation.set(-0.5, 0, 0);
    }
    this.shoulderWeaponL.rotation.x = -this.cannonKick * 0.35;
    this.shoulderWeaponL.position.z = this.cannonKick * 0.7;

    // --- thrusters visual scale ---
    for (const th of this.thrusters) {
      let v = 0;
      if (th.kind === 'rear') v = p.thrust;
      else if (th.kind === 'up') v = p.thrustUp * 0.9 + p.thrust * 0.2;
      else if (th.kind === 'leg') v = Math.max(p.thrustUp, p.thrust * 0.6);
      else if (th.kind === 'side') v = Math.max(0, th.dir.dot(p.qb));
      const s = th.obj.scale;
      const target = v;
      s.z = damp(s.z, 0.05 + target * 2.2 * th.scale, 30, dt);
      s.x = damp(s.x, 0.15 + target * 0.9, 30, dt); s.y = s.x;
      th.obj.visible = s.z > 0.3;
    }
  }
}
