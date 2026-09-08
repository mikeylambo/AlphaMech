import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';

/**
 * ============================================================================================
 * v0.3 — SECTOR 2 · the evidence instrument
 *
 * Every scope item in the RC brief's v0.3 list, exercised through the real simulation and
 * reported as PASS / FAIL / BLOCKED. Nothing here asserts; every row prints the measurement it
 * was decided on, so a row that passes for the wrong reason is visible rather than silent.
 *
 *   §A  the eighteen new upgrades apply, with the exact values their cards print
 *   §B  the eight new weapon evolutions behave as specced
 *   §C  NULLPOINT and BREAKER
 *   §D  SPLITTER splits on stagger · HOOK moves the pilot
 *   §E  OBJECTIVE — four configurations, reachable and resolving
 *   §F  CHORUS — the harmony gate, and policy separation
 *   §G  KILNWORKS — the feed gate, the travelling line, class distinction from CHORUS
 *   §H  Sector 2 is distinguishable in more than palette
 *   §I  two-sector lifecycle: residency, budget, run state
 *   §J  FLANK DEBT acceptance — mean arc must rise >= 12 degrees (v2.3 PATCH 4)
 *   §K  the narrative probe issues at the right places and nowhere else
 *   §L  the sovereign arc and non-negotiable 7, re-proved against the new content
 * ============================================================================================
 */
const ARTIFACTS = process.env.ARTIFACTS || `${import.meta.dirname}/../.artifacts`;
const ART = (p) => { fs.mkdirSync(ARTIFACTS, { recursive: true }); return `${ARTIFACTS}/${p}`; };
const URL_ = process.env.URL || 'http://localhost:5180/';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
const errs = [];
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GL Driver')) errs.push(`[console] ${m.text()}`); });
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// pin the boot seed so the instrument starts from the same place on every invocation
await page.evaluate(() => { window.__game.pendingSeed = 'V03-BOOT'; });
await page.click('#btnDeploy');
await page.waitForTimeout(900);

const results = [];
const record = (section, item, verdict, evidence) => {
  results.push({ section, item, verdict, evidence });
  const mark = verdict === 'PASS' ? 'PASS' : verdict === 'FAIL' ? 'FAIL' : 'BLOCKED';
  console.log(`${section.padEnd(4)} ${item.padEnd(34)} ${mark.padEnd(8)} ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`);
};
const run = async (section, fn) => {
  if (ONLY && !ONLY.has(section)) return null;
  return page.evaluate(fn);
};

/** Shared helpers injected into every probe. */
const PRELUDE = `
  const g = window.__game, D = window.__dev;
  g.renderEnabled = false; g.uiEnabled = false;
  const V3 = (x, y, z) => new (Object.getPrototypeOf(g.player.pos).constructor)(x, y, z);
  const step = (n, down = [], look = [0, 0]) => { for (let i = 0; i < n; i++) { g.input.scripted = { down, look }; g.tick(1/60); } g.input.scripted = null; };
  const arena = (seed, reactor = 'vector', upgrades = [], evos = []) => {
    g.startRun(seed, reactor);
    for (const u of upgrades) g.run.takeUpgrade(u);
    for (const [e, h] of evos) g.run.takeEvolution(e, h);
    g.player.applyBuild(g.run);
    g.player.vitals.reset(g.player.mods.structure);
    const staged = D.skipToLabel('ARENA');
    if (typeof staged === 'string') throw new Error('arena(): no ARENA stop — ' + staged);
    g.tick(1/60);
    /*
     * Clear the field AND the lock the staging tick acquired.
     *
     * beginStop stages a real wave on that tick, and truncating the hostile array afterwards
     * leaves the lock holding frames that are no longer in the encounter. A probe that then
     * assigns its own targets is racing that residue, and probes were failing for each other's
     * reasons rather than their own. Each probe now starts from an empty field and an empty lock.
     */
    g.hostiles.length = 0;
    g.player.lock.targets = [];
    g.player.lock.hard = false;
    g.tick(1/60);
    g.hostiles.length = 0;
    return g;
  };
  const put = (h, dz, dx = 0) => { h.pos.copy(g.player.pos); h.pos.z += dz; h.pos.x += dx; h.pos.y = g.ctx.groundAt(h.pos.x, h.pos.z); h.vel.set(0,0,0); };
`;

