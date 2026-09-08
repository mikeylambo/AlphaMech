import * as THREE from 'three';
import { RNG } from '../core/RNG';
import { Rng, clamp, clamp01, smooth } from '../core/MathUtil';
import { Batch, Cover, boxGeo, cylGeo, corridorDressing, kitMaterials, scatterCover, skylinePillars, KitMaterials } from './Kit';
import { ChainSpec, TissueId } from '../director/Chains';
import { ENCOUNTERS, EncounterId } from '../director/Encounters';
import { SECTOR_LOOKS } from './Sector';

/**
 * The chain as one continuous piece of world.
 *
 * Every encounter volume, every stretch of connective tissue and the FORGE bay are generated
 * up front from RNG.stream('layout') and added to the scene before the chain begins. That is
 * what makes "no loading break at any transition" true rather than hidden: there is nothing to
 * load at a transition, because the next volume was always already there.
 *
 * You leave an encounter by launching out of it. A closed gate at a volume's exit opens the
 * moment its encounter resolves.
 */
export type VolumeKind = 'arena' | 'corridor' | 'shaft' | 'link' | 'forge' | 'boss';

export interface Volume {
  index: number;
  kind: VolumeKind;
  /** For encounter volumes, the state being played here. */
  state: EncounterId | null;
  tissue: TissueId | null;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  radius: number;
  halfWidth: number;
  group: THREE.Group;
  cover: Cover[];
  /** Index into `nodes`, or -1 for connective tissue. */
  node: number;
  /** Which chain this volume belongs to. */
  chain: number;
  label: string;
}

export interface Gate {
  volume: Volume;
  z: number;
  mesh: THREE.Mesh;
  open: boolean;
}

export type HazardKind = 'sweeper' | 'pulse';
export interface Hazard {
  kind: HazardKind;
  pos: THREE.Vector3;
  phase: number;
  period: number;
  radius: number;
  damage: number;
  impact: number;
  group: THREE.Group;
  armed: boolean;
  /** Seconds until this hazard may hit again. Without it a sweeper drains a full bar in four seconds. */
  cd: number;
}

const ARENA_RADIUS = 330;
const CORRIDOR_HALF = 150;
const SHAFT_RADIUS = 250;
const LINK_HALF = 140;
const COVER_MAX_HEIGHT = 17;   // silhouette contract: nothing occludes the horizon in a fight

/**
 * ONE SECTOR of the descent.
 *
 * A sector owns its own scene graph, volumes, gates and hazards, and knows the z/y it starts
 * at. Sectors are laid end to end, so the player's z is global and a sector simply answers for
 * the span it covers. Nothing here knows about any other sector — the manager below does.
 */
export class Sector {
  root = new THREE.Group();
  volumes: Volume[] = [];
  gates: Gate[] = [];
  hazards: Hazard[] = [];
  /** Encounter volumes in play order. */
  nodes: Volume[] = [];
  forges: Volume[] = [];
  boss: Volume | null = null;
  /** True once the incremental builder has finished. */
  ready = false;
  private mats: KitMaterials;
  private rng!: Rng;
  private index = 0;
  private cursorZ = 0;
  private cursorY = 0;

  constructor(private scene: THREE.Scene, public sectorIndex: number, public zOrigin: number, public yOrigin: number) {
    this.mats = kitMaterials();
    this.cursorZ = zOrigin;
    this.cursorY = yOrigin;
    scene.add(this.root);
  }

  get z0() { return this.zOrigin; }
  get z1() { return this.volumes.length ? this.volumes[this.volumes.length - 1].z1 : this.zOrigin; }
  get yEnd() { return this.volumes.length ? this.volumes[this.volumes.length - 1].y1 : this.yOrigin; }
  contains(z: number) { return z >= this.z0 && z < this.z1; }

