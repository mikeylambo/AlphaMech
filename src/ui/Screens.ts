import { h, $, Nav, setBar } from './Dom';
import { REACTORS, REACTOR_IDS, ReactorId } from '../build/Reactors';
import { UPGRADES, UpgradeId } from '../build/Upgrades';
import { EVOLUTIONS, EvolutionId, HardpointId, HARDPOINTS } from '../build/Weapons';
import { RunState, ForgeOffer } from '../build/RunState';
import { EncounterScore, METRIC_WEIGHTS, MetricKey, RANK_BLURB, aggregate } from '../score/Metrics';
import { InputManager } from '../core/Input';
import { AudioManager } from '../audio/Audio';

export type ScreenId = 'title' | 'forge' | 'results' | 'pause' | null;

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
  private selectedReactor: ReactorId = 'vector';
  private forgeStage: 'upgrade' | 'evolution' | 'launch' = 'upgrade';
  private forgeOffer: ForgeOffer | null = null;
  private forgeRun: RunState | null = null;
  private forgeHandlers: { onUpgrade(id: UpgradeId): void; onEvolution(id: EvolutionId, hp: HardpointId): void; onLaunch(): void } | null = null;

  constructor(parent: HTMLElement, private audio: AudioManager) {
    this.title = h('div', 'screen'); this.title.id = 'title';
    this.forge = h('div', 'screen'); this.forge.id = 'forge';
    this.results = h('div', 'screen'); this.results.id = 'results';
    this.pause = h('div', 'screen'); this.pause.id = 'pause';
    parent.append(this.title, this.forge, this.results, this.pause);
    this.nav.onMove = () => this.audio.uiMove();
  }

  private open(id: ScreenId) {
    for (const [key, el] of [['title', this.title], ['forge', this.forge], ['results', this.results], ['pause', this.pause]] as [ScreenId, HTMLElement][])
      el.classList.toggle('on', key === id);
    this.current = id;
    document.body.classList.toggle('menu', id !== null);
  }

  hide() { this.open(null); this.nav.clear(); }

  // =============================================================================== TITLE
  showTitle(seed: string, onStart: (r: ReactorId) => void, onReseed: () => void) {
    this.title.innerHTML = `
      <div class="inner">
        <div class="title-mark">BLINK<span>FALL</span></div>
        <div class="subtitle">SECTOR 01 · EXTERIOR · ALPHA RUN</div>
        <p class="thesis">A high-speed mech action roguelite about becoming <b>impossible to surround</b>.
          You are stronger than any one of them and weaker than all of them at once.
          The entire skill ceiling lives in that gap.</p>
        <div style="margin-top:30px" class="section-title">SELECT REACTOR</div>
        <div class="cards" id="reactorCards"></div>
        <div class="btnrow">
          <button class="btn" id="btnDeploy">DEPLOY <span class="key mono">ENTER / A</span></button>
          <button class="btn ghost" id="btnReseed">NEW SEED <span class="key mono">R</span></button>
          <span class="seed mono" style="align-self:center">SEED <b id="seedTxt">${seed}</b></span>
        </div>
        <div class="section-title" style="margin-top:34px">CONTROLS</div>
        <div class="controls mono">${CONTROLS.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      </div>`;
    const cards = $('reactorCards');
    const items: { el: HTMLElement; activate: () => void; row?: number; col?: number }[] = [];
    REACTOR_IDS.forEach((id, i) => {
      const r = REACTORS[id];
      const el = h('div', 'card');
      el.innerHTML = `<div class="verb mono">REACTOR</div><div class="name">${r.name}</div>
        <div class="fantasy">${r.tagline}</div>
        <div class="machinery mono">${r.machinery.join('<br>')}</div>`;
      cards.appendChild(el);
      items.push({ el, row: 0, col: i, activate: () => { this.selectedReactor = id; this.paintReactor(); this.audio.uiSelect(); } });
    });
    const deploy = $('btnDeploy'), reseed = $('btnReseed');
    items.push({ el: deploy, row: 1, col: 0, activate: () => { this.audio.uiSelect(); onStart(this.selectedReactor); } });
    items.push({ el: reseed, row: 1, col: 1, activate: () => { this.audio.uiSelect(); onReseed(); } });
    // focus starts on DEPLOY: pressing Enter or A from a cold start should launch the run,
    // not silently re-pick the reactor that is already selected
    this.nav.set(items, items.indexOf(items.find((i) => i.el === deploy)!));
    this.paintReactor();
    this.open('title');
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
  showForge(run: RunState, offer: ForgeOffer, handlers: { onUpgrade(id: UpgradeId): void; onEvolution(id: EvolutionId, hp: HardpointId): void; onLaunch(): void }) {
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
    offer.upgrades.forEach((id, i) => {
      const u = UPGRADES[id];
      const taken = run.hasUpgrade(id);
      const done = this.forgeStage !== 'upgrade';
      const el = h('div', `card assemble stagger-${i + 1}${done && !taken ? ' taken' : ''}`);
      el.innerHTML = `<div class="verb mono">${u.verb}</div><div class="name">${u.name}</div>
        <div class="fantasy">${u.fantasy}</div>
        <div class="machinery mono">${u.machinery}</div>
        <div class="law mono">LAW III · ${u.lawIII.toUpperCase()}</div>`;
      if (taken) el.style.borderColor = 'var(--cyan)';
      up.appendChild(el);
      if (!done) items.push({ el, row: 0, col: i, activate: () => { this.audio.uiSelect(); hs.onUpgrade(id); this.forgeStage = 'evolution'; this.paintForge(); } });
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
  showPause(run: RunState, handlers: { onResume(): void; onAbandon(): void }) {
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
          <button class="btn ghost" id="btnAbandon">ABANDON RUN</button>
        </div>
        <div class="section-title" style="margin-top:34px">CONTROLS</div>
        <div class="controls mono">${CONTROLS.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      </div>`;
    this.nav.set([
      { el: $('btnResume'), row: 0, col: 0, activate: () => { this.audio.uiBack(); handlers.onResume(); } },
      { el: $('btnAbandon'), row: 0, col: 1, activate: () => { this.audio.uiSelect(); handlers.onAbandon(); } },
    ], 0);
    this.open('pause');
  }

  /** Controller and keyboard navigation for whichever screen is open. */
  handleInput(input: InputManager) {
    if (!this.current) return;
    if (input.pressed('menuLeft')) this.nav.move2(-1, 0);
    if (input.pressed('menuRight')) this.nav.move2(1, 0);
    if (input.pressed('menuUp')) this.nav.move2(0, -1);
    if (input.pressed('menuDown')) this.nav.move2(0, 1);
    if (input.pressed('confirm')) this.nav.confirm();
  }
}
