import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { T } from './core/Tuning';
import { RNG, freshSeed } from './core/RNG';
import { clamp, clamp01, damp } from './core/MathUtil';
import { InputManager, RallyDir } from './core/Input';
import { updateThrusterTime } from './fx/Thruster';
import { Effects } from './fx/Effects';
import { AudioManager } from './audio/Audio';

import { Player, PLAYER_GLOW } from './frame/Player';
import { CameraRig } from './frame/CameraRig';
import { Rally } from './frame/Rally';
import { Ordnance } from './frame/Ordnance';
import { CombatContext } from './frame/Context';
import { Hostile, DamageSource } from './frame/Types';

import { Director } from './director/Director';
import { ENCOUNTERS, EncounterId } from './director/Encounters';
import { selectChains } from './director/Chains';

import { Enemy, resetHostileIds } from './enemies/Enemy';
import { prewarmRigs } from './entities/RigCache';
import { ARCHETYPES, ARCHETYPE_PALETTES, ArchetypeId } from './enemies/Archetypes';
import { Severance } from './enemies/Severance';

import { ChainWorld, Volume } from './world/ChainWorld';
import { buildLighting, SECTOR_LOOKS, SectorLighting } from './world/Sector';

import { RunState } from './build/RunState';
import { ReactorId, REACTORS } from './build/Reactors';
import { UpgradeId } from './build/Upgrades';
import { EvolutionId, HardpointId } from './build/Weapons';

import { MetricsSampler, EncounterScore, aggregate } from './score/Metrics';
import { classify } from './build/Disciplines';

import { HUD } from './ui/HUD';
import { Screens } from './ui/Screens';
import { DebugPanel, Profiler } from './ui/Debug';

type Mode = 'title' | 'run' | 'forge' | 'results' | 'pause' | 'dead';

interface Stop {
  kind: 'node' | 'forge' | 'boss';
  volume: Volume;
  state: EncounterId | null;
  started: boolean;
  cleared: boolean;
  label: string;
}

const MAX_DT = 1 / 20;

export class Game {
  // --- rendering ---
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private lighting!: SectorLighting;
  private playerFill!: THREE.PointLight;

  // --- systems ---
  input: InputManager;
  audio = new AudioManager();
  fx: Effects;
  ordnance: Ordnance;
  world: ChainWorld;
  director = new Director();
  rig = new CameraRig(new THREE.PerspectiveCamera());
  hud: HUD;
  screens: Screens;
  debug: DebugPanel;
  profiler: Profiler;

  // --- simulation ---
  player!: Player;
  hostiles: Enemy[] = [];
  boss: Severance | null = null;
  run = new RunState();
  rally = new Rally();
  metrics = new MetricsSampler();
  ctx!: CombatContext;

  mode: Mode = 'title';
  private stops: Stop[] = [];
  private stopIndex = 0;
  private timeScale = 1;
  private tsTarget = 1;
  private slowT = 0;
  private simTime = 0;
  private realTime = 0;
  private last = performance.now();
  private waveT = 0;
  private wavesSpawned = 0;
  private forgePhase = 0;
  private forgeT = 0;
  private forgeStart = 0;
  private bossScore: EncounterScore | null = null;
  private pendingSeed = freshSeed();
  private transitTimer = 0;
  private lastStagger = new Map<number, number>();
  private setupProof: Record<string, unknown> = {};
  private lastFrameMs = 16.7;
  private frameAvg = 16.7;
  private pixelRatio = 1;
  private resScaleT = 0;
  private lastDrawCalls = 0;
  private lastTriangles = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.pixelRatio = Math.min(devicePixelRatio, 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // the composer renders several passes per frame; accumulate their stats instead of
    // reporting only the last fullscreen quad
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(T.camFov, innerWidth / innerHeight, 0.6, 12000);
    this.rig = new CameraRig(this.camera);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.52, 0.62, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.lighting = buildLighting(this.scene, SECTOR_LOOKS[1]);
    // travels with the machine: the player is the one thing that may never read as a black
    // shape, whatever the sun is doing behind it (silhouette contract, GDD §12)
    this.playerFill = new THREE.PointLight(0xffd2a8, 26, 90, 2);
    this.scene.add(this.playerFill);

    this.input = new InputManager(canvas);
    this.fx = new Effects(this.scene);
    this.world = new ChainWorld(this.scene);
    this.hud = new HUD(ui);
    this.screens = new Screens(ui, this.audio);
    this.debug = new DebugPanel(ui);
    // a live edit to a constant must reach derived state immediately, not at the next FORGE
    this.debug.onChange = () => { this.player.applyBuild(this.run); this.hud.buildHardpoints(this.run); };
    this.profiler = new Profiler(ui);

    this.ordnance = new Ordnance(this.scene, this.fx, {
      onPlayerHit: (d, i, from, attack) => this.player.receiveHit(d, i, from, attack),
      onHostileHit: (hst, d, i, src) => this.player.dealDamage(hst, d, i, src as DamageSource),
      onCorePickup: (e) => { this.player.addEnergy(e); this.hud.toast(`+${e} EN · REACTOR BLEED`); this.audio.checkpoint(); },
      playerPos: () => this.player.pos,
      hostiles: () => this.hostiles as Hostile[],
      groundAt: (x, z) => this.world.groundAt(x, z),
    });

    this.ctx = {
      scene: this.scene, fx: this.fx, audio: this.audio, director: this.director, ordnance: this.ordnance,
      target: null as unknown as Player, hostiles: this.hostiles as Hostile[], time: 0, telegraphLead: 0,
      groundAt: (x, z) => this.world.groundAt(x, z),
      confine: (pos, margin) => this.world.confine(pos, margin ?? 0),
      shake: (a) => this.rig.addShake(a),
      onHostileStagger: (hst, by) => this.onHostileStagger(hst, by),
      onHostileDeath: (hst) => this.onHostileDeath(hst),
      onHostileWindupStart: () => { this.metrics.vanishableAttacks++; this.director.pilot.vanishableAttacks++; },
    };

    this.player = new Player(this.ctx, {
      onPerfectVanish: (t) => this.onPerfectVanish(t),
      onQuickBoost: () => this.director.pilot.noteVerb('BOOST', 0.4),
      onHostileStaggered: (hst, by) => this.onHostileStagger(hst, by),
      onHostileKilled: () => { /* recorded in onHostileDeath */ },
      onConversion: (h) => this.noteConversion(h),
      onDamageTaken: (amount) => { this.metrics.noteDamage(amount); this.hud.damageFlash(); },
      onStaggered: () => this.hud.flash('STAGGERED', '#ff5a5a'),
      onDeath: () => this.onPlayerDeath(),
      onFlash: (t, c) => this.hud.flash(t, c),
      enterSlow: (scale, dur) => this.enterSlow(scale, dur),
    });
    this.ctx.target = this.player;

    // Build every chassis before the first fight, not during it.
    prewarmRigs({
      standard: ARCHETYPE_PALETTES.sentry, sniper: ARCHETYPE_PALETTES.lancer, brawler: ARCHETYPE_PALETTES.brawler,
      heavy: ARCHETYPE_PALETTES.warden, drone: ARCHETYPE_PALETTES.harrier, ace: ARCHETYPE_PALETTES.lancer,
    });

    this.rally.onResolve = (o, m, foe) => this.resolveRally(o, m, foe);
    this.rally.onExchange = (step) => this.rallyExchange(step);
    this.rally.onPrompt = () => this.audio.rallyPrompt();
    this.input.onRallyDir = (d: RallyDir) => { if (this.rally.active) this.rally.input(d); };

    addEventListener('resize', () => this.resize());
    this.exposeState();
    this.showTitle();
  }

