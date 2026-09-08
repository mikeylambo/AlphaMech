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
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.click('#btnSettings');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/v2-settings-assists.png` });
console.log('ASSIST ROWS  ', (await page.$$eval('#setBody .setrow .k', n => n.map(x => x.textContent))).join(' | '));

// adjust a few assists via keyboard only (controller path)
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(250); // to first row
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200); }
console.log('AFTER 3 RIGHT', await page.evaluate(() => JSON.parse(localStorage.getItem('blinkfall.settings.v1')).assists.vanishWindow));
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(250);
for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(180); }
await page.screenshot({ path: `${OUT}/v2-settings-changed.png` });
const a = await page.evaluate(() => JSON.parse(localStorage.getItem('blinkfall.settings.v1')).assists);
console.log('PERSISTED    ', JSON.stringify({ vanishWindow: a.vanishWindow, bulletTimeScale: a.bulletTimeScale }));

await page.click('#tabControls'); await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/v2-settings-controls.png` });
console.log('BIND ROWS    ', (await page.$$eval('#setBody .setrow.bind .k', n => n.map(x => x.textContent))).length);
console.log('BIND VALUES  ', (await page.$$eval('#setBody .setrow.bind .v', n => n.slice(0,4).map(x => x.textContent))).join(' | '));

// rebind PRIMARY to a key through the real capture path
const rows = await page.$$('#setBody .setrow.bind');
await rows[7].click(); await page.waitForTimeout(400);
await page.keyboard.press('k'); await page.waitForTimeout(500);
const bindings = await page.evaluate(() => JSON.parse(localStorage.getItem('blinkfall.settings.v1')).bindings);
console.log('REBOUND      ', JSON.stringify({ rifle: bindings.rifle }));

// back, deploy, check the assists reach the sim + RunState
await page.click('#btnSetBack'); await page.waitForTimeout(600);
await page.click('#btnDeploy'); await page.waitForTimeout(1500);
console.log('IN-SIM       ', JSON.stringify(await page.evaluate(() => {
  const g = window.__game;
  return { modsVanishWindow: g.player.mods.vanishWindow, fov: g.camera.fov.toFixed(0), fxQuality: g.fx.vfx.quality,
           runAssistsDefault: g.run.assistsAllDefault, runAssists: g.run.assistSnapshot.active };
})));
console.log('ERRORS       ', errs.length ? errs.join('\n') : 'clean');
await browser.close();
