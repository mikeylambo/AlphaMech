import * as THREE from 'three';
import { Rng } from './MathUtil';

/** Procedural canvas textures so the game needs no downloads. */
function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function noiseFill(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, base: number, amp: number, cells: number) {
  // value noise via layered random grid
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const g2 = new Float32Array((cells * 4 + 1) * (cells * 4 + 1));
  for (let i = 0; i < g2.length; i++) g2[i] = rng.next();
  const smp = (arr: Float32Array, n: number, u: number, v: number) => {
    const x = u * n, y = v * n; const x0 = Math.floor(x) % n, y0 = Math.floor(y) % n; const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const i = (xx: number, yy: number) => arr[(yy % n) * (n + 1) + (xx % n)];
    return (i(x0, y0) * (1 - sx) + i(x0 + 1, y0) * sx) * (1 - sy) + (i(x0, y0 + 1) * (1 - sx) + i(x0 + 1, y0 + 1) * sx) * sy;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    const n = smp(g, cells, u, v) * 0.65 + smp(g2, cells * 4, u, v) * 0.35;
    const val = base + (n - 0.5) * amp;
    const k = (y * w + x) * 4;
    d[k] = d[k + 1] = d[k + 2] = Math.max(0, Math.min(255, val)); d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export interface TexSet { map: THREE.Texture; rough: THREE.Texture }

export function concreteTex(size = 512): TexSet {
  const rng = new Rng(11);
  const c = canvas(size, size); const ctx = c.getContext('2d')!;
  noiseFill(ctx, size, size, rng, 118, 46, 8);
  // stains and cracks
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 40; i++) { ctx.fillStyle = rng.chance(0.5) ? '#4a4a48' : '#8a8a86'; const r = rng.range(10, 70); ctx.beginPath(); ctx.arc(rng.range(0, size), rng.range(0, size), r, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#2c2c2a'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 25; i++) { ctx.beginPath(); let x = rng.range(0, size), y = rng.range(0, size); ctx.moveTo(x, y); for (let j = 0; j < 6; j++) { x += rng.range(-30, 30); y += rng.range(-30, 30); ctx.lineTo(x, y); } ctx.stroke(); }
  // panel seams (2x2 grid) with drips beneath the horizontal seam
  ctx.globalAlpha = 0.6; ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4); ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
  ctx.globalAlpha = 0.22; ctx.fillStyle = '#2a2826';
  for (let i = 0; i < 16; i++) { const x = rng.range(0, size); const y = rng.chance(0.5) ? 4 : size / 2 + 2; ctx.fillRect(x, y, rng.range(2, 5), rng.range(12, 60)); }
  ctx.globalAlpha = 1;
  const r = canvas(size, size); const rc = r.getContext('2d')!; noiseFill(rc, size, size, new Rng(12), 200, 60, 6);
  return { map: tex(c), rough: tex(r, 1, false) };
}

export function asphaltTex(size = 512): TexSet {
  const rng = new Rng(21);
  const c = canvas(size, size); const ctx = c.getContext('2d')!;
  noiseFill(ctx, size, size, rng, 62, 30, 10);
  // lane markings: one dashed center line + solid edges per tile
  ctx.fillStyle = '#c9c39a'; ctx.globalAlpha = 0.85;
  for (let y = 0; y < size; y += 64) ctx.fillRect(size / 2 - 4, y, 8, 34);
  ctx.fillRect(18, 0, 6, size); ctx.fillRect(size - 24, 0, 6, size);
  ctx.globalAlpha = 1;
  const r = canvas(size, size); const rc = r.getContext('2d')!; noiseFill(rc, size, size, new Rng(22), 215, 40, 8);
  return { map: tex(c), rough: tex(r, 1, false) };
}

export function metalPanelTex(size = 512): TexSet {
  const rng = new Rng(31);
  const c = canvas(size, size); const ctx = c.getContext('2d')!;
  noiseFill(ctx, size, size, rng, 132, 26, 6);
  // panel grid with bolts and seams
  const cells = 4; const cs = size / cells;
  ctx.strokeStyle = '#1e2124'; ctx.lineWidth = 4;
  for (let i = 0; i <= cells; i++) { ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(size, i * cs); ctx.stroke(); }
  ctx.fillStyle = '#2a2d31';
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    for (const [ox, oy] of [[10, 10], [cs - 10, 10], [10, cs - 10], [cs - 10, cs - 10]]) { ctx.beginPath(); ctx.arc(i * cs + ox, j * cs + oy, 3.5, 0, 7); ctx.fill(); }
    if (rng.chance(0.3)) { ctx.fillStyle = '#6d7075'; ctx.fillRect(i * cs + 20, j * cs + 20, cs - 40, 6); ctx.fillStyle = '#2a2d31'; }
    if (rng.chance(0.2)) { ctx.fillStyle = '#b8862b'; ctx.fillRect(i * cs + 24, j * cs + cs - 30, cs - 48, 8); ctx.fillStyle = '#2a2d31'; }
  }
  // grime streaks
  ctx.globalAlpha = 0.18; ctx.fillStyle = '#2b2419';
  for (let i = 0; i < 30; i++) ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(2, 8), rng.range(20, 120));
  ctx.globalAlpha = 1;
  const r = canvas(size, size); const rc = r.getContext('2d')!; noiseFill(rc, size, size, new Rng(32), 150, 90, 5);
  return { map: tex(c), rough: tex(r, 1, false) };
}