  /**
   * Retire the sector: every geometry and every material this sector created is released.
   * Shared kit materials are module-cached and deliberately survive — they are the same six
   * materials every sector draws with.
   */
  dispose() {
    const shared = new Set<THREE.Material>(Object.values(this.mats));
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((x) => { if (!shared.has(x)) x.dispose(); });
      else if (mat && !shared.has(mat)) mat.dispose();
    });
    this.root.clear();
    this.scene.remove(this.root);
    this.volumes = []; this.gates = []; this.hazards = []; this.nodes = []; this.forges = []; this.boss = null;
    this.ready = false;
  }

  /**
   * Incremental builder. Yields after each volume so the manager can spend a few milliseconds
   * per frame building the NEXT sector while the current one is being played — the whole point
   * of the lifecycle change, since four sectors resident at once is a memory monument.
   *
   * Slicing does not affect determinism: this is the only consumer of RNG.stream('layout'),
   * and it draws in the same order however the work is spread across frames.
   */
  *buildSteps(chains: ChainSpec[], opts: { trailingLink: boolean }): Generator<number, void, void> {
    this.rng = RNG.stream('layout');
    this.index = 0;
    this.cursorZ = this.zOrigin;
    this.cursorY = this.yOrigin;

    const link = (tissue: TissueId) => {
      const v = this.pushVolume(this.index++, 'link', null, tissue, this.cursorZ, this.cursorY, -1);
      this.cursorZ = v.z1; this.cursorY = v.y1;
      return v;
    };

    for (let ci = 0; ci < chains.length; ci++) {
      const chain = chains[ci];
      for (let i = 0; i < chain.sequence.length; i++) {
        const state = chain.sequence[i];
        const spec = ENCOUNTERS[state];
        const vol = this.pushVolume(this.index++, spec.volume === 'arena' ? 'arena' : spec.volume === 'corridor' ? 'corridor' : 'shaft', state, null, this.cursorZ, this.cursorY, this.nodes.length);
        vol.chain = ci;
        this.nodes.push(vol);
        this.cursorZ = vol.z1; this.cursorY = vol.y1;
        yield 1;
        if (i < chain.sequence.length - 1) { link(chain.tissue[i] ?? 'CONDUIT'); yield 1; }
      }
      // every chain ends at a decision point
      link(ci === chains.length - 1 ? 'OPEN FALL' : 'CONDUIT');
      yield 1;
      const forge = this.pushVolume(this.index++, 'forge', null, null, this.cursorZ, this.cursorY, -1);
      forge.chain = ci;
      this.forges.push(forge);
      this.cursorZ = forge.z1; this.cursorY = forge.y1;
      yield 1;
      link('OPEN FALL');
      yield 1;
    }

    const boss = this.pushVolume(this.index++, 'boss', null, null, this.cursorZ, this.cursorY, -1);
    this.boss = boss;
    this.cursorZ = boss.z1; this.cursorY = boss.y1;
    yield 1;

    // a sector that is not the last one exits into connective tissue, so the boundary is a
    // playable connective rather than a cut
    if (opts.trailingLink) { this.addGate(boss); link('OPEN FALL'); yield 1; }

    for (const n of this.nodes) this.addGate(n);
    for (const f of this.forges) this.addGate(f);
    this.ready = true;
  }

  /** Build to completion immediately. Used for the first sector, which must exist now. */
  buildNow(chains: ChainSpec[], opts: { trailingLink: boolean }) {
    for (const _ of this.buildSteps(chains, opts)) void _;
  }

  // ------------------------------------------------------------------ construction
  private pushVolume(index: number, kind: VolumeKind, state: EncounterId | null, tissue: TissueId | null, z0: number, y0: number, node: number): Volume {
    const rng = this.rng;
    let length: number, drop: number, radius: number, halfWidth: number;
    switch (kind) {
      case 'arena': length = ARENA_RADIUS * 2; drop = 0; radius = ARENA_RADIUS; halfWidth = ARENA_RADIUS; break;
      case 'corridor': length = 1600; drop = 70; radius = 0; halfWidth = CORRIDOR_HALF; break;
      case 'shaft': length = SHAFT_RADIUS * 2; drop = 0; radius = SHAFT_RADIUS; halfWidth = SHAFT_RADIUS; break;
      case 'forge': length = 420; drop = 0; radius = 200; halfWidth = 200; break;
      case 'boss': length = 760; drop = 0; radius = 380; halfWidth = 380; break;
      default:
        // connective tissue
        if (tissue === 'OPEN FALL') { length = 300; drop = 230; halfWidth = 210; radius = 0; }
        else { length = 900; drop = 40; halfWidth = LINK_HALF; radius = 0; }
        break;
    }
    const vol: Volume = {
      index, kind, state, tissue,
      z0, z1: z0 + length, y0, y1: y0 - drop,
      radius, halfWidth, group: new THREE.Group(), cover: [], node, chain: -1,
      label: state ?? (tissue ?? kind.toUpperCase()),
    };
    this.volumes.push(vol);
    this.root.add(vol.group);
    this.buildGeometry(vol, rng);
    return vol;
  }

  private buildGeometry(v: Volume, rng: Rng) {
    const b = new Batch();
    const m = this.mats;
    const cz = (v.z0 + v.z1) / 2;

    switch (v.kind) {
      case 'arena': {
        this.floorDisc(v, v.radius + 160, m.concrete);
        v.cover = scatterCover(b, m, rng, { count: 22, inner: 80, outer: v.radius - 60, maxHeight: COVER_MAX_HEIGHT, centerZ: cz, floorAt: () => v.y0 });
        skylinePillars(b, m, rng, { count: 34, inner: v.radius + 150, outer: v.radius + 900, centerZ: cz, baseY: v.y0 });
        this.boundaryRing(v, cz);
        break;
      }
      case 'shaft': {
        this.floorDisc(v, v.radius + 120, m.concrete);
        v.cover = scatterCover(b, m, rng, { count: 10, inner: 70, outer: v.radius - 80, maxHeight: COVER_MAX_HEIGHT, centerZ: cz, floorAt: () => v.y0 });
        // vertical structure: towers you can fight around at altitude
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + rng.range(-0.2, 0.2);
          const d = rng.range(v.radius * 0.45, v.radius * 0.95);
          const h = rng.range(120, 260);
          const w = rng.range(16, 34);
          const x = Math.cos(a) * d, z = cz + Math.sin(a) * d;
          b.add(boxGeo(w, h, w, 12).translate(x, v.y0 + h / 2, z), i % 2 ? m.concrete : m.panel);
          b.add(boxGeo(w * 1.5, 3, w * 1.5, 8).translate(x, v.y0 + h, z), m.rust);
          b.add(boxGeo(w * 0.4, 0.8, 0.5, 4).translate(x, v.y0 + h * 0.7, z + w / 2), m.glow);
        }
        // floating platforms — altitude is the axis
        for (let i = 0; i < 9; i++) {
          const a = rng.range(0, Math.PI * 2);
          const d = rng.range(60, v.radius * 0.8);
          const h = rng.range(48, 170);
          b.add(boxGeo(rng.range(30, 62), 4, rng.range(30, 62), 10).translate(Math.cos(a) * d, v.y0 + h, cz + Math.sin(a) * d), m.panel);
        }
        skylinePillars(b, m, rng, { count: 26, inner: v.radius + 140, outer: v.radius + 800, centerZ: cz, baseY: v.y0 });
        this.boundaryRing(v, cz);
        break;
      }
      case 'corridor': {
        this.floorStrip(v, v.halfWidth + 90, m.deck);
        const floorAt = (_x: number, z: number) => this.rampY(v, clamp01((z - v.z0) / (v.z1 - v.z0)));
        v.cover = scatterCover(b, m, rng, { count: 20, inner: 140, outer: (v.z1 - v.z0) - 140, maxHeight: COVER_MAX_HEIGHT, lateral: v.halfWidth - 40, centerZ: v.z0, floorAt });
        corridorDressing(b, m, rng, { z0: v.z0 + 60, z1: v.z1 - 60, halfWidth: v.halfWidth, floorAt });
        skylinePillars(b, m, rng, { count: 22, inner: v.halfWidth + 220, outer: v.halfWidth + 900, centerZ: cz, baseY: (v.y0 + v.y1) / 2 });
        if (v.state === 'TRAVERSAL') this.buildHazards(v, rng);
        break;
      }
      case 'link': {
        if (v.tissue === 'OPEN FALL') {
          // vertical descent through open structure: staggered platforms and open sides
          this.floorStrip(v, v.halfWidth + 70, m.deck);
          for (let i = 0; i < 14; i++) {
            const t = rng.next();
            const z = v.z0 + t * (v.z1 - v.z0);
            const yTop = v.y0 - (v.y0 - v.y1) * smooth(t) + rng.range(20, 120);
            const x = rng.range(-v.halfWidth * 0.85, v.halfWidth * 0.85);
            b.add(boxGeo(rng.range(28, 70), 4, rng.range(24, 60), 10).translate(x, yTop, z), m.panel);
            b.add(boxGeo(6, 3, 6, 4).translate(x, yTop + 3, z), m.warn);
          }
          for (const s of [-1, 1]) {
            for (let i = 0; i < 8; i++) {
              const t = i / 8;
              const z = v.z0 + t * (v.z1 - v.z0);
              const yy = v.y0 - (v.y0 - v.y1) * smooth(t);
              b.add(boxGeo(28, 220, 40, 16).translate(s * (v.halfWidth + 20), yy + 60, z), m.concrete);
              b.add(boxGeo(2, 1.2, 34, 6).translate(s * (v.halfWidth + 4), yy + 12, z), m.glow);
            }
          }
        } else {
          this.floorStrip(v, v.halfWidth + 70, m.deck);
          corridorDressing(b, m, rng, { z0: v.z0 + 40, z1: v.z1 - 40, halfWidth: v.halfWidth, floorAt: (_x, z) => this.rampY(v, clamp01((z - v.z0) / (v.z1 - v.z0))) });
        }
        break;
      }
      case 'forge': {
        this.buildForgeBay(v, b, m);
        break;
      }
      case 'boss': {
        this.floorDisc(v, v.radius + 200, m.concrete);
        v.cover = scatterCover(b, m, rng, { count: 12, inner: 120, outer: v.radius - 90, maxHeight: COVER_MAX_HEIGHT, centerZ: cz, floorAt: () => v.y0 });
        // a ring of severed structure — the arena reads as a break in the megastructure
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          const h = 90 + Math.sin(i * 2.3) * 60;
          const x = Math.cos(a) * (v.radius + 60), z = cz + Math.sin(a) * (v.radius + 60);
          b.add(boxGeo(46, h, 46, 16).translate(x, v.y0 + h / 2, z), i % 3 ? m.concrete : m.panel);
          b.add(boxGeo(50, 2, 50, 8).translate(x, v.y0 + h, z), m.rust);
        }
        skylinePillars(b, m, rng, { count: 30, inner: v.radius + 300, outer: v.radius + 1100, centerZ: cz, baseY: v.y0 });
        this.boundaryRing(v, cz);
        break;
      }
    }
    b.bake(v.group);
  }

  private floorDisc(v: Volume, radius: number, mat: THREE.Material) {
    const cz = (v.z0 + v.z1) / 2;
    const g = new THREE.CircleGeometry(radius, 84);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * radius / 9, uv.getY(i) * radius / 9);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(0, v.y0, cz);
    mesh.receiveShadow = true;
    v.group.add(mesh);
  }

  private floorStrip(v: Volume, halfWidth: number, mat: THREE.Material) {
    const len = v.z1 - v.z0;
    const seg = Math.max(2, Math.round(len / 60));
    const g = new THREE.PlaneGeometry(halfWidth * 2, len, 2, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    // after rotateX(-90°) the strip runs along local Z; lift each row onto the volume's ramp
    for (let i = 0; i < pos.count; i++) {
      const t = clamp01((pos.getZ(i) + len / 2) / len);
      pos.setY(i, this.rampY(v, t) - v.y0);
      uv.setXY(i, uv.getX(i) * halfWidth * 2 / 9, uv.getY(i) * len / 9);
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(0, v.y0, (v.z0 + v.z1) / 2);
    mesh.receiveShadow = true;
    v.group.add(mesh);
  }

  private boundaryRing(v: Volume, cz: number) {
    const g = new THREE.TorusGeometry(v.radius, 1.3, 6, 128);
    g.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.set(0, v.y0 + 0.9, cz);
    v.group.add(mesh);
  }

  /** A FORGE is a hangar you boost into and land in. Enclosed, lit, and quiet. */
  private buildForgeBay(v: Volume, b: Batch, m: KitMaterials) {
    const cz = (v.z0 + v.z1) / 2;
    this.floorDisc(v, 210, m.panel);
    const h = 120;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = Math.cos(a) * 190, z = cz + Math.sin(a) * 190;
      b.add(boxGeo(56, h, 26, 12).rotateY(-a).translate(x, v.y0 + h / 2, z), m.panel);
      b.add(boxGeo(52, 1.6, 2, 6).rotateY(-a).translate(x, v.y0 + 22, z + Math.sin(a) * -12), m.glow);
    }
    // roof ribs
    for (let i = 0; i < 7; i++) {
      const z = cz - 150 + i * 50;
      b.add(boxGeo(400, 7, 12, 16).translate(0, v.y0 + h, z), m.rust);
      b.add(boxGeo(360, 1.2, 3, 6).translate(0, v.y0 + h - 5, z), m.glow);
    }
    // landing pad + docking clamps
    b.add(cylGeo(46, 48, 2.4, 40, 12).translate(0, v.y0 + 1.2, cz), m.dark);
    b.add(cylGeo(40, 40, 0.6, 40, 12).translate(0, v.y0 + 2.5, cz), m.glow);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.add(boxGeo(7, 16, 7, 6).translate(Math.cos(a) * 34, v.y0 + 8, cz + Math.sin(a) * 34), m.panel);
      b.add(boxGeo(9, 3, 9, 4).translate(Math.cos(a) * 34, v.y0 + 17, cz + Math.sin(a) * 34), m.warn);
    }
  }

  /** TRAVERSAL hazards: environmental damage, no combat. Both read on the ground plane. */
  private buildHazards(v: Volume, rng: Rng) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.7) / (count + 0.4);
      const z = v.z0 + t * (v.z1 - v.z0);
      const y = this.rampY(v, t);
      const kind: HazardKind = rng.chance(0.55) ? 'sweeper' : 'pulse';
      const group = new THREE.Group();
      group.position.set(0, y, z);
      const radius = kind === 'sweeper' ? v.halfWidth * 0.92 : rng.range(38, 62);
      if (kind === 'sweeper') {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, 1.6, 3.2), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
        arm.position.y = 6;
        arm.name = 'arm';
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 14, 12), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.7 }));
        hub.position.y = 7;
        group.add(hub, arm);
      } else {
        const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.position.y = 0.4;
        ring.name = 'ring';
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.36, 5, 16), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.7, metalness: 0.5 }));
        vent.position.y = 2.4;
        group.add(vent, ring);
      }
      v.group.add(group);
      this.hazards.push({ kind, pos: group.position.clone(), phase: rng.range(0, Math.PI * 2), period: kind === 'sweeper' ? rng.range(3.0, 4.6) : rng.range(2.2, 3.2), radius, damage: 240, impact: 120, group, armed: true, cd: 0 });
    }
  }

  private addGate(v: Volume) {
    const w = (v.kind === 'arena' || v.kind === 'shaft' ? v.radius : v.halfWidth) * 2 + 60;
    const g = new THREE.PlaneGeometry(w, 150);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(0, v.y1 + 60, v.z1);
    v.group.add(mesh);
    this.gates.push({ volume: v, z: v.z1, mesh, open: false });
  }

  openGate(v: Volume) {
    const g = this.gates.find((x) => x.volume === v);
    if (g) g.open = true;
  }
  closeGate(v: Volume) {
    const g = this.gates.find((x) => x.volume === v);
    if (g) g.open = false;
  }

  // ------------------------------------------------------------------ queries
  private volumeAt(z: number): Volume {
    for (const v of this.volumes) if (z >= v.z0 && z < v.z1) return v;
    return z < this.volumes[0].z0 ? this.volumes[0] : this.volumes[this.volumes.length - 1];
  }

  private rampY(v: Volume, t: number) {
    if (v.kind === 'link' && v.tissue === 'OPEN FALL') return v.y0 - (v.y0 - v.y1) * smooth(clamp01(t));
    return v.y0 + (v.y1 - v.y0) * clamp01(t);
  }

  groundAt(x: number, z: number): number {
    const v = this.volumeAt(z);
    const t = (z - v.z0) / Math.max(1, v.z1 - v.z0);
    let y = this.rampY(v, clamp01(t));
    // cover blocks are solid floors you can skate over
    for (const c of v.cover) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < c.r * c.r) { y = Math.max(y, c.top); break; }
    }
    return y;
  }

  /**
   * Push a position back inside the current volume. Returns true if it was clamped, so hostile
   * steering can push away from a wall before it is pinned against one.
   */
  confine(pos: THREE.Vector3, margin = 0): boolean {
    const v = this.volumeAt(pos.z);
    let clamped = false;
    const cz = (v.z0 + v.z1) / 2;
    if (v.radius > 0) {
      const dx = pos.x, dz = pos.z - cz;
      const r = Math.hypot(dx, dz);
      const lim = v.radius - margin;
      if (r > lim && r > 0.001) { pos.x = (dx / r) * lim; pos.z = cz + (dz / r) * lim; clamped = true; }
    } else {
      const lim = v.halfWidth - margin;
      if (pos.x > lim) { pos.x = lim; clamped = true; }
      if (pos.x < -lim) { pos.x = -lim; clamped = true; }
    }
    // gates
    for (const g of this.gates) {
      if (g.open) continue;
      if (pos.z > g.z - 6 && pos.z < g.z + 400 && g.volume.z0 <= pos.z) { pos.z = g.z - 6; clamped = true; }
    }
    const first = this.volumes[0];
    if (pos.z < first.z0 + 6) { pos.z = first.z0 + 6; clamped = true; }
    const last = this.volumes[this.volumes.length - 1];
    if (pos.z > last.z1 - 6) { pos.z = last.z1 - 6; clamped = true; }
    return clamped;
  }

  /** Spawn ring for an encounter volume. */
  volumeCentre(v: Volume): THREE.Vector3 {
    const cz = (v.z0 + v.z1) / 2;
    return new THREE.Vector3(0, this.rampY(v, 0.5), cz);
  }

  entryPoint(v: Volume): THREE.Vector3 {
    const z = v.z0 + Math.min(120, (v.z1 - v.z0) * 0.18);
    return new THREE.Vector3(0, this.groundAt(0, z), z);
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number, time: number, target: { pos: THREE.Vector3; receiveHit: (d: number, i: number, from: null, attack: string) => void }) {
    // gates: fade open, glow closed
    for (const g of this.gates) {
      const mat = g.mesh.material as THREE.MeshBasicMaterial;
      const want = g.open ? 0 : 0.18 + Math.sin(time * 2.2) * 0.06;
      mat.opacity += (want - mat.opacity) * Math.min(1, dt * 3);
      g.mesh.visible = mat.opacity > 0.01;
    }

    // hazards
    for (const h of this.hazards) {
      h.cd = Math.max(0, h.cd - dt);
      const phase = (time / h.period + h.phase) % 1;
      if (h.kind === 'sweeper') {
        const arm = h.group.getObjectByName('arm');
        if (arm) arm.rotation.y = (time / h.period + h.phase) * Math.PI * 2;
        const a = (time / h.period + h.phase) * Math.PI * 2;
        const d = target.pos.clone().sub(h.pos);
        const planar = Math.hypot(d.x, d.z);
        if (planar < h.radius && target.pos.y < h.pos.y + 12) {
          const ang = Math.atan2(d.x, d.z);
          let diff = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          diff = Math.min(diff, Math.abs(diff - Math.PI));
          if (diff < 0.16 && h.cd <= 0) { target.receiveHit(h.damage, h.impact, null, 'sweeper'); h.cd = 1.1; }
        }
      } else {
        const ring = h.group.getObjectByName('ring') as THREE.Mesh | undefined;
        const fire = phase > 0.92;
        if (ring) {
          const mat = ring.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.18 + phase * 0.6;
          ring.scale.setScalar(0.35 + phase * 0.7);
        }
        if (fire && h.armed) {
          h.armed = false;
          const d = target.pos.clone().sub(h.pos);
          if (Math.hypot(d.x, d.z) < h.radius && target.pos.y < h.pos.y + 26) target.receiveHit(h.damage, h.impact, null, 'pulse');
        }
        if (!fire && phase < 0.5) h.armed = true;
      }
    }
  }

  /** Visibility streaming: only volumes near the player are drawn. */
  stream(playerZ: number, range = 2600): { visible: number; total: number } {
    let visible = 0;
    for (const v of this.volumes) {
      const d = playerZ < v.z0 ? v.z0 - playerZ : playerZ > v.z1 ? playerZ - v.z1 : 0;
      const on = d < range;
      v.group.visible = on;
      if (on) visible++;
    }
    return { visible, total: this.volumes.length };
  }

  get length() { return this.z1 - this.z0; }
  get sectorLook() { return SECTOR_LOOKS[Math.min(4, this.sectorIndex)] ?? SECTOR_LOOKS[1]; }
}

