/**
 * Accessibility and input configuration.
 *
 * Built before the content multiplies, on purpose: retrofitting eight bosses and four sectors
 * costs eight times what retrofitting one costs, and none of this reads as "progress" while
 * you are building it, which is exactly why it gets deferred until it hurts.
 *
 * Non-negotiable 8: every assist is written into RunState and surfaced on the results screen,
 * even when all of them are off. Leaderboards ship later; if the flags are not recorded from
 * the very first run, historical runs can never be segmented.
 */

export const VANISH_WINDOW_STEPS = [0.30, 0.38, 0.46, 0.55] as const;
export type VanishWindowAssist = (typeof VANISH_WINDOW_STEPS)[number];

export interface Assists {
  /** GDD baseline is 0.30s. Larger windows do not change what the skill is, only how late it may be read. */
  vanishWindow: VanishWindowAssist;
  /** Multiplier on the 0.85s bullet-time duration. 0.6x to 2.0x. */
  bulletTimeScale: number;
  /** Ground-plane telegraph opacity, 0..1 of the authored intensity. */
  telegraphIntensity: number;
  /** Replaces archetype-tinted telegraph rings with a single high-contrast ring. */
  telegraphHighContrast: boolean;
  /** Camera shake, 0..1. */
  cameraShake: number;
  /** Particle and flash intensity, 0..1. Independent of telegraph contrast, so a player can
   *  turn the spectacle down without turning the reads down. */
  fxIntensity: number;
  /** Look sensitivity multiplier, applied to both mouse and stick. */
  cameraSensitivity: number;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Assault Boost is a toggle by default; hold-to-boost for players who cannot hold state. */
  holdAssaultBoost: boolean;
  /** Hard lock is a toggle by default; hold-to-lock as the alternative. */
  holdHardLock: boolean;
}

export const DEFAULT_ASSISTS: Assists = {
  vanishWindow: 0.30,
  bulletTimeScale: 1.0,
  telegraphIntensity: 1.0,
  telegraphHighContrast: false,
  cameraShake: 1.0,
  fxIntensity: 1.0,
  cameraSensitivity: 1.0,
  fov: 62,
  holdAssaultBoost: false,
  holdHardLock: false,
};

/** True when the run was played on the authored defaults — the segment leaderboards will want. */
export function assistsAreDefault(a: Assists): boolean {
  return (Object.keys(DEFAULT_ASSISTS) as (keyof Assists)[]).every((k) => a[k] === DEFAULT_ASSISTS[k]);
}

/** Only the assists that differ from default, for compact display and storage. */
export function activeAssists(a: Assists): { key: keyof Assists; label: string; value: string }[] {
  const out: { key: keyof Assists; label: string; value: string }[] = [];
  const push = (key: keyof Assists, label: string, value: string) => { if (a[key] !== DEFAULT_ASSISTS[key]) out.push({ key, label, value }); };
  push('vanishWindow', 'VANISH WINDOW', `${a.vanishWindow.toFixed(2)}s`);
  push('bulletTimeScale', 'BULLET TIME', `${a.bulletTimeScale.toFixed(2)}×`);
  push('telegraphIntensity', 'TELEGRAPH INTENSITY', `${Math.round(a.telegraphIntensity * 100)}%`);
  push('telegraphHighContrast', 'HIGH-CONTRAST TELEGRAPHS', 'ON');
  push('cameraShake', 'CAMERA SHAKE', `${Math.round(a.cameraShake * 100)}%`);
  push('fxIntensity', 'FX INTENSITY', `${Math.round(a.fxIntensity * 100)}%`);
  push('cameraSensitivity', 'SENSITIVITY', `${a.cameraSensitivity.toFixed(2)}×`);
  push('fov', 'FIELD OF VIEW', `${Math.round(a.fov)}°`);
  push('holdAssaultBoost', 'ASSAULT BOOST', 'HOLD');
  push('holdHardLock', 'HARD LOCK', 'HOLD');
  return out;
}

// ------------------------------------------------------------------------------ input binding
export type Action =
  | 'vanish' | 'assault' | 'rise' | 'descend' | 'lock' | 'cycleNext' | 'cyclePrev'
  | 'rifle' | 'blade' | 'missiles' | 'pile' | 'pause' | 'debug' | 'profiler'
  | 'menuUp' | 'menuDown' | 'menuLeft' | 'menuRight' | 'confirm' | 'cancel';

export interface Binding {
  /** Normalised key names, e.g. 'SHIFT', 'W', 'ARROWUP', ' '. */
  keys: string[];
  /** Mouse button bitmask entries: 1 = left, 2 = right, 4 = middle. */
  mouse: number[];
  /** Standard-gamepad button indices. */
  pad: number[];
}

export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, DU: 12, DD: 13, DL: 14, DR: 15 } as const;

const b = (keys: string[], mouse: number[] = [], pad: number[] = []): Binding => ({ keys, mouse, pad });

