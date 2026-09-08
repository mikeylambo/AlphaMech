import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#btnDeploy');
await page.waitForTimeout(1000);
await page.evaluate(() => window.__dev.skipToLabel('ARENA'));
await page.waitForTimeout(6000);
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__game;
  const cam = g.camera.position, p = g.player.pos;
  const box = new (window.THREE_BOX3 || Object)();
  return {
    camDist: Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z).toFixed(2),
    cam: [cam.x.toFixed(1), cam.y.toFixed(1), cam.z.toFixed(1)],
    player: [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)],
    yaw: g.player.yaw.toFixed(3), fov: g.camera.fov.toFixed(1),
    rigScale: g.player.rig.root.scale.x,
    hipHeight: g.player.rig.hipHeight,
    draws: g.state().perf.drawCalls,
    hostiles: g.hostiles.map(h => ({ k: h.archetype, d: +h.pos.distanceTo(p).toFixed(0) })),
  };
}, null), null, 1));
await browser.close();
