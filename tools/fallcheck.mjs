import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
await page.evaluate(() => window.__dev ?? null);
await page.click('#btnDeploy');
await page.waitForTimeout(900);
console.log('NON-NEGOTIABLE 7 PROOF:');
const proof = await page.evaluate(() => window.__fallProof());
console.log('  arc thresholds identical at every tier:', new Set(proof.arcThresholdsPerTier.map(t => `${t.safe}/${t.flank}/${t.swarm}`)).size === 1, JSON.stringify(proof.arcThresholds));
console.log('  player structure identical at every tier:', new Set(proof.playerStructurePerTier.map(t => t.structure)).size === 1, proof.playerStructurePerTier[0].structure);
console.log('  damage levers:', JSON.stringify(proof.damageLevers), ' structure levers:', JSON.stringify(proof.structureLevers));
console.log('\nTIER LEVERS APPLIED IN THE SIM:');
for (const n of [1, 5, 7, 10]) {
  const r = await page.evaluate((t) => { window.__dev.setFall(t); window.__game.director.resetEncounter(1); return window.__dev.fall(); }, n);
  console.log(`  ${r.tier.name.padEnd(9)} cooldown ${r.tokenCooldown.toFixed(2)}s  bias ${r.forwardBias.toFixed(2)}  ceiling ${r.tier.arenaCeiling}  async ${r.tier.asyncAllowed}  elites ${r.tier.elites}  corrupted ${Math.round(r.tier.corruptedFraction*100)}%`);
}
console.log('\nCORRUPTED OFFERS BY TIER:');
for (const n of [1, 8, 10]) {
  const o = await page.evaluate((t) => {
    const g = window.__game;
    g.startRun('CORRUPT', 'vector', t);
    const offer = g.run.rollOffer();
    return offer.upgrades.map(u => u.corrupted ? `${u.id}◆(${u.corrupted.downside})` : u.id);
  }, n);
  console.log(`  FALL ${String(n).padStart(2)}: ${o.join('  ')}`);
}
console.log('\nELITES ARE BEHAVIOURAL ONLY:');
const el = await page.evaluate(() => {
  const g = window.__game;
  g.startRun('ELITE', 'vector', 9);
  window.__dev.skipToLabel('ARENA');
  g.tick(1/60);
  const es = window.__dev.elites();
  const all = g.hostiles.map(h => ({ archetype: h.archetype, elite: h.elite?.name ?? null, structure: h.vitals.structureMax, impactMax: h.vitals.impactMax }));
  return { elites: es, all };
});
console.log('  elites:', JSON.stringify(el.elites));
for (const h of el.all) console.log(`    ${h.archetype.padEnd(8)} elite=${String(h.elite).padEnd(11)} structure=${h.structure} impactMax=${h.impactMax}`);
console.log('ERRORS:', errs.length ? errs.slice(0,4).join('\n') : 'clean');
await browser.close();
