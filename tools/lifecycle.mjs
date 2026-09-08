import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errs = []; page.on('pageerror', (e) => errs.push(`${e.message}`));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
await page.click('#btnDeploy');
await page.waitForTimeout(1200);

const life = () => page.evaluate(() => window.__dev.lifecycle());
const rows = [];
const mark = async (label) => { const l = await life(); rows.push({ label, ...l }); return l; };

await page.evaluate(() => { window.__dev.setSectorPlan(3); window.__game.startRun('LIFE3', 'vector'); });
await page.waitForTimeout(1500);
await mark('S1 start');

for (let sector = 1; sector <= 3; sector++) {
  // take a FORGE so build state exists to carry across the boundary
  await page.evaluate(() => window.__dev.skipToForge());
  await page.waitForTimeout(9000);
  if (await page.isVisible('#forge.on')) {
    await page.click('#forgeUpgrades .card'); await page.waitForTimeout(400);
    await page.click('#forgeEvolutions .card'); await page.waitForTimeout(400);
    await page.click('#btnLaunch'); await page.waitForTimeout(1200);
  }
  await mark(`S${sector} mid (post-forge)`);
  await page.evaluate(() => window.__dev.skipToBoss());
  await page.waitForTimeout(2500);
  await mark(`S${sector} boss`);
  if (sector < 3) {
    await page.evaluate(() => window.__dev.killAll());
    await page.waitForTimeout(4000);
    // fly the connective into the new sector
    await page.evaluate(() => {
      const g = window.__game;
      const s = window.__dev.lifecycle();
      const next = s.sectors[s.sectors.length - 1];
      g.player.pos.z = next.z0 + 320;   // past the retirement margin, so the boundary sample shows the release
      g.player.pos.y = g.world.groundAt(0, g.player.pos.z);
    });
    await page.waitForTimeout(3000);
    await mark(`BOUNDARY ${sector}->${sector + 1}`);
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('MARK', 24), pad('RESIDENT', 9), pad('SECTORS', 12), pad('VOLUMES', 8), pad('GEOM', 7), pad('TEX', 5), pad('DRAWS', 7), pad('BUILT', 6), pad('RETIRED', 8), 'CARRIED (upg/evo/scores)');
for (const r of rows) {
  console.log(pad(r.label, 24), pad(r.resident, 9), pad(r.sectors.map(s => s.index).join(','), 12),
    pad(r.sectors.reduce((n, s) => n + s.volumes, 0), 8), pad(r.memory.geometries, 7), pad(r.memory.textures, 5),
    pad(r.drawCalls, 7), pad(r.built, 6), pad(r.retired, 8),
    `${r.carried.upgrades}/${r.carried.evolutions}/${r.carried.encounterScores}`);
}
const maxResident = Math.max(...rows.map(r => r.resident));
const geoms = rows.map(r => r.memory.geometries);
console.log('\nMAX RESIDENT SECTORS :', maxResident, maxResident <= 2 ? 'PASS (never more than two)' : 'FAIL');
console.log('GEOMETRY RANGE       :', Math.min(...geoms), '..', Math.max(...geoms), `(spread ${Math.max(...geoms) - Math.min(...geoms)})`);
console.log('PILOT PROFILE CARRIED:', JSON.stringify(rows[rows.length - 1].carried.pilotProfile));
console.log('STREAM CURSORS       :', JSON.stringify(rows[rows.length - 1].carried.streamCursors));
console.log('ERRORS               :', errs.length ? errs.slice(0,5).join('\n') : 'clean');
await browser.close();