export { clamp };

/**
 * ============================================================================================
 * SECTOR LIFECYCLE  (v0.2 §3.4)
 *
 * The Alpha generated one ~12km sector in a single pass. Four of those concatenated is a 48km
 * memory monument, so the architecture is fixed before it becomes four sectors of debt:
 *
 *   - the UPCOMING sector is built incrementally while the current one is being played,
 *     a few milliseconds per frame, so it costs no hitch;
 *   - the PREVIOUS sector's geometry, materials and colliders are retired once the player is
 *     safely inside the new one;
 *   - NEVER more than two sectors are resident.
 *
 * Everything that must survive a boundary — RunState, the Director's pilot model, build,
 * weapon evolutions, score metrics, RNG stream cursors — lives outside this class and is
 * simply never touched here. The boundary is a playable connective, not a cut.
 * ============================================================================================
 */
export class SectorWorld {
  private sectors: Sector[] = [];
  private pending: { sector: Sector; steps: Generator<number, void, void> } | null = null;
  /** How many sectors have been generated this session — the lifecycle's headline counter. */
  buildCount = 0;
  retiredCount = 0;
  /** Milliseconds per frame the incremental builder may spend. */
  budgetMs = 3.5;

  constructor(private scene: THREE.Scene) {}

  get current(): Sector | null { return this.sectors[this.sectors.length - 1] ?? null; }
  get oldest(): Sector | null { return this.sectors[0] ?? null; }
  get residentCount() { return this.sectors.length; }
  get volumeCount() { return this.sectors.reduce((n, s) => n + s.volumes.length, 0); }
  get volumes(): Volume[] { return this.sectors.flatMap((s) => s.volumes); }
  get sectorsResident() { return this.sectors.map((s) => s.sectorIndex); }
  /** The sector the player is being asked to play right now. */
  get active(): Sector | null { return this.sectors[this.sectors.length - 1] ?? null; }

