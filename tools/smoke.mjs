import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5180/';
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-AlphaMech/de688b13-e066-5ee1-9c87-f4592d5dd068/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('GL Driver Message')) errors.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack||'').split('\n').slice(0,5).join('\n')}`));

const brief = (s) => ({
  mode: s.run.mode, stop: s.run.stop?.label, cleared: s.run.stop?.cleared, chain: s.run.chainName,
  pos: s.player.position, vel: s.player.velocity, struct: s.player.structure, en: s.player.energy,
  stagger: s.player.stagger, hostiles: s.hostiles.length,
  arc: s.director.arc, tokens: s.director.tokenCount, src: s.director.tokenSource,
  frameMs: s.perf.frameTime, draws: s.perf.drawCalls, stream: s.perf.streamerState,
});
const st = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__state())));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/01-title.png` });

await page.click('#btnDeploy');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/02-deployed.png` });
console.log('AFTER DEPLOY  ', JSON.stringify(brief(await st())));

await page.keyboard.down('w');
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(1000);
  console.log(`  t+${i + 1}s  `, JSON.stringify(brief(await st())));
}
await page.keyboard.up('w');
await page.screenshot({ path: `${OUT}/03-flying.png` });

// fight: hold fire + blade, quick boost
await page.mouse.move(800, 450);
for (let i = 0; i < 10; i++) {
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(500);
  await page.mouse.up({ button: 'left' });
  await page.keyboard.press('Shift');
  await page.waitForTimeout(250);
}
await page.screenshot({ path: `${OUT}/04-combat.png` });
console.log('AFTER COMBAT  ', JSON.stringify(brief(await st())));
const full = await st();
console.log('HOSTILE SAMPLE', JSON.stringify(full.hostiles[0] ?? null));
console.log('SCORE         ', JSON.stringify(full.score));

console.log('CONSOLE:', errors.length ? '\n' + errors.slice(0, 20).join('\n') : 'clean');
await browser.close();
