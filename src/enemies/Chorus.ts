import * as THREE from 'three';
import { T } from '../core/Tuning';
import { RNG } from '../core/RNG';
import { clamp, damp, deg, dampAngle } from '../core/MathUtil';
import { Enemy } from './Enemy';
import { Archetype, ATTACKS, AttackId } from './Archetypes';
import { CombatContext } from '../frame/Context';
import { DamageSource } from '../frame/Types';
import { MechPalette } from '../entities/Materials';

const CHORUS_PALETTE: MechPalette = {
  armor: 0x3d4650, armor2: 0x232a31, dark: 0x12161a, metal: 0x6b7682, joint: 0x1e242a,
  accent: 0x8ab4ff, glow: 0x9fc8ff,
};

/**
 * The three voices. Same silhouette, three DIFFERENT BANDS — which is the whole boss.
 *
 * Structure lives in the shared pool, not here: a voice's own Vitals carries a nominal figure
 * so impact and stagger behave normally, and every point of structural damage is routed into
 * the pool by `applyHit`.
 */
const voice = (name: string, band: [number, number], speed: number, attacks: { id: AttackId; weight: number }[]): Archetype => ({
  id: 'lancer', name,
  structure: T.chorusStructure, impactMax: T.chorusImpactMax,
  band, speed, accel: 200, scale: 1.16,
  attacks, flying: false, cruiseAltitude: 0, frontalShield: false,
  palette: CHORUS_PALETTE, chassis: 'ace',
});

export const CHORUS_VOICES: Archetype[] = [
  voice('CHORUS · CANTOR', [20, 48], 74, [{ id: 'lunge', weight: 55 }, { id: 'sweep', weight: 45 }]),
  voice('CHORUS · TENOR', [62, 112], 62, [{ id: 'volley', weight: 45 }, { id: 'scatter', weight: 30 }, { id: 'lance', weight: 25 }]),
  voice('CHORUS · BASSO', [132, 190], 50, [{ id: 'lance', weight: 45 }, { id: 'mortar', weight: 55 }]),
];

/**
 * ============================================================================================
 * CHORUS — Sector 2's FORMATION boss  (GDD §9, RC brief §2.2)
 *
 * "Three linked frames, one shared pool of 34,000, three separate bands, independently granted
 * tokens."
 *
 * WHY IT IS NOT GRAVEMARK AGAIN.
 *
 * GRAVEMARK is a rotation exam expressed in the BOSS's frame of reference: its escorts hold
 * station in ITS rear arc, and you win by out-rotating a facing that is yaw-rate capped.
 *
 * CHORUS is a rotation exam expressed in YOUR frame of reference, and it is the purest possible
 * statement of Law II as v2.3 corrects it. The three voices sit in three different bands — close,
 * mid and far — which means that left alone they naturally occupy three widely separated
 * bearings. While the arc they subtend from where YOU are stands above the harmony threshold,
 * the pool refuses structural damage entirely.
 *
 * Turning the camera cannot change that number; the arc is rotation-invariant. Only MOVING can.
 * You have to break out to a position from which three frames at three different ranges collapse
 * into one narrow span, and then hold that relationship while they work to re-establish it.
 *
 * It is also the boss that teaches PATCH 2 directly: three well-spread hostiles are exactly the
 * composition that can reach the 235 degree token threshold, so a player who fails to collapse
 * CHORUS is not merely failing to damage it — they are handing the Director a second attack
 * token, from the same three frames, for free.
 * ============================================================================================
 */
export class Chorus extends Enemy {
  /** The other two voices. `this` is the first — the pool lives on it. */
  voices: Chorus[] = [];
  /** Set on the two frames that are not the pool holder. */
  readonly conductor: Chorus;
  readonly voiceIndex: number;

  phase: 1 | 2 | 3 = 1;
  /** Degrees of arc the three voices currently subtend from the pilot. */
  spread = 0;
  inHarmony = true;
  /** Structural damage the harmony has refused — the number that proves the rule bit. */
  damageRefused = 0;
  damageTaken = 0;
  /** Seconds spent collapsed, so the fight can report how much of it was solved rather than survived. */
  collapsedFor = 0;

