import * as THREE from 'three';
import { MechRig, box, cyl, at, grp } from './MechRig';
import { makeMechMats, MechPalette, PLAYER_PALETTE, ENEMY_PALETTE, HEAVY_PALETTE, DRONE_PALETTE } from './Materials';
import { makeFlame, thrusterMaterial } from '../fx/Thruster';

/** Small mechanical details reused everywhere. */
function piston(len: number, m: THREE.Material, m2: THREE.Material) {
  const g = new THREE.Group();
  g.add(at(cyl(0.11, 0.11, len * 0.55, m2, 8), 0, len * 0.27, 0));
  g.add(at(cyl(0.17, 0.17, len * 0.5, m, 8), 0, -len * 0.25, 0));
  return g;
}
function vents(w: number, h: number, n: number, m: THREE.Material) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) g.add(at(box(w, h / n * 0.45, 0.08, m, 0), 0, -h / 2 + (i + 0.5) * (h / n), 0));
  return g;
}
function addLeg(rig: MechRig, side: number, mats: ReturnType<typeof makeMechMats>, heavy = false, flameMat?: THREE.ShaderMaterial) {
  const hip = side > 0 ? rig.hipL : rig.hipR, knee = side > 0 ? rig.kneeL : rig.kneeR, foot = side > 0 ? rig.footL : rig.footR;
  const th = heavy ? 1.35 : 1;
  hip.position.set(side * 1.15 * th, -0.35, 0);
  // hip joint
  hip.add(at(cyl(0.55 * th, 0.55 * th, 0.9, mats.joint, 12), 0, 0, 0, 0, 0, Math.PI / 2));
  // thigh: armored front plate + inner structure
  hip.add(at(box(0.95 * th, 2.4, 1.1 * th, mats.armor2), 0, -1.35, 0));
  hip.add(at(box(1.15 * th, 1.5, 0.5, mats.armor), side * 0.1, -1.2, 0.5 * th));
  hip.add(at(box(0.5, 1.9, 0.4, mats.metal, 0.02), side * 0.5 * th, -1.6, -0.35));
  hip.add(at(piston(1.6, mats.metal, mats.joint), -side * 0.45 * th, -1.6, -0.55, 0.25, 0, 0));
  hip.add(at(box(0.3, 1.6, 0.9, mats.armor, 0.03), side * 0.62 * th, -1.3, 0.1)); // outer thigh plate
  hip.add(at(box(0.5, 0.25, 0.5, mats.glow, 0.01), side * 0.5 * th, -2.2, 0.35));
  hip.add(at(cyl(0.16, 0.16, 1.1, mats.metal, 8), 0, -2.3, 0.62 * th, Math.PI / 2, 0, 0)); // knee actuator rod
  knee.position.set(0, -2.65, 0);
  knee.add(at(cyl(0.5 * th, 0.5 * th, 1.25 * th, mats.joint, 12), 0, 0, 0, 0, 0, Math.PI / 2));
  knee.add(at(box(0.8 * th, 0.9, 1.2, mats.armor, 0.05), 0, 0.15, 0.35)); // knee cap
  // shin
  knee.add(at(box(0.8 * th, 2.5, 0.95 * th, mats.armor2), 0, -1.35, -0.05));
  knee.add(at(box(0.95 * th, 2.0, 0.35, mats.armor), 0, -1.4, 0.55 * th));
  knee.add(at(piston(1.7, mats.metal, mats.joint), 0, -1.3, -0.7, -0.15, 0, 0));
  // leg thruster (calf)
  if (flameMat) {
    const nozzle = at(cyl(0.22, 0.3, 0.5, mats.exhaust, 10), 0, -1.9, -0.7, Math.PI / 2, 0, 0);
    knee.add(nozzle);
    const fl = makeFlame(0.28, 2.2, flameMat); fl.position.set(0, -1.9, -0.9); fl.rotation.y = Math.PI; // exhaust toward -Z (backwards)
    rig.addThruster(knee, fl, 'leg', new THREE.Vector3(0, 0, -1), 0.7);
  }
  foot.position.set(0, -2.75, 0);
  foot.add(at(cyl(0.35 * th, 0.35 * th, 1.0 * th, mats.joint, 10), 0, 0, 0, 0, 0, Math.PI / 2));
  foot.add(at(box(1.05 * th, 0.55, 1.9 * th, mats.armor2, 0.05), 0, -0.45, 0.25));
  foot.add(at(box(1.2 * th, 0.35, 0.9, mats.armor, 0.04), 0, -0.55, 0.95 * th)); // toe
  for (const s of [-1, 0, 1]) foot.add(at(box(0.22, 0.3, 0.6, mats.metal, 0.02), s * 0.4 * th, -0.6, 1.5 * th)); // toe claws
  foot.add(at(box(0.9 * th, 0.4, 0.6, mats.metal, 0.03), 0, -0.5, -0.75 * th)); // heel
  foot.add(at(piston(0.8, mats.metal, mats.joint), 0, 0.2, -0.6 * th, -0.5, 0, 0)); // ankle piston
}