export const DEFAULT_BINDINGS: Record<Action, Binding> = {
  vanish: b(['SHIFT'], [], [PAD.RB]),
  assault: b(['E'], [], [PAD.L3]),
  rise: b([' '], [], [PAD.A]),
  descend: b(['C', 'CONTROL'], [], [PAD.B]),
  lock: b(['Q'], [4], [PAD.R3]),
  cycleNext: b(['ARROWRIGHT', 'TAB'], [], [PAD.DR]),
  cyclePrev: b(['ARROWLEFT'], [], [PAD.DL]),
  rifle: b([], [1], [PAD.RT]),
  blade: b(['F'], [2], [PAD.X]),
  missiles: b(['1'], [], [PAD.LB]),
  pile: b(['2'], [], [PAD.Y]),
  pause: b(['ESCAPE'], [], [PAD.START]),
  debug: b(['P'], [], []),
  profiler: b(['O'], [], []),
  menuUp: b(['W', 'ARROWUP'], [], [PAD.DU]),
  menuDown: b(['S', 'ARROWDOWN'], [], [PAD.DD]),
  menuLeft: b(['A', 'ARROWLEFT'], [], [PAD.DL]),
  menuRight: b(['D', 'ARROWRIGHT'], [], [PAD.DR]),
  confirm: b(['ENTER', ' '], [], [PAD.A]),
  cancel: b(['ESCAPE'], [], [PAD.B]),
};

/** Actions a player may rebind. Menu navigation stays fixed so a bad binding cannot lock
 *  someone out of the settings screen that would let them fix it. */
export const REBINDABLE: Action[] = ['vanish', 'assault', 'rise', 'descend', 'lock', 'cycleNext', 'cyclePrev', 'rifle', 'blade', 'missiles', 'pile'];

export const ACTION_LABELS: Record<Action, string> = {
  vanish: 'QUICK BOOST · VANISH', assault: 'ASSAULT BOOST', rise: 'VERTICAL THRUST', descend: 'DESCEND',
  lock: 'HARD LOCK', cycleNext: 'CYCLE TARGET →', cyclePrev: 'CYCLE TARGET ←',
  rifle: 'PRIMARY', blade: 'MELEE', missiles: 'SHOULDER A', pile: 'SHOULDER B',
  pause: 'PAUSE', debug: 'TUNING PANEL', profiler: 'PROFILER',
  menuUp: 'MENU UP', menuDown: 'MENU DOWN', menuLeft: 'MENU LEFT', menuRight: 'MENU RIGHT',
  confirm: 'CONFIRM', cancel: 'BACK',
};

export const PAD_LABELS: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'BACK', 9: 'START',
  10: 'L3', 11: 'R3', 12: 'D-UP', 13: 'D-DOWN', 14: 'D-LEFT', 15: 'D-RIGHT',
};
export const MOUSE_LABELS: Record<number, string> = { 1: 'LMB', 2: 'RMB', 4: 'MMB' };

export function bindingLabel(bd: Binding): string {
  const parts = [
    ...bd.keys.map((k) => (k === ' ' ? 'SPACE' : k)),
    ...bd.mouse.map((m) => MOUSE_LABELS[m] ?? `M${m}`),
    ...bd.pad.map((p) => PAD_LABELS[p] ?? `PAD${p}`),
  ];
  return parts.length ? parts.join(' · ') : 'UNBOUND';
}

// ------------------------------------------------------------------------------ persistence
const KEY = 'blinkfall.settings.v1';

export interface SettingsData {
  assists: Assists;
  bindings: Record<Action, Binding>;
  /** Set once the authored opening has been played, so it is offered but never forced twice. */
  onboarded: boolean;
}

export class Settings {
  assists: Assists = { ...DEFAULT_ASSISTS };
  bindings: Record<Action, Binding> = structuredClone(DEFAULT_BINDINGS);
  onboarded = false;
  onChange: (() => void) | null = null;

  constructor() { this.load(); }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<SettingsData>;
      if (d.assists) this.assists = { ...DEFAULT_ASSISTS, ...d.assists };
      if (d.bindings) for (const k of Object.keys(DEFAULT_BINDINGS) as Action[]) if (d.bindings[k]) this.bindings[k] = d.bindings[k];
      this.onboarded = !!d.onboarded;
    } catch { /* corrupt or unavailable storage: defaults stand */ }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ assists: this.assists, bindings: this.bindings, onboarded: this.onboarded } satisfies SettingsData));
    } catch { /* private mode: settings apply for the session only */ }
    this.onChange?.();
  }

  set<K extends keyof Assists>(key: K, value: Assists[K]) { this.assists[key] = value; this.save(); }
  resetAssists() { this.assists = { ...DEFAULT_ASSISTS }; this.save(); }
  resetBindings() { this.bindings = structuredClone(DEFAULT_BINDINGS); this.save(); }
  markOnboarded() { this.onboarded = true; this.save(); }

  /** The snapshot written into every RunState, always, per non-negotiable 8. */
  snapshot() {
    return {
      ...this.assists,
      allDefault: assistsAreDefault(this.assists),
      active: activeAssists(this.assists).map((a) => `${a.label} ${a.value}`),
      rebound: (Object.keys(this.bindings) as Action[]).filter((k) => bindingLabel(this.bindings[k]) !== bindingLabel(DEFAULT_BINDINGS[k])),
    };
  }
}

export const settings = new Settings();
