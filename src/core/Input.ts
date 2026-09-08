import { T } from './Tuning';
import { clamp } from './MathUtil';
import { Action, Binding, PAD, REBINDABLE, settings } from './Settings';

/**
 * One input surface for keyboard + mouse + gamepad, driven by a rebindable table.
 *
 * Every action is readable as a held state and as a single-frame edge, and every action is bound
 * on both devices — full controller support includes menu navigation, so nothing may be
 * mouse-only. Menu navigation itself is deliberately not rebindable: a bad binding must never be
 * able to lock someone out of the screen that would let them fix it.
 */
export type { Action };

export type RallyDir = 'W' | 'A' | 'S' | 'D';
export const RALLY_DIRS: RallyDir[] = ['W', 'A', 'S', 'D'];

/** What a rebinding capture returns. */
export type CapturedInput = { kind: 'key'; key: string } | { kind: 'mouse'; button: number } | { kind: 'pad'; button: number };

export class InputManager {
  keys: Record<string, boolean> = {};
  private prevKeys: Record<string, boolean> = {};
  private mouseButtons = 0;
  private prevMouse = 0;
  private wheel = 0;
  lookX = 0; lookY = 0;
  moveX = 0; moveZ = 0;
  padConnected = false;
  private padPrev: boolean[] = [];
  private padNow: boolean[] = [];
  private padAxes = [0, 0, 0, 0];
  private repeatT = 0;
  private lastRepeat: Action | null = null;
  menuMode = false;
  canvas: HTMLCanvasElement;
  onRallyDir: ((d: RallyDir) => void) | null = null;
  private padStickLatch = { x: 0, y: 0 };
  scripted: { down: string[]; look: [number, number] } | null = null;

