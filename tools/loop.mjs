import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:5180/';
const OUT = '/tmp/claude-0/-home-user-AlphaMech/de688b13-e066-5ee1-9c87-f4592d5dd068/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('GL Driver')) errors.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack||'').split('\n').slice(0,6).join('\n')}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const r = await page.evaluate(() => {
  const seg = (frames, down = [], look = [0, 0]) => ({ frames, down, look });
  const script = {
    seed: 'ALPHA1', reactor: 'vector', dt: 1 / 60, sampleEvery: 240,
    segments: [
      seg(600, ['W']),                    // fly the opener
      seg(300, ['W', 'MOUSE1']),          // engage
      seg(300, ['W', 'SHIFT']),
      seg(600, ['W', 'MOUSE1']),
      seg(600, ['W']),
    ],
  };
  const a = window.__replay(script);
  const b = window.__replay(script);
  return {
    setupA: a.setup, setupB: b.setup,
    sameSetup: JSON.stringify(a.setup) === JSON.stringify(b.setup),
    sameTrace: JSON.stringify(a.trace) === JSON.stringify(b.trace),
    traceA: a.trace, finalA: a.final, streamsA: a.streams, streamsB: b.streams, cursorsA: a.final.run.streamCursors, cursorsB: b.final.run.streamCursors,
    stops: window.__dev.stops(),
  };
});
console.log('SAME PROCEDURAL SETUP :', r.sameSetup);
console.log('SAME EXECUTION TRACE  :', r.sameTrace);
console.log('SETUP CHAINS          :', JSON.stringify(r.setupA.chains), JSON.stringify(r.setupA.chainLaw2));
console.log('LAYOUT SIG (head)     :', String(r.setupA.layoutSignature).slice(0, 190));
console.log('STREAM STATES EQUAL   :', JSON.stringify(r.streamsA) === JSON.stringify(r.streamsB));
console.log('  A:', JSON.stringify(r.streamsA));
console.log('  B:', JSON.stringify(r.streamsB));
console.log('  cursorsA:', JSON.stringify(r.cursorsA), '\n  cursorsB:', JSON.stringify(r.cursorsB));
console.log('STOPS                 :');
for (const s of r.stops) console.log('   ', s.kind.padEnd(6), s.label.padEnd(10), `z ${s.z0.toFixed(0)}..${s.z1.toFixed(0)}`, s.started ? 'started' : '', s.cleared ? 'cleared' : '');
console.log('TRACE:');
for (const t of r.traceA) console.log('   ', JSON.stringify(t));
console.log('FINAL SCORE:', JSON.stringify(r.finalA.score));
console.log('CONSOLE:', errors.length ? '\n' + errors.slice(0, 12).join('\n') : 'clean');
await browser.close();