  /**
   * Dynamic resolution. A mech game lives or dies on frame pacing, so pixels are the first
   * thing to give: the render scale walks down when frames run long and back up when they do
   * not, inside bounds tight enough that the change is invisible in motion.
   */
  private adaptResolution(dt: number) {
    this.resScaleT -= dt;
    if (this.resScaleT > 0) return;
    this.resScaleT = 0.5;
    const cap = Math.min(devicePixelRatio, 1.75);
    const want = this.frameAvg > 21 ? this.pixelRatio - 0.15 : this.frameAvg < 13 ? this.pixelRatio + 0.1 : this.pixelRatio;
    const next = clamp(want, 0.62, cap);
    if (Math.abs(next - this.pixelRatio) > 0.02) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.composer.setPixelRatio(next);
    }
  }

  private resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.setSize(innerWidth, innerHeight);
  }

  // ============================================================================ run control
  showTitle() {
    this.mode = 'title';
    this.hud.show(false);
    this.input.menuMode = true;
    this.input.releasePointer();
    this.screens.showTitle(this.pendingSeed, (r) => this.startRun(this.pendingSeed, r), () => {
      this.pendingSeed = freshSeed();
      this.screens.setSeed(this.pendingSeed);
    });
    // a slow orbit over an empty arena so the title screen is not a static image
    if (!this.world.volumes.length) {
      RNG.init(this.pendingSeed);
      const sel = selectChains(1, null);
      this.world.build([sel.chains[0]], 1);
      this.player.pos.set(0, 0, 200);
    }
  }

  startRun(seed: string, reactor: ReactorId) {
    this.audio.start();
    this.audio.resume();
    this.run.begin(seed, reactor);

    // Whole sector, built once: CHAIN A -> FORGE -> CHAIN B -> FORGE -> SEVERANCE.
    // Nothing is generated at a transition, which is what makes "no loading break" structural.
    this.world.build(this.run.chains, this.run.sector);

    this.stops = [];
    for (const v of this.world.volumes) {
      if (v.node >= 0) this.stops.push({ kind: 'node', volume: v, state: v.state, started: false, cleared: false, label: v.state ?? 'ENCOUNTER' });
      else if (v.kind === 'forge') this.stops.push({ kind: 'forge', volume: v, state: null, started: false, cleared: false, label: 'FORGE' });
      else if (v.kind === 'boss') this.stops.push({ kind: 'boss', volume: v, state: null, started: false, cleared: false, label: 'SEVERANCE' });
    }
    this.stops.sort((a, b) => a.volume.z0 - b.volume.z0);
    this.stopIndex = 0;

    this.clearHostiles();
    this.ordnance.clear();
    this.fx.clear();
    this.player.applyBuild(this.run);
    this.player.vitals.reset(this.player.mods.structure);
    const entry = this.world.entryPoint(this.stops[0].volume);
    this.player.pos.copy(entry);
    this.player.yaw = Math.PI;
    this.player.resetForEncounter(false);
    this.director.pilot.resetRun();
    this.director.resetEncounter(this.run.sector);
    this.rally.cancel();
    this.transitTimer = 0;
    this.waveT = 0;
    this.wavesSpawned = 0;
    this.lastStagger.clear();
    this.convertedThisStagger.clear();
    this.metrics.begin('', this.player.mods.structure, false);
    this.bossScore = null;
    this.simTime = 0;
    this.timeScale = this.tsTarget = 1;
    this.slowT = 0;

    this.captureSetupProof();

    this.mode = 'run';
    this.screens.hide();
    this.hud.show(true);
    this.hud.buildHardpoints(this.run);
    this.hud.setBoss(null);
    this.input.menuMode = false;
    this.input.lockPointer();
    this.hud.toast(`SEED ${seed} · ${this.run.chains.map((c) => c.name).join('  →  ')}`);
  }

  /** Checkpoint C evidence: the procedural setup RETRY SEED must reproduce exactly. */
  private captureSetupProof() {
    this.setupProof = {
      seed: this.run.seed,
      chains: this.run.chains.map((c) => c.id),
      chainLaw2: this.run.law2,
      layoutSignature: this.world.volumes.map((v) => `${v.kind}:${v.state ?? v.tissue ?? '-'}:${v.z0.toFixed(1)}:${v.y0.toFixed(1)}:${v.cover.length}`).join('|'),
      coverSignature: this.world.volumes.flatMap((v) => v.cover.map((c) => `${c.x.toFixed(2)},${c.z.toFixed(2)},${c.h.toFixed(2)}`)).join(';'),
      initialStreamStates: RNG.states(),
    };
  }

  // ========================================================================== encounter flow
  private currentStop(): Stop | null { return this.stops[this.stopIndex] ?? null; }

  private beginStop(stop: Stop) {
    stop.started = true;
    this.director.resetEncounter(this.run.sector);
    this.director.forwardBias = T.orbitForwardBias;
    this.wavesSpawned = 0;
    this.lastStagger.clear();
    this.convertedThisStagger.clear();

    if (stop.kind === 'node' && stop.state) {
      const spec = ENCOUNTERS[stop.state];
      const combat = spec.hostiles[1] > 0;
      this.metrics.begin(`${this.run.currentChain?.name ?? ''} · ${stop.state}`, this.player.vitals.structureMax, combat);
      this.run.nodeIndex = stop.volume.node;
      const chain = this.run.chains[Math.max(0, stop.volume.chain)];
      this.run.chainIndex = Math.max(0, stop.volume.chain);
      const nodeInChain = chain.sequence.indexOf(stop.state);
      this.hud.setEncounter(chain.name, stop.state, Math.max(0, nodeInChain), chain.sequence.length, spec.brief, `${spec.primaryStress} · ${spec.secondaryStress}`);
      if (combat) {
        this.world.closeGate(stop.volume);
        this.spawnWave(stop, true);
        this.waveT = this.director.pressure.reinforcementTiming;
      } else {
        this.world.openGate(stop.volume);
        this.hud.setObjective(spec.brief, 'NO COMBAT · ENVIRONMENTAL DAMAGE');
      }
      this.audio.checkpoint();
    } else if (stop.kind === 'forge') {
      this.enterForge(stop);
    } else if (stop.kind === 'boss') {
      this.beginBoss(stop);
    }
  }

  private spawnWave(stop: Stop, initial: boolean) {
    if (!stop.state) return;
    const spec = ENCOUNTERS[stop.state];
    const rng = RNG.stream('spawn');
    const centre = this.world.volumeCentre(stop.volume);
    const count = initial
      ? rng.int(spec.hostiles[0], spec.hostiles[1])
      : Math.max(1, Math.round((spec.hostiles[0] + spec.hostiles[1]) / 2) - 1);
    if (count <= 0 || !spec.pool.length) return;

    for (let i = 0; i < count; i++) {
      const kind: ArchetypeId = initial ? rng.pick(spec.pool) : this.director.pickArchetype(spec.pool);
      const bearing = initial
        ? (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3)
        : this.director.spawnBearing(this.player);
      const band = ARCHETYPES[kind].band;
      const dist = rng.range(band[0] + 40, Math.min(band[1] + 90, stop.volume.radius > 0 ? stop.volume.radius - 40 : 260));
      const anchor = initial && stop.volume.radius > 0 ? centre : this.player.pos;
      const pos = new THREE.Vector3(anchor.x + Math.cos(bearing) * dist, 0, anchor.z + Math.sin(bearing) * dist);
      this.world.confine(pos, 30);
      pos.y = this.world.groundAt(pos.x, pos.z) + (ARCHETYPES[kind].flying ? ARCHETYPES[kind].cruiseAltitude : 0);
      const e = new Enemy(ARCHETYPES[kind], this.ctx, pos);
      this.hostiles.push(e);
      if (!initial) { this.fx.ring(pos, 3, 30, e.glow, 0.6); this.audio.warning(); }
    }
    if (!initial) this.hud.toast('REINFORCEMENTS');
  }

  private clearStop(stop: Stop) {
    if (stop.cleared) return;
    stop.cleared = true;
    this.world.openGate(stop.volume);
    if (stop.kind === 'node' && stop.state) {
      this.director.pilot.commitEncounter();
      const score = this.metrics.result();
      this.run.encounterScores.push(score);
      this.hud.flash('LAUNCH OUT', '#8ff4ff');
      this.hud.setObjective('LAUNCH OUT', `${stop.state} CLEARED · ${score.rank} · ${score.final.toFixed(1)}`);
      this.audio.checkpoint();
    }
  }

  private advanceStop() {
    this.stopIndex++;
    const next = this.currentStop();
    if (next) {
      const link = this.world.volumes.find((v) => v.kind === 'link' && v.z1 <= next.volume.z0 + 1 && v.z1 >= next.volume.z0 - 1);
      const tissue = link?.tissue ?? 'CONDUIT';
      this.hud.transit(tissue, tissue === 'OPEN FALL' ? 'DESCEND' : 'HOLD SPEED', next.label, true);
      this.transitTimer = 2.4;
    }
  }

  // ================================================================================= FORGE
  /**
   * The stillness beat (GDD §2.4). Boost in, thrusters wind down, locks engage, percussion
   * drops out, the build interface assembles around the machine, LAUNCH, doors open.
   */
  private enterForge(stop: Stop) {
    this.mode = 'forge';
    this.forgePhase = 0;
    this.forgeT = 0;
    this.forgeStart = performance.now();
    this.world.closeGate(stop.volume);
    this.clearHostiles();
    this.ordnance.clear();
    this.player.frozen = true;
    this.player.vel.set(0, 0, 0);
    this.player.assault = false;
    this.rally.cancel();
    this.tsTarget = 1;
    this.audio.forgeArrive();
    this.audio.duckPercussion(true);
    this.hud.show(false);
    this.hud.transit('FORGE', 'LOCKS ENGAGING', '', true);
    this.input.releasePointer();
    this.input.menuMode = true;
  }

  private updateForge(dt: number) {
    // wall-clock: the stillness beat is choreography, and must not stretch on a slow frame
    this.forgeT = (performance.now() - this.forgeStart) / 1000;
    const stop = this.currentStop()!;
    const centre = this.world.volumeCentre(stop.volume);

    // settle the machine onto the pad
    this.player.pos.lerp(new THREE.Vector3(centre.x, this.world.groundAt(centre.x, centre.z), centre.z), Math.min(1, dt * 3));
    this.player.yaw = damp(this.player.yaw, Math.PI, 3, dt);
    this.audio.setEngine(Math.max(0, 1 - this.forgeT * 0.8), 0, 0, 0);

    if (this.forgePhase === 0 && this.forgeT > 0.9) {
      this.forgePhase = 1;
      this.audio.forgeLock();
      this.hud.transit('FORGE', 'LOCKS ENGAGED', 'THRUSTERS COLD', true);
      this.fx.ring(this.player.pos, 6, 34, 0xff7a2a, 0.7);
    }
    if (this.forgePhase === 1 && this.forgeT > 1.5) {
      this.forgePhase = 2;
      this.audio.forgeLock();
      this.audio.forgeAssemble();
      this.hud.transit('FORGE', '', '', false);
      const offer = this.run.rollOffer();
      this.screens.showForge(this.run, offer, {
        onUpgrade: (id: UpgradeId) => { this.run.takeUpgrade(id); this.player.applyBuild(this.run); this.audio.forgeAssemble(); },
        onEvolution: (id: EvolutionId, hp: HardpointId) => { this.run.takeEvolution(id, hp); this.player.applyBuild(this.run); this.audio.forgeAssemble(); },
        onLaunch: () => this.launchFromForge(stop),
      });
    }

    // camera: a slow arc around the still machine
    const a = this.forgeT * 0.22;
    const cam = new THREE.Vector3(centre.x + Math.cos(a) * 46, this.world.groundAt(centre.x, centre.z) + 22, centre.z + Math.sin(a) * 46);
    this.rig.pos.lerp(cam, Math.min(1, dt * 2.2));
    this.camera.position.copy(this.rig.pos);
    this.camera.lookAt(this.player.pos.clone().setY(this.player.pos.y + 9));
  }

  private launchFromForge(stop: Stop) {
    this.run.forgesTaken++;
    this.director.pilot.decayAtForge();   // the pilot model decays 25% at each FORGE
    this.player.applyBuild(this.run);
    this.player.healToFull();
    this.hud.buildHardpoints(this.run);
    this.world.openGate(stop.volume);
    this.player.frozen = false;
    this.screens.hide();
    this.hud.show(true);
    this.audio.forgeLaunch();
    this.audio.doorsOpen();
    this.audio.duckPercussion(false);
    this.input.menuMode = false;
    this.input.lockPointer();
    this.mode = 'run';
    stop.cleared = true;
    this.hud.transit('LAUNCH', 'DOORS OPEN', '', true);
    this.transitTimer = 1.6;
    this.hud.toast(`PILOT MODEL DECAYED 25% · ${this.run.classification.name}`);
  }

  // ================================================================================== BOSS
  private beginBoss(stop: Stop) {
    this.clearHostiles();
    const centre = this.world.volumeCentre(stop.volume);
    const pos = new THREE.Vector3(centre.x, this.world.groundAt(centre.x, centre.z), centre.z);
    this.boss = new Severance(this.ctx, pos);
    this.boss.onPhaseChange = () => { this.hud.flash('PHASE 2', '#ff5a7a'); this.hud.toast('COUNTER-VANISH · 60% SEEDED · 4.0s COOLDOWN'); };
    this.boss.onCounterVanish = () => { this.hud.flash('COUNTER-VANISH', '#ff5a7a'); };
    this.hostiles.push(this.boss);
    this.metrics.begin('SEVERANCE', this.player.vitals.structureMax, true);
    this.hud.setBossBanner('SEVERANCE', 'ACE · EXECUTION', 'READ THE FRAME THAT READS YOU');
    this.hud.setBoss(this.boss);
    this.audio.bossRoar();
    this.hud.flash('SEVERANCE', '#ff5a7a');
  }

  // ================================================================================ events
  private onPerfectVanish(target: Hostile) {
    this.metrics.perfectVanishes++;
    this.director.pilot.perfectVanishes++;
    this.director.pilot.noteVerb('VANISH', 1);
    this.hud.flash('PERFECT VANISH', '#8ff4ff');
    this.rig.hardLock(target, T.vanishSlowDur);
    this.rig.punch(0.5);

    // SEVERANCE answers a read with a read: Counter-Vanish always starts a Reverse Rally.
    if (this.boss && target === this.boss) {
      if (this.boss.onPerfectVanished()) { this.startRally(this.boss, 'REVERSE'); return; }
    }
    if (this.rally.shouldEscalate()) this.startRally(target, 'RALLY');
  }

  private startRally(foe: Hostile, mode: 'RALLY' | 'REVERSE') {
    this.rally.start(foe, mode);
    this.tsTarget = T.vanishTimeScale * 0.82;
    this.slowT = 999;
    this.rig.hardLock(foe, 8);
  }

  private rallyExchange(step: number) {
    const foe = this.rally.foe;
    if (!foe) return;
    this.audio.rallyHit(step);
    this.fx.ghost(this.player.rig.root, PLAYER_GLOW, 0.35);
    const angle = RNG.stream('rally').range(0, Math.PI * 2);
    const p = new THREE.Vector3(foe.pos.x + Math.cos(angle) * 15, Math.max(this.player.pos.y, foe.pos.y + 6), foe.pos.z + Math.sin(angle) * 15);
    this.world.confine(p, 8);
    this.player.pos.copy(p);
    this.player.yaw = Math.atan2(foe.pos.x - p.x, foe.pos.z - p.z) + Math.PI;
    this.fx.impact(foe.pos.clone().setY(foe.pos.y + 9), 0xffffff, 3, 8);
    this.rig.punch(0.3);
  }

  private resolveRally(outcome: 'won' | 'lost', mode: 'RALLY' | 'REVERSE', foe: Hostile) {
    this.tsTarget = 1;
    this.slowT = 0;
    foe.tokenCooldown = T.tokenCooldown;
    if (outcome === 'won') {
      if (mode === 'REVERSE') {
        // winning a Reverse Rally grants you the punish
        foe.vitals.exposed = T.exposedDur;
        this.hud.flash('READ HELD', '#8ff4ff');
      } else {
        this.player.dealDamage(foe, T.rallyWinDamage, T.rallyWinImpact, 'rally');
        this.hud.flash('EXCHANGE WON', '#ffd24a');
      }
      this.audio.rallyWin();
      this.fx.impact(foe.pos.clone().setY(foe.pos.y + 10), 0xffffff, 6, 22);
      this.enterSlow(0.35, 0.5);
    } else {
      this.player.receiveHit(T.rallyFailDamage, T.rallyFailImpact, foe, 'rally');
      this.audio.rallyFail();
      this.hud.flash('BROKEN', '#ff5a5a');
    }
  }

  private onHostileStagger(hst: Hostile, by: DamageSource) {
    const last = this.lastStagger.get(hst.id) ?? -99;
    if (this.simTime - last < 0.1) return;
    this.lastStagger.set(hst.id, this.simTime);
    this.metrics.staggersCreated++;
    this.director.pilot.staggersCreated++;
    this.director.pilot.noteVerb('STAGGER', 1);
    this.hud.flash(`${hst.displayName} STAGGERED`, '#ffd24a');
    this.audio.stagger();
    this.fx.ring(hst.pos, 3, 26, 0xffd24a, 0.45);
    this.convertedThisStagger.delete(hst.id);
    this.player.onAnyHostileStagger(hst);
    void by;
  }

  private onHostileDeath(hst: Hostile) {
    const i = this.hostiles.indexOf(hst as Enemy);
    if (i >= 0) this.hostiles.splice(i, 1);
    if (this.boss === hst) this.onBossDown();
  }

  private onBossDown() {
    this.bossScore = this.metrics.result();
    this.run.encounterScores.push(this.bossScore);
    this.bossScore = null;
    this.run.victory = true;
    this.hud.flash('SEVERANCE DOWN', '#8ff4ff');
    this.enterSlow(0.2, 2.2);
    setTimeout(() => this.showResults(true), 2400);
  }

  private onPlayerDeath() {
    if (this.mode === 'results') return;
    this.mode = 'dead';
    this.hud.flash('FRAME LOST', '#ff5a5a');
    this.enterSlow(0.18, 2.0);
    setTimeout(() => this.showResults(false), 2200);
  }

  private showResults(victory: boolean) {
    if (this.mode === 'results') return;
    // an unfinished encounter still contributes what it measured
    if (!victory && this.metrics.label) this.run.encounterScores.push(this.metrics.result());
    this.mode = 'results';
    this.rally.cancel();
    this.timeScale = this.tsTarget = 1;
    this.hud.show(false);
    this.hud.setBoss(null);
    this.input.menuMode = true;
    this.input.releasePointer();
    this.audio.duckPercussion(true);
    this.screens.showResults(this.run, null, victory, {
      onRetrySeed: () => { this.audio.duckPercussion(false); this.startRun(this.run.seed, this.run.reactor); },
      onNewRun: () => { this.audio.duckPercussion(false); this.pendingSeed = freshSeed(); this.startRun(this.pendingSeed, this.run.reactor); },
    });
  }

  private clearHostiles() {
    for (const h of this.hostiles) h.dispose();
    this.hostiles.length = 0;
    this.boss = null;
    resetHostileIds();
  }

  enterSlow(scale: number, realDuration: number) {
    this.tsTarget = scale;
    this.slowT = Math.max(this.slowT, realDuration);
  }

  // ================================================================================== loop
  frame(now: number) {
    const raw = (now - this.last) / 1000;
    this.lastFrameMs = raw * 1000;
    this.frameAvg += (this.lastFrameMs - this.frameAvg) * 0.06;
    this.last = now;
    this.tick(Math.min(MAX_DT, raw));
  }

  /** Rendering and HUD are optional so the replay harness can run the simulation flat out. */
  renderEnabled = true;
  uiEnabled = true;

  tick(realDt: number) {
    this.adaptResolution(realDt);
    this.realTime += realDt;

    this.input.poll(realDt);
    if (this.input.pressed('debug')) this.debug.toggle();
    if (this.input.pressed('profiler')) this.profiler.toggle();

    // bullet time runs on the real clock, so slow-mo lasts a fixed wall-clock duration
    if (this.slowT > 0) { this.slowT -= realDt; if (this.slowT <= 0 && !this.rally.active) this.tsTarget = 1; }
    this.timeScale = damp(this.timeScale, this.tsTarget, 12, realDt);
    const dt = realDt * this.timeScale;
    this.simTime += dt;
    this.ctx.time = this.simTime;
    this.ctx.telegraphLead = this.player.mods.telegraphLead;

    switch (this.mode) {
      case 'title': this.updateTitle(realDt); break;
      case 'run': this.updateRun(realDt, dt); break;
      case 'forge': this.updateForge(realDt); break;
      case 'pause': break;
      case 'results': this.updateIdleCamera(realDt); break;
      case 'dead': this.updateRun(realDt, dt); break;
    }

    if (this.mode === 'title' || this.mode === 'results' || this.mode === 'pause' || this.mode === 'forge') this.screens.handleInput(this.input);

    this.fx.update(dt);
    updateThrusterTime(this.realTime);
    this.audio.setTimeScale(this.timeScale);
    this.audio.updateMusic(realDt, this.hostiles.length, !!this.boss, this.player.vitals.structure01);

    if (this.uiEnabled) {
      this.hud.update(realDt, this.player, this.hostiles as Hostile[], this.director, this.rally, this.camera, this.timeScale, this.input.padConnected);
      if (this.boss) this.hud.setBoss(this.boss);
      if (this.transitTimer > 0) { this.transitTimer -= realDt; if (this.transitTimer <= 0) this.hud.transit('', '', '', false); }
    } else if (this.transitTimer > 0) this.transitTimer -= realDt;

    const streamState = this.world.stream(this.player.pos.z);
    this.lighting.follow(this.player.pos);
    this.playerFill.position.copy(this.player.pos).setY(this.player.pos.y + 16);
    if (this.renderEnabled) {
      this.renderer.info.reset();
      this.composer.render();
      this.lastDrawCalls = this.renderer.info.render.calls;
      this.lastTriangles = this.renderer.info.render.triangles;
    }

    if (this.profiler.open && this.renderEnabled) {
      const info = this.renderer.info;
      this.profiler.update(realDt, {
        frameMs: this.lastFrameMs,
        drawCalls: this.lastDrawCalls,
        triangles: this.lastTriangles,
        programs: info.programs?.length ?? 0,
        entities: this.hostiles.length + this.ordnance.entityCount,
        hostiles: this.hostiles.length,
        streamer: `${streamState.visible}/${streamState.total} volumes · z ${this.player.pos.z.toFixed(0)}`,
        timeScale: this.timeScale,
        extra: `ARC ${this.director.arc.toFixed(0)}°  TOKENS ${this.director.tokenCount}\nSRC ${this.director.tokenSource}`,
      });
    }
    this.input.endFrame();
  }

  private updateTitle(realDt: number) {
    this.updateIdleCamera(realDt);
  }

  private updateIdleCamera(realDt: number) {
    const a = this.realTime * 0.09;
    const target = this.player.pos.clone().setY(this.player.pos.y + 12);
    this.rig.pos.lerp(new THREE.Vector3(Math.cos(a) * 150, 66, target.z + Math.sin(a) * 150), Math.min(1, realDt * 1.6));
    this.camera.position.copy(this.rig.pos);
    this.camera.lookAt(target);
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();
  }

  private updateRun(realDt: number, dt: number) {
    // ---- pause ----
    if (this.input.pressed('pause') && this.mode === 'run') {
      this.mode = 'pause';
      this.input.menuMode = true;
      this.input.releasePointer();
      this.screens.showPause(this.run, {
        onResume: () => { this.mode = 'run'; this.screens.hide(); this.input.menuMode = false; this.input.lockPointer(); },
        onAbandon: () => this.showResults(false),
      });
      return;
    }

    // ---- look ----
    const [lx, ly] = this.input.takeLook();
    if (!this.rally.active) {
      this.player.yaw += lx;
      this.player.pitch = clamp(this.player.pitch + ly, T.pitchMin, T.pitchMax);
    }

    // ---- rally runs on the real clock ----
    this.rally.tickReal(realDt);
    const canAct = !this.rally.active && this.mode === 'run';

    this.player.update(dt, this.input, canAct);
    for (const h of this.hostiles) h.update(dt);
    this.ordnance.update(dt, this.simTime);
    this.world.update(dt, this.simTime, this.player);

    this.director.update(dt, this.hostiles as Hostile[], this.player, this.player.energy01);
    this.director.pilot.sample(dt, { airborne: !this.player.grounded, speed: this.player.speed, locked: !!this.player.lock.primary });
    this.metrics.tick(dt, this.director.arc, this.player.speed);


    this.rig.update(realDt, {
      pos: this.player.pos, yaw: this.player.yaw, pitch: this.player.pitch,
      // GDD §5.5: soft assist aims, hard lock frames. Only a hard lock reshapes the camera.
      assault: this.player.assault, locked: this.player.lock.hard ? this.player.lock.primary : null, speed: this.player.speed,
    });

    this.audio.setEngine(
      this.player.assault ? 1 : clamp01(this.player.speed / T.speed) * 0.6,
      this.player.assault ? 1 : 0,
      this.player.state === 'VERTICAL THRUST' ? 1 : 0,
      clamp01(this.player.speed / T.assaultSpeed),
    );

    if (this.mode === 'run') this.progress();
  }

  /**
   * A conversion is a hit landed on a hostile you staggered. Counted once per stagger so
   * emptying a rifle into a broken frame cannot inflate CONVERSION past 100%.
   */
  private convertedThisStagger = new Set<number>();
  noteConversion(h?: Hostile) {
    const id = h?.id ?? -1;
    if (id >= 0) {
      if (this.convertedThisStagger.has(id)) return;
      this.convertedThisStagger.add(id);
    }
    this.metrics.staggerPunishes++;
    this.director.pilot.staggerPunishes++;
  }

  private progress() {
    const stop = this.currentStop();
    if (!stop) return;
    const z = this.player.pos.z;

    if (!stop.started && z >= stop.volume.z0 - 4) { this.beginStop(stop); return; }
    if (!stop.started) return;

    if (stop.kind === 'node' && stop.state && !stop.cleared) {
      const spec = ENCOUNTERS[stop.state];
      const combat = spec.hostiles[1] > 0;
      if (combat) {
        if (this.hostiles.length === 0) {
          if (this.wavesSpawned >= spec.waves) this.clearStop(stop);
          else { this.wavesSpawned++; this.spawnWave(stop, false); this.waveT = this.director.pressure.reinforcementTiming; }
        } else if (spec.waves > this.wavesSpawned) {
          this.waveT -= 1 / 60;
          if (this.waveT <= 0) { this.wavesSpawned++; this.spawnWave(stop, false); this.waveT = this.director.pressure.reinforcementTiming; }
        }
      } else if (z >= stop.volume.z1 - 40) {
        this.clearStop(stop);
      }
    }

    if (stop.kind === 'boss') return;   // the run ends here

    if (stop.cleared && z >= stop.volume.z1 - 2) this.advanceStop();
  }

  // ============================================================================== __state()
  private exposeState() {
    const g = window as unknown as Record<string, unknown>;
    g.__state = () => this.state();
    g.__proof = () => ({
      sovereignArc: {
        rule: 'director.tokenCount is a getter over arcTokens(arc, sector); there is no setter and no field',
        arc: this.director.arc,
        tokenCount: this.director.tokenCount,
        tokenSource: this.director.tokenSource,
        writers: ['encirclement arc (sole)'],
      },
      setup: this.setupProof,
      currentStreamStates: RNG.states(),
      chainLaws: {
        law2: this.run.law2,
        chains: this.run.chains.map((c) => ({ id: c.id, sequence: c.sequence, dominantStress: c.dominantStress })),
      },
    });
    g.__game = this;
    g.__classify = classify;

    /**
     * Deterministic replay harness.
     *
     * Runs the simulation headless at a fixed timestep with scripted input, so "same seed and
     * inputs produce behavioural equivalence" (GDD §14) is something the build can demonstrate
     * rather than assert. Returns a trace of sampled state plus the final snapshot.
     */
    g.__replay = (opts: {
      seed: string; reactor?: ReactorId; dt?: number;
      segments: { frames: number; down?: string[]; look?: [number, number] }[];
      sampleEvery?: number;
    }) => {
      const dt = opts.dt ?? 1 / 60;
      const sampleEvery = opts.sampleEvery ?? 30;
      const wasRender = this.renderEnabled, wasUi = this.uiEnabled;
      this.renderEnabled = false;
      this.uiEnabled = false;
      this.startRun(opts.seed, opts.reactor ?? 'vector');
      const setup = { ...this.setupProof };
      const trace: unknown[] = [];
      let frame = 0;
      for (const seg of opts.segments) {
        for (let i = 0; i < seg.frames; i++) {
          this.input.scripted = { down: seg.down ?? [], look: seg.look ?? [0, 0] };
          this.tick(dt);
          if (frame % sampleEvery === 0) {
            trace.push({
              f: frame,
              p: this.player.pos.toArray().map((v) => +v.toFixed(3)),
              v: this.player.vel.toArray().map((v) => +v.toFixed(3)),
              s: Math.round(this.player.vitals.structure),
              e: +this.player.energy.toFixed(2),
              h: this.hostiles.length,
              a: +this.director.arc.toFixed(2),
              t: this.director.tokenCount,
              stop: this.currentStop()?.label ?? null,
              cleared: this.currentStop()?.cleared ?? null,
              mode: this.mode,
            });
          }
          frame++;
        }
      }
      this.input.scripted = null;
      this.renderEnabled = wasRender;
      this.uiEnabled = wasUi;
      return { setup, trace, final: this.state(), streams: RNG.states() };
    };

    /** Developer commands for verification and tuning passes. */
    g.__dev = {
      state: () => this.state(),
      killAll: () => { for (const h of [...this.hostiles]) { h.vitals.structure = 0; h.die(); } },
      hurtBoss: (fraction: number) => { if (this.boss) this.boss.vitals.structure = this.boss.vitals.structureMax * fraction; },
      warp: (z: number) => { this.player.pos.z = z; this.player.pos.y = this.world.groundAt(this.player.pos.x, z); },
      openGates: () => { for (const v of this.world.volumes) this.world.openGate(v); },
      give: (id: UpgradeId) => { this.run.takeUpgrade(id); this.player.applyBuild(this.run); this.hud.buildHardpoints(this.run); },
      evolve: (id: EvolutionId, hp: HardpointId) => { this.run.takeEvolution(id, hp); this.player.applyBuild(this.run); this.hud.buildHardpoints(this.run); },
      heal: () => this.player.healToFull(),
      forceVanishWindow: () => this.hostiles.map((h) => ({ id: h.id, state: h.state, windup: h.windupRemaining })),
      skipToBoss: () => {
        const bossStop = this.stops.findIndex((x) => x.kind === 'boss');
        if (bossStop < 0) return 'no boss';
        for (let i = 0; i < bossStop; i++) { this.stops[i].started = true; this.stops[i].cleared = true; this.world.openGate(this.stops[i].volume); }
        this.stopIndex = bossStop;
        const v = this.stops[bossStop].volume;
        this.player.pos.set(0, this.world.groundAt(0, v.z0 + 20), v.z0 + 20);
        this.mode = 'run';
        return 'ok';
      },
      /** Jump straight to a named stop, clearing everything before it. */
      skipToLabel: (label: string) => {
        const idx = this.stops.findIndex((x) => x.label === label);
        if (idx < 0) return 'not found';
        for (let i = 0; i < idx; i++) { this.stops[i].started = true; this.stops[i].cleared = true; this.world.openGate(this.stops[i].volume); }
        for (let i = idx; i < this.stops.length; i++) { this.stops[i].started = false; this.stops[i].cleared = false; this.world.closeGate(this.stops[i].volume); }
        this.clearHostiles();
        this.stopIndex = idx;
        const v = this.stops[idx].volume;
        const z = v.z0 + Math.min(160, (v.z1 - v.z0) * 0.25);
        this.player.pos.set(0, this.world.groundAt(0, z), z);
        this.player.vel.set(0, 0, 0);
        this.mode = 'run';
        return { label, z, y: this.player.pos.y };
      },
      skipToForge: () => {
        const idx = this.stops.findIndex((x) => x.kind === 'forge');
        if (idx < 0) return 'no forge';
        for (let i = 0; i < idx; i++) { this.stops[i].started = true; this.stops[i].cleared = true; this.world.openGate(this.stops[i].volume); }
        this.stopIndex = idx;
        const v = this.stops[idx].volume;
        this.player.pos.set(0, this.world.groundAt(0, v.z0 + 20), v.z0 + 20);
        this.mode = 'run';
        return 'ok';
      },
      worldBuilds: () => this.world.buildCount,
      volumes: () => this.world.volumes.length,
      stops: () => this.stops.map((x) => ({ kind: x.kind, label: x.label, z0: x.volume.z0, z1: x.volume.z1, started: x.started, cleared: x.cleared })),

      /** Put a hostile into a windup so the vanish window can be exercised deterministically. */
      forceWindup: (attack = 'sweep', remaining = 0.12) => {
        const h = this.hostiles.find((x) => x.alive);
        if (!h) return 'no hostile';
        h.currentAttack = attack as never;
        h.state = 'windup';
        h.windupMax = 0.6;
        h.windupRemaining = remaining;
        this.metrics.vanishableAttacks++;
        this.director.pilot.vanishableAttacks++;
        return { id: h.id, attack: h.currentAttack, windupRemaining: h.windupRemaining };
      },
      /** Drive the real vanish path — no shortcut around Player.tryVanish. */
      vanish: (dirX = 1) => {
        const before = this.metrics.perfectVanishes;
        const ok = this.player.tryVanish(new THREE.Vector3(dirX, 0, 0));
        return {
          accepted: ok,
          perfect: this.metrics.perfectVanishes > before,
          energy: +this.player.energy.toFixed(1),
          timeScaleTarget: this.tsTarget,
          rally: this.rally.active ? { mode: this.rally.mode, exchange: this.rally.exchange, key: this.rally.key } : null,
          exposedTargets: this.hostiles.filter((h) => h.vitals.isExposed).map((h) => h.id),
        };
      },
      /** Answer the live rally prompt correctly or incorrectly. */
      rallyAnswer: (correct = true) => {
        if (!this.rally.active) return 'no rally';
        const keys = ['W', 'A', 'S', 'D'] as const;
        const k = correct ? this.rally.key : keys.find((x) => x !== this.rally.key)!;
        this.rally.input(k);
        return { active: this.rally.active, exchange: this.rally.exchange, key: this.rally.key };
      },
      rally: () => (this.rally.active ? { mode: this.rally.mode, exchange: this.rally.exchange, key: this.rally.key, t: +this.rally.timer.toFixed(2) } : null),
      spawn: (archetype: ArchetypeId, count = 1) => {
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const p = this.player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 90, 0, Math.sin(a) * 90));
          this.world.confine(p, 20);
          p.y = this.world.groundAt(p.x, p.z) + (ARCHETYPES[archetype].flying ? ARCHETYPES[archetype].cruiseAltitude : 0);
          this.hostiles.push(new Enemy(ARCHETYPES[archetype], this.ctx, p));
        }
        return this.hostiles.length;
      },
      boss: () => (this.boss ? this.boss.snapshotBoss() : null),
      step: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) this.tick(dt); return this.state(); },
    };
  }

  /** GDD §14 schema, in full. */
  state() {
    const cls = this.run.classification;
    const total = aggregate(this.run.encounterScores, 'RUN');
    const stream = this.world.stream(this.player.pos.z);
    const stop = this.currentStop();
    return {
      player: this.player.snapshot(),
      hostiles: this.hostiles.map((h) => h.snapshot()),
      director: this.director.snapshot(),
      run: {
        ...this.run.snapshot(),
        nodeStress: stop?.state ? { primary: ENCOUNTERS[stop.state].primaryStress, secondary: ENCOUNTERS[stop.state].secondaryStress } : null,
        stop: stop ? { kind: stop.kind, label: stop.label, started: stop.started, cleared: stop.cleared } : null,
        mode: this.mode,
      },
      build: {
        reactor: REACTORS[this.run.reactor].name,
        upgrades: this.run.upgrades.slice(),
        weaponEvolutions: this.run.evolutions.slice(),
        classifiedDiscipline: cls.name,
        classifierAxes: cls.scores,
        classifierShares: cls.shares,
        hybrid: cls.hybrid,
      },
      score: {
        control: total.control, vanish: total.vanish, conversion: total.conversion,
        flow: total.flow, integrity: total.integrity, final: total.final, rank: total.rank,
        excluded: total.excluded,
        encounters: this.run.encounterScores.map((s) => ({ label: s.label, final: +s.final.toFixed(2), rank: s.rank })),
      },
      boss: this.boss ? this.boss.snapshotBoss() : null,
      perf: {
        frameTime: +this.lastFrameMs.toFixed(2),
        drawCalls: this.lastDrawCalls,
        entities: this.hostiles.length + this.ordnance.entityCount,
        streamerState: `${stream.visible}/${stream.total} volumes visible · player z ${this.player.pos.z.toFixed(0)}`,
      },
      timeScale: +this.timeScale.toFixed(3),
    };
  }
}
