import { RNG } from '../core/RNG';

/**
 * ============================================================================================
 * COMMS — the narrative syntax probe  (RC brief §3.5, §5 v0.3)
 *
 * This is not the writing. It is the smallest possible test of the expensive assumption
 * underneath the writing:
 *
 *   > Combat is movement; story is stillness. The FORGE is the only place the machine stops,
 *   > which makes it the only place dialogue lives.
 *
 * Forty scenes written against an untested premise is the most expensive mistake available in
 * this phase, so v0.3 ships an opening comm, five FORGE exchanges, two boss introductions and a
 * sector-clear line — enough to answer one question at the playtest gate: **does dialogue at the
 * FORGE land, or intrude?**
 *
 * THE RULES THIS FOLLOWS, so that scaling it later is transcription rather than redesign:
 *
 *   1. **Never during combat.** A line may be issued at a FORGE, at a boss introduction, or at a
 *      sector boundary. Nothing here can fire while the pilot is being shot at.
 *   2. **Two lines maximum.** Hades syntax at a tenth the word count. If a beat needs three
 *      lines it is not a FORGE beat.
 *   3. **The voice degrades with depth.** Clean in Sector 1, breaking up by Sector 3, something
 *      else by Sector 4. The degradation is rendered as text corruption, not described.
 *   4. **It advances across runs, not within one.** Beats are drawn by run count and progress,
 *      so the fiction is a reason to start a fifth run rather than padding inside the first.
 *   5. **It never gives instructions.** The HUD does that. A line that explains a mechanic is a
 *      tutorial wearing a character's voice, and the onboarding already owns that job.
 * ============================================================================================
 */

export type CommChannel = 'open' | 'forge' | 'boss' | 'clear' | 'prototype';

export interface CommLine {
  id: string;
  channel: CommChannel;
  /** Speaker tag rendered above the line. One voice all descent; the tag is what changes. */
  from: string;
  text: string[];
  /** Earliest sector this may be issued in. */
  sector: number;
  /** Earliest run index (0-based) this may be issued in — the fiction advances across runs. */
  run?: number;
  /** For boss lines: which boss. */
  boss?: string;
}

/** Persisted across runs so the descent has a memory the fiction can lean on. */
const KEY = 'blinkfall.comms.v1';

export const COMM_LINES: CommLine[] = [
  // ---------------------------------------------------------------------------- OPENING
  {
    id: 'open-1', channel: 'open', from: 'CONTROL', sector: 1, run: 0,
    text: ['Frame is live. You are on the outside of the station and the outside is coming apart.', 'Go down. I will keep talking.'],
  },
  {
    id: 'open-2', channel: 'open', from: 'CONTROL', sector: 1, run: 1,
    text: ['Second frame today. Same seat.', 'I would ask if you remember the way down, but you always do.'],
  },
  {
    id: 'open-3', channel: 'open', from: 'CONTROL', sector: 1, run: 3,
    text: ['You keep coming back to a station that is falling.', 'I have stopped filing that as an anomaly.'],
  },

  // ------------------------------------------------------------------------------ FORGE
  // Five exchanges. Each is a beat of stillness, and none of them explains a mechanic.
  {
    id: 'forge-1', channel: 'forge', from: 'CONTROL', sector: 1, run: 0,
    text: ['Locks are on. Thrusters cold.', 'This is the only quiet you get, so spend it deciding rather than resting.'],
  },
  {
    id: 'forge-2', channel: 'forge', from: 'CONTROL', sector: 1, run: 0,
    text: ['The frame is rated for one of those. It is rated for a lot of things it will not survive.'],
  },
  {
    id: 'forge-3', channel: 'forge', from: 'CONTROL', sector: 2, run: 0,
    text: ['You are inside it now. The manufacture deck was sealed eleven years ago.', 'Something down here is still casting.'],
  },
  {
    id: 'forge-4', channel: 'forge', from: 'CONTROL', sector: 2, run: 2,
    text: ['The line never stopped. Nobody stopped it.', 'It is making parts for a station that is not there any more.'],
  },
  {
    id: 'forge-5', channel: 'forge', from: 'CONTROL', sector: 2, run: 4,
    text: ['I have been reading your telemetry since Sector 1 and I want to say something unhelpful.', 'You are getting better at this than the people who built it.'],
  },

  // ------------------------------------------------------------------------------- BOSS
  { id: 'boss-severance', channel: 'boss', from: 'CONTROL', sector: 1, boss: 'SEVERANCE', text: ['That frame is flying the way you fly.', 'It learned it from the same manual.'] },
  { id: 'boss-gravemark', channel: 'boss', from: 'CONTROL', sector: 1, boss: 'GRAVEMARK', text: ['Command frame with a screen. Do not chase the escorts.', 'Move the fight and the screen has to follow it.'] },
  { id: 'boss-chorus', channel: 'boss', from: 'CONTROL', sector: 2, boss: 'CHORUS', text: ['Three frames, one reactor between them. They are singing.', 'They cannot do that from one place.'] },
  { id: 'boss-kilnworks', channel: 'boss', from: 'CONTROL', sector: 2, boss: 'KILNWORKS', text: ['That is not a machine on the line. That is the line.', 'It will not stop for you, so do not plan on standing still.'] },

  // ------------------------------------------------------------------------------ CLEAR
  { id: 'clear-1', channel: 'clear', from: 'CONTROL', sector: 1, text: ['Exterior is behind you.', 'The next part has a roof. I do not know if that is better.'] },
  { id: 'clear-2', channel: 'clear', from: 'CONTROL', sector: 2, text: ['Manufacture is clear. The pour has stopped.', 'It is very quiet down there now, and I do not like it.'] },

  // -------------------------------------------------------------------------- PROTOTYPE
  // Not reachable until v0.5 ships PROTOTYPE upgrades. Written now because the RC brief is
  // explicit that the illicit FORGE beat is what makes those offers memorable, and the line has
  // to exist before the presentation can be built around it.
  { id: 'proto-1', channel: 'prototype', from: 'CONTROL', sector: 2, text: ['That component is not registered.', 'Take it. I did not see it.'] },
];

