import * as THREE from 'three';
import { T } from '../core/Tuning';
import { clamp01, damp } from '../core/MathUtil';
import { Effects } from '../fx/Effects';
import { Hostile } from './Types';
import { EVOLUTION_VALUES } from '../build/Weapons';
import { UPGRADE_VALUES } from '../build/Upgrades';
import { MINE } from '../enemies/Archetypes';

/**
 * Everything that exists between a weapon and its target: bolts, missiles, mines, energy cores,
 * mirror clones and orbiting interceptors.
 *
 * Hostile fire travels rather than hitscanning. That is what makes ORBITING INTERCEPTORS a real
 * spatial upgrade instead of a stat, and what lets a fast pilot physically outrun a volley.
 */
export interface Bolt {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  impact: number;
  hostile: boolean;
  colour: number;
  radius: number;
  homing: number;          // 0 = dumb, >0 = turn rate (rad/s)
  target: Hostile | null;
  aim: THREE.Vector3 | null;
  source: Hostile | null;
  attack: string;
  gravity: number;
  mesh: THREE.Mesh;
  interceptable: boolean;
}

export interface MineEntity {
  pos: THREE.Vector3;
  arm: number;
  life: number;
  trigger: number;
  damage: number;
  impact: number;
  hostile: boolean;
  mesh: THREE.Object3D;
}

export interface CoreEntity {
  pos: THREE.Vector3;
  life: number;
  energy: number;
  mesh: THREE.Object3D;
}

export interface CloneEntity {
  pos: THREE.Vector3;
  yaw: number;
  life: number;
  fireT: number;
  rig: THREE.Object3D;
  damageScale: number;
}

export interface OrdnanceHooks {
  onPlayerHit(damage: number, impact: number, from: Hostile | null, attack: string): void;
  onHostileHit(h: Hostile, damage: number, impact: number, source: 'missile' | 'clone' | 'upgrade'): void;
  onCorePickup(energy: number): void;
  playerPos(): THREE.Vector3;
  hostiles(): Hostile[];
  groundAt(x: number, z: number): number;
}

export class Ordnance {
  bolts: Bolt[] = [];
  mines: MineEntity[] = [];
  cores: CoreEntity[] = [];
  clones: CloneEntity[] = [];
  /** Orbiting Interceptors: live count and the rebuild timer. */
  interceptors = 0;
  interceptorsMax = 0;
  private interceptorRebuild = 0;
  private interceptorMeshes: THREE.Mesh[] = [];
  private interceptorGroup = new THREE.Group();
  private boltGeo = new THREE.SphereGeometry(1, 8, 6);
  private orbitT = 0;

  constructor(private scene: THREE.Scene, private fx: Effects, private hooks: OrdnanceHooks) {
    scene.add(this.interceptorGroup);
  }