export function rustTex(size = 512): TexSet {
  const rng = new Rng(41);
  const c = canvas(size, size); const ctx = c.getContext('2d')!;
  noiseFill(ctx, size, size, rng, 80, 40, 7);
  // tint to rust: multiply overlay
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#b4633a'; ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.35; for (let i = 0; i < 60; i++) { ctx.fillStyle = rng.chance(0.5) ? '#3a2418' : '#c8773f'; ctx.beginPath(); ctx.arc(rng.range(0, size), rng.range(0, size), rng.range(6, 40), 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  const r = canvas(size, size); const rc = r.getContext('2d')!; noiseFill(rc, size, size, new Rng(42), 225, 40, 6);
  return { map: tex(c), rough: tex(r, 1, false) };
}

export function facadeTex(size = 512): TexSet {
  // industrial tower facade: window strips and panel bands
  const rng = new Rng(51);
  const c = canvas(size, size); const ctx = c.getContext('2d')!;
  noiseFill(ctx, size, size, rng, 150, 24, 5);
  const rows = 8, cols = 6; const rh = size / rows, cw = size / cols;
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const x = col * cw, y = r * rh;
    ctx.fillStyle = '#7d8288'; ctx.fillRect(x + 6, y + 6, cw - 12, rh - 12);
    const lit = rng.chance(0.09);
    ctx.fillStyle = lit ? '#d9c68a' : (rng.chance(0.5) ? '#2e3640' : '#3a434e');
    ctx.fillRect(x + 12, y + 14, cw - 24, rh - 28);
    ctx.fillStyle = '#5c6066'; ctx.fillRect(x + 6, y + rh - 8, cw - 12, 3);
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(x, y, 4, rh); // vertical rib
    ctx.fillStyle = '#4a4e54'; ctx.fillRect(x, y + rh - 4, cw, 4); // floor slab line
  }
  ctx.globalAlpha = 0.16; ctx.fillStyle = '#20211f';
  for (let i = 0; i < 60; i++) ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 4), rng.range(10, 90)); // grime streaks
  ctx.globalAlpha = 1;
  const r = canvas(size, size); const rc = r.getContext('2d')!; noiseFill(rc, size, size, new Rng(52), 150, 80, 6);
  return { map: tex(c), rough: tex(r, 1, false) };
}

export function facadeEmissiveTex(size = 512): THREE.Texture {
  const rng = new Rng(51);
  const c = canvas(size, size); const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  const rows = 8, cols = 6; const rh = size / rows, cw = size / cols;
  // must mirror facadeTex rng consumption: noiseFill consumed (cells+1)^2 + (cells*4+1)^2 values with cells=5
  const skip = 36 + 441; for (let i = 0; i < skip; i++) rng.next(); // (grime loop happens after the window loop, so no extra skip)
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const x = col * cw, y = r * rh;
    const lit = rng.chance(0.09); if (!lit) rng.chance(0.5);
    if (lit) { ctx.fillStyle = '#ffd98a'; ctx.fillRect(x + 12, y + 14, cw - 24, rh - 28); }
  }
  return tex(c);
}

/** Soft radial particle sprite. */
export function particleSprite(): THREE.Texture {
  const s = 64; const c = canvas(s, s); const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Hard-edged smoke puff sprite with texture. */
export function smokeSprite(): THREE.Texture {
  const s = 128; const c = canvas(s, s); const ctx = c.getContext('2d')!;
  const rng = new Rng(77);
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) {
    const r = rng.range(18, 34); const a = rng.range(0, 6.28); const d = rng.range(0, 24);
    const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
