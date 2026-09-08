import { h, $, Nav, setBar } from './Dom';
import { REACTORS, REACTOR_IDS, ReactorId } from '../build/Reactors';
import { UPGRADES } from '../build/Upgrades';
import { corruptedCard } from '../build/Corrupted';
import { EVOLUTIONS, EvolutionId, HardpointId, HARDPOINTS } from '../build/Weapons';
import { RunState, ForgeOffer, UpgradeCard } from '../build/RunState';
import { EncounterScore, METRIC_WEIGHTS, MetricKey, RANK_BLURB, aggregate } from '../score/Metrics';
import { AudioManager } from '../audio/Audio';
import { FALL_TIERS, fallProgress } from '../director/Fall';
import { InputManager, CapturedInput } from '../core/Input';
import {
  settings, Assists, DEFAULT_ASSISTS, VANISH_WINDOW_STEPS, VanishWindowAssist,
  activeAssists, REBINDABLE, ACTION_LABELS, bindingLabel,
} from '../core/Settings';

export type ScreenId = 'title' | 'forge' | 'results' | 'pause' | 'settings' | null;

const CONTROLS: [string, string][] = [
  ['BOOST SKATE', 'W A S D / LEFT STICK'],
  ['CAMERA · AIM', 'MOUSE / RIGHT STICK'],
  ['QUICK BOOST · VANISH', 'SHIFT / RB'],
  ['ASSAULT BOOST', 'E / L3'],
  ['VERTICAL THRUST', 'SPACE / A'],
  ['DESCEND', 'C · CTRL / B'],
  ['HARD LOCK', 'Q · MMB / R3'],
  ['CYCLE TARGET', 'WHEEL · ← → / D-PAD'],
  ['RIFLE', 'LMB / RT'],
  ['BLADE', 'RMB · F / X'],
  ['MISSILE RACK', '1 / LB'],
  ['PILE DRIVER', '2 / Y'],
  ['RALLY PROMPT', 'W A S D / D-PAD'],
  ['TUNING · PROFILER', 'P / O'],
];

export class Screens {
  nav = new Nav();
  current: ScreenId = null;
  private title: HTMLElement;
  private forge: HTMLElement;
  private results: HTMLElement;
  private pause: HTMLElement;
  private settingsEl: HTMLElement;
  private settingsReturn: ScreenId = 'title';
  private settingsTab: 'assists' | 'controls' = 'assists';
  private input: InputManager | null = null;
  onSettingsChanged: (() => void) | null = null;
  private selectedReactor: ReactorId = 'vector';
  private forgeStage: 'upgrade' | 'evolution' | 'launch' = 'upgrade';
  private forgeOffer: ForgeOffer | null = null;
  private forgeRun: RunState | null = null;
  private forgeHandlers: { onUpgrade(card: UpgradeCard): void; onEvolution(id: EvolutionId, hp: HardpointId): void; onLaunch(): void } | null = null;

  constructor(parent: HTMLElement, private audio: AudioManager) {
    this.title = h('div', 'screen'); this.title.id = 'title';
    this.forge = h('div', 'screen'); this.forge.id = 'forge';
    this.results = h('div', 'screen'); this.results.id = 'results';
    this.pause = h('div', 'screen'); this.pause.id = 'pause';
    this.settingsEl = h('div', 'screen'); this.settingsEl.id = 'settings';
    parent.append(this.title, this.forge, this.results, this.pause, this.settingsEl);
    this.nav.onMove = () => this.audio.uiMove();
  }

  attachInput(input: InputManager) { this.input = input; }

  private open(id: ScreenId) {
    for (const [key, el] of [['title', this.title], ['forge', this.forge], ['results', this.results], ['pause', this.pause], ['settings', this.settingsEl]] as [ScreenId, HTMLElement][])
      el.classList.toggle('on', key === id);
    this.current = id;
    document.body.classList.toggle('menu', id !== null);
  }

  hide() { this.open(null); this.nav.clear(); }

