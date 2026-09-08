import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
const errs = []; page.on('pageerror', (e) => errs.push(`${e.message} | ${(e.stack||'').split('\n')[1]}`));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(900);

const byState = await page.evaluate(() => window.__dev.variantsByState());
console.log('VARIANTS PER STATE:');
for (const [k, v] of Object.entries(byState)) console.log(`  ${k.padEnd(10)} ${v.length}  ${v.join(', ')}`);
const total = Object.values(byState).reduce((n, v) => n + v.length, 0);
console.log(`  TOTAL ${total}`);

// Chain Law 2 still operates on the state, not the variant
console.log('\nCHAIN LAW 2 UNDER VARIANTS (20 seeds):');
const law = await page.evaluate(() => {
  const g = window.__game; const out = [];
  for (let i = 0; i < 20; i++) {
    g.startRun('LAW' + i, 'vector', 1);
    const s = g.state().run;
    out.push({ seed: 'LAW' + i, a: s.chainLaw2.chainAStress, b: s.chainLaw2.chainBStress, distinct: s.chainLaw2.distinct });
  }
  return out;
});
console.log('  all distinct:', law.every(l => l.distinct), '|', [...new Set(law.map(l => `${l.a}/${l.b}`))].join('  '));

// walk every variant: raise it, run it, confirm the field and objective wire up
console.log('\nWALKING ALL 24:');
const results = await page.evaluate(() => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  const out = [];
  for (const v of window.__dev.variants()) {
    // a run plays two chains, so not every seed contains every state: search for one that does
    let staged = false;
    for (let attempt = 0; attempt < 120 && !staged; attempt++) {
      g.startRun('VAR-' + v.id + '-' + attempt, 'vector', 6);
      if (!window.__dev.stops().some((s) => s.label === v.state)) continue;
      const r = window.__dev.forceVariant(v.id);
      staged = typeof r !== 'string';
    }
    if (!staged) { out.push({ id: v.id, ok: false, why: 'no seed produced state ' + v.state }); continue; }
    window.__dev.skipToLabel(v.state);
    // the forced variant is applied on entry
    const stop = g.__proto__ ? null : null; void stop;
    for (let i = 0; i < 260; i++) { g.input.scripted = { down: ['W','MOUSE1'], look: [0,0] }; g.tick(1/60); }
    g.input.scripted = null;
    const cur = window.__dev.currentVariant();
    out.push({
      id: v.id, state: v.state, ok: !!cur && cur.id === v.id,
      applied: cur?.id ?? null, geometry: cur?.geometry, objective: cur?.objective,
      fields: cur?.fields, hostiles: g.hostiles.length, transports: cur?.transports ?? 0,
      hp: Math.round(g.player.vitals.structure),
    });
  }
  g.renderEnabled = true; g.uiEnabled = true;
  return out;
});
let ok = 0;
for (const r of results) {
  if (r.ok) ok++;
  const f = r.fields ? `emit ${r.fields.emitters} rot ${r.fields.rotors} drain ${r.fields.drains} void ${r.fields.voids}${r.fields.wake ? ' wake' : ''}${r.fields.confineRadius ? ` r${r.fields.confineRadius}` : ''}` : '';
  console.log(`  ${r.ok ? 'OK ' : 'FAIL'} ${String(r.id).padEnd(24)} ${String(r.geometry ?? r.why).padEnd(18)} ${String(r.objective ?? '').padEnd(16)} host ${String(r.hostiles).padStart(2)} tr ${r.transports} hp ${r.hp}  ${f}`);
}
console.log(`\nREACHABLE AND PLAYABLE: ${ok}/${results.length}`);
console.log('ERRORS:', errs.length ? errs.slice(0,6).join('\n') : 'clean');
await browser.close();