  onPhaseChange: ((phase: 2 | 3) => void) | null = null;
  onHarmonyChange: ((harmony: boolean) => void) | null = null;

  private link: THREE.Line | null = null;
  private linkGeo: THREE.BufferGeometry | null = null;
  private swapT = 0;
  private bandOverride: [number, number] | null = null;

  /**
   * Harmony threshold, degrees. Below this the pool is open.
   *
   * 180 is not an arbitrary number: PATCH 2 establishes that two hostiles can never exceed 180
   * degrees, so a threshold at 180 says exactly "you have made three frames behave like two".
   * That is a positional statement with a proof behind it, not a tuning knob.
   */
  static readonly HARMONY_ARC = 180;
  /**
   * How hard a voice steers back onto its bearing station, per phase.
   *
   * This is the number the whole fight is fought against. It is a STEERING gain, capped by the
   * voice's own speed, so a pilot moving faster than the voices can re-bear will drag them out
   * of station and into a trailing cluster. Raising it does not make the boss hit harder; it
   * makes the shape re-form sooner, which is a positional cost and nothing else.
   */
  static readonly STATION_GAIN = [1.9, 2.9, 3.8];
  /** Radians per second the whole formation's station pattern drifts. Phase 3 spins it. */
  static readonly PHASE_DRIFT = [0.0, 0.12, 0.42];
  /** Shared rotation of the station pattern, owned by the conductor. */
  patternPhase = 0;

  constructor(ctx: CombatContext, spec: Archetype, position: THREE.Vector3, index: number, conductor?: Chorus) {
    super(spec, ctx, position);
    this.voiceIndex = index;
    this.conductor = conductor ?? this;
    if (conductor) {
      // a satellite voice carries no pool of its own; everything routes to the conductor
      this.vitals.structure = this.vitals.structureMax = T.chorusStructure;
    }
  }

  /** Build the trio. Returns all three; the first is the conductor and owns the pool. */
  static deploy(ctx: CombatContext, centre: THREE.Vector3): Chorus[] {
    const rng = RNG.stream('boss');
    const out: Chorus[] = [];
    let conductor: Chorus | undefined;
    for (let i = 0; i < CHORUS_VOICES.length; i++) {
      const spec = { ...CHORUS_VOICES[i], attacks: CHORUS_VOICES[i].attacks.map((a) => ({ ...a })) };
      const a = (i / 3) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const band = spec.band;
      const d = (band[0] + band[1]) / 2;
      const p = new THREE.Vector3(centre.x + Math.cos(a) * d, 0, centre.z + Math.sin(a) * d);
      ctx.confine(p, 40);
      p.y = ctx.groundAt(p.x, p.z);
      const v = new Chorus(ctx, spec, p, i, conductor);
      if (!conductor) conductor = v;
      out.push(v);
    }
    for (const v of out) v.voices = out;
    return out;
  }

  get isConductor() { return this.conductor === this; }
  get liveVoices() { return this.voices.filter((v) => v.alive); }
  get structure01() { return this.conductor.vitals.structure / this.conductor.vitals.structureMax; }
  get bossName() { return 'CHORUS'; }
  get gated() { return this.conductor.inHarmony && this.conductor.liveVoices.length >= 2; }
  hudLine() {
    const c = this.conductor;
    const pips = c.voices.map((v) => (v.alive ? '■' : '·')).join(' ');
    return c.inHarmony
      ? `IN HARMONY — ${pips}  SPREAD ${c.spread.toFixed(0)}° / ${Chorus.HARMONY_ARC}° · COLLAPSE THE SPAN, DO NOT TURN`
      : `HARMONY BROKEN — ${pips}  SPREAD ${c.spread.toFixed(0)}° · THE POOL IS OPEN`;
  }

