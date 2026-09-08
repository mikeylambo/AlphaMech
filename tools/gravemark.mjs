import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
const errs = []; page.on('pageerror', (e) => errs.push(`${e.message} | ${(e.stack||'').split('\n')[1]}`));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(900);

const RUNS = Number(process.env.RUNS ?? 6);
const CAP = Number(process.env.CAP ?? 220);

const SIM = `(policy, seeds, cap) => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  const out = [];
  for (const seed of seeds) {
    g.startRun(seed, 'vector', 1);
    window.__dev.setBossKind('gravemark');
    window.__dev.skipToBoss();
    g.tick(1/60);
    const boss = g.boss;
    let strafe = 1, strafeT = 0, exposedTicks = 0, ticks = 0, relayKills = 0;
    let outcome = 'timeout';
    const frames = Math.round(cap * 60);
    let f = 0;
    for (; f < frames; f++) {
      const p = g.player;
      const live = g.hostiles.filter(h => h.alive);
      const relays = live.filter(h => h.archetype === 'relay');
      const down = ['MOUSE1'];
      let look = [0, 0];
      let aim = null;

      if (policy === 'chaser') {
        // "kill the escorts": lock the nearest RELAY, close to weapon range, hold that line.
        // No deliberate lateral movement — this is the failure mode the design predicts.
        let best = null, bd = 1e9;
        for (const h of relays) { const d = h.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = h; } }
        // The failure mode the design names: fight the ESCORTS. Never the commander, no blade
        // (a 17m cone would splash it), no deliberate orbiting. If no escort is up, wait for one.
        aim = best;
        if (!aim) { down.length = 0; }
        else {
          const dist = aim.pos.distanceTo(p.pos);
          if (dist > 46) down.push('W'); else if (dist < 32) down.push('S');
        }
      } else {
        // manoeuvre the group: orbit the commander hard and consistently, so its rear arc
        // sweeps out from under the escorts, then hit it whenever the screen is down
        aim = boss;
        const dist = boss.pos.distanceTo(p.pos);
        if (dist > 78) down.push('W'); else if (dist < 46) down.push('S');
        down.push(strafe > 0 ? 'D' : 'A');
        down.push('E');                          // assault boost: rotate faster than the screen re-forms
        strafeT -= 1/60; if (strafeT <= 0) { strafe *= -1; strafeT = 9999; }  // one consistent direction
        if (dist < 18) down.push('F');
      }
      if (!aim) { p.lock.targets = []; p.lock.hard = false; }
      if (aim) {
        const want = Math.atan2(-(aim.pos.x - p.pos.x), -(aim.pos.z - p.pos.z));
        let dy = want - p.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
        look = [Math.max(-0.14, Math.min(0.14, dy * 0.28)), 0];
        // commit to the target: soft lock would otherwise quietly re-aim the chaser at the
        // commander and make both policies identical
        p.lock.targets = [aim]; p.lock.hard = true;
      }
      const threat = live.find(h => h.state === 'windup' && h.windupRemaining <= 0.24 && h.windupRemaining > 0.02);
      if (threat && p.energy > 22) down.push('SHIFT');

      const relaysBefore = relays.length;
      g.input.scripted = { down, look };
      g.tick(1/60);
      ticks++;
      if (!boss.screened) exposedTicks++;
      const relaysAfter = g.hostiles.filter(h => h.alive && h.archetype === 'relay').length;
      if (relaysAfter < relaysBefore) relayKills += relaysBefore - relaysAfter;
      if (!boss.alive) { outcome = 'boss down'; break; }
      if (p.vitals.structure <= 0 || g.mode !== 'run') { outcome = 'frame lost'; break; }
    }
    g.input.scripted = null;
    out.push({
      seed, outcome, seconds: f / 60,
      bossStructurePct: Math.round(boss.vitals.structure / boss.vitals.structureMax * 100),
      damageDealt: Math.round(boss.damageTaken),
      damageRefused: Math.round(boss.damageRefused),
      exposedPct: Math.round(exposedTicks / Math.max(1, ticks) * 100),
      relayKills,
      hp: Math.round(g.player.vitals.structure),
    });
  }
  g.renderEnabled = true; g.uiEnabled = true;
  return out;
}`;

const seeds = Array.from({ length: RUNS }, (_, i) => `GM${i}`);
const rows = {};
for (const policy of ['chaser', 'rotator']) {
  rows[policy] = await page.evaluate(([src, policy, seeds, cap]) => eval(src)(policy, seeds, cap), [SIM, policy, seeds, CAP]);
}
const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
console.log('POLICY    KILLS  OUTCOME(boss down)  BOSS STRUCT LEFT  DMG DEALT  DMG REFUSED  EXPOSED%  RELAY KILLS  PLAYER HP');
for (const policy of ['chaser', 'rotator']) {
  const r = rows[policy];
  const wins = r.filter(x => x.outcome === 'boss down').length;
  console.log(
    policy.padEnd(10),
    String(wins + '/' + r.length).padEnd(6),
    String((wins / r.length * 100).toFixed(0) + '%').padEnd(20),
    String(Math.round(mean(r, x => x.bossStructurePct)) + '%').padEnd(18),
    String(Math.round(mean(r, x => x.damageDealt))).padEnd(11),
    String(Math.round(mean(r, x => x.damageRefused))).padEnd(13),
    String(Math.round(mean(r, x => x.exposedPct)) + '%').padEnd(10),
    String(mean(r, x => x.relayKills).toFixed(1)).padEnd(13),
    Math.round(mean(r, x => x.hp)),
  );
}
console.log('\nERRORS:', errs.length ? errs.slice(0,4).join('\n') : 'clean');
await browser.close();
