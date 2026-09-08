import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:5180/';
const OUT = '/tmp/claude-0/-home-user-AlphaMech/de688b13-e066-5ee1-9c87-f4592d5dd068/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('GL Driver')) errors.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack||'').split('\n').slice(0,6).join('\n')}`));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const log = (k, v) => console.log(k.padEnd(24), typeof v === 'string' ? v : JSON.stringify(v));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.click('#btnDeploy');
await page.waitForTimeout(1500);

// ---------------------------------------------------------------- ARENA COMBAT
log('STOPS', await ev(() => window.__dev.stops().map((s) => s.label)));
await ev(() => { window.__dev.openGates(); const a = window.__dev.stops().findIndex(s => s.label === 'ARENA'); return a; });
await ev(() => {
  const s = window.__dev.stops();
  const i = s.findIndex((x) => x.label === 'ARENA');
  window.__dev.warp(s[i].z0 + 200);
});
await page.waitForTimeout(2500);
let st = await ev(() => window.__state());
log('ARENA hostiles', st.hostiles.length);
log('ARENA arc/tokens', { arc: st.director.arc, tokens: st.director.tokenCount, src: st.director.tokenSource });
await page.screenshot({ path: `${OUT}/10-arena.png` });

// ---------------------------------------------------------------- VANISH + RALLY
const v1 = await ev(() => { window.__dev.forceWindup('sweep', 0.10); return window.__dev.vanish(1); });
log('PERFECT VANISH', v1);
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/11-vanish.png` });
if (v1.rally) {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(await ev(() => window.__dev.rallyAnswer(true)));
  log('RALLY WIN SEQUENCE', steps);
}
// force a rally to test both branches (step frames so the vanish cooldown clears)
const forced = await ev(() => {
  const out = [];
  for (let i = 0; i < 10 && !window.__dev.rally(); i++) {
    window.__dev.step(1 / 60, 24);
    window.__dev.heal();
    window.__dev.forceWindup('sweep', 0.1);
    out.push(window.__dev.vanish(1).perfect);
  }
  return { attempts: out.length, perfects: out.filter(Boolean).length, rally: window.__dev.rally() };
});
log('RALLY ESCALATION', forced);
if (forced.rally) {
  const fail = await ev(() => window.__dev.rallyAnswer(false));
  log('RALLY FAIL', fail);
}

// ---------------------------------------------------------------- FORGE
await ev(() => { window.__dev.killAll(); });
await page.waitForTimeout(800);
await ev(() => window.__dev.skipToForge());
await page.waitForTimeout(12000);
await page.screenshot({ path: `${OUT}/12-forge.png` });
const forgeVisible = await page.isVisible('#forge.on');
log('FORGE OPEN', forgeVisible);
const cards = await page.$$eval('#forgeUpgrades .card .name', (n) => n.map((x) => x.textContent));
const evos = await page.$$eval('#forgeEvolutions .card .name', (n) => n.map((x) => x.textContent));
log('FORGE UPGRADES', cards);
log('FORGE EVOLUTIONS', evos);
await page.click('#forgeUpgrades .card');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/13-forge-evo.png` });
await page.click('#forgeEvolutions .card');
await page.waitForTimeout(500);
await page.click('#btnLaunch');
await page.waitForTimeout(1500);
log('AFTER LAUNCH', await ev(() => ({ mode: window.__state().run.mode, build: window.__state().build })));
await page.screenshot({ path: `${OUT}/14-launched.png` });

// ---------------------------------------------------------------- BOSS
await ev(() => window.__dev.skipToBoss());
await page.waitForTimeout(3000);
st = await ev(() => window.__state());
log('BOSS', st.boss);
await page.screenshot({ path: `${OUT}/15-boss.png` });

// counter-vanish: phase 1 fires on the 2nd perfect vanish
const cv = await ev(() => {
  const out = [];
  for (let i = 0; i < 6; i++) {
    window.__dev.step(1 / 60, 30);
    window.__dev.heal();
    window.__dev.forceWindup('sweep', 0.1);
    const r = window.__dev.vanish(1);
    out.push({ n: i + 1, perfect: r.perfect, rally: r.rally && r.rally.mode, counters: window.__dev.boss().counterVanishes, vanishes: window.__dev.boss().vanishesTaken });
    if (window.__dev.rally()) { for (let k = 0; k < 6; k++) window.__dev.rallyAnswer(true); }
  }
  return out;
});
log('COUNTER-VANISH', cv);

// phase 2
await ev(() => window.__dev.hurtBoss(0.45));
await page.waitForTimeout(900);
log('BOSS PHASE', await ev(() => window.__dev.boss()));
await page.screenshot({ path: `${OUT}/16-boss-p2.png` });

// ---------------------------------------------------------------- RESULTS
await ev(() => window.__dev.killAll());
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/17-results.png` });
log('RESULTS OPEN', await page.isVisible('#results.on'));
log('DISCIPLINE', await page.textContent('#results .disc').catch(() => null));
log('RANK', await page.textContent('#results .rankbox .r').catch(() => null));
log('CONSOLE', errors.length ? '\n' + errors.slice(0, 15).join('\n') : 'clean');
await browser.close();