  // =============================================================================== TITLE
  showTitle(seed: string, onStart: (r: ReactorId, fall: number) => void, onReseed: () => void, onSettings?: () => void, onOrientation?: () => void) {
    this.title.innerHTML = `
      <div class="inner">
        <div class="title-mark">BLINK<span>FALL</span></div>
        <div class="subtitle">SECTOR 01 · EXTERIOR · ALPHA RUN</div>
        <p class="thesis">A high-speed mech action roguelite about becoming <b>impossible to surround</b>.
          You are stronger than any one of them and weaker than all of them at once.
          The entire skill ceiling lives in that gap.</p>
        <div style="margin-top:26px" class="section-title">DIFFICULTY · CLEAR A TIER TO UNLOCK THE NEXT</div>
        <div class="falls" id="fallRow"></div>
        <div class="fallnote mono" id="fallNote"></div>
        <div style="margin-top:22px" class="section-title">SELECT REACTOR</div>
        <div class="cards" id="reactorCards"></div>
        <div class="btnrow">
          <button class="btn" id="btnDeploy">DEPLOY <span class="key mono">ENTER / A</span></button>
          <button class="btn ghost" id="btnReseed">NEW SEED</button>
          <button class="btn ghost${settings.onboarded ? '' : ' urge'}" id="btnOrient">ORIENTATION</button>
          <button class="btn ghost" id="btnSettings">SETTINGS</button>
          <span class="seed mono" style="align-self:center">SEED <b id="seedTxt">${seed}</b></span>
        </div>
        <div class="section-title" style="margin-top:34px">CONTROLS</div>
        <div class="controls mono">${CONTROLS.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      </div>`;
    const items: { el: HTMLElement; activate: () => void; row?: number; col?: number }[] = [];

    // --- FALL ladder row: every tier visible, locked ones legible but unselectable
    const fallRow = $('fallRow');
    FALL_TIERS.forEach((t, i) => {
      const unlocked = fallProgress.isUnlocked(t.id);
      const el = h('button', `fall${unlocked ? '' : ' locked'}${fallProgress.selected === t.id ? ' on' : ''}`);
      el.innerHTML = `<span class="n">${t.name.replace('FALL ', '')}</span>`;
      el.title = t.changes;
      fallRow.appendChild(el);
      items.push({ el, row: 0, col: i, activate: () => {
        if (!unlocked) { this.audio.uiBack(); return; }
        fallProgress.select(t.id);
        this.audio.uiSelect();
        this.paintFall();
      } });
    });

    const cards = $('reactorCards');
    REACTOR_IDS.forEach((id, i) => {
      const r = REACTORS[id];
      const el = h('div', 'card');
      el.innerHTML = `<div class="verb mono">REACTOR</div><div class="name">${r.name}</div>
        <div class="fantasy">${r.tagline}</div>
        <div class="machinery mono">${r.machinery.join('<br>')}</div>`;
      cards.appendChild(el);
      items.push({ el, row: 1, col: i, activate: () => { this.selectedReactor = id; this.paintReactor(); this.audio.uiSelect(); } });
    });
    const deploy = $('btnDeploy'), reseed = $('btnReseed'), orient = $('btnOrient'), setBtn = $('btnSettings');
    items.push({ el: deploy, row: 2, col: 0, activate: () => { this.audio.uiSelect(); onStart(this.selectedReactor, fallProgress.selected); } });
    items.push({ el: reseed, row: 2, col: 1, activate: () => { this.audio.uiSelect(); onReseed(); } });
    items.push({ el: orient, row: 2, col: 2, activate: () => { this.audio.uiSelect(); onOrientation?.(); } });
    items.push({ el: setBtn, row: 2, col: 3, activate: () => { this.audio.uiSelect(); onSettings?.(); } });
    // focus starts on DEPLOY: pressing Enter or A from a cold start should launch the run,
    // not silently re-pick the reactor that is already selected. On a first launch it starts
    // on ORIENTATION instead — offered, never forced.
    const first = settings.onboarded ? deploy : orient;
    this.nav.set(items, items.indexOf(items.find((i) => i.el === first)!));
    this.paintFall();
    this.paintReactor();
    this.open('title');
  }

