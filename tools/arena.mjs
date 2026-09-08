import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
page.on('pageerror', (e) => console.log('ERR', e.message, e.stack?.split('\n')[1]));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(600);

const scenario = async (label, keys, seconds, seed) => page.evaluate(({ label, keys, seconds, seed }) => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  g.startRun(seed, 'vector');
  window.__dev.skipToLabel(label);
  g.tick(1 / 60);                                  // let the encounter open
  while (g.hostiles.length < 5) window.__dev.spawn('lancer', 1);   // brief asks for a 5-hostile ARENA
  const start = g.hostiles.length;
  const log = [];
  const frames = Math.round(seconds * 60);
  let outcome = 'timeout';
  for (let i = 0; i < frames; i++) {
    g.input.scripted = { down: keys, look: [0, 0] };
    g.tick(1 / 60);
    if (i % 600 === 0) log.push({ t: +(i / 60).toFixed(1), hostiles: g.hostiles.length, hp: Math.round(g.player.vitals.structure), arc: +g.director.arc.toFixed(0), tokens: g.director.tokenCount, src: g.director.tokenSource });
    if (g.hostiles.length === 0) { outcome = 'cleared'; break; }
    if (g.player.vitals.structure <= 0 || g.mode !== 'run') { outcome = 'frame lost'; break; }
  }
  g.input.scripted = null; g.renderEnabled = true; g.uiEnabled = true;
  return { start, outcome, seconds: +(log.length ? log[log.length - 1].t : 0), log, hp: Math.round(g.player.vitals.structure), hostiles: g.hostiles.length, score: g.state().score };
}, { label, keys, seconds, seed });

console.log('WIN  ', JSON.stringify(await scenario('ARENA', ['MOUSE1', 'W'], 150, 'ARENAW')));
console.log('LOSE ', JSON.stringify(await scenario('ARENA', [], 200, 'ARENAL')));
await browser.close();
