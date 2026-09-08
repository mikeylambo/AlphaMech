import * as THREE from 'three';
import { T } from '../core/Tuning';
import { clamp, damp, rand } from '../core/MathUtil';
import { Hostile } from './Types';

/** Height above a machine's feet that the camera frames. */
export const FOCUS_H = 7;

/**
 * Third-person chase rig. Lock frames both fighters; a Perfect Vanish hard-locks the camera onto
 * the attacker so the punish window is never off screen.
 */
export class CameraRig {
  pos = new THREE.Vector3(0, 40, 220);
  shake = 0;
  private fov = T.camFov;
  private hardLockT = 0;
  private hardLockTarget: Hostile | null = null;
  private kick = 0;

  constructor(public camera: THREE.PerspectiveCamera) {}

  /** Slam the camera onto a target for `dur` seconds — used by the vanish and by rallies. */
  hardLock(target: Hostile, dur: number) { this.hardLockTarget = target; this.hardLockT = dur; }
  punch(amount: number) { this.kick = Math.min(1.4, this.kick + amount); }
  addShake(amount: number) { this.shake = Math.min(1.4, this.shake + amount); }

  update(dt: number, p: {
    pos: THREE.Vector3; yaw: number; pitch: number; assault: boolean; locked: Hostile | null; speed: number;
  }) {
    this.hardLockT = Math.max(0, this.hardLockT - dt);
    const lock = this.hardLockT > 0 && this.hardLockTarget?.alive ? this.hardLockTarget : p.locked;

    // chest height on the procedural rig (~10.2 tall). Focusing above the head pushed the
    // machine to the bottom of frame and tilted the horizon out of view.
    const focus = p.pos.clone().setY(p.pos.y + FOCUS_H);
    let yaw = p.yaw;
    let pitch = p.pitch;

    if (lock && lock.alive) {
      const d = lock.pos.clone().sub(p.pos);
      yaw = Math.atan2(-d.x, -d.z);
      pitch = clamp(p.pitch, -0.5, 0.5);
      focus.lerp(lock.pos.clone().setY(lock.pos.y + FOCUS_H), 0.22);
    }

    // Framing both fighters moves the focus point off the player. Compensate by pushing the
    // camera back by exactly that much, so the machine keeps a constant apparent size no
    // matter how close a locked hostile gets.
    const focusShift = focus.distanceTo(p.pos.clone().setY(p.pos.y + FOCUS_H));
    const distScale = lock && lock.alive ? clamp(lock.pos.distanceTo(p.pos) / 260, 0, 0.7) : 0;
    const dist = T.camDist * (1 + distScale) + focusShift + p.speed * 0.018;
    const back = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch) + 0.34,
      Math.cos(yaw) * Math.cos(pitch),
    ).normalize();
    const want = focus.clone().addScaledVector(back, dist);
    want.y = Math.max(focus.y - 6, focus.y + T.camHeight + pitch * 16);

    const lag = T.camLag;
    this.pos.x = damp(this.pos.x, want.x, lag, dt);
    this.pos.y = damp(this.pos.y, want.y, lag, dt);
    this.pos.z = damp(this.pos.z, want.z, lag, dt);
    this.camera.position.copy(this.pos);

    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.kick = Math.max(0, this.kick - dt * 4.2);
    if (this.shake > 0) {
      this.camera.position.x += rand(-1, 1) * this.shake * 1.7;
      this.camera.position.y += rand(-1, 1) * this.shake * 1.7;
      this.camera.position.z += rand(-1, 1) * this.shake * 0.8;
    }
    this.camera.lookAt(focus);
    if (this.kick > 0) this.camera.rotateZ(this.kick * 0.03);

    const wantFov = T.camFov + (p.assault ? T.camFovBoost - T.camFov : 0) + this.kick * 5;
    this.fov = damp(this.fov, wantFov, 7, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /** Returns the camera's forward on the XZ plane, for aim-relative movement. */
  static planarForward(yaw: number) { return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); }
  static planarRight(yaw: number) { return new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); }
}
