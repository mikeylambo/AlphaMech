import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
page.on('pageerror', (e) => console.log('ERR', e.message, (e.stack||'').split('\n')[1]));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(600);

const PILOT = `(label, seed, seconds, minHostiles) => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  g.startRun(seed, 'vector');
  window.__dev.skipToLabel(label);
  g.tick(1/60);
  while (g.hostiles.length < minHostiles) window.__dev.spawn('brawler', 1);
  const start = g.hostiles.length;
  const log = [];
  let outcome = 'timeout', missileT = 0, strafe = 1, strafeT = 0, vanishes = 0, staggers = 0;
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    const p = g.player;
    const live = g.hostiles.filter(h => h.alive);
    const down = ['MOUSE1'];
    let look = [0, 0];
    if (g.rally.active) {
      down.length = 0;
      down.push(g.rally.key);                 // answer the prompt correctly
    } else if (live.length) {
      // aim at the nearest hostile that is not a shielded WARDEN front
      let best = null, bd = 1e9;
      for (const h of live) { const d = h.pos.distanceTo(p.pos); const pen = (h.archetype === 'warden' && !h.shieldBroken) ? 400 : 0; if (d + pen < bd) { bd = d + pen; best = h; } }
      const t = best || live[0];
      const want = Math.atan2(-(t.pos.x - p.pos.x), -(t.pos.z - p.pos.z));
      let dy = want - p.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
      look = [Math.max(-0.12, Math.min(0.12, dy * 0.25)), 0];
      // rotation: keep circling so the arc stays in front
      strafeT -= 1/60; if (strafeT <= 0) { strafe *= -1; strafeT = 2.2; }
      down.push(strafe > 0 ? 'D' : 'A');
      const dist = t.pos.distanceTo(p.pos);
      if (dist > 70) down.push('W'); else if (dist < 26) down.push('S');
      if (dist < 16) down.push('F');                 // blade
      missileT -= 1/60; if (missileT <= 0) { down.push('1'); missileT = 2.2; }
      // read the windup: vanish inside the window
      const threat = live.find(h => h.state === 'windup' && h.windupRemaining <= 0.24 && h.windupRemaining > 0.02);
      if (threat && p.energy > 20) down.push('SHIFT');
    }
    g.input.scripted = { down, look };
    const pv = g.metrics.perfectVanishes, sc = g.metrics.staggersCreated;
    g.tick(1/60);
    vanishes += g.metrics.perfectVanishes - pv; staggers += g.metrics.staggersCreated - sc;
    if (i % 600 === 0) log.push({ t: +(i/60).toFixed(1), hostiles: g.hostiles.length, hp: Math.round(p.vitals.structure), arc: +g.director.arc.toFixed(0), tokens: g.director.tokenCount, pv: g.metrics.perfectVanishes, st: g.metrics.staggersCreated });
    if (g.hostiles.length === 0) { outcome = 'CLEARED'; break; }
    if (p.vitals.structure <= 0 || g.mode !== 'run') { outcome = 'FRAME LOST'; break; }
  }
  g.input.scripted = null; g.renderEnabled = true; g.uiEnabled = true;
  const s = g.state();
  return { label, start, outcome, hp: Math.round(g.player.vitals.structure), hostiles: g.hostiles.length,
           perfectVanishes: g.metrics.perfectVanishes, vanishable: g.metrics.vanishableAttacks,
           staggers: g.metrics.staggersCreated, conversions: g.metrics.staggerPunishes, log,
           encounterScore: g.metrics.result() };
}`;
for (const [label, seed, secs, n] of [['ARENA','PILOT1',180,5], ['DUEL','PILOT2',150,1], ['STORM','PILOT3',150,1], ['HUNT','PILOT4',150,3], ['PURSUIT','PILOT5',150,2], ['SEVERANCE','PILOT6',300,1]]) {
  const r = await page.evaluate(([src, label, seed, secs, n]) => eval(src)(label, seed, secs, n), [PILOT, label, seed, secs, n]);
  console.log(label.padEnd(10), r.outcome.padEnd(11), `start ${r.start}`, `left ${r.hostiles}`, `hp ${r.hp}`,
    `PV ${r.perfectVanishes}/${r.vanishable}`, `stag ${r.staggers}`, `conv ${r.conversions}`,
    `rank ${r.encounterScore.rank} ${r.encounterScore.final.toFixed(1)}`);
}
await browser.close();