export function buildPlayerMech(palette: MechPalette = PLAYER_PALETTE): MechRig {
  const mats = makeMechMats(palette);
  const rig = new MechRig(mats);
  const flame = thrusterMaterial(palette.glow, 0xe8f8ff);
  rig.hipHeight = 5.55; rig.height = 10.2;
  // ---- pelvis ----
  const pv = rig.pelvis;
  pv.add(at(box(2.2, 1.1, 1.5, mats.armor2), 0, 0, 0));
  pv.add(at(box(1.4, 0.7, 1.9, mats.armor), 0, -0.1, 0));
  pv.add(at(box(0.9, 1.2, 0.9, mats.joint, 0.03), 0, 0.55, 0)); // waist actuator
  pv.add(at(vents(0.9, 0.7, 3, mats.dark), 0, -0.05, 0.95));
  // side skirts (layered) + rear plate + waist ring detail
  for (const s of [-1, 1]) { pv.add(at(box(0.5, 1.4, 1.3, mats.armor), s * 1.4, -0.55, 0.05, 0, 0, s * 0.18)); pv.add(at(box(0.35, 0.9, 0.9, mats.armor2, 0.03), s * 1.62, -0.9, 0.1, 0, 0, s * 0.25)); pv.add(at(box(0.2, 0.3, 0.7, mats.glow, 0.01), s * 1.68, -0.4, 0.2, 0, 0, s * 0.18)); }
  pv.add(at(box(1.6, 0.9, 0.5, mats.armor, 0.04), 0, -0.2, -0.85));
  pv.add(at(cyl(0.7, 0.7, 0.25, mats.metal, 16), 0, 0.55, 0)); pv.add(at(cyl(0.6, 0.6, 0.25, mats.metal, 16), 0, 0.95, 0));
  pv.add(at(box(0.9, 0.5, 0.35, mats.accent, 0.02), 0, -0.55, 0.95));
  // ---- torso ----
  const to = rig.torso; to.position.set(0, 1.0, 0);
  to.add(at(box(3.0, 2.2, 2.1, mats.armor2), 0, 1.15, -0.1));
  to.add(at(box(2.3, 1.6, 0.8, mats.armor), 0, 1.35, 1.05)); // chest plate
  for (const s of [-1, 1]) { to.add(at(box(0.9, 1.1, 0.5, mats.armor2, 0.04), s * 0.95, 1.5, 1.3, 0, s * 0.25, 0)); to.add(at(box(0.5, 0.25, 0.3, mats.dark, 0.02), s * 1.05, 1.85, 1.45, 0, s * 0.25, 0)); } // layered pectoral plates
  to.add(at(box(1.2, 0.8, 0.5, mats.dark, 0.03), 0, 0.75, 1.35)); // chest intake
  to.add(at(vents(1.0, 0.6, 3, mats.metal), 0, 0.75, 1.62));
  to.add(at(box(0.55, 0.35, 0.2, mats.glow, 0.01), 0, 1.75, 1.5)); // chest light
  to.add(at(box(3.4, 0.6, 1.4, mats.armor), 0, 2.35, -0.2)); // collar
  for (const s of [-1, 1]) to.add(at(vents(0.9, 0.5, 3, mats.dark), s * 1.2, 2.45, 0.55, Math.PI / 2, 0, 0)); // collar intakes
  to.add(at(box(1.6, 1.4, 1.1, mats.metal, 0.02), 0, 1.0, -1.35)); // back pack core
  for (const s of [-1, 1]) to.add(at(cyl(0.32, 0.32, 1.5, mats.armor2, 10), s * 1.15, 1.6, -1.55)); // backpack tanks
  to.add(at(box(1.0, 0.5, 0.4, mats.accent, 0.02), 0, 2.0, -1.65));
  to.add(at(vents(1.3, 0.9, 4, mats.dark), 0, 1.2, -1.95));
  // back: thruster housings, spine actuator, upper back plate, cable bundles
  for (const s of [-1, 1]) { to.add(at(box(1.15, 1.5, 1.1, mats.armor2, 0.05), s * 0.85, 0.65, -1.45)); to.add(at(box(0.35, 1.1, 0.3, mats.accent, 0.02), s * 1.5, 0.75, -1.35)); to.add(at(cyl(0.07, 0.07, 1.4, mats.joint, 6), s * 0.4, 1.9, -1.7, 0.4, 0, s * 0.3)); to.add(at(cyl(0.07, 0.07, 1.2, mats.joint, 6), s * 0.55, 1.7, -1.75, 0.6, 0, s * 0.5)); }
  to.add(at(box(0.6, 1.6, 0.5, mats.joint, 0.03), 0, 1.1, -1.85)); // spine actuator
  to.add(at(box(2.2, 0.9, 0.5, mats.armor, 0.05), 0, 2.1, -1.4)); // upper back plate
  to.add(at(box(0.9, 0.3, 0.2, mats.glow, 0.01), 0, 2.2, -1.68)); // back light strip
  // side torso pistons and armor gaps
  for (const s of [-1, 1]) { to.add(at(piston(1.2, mats.metal, mats.joint), s * 1.55, 0.5, 0.2, 0, 0, s * 0.5)); to.add(at(box(0.25, 1.4, 1.6, mats.joint, 0.02), s * 1.52, 1.0, -0.1)); }
  // rear thrusters (two big nozzles)
  for (const s of [-1, 1]) {
    const n = grp(s * 0.85, 0.65, -1.8);
    n.add(at(cyl(0.42, 0.55, 1.2, mats.exhaust, 12), 0, 0, 0, Math.PI / 2, 0, 0));
    n.add(at(cyl(0.3, 0.3, 0.2, mats.nozzle, 12), 0, 0, -0.55, Math.PI / 2, 0, 0));
    to.add(n);
    const fl = makeFlame(0.5, 4.5, flame); fl.position.set(s * 0.85, 0.65, -2.4); fl.rotation.y = Math.PI;
    rig.addThruster(to, fl, 'rear', new THREE.Vector3(0, 0, -1), 1);
  }
  // upward thrusters on backpack (angled down)
  for (const s of [-1, 1]) {
    const fl = makeFlame(0.3, 2.6, flame); fl.position.set(s * 1.35, 0.35, -1.2); fl.rotation.x = Math.PI / 2; // exhaust -Y
    rig.addThruster(to, fl, 'up', new THREE.Vector3(0, -1, 0), 0.8);
    to.add(at(cyl(0.25, 0.32, 0.5, mats.exhaust, 10), s * 1.35, 0.35, -1.2));
  }
  // ---- head / sensor ----
  const hd = rig.head; hd.position.set(0, 2.75, 0.35);
  hd.add(at(box(0.85, 0.7, 1.15, mats.armor2, 0.04), 0, 0.3, 0));
  hd.add(at(box(0.55, 0.28, 0.25, mats.sensor, 0.01), 0, 0.32, 0.6)); // visor
  hd.add(at(box(0.25, 0.5, 0.6, mats.armor, 0.02), 0, 0.72, -0.2)); // crest
  hd.add(at(cyl(0.05, 0.05, 1.3, mats.metal, 6), 0.35, 0.9, -0.2)); // antenna
  hd.add(at(cyl(0.04, 0.04, 0.9, mats.metal, 6), -0.3, 0.75, -0.3, 0.3, 0, 0.2));
  for (const s of [-1, 1]) hd.add(at(cyl(0.12, 0.12, 0.2, mats.sensor, 8), s * 0.36, 0.45, 0.5, Math.PI / 2, 0, 0)); // side sensors
  hd.add(at(box(0.5, 0.15, 0.4, mats.dark, 0.01), 0, 0.62, 0.45));
  hd.add(at(box(0.9, 0.2, 0.7, mats.metal, 0.02), 0, 0.02, -0.1)); // neck ring
  // ---- shoulders ----
  for (const s of [-1, 1]) {
    const sh = s > 0 ? rig.shoulderL : rig.shoulderR; sh.position.set(s * 1.85, 2.05, -0.1);
    sh.add(at(cyl(0.5, 0.5, 0.9, mats.joint, 12), 0, 0, 0, 0, 0, Math.PI / 2));
    // shoulder pauldron, layered
    sh.add(at(box(1.25, 1.35, 1.6, mats.armor), s * 0.55, 0.25, 0, 0, 0, -s * 0.12));
    sh.add(at(box(1.0, 0.5, 1.3, mats.armor2, 0.04), s * 0.65, 0.95, 0, 0, 0, -s * 0.12));
    sh.add(at(box(0.3, 0.9, 1.1, mats.accent, 0.02), s * 1.2, 0.15, 0, 0, 0, -s * 0.12));
    sh.add(at(vents(0.9, 0.5, 3, mats.dark), s * 0.6, 0.35, 0.82, 0, 0, -s * 0.12)); // shoulder intake
    sh.add(at(box(0.6, 0.25, 0.9, mats.glow, 0.01), s * 1.0, 0.98, -0.2, 0, 0, -s * 0.12)); // shoulder light strip
    // upper arm
    const arm = s > 0 ? rig.armL : rig.armR; arm.position.set(s * 0.7, -0.2, 0);
    arm.add(at(box(0.75, 1.8, 0.85, mats.armor2), 0, -1.0, 0));
    arm.add(at(piston(1.3, mats.metal, mats.joint), s * 0.45, -1.0, -0.25, 0, 0, -s * 0.15));
    const fa = s > 0 ? rig.forearmL : rig.forearmR; fa.position.set(0, -2.0, 0);
    fa.add(at(cyl(0.4, 0.4, 0.95, mats.joint, 10), 0, 0, 0, 0, 0, Math.PI / 2));
    fa.add(at(box(0.8, 1.7, 0.95, mats.armor), 0, -1.0, 0.05));
    fa.add(at(box(0.5, 1.2, 0.3, mats.armor2, 0.03), s * 0.45, -0.9, 0.25)); // forearm outer plate
    fa.add(at(piston(0.9, mats.metal, mats.joint), -s * 0.35, -0.9, -0.45, 0.2, 0, 0));
    fa.add(at(box(0.5, 0.9, 0.5, mats.metal, 0.02), 0, -1.9, 0.1)); // wrist / hand block
  }
  // ---- right arm weapon: automatic kinetic rifle ----
  const wr = rig.weaponR; wr.position.set(0, -2.1, 0.3);
  wr.add(at(box(0.5, 0.75, 3.4, mats.dark, 0.04), 0, 0.0, 0.9)); // receiver
  wr.add(at(box(0.62, 0.5, 1.2, mats.metal, 0.03), 0, 0.15, -0.1)); // rear block
  wr.add(at(cyl(0.12, 0.12, 2.6, mats.metal, 8), 0, 0.12, 3.6, Math.PI / 2, 0, 0)); // barrel
  wr.add(at(cyl(0.2, 0.2, 0.6, mats.dark, 8), 0, 0.12, 4.6, Math.PI / 2, 0, 0)); // muzzle brake
  wr.add(at(box(0.32, 0.85, 0.5, mats.armor2, 0.02), 0, -0.6, 0.3)); // magazine
  wr.add(at(box(0.15, 0.25, 1.0, mats.accent, 0.01), 0, 0.5, 1.2)); // top rail accent
  rig.muzzleR.position.set(0, 0.12, 4.95); wr.add(rig.muzzleR);
  // ---- left arm weapon: energy blade emitter ----
  const wl = rig.weaponL; wl.position.set(0, -2.0, 0.2);
  wl.add(at(box(0.55, 0.6, 1.6, mats.dark, 0.04), 0, 0, 0.3));
  wl.add(at(box(0.25, 0.4, 0.9, mats.accent, 0.02), 0, 0.15, 0.9));
  rig.bladeBase.position.set(0, 0, 1.1); wl.add(rig.bladeBase);
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 7.5), bladeMat); blade.position.set(0, 0.1, 3.9); blade.name = 'blade';
  const bladeCore = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 7.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); bladeCore.position.set(0, 0.1, 3.8); bladeCore.name = 'bladeCore';
  rig.bladeBase.add(blade, bladeCore);
  rig.bladeTip.position.set(0, 0, 7.6); rig.bladeBase.add(rig.bladeTip);
  // ---- left shoulder weapon: heavy cannon ----
  const cn = rig.shoulderWeaponL; cn.position.set(0.85, 1.5, -0.4);
  cn.add(at(box(1.1, 1.1, 2.6, mats.armor2), 0, 0, -0.2));
  cn.add(at(cyl(0.34, 0.4, 4.6, mats.dark, 12), 0, 0.05, 2.9, Math.PI / 2, 0, 0));
  cn.add(at(cyl(0.44, 0.44, 0.9, mats.metal, 12), 0, 0.05, 5.0, Math.PI / 2, 0, 0));
  cn.add(at(box(0.5, 0.35, 1.0, mats.accent, 0.02), 0, 0.68, 0.4));
  cn.add(at(vents(0.8, 0.8, 3, mats.dark), 0.62, 0.0, -0.2, 0, Math.PI / 2, 0));
  cn.add(at(box(0.8, 0.8, 0.5, mats.metal, 0.03), 0, 0, -1.6)); cn.add(at(cyl(0.22, 0.22, 0.6, mats.dark, 8), 0, 0.05, -1.95, Math.PI / 2, 0, 0)); // breech
  cn.add(at(box(0.3, 0.2, 2.0, mats.accent, 0.01), -0.62, 0.4, 0.2));
  rig.muzzleCannon.position.set(0, 0.05, 5.5); cn.add(rig.muzzleCannon);
  // ---- right shoulder weapon: multi-lock missile rack ----
  const mr = rig.shoulderWeaponR; mr.position.set(-0.85, 1.55, -0.5);
  mr.add(at(box(1.5, 1.1, 2.2, mats.armor2), 0, 0, 0));
  mr.add(at(box(1.6, 1.2, 0.35, mats.armor, 0.04), 0, 0.02, 1.2));
  mr.add(at(vents(1.2, 0.8, 4, mats.dark), 0, 0, -1.12)); mr.add(at(box(0.3, 1.0, 0.3, mats.accent, 0.02), 0.85, 0, -0.6)); mr.add(at(box(1.4, 0.2, 2.0, mats.armor2, 0.02), 0, 0.65, 0));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const tube = at(cyl(0.16, 0.16, 0.5, mats.dark, 8), -0.45 + i * 0.45, -0.25 + j * 0.5, 1.35, Math.PI / 2, 0, 0);
    mr.add(tube); const bay = grp(-0.45 + i * 0.45, -0.25 + j * 0.5, 1.6); mr.add(bay); rig.missileBays.push(bay);
  }
  // side thrusters on skirts (for QB)
  for (const s of [-1, 1]) {
    const fl = makeFlame(0.32, 3.2, flame); fl.position.set(s * 1.7, -0.5, 0); fl.rotation.y = -s * Math.PI / 2; // exhaust toward +/-X
    rig.addThruster(pv, fl, 'side', new THREE.Vector3(-s, 0, 0), 1); // fires when QB goes opposite direction
    pv.add(at(cyl(0.2, 0.28, 0.5, mats.exhaust, 10), s * 1.65, -0.5, 0, 0, 0, Math.PI / 2));
  }
  // front QB thrusters (when boosting backward)
  const fb = makeFlame(0.28, 2.6, flame); fb.position.set(0, 0.6, 1.2); rig.addThruster(pv, fb, 'side', new THREE.Vector3(0, 0, -1), 0.8);
  const bb = makeFlame(0.28, 2.6, flame); bb.position.set(0, -0.2, -1.0); bb.rotation.y = Math.PI; rig.addThruster(pv, bb, 'side', new THREE.Vector3(0, 0, 1), 0.8);
  addLeg(rig, 1, mats, false, flame); addLeg(rig, -1, mats, false, flame);
  rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) rig.meshes.push(o as THREE.Mesh); });
  rig.bake();
  return rig;
}