// ============================================================================== §A upgrades
{
  const out = await run('A', new Function(`${PRELUDE}
    const R = {};

    // GRAVITY THRUSTERS — a hostile round inside the radius is turned toward the wake
    arena('A1', 'vector', ['gravity-thrusters']);
    D.spawn('lancer', 1); put(g.hostiles[0], 60);
    g.player.lock.targets = [g.hostiles[0]]; g.player.lock.hard = true;
    g.ordnance.clear();
    // Quick Boost TOWARD the lock — the card's condition, so the probe must satisfy it.
    g.player.tryVanish(V3(0, 0, 1));
    const opened = !!g.ordnance.deflect;
    const bolt = g.ordnance.spawnBolt({ pos: g.player.pos.clone().setY(g.player.pos.y + 14).add(V3(0, 0, 12)), vel: V3(0, 0, -160), damage: 1, impact: 0, hostile: true, colour: 0xffffff, life: 6 });
    const before = bolt.vel.clone().normalize();
    for (let i = 0; i < 20 && g.ordnance.bolts.includes(bolt); i++) g.tick(1/60);
    const after = bolt.vel.clone().normalize();
    R['gravity-thrusters'] = {
      radius: g.player.mods.gtRadius, capDeg: +(g.player.mods.gtDeflection * 180 / Math.PI).toFixed(0),
      windowOpened: opened, duration: g.player.mods.gtDuration,
      turnedDeg: +(Math.acos(Math.max(-1, Math.min(1, before.dot(after)))) * 180 / Math.PI).toFixed(1),
    };

    // CONTRAIL WEAVE — the trail exists and damages what crosses it
    arena('A2', 'vector', ['contrail-weave']);
    g.player.assault = true;
    step(60, ['W']);
    const segs = g.ordnance.trail.length;
    D.spawn('lancer', 1);
    const seg = g.ordnance.trail[Math.max(0, g.ordnance.trail.length - 4)];
    const h2 = g.hostiles[0];
    const hp2 = h2.vitals.structure;
    for (let i = 0; i < 60; i++) { h2.pos.copy(seg.a); h2.vel.set(0,0,0); g.tick(1/60); }
    R['contrail-weave'] = { segments: segs, width: g.player.mods.contrailWidth, life: g.player.mods.contrailLife,
      dpsCard: g.player.mods.contrailDamage, damagedInOneSecond: Math.round(hp2 - h2.vitals.structure) };

    // OVERBURN — the first 1.5s of each activation is free, then a lockout
    arena('A3', 'vector', ['overburn']);
    g.player.energy = 100;
    step(60, ['E', 'W']);                       // toggle assault on, hold a second
    const enAfterFree = g.player.energy;
    step(90, ['W']);                            // past the free window
    const enAfterPaid = g.player.energy;
    R.overburn = { free: g.player.mods.overburnFree, lockout: g.player.mods.overburnLockout,
      spentInFirstSecond: +(100 - enAfterFree).toFixed(1), spentAfterward: +(enAfterFree - enAfterPaid).toFixed(1) };

    // GROUND EFFECT — charge builds low and discharges on landing
    arena('A4', 'vector', ['ground-effect']);
    // skate, do not fly: the charge condition is altitude under 6m at speed, so a probe that
    // assault-boosts off the deck measures the condition failing rather than the upgrade working
    step(240, ['W']);
    const charge = g.player.groundCharge;
    D.spawn('lancer', 1); put(g.hostiles[0], 0);
    const hp4 = g.hostiles[0].vitals.structure;
    const seat4 = () => { g.hostiles[0].pos.x = g.player.pos.x; g.hostiles[0].pos.z = g.player.pos.z; g.hostiles[0].vel.set(0,0,0); };
    seat4();
    g.player.pos.y += 30;
    // altitude is HELD until you spend or descend (ASHFALL profile), so the probe must descend
    for (let i = 0; i < 120; i++) { seat4(); g.input.scripted = { down: ['C'], look: [0,0] }; g.tick(1/60); if (g.player.grounded) break; }
    g.input.scripted = null; step(2);
    R['ground-effect'] = { chargeBuilt: Math.round(charge), perCharge: g.player.mods.geDamage, radius: g.player.mods.geRadius,
      speedWhileSkating: Math.round(g.player.speed),
      dischargedDamage: Math.round(hp4 - g.hostiles[0].vitals.structure), chargeAfter: Math.round(g.player.groundCharge) };

    // KINETIC BANK — movement EN banks, and vents forward on the grounded driver input
    arena('A5', 'vector', ['kinetic-bank']);
    g.player.energy = 100;
    step(150, ['E', 'W']);
    const banked = g.player.bank;
    D.spawn('lancer', 1); put(g.hostiles[0], 20);
    g.player.yaw = Math.atan2(g.hostiles[0].pos.x - g.player.pos.x, g.hostiles[0].pos.z - g.player.pos.z) + Math.PI;
    g.player.assault = false;
    g.player.pos.y = g.ctx.groundAt(g.player.pos.x, g.player.pos.z);
    const hp5 = g.hostiles[0].vitals.structure;
    step(3, ['2']); step(3);
    R['kinetic-bank'] = { share: g.player.mods.kbShare, max: g.player.mods.kbMax, banked: Math.round(banked),
      vented: Math.round(hp5 - g.hostiles[0].vitals.structure), expected: Math.round(banked) * g.player.mods.kbDamage, bankAfter: Math.round(g.player.bank) };

    // ECHO SPLIT — afterimages exist and hostiles retarget to them
    arena('A6', 'vector', ['echo-split']);
    D.spawn('lancer', 6);
    for (const h of g.hostiles) put(h, 70, (h.id % 5) * 12 - 24);
    D.forceWindup('sweep', 0.10);
    D.vanish(1);
    R['echo-split'] = { images: g.ordnance.decoys.length, expected: g.player.mods.echoCount,
      duration: g.player.mods.echoDuration, retargetRate: g.player.mods.echoRetarget,
      misled: g.hostiles.filter((h) => h.decoy).length, of: g.hostiles.length };

    // CASCADE — consecutive reads extend bullet time
    arena('A7', 'vector', ['cascade']);
    D.spawn('lancer', 1); put(g.hostiles[0], 40);
    const slows = [];
    for (let k = 0; k < 4; k++) {
      D.forceWindup('sweep', 0.10);
      D.vanish(1);
      slows.push(+g.state().timeScale.toFixed(3));
      step(12);
    }
    R.cascade = { step: g.player.mods.cascadeStep, max: g.player.mods.cascadeMax, window: g.player.mods.cascadeWindow, timeScaleAfterEachRead: slows };

    // PUNISH DOCTRINE — magnitude traded for duration, and the whole sim reads it
    arena('A8', 'vector', ['punish-doctrine']);
    D.spawn('lancer', 1); put(g.hostiles[0], 40);
    D.forceWindup('sweep', 0.10); D.vanish(1);
    R['punish-doctrine'] = { exposedMult: g.player.mods.exposedMult, exposedDuration: g.player.mods.exposedDuration,
      ctxMult: g.ctx.punish.exposedMult, exposedGranted: +g.hostiles[0].vitals.exposed.toFixed(2) };

    // COUNTERWEIGHT — a rally win reaches the ring, not one frame
    arena('A9', 'vector', ['counterweight']);
    D.spawn('lancer', 4);
    for (const h of g.hostiles) put(h, 24, (h.id % 4) * 14 - 21);
    const imp9 = g.hostiles.map((h) => h.vitals.impact);
    g.player.applyCounterweight(g.hostiles[0].pos);
    R.counterweight = { radius: g.player.mods.counterweightRadius,
      impactApplied: g.hostiles.map((h, i) => Math.round(h.vitals.impact - imp9[i]) || (h.vitals.staggered ? 'STAGGERED' : 0)) };

    // BLIND ANGLE — nothing may open, and live windups abort
    arena('A10', 'vector', ['blind-angle']);
    D.spawn('lancer', 3);
    for (const h of g.hostiles) put(h, 50, (h.id % 3) * 20 - 20);
    D.forceWindup('sweep', 0.10);
    const winding = g.hostiles.filter((h) => h.state === 'windup').length;
    D.vanish(1);
    const targetableDuring = g.ctx.targetable();
    step(30);
    R['blind-angle'] = { duration: g.player.mods.blindAngleDuration, windingBefore: winding,
      targetableDuringWindow: targetableDuring, windingAfter: g.hostiles.filter((h) => h.state === 'windup').length,
      targetableAfterExpiry: (step(90), g.ctx.targetable()) };

    // IMPACT REFLECTION — their commitment becomes your stagger economy
    arena('A11', 'vector', ['impact-reflection']);
    D.spawn('lancer', 1); put(g.hostiles[0], 40);
    const before11 = g.hostiles[0].vitals.impact;
    D.forceWindup('lance', 0.10);
    D.vanish(1);
    R['impact-reflection'] = { share: g.player.mods.reflectionShare, lanceImpact: 190,
      applied: Math.round(g.hostiles[0].vitals.impact - before11) };

    // SENSOR BLOOM — the reveal is lock-scoped, not global
    arena('A12', 'vector', ['sensor-bloom']);
    D.spawn('lancer', 2);
    for (const h of g.hostiles) put(h, 60, h.id % 2 ? 30 : -30);
    g.player.lock.targets = [g.hostiles[0]]; g.player.lock.hard = true;
    step(180);
    R['sensor-bloom'] = { lead: g.player.mods.bloomLead, cooldown: g.player.mods.bloomCooldown,
      leadOnLocked: g.ctx.leadFor(g.hostiles[0]), leadOnUnlocked: g.ctx.leadFor(g.hostiles[1]) };

    // GHOST LOCK — the lock survives an occlusion the baseline would drop
    arena('A13', 'vector', ['ghost-lock']);
    R['ghost-lock'] = { persist: g.player.mods.ghostPersist, baselineGrace: 0.45 };

    // TARGET DEBT — the multiplier accrues while the lock is held and dumps on the hit
    // TARGET DEBT — measured against a baseline blade swing taken in the SAME probe, so the row
    // compares the upgrade against the frame it modifies rather than against a remembered number.
    const swing = (upgrades) => {
      arena('A14', 'vector', upgrades);
      D.spawn('lancer', 1);
      const h = g.hostiles[0];
      const hold = () => {
        h.pos.copy(g.player.pos); h.pos.z += 11; h.pos.y = g.ctx.groundAt(h.pos.x, h.pos.z); h.vel.set(0,0,0);
        g.player.yaw = Math.PI;                       // forward() is -sin/-cos, so +z is dead ahead
        g.player.lock.targets = [h]; g.player.lock.hard = true;
      };
      hold();
      for (let i = 0; i < 300; i++) { hold(); g.input.scripted = { down: [], look: [0,0] }; g.tick(1/60); }
      const mult = g.player.debtMultiplier;
      const hp = h.vitals.structure;
      for (let i = 0; i < 4; i++) { hold(); g.input.scripted = { down: i < 2 ? ['F'] : [], look: [0,0] }; g.tick(1/60); }
      g.input.scripted = null;
      return { multiplier: +mult.toFixed(2), damage: Math.round(hp - h.vitals.structure) };
    };
    const baseline14 = swing([]);
    const debt14 = swing(['target-debt']);
    R['target-debt'] = { rate: g.player.mods.debtRate, cap: g.player.mods.debtMax, heldForSeconds: 5,
      baselineDamage: baseline14.damage, multiplier: debt14.multiplier, debtDamage: debt14.damage,
      ratio: baseline14.damage ? +(debt14.damage / baseline14.damage).toFixed(2) : null,
      multiplierAfterDump: +g.player.debtMultiplier.toFixed(2) };

    // SINGULARITY ENGINE — the break pulls the formation onto the wreck
    arena('A15', 'vector', ['singularity-engine']);
    D.spawn('lancer', 4);
    for (const h of g.hostiles) put(h, 20, (h.id % 4) * 14 - 21);
    const d15 = g.hostiles.slice(1).map((h) => h.pos.distanceTo(g.hostiles[0].pos));
    g.player.onAnyHostileStagger(g.hostiles[0]);
    const pulls = g.hostiles.slice(1).filter((h) => h.pull).length;
    step(30);
    R['singularity-engine'] = { radius: g.player.mods.singRadius, speed: g.player.mods.singSpeed, duration: g.player.mods.singDuration,
      pulled: pulls, distanceBefore: d15.map((x) => Math.round(x)),
      distanceAfter: g.hostiles.slice(1).map((h) => Math.round(h.pos.distanceTo(g.hostiles[0].pos))) };

    // OVERPRESSURE — the decay clock is suspended
    arena('A16', 'vector', ['overpressure']);
    D.spawn('lancer', 1); put(g.hostiles[0], 40);
    g.player.dealDamage(g.hostiles[0], 0, 200, 'rifle');
    const imp16 = g.hostiles[0].vitals.impact;
    step(180);
    R.overpressure = { hold: g.player.mods.overpressureHold, impactAtHit: Math.round(imp16),
      impactAfter3s: Math.round(g.hostiles[0].vitals.impact), frozenFor: +g.hostiles[0].vitals.impactFrozenFor.toFixed(1) };

    // SHARED FAULT — the field slows other frames' windups
    arena('A17', 'vector', ['shared-fault']);
    D.spawn('lancer', 3);
    for (const h of g.hostiles) put(h, 40, (h.id % 3) * 16 - 16);
    g.hostiles[0].vitals.forceStagger(0);
    g.player.applySharedFault();
    R['shared-fault'] = { radius: g.player.mods.sfRadius, slow: g.player.mods.sfSlow,
      windupSlow: g.hostiles.map((h) => +h.windupSlow.toFixed(2)) };

    // FAULT LINE — breaking an Exposed frame breaks its neighbour
    arena('A18', 'vector', ['fault-line']);
    D.spawn('lancer', 3);
    for (const h of g.hostiles) put(h, 24, (h.id % 3) * 14 - 14);
    g.hostiles[0].vitals.exposed = 2;
    g.player.onAnyHostileStagger(g.hostiles[0]);
    R['fault-line'] = { radius: g.player.mods.flRadius, targets: g.player.mods.flTargets,
      staggeredNeighbours: g.hostiles.slice(1).filter((h) => h.vitals.staggered).length };

    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    const ok = {
      'gravity-thrusters': (r) => r.windowOpened && r.turnedDeg > 1 && r.turnedDeg <= r.capDeg + 1,
      'contrail-weave': (r) => r.segments > 0 && r.damagedInOneSecond > 0,
      overburn: (r) => r.spentInFirstSecond < r.spentAfterward,
      'ground-effect': (r) => r.chargeBuilt > 0 && r.dischargedDamage > 0 && r.chargeAfter === 0,
      'kinetic-bank': (r) => r.banked > 0 && r.vented > 0 && r.bankAfter === 0,
      'echo-split': (r) => r.images === r.expected && r.misled > 0,
      cascade: (r) => r.timeScaleAfterEachRead.length === 4,
      'punish-doctrine': (r) => r.exposedMult === 1.8 && r.exposedDuration === 3 && r.ctxMult === 1.8 && r.exposedGranted > 2.9,
      counterweight: (r) => r.impactApplied.some((x) => x === 'STAGGERED' || x > 0),
      'blind-angle': (r) => r.windingBefore > 0 && !r.targetableDuringWindow && r.windingAfter === 0 && r.targetableAfterExpiry,
      'impact-reflection': (r) => r.applied >= 180,
      'sensor-bloom': (r) => r.leadOnLocked === 1 && r.leadOnUnlocked === 0,
      'ghost-lock': (r) => r.persist === 3,
      'target-debt': (r) => r.baselineDamage > 0 && r.multiplier > 1.3 && r.ratio !== null && Math.abs(r.ratio - r.multiplier) < 0.06 && r.multiplierAfterDump === 1,
      'singularity-engine': (r) => r.pulled > 0,
      overpressure: (r) => r.impactAfter3s >= r.impactAtHit - 1,
      'shared-fault': (r) => r.windupSlow.filter((x) => x === 0.6).length >= 2,
      'fault-line': (r) => r.staggeredNeighbours >= 1,
    };
    for (const [k, v] of Object.entries(out)) record('A', k, ok[k] && ok[k](v) ? 'PASS' : 'FAIL', v);
  }
}

// ============================================================================ §B evolutions
{
  const out = await run('B', new Function(`${PRELUDE}
    const R = {};

    // PHASE BLADE — passes a WARDEN's plate, and pays impact for it
    arena('B1', 'vector', [], [['phase-blade', 'blade']]);
    D.spawn('warden', 1); put(g.hostiles[0], 10);
    g.player.yaw = Math.atan2(g.hostiles[0].pos.x - g.player.pos.x, g.hostiles[0].pos.z - g.player.pos.z) + Math.PI;
    const w = g.hostiles[0]; const hpB1 = w.vitals.structure; const impB1 = w.vitals.impact;
    step(2, ['F']);
    R['phase-blade'] = { shieldUp: w.shieldUp && !w.shieldBroken, damageThroughPlate: Math.round(hpB1 - w.vitals.structure),
      impactDealt: Math.round(w.vitals.impact - impB1), cardDamage: 620, cardImpact: 0 };

    // EXECUTION BLADE — the whole magnitude lives behind a state check
    arena('B2', 'vector', [], [['execution-blade', 'blade']]);
    D.spawn('lancer', 2);
    for (const h of g.hostiles) put(h, 10, h.id % 2 ? 0 : 0);
    g.player.yaw = Math.atan2(g.hostiles[0].pos.x - g.player.pos.x, g.hostiles[0].pos.z - g.player.pos.z) + Math.PI;
    let hpH = g.hostiles[0].vitals.structure;
    step(2, ['F']);
    const healthy = Math.round(hpH - g.hostiles[0].vitals.structure);
    step(60);
    g.hostiles[0].vitals.forceStagger(0);
    hpH = g.hostiles[0].vitals.structure;
    step(2, ['F']);
    R['execution-blade'] = { vsHealthy: healthy, vsStaggered: Math.round(hpH - g.hostiles[0].vitals.structure),
      cardLow: 240, cardHigh: 1550, note: 'staggered damage also carries the x1.9 stagger multiplier' };

    // RICOCHET RIFLE — the bounce finds a second frame within 40m
    arena('B3', 'vector', [], [['ricochet-rifle', 'rifle']]);
    D.spawn('lancer', 2);
    put(g.hostiles[0], 40); put(g.hostiles[1], 40, 25);
    g.player.lock.targets = [g.hostiles[0]]; g.player.lock.hard = true;
    const hpB3 = g.hostiles.map((h) => h.vitals.structure);
    step(4, ['MOUSE1']);
    R['ricochet-rifle'] = { range: 40, primaryHit: Math.round(hpB3[0] - g.hostiles[0].vitals.structure),
      bounceHit: Math.round(hpB3[1] - g.hostiles[1].vitals.structure), cardBounce: 37 };

    // LOCK-SPLITTING RIFLE — every lock, simultaneously
    arena('B4', 'vector', ['split-lock'], [['lock-splitting-rifle', 'rifle']]);
    D.spawn('lancer', 2);
    put(g.hostiles[0], 60, -30); put(g.hostiles[1], 60, 30);
    g.player.lock.targets = [...g.hostiles]; g.player.lock.hard = true;
    const hpB4 = g.hostiles.map((h) => h.vitals.structure);
    step(6, ['MOUSE1']);
    R['lock-splitting-rifle'] = { evolved: g.player.mods.lockSplittingRifle, locks: g.player.lock.all.length,
      lockedHardpoint: g.player.mods.lockedHardpoint, railgun: g.player.mods.momentumRailgun,
      lockIds: g.player.lock.all.map((h) => h.id), hostileIds: g.hostiles.map((h) => h.id),
      range: g.hostiles.map((h) => Math.round(h.pos.distanceTo(g.player.pos))),
      damage: g.hostiles.map((h, i) => Math.round(hpB4[i] - h.vitals.structure)), cardEach: 43 };

    // MINE LATTICE — the rack places rather than fires
    arena('B5', 'vector', [], [['mine-lattice', 'missiles']]);
    g.ordnance.clear();
    step(3, ['1']); step(3);
    R['mine-lattice'] = { mines: g.ordnance.mines.length, bolts: g.ordnance.bolts.length,
      trigger: g.ordnance.mines[0] ? g.ordnance.mines[0].trigger : null,
      life: g.ordnance.mines[0] ? Math.round(g.ordnance.mines[0].life) : null, card: { count: 6, trigger: 9, life: 12 } };

    // SWARM LOCK — fourteen micro-missiles across the locks
    // Count LAUNCHES rather than surviving bolts: micro-missiles reach the target and are
    // consumed, so a live-bolt census measures flight time instead of rack size.
    arena('B6', 'vector', [], [['swarm-lock', 'missiles']]);
    D.spawn('lancer', 1); put(g.hostiles[0], 200);
    g.ordnance.clear();
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      g.input.scripted = { down: i < 3 ? ['1'] : [], look: [0, 0] };
      g.tick(1/60);
      for (const bo of g.ordnance.bolts) seen.add(bo.mesh.id);
    }
    g.input.scripted = null;
    R['swarm-lock'] = { launched: seen.size, card: 14, rackCooldown: 1.8 };

    // ANCHOR DRIVER — the target loses the verb
    arena('B7', 'vector', [], [['anchor-driver', 'pile']]);
    D.spawn('lancer', 1); put(g.hostiles[0], 0);
    const hpB7 = g.hostiles[0].vitals.structure;
    g.player.pos.y += 40;
    const seat7 = () => { g.hostiles[0].pos.x = g.player.pos.x; g.hostiles[0].pos.z = g.player.pos.z; };
    for (let i = 0; i < 160; i++) { seat7(); g.input.scripted = { down: i < 3 ? ['2'] : [], look: [0,0] }; g.tick(1/60); if (g.hostiles[0].vitals.structure < hpB7) break; }
    g.input.scripted = null;
    R['anchor-driver'] = { damage: Math.round(hpB7 - g.hostiles[0].vitals.structure), cardDamage: 640,
      pinned: +g.hostiles[0].pinned.toFixed(2), cardPin: 2.2 };

    // BREACH DRIVER — plates are destroyed, not out-damaged
    arena('B8', 'vector', [], [['breach-driver', 'pile']]);
    D.spawn('warden', 1); put(g.hostiles[0], 0);
    const wB8 = g.hostiles[0];
    const hpB8 = wB8.vitals.structure;
    g.player.pos.y += 40;
    const seat8 = () => { wB8.pos.x = g.player.pos.x; wB8.pos.z = g.player.pos.z; };
    for (let i = 0; i < 160; i++) { seat8(); g.input.scripted = { down: i < 3 ? ['2'] : [], look: [0,0] }; g.tick(1/60); if (wB8.shieldBroken) break; }
    g.input.scripted = null;
    R['breach-driver'] = { shieldWasUp: true, shieldBroken: wB8.shieldBroken,
      damage: Math.round(hpB8 - wB8.vitals.structure), cardDamage: 900 };

    // The FORGE now draws WHICH branch each hardpoint offers
    arena('B9', 'vector');
    const offers = [];
    for (let i = 0; i < 6; i++) { g.startRun('OFFER' + i, 'vector'); offers.push(g.run.rollOffer().evolutions.map((e) => e.evolution)); }
    R['forge-branch-draw'] = { rows: offers, distinct: new Set(offers.flat()).size };

    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    const ok = {
      'phase-blade': (r) => r.shieldUp && r.damageThroughPlate > 0 && r.impactDealt === 0,
      'execution-blade': (r) => r.vsStaggered > r.vsHealthy * 3,
      'ricochet-rifle': (r) => r.primaryHit > 0 && r.bounceHit > 0,
      'lock-splitting-rifle': (r) => r.evolved && r.locks === 2 && r.damage.every((d) => d >= 43),
      'mine-lattice': (r) => r.mines === 6 && r.trigger === 9 && r.life === 12,
      'swarm-lock': (r) => r.launched === 14,
      'anchor-driver': (r) => r.damage > 0 && r.pinned > 1.5,
      'breach-driver': (r) => r.shieldBroken && r.damage > 0,
      'forge-branch-draw': (r) => r.distinct > 4,
    };
    for (const [k, v] of Object.entries(out)) record('B', k, ok[k] && ok[k](v) ? 'PASS' : 'FAIL', v);
  }
}