interface CommsSave { runs: number; seen: string[] }

/**
 * The voice.
 *
 * Degradation is applied at render time rather than authored per sector, so one line reads
 * correctly at every depth and the writing never has to be duplicated to get worse.
 */
export class Comms {
  runs = 0;
  private seen = new Set<string>();
  /** Lines issued this run, so a beat cannot repeat inside one descent. */
  private issuedThisRun = new Set<string>();

  constructor() { this.load(); }

  beginRun() { this.issuedThisRun.clear(); }
  /** Called once when a run actually starts, so the count reflects descents, not menu visits. */
  countRun() { this.runs++; this.save(); }

  /**
   * Draw the next line for a channel, or null when the channel has nothing to say here.
   *
   * Unseen lines are preferred over seen ones, which is what makes the fiction advance across
   * runs: a returning player hears something new before they hear something again.
   */
  draw(channel: CommChannel, sector: number, opts: { boss?: string } = {}): CommLine | null {
    const pool = COMM_LINES.filter((l) =>
      l.channel === channel &&
      l.sector <= sector &&
      (l.run ?? 0) <= this.runs &&
      (!l.boss || l.boss === opts.boss) &&
      !this.issuedThisRun.has(l.id));
    if (!pool.length) return null;
    const fresh = pool.filter((l) => !this.seen.has(l.id));
    // A boss line is the boss's line: never substitute another boss's, and never randomise it.
    const chosen = channel === 'boss'
      ? (fresh[0] ?? pool[0])
      : RNG.stream('offers').pick(fresh.length ? fresh : pool);
    this.issuedThisRun.add(chosen.id);
    this.seen.add(chosen.id);
    this.save();
    return chosen;
  }

  /**
   * How badly the channel is breaking up at this depth. Clean through Sector 1, audibly
   * degrading from Sector 2, unrecognisable by Sector 4.
   */
  static degradation(sector: number): number {
    return [0, 0, 0.12, 0.34, 0.62][Math.min(4, Math.max(0, sector))] ?? 0;
  }

  /** The speaker tag at this depth. The voice does not change; what is carrying it does. */
  static tag(from: string, sector: number): string {
    if (sector <= 1) return from;
    if (sector === 2) return `${from} · RELAYED`;
    if (sector === 3) return `${from} · DEGRADED`;
    return `${from}?`;
  }

  /**
   * Corrupt a line for depth. Deterministic per line and per sector — the same words break in
   * the same places every time, so it reads as a damaged channel rather than as noise.
   */
  static degrade(text: string, sector: number, salt = 0): string {
    const k = Comms.degradation(sector);
    if (k <= 0) return text;
    let h = 0x811c9dc5 ^ salt;
    const out: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
      const r = (h >>> 8) / 0xffffff;
      if (ch !== ' ' && r < k * 0.22) out.push('█');
      else out.push(ch);
    }
    return out.join('');
  }

  /** Everything the results screen and the harness need to see. */
  snapshot() {
    return { runs: this.runs, seen: [...this.seen], issuedThisRun: [...this.issuedThisRun], total: COMM_LINES.length };
  }

  reset() { this.runs = 0; this.seen.clear(); this.issuedThisRun.clear(); this.save(); }

  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as CommsSave;
      this.runs = Math.max(0, d.runs ?? 0);
      this.seen = new Set(d.seen ?? []);
    } catch { /* defaults stand */ }
  }
  private save() {
    try { localStorage.setItem(KEY, JSON.stringify({ runs: this.runs, seen: [...this.seen] } satisfies CommsSave)); } catch { /* session only */ }
  }
}

export const comms = new Comms();
