/**
 * ============================================================================================
 * §3.0 — THE HARDWARE PROFILE
 *
 * Everything above this line in the v0.2 brief is a promise about content. This is the promise
 * about frames. FALL X has to fit inside a budget measured on real silicon, not asserted, so
 * this is an instrument rather than a claim: point it at a production build, on the machine you
 * actually ship to, and it prints the numbers the rest of the pass has to live inside.
 *
 *   npm run profile              build, preview, profile, tear down
 *   npm run profile -- --headful open a real window (highest GPU fidelity)
 *   URL=http://host:5181/ node tools/profile.mjs      profile something already running
 *   SWIFTSHADER=1 node tools/profile.mjs              force the software floor
 *
 * Each scenario is measured with rendering ON at a fixed wall-clock duration, because a frame
 * budget that excludes the renderer is not a frame budget.
 * ============================================================================================
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const HEADFUL = args.includes('--headful') || process.env.HEADFUL === '1';
const PREVIEW = args.includes('--preview');
const SWIFT = process.env.SWIFTSHADER === '1';
const SECONDS = Number(process.env.SECONDS ?? 8);
const W = Number(process.env.WIDTH ?? 1920), H = Number(process.env.HEIGHT ?? 1080);
let URL = process.env.URL ?? (PREVIEW ? 'http://localhost:5181/' : 'http://localhost:5180/');

// ------------------------------------------------------------------ optional preview server
let server = null;
async function reachable(u) { try { const r = await fetch(u); return r.ok; } catch { return false; } }
if (PREVIEW && !(await reachable(URL))) {
  server = spawn('npx', ['vite', 'preview', '--port', '5181', '--strictPort'], { stdio: 'ignore', detached: false });
  for (let i = 0; i < 40 && !(await reachable(URL)); i++) await sleep(250);
}
const stop = () => { if (server && !server.killed) server.kill('SIGTERM'); };
process.on('exit', stop);

// ------------------------------------------------------------------ browser
const gpuArgs = SWIFT
  ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy'];
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: !HEADFUL,
  args: [...gpuArgs, '--no-sandbox', '--disable-dev-shm-usage', `--window-size=${W},${H}`],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.click('#btnDeploy');
await page.waitForTimeout(2500);        // let the first sector finish streaming in

/**
 * Stage a scenario, then let it render for `SECONDS` of wall clock with the pilot flying.
 * Scenarios run through the real frame loop — no headless ticking — so the number on the page
 * is the number a player would feel.
 */
async function scenario(name, setup, note) {
  await page.evaluate((src) => eval(src)(), setup);
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__dev.profileReset(); window.__profiling = true; });
  // a live pilot: skate, boost and fire, so the profile includes VFX, ordnance and audio
  await page.evaluate(() => {
    const g = window.__game;
    let t = 0;
    g.__profDrive = setInterval(() => {
      t += 0.1;
      g.input.scripted = { down: ['W', t % 4 < 2 ? 'D' : 'A', 'MOUSE1', t % 6 < 1 ? 'E' : ''].filter(Boolean), look: [Math.sin(t * 0.6) * 0.02, 0] };
    }, 100);
  });
  await page.waitForTimeout(SECONDS * 1000);
  const s = await page.evaluate(() => {
    const g = window.__game;
    clearInterval(g.__profDrive); g.input.scripted = null; window.__profiling = false;
    return window.__dev.profileSample();
  });
  // the CPU half of the budget, measured with the renderer out of the way
  const sim = await page.evaluate(() => window.__dev.simCost(600));
  return { name, note, sim, ...s };
}

const rows = [];
rows.push(await scenario('idle arena', `() => window.__dev.clear()`, 'floor: world, sky, post stack, no combat'));

rows.push(await scenario('5 hostiles', `() => {
  const d = window.__dev;
  d.clear();
  d.spawn('sentry', 2); d.spawn('lancer', 1); d.spawn('brawler', 1); d.spawn('harrier', 1);
  return window.__game.hostiles.length;
}`, 'the brief\u2019s reference load'));

rows.push(await scenario('volume crossing', `() => window.__dev.crossing()`, 'gate transit while the next volume streams in'));

rows.push(await scenario('FALL X · 10 hostiles', `() => {
  const d = window.__dev, g = window.__game;
  d.unlockAllFalls(); d.setFall(10);
  d.clear();
  d.spawn('sentry', 3); d.spawn('lancer', 2); d.spawn('brawler', 2); d.spawn('warden', 1); d.spawn('harrier', 2);
  return g.hostiles.length;
}`, 'the ceiling: FALL X arena, elites eligible'));

rows.push(await scenario('GRAVEMARK + relays', `() => {
  const d = window.__dev, g = window.__game;
  d.setBossKind('gravemark'); d.skipToBoss();
  return true;
}`, 'boss, four escorts, screen VFX'));