  private paintFall() {
    const row = document.getElementById('fallRow');
    const note = document.getElementById('fallNote');
    if (!row || !note) return;
    FALL_TIERS.forEach((t, i) => (row.children[i] as HTMLElement).classList.toggle('on', fallProgress.selected === t.id));
    const t = FALL_TIERS[fallProgress.selected - 1];
    note.innerHTML = `<b>${t.name}</b> · ${t.changes}<br>`
      + `TOKEN COOLDOWN ${t.tokenCooldown.toFixed(2)}s · FORWARD BIAS ${t.forwardBias.toFixed(2)} · CEILING ${t.arenaCeiling} · `
      + `${t.asyncAllowed ? 'ASYNC ALLOWED' : 'SEQUENCED ONLY'} · ELITES ${t.elites} · CORRUPTED ${Math.round(t.corruptedFraction * 100)}%<br>`
      + `<span class="rule-note">DAMAGE, STRUCTURE AND THE ARC THRESHOLDS ARE IDENTICAL AT EVERY TIER</span>`;
  }

  setSeed(seed: string) { const e = document.getElementById('seedTxt'); if (e) e.textContent = seed; }

  private paintReactor() {
    const cards = document.getElementById('reactorCards');
    if (!cards) return;
    REACTOR_IDS.forEach((id, i) => (cards.children[i] as HTMLElement).style.borderColor = id === this.selectedReactor ? 'var(--cyan)' : '');
  }

  // =============================================================================== FORGE
  /**
   * The FORGE is the only place in the run where the machine becomes completely still.
   * The interface assembles physically around the machine rather than overlaying the screen,
   * so the cards animate in from the deck rather than fading over it.
   */
  showForge(run: RunState, offer: ForgeOffer, handlers: { onUpgrade(card: UpgradeCard): void; onEvolution(id: EvolutionId, hp: HardpointId): void; onLaunch(): void }) {
    this.forgeRun = run;
    this.forgeOffer = offer;
    this.forgeHandlers = handlers;
    this.forgeStage = 'upgrade';
    this.forge.innerHTML = `
      <div class="inner">
        <div class="fhead">
          <div>
            <div class="section-title">FORGE ${run.forgesTaken + 1} · SECTOR ${String(run.sector).padStart(2, '0')}</div>
            <div class="t">FORGE</div>
          </div>
          <div class="m mono">
            LOCKS ENGAGED · THRUSTERS COLD<br>
            PILOT MODEL DECAY <b>25%</b> APPLIED<br>
            <span id="forgeStatus">TAKE ONE UPGRADE</span>
          </div>
        </div>
        <div class="band">
          <div class="section-title">UPGRADES · TAKE ONE</div>
          <div class="cards" id="forgeUpgrades"></div>
        </div>
        <div class="band">
          <div class="section-title" id="evoTitle">WEAPON EVOLUTION · EVERY ELIGIBLE HARDPOINT · TAKE ONE</div>
          <div class="cards wrap" id="forgeEvolutions"></div>
        </div>
        <div class="band">
          <div class="section-title">CURRENT LOADOUT</div>
          <div id="loadout"></div>
        </div>
        <div class="btnrow"><button class="btn" id="btnLaunch" disabled style="opacity:.35">LAUNCH <span class="key mono">ENTER / A</span></button></div>
      </div>`;
    this.paintForge();
    this.open('forge');
  }