/** Standard combat mech — similar vocabulary, different silhouette (broad chest, twin guns, angular head). */
export function buildStandardMech(palette: MechPalette = ENEMY_PALETTE, variant: 'gun' | 'sniper' | 'brawler' = 'gun'): MechRig {
  const mats = makeMechMats(palette);
  const rig = new MechRig(mats);
  const flame = thrusterMaterial(palette.glow, 0xfff1d0);
  rig.hipHeight = 5.4; rig.height = 10;
  const pv = rig.pelvis;
  pv.add(at(box(2.0, 1.0, 1.4, mats.armor2), 0, 0, 0));
  pv.add(at(box(0.8, 1.1, 0.8, mats.joint, 0.03), 0, 0.5, 0));
  for (const s of [-1, 1]) pv.add(at(box(0.6, 1.2, 1.0, mats.armor), s * 1.25, -0.5, 0.1, 0, 0, s * 0.25));
  const to = rig.torso; to.position.set(0, 0.9, 0);
  to.add(at(box(3.4, 2.0, 2.0, mats.armor), 0, 1.1, 0));
  to.add(at(box(2.4, 1.0, 0.6, mats.armor2), 0, 0.9, 1.15));
  for (const s of [-1, 1]) { to.add(at(box(1.1, 0.9, 0.4, mats.armor2, 0.04), s * 1.15, 1.55, 1.15, 0, s * 0.3, 0)); to.add(at(vents(0.8, 0.5, 3, mats.dark), s * 1.0, 0.55, 1.22)); to.add(at(box(0.25, 1.2, 1.6, mats.joint, 0.02), s * 1.72, 0.9, -0.2)); to.add(at(piston(1.1, mats.metal, mats.joint), s * 1.5, 0.3, 0.3, 0, 0, s * 0.5)); }
  to.add(at(box(1.8, 0.3, 0.2, mats.glow, 0.01), 0, 1.65, 1.1));
  to.add(at(box(3.0, 0.5, 1.2, mats.armor2, 0.04), 0, 2.2, -0.2)); // collar
  to.add(at(box(2.0, 1.5, 1.2, mats.metal, 0.02), 0, 1.0, -1.3));
  to.add(at(vents(1.2, 0.8, 4, mats.dark), 0, 1.1, -1.92)); to.add(at(box(0.5, 1.4, 0.4, mats.joint, 0.02), 0, 1.0, -1.75));
  for (const s of [-1, 1]) to.add(at(cyl(0.28, 0.28, 1.3, mats.armor2, 8), s * 1.2, 1.4, -1.5));
  for (const s of [-1, 1]) {
    to.add(at(cyl(0.4, 0.5, 1.0, mats.exhaust, 10), s * 0.7, 0.6, -1.8, Math.PI / 2, 0, 0));
    const fl = makeFlame(0.42, 3.8, flame); fl.position.set(s * 0.7, 0.6, -2.3); fl.rotation.y = Math.PI; rig.addThruster(to, fl, 'rear', new THREE.Vector3(0, 0, -1), 1);
    const fu = makeFlame(0.25, 2.2, flame); fu.position.set(s * 1.3, 0.3, -1.0); fu.rotation.x = Math.PI / 2; rig.addThruster(to, fu, 'up', new THREE.Vector3(0, -1, 0), 0.8);
  }
  const hd = rig.head; hd.position.set(0, 2.45, 0.2);
  hd.add(at(box(1.1, 0.6, 1.0, mats.armor2, 0.04), 0, 0.3, 0));
  hd.add(at(box(0.9, 0.18, 0.2, mats.sensor, 0.01), 0, 0.3, 0.55));
  for (const s of [-1, 1]) {
    const sh = s > 0 ? rig.shoulderL : rig.shoulderR; sh.position.set(s * 2.0, 1.9, 0);
    sh.add(at(box(1.3, 1.1, 1.5, mats.armor2), s * 0.5, 0.3, 0));
    sh.add(at(box(1.0, 0.4, 1.2, mats.armor, 0.04), s * 0.6, 0.95, 0)); sh.add(at(vents(0.8, 0.45, 3, mats.dark), s * 0.5, 0.35, 0.78));
    sh.add(at(box(0.3, 0.8, 1.2, mats.accent, 0.02), s * 1.2, 0.2, 0));
    const arm = s > 0 ? rig.armL : rig.armR; arm.position.set(s * 0.6, -0.2, 0);
    arm.add(at(box(0.7, 1.7, 0.8, mats.armor2), 0, -0.95, 0)); arm.add(at(piston(1.1, mats.metal, mats.joint), s * 0.42, -0.9, -0.2, 0, 0, -s * 0.15)); arm.add(at(box(0.5, 0.9, 0.3, mats.armor, 0.03), s * 0.35, -0.6, 0.35));
    const fa = s > 0 ? rig.forearmL : rig.forearmR; fa.position.set(0, -1.9, 0);
    fa.add(at(cyl(0.38, 0.38, 0.9, mats.joint, 10), 0, 0, 0, 0, 0, Math.PI / 2));
    fa.add(at(box(0.75, 1.6, 0.85, mats.armor), 0, -0.9, 0)); fa.add(at(box(0.4, 1.1, 0.3, mats.armor2, 0.03), s * 0.42, -0.85, 0.2)); fa.add(at(box(0.3, 0.2, 0.5, mats.glow, 0.01), s * 0.45, -1.4, 0.1));
    // both arms: guns
    const w = s > 0 ? rig.weaponL : rig.weaponR; w.position.set(0, -1.9, 0.3);
    w.add(at(box(0.45, 0.6, 2.6, mats.dark, 0.04), 0, 0, 0.8)); w.add(at(box(0.55, 0.4, 0.9, mats.metal, 0.03), 0, 0.1, -0.2)); w.add(at(box(0.25, 0.7, 0.4, mats.armor2, 0.02), 0, -0.5, 0.4)); w.add(at(box(0.15, 0.2, 0.9, mats.accent, 0.01), 0, 0.42, 1.0));
    w.add(at(cyl(0.1, 0.1, 2.0, mats.metal, 8), 0, 0.1, 2.9, Math.PI / 2, 0, 0)); w.add(at(cyl(0.16, 0.16, 0.5, mats.dark, 8), 0, 0.1, 3.7, Math.PI / 2, 0, 0));
    const mz = grp(0, 0.1, 3.9); w.add(mz); if (s < 0) rig.muzzleR.position.copy(mz.position), w.add(rig.muzzleR); else w.add(rig.muzzleCannon), rig.muzzleCannon.position.copy(mz.position);
    if (variant === 'sniper' && s < 0) { w.add(at(cyl(0.14, 0.14, 5.5, mats.metal, 8), 0, 0.1, 5.3, Math.PI / 2, 0, 0)); w.add(at(box(0.5, 0.5, 1.6, mats.armor2, 0.03), 0, 0.5, 1.2)); w.add(at(cyl(0.22, 0.22, 0.6, mats.glow, 8), 0, 0.1, 8.2, Math.PI / 2, 0, 0)); rig.muzzleR.position.set(0, 0.1, 8.5); }
    if (variant === 'brawler' && s > 0) {
      // energy blade on the left arm, mirrors the player's weapon
      rig.bladeBase.position.set(0, 0, 1.1); w.add(rig.bladeBase);
      const bm = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 7), bm); blade.position.set(0, 0.1, 3.6); blade.name = 'blade'; rig.bladeBase.add(blade);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 6.8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); core.position.set(0, 0.1, 3.5); core.name = 'bladeCore'; rig.bladeBase.add(core);
    }
  }
  // shoulder missile pods both sides
  for (const s of [-1, 1]) {
    const p = s > 0 ? rig.shoulderWeaponL : rig.shoulderWeaponR; p.position.set(s * 0.9, 1.5, -0.4);
    p.add(at(box(1.1, 0.9, 1.8, mats.armor2), 0, 0, 0));
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { p.add(at(cyl(0.15, 0.15, 0.4, mats.dark, 8), -0.25 + i * 0.5, -0.2 + j * 0.4, 1.0, Math.PI / 2, 0, 0)); const bay = grp(-0.25 + i * 0.5, -0.2 + j * 0.4, 1.2); p.add(bay); rig.missileBays.push(bay); }
  }
  for (const s of [-1, 1]) { const fl = makeFlame(0.28, 2.8, flame); fl.position.set(s * 1.5, -0.4, 0); fl.rotation.y = -s * Math.PI / 2; rig.addThruster(pv, fl, 'side', new THREE.Vector3(-s, 0, 0), 1); }
  addLeg(rig, 1, mats, false, flame); addLeg(rig, -1, mats, false, flame);
  rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) rig.meshes.push(o as THREE.Mesh); });
  rig.bake();
  return rig;
}

