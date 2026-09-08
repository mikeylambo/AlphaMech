import { T } from './Tuning';
import { clamp } from './MathUtil';

/**
 * One input surface for keyboard + mouse + gamepad. Every action is readable as a held state and
 * as a single-frame edge, and every action is bound on both devices — the brief requires full
 * controller support including menu navigation, so nothing may be mouse-only.
 */
export type Action =
  | 'vanish' | 'assault' | 'rise' | 'descend' | 'lock' | 'cycleNext' | 'cyclePrev'
  | 'rifle' | 'blade' | 'missiles' | 'pile' | 'pause' | 'debug' | 'profiler'
  | 'menuUp' | 'menuDown' | 'menuLeft' | 'menuRight' | 'confirm' | 'cancel';

export type RallyDir = 'W' | 'A' | 'S' | 'D';
export const RALLY_DIRS: RallyDir[] = ['W', 'A', 'S', 'D'];

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, DU: 12, DD: 13, DL: 14, DR: 15 };

export class InputManager {
  keys: Record<string, boolean> = {};
  private prevKeys: Record<string, boolean> = {};
  private mouseButtons = 0;
  private prevMouse = 0;
  private wheel = 0;
  lookX = 0; lookY = 0;                 // accumulated look delta for this frame
  moveX = 0; moveZ = 0;                 // -1..1 analog move
  padConnected = false;
  private padPrev: boolean[] = [];
  private padNow: boolean[] = [];
  private padAxes = [0, 0, 0, 0];
  private repeatT = 0;
  private lastRepeat: Action | null = null;
  /** Set while a modal (menu / FORGE) owns input: gameplay actions stop reading. */
  menuMode = false;
  canvas: HTMLCanvasElement;
  onRallyDir: ((d: RallyDir) => void) | null = null;
  private padStickLatch = { x: 0, y: 0 };
  /**
   * Scripted input for the deterministic replay harness (GDD §14's input-replay tolerance
   * test). When set, device state is ignored entirely for that frame.
   */
  scripted: { down: string[]; look: [number, number] } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      const k = norm(e.key);
      if (!this.keys[k] && this.onRallyDir && (RALLY_DIRS as string[]).includes(k)) this.onRallyDir(k as RallyDir);
      this.keys[k] = true;
      if (k === 'TAB' || k === ' ' || k.startsWith('ARROW')) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[norm(e.key)] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouseButtons = 0; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.menuMode && document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      this.mouseButtons |= e.button === 0 ? 1 : e.button === 2 ? 2 : e.button === 1 ? 4 : 0;
    });
    addEventListener('mouseup', (e) => { this.mouseButtons &= ~(e.button === 0 ? 1 : e.button === 2 ? 2 : e.button === 1 ? 4 : 0); });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.lookX -= e.movementX * T.mouseSens;
      this.lookY -= e.movementY * T.mouseSens;
    });
    addEventListener('wheel', (e) => { if (document.pointerLockElement === canvas) { e.preventDefault(); this.wheel += Math.sign(e.deltaY); } }, { passive: false });
    addEventListener('gamepadconnected', () => { this.padConnected = true; });
    addEventListener('gamepaddisconnected', () => { this.padConnected = navigator.getGamepads().some((g) => !!g); });
  }

  lockPointer() { if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock(); }
  releasePointer() { if (document.pointerLockElement === this.canvas) document.exitPointerLock(); }
  get pointerLocked() { return document.pointerLockElement === this.canvas; }

  /** Sample devices. Call once at the top of the frame, before anything reads input. */
  poll(dt: number) {
    if (this.scripted) {
      const next: Record<string, boolean> = {};
      for (const k of this.scripted.down) next[k.toUpperCase()] = true;
      // rally prompts are edge-driven, so replay must raise the same edges a player would
      if (this.onRallyDir) for (const d of RALLY_DIRS) if (next[d] && !this.keys[d]) this.onRallyDir(d);
      this.keys = next;
      this.mouseButtons = next['MOUSE1'] ? 1 : 0;
      if (next['MOUSE2']) this.mouseButtons |= 2;
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
      const dz = T.padDeadzone;
      const ax = (v: number) => (Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz));
      this.padAxes = [ax(pad.axes[0] ?? 0), ax(pad.axes[1] ?? 0), ax(pad.axes[2] ?? 0), ax(pad.axes[3] ?? 0)];
      if (!this.menuMode) {
        this.lookX -= this.padAxes[2] * T.padLookSens * dt;
        this.lookY -= this.padAxes[3] * T.padLookSens * dt;
      }
      // rally accepts stick flicks and the d-pad as directions
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

    // repeat timer for held menu navigation
    this.repeatT = Math.max(0, this.repeatT - dt);
  }

  /** Consume look delta accumulated since the last call. */
  takeLook(): [number, number] { const r: [number, number] = [this.lookX, this.lookY]; this.lookX = 0; this.lookY = 0; return r; }
  takeWheel(): number { const w = this.wheel; this.wheel = 0; return w; }
  endFrame() { this.prevKeys = { ...this.keys }; this.prevMouse = this.mouseButtons; }

  private key(k: string) { return !!this.keys[k]; }
  private keyEdge(k: string) { return !!this.keys[k] && !this.prevKeys[k]; }
  private padDown(b: number) { return !!this.padNow[b]; }
  private padEdge(b: number) { return !!this.padNow[b] && !this.padPrev[b]; }

  held(a: Action): boolean {
    switch (a) {
      case 'vanish': return this.key('SHIFT') || this.padDown(PAD.RB);
      case 'assault': return this.key('E') || this.padDown(PAD.L3);
      case 'rise': return this.key(' ') || this.padDown(PAD.A);
      case 'descend': return this.key('C') || this.key('CONTROL') || this.padDown(PAD.B);
      case 'lock': return this.key('Q') || !!(this.mouseButtons & 4) || this.padDown(PAD.R3);
      case 'rifle': return !!(this.mouseButtons & 1) || this.padDown(PAD.RT);
      case 'blade': return !!(this.mouseButtons & 2) || this.key('F') || this.padDown(PAD.X);
      case 'missiles': return this.key('1') || this.padDown(PAD.LB);
      case 'pile': return this.key('2') || this.padDown(PAD.Y);
      case 'menuUp': return this.key('W') || this.key('ARROWUP') || this.padDown(PAD.DU) || this.padAxes[1] < -0.5;
      case 'menuDown': return this.key('S') || this.key('ARROWDOWN') || this.padDown(PAD.DD) || this.padAxes[1] > 0.5;
      case 'menuLeft': return this.key('A') || this.key('ARROWLEFT') || this.padDown(PAD.DL) || this.padAxes[0] < -0.5;
      case 'menuRight': return this.key('D') || this.key('ARROWRIGHT') || this.padDown(PAD.DR) || this.padAxes[0] > 0.5;
      case 'confirm': return this.key('ENTER') || this.key(' ') || this.padDown(PAD.A);
      case 'cancel': return this.key('ESCAPE') || this.padDown(PAD.B);
      default: return false;
    }
  }

  pressed(a: Action): boolean {
    switch (a) {
      case 'vanish': return this.keyEdge('SHIFT') || this.padEdge(PAD.RB);
      case 'assault': return this.keyEdge('E') || this.padEdge(PAD.L3);
      case 'lock': return this.keyEdge('Q') || (!!(this.mouseButtons & 4) && !(this.prevMouse & 4)) || this.padEdge(PAD.R3);
      case 'cycleNext': return this.keyEdge('ARROWRIGHT') || this.keyEdge('TAB') || this.padEdge(PAD.DR);
      case 'cyclePrev': return this.keyEdge('ARROWLEFT') || this.padEdge(PAD.DL);
      case 'blade': return (!!(this.mouseButtons & 2) && !(this.prevMouse & 2)) || this.keyEdge('F') || this.padEdge(PAD.X);
      case 'missiles': return this.keyEdge('1') || this.padEdge(PAD.LB);
      case 'pile': return this.keyEdge('2') || this.padEdge(PAD.Y);
      case 'pause': return this.keyEdge('ESCAPE') || this.padEdge(PAD.START);
      case 'debug': return this.keyEdge('P');
      case 'profiler': return this.keyEdge('O');
      // deliberately not the mouse: screens bind their own click handlers, and counting a
      // click here would activate the focused item a second time
      case 'confirm': return this.keyEdge('ENTER') || this.keyEdge(' ') || this.padEdge(PAD.A);
      case 'cancel': return this.keyEdge('ESCAPE') || this.padEdge(PAD.B);
      case 'menuUp': case 'menuDown': case 'menuLeft': case 'menuRight': return this.navEdge(a);
      default: return false;
    }
  }

  /** Menu navigation with hold-to-repeat, shared by keyboard, d-pad and stick. */
  private navEdge(a: Action): boolean {
    const down = this.held(a);
    if (!down) { if (this.lastRepeat === a) { this.lastRepeat = null; this.repeatT = 0; } return false; }
    if (this.lastRepeat !== a) { this.lastRepeat = a; this.repeatT = 0.36; return true; }
    if (this.repeatT <= 0) { this.repeatT = 0.11; return true; }
    return false;
  }
}

function norm(k: string) { return k.length === 1 ? k.toUpperCase() : k.toUpperCase(); }
