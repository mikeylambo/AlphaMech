import * as THREE from 'three';
import { Enemy } from '../enemies/Enemy';

/**
 * ============================================================================================
 * THE FIRST 100 SECONDS  (v0.2 §3.5)
 *
 * A game whose core skill is formation control has to TEACH that before it names it. This is a
 * scripted opening, played once on first launch and skippable forever after.
 *
 * The 0:35 → 0:50 beat is the entire game: a hostile circles behind, the arc crosses 235°, the
 * HUD flashes TOKENS 2, both of them attack — and then the player rotates, the arc closes, and
 * the token goes back to 1. It has to land before the player has read anything, which is why
 * every beat here advances on a CONDITION the player satisfied, never on a timer alone.
 * ============================================================================================
 */
export type BeatId =
  | 'launch' | 'first-kill' | 'two-in-front' | 'flanked' | 'rotate'
  | 'vanish' | 'convert' | 'launch-out' | 'done';

export interface Beat {
  id: BeatId;
  /** Big prompt. Short enough to read at speed, or not read at all. */
  prompt: string;
  /** One supporting line. */
  hint: string;
  /** Seconds before the beat may advance on its own; 0 means condition-only. */
  minTime: number;
  /** Hard ceiling so a stuck player is never trapped in a lesson. */
  maxTime: number;
}

export const BEATS: Record<BeatId, Beat> = {
  launch: { id: 'launch', prompt: 'BOOST', hint: 'W A S D TO SKATE · MOUSE TO LOOK', minTime: 2.5, maxTime: 14 },
  'first-kill': { id: 'first-kill', prompt: 'ENGAGE', hint: 'HOLD FIRE · CLOSE AND STRIKE', minTime: 0, maxTime: 45 },
  'two-in-front': { id: 'two-in-front', prompt: 'KEEP THEM IN FRONT', hint: 'ARC UNDER 145° · ONE ATTACK TOKEN', minTime: 4, maxTime: 22 },
  flanked: { id: 'flanked', prompt: 'THEY HAVE YOU SURROUNDED', hint: 'ARC OVER 235° · TWO ATTACK TOKENS', minTime: 2, maxTime: 22 },
  rotate: { id: 'rotate', prompt: 'ROTATE THE FIGHT', hint: 'BOOST OUT OF THE MIDDLE · PUT THEM ALL ON ONE SIDE', minTime: 0, maxTime: 30 },
  vanish: { id: 'vanish', prompt: 'VANISH', hint: 'SHIFT AS THE RING CLOSES', minTime: 0, maxTime: 40 },
  convert: { id: 'convert', prompt: 'PUNISH', hint: 'IT IS EXPOSED · BLADE IT', minTime: 0, maxTime: 30 },
  'launch-out': { id: 'launch-out', prompt: 'LAUNCH OUT', hint: 'THE GATE IS OPEN · THE DESCENT IS THAT WAY', minTime: 0, maxTime: 26 },
  done: { id: 'done', prompt: '', hint: '', minTime: 0, maxTime: 0 },
};

/** Rear-quarter and shoulder stations for the encirclement beat, in radians off the nose. */
const REAR_QUARTER = 2.36;
const SHOULDER = 0.7;

const ORDER: BeatId[] = ['launch', 'first-kill', 'two-in-front', 'flanked', 'rotate', 'vanish', 'convert', 'launch-out', 'done'];

export interface OnboardingWorld {
  player: { pos: THREE.Vector3; yaw: number; vitals: { structure: number } };
  hostiles: Enemy[];
  arc: number;
  tokenCount: number;
  /** Rising counters the tutorial watches. */
  perfectVanishes: number;
  staggerPunishes: number;
}

export interface OnboardingHooks {
  spawn(kind: 'brawler' | 'lancer', bearing: number, distance: number): Enemy;
  prompt(beat: Beat | null): void;
  flash(text: string, colour: string): void;
  /**
   * Hold a hostile on a bearing relative to the player's facing, so the opening can compose an
   * encirclement on demand. `null` releases it back to its own AI.
   */
  drive(e: Enemy, bearing: number | null): void;
  /** Hold a hostile in a vanishable windup so the lesson can be taught deterministically. */
  forceWindup(e: Enemy): void;
  /** Open the volume's exit gate for the final beat. */
  openExit(): void;
  /** Has the player flown out through it? */
  exited(): boolean;
  finish(): void;
}

/**
 * Beat runner. Owns no rendering and no simulation: it observes the world, advances when the
 * player has actually done the thing, and asks the game to stage the next situation.
 */
export class Onboarding {
  index = 0;
  t = 0;
  active = false;
  /** Recorded for the checkpoint: the token count the player was shown at each beat. */
  tokenTrace: { beat: BeatId; arc: number; tokens: number; t: number }[] = [];
  private staged = false;
  private flankers: Enemy[] = [];
  private vanishTarget: Enemy | null = null;
  private baselineVanishes = 0;
  private baselinePunishes = 0;
  private killsAtStart = 0;

  constructor(private hooks: OnboardingHooks) {}

  get beat(): Beat { return BEATS[ORDER[this.index]]; }
  get finished() { return this.beat.id === 'done'; }

  begin() {
    this.index = 0;
    this.t = 0;
    this.active = true;
    this.staged = false;
    this.tokenTrace = [];
    this.hooks.prompt(this.beat);
  }

