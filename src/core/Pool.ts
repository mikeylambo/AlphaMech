export class Pool<T> {
  private free: T[] = [];
  readonly active: T[] = [];
  constructor(private factory: () => T, private reset: (t: T) => void, prealloc = 0, public readonly cap = Infinity) {
    for (let i = 0; i < prealloc; i++) this.free.push(factory());
  }
  acquire(): T | null {
    let t = this.free.pop();
    if (!t) {
      if (this.active.length >= this.cap) return null;
      t = this.factory();
    }
    this.active.push(t);
    return t;
  }
  release(t: T) {
    const i = this.active.indexOf(t);
    if (i >= 0) { this.active[i] = this.active[this.active.length - 1]; this.active.pop(); }
    this.reset(t);
    this.free.push(t);
  }
  releaseAt(i: number) {
    const t = this.active[i];
    this.active[i] = this.active[this.active.length - 1]; this.active.pop();
    this.reset(t); this.free.push(t);
  }
}