  private paintForge() {
    const run = this.forgeRun!, offer = this.forgeOffer!, hs = this.forgeHandlers!;
    const up = $('forgeUpgrades'), evo = $('forgeEvolutions'), load = $('loadout'), status = $('forgeStatus'), launch = $('btnLaunch') as HTMLButtonElement;
    const items: { el: HTMLElement; activate: () => void; row?: number; col?: number }[] = [];

    up.innerHTML = '';
    offer.upgrades.forEach((card, i) => {
      const id = card.id;
      const clean = UPGRADES[id];
      const c = card.corrupted ? corruptedCard(card.corrupted) : null;
      const taken = run.hasUpgrade(id);
      const done = this.forgeStage !== 'upgrade';
      const el = h('div', `card assemble stagger-${i + 1}${c ? ' corrupted' : ''}${done && !taken ? ' taken' : ''}`);
      el.innerHTML = `<div class="verb mono">${clean.verb}${c ? ' · CORRUPTED' : ''}</div>
        <div class="name">${c ? c.name : clean.name}</div>
        <div class="fantasy">${c ? c.fantasy : clean.fantasy}</div>
        <div class="machinery mono">${c ? c.machinery : clean.machinery}</div>
        ${c ? `<div class="downside mono"><b>${c.downsideLabel}</b> ${c.downsideMachinery}</div>` : ''}
        <div class="law mono">LAW III · ${(c ? c.lawIII : clean.lawIII).toUpperCase()}</div>`;
      if (taken) el.style.borderColor = 'var(--cyan)';
      up.appendChild(el);
      if (!done) items.push({ el, row: 0, col: i, activate: () => { this.audio.uiSelect(); hs.onUpgrade(card); this.forgeStage = 'evolution'; this.paintForge(); } });
    });

    evo.innerHTML = '';
    const evoActive = this.forgeStage === 'evolution';
    offer.evolutions.forEach((o, i) => {
      const e = EVOLUTIONS[o.evolution];
      const taken = run.hasEvolution(o.evolution);
      const el = h('div', `card evo assemble stagger-${(i % 4) + 1}${!evoActive && !taken ? ' taken' : ''}`);
      el.innerHTML = `<div class="verb mono">${HARDPOINTS[o.hardpoint].slot} · ${HARDPOINTS[o.hardpoint].name}</div>
        <div class="name">${e.name}</div>
        <div class="fantasy">${e.fantasy}</div>
        <div class="machinery mono">${e.machinery}</div>
        <div class="law mono">LAW III · ${e.lawIII.toUpperCase()}</div>`;
      if (taken) el.style.borderColor = 'var(--cyan)';
      evo.appendChild(el);
      if (evoActive) items.push({ el, row: 1, col: i, activate: () => { this.audio.uiSelect(); hs.onEvolution(o.evolution, o.hardpoint); this.forgeStage = 'launch'; this.paintForge(); } });
    });
    $('evoTitle').textContent = `WEAPON EVOLUTION · ${offer.evolutions.length} ELIGIBLE HARDPOINT${offer.evolutions.length === 1 ? '' : 'S'} · TAKE ONE`;

    load.innerHTML = `<span class="chip reactor mono">${REACTORS[run.reactor].name}</span>`
      + run.upgrades.map((u) => `<span class="chip mono">${UPGRADES[u].name}</span>`).join('')
      + run.evolutions.map((e) => `<span class="chip evo mono">${EVOLUTIONS[e].name}</span>`).join('');

    status.textContent = this.forgeStage === 'upgrade' ? 'TAKE ONE UPGRADE'
      : this.forgeStage === 'evolution' ? 'TAKE ONE WEAPON EVOLUTION' : 'READY TO LAUNCH';
    const ready = this.forgeStage === 'launch';
    launch.disabled = !ready;
    launch.style.opacity = ready ? '1' : '.35';
    if (ready) items.push({ el: launch, row: 2, col: 0, activate: () => { this.audio.uiSelect(); hs.onLaunch(); } });

    this.nav.set(items, 0);
  }