  skip() {
    this.active = false;
    this.index = ORDER.indexOf('done');
    this.hooks.prompt(null);
    this.hooks.finish();
  }

  update(dt: number, w: OnboardingWorld) {
    if (!this.active || this.finished) return;
    this.t += dt;
    const beat = this.beat;

    if (!this.staged) { this.stage(beat.id, w); this.staged = true; }
    this.tokenTrace.push({ beat: beat.id, arc: +w.arc.toFixed(1), tokens: w.tokenCount, t: +this.t.toFixed(2) });
    if (this.tokenTrace.length > 4000) this.tokenTrace.shift();

    if (this.satisfied(beat.id, w) && this.t >= beat.minTime) this.advance(w);
    else if (this.t >= beat.maxTime) this.advance(w);
  }

  private advance(w: OnboardingWorld) {
    if (this.beat.id === 'rotate') this.release();
    this.index = Math.min(ORDER.length - 1, this.index + 1);
    this.t = 0;
    this.staged = false;
    if (this.finished) { this.active = false; this.hooks.prompt(null); this.hooks.finish(); return; }
    this.hooks.prompt(this.beat);
    void w;
  }

  private stage(id: BeatId, w: OnboardingWorld) {
    switch (id) {
      case 'first-kill':
        this.killsAtStart = w.hostiles.length;
        this.hooks.spawn('brawler', 0, 120);
        break;
      case 'two-in-front':
        this.hooks.spawn('lancer', -0.5, 130);
        this.hooks.spawn('lancer', 0.5, 130);
        break;
      case 'flanked': {
        // The beat the whole game turns on. The arc is 360° minus the widest empty gap, so it
        // is a fact about the FORMATION, not about where the player is looking: two hostiles
        // can never exceed 180° however they are placed. Four can. Two swing round to the rear
        // quarters while the pair in front open to the shoulders — bearings at roughly
        // ±40° and ±135° leave no gap wider than 95°, so the arc reads about 265°.
        const live = w.hostiles.filter((h) => h.alive);
        const rearL = this.hooks.spawn('brawler', REAR_QUARTER, 150);
        const rearR = this.hooks.spawn('brawler', -REAR_QUARTER, 150);
        this.flankers = [rearL, rearR];
        this.hooks.drive(rearL, REAR_QUARTER);
        this.hooks.drive(rearR, -REAR_QUARTER);
        live.slice(0, 2).forEach((e, i) => { this.hooks.drive(e, i === 0 ? SHOULDER : -SHOULDER); this.flankers.push(e); });
        break;
      }
      case 'rotate':
        this.hooks.flash('TOKENS 2', '#ff5a5a');
        // Released the instant the lesson begins. Held stations would make the arc unbreakable
        // and turn the beat into a trap; the answer is to move, and moving has to be allowed.
        this.release();
        break;
      case 'vanish': {
        const live = w.hostiles.filter((h) => h.alive);
        this.vanishTarget = live[0] ?? this.hooks.spawn('brawler', 0, 60);
        this.baselineVanishes = w.perfectVanishes;
        break;
      }
      case 'convert':
        this.baselinePunishes = w.staggerPunishes;
        break;
      case 'launch-out':
        this.hooks.openExit();
        break;
      default: break;
    }
  }

  private satisfied(id: BeatId, w: OnboardingWorld): boolean {
    const live = w.hostiles.filter((h) => h.alive).length;
    switch (id) {
      case 'launch': return w.player.pos.length() > 0;                 // any movement at all
      case 'first-kill': return live < Math.max(1, this.killsAtStart + 1);
      case 'two-in-front': return w.arc > 0 && w.arc < 145 && w.tokenCount === 1;
      case 'flanked': return w.tokenCount >= 2;                        // the arc crossed 235°
      case 'rotate': return w.arc < 145 && w.tokenCount === 1;         // and the player broke out
      case 'vanish': return w.perfectVanishes > this.baselineVanishes;
      case 'convert': return w.staggerPunishes > this.baselinePunishes;
      case 'launch-out': return this.hooks.exited();                   // ends on the volume exit
      default: return true;
    }
  }

  private release() {
    for (const e of this.flankers) this.hooks.drive(e, null);
    this.flankers = [];
  }

  /** In the vanish beat, keep a telegraph available so the lesson is always answerable. */
  maintain(w: OnboardingWorld) {
    if (!this.active) return;
    if (this.beat.id === 'vanish' && this.vanishTarget?.alive && this.vanishTarget.state !== 'windup') {
      this.hooks.forceWindup(this.vanishTarget);
    }
    void w;
  }

  /**
   * Checkpoint F evidence: the token count the player was shown, beat by beat, with the arc
   * range that produced it. One row per run of identical (beat, tokens).
   */
  tokenStory() {
    const seen: { beat: BeatId; tokens: number; arc: number; arcLo: number; arcHi: number; secs: number }[] = [];
    for (const s of this.tokenTrace) {
      const last = seen[seen.length - 1];
      if (!last || last.beat !== s.beat || last.tokens !== s.tokens) {
        seen.push({ beat: s.beat, tokens: s.tokens, arc: s.arc, arcLo: s.arc, arcHi: s.arc, secs: 0 });
      } else {
        last.arcLo = Math.min(last.arcLo, s.arc);
        last.arcHi = Math.max(last.arcHi, s.arc);
        last.secs = +(last.secs + 1 / 60).toFixed(2);
      }
    }
    return seen;
  }
}
