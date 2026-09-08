import * as THREE from 'three';
import { MechRig, RigPose, newPose } from './MechRig';
import { clamp01, damp, wrapAngle } from '../core/MathUtil';

/**
 * Turns simulation state into a RigPose. Both the player and every hostile drive their rig
 * through this, so a hostile's lean, stride and thruster plume read from the same vocabulary the
 * player learns on their own machine.
 */
export class RigDriver {
  pose: RigPose = newPose();
  private prevVel = new THREE.Vector3();
  private groundedPrev = true;
  private landT = 0;
  blade = -1;
  recoilR = 0;
  recoilL = 0;
  cannonRecoil = 0;

  constructor(public rig: MechRig) {}

  fireRifle() { this.recoilR = 1; }
  fireShoulder() { this.cannonRecoil = 1; }
  swingBlade() { this.blade = 0; }

  update(dt: number, s: {
    pos: THREE.Vector3; vel: THREE.Vector3; yaw: number; aimYaw: number; aimPitch: number;
    grounded: boolean; maxSpeed: number; thrust01: number; thrustUp01: number; quickDir: THREE.Vector3 | null;
    stagger01: number;
  }) {
    const p = this.pose;
    const planar = Math.hypot(s.vel.x, s.vel.z);
    p.speed01 = clamp01(planar / s.maxSpeed);
    p.airborne = damp(p.airborne, s.grounded ? 0 : 1, 9, dt);

    // landing compression
    if (s.grounded && !this.groundedPrev) this.landT = 0.28;
    this.groundedPrev = s.grounded;
    this.landT = Math.max(0, this.landT - dt);
    p.crouch = this.landT / 0.28;

    // lean into acceleration
    const acc = s.vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-4));
    this.prevVel.copy(s.vel);
    const fwd = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const right = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    p.lean.z = damp(p.lean.z, clamp01(acc.dot(fwd) / 400) * 0.34 - 0.06, 6, dt);
    p.lean.x = damp(p.lean.x, Math.max(-0.3, Math.min(0.3, acc.dot(right) / 900)), 6, dt);

    p.aimYaw = wrapAngle(s.aimYaw - s.yaw);
    p.aimPitch = s.aimPitch;
    p.thrust = damp(p.thrust, s.thrust01, 14, dt);
    p.thrustUp = damp(p.thrustUp, s.thrustUp01, 14, dt);
    p.stagger = s.stagger01;

    if (s.quickDir) {
      // convert the world-space quick boost direction into the rig's local frame
      p.qb.set(s.quickDir.dot(right), 0, s.quickDir.dot(fwd));
    } else p.qb.multiplyScalar(Math.exp(-10 * dt));

    // weapon recoil and blade arc decay on their own clocks
    this.recoilR = Math.max(0, this.recoilR - dt * 7);
    this.recoilL = Math.max(0, this.recoilL - dt * 7);
    this.cannonRecoil = Math.max(0, this.cannonRecoil - dt * 4);
    p.recoilR = this.recoilR; p.recoilL = this.recoilL; p.cannonRecoil = this.cannonRecoil;
    if (this.blade >= 0) { this.blade += dt / 0.72; if (this.blade > 1) this.blade = -1; }
    p.bladeSwing = this.blade;

    this.rig.animate(p, dt);
    this.setBladeGlow(this.blade >= 0 ? Math.sin(clamp01(this.blade) * Math.PI) : 0);
  }

  private setBladeGlow(v: number) {
    this.rig.bladeBase.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.name === 'blade') (m.material as THREE.MeshBasicMaterial).opacity = v * 0.85;
      if (m.name === 'bladeCore') (m.material as THREE.MeshBasicMaterial).opacity = v;
    });
  }
}
