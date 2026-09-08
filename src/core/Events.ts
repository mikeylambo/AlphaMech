type Handler = (...args: any[]) => void;
export class EventBus {
  private m = new Map<string, Handler[]>();
  on(evt: string, h: Handler) { (this.m.get(evt) ?? this.m.set(evt, []).get(evt)!).push(h); return () => this.off(evt, h); }
  off(evt: string, h: Handler) { const a = this.m.get(evt); if (a) { const i = a.indexOf(h); if (i >= 0) a.splice(i, 1); } }
  emit(evt: string, ...args: any[]) { const a = this.m.get(evt); if (a) for (const h of a) h(...args); }
}
export const bus = new EventBus();