  // ============================================================================= RESULTS
  showResults(run: RunState, boss: EncounterScore | null, victory: boolean, handlers: { onRetrySeed(): void; onNewRun(): void }) {
    const all = boss ? [...run.encounterScores, boss] : run.encounterScores;
    const total = aggregate(all, 'SECTOR 01');
    const cls = run.classification;
    const metricRow = (k: MetricKey, label: string, note: string) => {
      const v = total[k];
      const excluded = v === null;
      return `<div class="metric${excluded ? ' excluded' : ''}">
        <div class="h"><span class="label">${label} <span class="w mono">×${METRIC_WEIGHTS[k].toFixed(2)}</span></span><b class="mono">${excluded ? 'N/A' : v.toFixed(1)}</b></div>
        <div class="bar"><i data-v="${excluded ? 0 : v / 100}"></i></div>
        <div class="law mono" style="margin-top:3px">${excluded ? 'DENOMINATOR ZERO · WEIGHT REDISTRIBUTED' : note}</div>
      </div>`;
    };
    this.results.innerHTML = `
      <div class="inner">
        <div class="section-title">${victory ? 'SECTOR 01 CLEARED · SEVERANCE DOWN' : 'FRAME LOST'}</div>
        <div class="disc">${cls.name}</div>
        <div class="discSub">${cls.feelsLike.toUpperCase()}${cls.hybrid ? ' · HYBRID' : cls.matchedDiscipline ? ` · ${(cls.dominantShare * 100).toFixed(0)}% ${cls.dominant}` : ''}</div>
        <div class="grid">
          <div>
            ${metricRow('control', 'CONTROL', 'ARC UNDER 145° WHILE MOVING · LAW II')}
            ${metricRow('vanish', 'VANISH', 'PERFECT VANISHES / VANISHABLE ATTACKS')}
            ${metricRow('conversion', 'CONVERSION', 'STAGGER PUNISHES / STAGGERS CREATED')}
            ${metricRow('flow', 'FLOW', 'AVERAGE SPEED / 120')}
            ${metricRow('integrity', 'INTEGRITY', `DENOMINATOR ${run.maxStructure.toLocaleString()} · READ AT ENCOUNTER START`)}
            <div class="breakdown">
              <div class="section-title">ENCOUNTER LOG</div>
              ${all.map((s) => `<div class="brow mono"><span>${s.label}</span><b>${s.rank} · ${s.final.toFixed(1)}</b></div>`).join('')}
            </div>
          </div>
          <div>
            <div class="rankbox">
              <div class="r">${total.rank}</div>
              <div class="f mono">${total.final.toFixed(1)}</div>
              <div class="blurb">${RANK_BLURB[total.rank]}</div>
            </div>
            <div class="breakdown">
              <div class="section-title">BUILD</div>
              <div class="brow mono"><span>REACTOR</span><b>${REACTORS[run.reactor].name}</b></div>
              ${run.upgrades.map((u) => `<div class="brow mono"><span>${UPGRADES[u].verb}</span><b>${UPGRADES[u].name}</b></div>`).join('')}
              ${run.evolutions.map((e) => `<div class="brow mono"><span>EVOLUTION</span><b>${EVOLUTIONS[e].name}</b></div>`).join('')}
              <div class="brow mono"><span>SEED</span><b>${run.seed}</b></div>
              <div class="brow mono"><span>ASSISTS</span><b class="${run.assistsAllDefault ? 'assist-none' : 'assist-on'}">${run.assistsAllDefault ? 'NONE · AUTHORED DEFAULTS' : `${activeAssists(run.assists).length} ACTIVE`}</b></div>
              ${activeAssists(run.assists).map((x) => `<div class="brow mono assist"><span>${x.label}</span><b>${x.value}</b></div>`).join('')}
              <div class="brow mono"><span>CHAINS</span><b>${run.chains.map((c) => c.name).join(' → ')}</b></div>
            </div>
          </div>
        </div>
        <div class="btnrow">
          <button class="btn" id="btnRetry">RETRY SEED <span class="key mono">IDENTICAL SETUP</span></button>
          <button class="btn ghost" id="btnNew">NEW RUN <span class="key mono">FRESH SEED</span></button>
        </div>
      </div>`;
    requestAnimationFrame(() => {
      this.results.querySelectorAll<HTMLElement>('.metric .bar > i').forEach((i) => setBar(i, parseFloat(i.dataset.v || '0')));
    });
    const retry = $('btnRetry'), fresh = $('btnNew');
    this.nav.set([
      { el: retry, row: 0, col: 0, activate: () => { this.audio.uiSelect(); handlers.onRetrySeed(); } },
      { el: fresh, row: 0, col: 1, activate: () => { this.audio.uiSelect(); handlers.onNewRun(); } },
    ], 0);
    this.audio.rankStamp();
    this.open('results');
  }