  /** Tear everything down — a new run starts from nothing resident. */
  reset() {
    for (const s of this.sectors) s.dispose();
    this.sectors = [];
    this.pending = null;
    this.buildCount = 0;
    this.retiredCount = 0;
  }

  /** Build the first sector synchronously: the player is about to stand in it. */
  beginSector(chains: ChainSpec[], sectorIndex: number, trailingLink: boolean): Sector {
    const prev = this.current;
    const zOrigin = prev ? prev.z1 : 0;
    const yOrigin = prev ? prev.yEnd : 0;
    const s = new Sector(this.scene, sectorIndex, zOrigin, yOrigin);
    s.buildNow(chains, { trailingLink });
    this.sectors.push(s);
    this.buildCount++;
    this.enforceResidency();
    return s;
  }

  /**
   * Start building the next sector in the background. Safe to call repeatedly; only the first
   * call for a given sector index does anything.
   */
  queueSector(chains: ChainSpec[], sectorIndex: number, trailingLink: boolean): boolean {
    if (this.pending) return false;
    if (this.sectors.some((s) => s.sectorIndex === sectorIndex)) return false;
    const prev = this.current;
    const s = new Sector(this.scene, sectorIndex, prev ? prev.z1 : 0, prev ? prev.yEnd : 0);
    this.pending = { sector: s, steps: s.buildSteps(chains, { trailingLink }) };
    return true;
  }

