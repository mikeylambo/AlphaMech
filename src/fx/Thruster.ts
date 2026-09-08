import * as THREE from 'three';

const vert = /* glsl */`
varying vec2 vUv; varying float vY;
void main(){ vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const frag = /* glsl */`
uniform vec3 uColor; uniform vec3 uCore; uniform float uTime;
varying vec2 vUv; varying float vY;
void main(){
  float t = clamp(1.0 - vUv.y, 0.0, 1.0);  // 1 at nozzle, 0 at tip (clamped: pow of a negative is NaN and poisons bloom)
  float flick = 0.85 + 0.15*sin(uTime*63.0 + vUv.x*20.0) * sin(uTime*41.0);
  float a = pow(t, 1.6) * flick;
  vec3 c = mix(uColor, uCore, pow(t, 3.0));
  gl_FragColor = vec4(c * (1.5 + t*3.5), clamp(a, 0.0, 1.0));
}`;
let shared: THREE.ShaderMaterial | null = null;
const materials: THREE.ShaderMaterial[] = [];
export function thrusterMaterial(color: number, core = 0xffffff) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) }, uTime: { value: 0 } },
    vertexShader: vert, fragmentShader: frag, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  materials.push(m); return m;
}
export function updateThrusterTime(t: number) { for (const m of materials) m.uniforms.uTime.value = t; }
void shared;

/** Exhaust flame: cone whose local -Z (after rotation) points along exhaust. Scaled by rig each frame (z = length). */
export function makeFlame(radius: number, length: number, mat: THREE.ShaderMaterial): THREE.Group {
  const g = new THREE.Group();
  // ConeGeometry: tip +Y, base -Y. rotateX(+90°) maps +Y -> +Z, so tip points along +Z (the exhaust direction);
  // translate so the wide base sits at the nozzle (origin) and the tip trails away along +Z.
  const geo = new THREE.ConeGeometry(radius, length, 10, 1, true);
  geo.rotateX(Math.PI / 2); geo.translate(0, 0, length / 2);
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false;
  const core = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.45, length * 0.6, 8, 1, true), mat);
  core.geometry.rotateX(Math.PI / 2); core.geometry.translate(0, 0, length * 0.3); core.frustumCulled = false;
  g.add(m, core);
  return g;
}