  // =============================================================================== PAUSE
  showPause(run: RunState, handlers: { onResume(): void; onAbandon(): void; onSettings?(): void }) {
    this.pause.innerHTML = `
      <div class="inner" style="max-width:760px">
        <div class="section-title">PAUSED</div>
        <div class="title-mark" style="font-size:52px;letter-spacing:14px">STANDBY</div>
        <div class="subtitle">SEED ${run.seed} · SECTOR ${String(run.sector).padStart(2, '0')} · ${run.currentChain?.name ?? ''}</div>
        <div id="loadout" style="margin-top:20px">
          <span class="chip reactor mono">${REACTORS[run.reactor].name}</span>
          ${run.upgrades.map((u) => `<span class="chip mono">${UPGRADES[u].name}</span>`).join('')}
          ${run.evolutions.map((e) => `<span class="chip evo mono">${EVOLUTIONS[e].name}</span>`).join('')}
        </div>
        <div class="btnrow">
          <button class="btn" id="btnResume">RESUME <span class="key mono">ESC / B</span></button>
          <button class="btn ghost" id="btnPauseSettings">SETTINGS</button>
          <button class="btn ghost" id="btnAbandon">ABANDON RUN</button>
        </div>
        <div class="section-title" style="margin-top:34px">CONTROLS</div>
        <div class="controls mono">${CONTROLS.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      </div>`;
    this.nav.set([
      { el: $('btnResume'), row: 0, col: 0, activate: () => { this.audio.uiBack(); handlers.onResume(); } },
      { el: $('btnPauseSettings'), row: 0, col: 1, activate: () => { this.audio.uiSelect(); handlers.onSettings?.(); } },
      { el: $('btnAbandon'), row: 0, col: 2, activate: () => { this.audio.uiSelect(); handlers.onAbandon(); } },
    ], 0);
    this.open('pause');
  }

  // ============================================================================== SETTINGS
  /**
   * Accessibility and controls. Reachable from the title and from pause, fully navigable on a
   * gamepad — left/right adjusts the focused row, so no slider needs a pointer.
   */
  showSettings(returnTo: ScreenId) {
    this.settingsReturn = returnTo;
    this.paintSettings();
    this.open('settings');
  }

  private paintSettings() {
    const a = settings.assists;
    const tab = this.settingsTab;
    const active = activeAssists(a);
    this.settingsEl.innerHTML = `
      <div class="inner" style="max-width:900px">
        <div class="section-title">CONFIGURATION</div>
        <div class="title-mark" style="font-size:46px;letter-spacing:12px">SETTINGS</div>
        <div class="subtitle">${active.length ? `${active.length} ASSIST${active.length === 1 ? '' : 'S'} ACTIVE · RECORDED ON EVERY RUN` : 'AUTHORED DEFAULTS · NO ASSISTS ACTIVE'}</div>
        <div class="tabs" id="setTabs">
          <button class="tab${tab === 'assists' ? ' on' : ''}" id="tabAssists">ASSISTS</button>
          <button class="tab${tab === 'controls' ? ' on' : ''}" id="tabControls">CONTROLS</button>
        </div>
        <div id="setBody"></div>
        <div class="btnrow">
          <button class="btn" id="btnSetBack">BACK <span class="key mono">ESC / B</span></button>
          <button class="btn ghost" id="btnSetReset">${tab === 'assists' ? 'RESET ASSISTS' : 'RESET BINDINGS'}</button>
        </div>
      </div>`;
    const items: { el: HTMLElement; activate: () => void; row?: number; col?: number; adjust?: (d: -1 | 1) => void }[] = [];
    let row = 0;
    const tabA = $('tabAssists'), tabC = $('tabControls');
    items.push({ el: tabA, row: row, col: 0, activate: () => { this.settingsTab = 'assists'; this.audio.uiSelect(); this.paintSettings(); } });
    items.push({ el: tabC, row: row, col: 1, activate: () => { this.settingsTab = 'controls'; this.audio.uiSelect(); this.paintSettings(); } });
    row++;

    const body = $('setBody');
    if (tab === 'assists') this.paintAssists(body, items, () => row++, () => row);
    else this.paintControls(body, items, () => row++, () => row);

    const back = $('btnSetBack'), reset = $('btnSetReset');
    items.push({ el: back, row, col: 0, activate: () => { this.audio.uiBack(); this.showReturn(); } });
    items.push({ el: reset, row, col: 1, activate: () => {
      this.audio.uiSelect();
      if (this.settingsTab === 'assists') settings.resetAssists(); else settings.resetBindings();
      this.onSettingsChanged?.();
      this.paintSettings();
    } });
    this.nav.set(items, 2);
  }

