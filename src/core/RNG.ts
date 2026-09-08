import { Rng, hashString } from './MathUtil';

/**
 * GDD §14 — per-domain PRNG streams.
 *
 * A single shared stream desynchronises the moment player behaviour changes how many draws
 * occur: same seed, same map, completely different run. Each domain therefore gets its own
 * stream seeded from hash(masterSeed + streamName), so a chain layout is identical whether the
 * player perfect-vanished twelve times or none.
 *
 * `Math.random()` is banned from gameplay simulation. Cosmetic particles may use it (see
 * MathUtil.rand), nothing else.
 */
export const STREAM_NAMES = ['chains', 'layout', 'spawn', 'ai', 'rally', 'boss', 'offers'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

class RNGRegistry {
  private streams = new Map<StreamName, Rng>();
  masterSeed = 0;
  seedText = '';

  /** (Re)seed every stream from a master seed. Called at run start and by RETRY SEED. */
  init(seed: number | string) {
    this.seedText = typeof seed === 'string' ? seed : String(seed);
    this.masterSeed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.streams.clear();
    for (const name of STREAM_NAMES) this.streams.set(name, new Rng(hashString(`${this.masterSeed}:${name}`)));
  }

  stream(name: StreamName): Rng {
    let s = this.streams.get(name);
    if (!s) { s = new Rng(hashString(`${this.masterSeed}:${name}`)); this.streams.set(name, s); }
    return s;
  }

  /** Draw counts per stream, surfaced through __state().run.streamCursors for determinism proofs. */
  cursors(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const name of STREAM_NAMES) out[name] = this.stream(name).cursor;
    return out;
  }

  /** Internal PRNG states — what RETRY SEED must reproduce exactly at encounter start. */
  states(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const name of STREAM_NAMES) out[name] = this.stream(name).state;
    return out;
  }

  /** A fresh, human-shaped seed for NEW RUN. Uses the clock, which is outside the simulation. */
  static freshSeed(): string {
    const alphabet = 'ACDEFGHJKLMNPQRTUVWXY3479';
    let s = '';
    let n = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
    for (let i = 0; i < 6; i++) { s += alphabet[n % alphabet.length]; n = Math.imul(n ^ (n >>> 13), 0x5bd1e995) >>> 0; }
    return s;
  }
}

export const RNG = new RNGRegistry();
export const freshSeed = RNGRegistry.freshSeed;