/** Heavy mech — wide stance, thick plates, shoulder cannon, slow. */
export function buildHeavyMech(palette: MechPalette = HEAVY_PALETTE): MechRig {
  const mats = makeMechMats(palette);
  const rig = new MechRig(mats, 1.35);
  const flame = thrusterMaterial(palette.glow, 0xfff0c0);
  rig.hipHeight = 5.6; rig.height = 14;
  const pv = rig.pelvis;
  pv.add(at(box(3.0, 1.3, 2.0, mats.armor2), 0, 0, 0));
  pv.add(at(box(1.2, 1.2, 1.2, mats.joint, 0.03), 0, 0.6, 0));
  for (const s of [-1, 1]) pv.add(at(box(0.8, 1.8, 1.6, mats.armor), s * 1.8, -0.6, 0, 0, 0, s * 0.2));
  const to = rig.torso; to.position.set(0, 1.1, 0);
  to.add(at(box(4.4, 2.6, 2.6, mats.armor), 0, 1.3, 0));
  to.add(at(box(3.0, 1.8, 0.8, mats.armor2), 0, 1.2, 1.5));
  for (const s of [-1, 1]) { to.add(at(box(1.4, 1.4, 0.5, mats.armor, 0.06), s * 1.5, 1.5, 1.55, 0, s * 0.25, 0)); to.add(at(vents(1.0, 0.7, 4, mats.dark), s * 1.3, 0.6, 1.62)); to.add(at(box(0.3, 1.8, 2.0, mats.joint, 0.02), s * 2.25, 1.2, -0.2)); to.add(at(cyl(0.12, 0.12, 2.0, mats.metal, 6), s * 1.9, 2.3, -0.5, 1.2, 0, 0)); to.add(at(box(0.5, 0.35, 0.3, mats.accent, 0.02), s * 1.6, 2.2, 1.1)); }
  to.add(at(box(4.8, 0.7, 2.0, mats.armor2), 0, 2.8, -0.2)); to.add(at(box(1.8, 0.4, 0.6, mats.dark, 0.03), 0, 3.2, 0.5)); to.add(at(vents(1.6, 0.6, 3, mats.dark), 0, 3.0, 0.9));
  to.add(at(box(1.2, 0.35, 0.2, mats.glow, 0.01), 0, 1.9, 1.95));
  to.add(at(box(2.6, 2.0, 1.4, mats.metal, 0.02), 0, 1.2, -1.7)); to.add(at(vents(1.8, 1.0, 5, mats.dark), 0, 1.6, -2.42)); to.add(at(box(0.8, 2.0, 0.5, mats.joint, 0.03), 0, 1.2, -2.3));
  for (const s of [-1, 1]) {
    to.add(at(cyl(0.42, 0.42, 1.8, mats.armor2, 10), s * 1.7, 1.6, -1.9)); to.add(at(box(0.5, 0.6, 1.0, mats.armor, 0.04), s * 1.9, 0.6, -1.5));
    to.add(at(cyl(0.5, 0.65, 1.2, mats.exhaust, 10), s * 0.9, 0.8, -2.2, Math.PI / 2, 0, 0));
    const fl = makeFlame(0.5, 3.6, flame); fl.position.set(s * 0.9, 0.8, -2.8); fl.rotation.y = Math.PI; rig.addThruster(to, fl, 'rear', new THREE.Vector3(0, 0, -1), 1);
    const fu = makeFlame(0.3, 2.0, flame); fu.position.set(s * 1.7, 0.3, -1.4); fu.rotation.x = Math.PI / 2; rig.addThruster(to, fu, 'up', new THREE.Vector3(0, -1, 0), 0.8);
  }
  const hd = rig.head; hd.position.set(0, 3.1, 0.6);
  hd.add(at(box(1.3, 0.55, 1.2, mats.armor2, 0.04), 0, 0.25, 0));
  hd.add(at(box(0.5, 0.2, 0.2, mats.sensor, 0.01), 0, 0.25, 0.65));
  for (const s of [-1, 1]) {
    const sh = s > 0 ? rig.shoulderL : rig.shoulderR; sh.position.set(s * 2.6, 2.2, 0);
    sh.add(at(box(1.8, 1.5, 2.0, mats.armor), s * 0.6, 0.3, 0));
    sh.add(at(box(0.4, 1.0, 1.6, mats.accent, 0.02), s * 1.6, 0.2, 0));
    const arm = s > 0 ? rig.armL : rig.armR; arm.position.set(s * 0.8, -0.3, 0);
    arm.add(at(box(1.0, 2.0, 1.1, mats.armor2), 0, -1.1, 0)); arm.add(at(piston(1.4, mats.metal, mats.joint), s * 0.6, -1.0, -0.3, 0, 0, -s * 0.15)); arm.add(at(box(0.7, 1.1, 0.35, mats.armor, 0.04), s * 0.45, -0.8, 0.5));
    const fa = s > 0 ? rig.forearmL : rig.forearmR; fa.position.set(0, -2.2, 0);
    fa.add(at(cyl(0.5, 0.5, 1.2, mats.joint, 10), 0, 0, 0, 0, 0, Math.PI / 2));
    fa.add(at(box(1.1, 1.9, 1.2, mats.armor), 0, -1.0, 0)); fa.add(at(box(0.5, 1.4, 0.4, mats.armor2, 0.04), s * 0.6, -1.0, 0.3)); fa.add(at(vents(0.7, 0.5, 3, mats.dark), s * 0.3, -1.5, 0.62));
    const w = s > 0 ? rig.weaponL : rig.weaponR; w.position.set(0, -2.0, 0.4);
    w.add(at(box(0.7, 0.8, 2.6, mats.dark, 0.04), 0, 0, 0.8));
    w.add(at(cyl(0.16, 0.16, 2.2, mats.metal, 8), 0, 0.1, 3.0, Math.PI / 2, 0, 0));
    if (s < 0) { rig.muzzleR.position.set(0, 0.1, 4.1); w.add(rig.muzzleR); }
  }
  // giant shoulder cannon (left) and missile block (right)
  const cn = rig.shoulderWeaponL; cn.position.set(1.4, 2.2, -0.6);
  cn.add(at(box(1.6, 1.5, 3.4, mats.armor2), 0, 0, -0.2));
  cn.add(at(cyl(0.5, 0.6, 6.0, mats.dark, 12), 0, 0.1, 4.2, Math.PI / 2, 0, 0));
  cn.add(at(cyl(0.65, 0.65, 1.0, mats.metal, 12), 0, 0.1, 7.0, Math.PI / 2, 0, 0));
  cn.add(at(box(0.6, 0.5, 1.4, mats.accent, 0.02), 0, 0.9, 0.3));
  cn.add(at(box(1.0, 1.0, 0.6, mats.metal, 0.03), 0, 0, -2.0)); cn.add(at(cyl(0.3, 0.3, 0.8, mats.dark, 8), 0, 0.1, -2.5, Math.PI / 2, 0, 0)); for (let i = 0; i < 3; i++) cn.add(at(cyl(0.62, 0.62, 0.25, mats.metal, 12), 0, 0.1, 2.2 + i * 1.4, Math.PI / 2, 0, 0)); cn.add(at(vents(1.0, 0.8, 3, mats.dark), -0.85, 0.1, 0, 0, Math.PI / 2, 0));
  rig.muzzleCannon.position.set(0, 0.1, 7.5); cn.add(rig.muzzleCannon);
  const mr = rig.shoulderWeaponR; mr.position.set(-1.4, 2.2, -0.6);
  mr.add(at(box(2.0, 1.6, 2.6, mats.armor2), 0, 0, 0));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { mr.add(at(cyl(0.17, 0.17, 0.4, mats.dark, 8), -0.66 + i * 0.44, -0.45 + j * 0.45, 1.4, Math.PI / 2, 0, 0)); const bay = grp(-0.66 + i * 0.44, -0.45 + j * 0.45, 1.6); mr.add(bay); rig.missileBays.push(bay); }
  for (const s of [-1, 1]) { const fl = makeFlame(0.3, 2.4, flame); fl.position.set(s * 2.2, -0.4, 0); fl.rotation.y = -s * Math.PI / 2; rig.addThruster(pv, fl, 'side', new THREE.Vector3(-s, 0, 0), 1); }
  addLeg(rig, 1, mats, true, flame); addLeg(rig, -1, mats, true, flame);
  rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) rig.meshes.push(o as THREE.Mesh); });
  rig.bake();
  return rig;
}

