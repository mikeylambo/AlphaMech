import * as THREE from 'three';
import { T } from '../core/Tuning';
import { $, h, pad, setBar } from './Dom';
import { clamp01, deg, rad } from '../core/MathUtil';
import { Player } from '../frame/Player';
import { Hostile } from '../frame/Types';
import { Director } from '../director/Director';
import { Rally } from '../frame/Rally';
import { EncounterId, ENCOUNTERS } from '../director/Encounters';
import { HARDPOINT_ORDER, HARDPOINTS, EVOLUTIONS, EvolutionId, HardpointId } from '../build/Weapons';
import { RunState } from '../build/RunState';
import type { Beat } from '../director/Onboarding';
import type { BossFrame } from '../enemies/Boss';

/**
 * The instrument panel. Its whole job is Law II: make the shape of the formation around you
 * legible at a glance, at speed, while you are being shot at.
 */
export class HUD {
  root: HTMLElement;
  private radar: HTMLCanvasElement;
  private rctx: CanvasRenderingContext2D;
  private flashT = 0;
  private hitT = 0;
  private els: Record<string, HTMLElement> = {};
  private hpEls = new Map<HardpointId, { root: HTMLElement; name: HTMLElement; cd: HTMLElement }>();
  private ghostStruct = 1;

  constructor(parent: HTMLElement) {
    this.root = h('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="banner">
        <div class="chain mono" id="bChain">—</div>
        <div class="state" id="bState">ARENA</div>
        <div class="stress mono" id="bStress">ROTATION · LOCK</div>
        <div class="prog" id="bProg"></div>
      </div>
      <div id="objective"><b id="objMain">—</b><span id="objSub"></span></div>
      <div id="objpoint"><div class="k mono">EMPLACEMENT</div><div class="v mono">100%</div><div class="bar"><i></i></div><div class="t mono">CLEAR</div></div>
      <div id="comm"><div class="from mono">CONTROL</div><div class="body"></div></div>
      <div id="bossbar">
        <div class="n"><span>SEVERANCE</span><span class="ph mono" id="bossPhase">PHASE 1</span></div>
        <div class="track"><i id="bossFill"></i><div class="mid"></div></div>
        <div class="cv mono" id="bossCV"></div>
      </div>
      <div id="vitals">
        <div class="row">
          <div class="head"><span class="label">STRUCTURE</span><span class="v mono" id="vStruct">9000</span></div>
          <div class="bar struct"><i class="ghost" id="vStructGhost"></i><i id="vStructFill"></i></div>
        </div>
        <div class="row">
          <div class="head"><span class="label">IMPACT</span><span class="v mono" id="vImpact">0</span></div>
          <div class="bar impact"><i id="vImpactFill"></i></div>
        </div>
        <div class="row">
          <div class="head"><span class="label">ENERGY</span><span class="v mono" id="vEnergy">100</span></div>
          <div class="bar energy"><i id="vEnergyFill"></i></div>
          <div id="enSegs"></div>
        </div>
      </div>
      <div id="hardpoints"></div>
      <div id="stateLine"><b id="sState">STANDBY</b><span class="streak mono" id="sStreak"></span></div>
      <div id="targets"></div>
      <div id="encirclement">
        <canvas id="radar" width="464" height="264"></canvas>
        <div id="arcLine" class="mono">ARC 000°</div>
        <div id="tokenLine" class="mono">TOKENS 1 · ARC RULE</div>
      </div>
      <div id="reticle"><i class="c"></i><i class="c"></i><i class="c"></i><i class="c"></i></div>
      <div id="flash"></div>
      <div id="slowfx"></div>
      <div id="hitfx"></div>
      <div id="toasts"></div>
      <div id="rally">
        <div style="position:relative">
          <svg class="ring" viewBox="0 0 100 100">
            <circle class="bg" cx="50" cy="50" r="44"></circle>
            <circle class="arc" id="rallyArc" cx="50" cy="50" r="44" transform="rotate(-90 50 50)"
              stroke-dasharray="276.4" stroke-dashoffset="0"></circle>
          </svg>
          <div id="rallyKey">W</div>
        </div>
        <div id="rallyMode">VANISH</div>
        <div id="rallyCount" class="mono">EXCHANGE 1 / 5</div>
        <div id="rallyPips"></div>
      </div>
      <div id="transit"><div class="k mono" id="trK">CONDUIT</div><div class="t" id="trT">NO LOADING BREAK</div><div class="s mono" id="trS"></div></div>
      <div id="padHint" class="mono">GAMEPAD ACTIVE</div>
      <div id="tutorial"><div class="p" id="tutPrompt"></div><div class="h mono" id="tutHint"></div><div class="s mono">ESC TO SKIP</div></div>
    `;
    parent.appendChild(this.root);

    for (const id of ['tutorial', 'tutPrompt', 'tutHint', 'bChain', 'bState', 'bStress', 'bProg', 'objMain', 'objSub', 'vStruct', 'vStructFill', 'vStructGhost', 'vImpact', 'vImpactFill', 'vEnergy', 'vEnergyFill', 'enSegs', 'sState', 'sStreak', 'targets', 'arcLine', 'tokenLine', 'reticle', 'flash', 'slowfx', 'hitfx', 'rally', 'rallyKey', 'rallyArc', 'rallyMode', 'rallyCount', 'rallyPips', 'bossbar', 'bossFill', 'bossPhase', 'bossCV', 'transit', 'trK', 'trT', 'trS', 'toasts', 'padHint', 'hardpoints', 'objpoint', 'comm'])
      this.els[id] = $(id);

    this.radar = $('radar') as HTMLCanvasElement;
    this.rctx = this.radar.getContext('2d')!;
    const segs = this.els.enSegs;
    for (let i = 0; i < 20; i++) segs.appendChild(h('i'));
    const pips = this.els.rallyPips;
    for (let i = 0; i < T.rallyMax; i++) pips.appendChild(h('i'));
  }

  show(on: boolean) { this.root.classList.toggle('on', on); }

  buildHardpoints(run: RunState) {
    const wrap = this.els.hardpoints;
    wrap.innerHTML = '';
    this.hpEls.clear();
    for (const id of HARDPOINT_ORDER) {
      const evolved = run.evolvedHardpoints.includes(id);
      const evo = evolved ? Object.values(EVOLUTIONS).find((e) => e.hardpoint === id && run.evolutions.includes(e.id as EvolutionId)) : null;
      const el = h('div', `hp${evo ? ' evolved' : ''}`);
      el.innerHTML = `<div class="k mono">${HARDPOINTS[id].slot}</div><div class="n">${evo ? evo.name : HARDPOINTS[id].name}</div><div class="cd"><i></i></div>`;
      wrap.appendChild(el);
      this.hpEls.set(id, { root: el, name: el.querySelector('.n')!, cd: el.querySelector('.cd i')! });
    }
  }

  setEncounter(chainName: string, state: EncounterId, nodeIndex: number, nodeCount: number, objective: string, sub: string) {
    const spec = ENCOUNTERS[state];
    this.els.bChain.textContent = chainName;
    this.els.bState.textContent = state;
    this.els.bStress.textContent = `${spec.primaryStress} · ${spec.secondaryStress}`;
    this.els.objMain.textContent = objective;
    this.els.objSub.textContent = sub;
    const prog = this.els.bProg;
    prog.innerHTML = '';
    for (let i = 0; i < nodeCount; i++) prog.appendChild(h('i', i < nodeIndex ? 'done' : i === nodeIndex ? 'now' : ''));
  }

  /** The boss is not an encounter state; it gets its own banner. */
  setBossBanner(name: string, stress: string, objective: string, sector = 1) {
    this.els.bChain.textContent = `SECTOR ${String(sector).padStart(2, '0')} · BOSS`;
    this.els.bState.textContent = name;
    this.els.bStress.textContent = stress;
    this.els.objMain.textContent = objective;
    this.els.objSub.textContent = '';
    this.els.bProg.innerHTML = '';
    this.els.bProg.appendChild(h('i', 'now'));
  }

  /** The authored opening's prompt. Deliberately large, deliberately short. */
  setTutorial(beat: Beat | null) {
    this.els.tutorial.classList.toggle('on', !!beat);
    if (!beat) return;
    this.els.tutPrompt.textContent = beat.prompt;
    this.els.tutHint.textContent = beat.hint;
  }

  setObjective(main: string, sub: string) { this.els.objMain.textContent = main; this.els.objSub.textContent = sub; }

  transit(kind: string, title: string, sub: string, on: boolean) {
    this.els.trK.textContent = kind;
    this.els.trT.textContent = title;
    this.els.trS.textContent = sub;
    this.els.transit.classList.toggle('on', on);
  }

  flash(text: string, colour = '#8ff4ff') {
    const e = this.els.flash;
    e.textContent = text;
    e.style.color = colour;
    this.flashT = 1;
  }

  toast(text: string) {
    const e = h('div', 'toast mono', text);
    this.els.toasts.appendChild(e);
    setTimeout(() => e.remove(), 2500);
  }

  damageFlash() { this.hitT = 1; }

  /**
   * One boss bar for every boss in the game.
   *
   * There is no `instanceof` here and there must never be one: each boss answers what it is
   * called, how much of its pool is left, whether its damage gate is currently closed, and one
   * line about the mechanic the fight is actually about. Adding the fifth boss is adding a class
   * that answers those four questions.
   */
  setBoss(boss: BossFrame | null) {
    this.els.bossbar.classList.toggle('on', !!boss);
    this.els.bossbar.classList.toggle('screened', !!boss?.gated);
    if (!boss) return;
    setBar(this.els.bossFill, boss.structure01);
    this.els.bossPhase.textContent = `PHASE ${boss.phase}`;
    const name = this.els.bossbar.querySelector('.n span') as HTMLElement | null;
    if (name) name.textContent = boss.bossName;
    this.els.bossCV.textContent = boss.hudLine();
  }

  /**
   * OBJECTIVE state readout. Nothing is shown when the encounter has no point to protect, so
   * the panel is proof of the state rather than permanent chrome.
   */
  setObjectivePoint(p: { kind: string; structure01: number; threats: number; label: string } | null) {
    const el = this.els.objpoint;
    el.classList.toggle('on', !!p);
    if (!p) return;
    el.classList.toggle('threatened', p.threats > 0);
    (el.querySelector('.k') as HTMLElement).textContent = p.label;
    (el.querySelector('.v') as HTMLElement).textContent = `${Math.round(p.structure01 * 100)}%`;
    (el.querySelector('.t') as HTMLElement).textContent = p.threats > 0 ? `${p.threats} ON THE POINT` : 'CLEAR';
    setBar(el.querySelector('.bar > i') as HTMLElement, p.structure01);
  }

  /**
   * A comm line. Two lines maximum, and only ever issued at a FORGE, a boss introduction or a
   * sector boundary — combat is movement, story is stillness.
   */
  comm(from: string, lines: string[], hold = 6.5) {
    const el = this.els.comm;
    (el.querySelector('.from') as HTMLElement).textContent = from;
    const body = el.querySelector('.body') as HTMLElement;
    body.innerHTML = '';
    for (const l of lines.slice(0, 2)) body.appendChild(h('p', '', l));
    el.classList.remove('on');
    void el.offsetWidth;   // restart the animation even if a line is already up
    el.classList.add('on');
    this.commT = hold;
  }
  clearComm() { this.els.comm.classList.remove('on'); this.commT = 0; }
  private commT = 0;

  // ---------------------------------------------------------------------------- per frame
  update(realDt: number, p: Player, hostiles: Hostile[], director: Director, rally: Rally, camera: THREE.PerspectiveCamera, timeScale: number, padActive: boolean) {
    if (this.commT > 0) { this.commT -= realDt; if (this.commT <= 0) this.els.comm.classList.remove('on'); }
    const V = p.vitals;
    this.els.vStruct.textContent = `${Math.round(V.structure)} / ${Math.round(V.structureMax)}`;
    setBar(this.els.vStructFill, V.structure01);
    this.ghostStruct += (V.structure01 - this.ghostStruct) * Math.min(1, realDt * 1.6);
    setBar(this.els.vStructGhost, Math.max(this.ghostStruct, V.structure01));
    this.els.vImpact.textContent = `${Math.round(V.impact)} / ${V.impactMax}`;
    setBar(this.els.vImpactFill, V.impact01);
    this.els.vEnergy.textContent = `${Math.round(p.energy)}`;
    setBar(this.els.vEnergyFill, p.energy01);
    const segs = this.els.enSegs.children;
    const lit = Math.round(p.energy01 * segs.length);
    for (let i = 0; i < segs.length; i++) (segs[i] as HTMLElement).classList.toggle('on', i < lit);

    this.els.sState.textContent = p.state;
    this.els.sStreak.textContent = p.vanishStreak > 1 ? `VANISH ×${p.vanishStreak}` : '';

    this.updateHardpoints(p);
    this.drawRadar(p, hostiles, director);
    this.drawTargets(p, hostiles);

    // lock reticle
    const lockT = p.lock.primary;
    const ret = this.els.reticle;
    if (lockT && lockT.alive) {
      const q = lockT.pos.clone().setY(lockT.pos.y + 9).project(camera);
      if (q.z < 1) {
        ret.style.opacity = '1';
        ret.style.left = `${(q.x * 0.5 + 0.5) * innerWidth}px`;
        ret.style.top = `${(-q.y * 0.5 + 0.5) * innerHeight}px`;
        ret.classList.toggle('second', p.lock.all.length > 1);
      } else ret.style.opacity = '0';
    } else ret.style.opacity = '0';

    // flash + vignettes
    if (this.flashT > 0) {
      this.flashT -= realDt * 1.35;
      const k = clamp01(this.flashT);
      this.els.flash.style.opacity = String(k);
      this.els.flash.style.transform = `translate(-50%,-50%) scale(${1 + (1 - k) * 0.13})`;
    }
    if (this.hitT > 0) { this.hitT -= realDt * 2.6; this.els.hitfx.style.opacity = String(clamp01(this.hitT) * 0.8); }
    this.els.slowfx.style.opacity = String(clamp01((1 - timeScale) * 1.15) * 0.95);
    this.els.padHint.classList.toggle('on', padActive);

    this.updateRally(rally);
  }

  private updateHardpoints(p: Player) {
    const set = (id: HardpointId, cd01: number, blocked: boolean) => {
      const e = this.hpEls.get(id);
      if (!e) return;
      e.cd.style.transform = `scaleX(${clamp01(cd01)})`;
      e.root.classList.toggle('blocked', blocked);
    };
    set('rifle', p.mods.momentumRailgun ? p.railgunCharge01 : 1, p.mods.momentumRailgun && !p.railgunReady);
    set('blade', p.bladeReady01, p.bladeReady01 < 1);
    set('missiles', p.rackReady01, p.mods.orbitingInterceptors);
    set('pile', p.pileReady01, p.altitude <= T.pileMinAltitude);
  }

  /**
   * The encirclement arc. The safe cone is drawn as a solid wedge because it is a promise:
   * keep every dot inside it and the Director hands out exactly one attack token.
   */
  private drawRadar(p: Player, hostiles: Hostile[], director: Director) {
    const c = this.rctx;
    const W = this.radar.width, H = this.radar.height;
    const cx = W / 2, cy = H - 26, R = 176;
    c.clearRect(0, 0, W, H);

    // front hemisphere
    c.strokeStyle = 'rgba(169,153,138,.22)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, R, Math.PI, 0); c.stroke();
    c.beginPath(); c.arc(cx, cy, R * 0.62, Math.PI, 0); c.stroke();

    // safe cone
    const half = rad(T.arcSafe / 2);
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, 'rgba(143,244,255,.22)');
    grad.addColorStop(1, 'rgba(143,244,255,.02)');
    c.fillStyle = grad;
    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, -Math.PI / 2 - half, -Math.PI / 2 + half); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(143,244,255,.4)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy - R); c.stroke();

    // flank threshold marks
    const flankHalf = rad(T.arcFlank / 2);
    c.strokeStyle = 'rgba(255,210,74,.35)';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + Math.sin(s * flankHalf) * R * 0.72, cy - Math.cos(s * flankHalf) * R * 0.72);
      c.lineTo(cx + Math.sin(s * flankHalf) * R, cy - Math.cos(s * flankHalf) * R);
      c.stroke();
    }

    const f = p.forward();
    for (const e of hostiles) {
      if (!e.alive) continue;
      const d = e.pos.clone().sub(p.pos);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.001) continue;
      d.divideScalar(dist);
      const ang = Math.atan2(d.x * f.z - d.z * f.x, d.x * f.x + d.z * f.z);
      const rr = R * clamp01(Math.max(0.18, Math.min(1, dist / 380)));
      const x = cx + Math.sin(ang) * rr, y = cy - Math.cos(ang) * rr;
      const behind = Math.abs(ang) > Math.PI / 2;
      c.fillStyle = e.hasAttackToken ? '#ffd24a' : behind ? '#ff5a5a' : '#8fdcea';
      c.beginPath(); c.arc(x, y, p.lock.all.includes(e) ? 8 : 6, 0, 7); c.fill();
      if (e.state === 'windup') {
        const k = 1 - clamp01(e.windupRemaining / Math.max(0.01, e.windupMax));
        c.strokeStyle = '#ffd24a'; c.lineWidth = 3;
        c.beginPath(); c.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); c.stroke();
      }
      if (e.vitals.isExposed) { c.strokeStyle = '#8ff4ff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 14, 0, 7); c.stroke(); }
    }

    // the pilot
    c.fillStyle = '#efe6da';
    c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx - 6, cy + 5); c.lineTo(cx + 6, cy + 5); c.closePath(); c.fill();

    const arc = director.arc;
    this.els.arcLine.textContent = `ARC ${pad(arc)}°`;
    this.els.arcLine.className = `mono ${arc > T.arcFlank ? 'bad' : arc > T.arcSafe ? 'warn' : ''}`;
    this.els.tokenLine.textContent = `TOKENS ${director.tokenCount} · SOURCE: ENCIRCLEMENT ARC`;
  }

  private drawTargets(p: Player, hostiles: Hostile[]) {
    let html = '';
    for (const e of hostiles) {
      if (!e.alive) continue;
      const locked = p.lock.all.includes(e);
      const st = e.vitals.staggered ? 'STAGGERED' : e.vitals.isExposed ? 'EXPOSED' : e.state === 'windup' ? 'WINDUP' : e.hasAttackToken ? 'ENGAGING' : 'CIRCLING';
      const stCls = st === 'WINDUP' ? 'windup' : st === 'STAGGERED' ? 'staggered' : st === 'EXPOSED' ? 'exposed' : '';
      const attack = e.currentAttack ? ` · ${e.currentAttack.toUpperCase()}` : '';
      html += `<div class="trow ${locked ? 'lock ' : ''}${e.hasAttackToken ? 'tok' : ''}">
        <div class="n"><span>${e.displayName}</span><span class="mono">${Math.round(e.pos.distanceTo(p.pos))}m</span></div>
        <div class="bar enemy-hp"><i style="transform:scaleX(${e.vitals.structure01})"></i></div>
        <div class="bar enemy-im"><i style="transform:scaleX(${e.vitals.impact01})"></i></div>
        <div class="st mono ${stCls}">${st}${attack}</div>
      </div>`;
    }
    this.els.targets.innerHTML = html;
  }

  private updateRally(rally: Rally) {
    const on = rally.active;
    this.els.rally.classList.toggle('on', on);
    if (!on) return;
    this.els.rallyKey.textContent = rally.key;
    this.els.rallyMode.textContent = rally.mode === 'REVERSE' ? 'REVERSE RALLY' : 'RALLY';
    this.els.rallyMode.className = rally.mode === 'REVERSE' ? 'reverse' : '';
    this.els.rallyCount.textContent = `EXCHANGE ${rally.exchange + 1} / ${T.rallyMax}`;
    this.els.rallyArc.setAttribute('stroke-dashoffset', String(276.4 * (1 - rally.progress01)));
    const pips = this.els.rallyPips.children;
    for (let i = 0; i < pips.length; i++) (pips[i] as HTMLElement).classList.toggle('on', i < rally.exchange);
  }
}

export { deg };