  private showReturn() {
    this.onSettingsChanged?.();
    if (this.settingsReturn === 'title') this.open('title');
    else if (this.settingsReturn === 'pause') this.open('pause');
    else this.hide();
    this.nav.clear();
    if (this.settingsReturn) this.reopenReturn();
  }

  private reopenReturn: () => void = () => { /* replaced by the caller that opened settings */ };
  setSettingsReturnHandler(fn: () => void) { this.reopenReturn = fn; }

  private paintAssists(body: HTMLElement, items: { el: HTMLElement; activate: () => void; row?: number; col?: number; adjust?: (d: -1 | 1) => void }[], nextRow: () => void, curRow: () => number) {
    const a = settings.assists;
    const rowEl = (label: string, value: string, note: string, isDefault: boolean) => {
      const el = h('div', `setrow${isDefault ? '' : ' changed'}`);
      el.innerHTML = `<div class="k">${label}</div><div class="v mono">${value}</div><div class="n">${note}</div>`;
      body.appendChild(el);
      return el;
    };
    const commit = () => { settings.save(); this.onSettingsChanged?.(); this.paintSettings(); };

    // --- vanish window: four authored steps, not a continuous slider
    {
      const i = VANISH_WINDOW_STEPS.indexOf(a.vanishWindow);
      const el = rowEl('VANISH WINDOW', `${a.vanishWindow.toFixed(2)}s`, `STEP ${i + 1} / 4 · BASELINE 0.30s · UPGRADES KEEP THEIR RATIO`, a.vanishWindow === DEFAULT_ASSISTS.vanishWindow);
      const set = (d: -1 | 1) => { const n = Math.max(0, Math.min(VANISH_WINDOW_STEPS.length - 1, i + d)); a.vanishWindow = VANISH_WINDOW_STEPS[n] as VanishWindowAssist; commit(); };
      items.push({ el, row: curRow(), col: 0, adjust: set, activate: () => set(1) });
      nextRow();
    }
    const slider = (key: keyof Assists, label: string, min: number, max: number, step: number, fmt: (v: number) => string, note: string) => {
      const v = a[key] as number;
      const el = rowEl(label, fmt(v), note, v === DEFAULT_ASSISTS[key]);
      const set = (d: -1 | 1) => { (a[key] as number) = Math.round(Math.max(min, Math.min(max, v + d * step)) * 1000) / 1000; commit(); };
      items.push({ el, row: curRow(), col: 0, adjust: set, activate: () => set(1) });
      nextRow();
    };
    const toggle = (key: keyof Assists, label: string, note: string) => {
      const v = a[key] as boolean;
      const el = rowEl(label, v ? 'ON' : 'OFF', note, v === DEFAULT_ASSISTS[key]);
      const set = () => { (a[key] as boolean) = !(a[key] as boolean); commit(); };
      items.push({ el, row: curRow(), col: 0, adjust: set, activate: set });
      nextRow();
    };

    slider('bulletTimeScale', 'BULLET TIME DURATION', 0.6, 2.0, 0.1, (v) => `${v.toFixed(1)}×`, 'MULTIPLIES THE 0.85s VANISH SLOW · THE TIME SCALE ITSELF IS NEVER ASSISTED');
    slider('telegraphIntensity', 'TELEGRAPH INTENSITY', 0, 1, 0.1, (v) => `${Math.round(v * 100)}%`, 'GROUND-PLANE READS · INDEPENDENT OF FX INTENSITY');
    toggle('telegraphHighContrast', 'HIGH-CONTRAST TELEGRAPHS', 'ONE UNMISTAKABLE RING COLOUR INSTEAD OF ARCHETYPE TINTS');
    slider('fxIntensity', 'FX INTENSITY', 0, 1, 0.1, (v) => `${Math.round(v * 100)}%`, 'PARTICLES AND FLASHES · DOES NOT AFFECT TELEGRAPHS');
    slider('cameraShake', 'CAMERA SHAKE', 0, 1, 0.1, (v) => `${Math.round(v * 100)}%`, 'IMPACT AND EXPLOSION SHAKE');
    slider('cameraSensitivity', 'LOOK SENSITIVITY', 0.25, 3, 0.05, (v) => `${v.toFixed(2)}×`, 'MOUSE AND RIGHT STICK');
    slider('fov', 'FIELD OF VIEW', 50, 100, 1, (v) => `${Math.round(v)}°`, 'VERTICAL · BASELINE 62°');
    toggle('holdAssaultBoost', 'ASSAULT BOOST', 'TOGGLE BY DEFAULT · ON = HOLD TO BOOST');
    toggle('holdHardLock', 'HARD LOCK', 'TOGGLE BY DEFAULT · ON = HOLD TO LOCK');
  }

