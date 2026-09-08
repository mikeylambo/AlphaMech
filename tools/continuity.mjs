import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

/**
 * Harness output lives in the repository, not in a session-scoped scratch directory.
 * The old absolute path was tied to the container that wrote it, which meant every gate
 * in this file silently failed to produce evidence when re-run anywhere else. `.artifacts`
 * is gitignored, so the outputs are reachable without ever being committed.
 */
// import.meta.dirname, not `new URL(...)`: several of these files shadow the global URL.
const ARTIFACTS = process.env.ARTIFACTS || `${import.meta.dirname}/../.artifacts`;
const ART = (p) => { fs.mkdirSync(ARTIFACTS, { recursive: true }); return `${ARTIFACTS}/${p}`; };
const OUT = ART('shots');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(800);
// pick a seed whose chain A opens on TRAVERSAL so we cross TRAVERSAL -> CONDUIT -> next volume
await page.evaluate(() => { window.__perf = []; let last = performance.now();
  const f = () => { const n = performance.now(); window.__perf.push({ t: n - last, z: window.__game.player.pos.z, v: window.__game.world.volumes.findIndex(v => window.__game.player.pos.z >= v.z0 && window.__game.player.pos.z < v.z1) }); last = n; requestAnimationFrame(f); };
  requestAnimationFrame(f); });
console.log('WORLD BUILDS', await page.evaluate(() => window.__dev.worldBuilds()), 'VOLUMES', await page.evaluate(() => window.__dev.volumes()));
await page.evaluate(() => { window.__dev.openGates(); });
await page.keyboard.down('w');
await page.keyboard.press('e');   // assault boost
await page.waitForTimeout(45000);
await page.keyboard.up('w');
const r = await page.evaluate(() => {
  const p = window.__perf.slice(6);
  const times = p.map((x) => x.t).sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  const crossings = [];
  for (let i = 1; i < p.length; i++) if (p[i].v !== p[i - 1].v) crossings.push({ i, from: p[i - 1].v, to: p[i].v, z: Math.round(p[i].z), ms: +p[i].t.toFixed(1) });
  return {
    frames: p.length, medianMs: +med.toFixed(1), p95: +times[Math.floor(times.length * 0.95)].toFixed(1), maxMs: +times[times.length - 1].toFixed(1),
    crossings, worstAtCrossing: crossings.length ? Math.max(...crossings.map((c) => c.ms)) : 0,
    worldBuilds: window.__dev.worldBuilds(), z: Math.round(window.__game.player.pos.z),
    stop: window.__dev.stops().map(s => `${s.label}${s.started ? '*' : ''}${s.cleared ? '+' : ''}`).join(' '),
  };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: `${OUT}/23-transit.png` });
await browser.close();