  /** Rebinding: while set, the next input is captured and delivered instead of acted on. */
  private capture: ((c: CapturedInput) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      const k = norm(e.key);
      if (this.capture) { e.preventDefault(); const c = this.capture; this.capture = null; c({ kind: 'key', key: k }); return; }
      if (!this.keys[k] && this.onRallyDir && (RALLY_DIRS as string[]).includes(k)) this.onRallyDir(k as RallyDir);
      this.keys[k] = true;
      if (k === 'TAB' || k === ' ' || k.startsWith('ARROW')) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[norm(e.key)] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouseButtons = 0; });
    canvas.addEventListener('mousedown', (e) => {
      const bit = e.button === 0 ? 1 : e.button === 2 ? 2 : e.button === 1 ? 4 : 0;
      if (this.capture) { const c = this.capture; this.capture = null; c({ kind: 'mouse', button: bit }); return; }
      if (!this.menuMode && document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      this.mouseButtons |= bit;
    });
    addEventListener('mouseup', (e) => { this.mouseButtons &= ~(e.button === 0 ? 1 : e.button === 2 ? 2 : e.button === 1 ? 4 : 0); });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const s = T.mouseSens * settings.assists.cameraSensitivity;
      this.lookX -= e.movementX * s;
      this.lookY -= e.movementY * s;
    });
    addEventListener('wheel', (e) => { if (document.pointerLockElement === canvas) { e.preventDefault(); this.wheel += Math.sign(e.deltaY); } }, { passive: false });
    addEventListener('gamepadconnected', () => { this.padConnected = true; });
    addEventListener('gamepaddisconnected', () => { this.padConnected = navigator.getGamepads().some((g) => !!g); });
  }

  /** Begin a rebinding capture. The next key, mouse button or pad button is delivered to `cb`. */
  captureNext(cb: (c: CapturedInput) => void) { this.capture = cb; }
  get capturing() { return !!this.capture; }
  cancelCapture() { this.capture = null; }

  lockPointer() { if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock(); }
  releasePointer() { if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  get pointerLocked() { return document.pointerLockElement === this.canvas; }

  poll(dt: number) {
    if (this.scripted) {
      const next: Record<string, boolean> = {};
      for (const k of this.scripted.down) next[k.toUpperCase()] = true;
      if (this.onRallyDir) for (const d of RALLY_DIRS) if (next[d] && !this.keys[d]) this.onRallyDir(d);
      this.keys = next;
      this.mouseButtons = (next['MOUSE1'] ? 1 : 0) | (next['MOUSE2'] ? 2 : 0);
      this.lookX += this.scripted.look[0];
      this.lookY += this.scripted.look[1];
      this.moveX = clamp((next['D'] ? 1 : 0) - (next['A'] ? 1 : 0), -1, 1);
      this.moveZ = clamp((next['W'] ? 1 : 0) - (next['S'] ? 1 : 0), -1, 1);
      this.padNow = [];
      this.padAxes = [0, 0, 0, 0];
      this.repeatT = Math.max(0, this.repeatT - dt);
      return;
    }
    this.padPrev = this.padNow.slice();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this.padConnected = !!pad;
    this.padNow = [];
    if (pad) {
      for (let i = 0; i < pad.buttons.length; i++) this.padNow[i] = pad.buttons[i].pressed || pad.buttons[i].value > 0.4;
      if (this.capture) {
        for (let i = 0; i < this.padNow.length; i++) {
          if (this.padNow[i] && !this.padPrev[i]) { const c = this.capture; this.capture = null; c({ kind: 'pad', button: i }); break; }
        }
      }
      const dz = T.padDeadzone;
      const ax = (v: number) => (Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz));
      this.padAxes = [ax(pad.axes[0] ?? 0), ax(pad.axes[1] ?? 0), ax(pad.axes[2] ?? 0), ax(pad.axes[3] ?? 0)];
      if (!this.menuMode) {
        const s = T.padLookSens * settings.assists.cameraSensitivity * dt;
        this.lookX -= this.padAxes[2] * s;
        this.lookY -= this.padAxes[3] * s;
      }
      if (this.onRallyDir) {
        const sx = this.padAxes[0], sy = this.padAxes[1];
        const flick = (v: number, prev: number) => Math.abs(v) > 0.65 && Math.abs(prev) <= 0.65;
        if (flick(sx, this.padStickLatch.x)) this.onRallyDir(sx > 0 ? 'D' : 'A');
        else if (flick(sy, this.padStickLatch.y)) this.onRallyDir(sy > 0 ? 'S' : 'W');
        else if (this.padEdge(PAD.DU)) this.onRallyDir('W');
        else if (this.padEdge(PAD.DD)) this.onRallyDir('S');
        else if (this.padEdge(PAD.DL)) this.onRallyDir('A');
        else if (this.padEdge(PAD.DR)) this.onRallyDir('D');
        this.padStickLatch.x = sx; this.padStickLatch.y = sy;
      }
    } else this.padAxes = [0, 0, 0, 0];

    const kx = (this.keys['D'] ? 1 : 0) - (this.keys['A'] ? 1 : 0);
    const kz = (this.keys['W'] ? 1 : 0) - (this.keys['S'] ? 1 : 0);
    this.moveX = clamp(kx + this.padAxes[0], -1, 1);
    this.moveZ = clamp(kz - this.padAxes[1], -1, 1);
    this.repeatT = Math.max(0, this.repeatT - dt);
  }

  takeLook(): [number, number] { const r: [number, number] = [this.lookX, this.lookY]; this.lookX = 0; this.lookY = 0; return r; }
  takeWheel(): number { const w = this.wheel; this.wheel = 0; return w; }
  endFrame() { this.prevKeys = { ...this.keys }; this.prevMouse = this.mouseButtons; }

  private padDown(bt: number) { return !!this.padNow[bt]; }
  private padEdge(bt: number) { return !!this.padNow[bt] && !this.padPrev[bt]; }

  private binding(a: Action): Binding { return settings.bindings[a] ?? { keys: [], mouse: [], pad: [] }; }

  held(a: Action): boolean {
    if (this.capture) return false;
    const bd = this.binding(a);
    for (const k of bd.keys) if (this.keys[k]) return true;
    for (const m of bd.mouse) if (this.mouseButtons & m) return true;
    for (const p of bd.pad) if (this.padDown(p)) return true;
    // analog stick standing in for menu direction, so a stick alone can drive every screen
    if (a === 'menuUp' && this.padAxes[1] < -0.5) return true;
    if (a === 'menuDown' && this.padAxes[1] > 0.5) return true;
    if (a === 'menuLeft' && this.padAxes[0] < -0.5) return true;
    if (a === 'menuRight' && this.padAxes[0] > 0.5) return true;
    return false;
  }

  pressed(a: Action): boolean {
    if (this.capture) return false;
    if (a === 'menuUp' || a === 'menuDown' || a === 'menuLeft' || a === 'menuRight') return this.navEdge(a);
    const bd = this.binding(a);
    for (const k of bd.keys) if (this.keys[k] && !this.prevKeys[k]) return true;
    for (const m of bd.mouse) if ((this.mouseButtons & m) && !(this.prevMouse & m)) return true;
    for (const p of bd.pad) if (this.padEdge(p)) return true;
    return false;
  }

  released(a: Action): boolean {
    if (this.capture) return false;
    const bd = this.binding(a);
    for (const k of bd.keys) if (!this.keys[k] && this.prevKeys[k]) return true;
    for (const m of bd.mouse) if (!(this.mouseButtons & m) && (this.prevMouse & m)) return true;
    for (const p of bd.pad) if (!this.padNow[p] && this.padPrev[p]) return true;
    return false;
  }

  /** Menu navigation with hold-to-repeat, shared by keyboard, d-pad and stick. */
  private navEdge(a: Action): boolean {
    const down = this.held(a);
    if (!down) { if (this.lastRepeat === a) { this.lastRepeat = null; this.repeatT = 0; } return false; }
    if (this.lastRepeat !== a) { this.lastRepeat = a; this.repeatT = 0.36; return true; }
    if (this.repeatT <= 0) { this.repeatT = 0.11; return true; }
    return false;
  }

  /** Which actions currently collide with `binding`, so the settings screen can warn. */
  static conflicts(action: Action, c: CapturedInput): Action[] {
    const out: Action[] = [];
    for (const a of REBINDABLE) {
      if (a === action) continue;
      const bd = settings.bindings[a];
      if (c.kind === 'key' && bd.keys.includes(c.key)) out.push(a);
      if (c.kind === 'mouse' && bd.mouse.includes(c.button)) out.push(a);
      if (c.kind === 'pad' && bd.pad.includes(c.button)) out.push(a);
    }
    return out;
  }

  /** Apply a captured input as the sole binding for `action` on that device. */
  static rebind(action: Action, c: CapturedInput) {
    const bd = settings.bindings[action];
    if (c.kind === 'key') bd.keys = [c.key];
    else if (c.kind === 'mouse') bd.mouse = [c.button];
    else bd.pad = [c.button];
    settings.save();
  }
}

function norm(k: string) { return k.toUpperCase(); }
