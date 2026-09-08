import * as THREE from 'three';
import { T } from '../core/Tuning';
import { RNG } from '../core/RNG';
import { RallyDir, RALLY_DIRS } from '../core/Input';
import { Hostile } from './Types';

export type RallyMode = 'RALLY' | 'REVERSE';
export type RallyOutcome = 'won' | 'lost';

/**
 * GDD §5.4 — the blur exchange. Neither of you is dodging any more; you are trading vanishes
 * until one of you mistimes it.
 *
 * Reverse Rally is the same timing structure with the hostile as the aggressor. It is the only
 * thing SEVERANCE's Counter-Vanish can start.
 */
export class Rally {
  active = false;
  mode: RallyMode = 'RALLY';
  foe: Hostile | null = null;
  key: RallyDir = 'W';
  timer = 0;
  window = 0;
  exchange = 0;
  /** Real (unscaled) seconds. The rally runs on the real clock so slow-mo does not gift time. */
  onResolve: ((outcome: RallyOutcome, mode: RallyMode, foe: Hostile) => void) | null = null;
  onExchange: ((step: number) => void) | null = null;
  onPrompt: (() => void) | null = null;

  /** 55% of Perfect Vanishes escalate — seeded, never Math.random(). */
  shouldEscalate(): boolean { return RNG.stream('rally').chance(T.rallyChance); }

  start(foe: Hostile, mode: RallyMode) {
    this.active = true;
    this.mode = mode;
    this.foe = foe;
    this.exchange = 0;
    this.window = T.rallyWindow;
    this.timer = this.window;
    this.key = RNG.stream('rally').pick(RALLY_DIRS);
    this.onPrompt?.();
  }

  /** Wrong key and timeout both fail (GDD §5.4). */
  input(d: RallyDir) {
    if (!this.active) return;
    if (d === this.key) this.advance();
    else this.fail();
  }

  tickReal(dt: number) {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) this.fail();
  }

  private advance() {
    this.exchange++;
    this.onExchange?.(this.exchange);
    if (this.exchange >= T.rallyMax) { this.resolve('won'); return; }
    this.window *= T.rallyRamp;
    this.timer = this.window;
    const rng = RNG.stream('rally');
    let k = rng.pick(RALLY_DIRS);
    while (k === this.key) k = rng.pick(RALLY_DIRS);
    this.key = k;
    this.onPrompt?.();
  }

  private fail() { this.resolve('lost'); }

  private resolve(outcome: RallyOutcome) {
    const foe = this.foe;
    const mode = this.mode;
    this.active = false;
    this.foe = null;
    if (foe) this.onResolve?.(outcome, mode, foe);
  }

  cancel() { this.active = false; this.foe = null; }

  get progress01() { return this.window > 0 ? Math.max(0, Math.min(1, this.timer / this.window)) : 0; }
}

/** Position for the exchange choreography: the two fighters swap sides each trade. */
export function rallyOrbit(foe: THREE.Vector3, y: number, radius: number, angle: number): THREE.Vector3 {
  return new THREE.Vector3(foe.x + Math.cos(angle) * radius, Math.max(y, foe.y + 6), foe.z + Math.sin(angle) * radius);
}
