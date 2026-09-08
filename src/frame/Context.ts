import * as THREE from 'three';
import { Effects } from '../fx/Effects';
import { AudioManager } from '../audio/Audio';
import { Director } from '../director/Director';
import { Hostile, PressureTarget, DamageSource } from './Types';
import { Ordnance } from './Ordnance';

/**
 * Everything a combat entity is allowed to reach. Keeps enemies, the player and the boss from
 * importing each other, and keeps the simulation free of globals.
 */
export interface CombatContext {
  scene: THREE.Scene;
  fx: Effects;
  audio: AudioManager;
  director: Director;
  ordnance: Ordnance;
  target: PressureTarget;
  hostiles: Hostile[];
  /** Simulation clock, already scaled by bullet time. */
  time: number;
  /** PREDATOR READ: telegraphs appear this many seconds earlier. 0 for every other build. */
  telegraphLead: number;
  /** Floor height under a world position. */
  groundAt(x: number, z: number): number;
  /** Push a position back inside the current volume. Returns true if it was clamped. */
  confine(pos: THREE.Vector3, margin?: number): boolean;
  shake(amount: number): void;
  /** One event stream, so HUD, scoring and upgrades all observe the same facts. */
  onHostileStagger(h: Hostile, by: DamageSource): void;
  onHostileDeath(h: Hostile): void;
  onHostileWindupStart(h: Hostile): void;
}
