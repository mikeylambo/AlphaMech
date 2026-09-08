import * as THREE from 'three';

/**
 * GDD §12 sector palettes. The palette is authored per sector so the descent means something
 * rather than being a fog-colour change.
 *
 *   S1 EXTERIOR    — outer infrastructure, hard light, open sky, rust and ember, warm key.
 *   S2 MANUFACTURE — deep machinery, cooling stacks, vertical volumes. Blue-grey and high fog,
 *                    lit from BELOW by the foundry rather than from above by a sun. There is no
 *                    sky here: the "sky" is the underside of the floor you were just standing on.
 *
 * The two are deliberately inverted. Sector 1's key light comes from behind the camera and its
 * horizon is bright; Sector 2's key is cold and overhead, its horizon is dark, and the only warm
 * light in the volume is the pour. A player who has learned to read ground telegraphs against a
 * warm floor has to re-learn the same read against a hot one — which is the sector's first idea.
 */
export interface SectorLook {
  id: number;
  name: string;
  subtitle: string;
  fog: number;
  fogNear: number;
  fogFar: number;
  skyZenith: number;
  skyHorizon: number;
  sunColour: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColour: number;
  rimIntensity: number;
  ground: number;
  /** Interior sectors have no sun disc and no horizon wash; the sky is structure, not air. */
  interior: boolean;
  /** Direction the visible sky light comes from. Sector 2's comes from underneath. */
  skyDir: [number, number, number];
  /** Direction of the shadow-casting key. */
  keyDir: [number, number, number];
}

export const SECTOR_LOOKS: Record<number, SectorLook> = {
  1: {
    id: 1, name: 'SECTOR 01', subtitle: 'EXTERIOR',
    fog: 0x6a4d3c, fogNear: 320, fogFar: 2600,
    skyZenith: 0x33435a, skyHorizon: 0xd98a4e,
    sunColour: 0xffd7a8, sunIntensity: 2.6,
    hemiSky: 0xb08a68, hemiGround: 0x2a211b, hemiIntensity: 0.9,
    rimColour: 0x5fb8d8, rimIntensity: 0.8,
    ground: 0x6b5a4a,
    interior: false, skyDir: [-0.30, 0.13, 0.94], keyDir: [-0.46, 0.62, -0.64],
  },
  2: {
    id: 2, name: 'SECTOR 02', subtitle: 'MANUFACTURE',
    fog: 0x2b3a46, fogNear: 180, fogFar: 1700,
    skyZenith: 0x0d1418, skyHorizon: 0xc4531c,
    sunColour: 0xff8c3a, sunIntensity: 1.5,
    hemiSky: 0x50708a, hemiGround: 0x3a1c0e, hemiIntensity: 1.15,
    rimColour: 0x7fd8ff, rimIntensity: 1.35,
    ground: 0x4a5560,
    // the glow is BELOW the horizon: the casting floor is the brightest thing in the sector
    interior: true, skyDir: [0.18, -0.42, 0.89], keyDir: [0.38, 0.86, -0.34],
  },
};

export const sectorLook = (index: number): SectorLook => SECTOR_LOOKS[Math.min(4, Math.max(1, index))] ?? SECTOR_LOOKS[1];

