import * as THREE from 'three';

/**
 * GDD §12 sector palettes. Tonight is Sector 1 EXTERIOR: outer infrastructure, hard light,
 * open sky, rust and ember with a warm key. The palette is authored per sector so the descent
 * means something rather than being a fog-colour change.
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
  },
};

const skyVert = /* glsl */`
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  // smooth all the way up: no banding, no hard haze edge
  float t = pow(clamp(d.y * 1.12 + 0.07, 0.0, 1.0), 0.55);
  vec3 c = mix(uHorizon, uZenith, t);
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSun * pow(s, 320.0) * 3.4;                 // the disc itself
  c += uSun * pow(s, 9.0) * 0.55;                  // tight glow
  c += uSun * pow(s, 2.0) * 0.18 * (1.0 - t);      // wide wash along the horizon
  // dust below the horizon line, so the ground plane meets a lit atmosphere rather than a seam
  vec3 below = c * 0.62 + uHorizon * 0.16;
  c = mix(below, c, smoothstep(-0.10, 0.03, d.y));
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildSky(look: SectorLook, sunDir: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(look.skyZenith) },
      uHorizon: { value: new THREE.Color(look.skyHorizon) },
      uSun: { value: new THREE.Color(look.sunColour) },
      uSunDir: { value: sunDir.clone().normalize() },
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
const SKY_SUN = new THREE.Vector3(-0.30, 0.13, 0.94).normalize();
const KEY_DIR = new THREE.Vector3(-0.46, 0.62, -0.64).normalize();
const SHADOW_SPAN = 300;
const SHADOW_DIST = 620;

export function buildLighting(scene: THREE.Scene, look: SectorLook): SectorLighting {
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
  return { group, sun, sky, follow };
}