  /** Spend the frame budget on the queued sector. Called once per frame from the game loop. */
  pump(): void {
    if (!this.pending) return;
    const t0 = performance.now();
    while (performance.now() - t0 < this.budgetMs) {
      const r = this.pending.steps.next();
      if (r.done) {
        this.sectors.push(this.pending.sector);
        this.buildCount++;
        this.pending = null;
        this.enforceResidency();
        return;
      }
    }
  }

  get building() { return !!this.pending; }
  get pendingIndex() { return this.pending?.sector.sectorIndex ?? null; }

  /**
   * Retire sectors the player has left. Called with the player's z: a sector is only released
   * once the player is comfortably inside a later one, so nothing is ever disposed out from
   * under a collider query.
   */
  retirePassed(playerZ: number, margin = 200) {
    while (this.sectors.length > 1) {
      const oldest = this.sectors[0];
      if (playerZ < oldest.z1 + margin) break;
      oldest.dispose();
      this.sectors.shift();
      this.retiredCount++;
    }
  }

  /** Hard cap: never more than two resident, whatever the caller does. */
  private enforceResidency() {
    while (this.sectors.length > 2) {
      const oldest = this.sectors.shift()!;
      oldest.dispose();
      this.retiredCount++;
    }
  }

  // ------------------------------------------------------------------ routed queries
  private sectorAt(z: number): Sector | null {
    for (const s of this.sectors) if (s.contains(z)) return s;
    if (!this.sectors.length) return null;
    return z < this.sectors[0].z0 ? this.sectors[0] : this.sectors[this.sectors.length - 1];
  }

