import * as THREE from 'three';
import { particleSprite, smokeSprite } from '../core/Textures';
import { rand } from '../core/MathUtil';

/**
 * One instanced billboard particle system per blend mode. All sparks, fire, smoke, dust, flashes live here.
 * CPU-simulated (simple, cheap) with a hard cap; GPU does the billboarding.
 */
const MAX_ADD = 6000, MAX_ALPHA = 2500;

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; maxLife: number; size: number; grow: number; r: number; g: number; b: number; drag: number; gravity: number; rot: number; rotV: number; fadeIn: number; stretch: number; alpha: number }

const vert = /* glsl */`
attribute vec4 iPos;      // xyz, size
attribute vec4 iCol;      // rgb, alpha
attribute vec4 iMisc;     // rot, stretch, unused, unused
attribute vec3 iVel;      // world-space velocity (stretch direction)
varying vec2 vUv; varying vec4 vCol;
void main(){
  vUv = uv; vCol = iCol;
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  vCol.a *= smoothstep(1.5, 9.0, -mv.z);   // fade out particles that pass through the camera
  vec2 p = position.xy;
  if (iMisc.y > 1.02) {
    // stretched particle (spark/tracer): align the long axis with the on-screen direction of travel
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    float l = length(vv.xy);
    vec2 d = l > 1e-4 ? vv.xy / l : vec2(1.0, 0.0);
    // foreshorten the stretch when the velocity points toward/away from the camera
    float fore = l / max(1e-4, length(vv));
    float st = 1.0 + (iMisc.y - 1.0) * fore;
    p = d * (p.x * st) + vec2(-d.y, d.x) * (p.y * 0.45);   // thin streak
  } else {
    float c = cos(iMisc.x), s = sin(iMisc.x);
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }
  mv.xy += p * iPos.w;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */`
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a); }`;

class ParticleLayer {
  mesh: THREE.Mesh;
  parts: Particle[] = [];
  private pos: THREE.InstancedBufferAttribute; private col: THREE.InstancedBufferAttribute; private misc: THREE.InstancedBufferAttribute; private vel: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  constructor(public max: number, tex: THREE.Texture, additive: boolean) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry(); this.geo.index = base.index; this.geo.attributes.position = base.attributes.position; this.geo.attributes.uv = base.attributes.uv;
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.misc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.vel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.pos); this.geo.setAttribute('iCol', this.col); this.geo.setAttribute('iMisc', this.misc); this.geo.setAttribute('iVel', this.vel);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex } }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 20 : 10;
  }
  spawn(p: Particle) { if (!Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz + p.size)) return; if (this.parts.length >= this.max) this.parts.shift(); this.parts.push(p); }
  update(dt: number) {
    const ps = this.parts; let n = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]; p.life -= dt; if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt; p.rot += p.rotV * dt;
      ps[n++] = p;
    }
    ps.length = n;
    const pa = this.pos.array as Float32Array, ca = this.col.array as Float32Array, ma = this.misc.array as Float32Array, va = this.vel.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const p = ps[i]; const t = p.life / p.maxLife; const age = 1 - t;
      const a = Math.min(1, age / Math.max(0.001, p.fadeIn)) * Math.min(1, t * 2.2) * p.alpha;
      pa[i * 4] = p.x; pa[i * 4 + 1] = p.y; pa[i * 4 + 2] = p.z; pa[i * 4 + 3] = p.size;
      ca[i * 4] = p.r; ca[i * 4 + 1] = p.g; ca[i * 4 + 2] = p.b; ca[i * 4 + 3] = a;
      ma[i * 4] = p.rot; ma[i * 4 + 1] = p.stretch; ma[i * 4 + 2] = 0; ma[i * 4 + 3] = 0; va[i * 3] = p.vx; va[i * 3 + 1] = p.vy; va[i * 3 + 2] = p.vz;
    }
    this.geo.instanceCount = n;
    this.pos.needsUpdate = true; this.col.needsUpdate = true; this.misc.needsUpdate = true; this.vel.needsUpdate = true;
  }
}

export interface SpawnOpts { pos: THREE.Vector3; vel?: THREE.Vector3; spread?: number; speed?: number; count?: number; life?: number; size?: number; grow?: number; color?: number; color2?: number; drag?: number; gravity?: number; fadeIn?: number; stretch?: number; additive?: boolean; brightness?: number; alpha?: number }

/** Scaling shockwave ring for cannon/explosions. */
class Shockwave { mesh: THREE.Mesh; life = 0; max = 0.5; constructor(mat: THREE.Material) { this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), mat); this.mesh.visible = false; } }

export class VFXManager {
  add: ParticleLayer; alpha: ParticleLayer;
  group = new THREE.Group();
  private c = new THREE.Color(); private c2 = new THREE.Color();
  private shock: Shockwave[] = [];
  private flashMat: THREE.MeshBasicMaterial;
  private flashes: { m: THREE.Mesh; life: number }[] = [];
  private lights: { l: THREE.PointLight; life: number; max: number; intensity: number }[] = [];
  quality = 1;
  constructor() {
    const spr = particleSprite(), smk = smokeSprite();
    this.add = new ParticleLayer(MAX_ADD, spr, true); this.alpha = new ParticleLayer(MAX_ALPHA, smk, false);
    this.group.add(this.add.mesh, this.alpha.mesh);
    const swMat = new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) { const s = new Shockwave(swMat.clone()); this.shock.push(s); this.group.add(s.mesh); }
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flashMat.clone()); m.visible = false; this.group.add(m); this.flashes.push({ m, life: 0 }); }
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb060, 0, 60, 1.6); l.visible = true; l.position.set(0, -5000, 0); this.group.add(l); this.lights.push({ l, life: 0, max: 1, intensity: 0 }); }
  }
  spawn(o: SpawnOpts) {
    const layer = o.additive === false ? this.alpha : this.add;
    const n = Math.max(1, Math.round((o.count ?? 1) * this.quality));
    this.c.setHex(o.color ?? 0xffffff); this.c2.setHex(o.color2 ?? o.color ?? 0xffffff);
    const br = o.brightness ?? 1;
    for (let i = 0; i < n; i++) {
      const sp = o.spread ?? 1; const spd = (o.speed ?? 0) * rand(0.5, 1.2);
      let dx = rand(-1, 1), dy = rand(-1, 1), dz = rand(-1, 1); const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      const vx = (o.vel?.x ?? 0) + dx * spd * sp, vy = (o.vel?.y ?? 0) + dy * spd * sp, vz = (o.vel?.z ?? 0) + dz * spd * sp;
      const t = Math.random(); const r = (this.c.r + (this.c2.r - this.c.r) * t) * br, g = (this.c.g + (this.c2.g - this.c.g) * t) * br, b = (this.c.b + (this.c2.b - this.c.b) * t) * br;
      const life = (o.life ?? 1) * rand(0.6, 1.3);
      layer.spawn({ x: o.pos.x + dx * sp * 0.3, y: o.pos.y + dy * sp * 0.3, z: o.pos.z + dz * sp * 0.3, vx, vy, vz, life, maxLife: life, size: (o.size ?? 1) * rand(0.7, 1.3), grow: o.grow ?? 0, r, g, b, drag: o.drag ?? 0, gravity: o.gravity ?? 0, rot: rand(0, 6.28), rotV: rand(-2, 2), fadeIn: o.fadeIn ?? 0.02, stretch: o.stretch ?? 1, alpha: o.alpha ?? (o.additive === false ? 0.45 : 1) });
    }
  }
  // ---- composed effects ----
  sparks(pos: THREE.Vector3, dir: THREE.Vector3, count = 14, color = 0xffd090) {
    this.spawn({ pos, vel: dir.clone().multiplyScalar(-18), spread: 1, speed: 45, count, life: 0.45, size: 0.3, color, color2: 0xffffff, drag: 2.5, gravity: 40, stretch: 3.5, brightness: 2.5 });
    this.spawn({ pos, count: 1, life: 0.06, size: 1.2 + count * 0.04, color: 0xffd8a0, brightness: 2 });
  }
  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, size = 1) {
    const f = this.flashes.find((x) => !x.m.visible);
    if (f) { f.m.visible = true; f.life = 0.05; f.m.position.copy(pos); f.m.scale.setScalar(2.2 * size); f.m.rotation.set(0, 0, rand(0, 6.28)); f.m.lookAt(pos.clone().add(dir)); (f.m.material as THREE.MeshBasicMaterial).opacity = 0.95; }
    this.spawn({ pos, vel: dir.clone().multiplyScalar(30 * size), spread: 0.6, speed: 20, count: 6, life: 0.12, size: 1.2 * size, color: 0xffc070, color2: 0xfff4e0, drag: 4, brightness: 3 });
    this.spawn({ pos, vel: dir.clone().multiplyScalar(8), spread: 1, speed: 6, count: 3, life: 0.6, size: 1.6 * size, grow: 4, color: 0x777777, additive: false, fadeIn: 0.1 });
  }
  cannonBlast(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.muzzle(pos, dir, 2.2);
    this.spawn({ pos, vel: dir.clone().multiplyScalar(40), spread: 1.5, speed: 25, count: 30, life: 0.25, size: 2.5, color: 0xffa040, color2: 0xfff0c0, drag: 3, brightness: 3 });
    this.spawn({ pos, vel: dir.clone().multiplyScalar(12), spread: 2, speed: 10, count: 16, life: 1.6, size: 3, grow: 8, color: 0x55524e, additive: false, fadeIn: 0.15 });
    this.shockwave(pos, dir, 14, 0.3);
    this.light(pos, 0xffb060, 900, 0.15);
  }
  shockwave(pos: THREE.Vector3, normal: THREE.Vector3, size: number, dur = 0.4) {
    const s = this.shock.find((x) => !x.mesh.visible); if (!s) return;
    s.mesh.visible = true; s.life = dur; s.max = dur; s.mesh.position.copy(pos); s.mesh.lookAt(pos.clone().add(normal)); s.mesh.scale.setScalar(1); (s.mesh as any)._size = size;
  }
  light(pos: THREE.Vector3, color: number, intensity: number, dur: number) {
    const L = this.lights.find((x) => x.life <= 0) ?? this.lights[0];
    L.l.position.copy(pos); L.l.color.setHex(color); L.l.intensity = intensity; L.intensity = intensity; L.life = dur; L.max = dur;
  }
  explosion(pos: THREE.Vector3, size = 1, smoke = true) {
    this.spawn({ pos, count: 1, life: 0.12, size: 6 * size, color: 0xfff4e0, brightness: 2.5 });
    this.spawn({ pos, spread: 2.5 * size, speed: 22 * size, count: 14, life: 0.5, size: 3 * size, grow: 3.5 * size, color: 0xff7a20, color2: 0xffd070, drag: 3, brightness: 1.8 });
    this.spawn({ pos, spread: 1.5, speed: 70 * size, count: 34, life: 0.8, size: 0.4, color: 0xffc070, color2: 0xffffff, drag: 1.5, gravity: 30, stretch: 4, brightness: 3 });
    if (smoke) this.spawn({ pos, spread: 3 * size, speed: 14 * size, count: 12, life: 2.2, size: 4.5 * size, grow: 4.5 * size, color: 0x3a3733, color2: 0x6a6560, additive: false, drag: 1.2, gravity: -3, fadeIn: 0.2, alpha: 0.4 });
    // debris
    this.spawn({ pos, spread: 1, speed: 60 * size, count: 14, life: 1.6, size: 0.6 * size, color: 0x222222, additive: false, gravity: 45, drag: 0.6, stretch: 2 });
    this.shockwave(pos, new THREE.Vector3(0, 1, 0), 16 * size, 0.45);
    this.light(pos, 0xff9a40, 700 * size, 0.25);
  }
  impactMissile(pos: THREE.Vector3) { this.explosion(pos, 0.55, true); }
  dust(pos: THREE.Vector3, vel: THREE.Vector3, count = 3, size = 3) {
    this.spawn({ pos, vel, spread: 2, speed: 5, count, life: 1.1, size, grow: 5, color: 0x5a554d, color2: 0x7a746a, additive: false, drag: 2, fadeIn: 0.15, alpha: 0.3 });
  }
  landingDust(pos: THREE.Vector3, strength: number) {
    this.spawn({ pos, spread: 4, speed: 18 * strength, count: 24, life: 1.4, size: 3, grow: 9, color: 0x5a554d, color2: 0x8a847a, additive: false, drag: 2.5, fadeIn: 0.1, alpha: 0.4 });
    this.spawn({ pos, spread: 1, speed: 30 * strength, count: 10, life: 0.4, size: 0.3, color: 0xffd090, drag: 2, gravity: 40, stretch: 3, brightness: 2 });
    this.shockwave(pos, new THREE.Vector3(0, 1, 0), 16 * strength, 0.35);
  }
  qbBurst(pos: THREE.Vector3, dir: THREE.Vector3, color: number) {
    this.spawn({ pos, vel: dir.clone().multiplyScalar(-70), spread: 1.2, speed: 35, count: 22, life: 0.3, size: 0.7, color, color2: 0xffffff, drag: 3, stretch: 5, brightness: 1.6 });
    this.spawn({ pos, vel: dir.clone().multiplyScalar(-20), spread: 2, speed: 10, count: 8, life: 0.9, size: 2.5, grow: 6, color: 0x9aa0a8, additive: false, drag: 2, fadeIn: 0.1 });
  }
  trail(pos: THREE.Vector3, vel: THREE.Vector3, color: number) {
    this.spawn({ pos, vel, spread: 0.3, speed: 2, count: 1, life: 0.25, size: 1.2, color, color2: 0xffffff, drag: 6, brightness: 2 });
  }
  smokeTrail(pos: THREE.Vector3, size = 1.2) {
    this.spawn({ pos, spread: 0.4, speed: 3, count: 1, life: 1.6, size, grow: 3.0, color: 0xa8a49c, color2: 0x6a665f, additive: false, drag: 1, gravity: -1, fadeIn: 0.05, alpha: 0.4 });
  }
  meleeHit(pos: THREE.Vector3, dir: THREE.Vector3) {
    this.spawn({ pos, count: 1, life: 0.1, size: 7, color: 0xd8f6ff, brightness: 2.5 });
    this.spawn({ pos, vel: dir.clone().multiplyScalar(10), spread: 1.8, speed: 90, count: 70, life: 0.6, size: 0.26, color: 0x9fe8ff, color2: 0xffffff, drag: 1.4, gravity: 45, stretch: 6, brightness: 2.6 });
    this.spawn({ pos, spread: 1, speed: 30, count: 16, life: 0.5, size: 2.5, grow: 8, color: 0x66d8ff, color2: 0xffffff, drag: 3, brightness: 2 });
    this.shockwave(pos, dir, 13, 0.3);
    this.light(pos, 0x8fe8ff, 800, 0.18);
  }
  staggerBurst(pos: THREE.Vector3) {
    this.spawn({ pos, count: 1, life: 0.16, size: 7, color: 0xffe0a0, brightness: 1.6 });
    this.spawn({ pos, spread: 2, speed: 40, count: 40, life: 0.8, size: 0.5, color: 0xffb050, color2: 0xffffff, drag: 1.5, gravity: 20, stretch: 3, brightness: 3 });
    this.shockwave(pos, new THREE.Vector3(0, 1, 0), 16, 0.45);
  }
  update(dt: number) {
    this.add.update(dt); this.alpha.update(dt);
    for (const s of this.shock) if (s.mesh.visible) { s.life -= dt; const t = 1 - s.life / s.max; const size = (s.mesh as any)._size as number; s.mesh.scale.setScalar(1 + t * size); (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.32; if (s.life <= 0) s.mesh.visible = false; }
    for (const f of this.flashes) if (f.m.visible) { f.life -= dt; (f.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.05); if (f.life <= 0) f.m.visible = false; }
    for (const L of this.lights) if (L.life > 0) { L.life -= dt; L.l.intensity = L.intensity * Math.max(0, L.life / L.max); if (L.life <= 0) { L.l.intensity = 0; L.l.position.set(0, -5000, 0); } }
  }
  get activeCount() { return this.add.parts.length + this.alpha.parts.length; }
}
