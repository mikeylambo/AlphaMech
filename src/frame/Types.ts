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
export type DamageSource = 'rifle' | 'blade' | 'missile' | 'pile' | 'rally' | 'upgrade' | 'environment' | 'clone';

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
}
