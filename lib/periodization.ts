/**
 * Multi-week periodization memory - Layer 3 of the training-knowledge
 * infrastructure. Previously each weekly plan was generated in total
 * isolation: the AI had no idea whether a recovery week was overdue, or
 * where "this week" sits in a longer training arc. This gives the app a
 * small piece of persistent state (the rider's own browser, alongside the
 * cached plan itself - this app still has no database) tracking position
 * in a recurring mesocycle, so the AI is told the answer instead of
 * starting from zero every time.
 *
 * Phases are deliberately simple for now: Base (the first mesocycle, while
 * there's limited history to build progression from), Build (progressive
 * overload in subsequent mesocycles), and Recovery (a mandatory lighter
 * week placed every 4th week, per docs/training-knowledge/periodization.md
 * - "a recovery week roughly every 3-4 weeks is standard"). A race-specific
 * "Peak" phase is intentionally left out until the app has a target-event
 * date to peak towards - there's nothing to peak for yet.
 */
const MESOCYCLE_LENGTH = 4; // weeks; the last week of each mesocycle is Recovery

export type TrainingPhase = "Base" | "Build" | "Recovery";

export interface MacroCycleState {
  /** 0-based count of weeks generated so far in this rider's cycle. */
  weekIndex: number;
  /** weekOf of the most recently generated plan - lets advanceMacroCycle
   *  tell "a new week" apart from "regenerated the same week again". */
  lastWeekOf: string;
}

export interface PhaseInfo {
  phase: TrainingPhase;
  /** 1-based position within the current MESOCYCLE_LENGTH-week mesocycle. */
  weekInMesocycle: number;
}

/** Monday (UTC) of the calendar week containing `d` - the same "weekOf"
 *  used to key the cached plan and to fill in each workout's date. The
 *  single source of truth for this calc - lib/ai.ts imports it rather than
 *  computing its own copy, so the two never drift apart. */
export function mondayOfCurrentWeek(d: Date = new Date()): string {
  const dow = d.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

export function getPhaseForWeekIndex(weekIndex: number): PhaseInfo {
  const weekInMesocycle = (weekIndex % MESOCYCLE_LENGTH) + 1; // 1..4
  const isRecoveryWeek = weekInMesocycle === MESOCYCLE_LENGTH;
  const phase: TrainingPhase = isRecoveryWeek ? "Recovery" : weekIndex < MESOCYCLE_LENGTH ? "Base" : "Build";
  return { phase, weekInMesocycle };
}

/**
 * Advances (or holds) the macro-cycle pointer for a newly requested plan.
 * Regenerating the *same* week (weekOf unchanged) does not advance the
 * cycle - only a genuinely new week does, so re-rolling this week's plan a
 * few times doesn't fast-forward the rider through their own mesocycle.
 */
export function advanceMacroCycle(prev: MacroCycleState | null, weekOf: string): MacroCycleState {
  if (!prev) return { weekIndex: 0, lastWeekOf: weekOf };
  if (prev.lastWeekOf === weekOf) return prev;
  return { weekIndex: prev.weekIndex + 1, lastWeekOf: weekOf };
}