  groundAt(x: number, z: number): number {
    const s = this.sectorAt(z);
    return s ? s.groundAt(x, z) : 0;
  }

  confine(pos: THREE.Vector3, margin = 0): boolean {
    const s = this.sectorAt(pos.z);
    if (!s) return false;
    let clamped = s.confine(pos, margin);
    // the resident span is the world: never let the player walk off the end of what exists
    const first = this.sectors[0], last = this.sectors[this.sectors.length - 1];
    if (pos.z < first.z0 + 6) { pos.z = first.z0 + 6; clamped = true; }
    if (pos.z > last.z1 - 6) { pos.z = last.z1 - 6; clamped = true; }
    return clamped;
  }

  volumeCentre(v: Volume) { return (this.sectorAt((v.z0 + v.z1) / 2) ?? this.sectors[0]).volumeCentre(v); }
  entryPoint(v: Volume) { return (this.sectorAt((v.z0 + v.z1) / 2) ?? this.sectors[0]).entryPoint(v); }
  openGate(v: Volume) { for (const s of this.sectors) s.openGate(v); }
  closeGate(v: Volume) { for (const s of this.sectors) s.closeGate(v); }

  update(dt: number, time: number, target: { pos: THREE.Vector3; receiveHit: (d: number, i: number, from: null, attack: string) => void }) {
    for (const s of this.sectors) s.update(dt, time, target);
  }

  stream(playerZ: number, range = 2600): { visible: number; total: number } {
    let visible = 0, total = 0;
    for (const s of this.sectors) { const r = s.stream(playerZ, range); visible += r.visible; total += r.total; }
    return { visible, total };
  }

  /** Telemetry for the lifecycle proof. */
  snapshot() {
    return {
      resident: this.sectors.length,
      sectors: this.sectors.map((s) => ({ index: s.sectorIndex, z0: Math.round(s.z0), z1: Math.round(s.z1), volumes: s.volumes.length })),
      building: this.pendingIndex,
      built: this.buildCount,
      retired: this.retiredCount,
    };
  }
}
