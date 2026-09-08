import { Enemy } from './Enemy';

/**
 * What the HUD needs from a boss, and nothing else.
 *
 * There are four bosses at v0.3 and eight at 1.0, in three classes, and none of them shares a
 * damage gate with any other: SEVERANCE has phases, GRAVEMARK has a screen, CHORUS has a
 * harmony, KILNWORKS has feed arms. Rather than the boss bar growing an `instanceof` per boss,
 * each boss answers two questions about itself — what it is called, and what the fight is
 * currently about — and the HUD renders the answers.
 */
export interface BossFrame extends Enemy {
  /** 0..1 of the pool the bar should show. Not always this frame's own Vitals. */
  readonly structure01: number;
  readonly phase: number;
  /** Display name. */
  readonly bossName: string;
  /**
   * One line describing the state of the fight's actual mechanic — the thing a player has to
   * read to win, in the boss's own vocabulary.
   */
  hudLine(): string;
  /** True when the boss's damage gate is currently CLOSED, so the bar can read as refused. */
  readonly gated: boolean;
  snapshotBoss(): Record<string, unknown>;
}
