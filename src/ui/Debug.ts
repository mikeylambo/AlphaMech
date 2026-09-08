import { h, $ } from './Dom';
import { T, TUNING_GROUPS, TuningKey, resetTuning, tuningDefault } from '../core/Tuning';

/**
 * Live tuning panel bound directly to Tuning.ts. Every slider writes the same object the
 * simulation reads, so a change lands on the next frame — no reload, no rebuild.
 */
export class DebugPanel {
  root: HTMLElement;
  private inputs: { key: TuningKey; range?: HTMLInputElement; num?: HTMLInputElement; check?: HTMLInputElement }[] = [];
  /** Fired after any edit so derived state (reactor/upgrade modifiers) re-reads Tuning.ts. */
  onChange: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = h('div');
    this.root.id = 'debug';
    this.root.innerHTML = `<h3>LIVE TUNING · Tuning.ts</h3>
      <div class="note">Bound to the same object the simulation reads. Changes apply on the next frame.
      <b>P</b> toggles this panel, <b>O</b> the profiler.</div>`;
    parent.appendChild(this.root);

    for (const g of TUNING_GROUPS) {
      this.root.appendChild(h('h3', undefined, g.title));
      for (const key of g.keys) this.row(key);
    }
    const reset = h('button', 'btn ghost', 'RESET TO GDD VALUES');
    reset.style.cssText = 'margin-top:18px;font-size:11px;letter-spacing:2px;padding:8px 14px';
    reset.onclick = () => { resetTuning(); this.sync(); this.onChange?.(); };
    this.root.appendChild(reset);
  }

  private row(key: TuningKey) {
    const value = T[key];
    const row = h('div', 'tune');
    const label = h('label', undefined, key);
    label.title = key;
    row.appendChild(label);
    if (typeof value === 'boolean') {
      const check = h('input') as HTMLInputElement;
      check.type = 'checkbox';
      check.checked = value;
      check.onchange = () => { (T as Record<string, unknown>)[key] = check.checked; this.onChange?.(); };
      row.appendChild(check);
      this.inputs.push({ key, check });
    } else {
      const def = tuningDefault(key) as number;
      const min = 0;
      const max = Math.max(def * 2.5, def + 1);
      const step = def < 2 ? 0.01 : def < 50 ? 0.1 : 1;
      const range = h('input') as HTMLInputElement;
      range.type = 'range';
      range.min = String(min); range.max = String(max); range.step = String(step);
      range.value = String(value);
      const num = h('input') as HTMLInputElement;
      num.type = 'number';
      num.step = String(step);
      num.value = String(value);
      num.className = 'mono';
      const apply = (v: number) => { (T as Record<string, unknown>)[key] = v; range.value = String(v); num.value = String(v); this.onChange?.(); };
      range.oninput = () => apply(parseFloat(range.value));
      num.onchange = () => apply(parseFloat(num.value));
      const wrap = h('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px';
      wrap.append(range);
      row.append(wrap, num);
      this.inputs.push({ key, range, num });
    }
    this.root.appendChild(row);
  }

  sync() {
    for (const i of this.inputs) {
      const v = T[i.key];
      if (i.check) i.check.checked = v as boolean;
      else { if (i.range) i.range.value = String(v); if (i.num) i.num.value = String(v); }
    }
  }

  toggle() { this.root.classList.toggle('on'); if (this.root.classList.contains('on')) this.sync(); }
  get open() { return this.root.classList.contains('on'); }
}

/** Profiling overlay: frame time, draw calls, entity count, streamer state. */
export class Profiler {
  root: HTMLElement;
  private samples: number[] = [];
  private t = 0;

  constructor(parent: HTMLElement) {
    this.root = h('div');
    this.root.id = 'perf';
    this.root.className = 'mono';
    parent.appendChild(this.root);
  }

  toggle() { this.root.classList.toggle('on'); }
  get open() { return this.root.classList.contains('on'); }

  update(dt: number, info: { frameMs: number; drawCalls: number; triangles: number; programs: number; entities: number; hostiles: number; streamer: string; timeScale: number; extra?: string }) {
    this.samples.push(info.frameMs);
    if (this.samples.length > 90) this.samples.shift();
    this.t += dt;
    if (this.t < 0.12) return;
    this.t = 0;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const worst = Math.max(...this.samples);
    this.root.textContent =
      `FRAME   ${avg.toFixed(2)}ms  (${(1000 / Math.max(avg, 0.001)).toFixed(0)} fps)\n` +
      `WORST   ${worst.toFixed(2)}ms\n` +
      `DRAWS   ${info.drawCalls}\n` +
      `TRIS    ${(info.triangles / 1000).toFixed(1)}k\n` +
      `SHADERS ${info.programs}\n` +
      `ENTITY  ${info.entities}  (HOSTILE ${info.hostiles})\n` +
      `STREAM  ${info.streamer}\n` +
      `TSCALE  ${info.timeScale.toFixed(3)}` +
      (info.extra ? `\n${info.extra}` : '');
  }
}

export { $ };
