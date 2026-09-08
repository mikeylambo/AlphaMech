import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-AlphaMech/de688b13-e066-5ee1-9c87-f4592d5dd068/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const SHOT = process.env.SHOT || '20-arena-lit';
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.click('#btnDeploy');
await page.waitForTimeout(1200);
console.log(JSON.stringify(await page.evaluate((l) => window.__dev.skipToLabel(l), process.env.STOP || 'ARENA')));
await page.waitForTimeout(6000);
await page.evaluate(() => { window.__game.profiler.toggle(); });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/${SHOT}.png` });
console.log(JSON.stringify(await page.evaluate(() => {
  const s = window.__state();
  return { hostiles: s.hostiles.length, arc: s.director.arc, tokens: s.director.tokenCount, perf: s.perf, pos: s.player.position };
})));
console.log(errors.join('\n') || 'no errors');
await browser.close();