const skyVert = /* glsl */`
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uInterior;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  // smooth all the way up: no banding, no hard haze edge
  float t = pow(clamp(d.y * 1.12 + 0.07, 0.0, 1.0), 0.55);
  vec3 c = mix(uHorizon, uZenith, t);
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  // EXTERIOR: a sun disc, a tight glow and a wide wash along the horizon.
  // INTERIOR: no disc at all — a foundry has no sun. The warm light is a broad low bloom coming
  // from beneath, and the top of the volume goes almost black, so the sector reads as roofed.
  c += uSun * pow(s, 320.0) * 3.4 * (1.0 - uInterior);
  c += uSun * pow(s, 9.0) * mix(0.55, 0.22, uInterior);
  c += uSun * pow(s, 2.0) * mix(0.18, 0.55, uInterior) * (1.0 - t);
  vec3 below = c * 0.62 + uHorizon * 0.16;
  c = mix(below, c, smoothstep(-0.10, 0.03, d.y));
  c *= mix(1.0, 1.0 - smoothstep(0.15, 0.95, d.y) * 0.72, uInterior);
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildSky(look: SectorLook, sunDir: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(look.skyZenith) },
      uHorizon: { value: new THREE.Color(look.skyHorizon) },
      uSun: { value: new THREE.Color(look.sunColour) },
      uSunDir: { value: sunDir.clone().normalize() },
      uInterior: { value: look.interior ? 1 : 0 },
    },
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 28), mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}

export interface SectorLighting {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  sky: THREE.Mesh;
  /** Keeps the key light and its shadow frustum centred on the fight. */
  follow(focus: THREE.Vector3): void;
  /**
   * Cross into a new sector's palette. Called at a boundary rather than rebuilt, so the lights
   * and the sky shader are the same objects throughout the run and the transition is a
   * legitimate lerp instead of a pop.
   */
  apply(look: SectorLook, blend?: number): void;
  /** Advance an in-flight palette crossfade. */
  tick(dt: number): void;
  look: SectorLook;
}

/**
 * Two directions, deliberately different:
 *
 *  - the SKY SUN sits low and ahead so the descent always has an ember horizon to read against;
 *  - the KEY LIGHT comes from behind and above the camera so machines are front-lit and their
 *    silhouettes stay legible. A single in-frame sun would backlight every mech into a
 *    black shape, which breaks the silhouette contract in §12.
 *
 * The key light and its shadow camera follow the player: the sector is ~12km long, so a
 * static shadow frustum would only cover the first arena.
 */
const SHADOW_SPAN = 300;
const SHADOW_DIST = 620;
const dirOf = (d: [number, number, number]) => new THREE.Vector3(d[0], d[1], d[2]).normalize();

export function buildLighting(scene: THREE.Scene, look: SectorLook): SectorLighting {
  let SKY_SUN = dirOf(look.skyDir);
  let KEY_DIR = dirOf(look.keyDir);
  const group = new THREE.Group();
  const sun = new THREE.DirectionalLight(look.sunColour, look.sunIntensity);
  sun.position.copy(KEY_DIR).multiplyScalar(SHADOW_DIST);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 40;
  sun.shadow.camera.far = SHADOW_DIST * 2.2;
  sun.shadow.camera.left = -SHADOW_SPAN; sun.shadow.camera.right = SHADOW_SPAN;
  sun.shadow.camera.top = SHADOW_SPAN; sun.shadow.camera.bottom = -SHADOW_SPAN;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.7;
  group.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, look.hemiIntensity);
  // warm rim from the visible sun: catches every edge facing the horizon
  const rim = new THREE.DirectionalLight(look.sunColour, 1.15);
  rim.position.copy(SKY_SUN).multiplyScalar(900);
  // cool counter-rim, so a machine never sits in flat shadow
  const counter = new THREE.DirectionalLight(look.rimColour, look.rimIntensity);
  counter.position.set(420, 210, -180);
  group.add(hemi, rim, counter);

  const sky = buildSky(look, SKY_SUN);
  group.add(sky);
  scene.add(group);
  scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);

  const follow = (focus: THREE.Vector3) => {
    sun.target.position.copy(focus);
    sun.target.updateMatrixWorld();
    sun.position.copy(focus).addScaledVector(KEY_DIR, SHADOW_DIST);
    sky.position.set(focus.x, 0, focus.z);
  };
  follow(new THREE.Vector3());

  const uni = (sky.material as THREE.ShaderMaterial).uniforms;
  const fog = scene.fog as THREE.Fog;
  // the crossfade targets, and how far through it we are
  let from = look, to = look, k = 1, rate = 0;
  const mixC = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  const mixN = (a: number, b: number, t: number) => a + (b - a) * t;

  const paint = (t: number) => {
    sun.color.copy(mixC(from.sunColour, to.sunColour, t));
    sun.intensity = mixN(from.sunIntensity, to.sunIntensity, t);
    hemi.color.copy(mixC(from.hemiSky, to.hemiSky, t));
    hemi.groundColor.copy(mixC(from.hemiGround, to.hemiGround, t));
    hemi.intensity = mixN(from.hemiIntensity, to.hemiIntensity, t);
    rim.color.copy(mixC(from.sunColour, to.sunColour, t));
    counter.color.copy(mixC(from.rimColour, to.rimColour, t));
    counter.intensity = mixN(from.rimIntensity, to.rimIntensity, t);
    fog.color.copy(mixC(from.fog, to.fog, t));
    fog.near = mixN(from.fogNear, to.fogNear, t);
    fog.far = mixN(from.fogFar, to.fogFar, t);
    uni.uZenith.value.copy(mixC(from.skyZenith, to.skyZenith, t));
    uni.uHorizon.value.copy(mixC(from.skyHorizon, to.skyHorizon, t));
    uni.uSun.value.copy(mixC(from.sunColour, to.sunColour, t));
    uni.uInterior.value = mixN(from.interior ? 1 : 0, to.interior ? 1 : 0, t);
    SKY_SUN = dirOf(from.skyDir).lerp(dirOf(to.skyDir), t).normalize();
    KEY_DIR = dirOf(from.keyDir).lerp(dirOf(to.keyDir), t).normalize();
    uni.uSunDir.value.copy(SKY_SUN);
    rim.position.copy(SKY_SUN).multiplyScalar(900);
  };

  const lighting: SectorLighting = {
    group, sun, sky, follow, look,
    apply(next: SectorLook, blend = 2.4) {
      if (next === lighting.look && k >= 1) return;
      from = lighting.look; to = next; k = blend > 0 ? 0 : 1; rate = blend > 0 ? 1 / blend : 0;
      lighting.look = next;
      if (k >= 1) paint(1);
    },
    tick(dt: number) {
      if (k >= 1) return;
      k = Math.min(1, k + rate * dt);
      paint(k * k * (3 - 2 * k));
    },
  };
  return lighting;
}
