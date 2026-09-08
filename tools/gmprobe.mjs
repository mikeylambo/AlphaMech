import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 700, height: 420 } });
page.on('pageerror', (e) => console.log('ERR', e.message, (e.stack||'').split('\n')[1]));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy'); await page.waitForTimeout(800);
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  g.startRun('PROBE', 'vector', 1);
  window.__dev.setBossKind('gravemark');
  window.__dev.skipToBoss();
  g.tick(1/60);
  const b = g.boss;
  const log = [];
  const policy = 'POLICY_HERE';
  for (let i = 0; i < 60 * 24; i++) {
    const p = g.player;
    const live = g.hostiles.filter(h => h.alive);
    const relays = live.filter(h => h.archetype === 'relay');
    const down = ['MOUSE1']; let look = [0,0]; let aim = null;
    if (policy === 'chaser') {
      let best = null, bd = 1e9;
      for (const h of relays) { const d = h.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = h; } }
      aim = best || b;
      const dist = aim.pos.distanceTo(p.pos);
      if (dist > 40) down.push('W'); else if (dist < 20) down.push('S');
      if (dist < 16) down.push('F');
    } else {
      aim = b;
      const dist = b.pos.distanceTo(p.pos);
      if (dist > 78) down.push('W'); else if (dist < 46) down.push('S');
      down.push('D'); down.push('E');
    }
    const want = Math.atan2(-(aim.pos.x - p.pos.x), -(aim.pos.z - p.pos.z));
    let dy = want - p.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
    look = [Math.max(-0.14, Math.min(0.14, dy * 0.28)), 0];
    p.lock.targets = [aim]; p.lock.hard = true;
    g.input.scripted = { down, look };
    g.tick(1/60);
    if (i % 90 === 0) {
      const rear = b.pos.clone().sub(g.player.pos).setY(0).normalize();
      log.push({
        t: +(i/60).toFixed(1), alive: b.liveRelays.length, screening: b.screening, screened: b.screened,
        dots: b.liveRelays.map(r => +r.pos.clone().sub(b.pos).setY(0).normalize().dot(rear).toFixed(2)),
        bossToPlayer: Math.round(b.pos.distanceTo(g.player.pos)),
        bossStruct: Math.round(b.vitals.structure),
      });
    }
  }
  g.input.scripted = null; g.renderEnabled = true; g.uiEnabled = true;
  return log;
}), null, 1));
await browser.close();
