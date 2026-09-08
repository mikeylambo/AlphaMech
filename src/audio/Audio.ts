/**
 * Web Audio synthesized SFX. No files; every sound is procedurally shaped so boost modes, weapons and impacts
 * are clearly distinct. Continuous engine/thruster loops are filtered noise driven by gameplay state.
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  master!: GainNode; sfx!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engine!: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode; ab: GainNode; abFilt: BiquadFilterNode; hover: GainNode; hoverFilt: BiquadFilterNode };
  private started = false;
  enabled = true;
  /** Whole-bus bullet-time filter: the slow-mo must be heard (GDD §12). */
  private bus!: GainNode; private busFilt!: BiquadFilterNode; private busShimmer!: BiquadFilterNode;
  private timeScale = 1; private musicDucked = false;
  private lastRifle = 0;
  music!: GainNode; private musicOsc: { o: OscillatorNode; g: GainNode }[] = []; private padGain!: GainNode; private pulseGain!: GainNode; private bassGain!: GainNode; private nextBeat = 0; private beat = 0; private intensity = 0; private musicStarted = false; private wind!: GainNode; private windFilt!: BiquadFilterNode; private ambT = 0; private chordIdx = 0;

  start() {
    if (this.started) return; this.started = true;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext; this.ctx = new AC();
    const c = this.ctx!;
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    this.busFilt = c.createBiquadFilter(); this.busFilt.type = 'lowpass'; this.busFilt.frequency.value = 20000; this.busFilt.Q.value = 0.7;
    this.busShimmer = c.createBiquadFilter(); this.busShimmer.type = 'peaking'; this.busShimmer.frequency.value = 2400; this.busShimmer.gain.value = 0; this.busShimmer.Q.value = 0.8;
    this.bus = c.createGain(); this.bus.gain.value = 1; this.bus.connect(this.busFilt); this.busFilt.connect(this.busShimmer); this.busShimmer.connect(this.master);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2; comp.connect(this.bus);
    this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(comp);
    const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine: base idle hum + boost noise + AB roar + hover
    const mk = (type: BiquadFilterType, f: number, q: number) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start(); return { s, fl, g }; };
    const b = mk('bandpass', 380, 0.8), a = mk('lowpass', 900, 0.5), h = mk('bandpass', 1400, 1.2);
    this.engine = { src: b.s, filt: b.fl, gain: b.g, ab: a.g, abFilt: a.fl, hover: h.g, hoverFilt: h.fl };
    // idle machinery hum
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 46; const of = c.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 160; const og = c.createGain(); og.gain.value = 0.045; o.connect(of); of.connect(og); og.connect(this.sfx); o.start();
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 92; const og2 = c.createGain(); og2.gain.value = 0.02; o2.connect(og2); og2.connect(this.sfx); o2.start();
    // ambient wind bed
    const ws = c.createBufferSource(); ws.buffer = this.noiseBuf; ws.loop = true; this.windFilt = c.createBiquadFilter(); this.windFilt.type = 'lowpass'; this.windFilt.frequency.value = 420; this.windFilt.Q.value = 0.4; this.wind = c.createGain(); this.wind.gain.value = 0.06; ws.connect(this.windFilt); this.windFilt.connect(this.wind); this.wind.connect(this.bus); ws.start();
    this.startMusic();
  }
  // ---------------- procedural music: drone + pads always; pulse, bass and hats scale with combat intensity ----------------
  private startMusic() {
    const c = this.ctx!; this.musicStarted = true;
    this.music = c.createGain(); this.music.gain.value = 0.5; this.music.connect(this.bus);
    const rev = c.createConvolver(); const len = c.sampleRate * 2.2; const ir = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); } rev.buffer = ir; const revG = c.createGain(); revG.gain.value = 0.35; rev.connect(revG); revG.connect(this.music);
    // drone: detuned saws through a slow lowpass
    const droneFilt = c.createBiquadFilter(); droneFilt.type = 'lowpass'; droneFilt.frequency.value = 220; droneFilt.Q.value = 2; const droneG = c.createGain(); droneG.gain.value = 0.05; droneFilt.connect(droneG); droneG.connect(this.music); droneG.connect(rev);
    for (const f of [55, 55.4, 110.3]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(droneFilt); o.start(); this.musicOsc.push({ o, g: droneG }); }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lfoG = c.createGain(); lfoG.gain.value = 120; lfo.connect(lfoG); lfoG.connect(droneFilt.frequency); lfo.start();
    // pads: three sine/triangle voices, chord changes every 8 beats
    this.padGain = c.createGain(); this.padGain.gain.value = 0.0; this.padGain.connect(this.music); this.padGain.connect(rev);
    for (let i = 0; i < 3; i++) { const o = c.createOscillator(); o.type = i === 1 ? 'triangle' : 'sine'; o.frequency.value = 220; const g = c.createGain(); g.gain.value = 0.045; o.connect(g); g.connect(this.padGain); o.start(); this.musicOsc.push({ o, g }); }
    this.pulseGain = c.createGain(); this.pulseGain.gain.value = 0; this.pulseGain.connect(this.music);
    this.bassGain = c.createGain(); this.bassGain.gain.value = 0; this.bassGain.connect(this.music);
    this.nextBeat = c.currentTime + 0.5;
  }
  private static CHORDS = [[0, 3, 7], [-2, 2, 5], [3, 7, 10], [-4, 0, 3]]; // minor-ish progression in semitones over A
  private schedBeat(t: number) {
    const c = this.ctx!; const beat = this.beat; const inten = this.intensity;
    const semi = (n: number) => 110 * Math.pow(2, n / 12);
    if (beat % 8 === 0) { this.chordIdx = (this.chordIdx + 1) % AudioManager.CHORDS.length; const ch = AudioManager.CHORDS[this.chordIdx]; this.musicOsc.slice(3, 6).forEach((v, i) => v.o.frequency.setTargetAtTime(semi(ch[i] + 12), t, 0.6)); }
    // pulse: kick on 1 and 3, noise hat on offbeats, louder with intensity
    if (inten > 0.2) {
      if (beat % 2 === 0) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); const g = c.createGain(); g.gain.setValueAtTime(0.5 * inten, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28); o.connect(g); g.connect(this.pulseGain); o.start(t); o.stop(t + 0.3); }
      if (beat % 2 === 1 || inten > 0.7) { const n = c.createBufferSource(); n.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000; const g = c.createGain(); g.gain.setValueAtTime(0.09 * inten, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07); n.connect(f); f.connect(g); g.connect(this.pulseGain); n.start(t); n.stop(t + 0.08); }
      // bass arpeggio on the chord root, 16ths when intense
      const ch = AudioManager.CHORDS[this.chordIdx]; const note = ch[(beat >> 1) % 3] - 12;
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = semi(note); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600 + inten * 900, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.22); const g = c.createGain(); g.gain.setValueAtTime(0.16 * inten, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24); o.connect(f); f.connect(g); g.connect(this.bassGain); o.start(t); o.stop(t + 0.26);
    }
    this.beat++;
  }
  /** Call every frame. nearby = enemies within combat range; boss = boss fight; hp01 = player health fraction. */
  updateMusic(dt: number, nearby: number, boss: boolean, hp01: number) {
    if (!this.ctx || !this.musicStarted) return; const c = this.ctx; const t = c.currentTime;
    const target = boss ? 1 : nearby > 0 ? Math.min(0.85, 0.45 + nearby * 0.12) : 0;
    this.intensity += (target - this.intensity) * Math.min(1, dt * (target > this.intensity ? 1.2 : 0.25));
    const bpm = boss ? 132 : 108; const beatLen = 60 / bpm / 2;
    while (this.nextBeat < t + 0.15) { this.schedBeat(this.nextBeat); this.nextBeat += beatLen; }
    if (this.nextBeat < t) this.nextBeat = t + 0.05;
    if (!this.musicDucked) {
      this.padGain.gain.setTargetAtTime(0.5 + this.intensity * 0.3, t, 0.5);
      this.pulseGain.gain.setTargetAtTime(this.intensity, t, 0.3); this.bassGain.gain.setTargetAtTime(this.intensity * (hp01 < 0.3 ? 1.2 : 1), t, 0.3);
    }
    // ambient one-shots: distant rumbles and metallic clanks
    this.ambT -= dt;
    if (this.ambT <= 0) { this.ambT = 3 + Math.random() * 7; if (Math.random() < 0.6) this.noise(2.5, 'lowpass', 90, 40, 0.5, 0.12, 0.4, 'lin'); else this.tone('triangle', 700 + Math.random() * 900, 200, 0.5, 0.05, 0.005); }
    this.windFilt.frequency.setTargetAtTime(380 + Math.sin(t * 0.21) * 160, t, 0.5);
  }
  resume() { this.ctx?.resume(); }
  /** thrust 0..1, ab 0..1, hover 0..1, speed01 */
  setEngine(thrust: number, ab: number, hover: number, speed01: number) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(0.02 + thrust * 0.16, t, 0.05);
    this.engine.filt.frequency.setTargetAtTime(300 + speed01 * 900 + thrust * 300, t, 0.08);
    this.engine.ab.gain.setTargetAtTime(ab * 0.34, t, 0.06);
    this.engine.abFilt.frequency.setTargetAtTime(500 + ab * 1600, t, 0.1);
    this.engine.hover.gain.setTargetAtTime(hover * 0.12, t, 0.05);
  }
  private noise(dur: number, filterType: BiquadFilterType, f0: number, f1: number, q: number, vol: number, attack = 0.003, curve: 'exp' | 'lin' = 'exp') {
    if (!this.ctx || !this.enabled) return; const c = this.ctx; const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 1; const fl = c.createBiquadFilter(); fl.type = filterType; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + dur); else g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur + 0.05);
  }
  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.002) {
    if (!this.ctx || !this.enabled) return; const c = this.ctx; const t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  quickBoost() { this.noise(0.32, 'bandpass', 2400, 300, 0.9, 0.7, 0.004); this.tone('sawtooth', 220, 60, 0.28, 0.25); this.noise(0.12, 'highpass', 4000, 6000, 0.5, 0.3, 0.001); }
  assaultBoostOn() { this.noise(0.6, 'lowpass', 300, 2400, 0.7, 0.5, 0.05); this.tone('sawtooth', 80, 190, 0.7, 0.18, 0.1); }
  assaultBoostOff() { this.noise(0.4, 'lowpass', 1800, 300, 0.7, 0.25, 0.01); }
  jump() { this.noise(0.35, 'bandpass', 900, 1800, 1, 0.35, 0.01); }
  land(strength: number) { this.noise(0.25, 'lowpass', 500, 80, 0.6, 0.5 * strength, 0.002); this.tone('sine', 70, 30, 0.22, 0.45 * strength); this.noise(0.12, 'highpass', 3000, 2000, 0.6, 0.15 * strength); }
  rifle() { const now = performance.now(); if (now - this.lastRifle < 40) return; this.lastRifle = now; this.noise(0.09, 'lowpass', 3500, 400, 0.6, 0.55, 0.001); this.tone('square', 240, 60, 0.06, 0.18); this.noise(0.05, 'highpass', 5000, 3000, 0.5, 0.25, 0.001); }
  enemyRifle() { this.noise(0.08, 'bandpass', 1800, 500, 0.8, 0.22, 0.001); }
  cannon() { this.noise(0.55, 'lowpass', 1200, 60, 0.5, 1.0, 0.002); this.tone('sine', 55, 22, 0.6, 0.9); this.tone('sawtooth', 160, 40, 0.25, 0.3); this.noise(0.25, 'highpass', 2000, 6000, 0.5, 0.35, 0.001); }
  missileLaunch() { this.noise(0.4, 'bandpass', 700, 2400, 1.2, 0.3, 0.02); this.tone('sawtooth', 300, 900, 0.3, 0.06, 0.02); }
  missileFlyby() { this.noise(0.5, 'bandpass', 1800, 500, 2, 0.12, 0.05); }
  missileImpact() { this.noise(0.35, 'lowpass', 900, 100, 0.6, 0.55, 0.002); this.tone('sine', 90, 35, 0.3, 0.35); }
  explosion(size = 1) { this.noise(0.8 * size, 'lowpass', 1400, 60, 0.4, 0.9, 0.003); this.tone('sine', 60, 20, 0.7 * size, 0.8); this.noise(0.3, 'highpass', 3000, 8000, 0.4, 0.3, 0.001); }
  meleeActivate() { this.tone('sawtooth', 120, 880, 0.35, 0.22, 0.02); this.noise(0.4, 'highpass', 2000, 6000, 0.6, 0.18, 0.05); }
  meleeSwing() { this.noise(0.22, 'bandpass', 600, 2600, 1.5, 0.45, 0.005); }
  meleeHit() { this.noise(0.4, 'lowpass', 2500, 200, 0.5, 0.9, 0.001); this.tone('square', 900, 120, 0.18, 0.35); this.tone('sine', 70, 30, 0.35, 0.6); this.noise(0.25, 'highpass', 4000, 9000, 0.5, 0.45, 0.001); }
  hitArmor(big = false) { this.noise(big ? 0.18 : 0.08, 'bandpass', big ? 1200 : 2500, 400, 1.2, big ? 0.4 : 0.14, 0.001); if (big) this.tone('sine', 140, 50, 0.15, 0.25); }
  playerHit(big = false) { this.noise(big ? 0.3 : 0.14, 'lowpass', 1800, 200, 0.6, big ? 0.6 : 0.3, 0.001); this.tone('triangle', 200, 80, 0.12, 0.2); }
  stagger() { this.tone('square', 1200, 300, 0.4, 0.3, 0.005); this.tone('square', 900, 200, 0.5, 0.25, 0.08); this.noise(0.5, 'bandpass', 1500, 300, 1.5, 0.5, 0.005); }
  lockOn() { this.tone('sine', 1400, 1400, 0.06, 0.18); setTimeout(() => this.tone('sine', 1900, 1900, 0.08, 0.2), 70); }
  lockOff() { this.tone('sine', 900, 500, 0.1, 0.12); }
  warning() { this.tone('square', 880, 880, 0.09, 0.14); setTimeout(() => this.tone('square', 880, 880, 0.09, 0.14), 130); }
  reload() { this.noise(0.12, 'bandpass', 1500, 800, 2, 0.2, 0.001); setTimeout(() => this.noise(0.1, 'bandpass', 2500, 1200, 2, 0.25, 0.001), 220); }
  empty() { this.tone('square', 300, 300, 0.05, 0.08); }
  bossRoar() { this.tone('sawtooth', 50, 120, 1.4, 0.4, 0.2); this.noise(1.5, 'lowpass', 200, 1600, 0.5, 0.5, 0.3); }
  laserCharge(dur: number) { this.tone('sine', 200, 1800, dur, 0.18, 0.05); }
  laserFire() { this.noise(0.6, 'highpass', 800, 4000, 0.8, 0.5, 0.01); this.tone('sawtooth', 500, 200, 0.6, 0.2); }
  shellFire() { this.noise(0.4, 'lowpass', 900, 80, 0.5, 0.7, 0.002); this.tone('sine', 65, 25, 0.5, 0.6); }
  checkpoint() { this.tone('sine', 660, 660, 0.12, 0.15); setTimeout(() => this.tone('sine', 990, 990, 0.2, 0.15), 120); }

  // ---------------------------------------------------------------- BLINKFALL additions
  /**
   * Bullet time is a sound, not just a slowdown: a lowpass sweep and a pitch drop across the
   * entire bus, music included. Called every frame with the current simulation time scale.
   */
  setTimeScale(ts: number) {
    if (!this.ctx) return;
    this.timeScale = ts;
    const t = this.ctx.currentTime;
    const k = Math.max(0, Math.min(1, (ts - 0.1) / 0.9));
    this.busFilt.frequency.setTargetAtTime(340 + k * k * 19000, t, 0.06);
    this.busShimmer.gain.setTargetAtTime((1 - k) * 6, t, 0.08);
    const cents = (1 - k) * -900;
    for (const v of this.musicOsc) v.o.detune.setTargetAtTime(cents, t, 0.08);
    this.engine.src.playbackRate.setTargetAtTime(0.4 + k * 0.6, t, 0.08);
  }
  get slowed() { return this.timeScale < 0.95; }

  /** FORGE stillness beat: the score loses its percussion (GDD §2.4). */
  duckPercussion(on: boolean) {
    if (!this.ctx) return;
    this.musicDucked = on;
    const t = this.ctx.currentTime;
    this.pulseGain.gain.setTargetAtTime(on ? 0 : this.intensity, t, on ? 0.9 : 0.4);
    this.bassGain.gain.setTargetAtTime(on ? 0 : this.intensity, t, on ? 0.9 : 0.4);
    this.padGain.gain.setTargetAtTime(on ? 0.9 : 0.5, t, 0.8);
  }
  get percussionDucked() { return this.musicDucked; }

  windup(dur: number) { this.tone('sine', 320, 660, Math.min(1.2, dur), 0.10, 0.03); this.noise(Math.min(1.0, dur), 'bandpass', 900, 2200, 3, 0.07, 0.05); }
  enemyShot() { this.noise(0.09, 'bandpass', 1700, 480, 0.9, 0.26, 0.001); this.tone('square', 200, 70, 0.06, 0.09); }
  lance() { this.tone('sawtooth', 900, 260, 0.32, 0.26, 0.005); this.noise(0.34, 'highpass', 1200, 4200, 0.7, 0.28, 0.004); }
  melee() { this.noise(0.2, 'bandpass', 700, 2800, 1.6, 0.4, 0.004); this.tone('square', 700, 140, 0.14, 0.2); }
  ricochet() { this.tone('square', 2400, 900, 0.09, 0.16, 0.001); this.noise(0.1, 'highpass', 5000, 2500, 1.4, 0.18, 0.001); }
  deploy() { this.tone('square', 520, 260, 0.12, 0.16, 0.002); this.noise(0.14, 'bandpass', 1200, 600, 2, 0.14, 0.002); }
  advance() { this.tone('sawtooth', 70, 46, 0.9, 0.3, 0.05); this.noise(0.9, 'lowpass', 420, 160, 0.6, 0.34, 0.06); }

  /** The vanish. Reverse-swell in, hard transient at the blink, filtered tail. */
  perfectVanish() {
    this.tone('sine', 1800, 220, 0.5, 0.32, 0.004);
    this.noise(0.45, 'highpass', 7000, 1200, 0.7, 0.5, 0.002);
    this.tone('sawtooth', 120, 40, 0.7, 0.22, 0.02);
  }
  vanishFail() { this.noise(0.14, 'bandpass', 900, 400, 1.6, 0.16, 0.002); }
  counterVanish() { this.tone('sawtooth', 240, 1500, 0.35, 0.34, 0.006); this.noise(0.4, 'bandpass', 3000, 900, 1.2, 0.4, 0.004); }
  rallyPrompt() { this.tone('sine', 1500, 1500, 0.07, 0.2); }
  rallyHit(step: number) { this.tone('square', 600 + step * 130, 220, 0.1, 0.24, 0.001); this.noise(0.12, 'highpass', 4000, 8000, 0.6, 0.3, 0.001); }
  rallyWin() { this.tone('sine', 520, 1560, 0.5, 0.32, 0.01); this.explosion(0.8); }
  rallyFail() { this.tone('sawtooth', 300, 70, 0.5, 0.34, 0.005); this.noise(0.5, 'lowpass', 1400, 120, 0.5, 0.42, 0.003); }
  pileDriver() { this.noise(0.7, 'lowpass', 1600, 50, 0.4, 1.0, 0.002); this.tone('sine', 80, 24, 0.8, 0.9); this.noise(0.3, 'highpass', 2500, 7000, 0.5, 0.35, 0.001); }

  // FORGE choreography
  forgeArrive() { this.noise(0.8, 'lowpass', 900, 120, 0.6, 0.4, 0.05); this.tone('sine', 120, 44, 1.1, 0.4, 0.05); }
  forgeLock() { this.noise(0.16, 'bandpass', 700, 260, 2.4, 0.5, 0.001); this.tone('square', 180, 70, 0.16, 0.3); }
  forgeAssemble() { this.tone('sine', 300, 900, 0.5, 0.14, 0.03); this.noise(0.5, 'highpass', 1800, 5200, 0.8, 0.12, 0.05); }
  forgeLaunch() { this.tone('sawtooth', 90, 420, 1.0, 0.42, 0.05); this.noise(1.1, 'lowpass', 400, 3200, 0.6, 0.5, 0.08); }
  doorsOpen() { this.noise(1.4, 'lowpass', 260, 900, 0.5, 0.34, 0.2); this.tone('sine', 42, 60, 1.6, 0.3, 0.3); }

  // UI
  uiMove() { this.tone('sine', 1150, 1150, 0.04, 0.10); }
  uiSelect() { this.tone('sine', 780, 1560, 0.13, 0.18, 0.003); }
  uiBack() { this.tone('sine', 900, 450, 0.11, 0.12); }
  rankStamp() { this.noise(0.3, 'lowpass', 2200, 200, 0.5, 0.5, 0.001); this.tone('sine', 160, 60, 0.4, 0.4); }
}