// ------------------------------------------------------------------ report
const adapter = rows[0].adapter;
const soft = /swiftshader|llvmpipe|software/i.test(adapter);
const pad = (s, n) => String(s).padEnd(n);
console.log('');
console.log('=== §3.0 HARDWARE PROFILE ============================================================');
console.log('ADAPTER    ', adapter);
console.log('SURFACE    ', `${W}x${H} @ dpr ${rows[0].pixelRatio}`, HEADFUL ? '(headful)' : '(headless)', soft ? '· SOFTWARE RASTERISER' : '· GPU');
console.log('BUILD      ', URL, PREVIEW ? '(production preview)' : '(as served)');
console.log('WINDOW     ', `${SECONDS}s per scenario, rendering on, pilot flying`);
console.log('');
console.log(pad('SCENARIO', 22), pad('p50', 8), pad('p95', 8), pad('p99', 8), pad('WORST', 9), pad('FPS p50', 9), pad('SIM p50', 9), pad('SIM p95', 9), pad('DRAWS', 7), pad('TRIS', 9), pad('PROG', 6), pad('GEOM', 6), pad('TEX', 5), 'ENTITIES');
for (const r of rows) {
  console.log(
    pad(r.name, 22),
    pad(r.frameMs.p50 + 'ms', 8), pad(r.frameMs.p95 + 'ms', 8), pad(r.frameMs.p99 + 'ms', 8), pad(r.frameMs.worst + 'ms', 9),
    pad(r.fps.p50, 9), pad(r.sim.p50 + 'ms', 9), pad(r.sim.p95 + 'ms', 9),
    pad(r.drawCalls, 7), pad(r.triangles.toLocaleString('en-US'), 9),
    pad(r.programs, 6), pad(r.geometries, 6), pad(r.textures, 5), r.entities,
  );
}
for (const r of rows) console.log('   ·', pad(r.name, 22), r.note);

// ------------------------------------------------------------------ the budget
const five = rows.find((r) => r.name === '5 hostiles');
const cross = rows.find((r) => r.name === 'volume crossing');
const fallx = rows.find((r) => r.name === 'FALL X · 10 hostiles');
const target = Number(process.env.TARGET_FPS ?? 60);
const budget = 1000 / target;
console.log('');
console.log('=== THE BUDGET FALL X MUST FIT INSIDE ================================================');
console.log(`TARGET                 ${target} fps · ${budget.toFixed(2)}ms per frame, p95`);
console.log(`REFERENCE (5 hostiles) p95 ${five.frameMs.p95}ms · ${five.drawCalls} draws · ${five.triangles.toLocaleString('en-US')} tris`);
console.log(`CROSSING               p95 ${cross.frameMs.p95}ms · worst ${cross.frameMs.worst}ms  (a stall here is a hitch a player sees)`);
console.log(`CEILING (FALL X)       p95 ${fallx.frameMs.p95}ms · ${fallx.drawCalls} draws · ${fallx.triangles.toLocaleString('en-US')} tris`);
console.log('');
const headroom = (r) => +(budget - r.frameMs.p95).toFixed(2);
console.log(`HEADROOM AT FALL X     ${headroom(fallx)}ms  (${headroom(fallx) >= 0 ? 'INSIDE BUDGET' : 'OVER BUDGET'})`);
console.log('');
console.log('SPLIT — the CPU half is hardware-portable, the rest is the renderer\u2019s to spend');
for (const r of rows) {
  const gpu = +(r.frameMs.p95 - r.sim.p95).toFixed(2);
  console.log(`  ${pad(r.name, 22)} sim p95 ${pad(r.sim.p95 + 'ms', 9)} of ${budget.toFixed(2)}ms  (${(r.sim.p95 / budget * 100).toFixed(1)}% of budget) · renderer ${gpu}ms`);
}
const simCeil = Math.max(...rows.map((r) => r.sim.p95));
console.log(`  WORST SIM p95          ${simCeil}ms · leaves ${(budget - simCeil).toFixed(2)}ms for the renderer at ${target} fps`);
console.log(`DRAW GROWTH 5 -> X     ${fallx.drawCalls - five.drawCalls} draws, ${(fallx.triangles - five.triangles).toLocaleString('en-US')} tris`);
console.log(`WORST-CASE HITCH       ${Math.max(...rows.map((r) => r.frameMs.worst))}ms`);
console.log('');
console.log('CAPS THIS PROFILE SETS FOR THE REST OF THE PASS');
console.log(`  draw calls    <= ${Math.round(fallx.drawCalls * 1.15)}   (FALL X measured + 15%)`);
console.log(`  triangles     <= ${Math.round(fallx.triangles * 1.15).toLocaleString('en-US')}`);
console.log(`  programs      <= ${Math.max(...rows.map((r) => r.programs))}   (no new material families without a re-profile)`);
console.log(`  build slice   <= 6ms per frame, so a crossing never exceeds the frame budget twice over`);
console.log(`  simulation    <= ${(budget * 0.35).toFixed(2)}ms p95  (35% of the frame; measured worst is ${simCeil}ms)`);
if (soft) {
  console.log('');
  console.log('!! SOFTWARE RASTERISER. These are a FLOOR, not a hardware profile. Re-run on the target');
  console.log('!! machine with: npm run profile -- --headful');
}
console.log('');
console.log('CONSOLE                ', errs.length ? errs.slice(0, 4).join(' | ') : 'clean');
await browser.close();
stop();
