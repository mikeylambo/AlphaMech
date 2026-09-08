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
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/g1-title.png` });
await page.click('#btnDeploy');
await page.waitForTimeout(1000);
for (const [label, name] of [['ARENA', 'g2-arena'], ['HUNT', 'g3-hunt'], ['TRAVERSAL', 'g4-traversal'], ['SEVERANCE', 'g5-severance']]) {
  const ok = await page.evaluate((l) => window.__dev.skipToLabel(l), label);
  if (typeof ok === 'string') { console.log('skip', label, ok); continue; }
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, JSON.stringify(await page.evaluate(() => { const s = window.__state(); return { h: s.hostiles.length, draws: s.perf.drawCalls, arc: s.director.arc, tok: s.director.tokenCount }; })));
}
// forge
await page.evaluate(() => window.__dev.skipToLabel('FORGE'));
await page.waitForTimeout(14000);
await page.screenshot({ path: `${OUT}/g6-forge.png` });
console.log('forge open', await page.isVisible('#forge.on'));
await browser.close();
