/**
 * CHECKPOINT F — the first 100 seconds.
 *
 * The gate: "the 0:35 → 0:50 beat lands: a first-time player sees TOKENS go 1 → 2 → 1 without
 * reading anything." A scripted first-timer plays the orientation; the run records the token
 * count it was SHOWN at every beat, and the harness asserts the 1 → 2 → 1 shape.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 900, height: 540 } });
const errs = []; page.on('pageerror', (e) => errs.push(`${e.message} | ${(e.stack||'').split('\n')[1]}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// --- the entry point itself is part of the gate: a first launch must offer ORIENTATION
const entry = await page.evaluate(() => {
  const b = document.getElementById('btnOrient');
  return { present: !!b, urged: !!b && b.className.includes('urge'), label: b?.textContent?.trim() };
});
await page.click('#btnOrient');
await page.waitForTimeout(700);

const SIM = `(cap) => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  if (g.mode !== 'tutorial') g.startOnboarding();
  const ob = g.onboarding;
  const p = g.player;
  const beatLog = [];
  let last = null;
  const frames = Math.round(cap * 60);
  let f = 0;
  for (; f < frames && !ob.finished; f++) {
    const beat = ob.beat.id;
    if (beat !== last) { beatLog.push({ beat, at: +(f / 60).toFixed(1) }); last = beat; }
    const live = g.hostiles.filter(h => h.alive);
    const down = [];
    let look = [0, 0];
    let face = null;

    // centroid of the live group — what a player "keep them in front" actually aims at
    const cen = live.length ? live.reduce((a, h) => a.add(h.pos.clone()), new (p.pos.constructor)(0,0,0)).multiplyScalar(1/live.length) : null;
    const nearest = live.reduce((b, h) => (!b || h.pos.distanceTo(p.pos) < b.pos.distanceTo(p.pos)) ? h : b, null);

    if (beat === 'launch') { down.push('W'); }
    else if (beat === 'first-kill') {
      face = nearest;
      if (nearest) {
        const d = nearest.pos.distanceTo(p.pos);
        if (d > 16) down.push('W');
        down.push('MOUSE1');
        if (d < 17) down.push('F');
      }
    } else if (beat === 'two-in-front') {
      face = cen ? { pos: cen } : null;
      down.push('S');                        // hold the group at range so both stay in the arc
    } else if (beat === 'flanked') {
      // do nothing but hold station: the formation closes around and the second token lands
      face = null;
    } else if (beat === 'rotate') {
      // the lesson: the arc is a fact about the FORMATION, so break out of the middle
      if (cen) {
        const ax = p.pos.x - cen.x, az = p.pos.z - cen.z;
        face = { pos: { x: p.pos.x + ax, z: p.pos.z + az } };
      }
      down.push('W'); down.push('E');
    } else if (beat === 'vanish') {
      face = nearest;
      const t = live.find(h => h.state === 'windup');
      if (t && t.windupRemaining <= 0.26 && t.windupRemaining > 0.04 && p.energy > 30) down.push('SHIFT');
      down.push('W');
    } else if (beat === 'convert') {
      const st = live.find(h => h.vitals && h.vitals.staggered) || nearest;
      face = st;
      if (st) {
        const d = st.pos.distanceTo(p.pos);
        if (d > 15) down.push('W');
        down.push('MOUSE1');
        if (d < 17) down.push('F');
      }
    } else if (beat === 'launch-out') {
      const n = g.stops[0];
      const dz = n ? n.volume.z1 - p.pos.z : 0;
      face = { pos: { x: p.pos.x, z: p.pos.z + 100 } };
      down.push('W'); down.push('E');
      if (dz < 0) down.length = 0;
    }

    if (face && face.pos) {
      const want = Math.atan2(-(face.pos.x - p.pos.x), -(face.pos.z - p.pos.z));
      let dy = want - p.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
      look = [Math.max(-0.16, Math.min(0.16, dy * 0.3)), 0];
    }
    g.input.scripted = { down, look };
    g.tick(1/60);
    if (p.vitals.structure <= 0) break;
  }
  g.input.scripted = null;
  const story = ob.tokenStory();
  g.renderEnabled = true; g.uiEnabled = true;
  return {
    seconds: +(f / 60).toFixed(1),
    finished: ob.finished,
    beats: beatLog,
    story,
    hp: Math.round(p.vitals.structure),
    mode: g.mode,
    onboardedFlag: !!(window.__dev.settings ? window.__dev.settings().onboarded : true),
  };
}`;

const r = await page.evaluate(([src, cap]) => eval(src)(cap), [SIM, Number(process.env.CAP ?? 180)]);

console.log('=== CHECKPOINT F — THE FIRST 100 SECONDS ===');
console.log('ENTRY POINT           ', entry.present ? `${entry.label} present${entry.urged ? ' · nudged on first launch' : ''}` : 'MISSING');
console.log('COMPLETED             ', r.finished, `in ${r.seconds}s`, `(structure ${r.hp})`);
console.log('BEATS                 ', r.beats.map(b => `${b.beat}@${b.at}s`).join(' → '));
console.log('');
console.log('TOKEN STORY (what the player was shown)');
for (const s of r.story) console.log('  ', String(s.beat).padEnd(14), 'ARC', (Math.round(s.arcLo) + '-' + Math.round(s.arcHi) + '°').padStart(10), ' TOKENS', s.tokens, ' HELD', s.secs + 's');

// --- the gate
const seq = [];
for (const s of r.story) { if (!seq.length || seq[seq.length-1].t !== s.tokens) seq.push({ t: s.tokens, beat: s.beat }); }
const iFlank = r.story.findIndex(s => s.beat === 'flanked' && s.tokens >= 2);
const beforeOne = r.story.slice(0, iFlank < 0 ? 0 : iFlank).some(s => s.tokens === 1);
const afterOne = iFlank >= 0 && r.story.slice(iFlank).some(s => (s.beat === 'rotate' || s.beat === 'vanish') && s.tokens === 1);
const beatSet = new Set(r.beats.map(b => b.beat));
const taught = ['launch','first-kill','two-in-front','flanked','rotate','vanish','convert','launch-out'].every(b => beatSet.has(b));

console.log('');
console.log('TOKEN TRANSITIONS     ', seq.map(s => `${s.t}(${s.beat})`).join(' → '));
console.log('1 BEFORE THE FLANK    ', beforeOne);
console.log('2 ON THE FLANK        ', iFlank >= 0);
console.log('1 AFTER THE ROTATE    ', afterOne);
console.log('ALL EIGHT BEATS TAUGHT', taught);
console.log('CONSOLE               ', errs.length ? errs.slice(0,4).join('\n') : 'clean');
console.log('');
console.log('CHECKPOINT F          ', (beforeOne && iFlank >= 0 && afterOne && taught && r.finished && !errs.length) ? 'PASS' : 'FAIL');
await browser.close();