  // ------------------------------------------------------------------ the harmony rule
  /**
   * The arc the LIVE voices subtend from the pilot's position — `360° − largest bearing gap`,
   * the same sovereign formula the Director uses, deliberately re-derived here from the same
   * definition rather than read off the Director. The Director measures every hostile in the
   * volume; this measures the three voices, and the boss rule must not silently change meaning
   * because a reinforcement wandered into frame.
   */
  private measureSpread(): number {
    const live = this.liveVoices;
    if (live.length < 2) return 0;
    const p = this.ctx.target.pos;
    const bearings = live.map((v) => Math.atan2(v.pos.x - p.x, v.pos.z - p.z)).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 0; i < bearings.length; i++) {
      const a = bearings[i], b = bearings[(i + 1) % bearings.length];
      let g = b - a;
      if (g <= 0) g += Math.PI * 2;
      if (g > gap) gap = g;
    }
    return deg(Math.PI * 2 - gap);
  }

  private evaluateHarmony(dt: number) {
    if (!this.isConductor) return;
    const was = this.inHarmony;
    this.spread = this.measureSpread();
    // A single surviving voice cannot hold a harmony with itself: the last frame is always open.
    this.inHarmony = this.liveVoices.length >= 2 && this.spread >= Chorus.HARMONY_ARC;
    if (!this.inHarmony) this.collapsedFor += dt;
    for (const v of this.voices) v.inHarmony = this.inHarmony;
    if (was !== this.inHarmony) {
      this.onHarmonyChange?.(this.inHarmony);
      for (const v of this.liveVoices) this.ctx.fx.ring(v.pos, 3, 30, this.inHarmony ? 0x9fc8ff : 0xffd24a, 0.5);
      this.ctx.audio.lockOn();
    }
  }

  // ------------------------------------------------------------------ damage routing
  /**
   * Every voice routes structural damage into the conductor's pool, and refuses it entirely
   * while the harmony holds. Impact still lands on the frame that was hit, so staggering an
   * individual voice remains worthwhile — and staggering one is the cheapest way to drag it out
   * of position, which is how the stagger economy feeds the positional problem.
   */
  applyHit(damage: number, impact: number, source: DamageSource) {
    if (!this.alive) return;
    const c = this.conductor;
    if (c.inHarmony && c.liveVoices.length >= 2) {
      c.damageRefused += damage;
      super.applyHit(0, impact, source);
      this.ctx.fx.impact(this.pos.clone().setY(this.pos.y + 8), 0x9fc8ff, 1.6, 4);
      this.ctx.audio.ricochet();
      return;
    }
    c.damageTaken += damage;
    // impact and stagger resolve locally; structure comes out of the shared pool
    super.applyHit(0, impact, source);
    if (damage > 0) {
      c.vitals.structure = Math.max(0, c.vitals.structure - damage);
      c.checkPhases();
      if (c.vitals.structure <= 0) c.collapse();
    }
  }

  private checkPhases() {
    if (this.phase === 1 && this.structure01 <= T.chorusPhase2At) this.enterPhase(2);
    else if (this.phase === 2 && this.structure01 <= T.chorusPhase3At) this.enterPhase(3);
  }

  private enterPhase(p: 2 | 3) {
    this.phase = p;
    for (const v of this.voices) v.phase = p;
    if (p === 3) for (const v of this.voices) v.swapT = 4.0;
    for (const v of this.liveVoices) {
      this.ctx.fx.ring(v.pos, 4, 70, 0x9fc8ff, 0.7);
      this.ctx.fx.impact(v.pos.clone().setY(v.pos.y + 9), 0x9fc8ff, 5, 20);
    }
    this.ctx.shake(1.1);
    this.ctx.audio.bossRoar();
    this.onPhaseChange?.(p);
  }

  /** The pool is empty: all three voices go together. */
  private collapse() {
    for (const v of this.voices) {
      if (!v.alive) continue;
      v.vitals.structure = 0;
      if (v !== this) v.die();
    }
    this.vitals.structure = 0;
    this.die();
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    if (this.isConductor) {
      this.evaluateHarmony(dt);
      this.patternPhase += Chorus.PHASE_DRIFT[Math.min(2, this.phase - 1)] * dt;
    }

    /**
     * PHASE 2 — the voices actively resist being collapsed: each pushes away from the mean
     * bearing of the others, so the span you closed re-opens behind you.
     * PHASE 3 — they SWAP BANDS on a timer. The geometry you solved is not the geometry you are
     * standing in ten seconds later.
     */
    if (this.phase >= 3) {
      this.swapT -= dt;
      if (this.swapT <= 0) {
        this.swapT = 9.0;
        const live = this.conductor.liveVoices;
        if (live.length >= 2) {
          const bands = live.map((v) => v.band);
          for (let i = 0; i < live.length; i++) live[i].bandOverride = bands[(i + 1) % bands.length] as [number, number];
          for (const v of live) this.ctx.fx.ring(v.pos, 2, 26, 0xffd24a, 0.4);
        }
      }
    }
    if (this.bandOverride) this.band = this.bandOverride;

    super.update(dt);
    if (this.isConductor) this.drawLinks();
  }

  /**
   * The bearing this voice is trying to hold around the pilot.
   *
   * THIS IS THE CORRECTION THAT MAKES THE BOSS WORK. The first implementation gave the three
   * voices three distinct BANDS and assumed that produced three distinct BEARINGS. It does not:
   * a band is a RADIUS and a bearing is an ANGLE, and three frames at three radii can sit on one
   * bearing quite happily. Measured, the trio subtended a mean span of 91-105 degrees — never
   * close to the 180 degree harmony threshold — so the gate the whole fight is built on almost
   * never closed, and the two scripted policies separated by nothing.
   *
   * The voices now hold stations 120 degrees apart. Left alone they subtend roughly 240 degrees,
   * which is above the threshold AND above the 235 degree token line, so a pilot who does not
   * move is both unable to damage the pool and paying a second attack token for the privilege.
   * That is PATCH 2 stated as a boss.
   */
  stationBearing(): number {
    return this.conductor.patternPhase + (this.voiceIndex * Math.PI * 2) / 3;
  }

  /**
   * A voice steers its OWN geometry: band radially, station angularly.
   *
   * The first version added a station term on top of the inherited orbit, and the inherited
   * random strafe simply fought it — measured, the trio settled at a 72 degree span instead of
   * the 240 the stations describe, so the gate never engaged. Radius and bearing are separate
   * axes and the boss needs authority over both, so it takes both:
   *
   *   RADIAL   hold the band centre, exactly as every other frame does.
   *   TANGENT  close the error between where this voice IS in bearing and where its station is,
   *            at a rate capped by the voice's own speed.
   *
   * That cap is the entire fight. BASSO's station sits at band 132-190 and it moves at 50; to
   * hold a bearing out there it has to cover an enormous arc length, and a pilot on assault
   * boost covers it faster. Out-rotate the formation and the stations slip behind you; stand
   * still and they re-form at 120 degree spacing, which is 240 degrees of span and two attack
   * tokens.
   *
   * Attack states are left to the base class: a frame that has committed to a windup should
   * behave like every other frame that has committed to a windup.
   */
  protected steer(dt: number, dist: number) {
    const busy = this.state === 'windup' || this.state === 'strike' || this.state === 'recover' || this.state === 'evade';
    if (busy || this.vitals.staggered || this.pinned > 0 || this.pull) { super.steer(dt, dist); return; }

    const p = this.ctx.target.pos;
    const toMe = this.pos.clone().sub(p);
    toMe.y = 0;
    const r = toMe.length();
    if (r < 1) { super.steer(dt, dist); return; }
    const radial = toMe.clone().divideScalar(r);
    const tangent = new THREE.Vector3(toMe.z, 0, -toMe.x).divideScalar(r);

    // radial: hold the band centre
    const centre = (this.band[0] + this.band[1]) / 2;
    const radialWish = clamp((r - centre) * -0.9, -this.spec.speed, this.spec.speed);

    // tangential: close the bearing error against the station, capped by this frame's speed
    const gain = Chorus.STATION_GAIN[Math.min(2, this.phase - 1)];
    const mine = Math.atan2(toMe.x, toMe.z);
    let d = this.stationBearing() - mine;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const tangentWish = clamp(d * gain * r, -this.spec.speed, this.spec.speed);

    const wish = radial.multiplyScalar(radialWish).addScaledVector(tangent, tangentWish);
    const speed = wish.length();
    if (speed > this.spec.speed) wish.multiplyScalar(this.spec.speed / speed);

    const lambda = this.spec.accel / 22;
    this.vel.x = damp(this.vel.x, wish.x, lambda, dt);
    this.vel.z = damp(this.vel.z, wish.z, lambda, dt);

    const ground = this.ctx.groundAt(this.pos.x, this.pos.z);
    this.lastGround = ground;
    this.vel.y = this.pos.y > ground + 0.2 ? this.vel.y - T.gravity * dt : 0;
    this.yaw = dampAngle(this.yaw, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), 7, dt);
  }

  protected pickAttack(): AttackId {
    return RNG.stream('boss').weighted(this.spec.attacks.map((a) => a.id), this.spec.attacks.map((a) => a.weight));
  }

  /** The link between voices: bright while the harmony holds, dead the moment it breaks. */
  private drawLinks() {
    const live = this.liveVoices;
    if (live.length < 2) {
      if (this.link) { this.ctx.scene.remove(this.link); this.link = null; }
      return;
    }
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < live.length; i++) {
      pts.push(live[i].pos.clone().setY(live[i].pos.y + 12));
      pts.push(live[(i + 1) % live.length].pos.clone().setY(live[(i + 1) % live.length].pos.y + 12));
    }
    if (!this.link) {
      this.linkGeo = new THREE.BufferGeometry().setFromPoints(pts);
      this.link = new THREE.LineSegments(this.linkGeo, new THREE.LineBasicMaterial({
        color: 0x9fc8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.ctx.scene.add(this.link);
    } else {
      this.linkGeo!.setFromPoints(pts);
      this.linkGeo!.attributes.position.needsUpdate = true;
    }
    const mat = this.link.material as THREE.LineBasicMaterial;
    mat.opacity = this.inHarmony ? 0.45 + Math.sin(this.ctx.time * 4) * 0.15 : 0.06;
    mat.color.setHex(this.inHarmony ? 0x9fc8ff : 0xffd24a);
  }

  die() {
    if (this.isConductor && this.link) { this.ctx.scene.remove(this.link); this.link = null; }
    super.die();
  }

  snapshotBoss() {
    const c = this.conductor;
    return {
      boss: 'CHORUS',
      phase: c.phase,
      structure: Math.round(c.vitals.structure),
      structureMax: c.vitals.structureMax,
      voicesAlive: c.liveVoices.length,
      spread: +c.spread.toFixed(1),
      harmonyArc: Chorus.HARMONY_ARC,
      stationGain: Chorus.STATION_GAIN[Math.min(2, c.phase - 1)],
      stationBearings: c.liveVoices.map((v) => +(deg(v.stationBearing()) % 360).toFixed(0)),
      inHarmony: c.inHarmony,
      damageRefused: Math.round(c.damageRefused),
      damageTaken: Math.round(c.damageTaken),
      collapsedFor: +c.collapsedFor.toFixed(1),
      bands: c.liveVoices.map((v) => [v.band[0], v.band[1]]),
      // The Director's arc and the boss's spread are two measurements of the same act over
      // different populations. Printing both makes it impossible to conflate them by accident.
      directorArc: +this.ctx.director.arc.toFixed(1),
      tokenSource: this.ctx.director.tokenSource,
    };
  }
}

/** Exposed for the harness: the attack table each voice actually runs. */
export const CHORUS_TABLE = CHORUS_VOICES.map((v) => ({
  name: v.name, band: v.band, speed: v.speed,
  attacks: v.attacks.map((a) => ({ ...a, windup: ATTACKS[a.id].windup, damage: ATTACKS[a.id].damage })),
}));
