import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * ============================================================================================
 * A STABLE PAGE FOR A LONG MEASUREMENT
 *
 * The ladder takes about fifteen minutes. Pointed at the Vite dev server, any source edit during
 * that window hot-reloads the page out from under it, and the run dies with
 * "Execution context was destroyed, most likely because of a navigation" — nine tiers of work
 * thrown away, and, worse, a failure mode that looks like a browser problem rather than what it
 * is. That happened once and is exactly the class of instrument defect §20 was written about.
 *
 * So a gate that measures for a long time serves a BUILT bundle instead. A built bundle has no
 * HMR client, cannot navigate itself, and removes dev-server transform variance from the
 * measurement as a bonus.
 *
 *   import { servePreview } from './serve.mjs';
 *   const { url, stop } = await servePreview();
 *
 * `URL` in the environment overrides everything and skips the build — point a gate at a server
 * you are already running when you want to iterate quickly.
 * ============================================================================================
 */
const PORT = Number(process.env.PREVIEW_PORT ?? 5181);

async function reachable(u) {
  try { const r = await fetch(u); return r.ok; } catch { return false; }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

export async function servePreview({ build = true } = {}) {
  if (process.env.URL) return { url: process.env.URL, stop: () => {} };
  const url = `http://localhost:${PORT}/`;
  if (await reachable(url)) return { url, stop: () => {} };
  if (build) {
    console.error('  building a stable bundle for the measurement…');
    await run('npx', ['vite', 'build', '--logLevel', 'warn']);
  }
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await reachable(url)); i++) await sleep(250);
  if (!(await reachable(url))) { server.kill('SIGTERM'); throw new Error(`preview server never came up on ${url}`); }
  const stop = () => { if (!server.killed) server.kill('SIGTERM'); };
  process.on('exit', stop);
  return { url, stop };
}