  private paintControls(body: HTMLElement, items: { el: HTMLElement; activate: () => void; row?: number; col?: number; adjust?: (d: -1 | 1) => void }[], nextRow: () => void, curRow: () => number) {
    const note = h('div', 'law mono', 'SELECT A ROW AND PRESS CONFIRM, THEN THE KEY, MOUSE BUTTON OR PAD BUTTON TO BIND. MENU NAVIGATION IS FIXED SO A BINDING CAN NEVER LOCK YOU OUT OF THIS SCREEN.');
    note.style.cssText = 'margin-bottom:12px;max-width:640px';
    body.appendChild(note);
    for (const action of REBINDABLE) {
      const bd = settings.bindings[action];
      const el = h('div', 'setrow bind');
      el.innerHTML = `<div class="k">${ACTION_LABELS[action]}</div><div class="v mono">${bindingLabel(bd)}</div><div class="n"></div>`;
      body.appendChild(el);
      items.push({
        el, row: curRow(), col: 0,
        activate: () => {
          if (!this.input) return;
          const vEl = el.querySelector('.v') as HTMLElement;
          vEl.textContent = 'PRESS ANY INPUT…';
          el.classList.add('capturing');
          this.audio.uiSelect();
          this.input.captureNext((c: CapturedInput) => {
            const clash = InputManager.conflicts(action, c);
            InputManager.rebind(action, c);
            for (const other of clash) {
              const ob = settings.bindings[other];
              if (c.kind === 'key') ob.keys = ob.keys.filter((k) => k !== c.key);
              else if (c.kind === 'mouse') ob.mouse = ob.mouse.filter((m) => m !== c.button);
              else ob.pad = ob.pad.filter((p) => p !== c.button);
            }
            settings.save();
            this.onSettingsChanged?.();
            this.paintSettings();
          });
        },
      });
      nextRow();
    }
  }

  /** Controller and keyboard navigation for whichever screen is open. */
  handleInput(input: InputManager) {
    if (!this.current) return;
    if (input.capturing) return;
    if (this.current === 'settings' && input.pressed('cancel')) { this.audio.uiBack(); this.showReturn(); return; }
    if (input.pressed('menuLeft')) this.nav.move2(-1, 0);
    if (input.pressed('menuRight')) this.nav.move2(1, 0);
    if (input.pressed('menuUp')) this.nav.move2(0, -1);
    if (input.pressed('menuDown')) this.nav.move2(0, 1);
    if (input.pressed('confirm')) this.nav.confirm();
  }
}
