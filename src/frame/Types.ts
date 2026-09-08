import * as THREE from 'three';
import { Vitals } from './Vitals';

/** What the Director, the vanish system and the HUD need from anything hostile. */
export interface Hostile {
  readonly id: number;
  readonly archetype: string;
  readonly displayName: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  vitals: Vitals;
  /** Preferred engagement distance band, metres. */
  band: readonly [number, number];
  /** Director state — only Director.ts writes these. */
  hasAttackToken: boolean;
  tokenCooldown: number;
  /** Attack lifecycle. */
  state: HostileState;
  currentAttack: string | null;
  windupRemaining: number;
  windupMax: number;
  targetId: number;
  alive: boolean;
  /** True when this hostile is mid-windup and can therefore be Perfect Vanished. */
  readonly vanishable: boolean;
  cancelAttack(): void;
  releaseToken(): void;
  /** Hostile-facing damage entry point so upgrades and weapons share one path. */
  applyHit(damage: number, impact: number, source: DamageSource): void;
}

export type HostileState = 'approach' | 'orbit' | 'windup' | 'strike' | 'recover' | 'evade' | 'staggered' | 'dead';
/**
 * `breach` and `phase` are their own sources rather than flavours of `blade`/`pile` because
 * armour plates test the source directly: BREACH DRIVER destroys a plate, PHASE BLADE ignores
 * one. A plate that could be out-damaged by any weapon would not be a plate.
 */
export type DamageSource = 'rifle' | 'blade' | 'missile' | 'pile' | 'rally' | 'upgrade' | 'environment' | 'clone' | 'breach' | 'phase' | 'contrail';

/** What a hostile needs to know about the thing it is pressuring. Kept minimal so the Director
 *  can pressure a static objective instead of the player (GDD §17). */
export interface PressureTarget {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  vitals: Vitals;
  yaw: number;
  forward(): THREE.Vector3;
  /** Hostiles call this to deal damage; the player implements mitigation and upgrade hooks. */
  receiveHit(damage: number, impact: number, from: Hostile | null, attack: string): void;
  /**
   * HOOK's harpoon. The only channel through which a hostile may move the pilot, kept on the
   * interface so it is one auditable entry point rather than enemies writing `player.pos`.
   */
  applyPull(dir: THREE.Vector3, distance: number): void;
}
