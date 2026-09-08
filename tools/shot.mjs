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
