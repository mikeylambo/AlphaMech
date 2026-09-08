import * as THREE from 'three';
import { Hostile } from './Types';

/**
 * GDD §5.5 — soft assist by default; hard lock frames both fighters.
 * "Lock simplifies orientation, never positioning." Nothing in here touches the player's
 * velocity or position; it only decides where the camera and the weapons point.
 */
export class LockSystem {
  /** Split Lock raises this to 2. */
  capacity = 1;
  targets: Hostile[] = [];
  hard = false;

  get primary(): Hostile | null { return this.targets.find((t) => t.alive) ?? null; }
  get all(): Hostile[] { return this.targets.filter((t) => t.alive); }

  prune() { this.targets = this.targets.filter((t) => t.alive); }

  /** Soft assist: the hostile nearest the aim ray, with a mild distance penalty. */
  static best(hostiles: Hostile[], from: THREE.Vector3, forward: THREE.Vector3, exclude: Hostile[] = []): Hostile | null {
    let best: Hostile | null = null, bestScore = -2;
    for (const h of hostiles) {
      if (!h.alive || exclude.includes(h)) continue;
      const d = h.pos.clone().sub(from);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.001) continue;
      d.divideScalar(dist);
      const s = d.dot(forward) - dist / 2400;
      if (s > bestScore) { bestScore = s; best = h; }
    }
    return best;
  }

  toggleHard(hostiles: Hostile[], from: THREE.Vector3, forward: THREE.Vector3): boolean {
    if (this.hard) { this.hard = false; this.targets = []; return false; }
    this.acquire(hostiles, from, forward);
    this.hard = this.targets.length > 0;
    return this.hard;
  }

  acquire(hostiles: Hostile[], from: THREE.Vector3, forward: THREE.Vector3) {
    this.targets = [];
    for (let i = 0; i < this.capacity; i++) {
      const t = LockSystem.best(hostiles, from, forward, this.targets);
      if (!t) break;
      this.targets.push(t);
    }
  }

  cycle(hostiles: Hostile[], dir: number) {
    const alive = hostiles.filter((h) => h.alive);
    if (!alive.length) { this.targets = []; return; }
    const cur = this.primary;
    const i = cur ? alive.indexOf(cur) : -1;
    const next = alive[((i < 0 ? 0 : i + dir) + alive.length * 2) % alive.length];
    this.targets = [next];
    if (this.capacity > 1) {
      const second = LockSystem.best(alive, next.pos, new THREE.Vector3(0, 0, 1), [next]);
      if (second) this.targets.push(second);
    }
    this.hard = true;
  }

  /** Chain Read: killing a locked hostile locks the nearest within range. */
  chainTo(hostiles: Hostile[], from: THREE.Vector3, range: number): Hostile | null {
    let best: Hostile | null = null, bestD = range;
    for (const h of hostiles) {
      if (!h.alive) continue;
      const d = h.pos.distanceTo(from);
      if (d < bestD) { bestD = d; best = h; }
    }
    if (best) { this.targets = [best]; this.hard = true; }
    return best;
  }

  /** Split Lock alternates rifle uptime, so each target receives 50%. */
  private alt = 0;
  nextFireTarget(): Hostile | null {
    const live = this.all;
    if (!live.length) return null;
    const t = live[this.alt % live.length];
    this.alt++;
    return t;
  }
}
