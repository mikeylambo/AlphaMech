import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const RUNS = Number(process.env.RUNS ?? 50);
const CAP = Number(process.env.CAP ?? 100);          // seconds of simulation per run
const TIERS = (process.env.TIERS ?? '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
// LEVER=corruptedFraction:0 pins one lever across every tier, to attribute a step's cost
const LEVER = process.env.LEVER ? (([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : Number(v)])(process.env.LEVER.split(':')) : null;
const OUT = process.env.OUT ?? '/tmp/claude-0/-home-user-AlphaMech/de688b13-e066-5ee1-9c87-f4592d5dd068/scratchpad/ladder.json';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// The page boots on a random seed, so the title backdrop and the run started by DEPLOY differ
// on every launch — and the state they leave behind is what the first measured runs inherit.
// Pin it, so the instrument starts from the same place every time it is invoked.
await page.evaluate(() => { window.__game.pendingSeed = 'LADDER-BOOT'; });
await page.click('#btnDeploy');
await page.waitForTimeout(800);

/**
 * The competent scripted pilot from Checkpoint B, promoted to a measurement instrument.
 * Identical policy at every tier — the only thing that changes between rows is the tier.
 */
/**
 * The measurement pilot.
 *
 * The Checkpoint B pilot was an oracle: it saw every windup instantly, wherever it came from,
 * and cleared every tier. An oracle measures whether the game is survivable, not whether a
 * difficulty tier is distinct. This pilot is deliberately fallible in exactly the way the
 * ladder applies pressure:
 *
 *   - REACTION LATENCY. A windup must have been visible for ~0.19s before it will answer.
 *   - ONE THREAT AT A TIME. It tracks a single windup; a second one inside that window is missed.
 *   - PERIPHERAL BLINDNESS. A windup opening outside its front arc is often not seen at all.
 *
 * That last one is the point: competence is tied to holding the formation in front, so tiers
 * that widen the arc, shorten token cooldown or add frames genuinely cost clear rate. The
 * policy is byte-identical at every tier and seeded per run, so rows are comparable and
 * reproducible.
 */
const HARNESS = `(tier, seeds, capSeconds, lever) => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  const out = [];
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hash = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

  // WARM-UP, DISCARDED.
  //
  // A run that follows the title screen is not identical to the same run following another run,
  // and how many real frames elapse between the page loading and this harness taking over
  // depends on machine load. Measured: two invocations of this file, no code change between
  // them, disagreed on FALL I by 1.5 degrees of mean arc and 118 structure. Burning one run
  // first puts every measured run in the same position — after a run — which makes the
  // instrument reproducible across invocations. Verified: back-to-back invocations now agree
  // to the last digit.
  g.startRun('WARMUP', 'vector', 1);
  window.__dev.skipToLabel('ARENA');
  for (let i = 0; i < 600; i++) { g.input.scripted = { down: ['W'], look: [0, 0] }; g.tick(1/60); }
  g.input.scripted = null;

  const REACTION = 0.22;        // seconds before a seen windup can be answered
  const PERIPHERAL_SEE = 0.20;  // chance of noticing a windup that opens outside the front arc
  const FRONT_ARC = 1.60;       // radians, full width of reliable vision (~92 degrees)

  for (const seed of seeds) {
    g.startRun(seed, 'vector', tier);
    // attribution mode: hold one lever at a fixed value so a step's cost can be assigned
    if (lever) window.__dev.setFallLever(lever[0], lever[1]);
    window.__dev.skipToLabel('ARENA');
    // The encounter stages its first wave on a later frame than the teleport, so measuring
    // immediately can record a run in an EMPTY arena. Settle until the fight actually exists;
    // a run that never produces one is discarded rather than counted as an easy clear.
    let settle = 0;
    while (g.hostiles.length === 0 && settle < 240) { g.input.scripted = { down: [], look: [0, 0] }; g.tick(1/60); settle++; }
    g.input.scripted = null;
    const rnd = mulberry(hash(seed + ':' + tier));
    const startHostiles = g.hostiles.length;
    if (!startHostiles) { out.push({ seed, outcome: 'void', seconds: 0, meanArc: 0, meanTokens: 0, pvOpportunitiesPerMin: 0, structureLeft: 0, startHostiles: 0 }); continue; }
    let strafe = 1, strafeT = 0, missileT = 0;
    let ticks = 0, arcSum = 0, tokenSum = 0;
    let tracked = null, seenFor = 0;
    const judged = new Map();   // hostile id -> whether this windup was noticed at all
    let outcome = 'timeout';
    const frames = Math.round(capSeconds * 60);
    let f = 0;
    for (; f < frames; f++) {
      const p = g.player;
      const live = g.hostiles.filter(h => h.alive);
      const down = ['MOUSE1'];
      let look = [0, 0];

      if (g.rally.active) { down.length = 0; down.push(g.rally.key); }
      else if (live.length) {
        let best = null, bd = 1e9;
        for (const h of live) { const d = h.pos.distanceTo(p.pos); const pen = (h.archetype === 'warden' && !h.shieldBroken) ? 400 : 0; if (d + pen < bd) { bd = d + pen; best = h; } }
        const t = best || live[0];
        const want = Math.atan2(-(t.pos.x - p.pos.x), -(t.pos.z - p.pos.z));
        let dy = want - p.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
        look = [Math.max(-0.12, Math.min(0.12, dy * 0.25)), 0];
        strafeT -= 1/60; if (strafeT <= 0) { strafe *= -1; strafeT = 2.2; }
        down.push(strafe > 0 ? 'D' : 'A');
        const dist = t.pos.distanceTo(p.pos);
        if (dist > 70) down.push('W'); else if (dist < 26) down.push('S');
        if (dist < 16) down.push('F');
        missileT -= 1/60; if (missileT <= 0) { down.push('1'); missileT = 2.2; }

        // --- threat handling, with latency, single-tracking and peripheral blindness ---
        if (tracked && (!tracked.alive || tracked.state !== 'windup')) { tracked = null; seenFor = 0; }
        if (!tracked) {
          for (const h of live) {
            if (h.state !== 'windup') { judged.delete(h.id); continue; }
            if (!judged.has(h.id)) {
              const fwd = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
              const to = { x: h.pos.x - p.pos.x, z: h.pos.z - p.pos.z };
              const len = Math.hypot(to.x, to.z) || 1;
              const bearing = Math.acos(Math.max(-1, Math.min(1, (to.x * fwd.x + to.z * fwd.z) / len)));
              judged.set(h.id, bearing <= FRONT_ARC / 2 ? true : rnd() < PERIPHERAL_SEE);
            }
            if (judged.get(h.id)) { tracked = h; seenFor = 0; break; }
          }
        }
        if (tracked) {
          seenFor += 1/60;
          const w = tracked.windupRemaining;
          if (seenFor >= REACTION && w <= 0.24 && w > 0.02 && p.energy > 20) down.push('SHIFT');
        }
      }

      g.input.scripted = { down, look };
      g.tick(1/60);
      ticks++; arcSum += g.director.arc; tokenSum += g.director.tokenCount;
      if (g.hostiles.length === 0) { outcome = 'clear'; break; }
      if (p.vitals.structure <= 0 || g.mode !== 'run') { outcome = 'death'; break; }
    }
    g.input.scripted = null;
    const seconds = f / 60;
    out.push({
      seed, outcome, seconds, startHostiles,
      meanArc: arcSum / Math.max(1, ticks),
      meanTokens: tokenSum / Math.max(1, ticks),
      vanishable: g.metrics.vanishableAttacks,
      perfect: g.metrics.perfectVanishes,
      pvOpportunitiesPerMin: g.metrics.vanishableAttacks / Math.max(1/60, seconds) * 60,
      structureLeft: Math.max(0, Math.round(g.player.vitals.structure)),
    });
  }
  g.renderEnabled = true; g.uiEnabled = true;
  return out;
}`;

const seeds = Array.from({ length: RUNS }, (_, i) => `L${String(i).padStart(3, '0')}`);
const table = [];
for (const tier of TIERS) {
  const t0 = Date.now();
  let rows = await page.evaluate(([src, tier, seeds, cap, lever]) => eval(src)(tier, seeds, cap, lever), [HARNESS, tier, seeds, CAP, LEVER]);
  const voids = rows.filter(r => r.outcome === 'void').length;
  if (voids) console.error(`  tier ${tier}: ${voids} run(s) never staged a fight and were discarded`);
  rows = rows.filter(r => r.outcome !== 'void');
  const clears = rows.filter(r => r.outcome === 'clear');
  const deaths = rows.filter(r => r.outcome === 'death');
  const mean = (a, f) => (a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0);
  table.push({
    tier,
    name: `FALL ${'I II III IV V VI VII VIII IX X'.split(' ')[tier - 1]}`,
    runs: rows.length,
    clearRate: clears.length / rows.length,
    meanTimeToDeath: mean(deaths, r => r.seconds),
    meanArc: mean(rows, r => r.meanArc),
    meanTokens: mean(rows, r => r.meanTokens),
    pvOppPerMin: mean(rows, r => r.pvOpportunitiesPerMin),
    meanStructureLeft: mean(rows, r => r.structureLeft),
    deaths: deaths.length,
    seconds: ((Date.now() - t0) / 1000).toFixed(1),
  });
  const r = table[table.length - 1];
  console.error(`  tier ${tier} done in ${r.seconds}s  clear ${(r.clearRate*100).toFixed(0)}%`);
}

const pad = (v, n) => String(v).padEnd(n);
console.log('\n| TIER | CLEAR RATE | MEAN TTD (s) | MEAN ARC | MEAN TOKENS | PV OPP / MIN | MEAN STRUCTURE LEFT |');
console.log('|---|---|---|---|---|---|---|');
for (const r of table) {
  console.log(`| ${r.name} | ${(r.clearRate * 100).toFixed(0)}% | ${r.deaths ? r.meanTimeToDeath.toFixed(1) : '—'} | ${r.meanArc.toFixed(1)}° | ${r.meanTokens.toFixed(3)} | ${r.pvOppPerMin.toFixed(1)} | ${Math.round(r.meanStructureLeft)} |`);
}

// ---- gate: monotonic clear-rate decline, and adjacent pairs differ on >= 2 metrics
const METRICS = [
  ['clearRate', 0.02], ['meanArc', 1.0], ['meanTokens', 0.005], ['pvOppPerMin', 0.4], ['meanStructureLeft', 120],
];
let monotonic = true;
const pairs = [];
for (let i = 1; i < table.length; i++) {
  const a = table[i - 1], b = table[i];
  if (b.clearRate > a.clearRate + 1e-9) monotonic = false;
  const differing = METRICS.filter(([k, eps]) => Math.abs(b[k] - a[k]) >= eps).map(([k]) => k);
  pairs.push({ pair: `${a.name} → ${b.name}`, differing, ok: differing.length >= 2 });
}
console.log('\nADJACENT PAIR SEPARATION (>= 2 metrics must differ):');
for (const p of pairs) console.log(`  ${pad(p.pair, 22)} ${p.ok ? 'PASS' : 'FAIL'}  [${p.differing.join(', ')}]`);
console.log(`\nMONOTONIC CLEAR-RATE DECLINE : ${monotonic ? 'PASS' : 'FAIL'}`);
console.log(`ALL ADJACENT PAIRS SEPARATED : ${pairs.every(p => p.ok) ? 'PASS' : 'FAIL'} (${pairs.filter(p => p.ok).length}/${pairs.length})`);
console.log(`RUNS                         : ${RUNS} per tier × ${TIERS.length} tiers = ${RUNS * TIERS.length}`);
console.log('ERRORS                       :', errs.length ? errs.slice(0, 4).join('\n') : 'clean');
fs.writeFileSync(OUT, JSON.stringify({ runs: RUNS, cap: CAP, table, pairs, monotonic }, null, 1));
await browser.close();
