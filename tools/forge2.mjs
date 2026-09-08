import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(800);
const r = await page.evaluate(() => {
  const g = window.__game;
  const f1 = g.run.rollOffer();
  g.run.takeUpgrade(f1.upgrades[0]);
  g.run.takeEvolution(f1.evolutions[0].evolution, f1.evolutions[0].hardpoint);
  g.run.forgesTaken++;
  const f2 = g.run.rollOffer();
  g.run.takeUpgrade(f2.upgrades[0]);
  g.run.takeEvolution(f2.evolutions[0].evolution, f2.evolutions[0].hardpoint);
  return {
    forge1: { upgrades: f1.upgrades, evolutions: f1.evolutions.map(e => e.evolution) },
    forge2: { upgrades: f2.upgrades, evolutions: f2.evolutions.map(e => e.evolution) },
    leaves: g.run.evolutions, evolvedHardpoints: g.run.evolvedHardpoints,
    discipline: g.run.classification.name,
  };
});
console.log(JSON.stringify(r, null, 1));
// classifier coverage over the whole 12-upgrade pool
const cls = await page.evaluate(() => {
  const g = window.__game;
  const sets = {
    GHOST: [['mirror-chassis','vanish-battery','predator-read'], []],
    KINETIC: [['rail-core','slipstream','zero-point-reactor'], ['momentum-railgun']],
    BREAKER: [['execution-protocol','cascade-break','reactor-bleed'], []],
    LOCKISH: [['split-lock','weight-of-attention','chain-read'], []],
    HYBRID: [['mirror-chassis','execution-protocol'], []],
    EMPTY: [[], []],
  };
  const out = {};
  for (const [k, [u, e]] of Object.entries(sets)) {
    const c = window.__classify(u, e);
    out[k] = { name: c.name, hybrid: c.hybrid, dominant: c.dominant, share: +c.dominantShare.toFixed(2) };
  }
  void g; return out;
});
console.log(JSON.stringify(cls, null, 1));
await browser.close();
