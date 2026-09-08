import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(600);
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  g.startRun('DPSPROBE', 'vector');
  window.__dev.skipToLabel('ARENA');
  g.tick(1 / 60);
  g.hostiles.length = 0;
  window.__dev.spawn('lancer', 1);
  const h = g.hostiles[0];
  const before = h.vitals.structure;
  let shots = 0;
  const origFire = g.player.dealDamage.bind(g.player);
  g.player.dealDamage = (t, d, i, s) => { if (s === 'rifle') shots++; return origFire(t, d, i, s); };
  for (let i = 0; i < 300; i++) { g.input.scripted = { down: ['MOUSE1'], look: [0, 0] }; g.tick(1 / 60); }
  g.input.scripted = null; g.renderEnabled = true; g.uiEnabled = true;
  return {
    seconds: 5, shots, expectedShots: 50,
    damage: Math.round(before - h.vitals.structure), expectedDamage: 50 * 62,
    dist: Math.round(h.pos.distanceTo(g.player.pos)), alive: h.alive,
    lock: g.player.lock.primary ? g.player.lock.primary.displayName : null,
    hostiles: g.hostiles.length,
  };
}), null, 1));
await browser.close();
