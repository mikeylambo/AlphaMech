export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const setBar = (el: HTMLElement, v: number) => { el.style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`; };
export const pad = (n: number, w = 3) => String(Math.round(n)).padStart(w, '0');

/**
 * Grid focus model shared by every screen, so a controller can drive the entire game — title,
 * reactor select, FORGE, results and pause — without a mouse ever being touched.
 */
export interface NavItem {
  el: HTMLElement;
  activate: () => void;
  col?: number;
  row?: number;
  /** Sliders and steppers consume left/right to change their value instead of moving focus. */
  adjust?: (dir: -1 | 1) => void;
}

export class Nav {
  items: NavItem[] = [];
  index = 0;
  onMove: (() => void) | null = null;
  private enabled = false;

  set(items: NavItem[], startIndex = 0) {
    this.items = items;
    this.index = Math.min(startIndex, Math.max(0, items.length - 1));
    this.enabled = items.length > 0;
    this.paint();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.el.addEventListener('mouseenter', () => { if (this.index !== i) { this.index = i; this.paint(); this.onMove?.(); } });
      it.el.addEventListener('click', () => { this.index = i; this.paint(); it.activate(); });
    }
  }

  clear() { this.items = []; this.enabled = false; }

  private paint() {
    for (let i = 0; i < this.items.length; i++) this.items[i].el.classList.toggle('sel', i === this.index);
    this.items[this.index]?.el.scrollIntoView({ block: 'nearest' });
  }

  move(delta: number) {
    if (!this.enabled) return;
    const n = this.items.length;
    this.index = (this.index + delta + n) % n;
    this.paint();
    this.onMove?.();
  }

  /** Two-dimensional movement across rows declared by the items themselves. */
  move2(dx: number, dy: number) {
    if (!this.enabled) return;
    const cur = this.items[this.index];
    if (dy !== 0 && cur.row !== undefined) {
      const wantRow = cur.row + dy;
      const inRow = this.items.filter((i) => i.row === wantRow);
      if (inRow.length) {
        const col = cur.col ?? 0;
        let best = inRow[0], bestD = Infinity;
        for (const it of inRow) { const d = Math.abs((it.col ?? 0) - col); if (d < bestD) { bestD = d; best = it; } }
        this.index = this.items.indexOf(best);
        this.paint(); this.onMove?.();
        return;
      }
      return;
    }
    if (dx !== 0 && cur.adjust) { cur.adjust(dx > 0 ? 1 : -1); this.onMove?.(); return; }
    if (dx !== 0) {
      if (cur.row !== undefined) {
        const inRow = this.items.filter((i) => i.row === cur.row);
        const at = inRow.indexOf(cur);
        const next = inRow[(at + dx + inRow.length) % inRow.length];
        this.index = this.items.indexOf(next);
        this.paint(); this.onMove?.();
      } else this.move(dx);
    }
  }

  confirm() { if (this.enabled) this.items[this.index]?.activate(); }
}