/** Light aerial drone — no legs; a hovering weapons platform with a forward gun cluster and vectoring nozzles. */
export function buildDrone(palette: MechPalette = DRONE_PALETTE): MechRig {
  const mats = makeMechMats(palette);
  const rig = new MechRig(mats);
  const flame = thrusterMaterial(palette.glow, 0xfff0d0);
  rig.hipHeight = 0; rig.height = 4;
  const pv = rig.pelvis; pv.position.y = 0;
  const to = rig.torso;
  to.add(at(box(2.6, 1.2, 3.4, mats.armor), 0, 0, 0));
  to.add(at(box(1.6, 0.7, 1.6, mats.armor2), 0, 0.85, -0.3));
  to.add(at(box(0.9, 0.3, 0.3, mats.sensor, 0.01), 0, 0.15, 1.8));
  to.add(at(box(0.6, 0.25, 0.9, mats.glow, 0.01), 0, 0.9, -1.2));
  to.add(at(vents(1.2, 0.6, 3, mats.dark), 0, 0.2, -1.72)); to.add(at(box(0.6, 0.5, 0.6, mats.joint, 0.02), 0, -0.75, -0.6)); to.add(at(cyl(0.05, 0.05, 1.4, mats.metal, 6), -0.6, 1.4, -0.4)); to.add(at(box(1.2, 0.3, 0.8, mats.armor2, 0.03), 0, -0.7, 0.8));
  for (const s of [-1, 1]) {
    to.add(at(box(0.5, 0.5, 2.2, mats.armor2, 0.03), s * 1.7, -0.1, 0.2)); to.add(at(box(0.3, 0.2, 1.0, mats.accent, 0.01), s * 2.6, 0.32, -0.6, 0, 0, s * 0.35)); to.add(at(piston(0.9, mats.metal, mats.joint), s * 1.2, 0.1, -0.9, 0.9, 0, 0));
    to.add(at(box(2.2, 0.25, 1.0, mats.armor, 0.02), s * 2.2, 0.2, -0.6, 0, 0, s * 0.35)); // wing
    to.add(at(cyl(0.09, 0.09, 1.6, mats.metal, 6), s * 1.7, -0.1, 1.9, Math.PI / 2, 0, 0)); // guns
    to.add(at(cyl(0.35, 0.45, 0.8, mats.exhaust, 10), s * 0.7, -0.2, -1.9, Math.PI / 2, 0, 0));
    const fl = makeFlame(0.36, 3.0, flame); fl.position.set(s * 0.7, -0.2, -2.3); fl.rotation.y = Math.PI; rig.addThruster(to, fl, 'rear', new THREE.Vector3(0, 0, -1), 1);
    const fu = makeFlame(0.25, 1.6, flame); fu.position.set(s * 1.6, -0.4, 0.3); fu.rotation.x = Math.PI / 2; rig.addThruster(to, fu, 'up', new THREE.Vector3(0, -1, 0), 1);
  }
  rig.muzzleR.position.set(-1.7, -0.1, 2.7); to.add(rig.muzzleR);
  rig.muzzleCannon.position.set(1.7, -0.1, 2.7); to.add(rig.muzzleCannon);
  rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) rig.meshes.push(o as THREE.Mesh); });
  rig.bake();
  return rig;
}
export { grp };
