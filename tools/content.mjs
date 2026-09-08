import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
page.on('pageerror', (e) => console.log('ERR', e.message, (e.stack||'').split('\n')[1]));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(600);

const out = await page.evaluate(() => {
  const g = window.__game;
  g.renderEnabled = false; g.uiEnabled = false;
  const R = {};
  const arena = (seed, reactor, upgrades = [], evos = []) => {
    g.startRun(seed, reactor);
    for (const u of upgrades) g.run.takeUpgrade(u);
    for (const [e, h] of evos) g.run.takeEvolution(e, h);
    g.player.applyBuild(g.run);
    g.player.vitals.reset(g.player.mods.structure);
    window.__dev.skipToLabel('ARENA');
    g.tick(1/60);
    return g;
  };
  const step = (n, down = []) => { for (let i = 0; i < n; i++) { g.input.scripted = { down, look: [0,0] }; g.tick(1/60); } g.input.scripted = null; };

  // ---- reactors
  arena('R1', 'vector');
  R.VECTOR = { structure: g.player.vitals.structureMax, vanishCost: g.player.mods.vanishCost, clone: g.player.mods.cloneDuration };
  arena('R2', 'mirrorwork');
  R.MIRRORWORK = { structure: g.player.vitals.structureMax, vanishCost: g.player.mods.vanishCost, clone: g.player.mods.cloneDuration };
  g.hostiles.length = 0; window.__dev.spawn('lancer', 1);
  window.__dev.forceWindup('sweep', 0.1);
  const enBefore = g.player.energy; window.__dev.vanish(1);
  R.MIRRORWORK.clonesAfterVanish = g.ordnance.clones.length;
  R.MIRRORWORK.enSpent = +(enBefore - g.player.energy).toFixed(1);

  // ---- ZERO-POINT REACTOR
  arena('U1', 'vector', ['zero-point-reactor']);
  R['zero-point-reactor'] = { ground: g.player.mods.regenGround, air: g.player.mods.regenAir };

  // ---- RAIL CORE: damage scales with velocity
  arena('U2', 'vector', ['rail-core']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 1);
  let h = g.hostiles[0]; let hp = h.vitals.structure;
  g.player.vel.set(0, 0, 0); g.player.dealDamage(h, 100, 0, 'rifle');
  const atRest = hp - h.vitals.structure; hp = h.vitals.structure;
  g.player.vel.set(0, 0, 200); g.player.dealDamage(h, 100, 0, 'rifle');
  R['rail-core'] = { at0: +atRest.toFixed(1), at200: +(hp - h.vitals.structure).toFixed(1) };

  // ---- VANISH BATTERY: absolute sign flip
  arena('U3', 'vector', ['vanish-battery']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 1);
  g.player.energy = 50; window.__dev.forceWindup('sweep', 0.1);
  const b = g.player.energy; window.__dev.vanish(1);
  R['vanish-battery'] = { before: b, after: +g.player.energy.toFixed(1) };

  // ---- PREDATOR READ
  arena('U4', 'vector', ['predator-read']);
  R['predator-read'] = { window: g.player.mods.vanishWindow, lead: g.player.mods.telegraphLead, ctxLead: g.ctx.telegraphLead };
  g.tick(1/60);
  R['predator-read'].ctxLeadAfterTick = g.ctx.telegraphLead;

  // ---- SPLIT LOCK
  arena('U5', 'vector', ['split-lock']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 3);
  step(10, ['Q']);
  R['split-lock'] = { capacity: g.player.lock.capacity, held: g.player.lock.all.length };

  // ---- WEIGHT OF ATTENTION
  arena('U6', 'vector', ['weight-of-attention']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 2);
  g.player.lock.targets = [g.hostiles[0]]; g.player.lock.hard = true;
  let a0 = g.hostiles[0].vitals.structure, a1 = g.hostiles[1].vitals.structure;
  g.player.dealDamage(g.hostiles[0], 100, 0, 'rifle');
  g.player.dealDamage(g.hostiles[1], 100, 0, 'rifle');
  R['weight-of-attention'] = { locked: +(a0 - g.hostiles[0].vitals.structure).toFixed(1), unlocked: +(a1 - g.hostiles[1].vitals.structure).toFixed(1) };

  // ---- CHAIN READ
  arena('U7', 'vector', ['chain-read']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 2);
  g.player.lock.targets = [g.hostiles[0]]; g.player.lock.hard = true;
  const victim = g.hostiles[0];
  g.player.dealDamage(victim, 99999, 0, 'rifle');
  R['chain-read'] = { victimId: victim.id, newLock: g.player.lock.primary ? g.player.lock.primary.id : null, bulletTime: g.state().timeScale < 1 };

  // ---- EXECUTION PROTOCOL
  arena('U8', 'vector', ['execution-protocol']);
  g.hostiles.length = 0; window.__dev.spawn('warden', 1);
  h = g.hostiles[0]; h.shieldBroken = true; h.vitals.forceStagger(0);
  hp = h.vitals.structure;
  g.player.lock.targets = []; g.player.pos.copy(h.pos).add(new (Object.getPrototypeOf(h.pos).constructor)(0, 0, -8));
  g.player.yaw = Math.atan2(h.pos.x - g.player.pos.x, h.pos.z - g.player.pos.z) + Math.PI;
  step(1, ['F']);
  R['execution-protocol'] = { staggered: true, damage: Math.round(hp - h.vitals.structure), baseBladeVsStaggered: 620 * 3 * 1.9 };

  // ---- CASCADE BREAK
  arena('U9', 'vector', ['cascade-break']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 3);
  const before = g.hostiles.slice(1).map((x) => x.vitals.impact);
  g.player.onAnyHostileStagger(g.hostiles[0]);
  R['cascade-break'] = { shareOfImpactMax: 0.4 * g.hostiles[0].vitals.impactMax, applied: g.hostiles.slice(1).map((x, i) => +(x.vitals.impact - before[i]).toFixed(1)) };

  // ---- REACTOR BLEED
  arena('U10', 'vector', ['reactor-bleed']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 1);
  g.player.onAnyHostileStagger(g.hostiles[0]);
  R['reactor-bleed'] = { cores: g.ordnance.cores.length, energy: g.ordnance.cores[0]?.energy, life: g.ordnance.cores[0]?.life };

  // ---- SLIPSTREAM
  arena('U11', 'vector', ['slipstream']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 1);
  g.hostiles[0].pos.copy(g.player.pos);
  g.hostiles[0].pos.copy(g.player.pos).add(new (Object.getPrototypeOf(g.player.pos).constructor)(0, 0, 60));
  g.player.assault = true;                         // sustain > 120 velocity
  for (let i = 0; i < 240; i++) { g.input.scripted = { down: ['W'], look: [0,0] }; g.tick(1/60);
    if (g.player.slipstreamStacks > 0) break;
    g.hostiles[0].pos.copy(g.player.pos).add(new (Object.getPrototypeOf(g.player.pos).constructor)(0, 0, 6)); }
  g.input.scripted = null;
  R.slipstream = { stacks: g.player.slipstreamStacks, speed: Math.round(g.player.speed), max: 3 };

  // ---- MIRROR CHASSIS
  arena('U12', 'vector', ['mirror-chassis']);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 1);
  window.__dev.forceWindup('sweep', 0.1); window.__dev.vanish(1);
  R['mirror-chassis'] = { clones: g.ordnance.clones.length, life: +(g.ordnance.clones[0]?.life ?? 0).toFixed(1), damageScale: g.ordnance.clones[0]?.damageScale };

  // ---- EVOLUTIONS
  arena('E1', 'vector', [], [['orbiting-interceptors', 'missiles']]);
  R['orbiting-interceptors'] = { live: g.ordnance.interceptors, max: g.ordnance.interceptorsMax };
  arena('E2', 'vector', [], [['momentum-railgun', 'rifle']]);
  g.player.vel.set(0, 0, 0); step(60, ['MOUSE1']);
  const blocked = g.player.railgunCharge01, readyAtRest = g.player.railgunReady;
  g.player.assault = true;
  let fired = false, hpB = 0;
  g.hostiles.length = 0; window.__dev.spawn('sentry', 1);
  hpB = g.hostiles[0].vitals.structure;
  for (let i = 0; i < 400; i++) { g.input.scripted = { down: ['W', 'MOUSE1'], look: [0,0] }; g.tick(1/60); if (g.hostiles[0].vitals.structure < hpB) { fired = true; break; } }
  g.input.scripted = null;
  R['momentum-railgun'] = { chargeAtRest: +blocked.toFixed(2), readyAtRest, speedNow: Math.round(g.player.speed), firedWhileMoving: fired, damage: Math.round(hpB - g.hostiles[0].vitals.structure) };
  arena('E3', 'vector', [], [['seismic-driver', 'pile']]);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 3);
  for (const x of g.hostiles) x.pos.copy(g.player.pos).setY(g.player.pos.y);
  const hps = g.hostiles.map((x) => x.vitals.structure);
  g.player.pos.y += 40; step(1, ['2']); step(90);
  R['seismic-driver'] = { damaged: g.hostiles.map((x, i) => Math.round(hps[i] - x.vitals.structure)) };
  arena('E4', 'vector', [], [['tether-blade', 'blade']]);
  g.hostiles.length = 0; window.__dev.spawn('lancer', 1);
  g.hostiles[0].pos.copy(g.player.pos); g.hostiles[0].pos.z += 120;
  g.player.lock.targets = [g.hostiles[0]]; g.player.lock.hard = true;
  const d0 = g.hostiles[0].pos.distanceTo(g.player.pos);
  step(1, ['F']); step(30);
  R['tether-blade'] = { distBefore: Math.round(d0), distAfter: Math.round(g.hostiles[0].pos.distanceTo(g.player.pos)) };

  g.renderEnabled = true; g.uiEnabled = true;
  return R;
});
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(24), JSON.stringify(v));
await browser.close();