  // ------------------------------------------------------------------ spawning
  spawnBolt(o: Partial<Bolt> & { pos: THREE.Vector3; vel: THREE.Vector3; damage: number; impact: number; hostile: boolean; colour: number }): Bolt {
    const mat = new THREE.MeshBasicMaterial({ color: o.colour, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this.boltGeo, mat);
    mesh.scale.set(0.9, 0.9, 2.6);
    this.scene.add(mesh);
    const b: Bolt = {
      pos: o.pos.clone(), vel: o.vel.clone(), life: o.life ?? 4, damage: o.damage, impact: o.impact,
      hostile: o.hostile, colour: o.colour, radius: o.radius ?? 4, homing: o.homing ?? 0,
      target: o.target ?? null, aim: o.aim ? o.aim.clone() : null, source: o.source ?? null,
      attack: o.attack ?? 'bolt', gravity: o.gravity ?? 0, mesh, interceptable: o.interceptable ?? true,
    };
    this.bolts.push(b);
    return b;
  }

  /** Player missile rack: soft-homing, 140 dmg / 90 impact each. */
  spawnMissile(from: THREE.Vector3, dir: THREE.Vector3, target: Hostile | null, colour: number, damage = T.missileDamage, impact = T.missileImpact) {
    const b = this.spawnBolt({
      pos: from, vel: dir.clone().normalize().multiplyScalar(T.missileSpeed * 0.55), damage, impact,
      hostile: false, colour, radius: 5.5, homing: T.missileTurn, target, life: T.missileLife, attack: 'missile', interceptable: false,
    });
    b.mesh.scale.set(1.1, 1.1, 3.4);
    return b;
  }

  spawnMine(pos: THREE.Vector3, damage: number, impact: number, colour: number, hostile: boolean) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.7 }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(body, core);
    g.position.copy(pos);
    this.scene.add(g);
    this.mines.push({ pos: pos.clone(), arm: MINE.armTime, life: MINE.life, trigger: MINE.trigger, damage, impact, hostile, mesh: g });
  }

  /** Reactor Bleed: a staggered target drops a 40 EN core that persists 8.0s. */
  spawnCore(pos: THREE.Vector3) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), new THREE.MeshBasicMaterial({ color: 0x6fe0ff, wireframe: true, transparent: true, opacity: 0.9 }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshBasicMaterial({ color: 0xd8fbff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(shell, core);
    g.position.copy(pos).setY(this.hooks.groundAt(pos.x, pos.z) + 3);
    this.scene.add(g);
    this.cores.push({ pos: g.position.clone(), life: UPGRADE_VALUES.reactorBleedLife, energy: UPGRADE_VALUES.reactorBleedEnergy, mesh: g });
  }

  /** MIRROR CHASSIS / MIRRORWORK: the frame you left behind keeps shooting. */
  spawnClone(rigSource: THREE.Object3D, pos: THREE.Vector3, yaw: number, duration: number, damageScale: number, colour: number) {
    // one at a time
    for (const c of this.clones) { this.scene.remove(c.rig); }
    this.clones.length = 0;
    const rig = rigSource.clone(true);
    rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
    });
    rig.position.copy(pos);
    rig.rotation.y = yaw;
    this.scene.add(rig);
    this.clones.push({ pos: pos.clone(), yaw, life: duration, fireT: 0.25, rig, damageScale });
  }

  setInterceptors(count: number, colour: number) {
    this.interceptorsMax = count;
    for (const m of this.interceptorMeshes) { this.interceptorGroup.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.interceptorMeshes = [];
    if (count <= 0) { this.interceptors = 0; return; }
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.interceptorGroup.add(m);
      this.interceptorMeshes.push(m);
    }
    this.interceptors = count;
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number, time: number) {
    const playerPos = this.hooks.playerPos();
    const hostiles = this.hooks.hostiles();

    // ---- interceptors ----
    if (this.interceptorsMax > 0) {
      if (this.interceptors < this.interceptorsMax) {
        this.interceptorRebuild -= dt;
        if (this.interceptorRebuild <= 0) { this.interceptors++; this.interceptorRebuild = EVOLUTION_VALUES.interceptorRebuild; }
      }
      this.orbitT += dt * 1.6;
      this.interceptorGroup.position.copy(playerPos).setY(playerPos.y + 8);
      for (let i = 0; i < this.interceptorMeshes.length; i++) {
        const live = i < this.interceptors;
        const m = this.interceptorMeshes[i];
        m.visible = live;
        const a = this.orbitT + (i / Math.max(1, this.interceptorMeshes.length)) * Math.PI * 2;
        const r = EVOLUTION_VALUES.interceptorOrbit;
        m.position.set(Math.cos(a) * r, Math.sin(a * 1.7) * 2.2, Math.sin(a) * r);
        m.rotation.set(this.orbitT, this.orbitT * 0.7, 0);
      }
    }

    // ---- bolts ----
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.homing > 0) {
        const aimAt = b.target && b.target.alive ? b.target.pos.clone().setY(b.target.pos.y + 6) : b.aim;
        if (aimAt) {
          const want = aimAt.clone().sub(b.pos).normalize();
          const speed = Math.min(T.missileSpeed, b.vel.length() + 220 * dt);
          const cur = b.vel.clone().normalize();
          cur.lerp(want, clamp01(b.homing * dt));
          b.vel.copy(cur.normalize().multiplyScalar(speed));
        }
      }
      if (b.gravity) b.vel.y -= b.gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.mesh.lookAt(b.pos.clone().add(b.vel));
      if (!b.hostile && b.homing > 0 && Math.random() < 0.6) this.fx.vfx.smokeTrail(b.pos, 0.9);

      let consumed = false;
      const ground = this.hooks.groundAt(b.pos.x, b.pos.z);

      if (b.hostile) {
        // interceptors destroy incoming projectiles within 25m
        if (b.interceptable && this.interceptors > 0 && b.pos.distanceTo(playerPos) < EVOLUTION_VALUES.interceptorRadius) {
          this.interceptors--;
          if (this.interceptorRebuild <= 0) this.interceptorRebuild = EVOLUTION_VALUES.interceptorRebuild;
          this.fx.impact(b.pos, 0x8ff4ff, 2, 8);
          consumed = true;
        } else if (b.pos.distanceTo(playerPos.clone().setY(playerPos.y + 7)) < b.radius + 4) {
          this.hooks.onPlayerHit(b.damage, b.impact, b.source, b.attack);
          this.fx.impact(b.pos, b.colour, 2.6, 8);
          consumed = true;
        }
      } else {
        for (const h of hostiles) {
          if (!h.alive) continue;
          if (b.pos.distanceTo(h.pos.clone().setY(h.pos.y + 6)) < b.radius + 5) {
            this.hooks.onHostileHit(h, b.damage, b.impact, b.attack === 'missile' ? 'missile' : 'clone');
            this.fx.impact(b.pos, b.colour, 2.4, 8);
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && b.pos.y <= ground + 0.5) {
        this.fx.impact(b.pos.clone().setY(ground + 0.6), b.colour, 2, 6);
        consumed = true;
      }
      if (consumed || b.life <= 0) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.bolts[i] = this.bolts[this.bolts.length - 1];
        this.bolts.pop();
      }
    }

    // ---- mines ----
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.arm = Math.max(0, m.arm - dt);
      m.life -= dt;
      const armed = m.arm <= 0;
      const core = m.mesh.children[1] as THREE.Mesh;
      if (core) {
        const pulse = armed ? 0.55 + Math.sin(time * 12) * 0.45 : 0.2;
        (core.material as THREE.MeshBasicMaterial).opacity = pulse;
        core.scale.setScalar(armed ? 1 + Math.sin(time * 12) * 0.18 : 0.7);
      }
      m.mesh.rotation.y += dt * 1.2;
      let triggered = false;
      if (armed) {
        if (m.hostile) {
          if (playerPos.distanceTo(m.pos) < m.trigger) triggered = true;
        } else {
          for (const h of hostiles) if (h.alive && h.pos.distanceTo(m.pos) < m.trigger) { triggered = true; this.hooks.onHostileHit(h, m.damage, m.impact, 'upgrade'); }
        }
      }
      if (triggered) {
        this.fx.impact(m.pos, m.hostile ? 0xd08aff : 0x8ff4ff, 4.5, 18);
        this.fx.ring(m.pos, 2, m.trigger, m.hostile ? 0xd08aff : 0x8ff4ff, 0.4);
        if (m.hostile) this.hooks.onPlayerHit(m.damage, m.impact, null, 'mine-drop');
      }
      if (triggered || m.life <= 0) {
        this.scene.remove(m.mesh);
        this.mines[i] = this.mines[this.mines.length - 1];
        this.mines.pop();
      }
    }

    // ---- energy cores ----
    for (let i = this.cores.length - 1; i >= 0; i--) {
      const c = this.cores[i];
      c.life -= dt;
      c.mesh.rotation.y += dt * 1.9;
      c.mesh.position.y = c.pos.y + Math.sin(time * 2.4) * 0.7;
      const near = playerPos.distanceTo(c.pos) < UPGRADE_VALUES.reactorBleedPickupRadius;
      if (near) {
        this.hooks.onCorePickup(c.energy);
        this.fx.impact(c.pos, 0x8ff4ff, 2.4, 10);
      }
      if (near || c.life <= 0) {
        this.scene.remove(c.mesh);
        this.cores[i] = this.cores[this.cores.length - 1];
        this.cores.pop();
      }
    }

    // ---- mirror clones ----
    for (let i = this.clones.length - 1; i >= 0; i--) {
      const c = this.clones[i];
      c.life -= dt;
      c.fireT -= dt;
      const alpha = clamp01(c.life / 0.5) * 0.34;
      c.rig.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) (m.material as THREE.MeshBasicMaterial).opacity = alpha; });
      const target = pickNearest(hostiles, c.pos);
      if (target) {
        c.yaw = damp(c.yaw, Math.atan2(target.pos.x - c.pos.x, target.pos.z - c.pos.z) + Math.PI, 8, dt);
        c.rig.rotation.y = c.yaw;
        if (c.fireT <= 0) {
          c.fireT = T.rifleRate * 2;
          const from = c.pos.clone().setY(c.pos.y + 9);
          const to = target.pos.clone().setY(target.pos.y + 7);
          this.fx.tracer(from, to, 0x8ff4ff, 0.6);
          this.hooks.onHostileHit(target, T.rifleDamage * c.damageScale, T.rifleImpact * c.damageScale, 'clone');
        }
      }
      if (c.life <= 0) {
        this.scene.remove(c.rig);
        this.clones[i] = this.clones[this.clones.length - 1];
        this.clones.pop();
      }
    }
  }

  clear() {
    for (const b of this.bolts) this.scene.remove(b.mesh);
    for (const m of this.mines) this.scene.remove(m.mesh);
    for (const c of this.cores) this.scene.remove(c.mesh);
    for (const c of this.clones) this.scene.remove(c.rig);
    this.bolts.length = 0; this.mines.length = 0; this.cores.length = 0; this.clones.length = 0;
  }

  get entityCount() { return this.bolts.length + this.mines.length + this.cores.length + this.clones.length; }
}

function pickNearest(hostiles: Hostile[], from: THREE.Vector3): Hostile | null {
  let best: Hostile | null = null, bd = 1e9;
  for (const h of hostiles) {
    if (!h.alive) continue;
    const d = h.pos.distanceTo(from);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
