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
  /**
   * How many seconds early THIS hostile's telegraph appears.
   *
   * PREDATOR READ applies globally; SENSOR BLOOM applies only to the frame you are holding a
   * lock on. Both answer through one function so a hostile never has to know which upgrade is
   * responsible — and so the two compose rather than fighting over one field.
   */
  leadFor(h: Hostile): number;
  /** PUNISH DOCTRINE moves both halves of the Exposed window. Read wherever Exposed is applied. */
  punish: { exposedMult: number; exposedDuration: number };
  /** Floor height under a world position. */
  groundAt(x: number, z: number): number;
  /** Push a position back inside the current volume. Returns true if it was clamped. */
  confine(pos: THREE.Vector3, margin?: number): boolean;
  /**
   * Is the straight line between two points clear of cover?
   *
   * Cover has always been solid geometry you can skate over; from v0.3 it also blocks a hard
   * lock, which is what gives GHOST LOCK something to be an answer to. The grace window is
   * short by default so ordinary fights are unaffected.
   */
  hasLineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean;
  shake(amount: number): void;
  /** One event stream, so HUD, scoring and upgrades all observe the same facts. */
  onHostileStagger(h: Hostile, by: DamageSource): void;
  onHostileDeath(h: Hostile): void;
  onHostileWindupStart(h: Hostile): void;
  /** SPLITTER came apart. Optional: nothing is required to care. */
  onHostileSplit?(h: Hostile): void;
  /**
   * BLIND ANGLE. False for 1.2s after a Perfect Vanish: hostiles may not OPEN an attack against
   * a pilot nothing in the arena can currently find. Damage is untouched — this suspends
   * targeting, which is why it is a condition rather than an invulnerability window.
   */
  targetable(): boolean;
}