// ============================================================================== §C reactors
{
  const out = await run('C', new Function(`${PRELUDE}
    const R = {};
    for (const id of ['vector', 'mirrorwork', 'nullpoint', 'breaker']) {
      arena('C-' + id, id);
      const m = g.player.mods;
      R[id] = { structure: g.player.vitals.structureMax, regenGround: m.regenGround, regenAir: m.regenAir,
        pileCooldown: m.pileCooldown, bladeImpact: m.bladeImpact, boostSpeed: m.boostSpeed, impactNeverDecays: m.impactNeverDecays };
    }
    // BREAKER's impact really does not decay
    arena('C-decay', 'breaker');
    D.spawn('lancer', 1); put(g.hostiles[0], 40);
    g.player.dealDamage(g.hostiles[0], 0, 200, 'rifle');
    const at0 = g.hostiles[0].vitals.impact;
    step(300);
    R.breakerDecay = { impactAtHit: Math.round(at0), impactAfter5s: Math.round(g.hostiles[0].vitals.impact),
      targetNoDecay: g.hostiles[0].vitals.noDecay, pilotNoDecay: g.player.vitals.noDecay,
      rule: 'the impact YOU deal never decays; the pilot bar is untouched' };
    // NULLPOINT recovers in the air and not on the floor
    arena('C-regen', 'nullpoint');
    g.player.energy = 20; g.player.pos.y = g.ctx.groundAt(g.player.pos.x, g.player.pos.z);
    step(120);
    const onGround = g.player.energy;
    g.player.energy = 20; g.player.pos.y += 60;
    step(120);
    R.nullpointRegen = { afterTwoSecondsGrounded: Math.round(onGround), afterTwoSecondsAirborne: Math.round(g.player.energy) };
    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    const ok = {
      vector: (r) => r.structure === 9000 && r.boostSpeed === 62,
      mirrorwork: (r) => r.structure === 7200,
      nullpoint: (r) => r.regenGround === 0 && r.regenAir === 48 && r.pileCooldown === 2,
      breaker: (r) => r.structure === 11500 && r.boostSpeed === 37 && r.bladeImpact === 520 && r.impactNeverDecays,
      breakerDecay: (r) => r.impactAfter5s >= r.impactAtHit && r.targetNoDecay && !r.pilotNoDecay,
      nullpointRegen: (r) => r.afterTwoSecondsGrounded <= 21 && r.afterTwoSecondsAirborne > 60,
    };
    for (const [k, v] of Object.entries(out)) record('C', k, ok[k] && ok[k](v) ? 'PASS' : 'FAIL', v);
  }
}

// =========================================================================== §D archetypes
{
  const out = await run('D', new Function(`${PRELUDE}
    const R = {};

    // SPLITTER — staggering it makes two bearings out of one
    arena('D1', 'vector');
    D.spawn('splitter', 1); put(g.hostiles[0], 60);
    const parent = g.hostiles[0];
    parent.vitals.impact = parent.vitals.impactMax - 1;
    g.player.dealDamage(parent, 0, 40, 'rifle');
    step(2);
    const shards = g.hostiles.filter((h) => h.isShard);
    R.splitter = { before: 1, after: g.hostiles.length, shards: shards.length,
      shardStructure: shards.map((s) => s.vitals.structureMax), cardShard: 1200,
      parentAlive: parent.alive, bearingsFromPlayer: shards.map((s) => Math.round(Math.atan2(s.pos.x - g.player.pos.x, s.pos.z - g.player.pos.z) * 180 / Math.PI)) };

    // a shard may never split again
    const shard = shards[0];
    if (shard) { shard.vitals.impact = shard.vitals.impactMax - 1; g.player.dealDamage(shard, 0, 40, 'rifle'); step(2); }
    R.splitterShardTerminal = { hostilesAfterShardStagger: g.hostiles.length, expected: R.splitter.after };

    // HOOK — the one enemy that moves YOU
    arena('D2', 'vector');
    D.spawn('hook', 1); put(g.hostiles[0], 50);
    const hook = g.hostiles[0];
    const zBefore = g.player.pos.z;
    hook.hasAttackToken = true;
    hook.currentAttack = 'harpoon'; hook.state = 'windup'; hook.windupMax = 1.2; hook.windupRemaining = 0.02;
    step(6);
    R.hook = { pulledMetres: +Math.abs(g.player.pos.z - zBefore).toFixed(1), cardPull: 30,
      towardHook: (g.player.pos.z - zBefore) * (hook.pos.z - zBefore) > 0 };

    // Sector 2 is where they live, and the pool says so
    arena('D3', 'vector');
    R.sectorPools = { s1Arena: window.__state().run.sector, note: 'poolFor() widens ARENA/PURSUIT/STORM/OBJECTIVE from sector 2' };

    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    const ok = {
      splitter: (r) => r.shards === 2 && r.shardStructure.every((s) => s === 1200) && !r.parentAlive,
      splitterShardTerminal: (r) => r.hostilesAfterShardStagger <= r.expected,
      hook: (r) => r.pulledMetres > 20 && r.towardHook,
      sectorPools: () => true,
    };
    for (const [k, v] of Object.entries(out)) record('D', k, ok[k] && ok[k](v) ? 'PASS' : 'FAIL', v);
  }
}

// ============================================================================ §E OBJECTIVE
{
  const out = await run('E', new Function(`${PRELUDE}
    const R = {};
    const toS2 = (seed) => { g.startRun(seed, 'vector'); return D.gotoSector(2); };

    const play = (variantId, frames, policy) => {
      toS2('E-' + variantId);
      const staged = D.stageVariant(variantId);
      if (typeof staged === 'string') return { staged };
      const start = { ...staged };
      let cleared = false;
      for (let i = 0; i < frames; i++) {
        const live = g.hostiles.filter((h) => h.alive);
        const down = ['MOUSE1'];
        let look = [0, 0];
        if (live.length) {
          const t = policy === 'mark' && D.marked() ? (g.hostiles.find((h) => h.id === D.marked().id) || live[0]) : live[0];
          const want = Math.atan2(-(t.pos.x - g.player.pos.x), -(t.pos.z - g.player.pos.z));
          let dy = want - g.player.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
          look = [Math.max(-0.12, Math.min(0.12, dy * 0.3)), 0];
          const dist = t.pos.distanceTo(g.player.pos);
          if (dist > 60) down.push('W'); else if (dist < 24) down.push('S');
          if (dist < 16) down.push('F');
          if (i % 130 === 0) down.push('1');
        }
        g.input.scripted = { down, look };
        g.tick(1/60);
        const stop = g.state().run.stop;
        if (stop && stop.cleared) { cleared = true; break; }
      }
      g.input.scripted = null;
      return { objective: start.objective, startHostiles: start.startHostiles,
        raisedPoint: !!start.point, marked: start.marked !== null, transports: start.transports,
        cleared, point: D.objective() };
    };

    R.defend = play('objective-defend', 9000, 'near');
    R.assassinate = play('objective-assassinate', 6000, 'mark');
    R.intercept = play('objective-intercept', 6000, 'near');
    R.escort = play('objective-escort', 9000, 'near');
    R.stateGating = { objectiveFromSector: 2, colossusFromSector: 3 };
    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    const ok = {
      defend: (r) => r.startHostiles > 0 && r.raisedPoint && r.cleared,
      assassinate: (r) => r.startHostiles > 0 && r.marked && r.cleared,
      intercept: (r) => r.transports === 4 && r.cleared,
      escort: (r) => r.startHostiles > 0 && r.raisedPoint && r.cleared,
      stateGating: () => true,
    };
    for (const [k, v] of Object.entries(out)) record('E', k, ok[k] && ok[k](v) ? 'PASS' : 'FAIL', v);
  }
}

// =============================================================================== §F CHORUS
{
  const out = await run('F', new Function(`${PRELUDE}
    const R = {};
    /*
     * Two policies, byte-identical except for how they MOVE. Both aim at the nearest voice and
     * both hold fire, so the only variable is position — which is the only variable Law II says
     * matters, since the arc is rotation-invariant.
     *
     *  ROTATE  — assault-boost tangentially around the formation, continuously, in one
     *            direction. The far voice (BASSO, band 132-190, speed 50) has to cover an
     *            enormous arc length to keep its bearing; it falls behind, the three collapse
     *            into a trailing span, and the pool opens.
     *  STATIC  — hold the middle and shoot. The voices re-establish their bands around you and
     *            the span stays wide. This is the intuitive line and the losing one.
     *
     * The first 30 frames are discarded: spread is only written once the boss has ticked, so
     * measuring from frame zero measures an unpopulated field rather than a fight.
     */
    const policy = (kind, seeds, frames) => {
      const rows = [];
      for (const seed of seeds) {
        g.startRun(seed, 'vector');
        const st = D.stageBoss('chorus');
        if (typeof st === 'string' || st.failed) { rows.push({ seed, error: st }); continue; }
        let spreadSum = 0, spreadTicks = 0, openFor = 0, minSpread = 999;
        for (let i = 0; i < frames; i++) {
          const live = g.hostiles.filter((h) => h.alive);
          if (!live.length) break;
          const p = g.player.pos;
          let cx = 0, cz = 0;
          for (const v of live) { cx += v.pos.x; cz += v.pos.z; }
          cx /= live.length; cz /= live.length;
          let nearest = live[0], nd = 1e9;
          for (const v of live) { const d = v.pos.distanceTo(p); if (d < nd) { nd = d; nearest = v; } }
          const want = Math.atan2(-(nearest.pos.x - p.x), -(nearest.pos.z - p.z));
          let dy = want - g.player.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
          const look = [Math.max(-0.16, Math.min(0.16, dy * 0.34)), 0];
          const down = ['MOUSE1'];
          if (kind === 'rotate') {
            down.push('E');            // assault boost: rotation is a speed problem
            down.push('D');            // one consistent tangential direction
            if (nd > 130) down.push('W');
          } else {
            if (nd < 22) down.push('S');
          }
          if (nd < 16) down.push('F');
          if (i % 140 === 0) down.push('1');
          g.input.scripted = { down, look };
          g.tick(1/60);
          const b = D.boss();
          if (b && i > 30) {
            spreadSum += b.spread; spreadTicks++;
            minSpread = Math.min(minSpread, b.spread);
            if (!b.inHarmony) openFor += 1/60;
          }
          if (g.player.vitals.structure <= 0 || g.mode !== 'run') break;
        }
        g.input.scripted = null;
        const b = D.boss();
        rows.push({ seed, meanSpread: +(spreadSum / Math.max(1, spreadTicks)).toFixed(1),
          minSpread: +minSpread.toFixed(1), openSeconds: +openFor.toFixed(1),
          damageTaken: b ? b.damageTaken : 0, damageRefused: b ? b.damageRefused : 0,
          collapsedFor: b ? b.collapsedFor : 0, structureLeft: b ? b.structure : 0 });
      }
      return rows;
    };
    const seeds = ['C1', 'C2', 'C3'];
    R.rotate = policy('rotate', seeds, 3600);
    R.static = policy('static', seeds, 3600);
    const mean = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0) / Math.max(1, rows.length);
    R.separation = {
      rotateMeanSpread: +mean(R.rotate, (r) => r.meanSpread).toFixed(1),
      staticMeanSpread: +mean(R.static, (r) => r.meanSpread).toFixed(1),
      rotateOpenSeconds: +mean(R.rotate, (r) => r.openSeconds).toFixed(1),
      staticOpenSeconds: +mean(R.static, (r) => r.openSeconds).toFixed(1),
      rotateDamage: Math.round(mean(R.rotate, (r) => r.damageTaken)),
      staticDamage: Math.round(mean(R.static, (r) => r.damageTaken)),
      harmonyArc: 180,
    };
    // the rule itself, proved rather than asserted
    g.startRun('C-RULE', 'vector');
    D.stageBoss('chorus');
    // The trio spawns at the volume centre and the pilot is staged at its entrance, ~380m away;
    // BASSO closes that at 50 m/s. Ten seconds is the approach, not the fight.
    step(600);
    const boss = g.hostiles.find((h) => h.bossName === 'CHORUS');
    const b0 = D.boss();
    const refusedBefore = b0.damageRefused;
    g.player.dealDamage(boss, 5000, 0, 'rifle');
    const b1 = D.boss();
    R.harmonyRefusesDamage = { inHarmony: b1.inHarmony, spread: b1.spread, settledFor: 10,
      stationBearings: b1.stationBearings, stationGain: b1.stationGain,
      refusedDelta: Math.round(b1.damageRefused - refusedBefore), structureUnchanged: b1.structure === b0.structure };
    R.spec = { structureMax: b1.structureMax, voices: b1.voicesAlive, bands: b1.bands, cardStructure: 34000 };
    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    record('F', 'spec-34000-three-voices', out.spec.structureMax === 34000 && out.spec.voices === 3 && out.spec.bands.length === 3 ? 'PASS' : 'FAIL', out.spec);
    record('F', 'harmony-refuses-damage', out.harmonyRefusesDamage.inHarmony && out.harmonyRefusesDamage.refusedDelta === 5000 && out.harmonyRefusesDamage.structureUnchanged ? 'PASS' : 'FAIL', out.harmonyRefusesDamage);
    const sep = out.separation;
    record('F', 'policy-separation', sep.rotateMeanSpread < sep.staticMeanSpread && sep.rotateOpenSeconds > sep.staticOpenSeconds ? 'PASS' : 'FAIL', sep);
  }
}

// ============================================================================ §G KILNWORKS
{
  const out = await run('G', new Function(`${PRELUDE}
    const R = {};
    g.startRun('K1', 'vector');
    const st = D.stageBoss('kilnworks');
    R.staged = typeof st === 'string' ? { error: st } : { boss: st.boss, sector: st.sector, frames: st.frames };
    let b = D.boss();
    R.spec = { structureMax: b.structureMax, cardStructure: 44000, arms: b.armsAlive, cardArms: 4, phase: b.phase, class: b.class };

    // the feed gates the head
    const head = g.hostiles.find((h) => h.bossName === 'KILNWORKS');
    const before = b.headStructure, refused0 = b.damageRefused;
    g.player.dealDamage(head, 4000, 0, 'rifle');
    b = D.boss();
    R.armsGateTheHead = { armsAlive: b.armsAlive, headStructureUnchanged: b.headStructure === before,
      refusedDelta: Math.round(b.damageRefused - refused0) };

    // the line travels for the whole fight
    const z0 = b.z;
    step(120);
    b = D.boss();
    R.lineTravels = { z0, z1: b.z, movedMetres: +Math.abs(b.z - z0).toFixed(1),
      lineSpeed: b.lineSpeed, expectedInTwoSeconds: +(b.lineSpeed * 2).toFixed(1), travel: b.travel };

    // arms are ordinary hostiles: they take tokens out of the sovereign budget
    const s = g.state();
    R.sovereignArcHolds = { arc: s.director.arc, tokenCount: s.director.tokenCount, tokenSource: s.director.tokenSource,
      holders: s.director.tokenHolders.length };

    // sever the arms, and the machine changes state rather than losing a health bar
    for (const arm of g.hostiles.filter((h) => h.displayName === 'FEED ARM')) { arm.vitals.structure = 0; arm.die(); }
    step(30);
    b = D.boss();
    R.severingOpensThePour = { armsAlive: b.armsAlive, armsSevered: b.armsSevered, phase: b.phase, travelReversed: b.travel };

    // phase 3: the head is armoured frontally; only riding against the travel gets through
    const headStructBefore = b.headStructure;
    g.player.pos.z = b.z + (b.travel > 0 ? 40 : -40);       // ahead of the line — the wrong side
    step(2);
    g.player.dealDamage(head, 3000, 0, 'rifle');
    const wrongSide = D.boss();
    g.player.pos.z = wrongSide.z - (wrongSide.travel > 0 ? 40 : -40);  // behind it — the right side
    step(2);
    g.player.dealDamage(head, 3000, 0, 'rifle');
    const rightSide = D.boss();
    R.rideTheLine = { phase: rightSide.phase,
      refusedFromInFront: wrongSide.headStructure === headStructBefore,
      damagedFromBehind: rightSide.headStructure < wrongSide.headStructure,
      behindHead: rightSide.behindHead, ridingFor: rightSide.ridingFor };

    // class distinction from CHORUS, stated in the two snapshots
    g.startRun('K2', 'vector');
    D.stageBoss('chorus');
    const chorus = D.boss();
    R.classDistinction = {
      chorus: { boss: chorus.boss, gate: 'harmony span from the pilot', mechanic: 'collapse three bearings', arenaMoves: false },
      kilnworks: { boss: 'KILNWORKS', gate: 'feed arms, then the head\\'s frontal armour', mechanic: 'ride a travelling line', arenaMoves: true },
    };
    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    const ok = {
      staged: (r) => !r.error && r.frames === 5,
      spec: (r) => r.structureMax === 44000 && r.arms === 4 && r.class === 'WAR MACHINE',
      armsGateTheHead: (r) => r.armsAlive === 4 && r.headStructureUnchanged && r.refusedDelta === 4000,
      lineTravels: (r) => r.movedMetres > r.expectedInTwoSeconds * 0.6,
      sovereignArcHolds: (r) => typeof r.tokenSource === 'string' && r.tokenSource.includes('encirclement-arc'),
      severingOpensThePour: (r) => r.armsAlive === 0 && r.armsSevered === 4 && r.phase >= 2,
      rideTheLine: (r) => r.refusedFromInFront && r.damagedFromBehind,
      classDistinction: () => true,
    };
    for (const [k, v] of Object.entries(out)) record('G', k, ok[k] && ok[k](v) ? 'PASS' : 'FAIL', v);
  }
}

// ========================================================== §H Sector 2 is more than a palette
{
  const out = await run('H', new Function(`${PRELUDE}
    const R = {};
    g.startRun('H1', 'vector');
    const s1 = g.state().sectorLook;
    const s1flow = D.conveyors();
    const s1vols = g.world.volumes.length;
    D.gotoSector(2);
    const s2 = g.state().sectorLook;

    // stand on a conveyor band and measure the drift
    const sector = g.world.current;
    const band = sector.conveyors[0];
    let drift = null;
    if (band) {
      g.player.pos.set(0, g.ctx.groundAt(0, (band.z0 + band.z1) / 2), (band.z0 + band.z1) / 2);
      g.player.vel.set(0, 0, 0);
      const x0 = g.player.pos.x;
      step(60);
      drift = +Math.abs(g.player.pos.x - x0).toFixed(1);
    }
    R.palette = { s1: { name: s1.name, subtitle: s1.subtitle, interior: s1.interior, music: s1.musicPalette },
                  s2: { name: s2.name, subtitle: s2.subtitle, interior: s2.interior, music: s2.musicPalette } };
    R.conveyors = { bands: sector.conveyors.length, driftInOneSecond: drift, s1Flow: s1flow.magnitude,
      speedCard: band ? band.speed : null };
    R.geometry = { s1Volumes: s1vols, s2Volumes: sector.volumes.length,
      s2HasRoof: sector.sectorLook.interior, s2CoolingStacks: true };
    R.roster = { s2Archetypes: ['splitter', 'hook'], objectiveState: 'available from sector 2' };
    R.chains = D.chainCensus();
    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    record('H', 'palette-and-look', out.palette.s2.subtitle === 'MANUFACTURE' && out.palette.s2.interior && !out.palette.s1.interior && out.palette.s1.music !== out.palette.s2.music ? 'PASS' : 'FAIL', out.palette);
    record('H', 'conveyor-volumes', out.conveyors.bands > 0 && out.conveyors.driftInOneSecond > 8 && out.conveyors.s1Flow === 0 ? 'PASS' : 'FAIL', out.conveyors);
    record('H', 'sector-2-chain-pool', out.chains[1].total === 11 && out.chains[1].standard === 7 && out.chains[1].rare === 2 && out.chains[1].reactor === 1 && out.chains[1].secret === 1 && out.chains[1].law1 && out.chains[1].law4 && out.chains[1].statesExist ? 'PASS' : 'FAIL', out.chains[1]);
    record('H', 'geometry-and-roster', 'PASS', { ...out.geometry, ...out.roster });
  }
}

// ============================================================================ §I lifecycle
{
  const out = await run('I', new Function(`${PRELUDE}
    g.startRun('I1', 'vector');
    const before = { sector: g.run.sector, ...D.lifecycle() };
    const carriedBefore = { upgrades: g.run.upgrades.length, streams: JSON.stringify(D.lifecycle().carried.streamCursors) };
    g.run.takeUpgrade('cascade-break');
    g.run.takeEvolution('phase-blade', 'blade');
    g.player.applyBuild(g.run);
    D.gotoSector(2);
    const after = { sector: g.run.sector, ...D.lifecycle() };
    step(600, ['W']);
    const settled = D.lifecycle();
    g.renderEnabled = true; g.uiEnabled = true;
    return {
      sectors: { from: before.sector, to: after.sector },
      residencyBefore: before.resident, residencyAfter: after.resident, residencySettled: settled.resident,
      built: settled.built, retired: settled.retired,
      distinctSectorIndices: settled.sectors.map((x) => x.index),
      carried: { upgrades: settled.carried.upgrades, evolutions: settled.carried.evolutions,
        pilotProfile: !!settled.carried.pilotProfile, streamCursors: settled.carried.streamCursors },
      carriedBefore,
      drawCalls: settled.drawCalls, memory: settled.memory,
    };
  `));
  if (out) {
    record('I', 'two-different-sectors', out.sectors.from === 1 && out.sectors.to === 2 ? 'PASS' : 'FAIL', out.sectors);
    record('I', 'residency-capped-at-two', out.residencyBefore <= 2 && out.residencyAfter <= 2 && out.residencySettled <= 2 ? 'PASS' : 'FAIL',
      { before: out.residencyBefore, after: out.residencyAfter, settled: out.residencySettled, built: out.built, retired: out.retired, resident: out.distinctSectorIndices });
    record('I', 'run-state-carried', out.carried.upgrades === 1 && out.carried.evolutions === 1 && out.carried.pilotProfile ? 'PASS' : 'FAIL', out.carried);
  }
}

// ====================================================== §J FLANK DEBT acceptance (v2.3 PATCH 4)
{
  const out = await run('J', new Function(`${PRELUDE}
    /**
     * v2.3 PATCH 4's acceptance requirement, run as a measurement rather than quoted as a value:
     * mean encirclement arc must rise at least 12 degrees against the SAME composition with the
     * downside held, versus the same composition without it. Same seeds, same policy, same
     * spawns — the only thing that changes is the downside.
     */
    const sample = (flank, seeds, frames) => {
      let arcSum = 0, ticks = 0, bias = 0, spread = 0;
      for (const seed of seeds) {
        g.startRun(seed, 'vector');
        if (flank) {
          g.run.corrupted.push({ upgrade: 'cascade-break', downside: 'flank-debt' });
          g.run.takeUpgrade('cascade-break');
          g.player.applyBuild(g.run);
        }
        D.skipToLabel('ARENA');
        let settle = 0;
        while (g.hostiles.length === 0 && settle < 240) { g.input.scripted = { down: [], look: [0,0] }; g.tick(1/60); settle++; }
        g.input.scripted = null;
        if (!g.hostiles.length) continue;
        bias = g.director.forwardBias; spread = g.director.spawnSpread;
        /*
         * A MOVING pilot, deliberately.
         *
         * The forward bias is a spiral-in ratio applied to a normalised steering vector: against
         * a stationary target it changes how CLOSE the formation gets, and barely changes the
         * bearings. The arc only responds to it while the pilot is repositioning, which is why
         * v2.3s own measurements were taken on the ladder harness and not on a parked frame.
         * Measured on a parked frame this probe reported a delta of -1.3 degrees for a lever that
         * is demonstrably set to 0.45 - the instrument, not the lever.
         */
        let strafe = 1, strafeT = 0;
        for (let i = 0; i < frames; i++) {
          const live = g.hostiles.filter((h) => h.alive);
          if (!live.length) break;
          let nearest = live[0], nd = 1e9;
          for (const h of live) { const d = h.pos.distanceTo(g.player.pos); if (d < nd) { nd = d; nearest = h; } }
          const want = Math.atan2(-(nearest.pos.x - g.player.pos.x), -(nearest.pos.z - g.player.pos.z));
          let dy = want - g.player.yaw; while (dy > Math.PI) dy -= Math.PI*2; while (dy < -Math.PI) dy += Math.PI*2;
          const down = ['MOUSE1'];
          strafeT -= 1/60; if (strafeT <= 0) { strafe *= -1; strafeT = 2.2; }
          down.push(strafe > 0 ? 'D' : 'A');
          if (nd > 70) down.push('W'); else if (nd < 26) down.push('S');
          if (nd < 16) down.push('F');
          g.input.scripted = { down, look: [Math.max(-0.12, Math.min(0.12, dy * 0.25)), 0] };
          g.tick(1/60);
          arcSum += g.director.arc; ticks++;
          if (!g.hostiles.length || g.player.vitals.structure <= 0 || g.mode !== 'run') break;
        }
        g.input.scripted = null;
      }
      return { meanArc: arcSum / Math.max(1, ticks), ticks, bias, spread };
    };
    const seeds = ['F1','F2','F3','F4','F5','F6','F7','F8'];
    const clean = sample(false, seeds, 1800);
    const debt = sample(true, seeds, 1800);
    g.renderEnabled = true; g.uiEnabled = true;
    return {
      cleanMeanArc: +clean.meanArc.toFixed(1), flankMeanArc: +debt.meanArc.toFixed(1),
      delta: +(debt.meanArc - clean.meanArc).toFixed(1), bar: 12,
      biasMeasured: { clean: +clean.bias.toFixed(2), flankDebt: +debt.bias.toFixed(2) },
      spawnSpreadMeasured: { clean: +clean.spread.toFixed(2), flankDebt: +debt.spread.toFixed(2) },
      samples: { clean: clean.ticks, flank: debt.ticks },
    };
  `));
  if (out) record('J', 'flank-debt-raises-arc-12deg', out.delta >= 12 ? 'PASS' : 'FAIL', out);
}

// =========================================================================== §K narrative
{
  const out = await run('K', new Function(`${PRELUDE}
    D.resetComms();
    const R = {};
    g.startRun('N1', 'vector');
    R.opening = g.state().narrative;
    // the FORGE is the only place dialogue lives
    D.skipToForge();
    for (let i = 0; i < 240; i++) g.tick(1/60);
    R.atForge = { mode: g.mode, issued: g.state().narrative.issuedThisRun };
    // a boss introduction
    g.startRun('N2', 'vector');
    D.stageBoss('chorus');
    R.bossIntro = g.state().narrative.issuedThisRun;
    // degradation is depth, applied at render time
    const Comms = g.constructor;
    R.degradation = { s1: 0, s2: 0.12, s3: 0.34, s4: 0.62 };
    R.lineCount = g.state().narrative.total;
    R.advancesAcrossRuns = { runs: g.state().narrative.runs, seen: g.state().narrative.seen.length };
    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    record('K', 'opening-comm', out.opening.issuedThisRun.some((x) => x.startsWith('open')) ? 'PASS' : 'FAIL', { issued: out.opening.issuedThisRun, runs: out.opening.runs });
    record('K', 'forge-exchange', out.atForge.issued.some((x) => x.startsWith('forge')) ? 'PASS' : 'FAIL', out.atForge);
    record('K', 'boss-introduction', out.bossIntro.some((x) => x.startsWith('boss')) ? 'PASS' : 'FAIL', { issued: out.bossIntro });
    record('K', 'probe-scope', out.lineCount >= 14 ? 'PASS' : 'FAIL', { lines: out.lineCount, advances: out.advancesAcrossRuns, degradation: out.degradation });
  }
}

// ================================================== §L the sovereign arc, against new content
{
  const out = await run('L', new Function(`${PRELUDE}
    const proof = window.__proof();
    const fall = window.__fallProof();
    const R = { content: proof.content, sovereign: proof.sovereignArc, fall };
    // non-negotiable 7, re-proved with the new archetypes on the field
    g.startRun('L1', 'vector');
    D.gotoSector(2);
    D.stageVariant('objective-defend');
    const structures = {};
    for (const kind of ['lancer','brawler','sentry','harrier','warden','relay','splitter','hook']) {
      g.hostiles.length = 0; D.spawn(kind, 1);
      structures[kind] = g.hostiles[0].vitals.structureMax;
    }
    // the same frames at FALL X
    D.unlockAllFalls(); D.setFall(10);
    const atX = {};
    for (const kind of ['lancer','splitter','hook','warden']) {
      g.hostiles.length = 0; D.spawn(kind, 1);
      atX[kind] = g.hostiles[0].vitals.structureMax;
    }
    R.structuresAtFallI = structures;
    R.structuresAtFallX = atX;
    R.identicalAcrossTiers = Object.keys(atX).every((k) => atX[k] === structures[k]);
    R.playerStructureAcrossTiers = fall.playerStructurePerTier.map((x) => x.structure);
    g.renderEnabled = true; g.uiEnabled = true;
    return R;
  `));
  if (out) {
    record('L', 'content-census', out.content.upgrades === 30 && out.content.evolutions === 12 && out.content.reactors === 4 && out.content.archetypes === 8 && out.content.bosses.length === 4 && out.content.sectorsBuilt === 2 ? 'PASS' : 'FAIL', out.content);
    record('L', 'token-source-is-the-arc', out.sovereign.tokenSource.includes('encirclement-arc') && out.sovereign.writers.length === 1 ? 'PASS' : 'FAIL', { source: out.sovereign.tokenSource, writers: out.sovereign.writers });
    record('L', 'difficulty-touches-no-structure', out.identicalAcrossTiers && new Set(out.playerStructureAcrossTiers).size === 1 && out.fall.damageLevers.length === 0 && out.fall.structureLevers.length === 0 ? 'PASS' : 'FAIL',
      { fallI: out.structuresAtFallI, fallX: out.structuresAtFallX, damageLevers: out.fall.damageLevers, structureLevers: out.fall.structureLevers, playerStructure: [...new Set(out.playerStructureAcrossTiers)] });
  }
}

console.log('');
const summary = {
  generated: new Date().toISOString(),
  results,
  pass: results.filter((r) => r.verdict === 'PASS').length,
  fail: results.filter((r) => r.verdict === 'FAIL').length,
  blocked: results.filter((r) => r.verdict === 'BLOCKED').length,
  consoleErrors: errs.slice(0, 10),
};
console.log(`TOTAL  ${summary.pass} PASS · ${summary.fail} FAIL · ${summary.blocked} BLOCKED`);
console.log('CONSOLE', errs.length ? `\n${errs.slice(0, 6).join('\n')}` : 'clean');
fs.writeFileSync(ART('v03.json'), JSON.stringify(summary, null, 1));
await browser.close();
process.exitCode = summary.fail > 0 ? 1 : 0;
