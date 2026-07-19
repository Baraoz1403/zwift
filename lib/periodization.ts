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

export type TrainingPhase = "Base" | "Build" | "Recovery" | "Taper" | "RaceWeek";

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
  /** Whole weeks from this plan's Monday to the rider's target event date,
   *  if one is set (0 = event falls inside this week, negative = already
   *  past). Always computed here, never left for the AI to work out from
   *  raw dates - the same category of bug fixed for per-workout dates (see
   *  ensureWorkoutDates in weekly-plan.tsx): date arithmetic done by the
   *  model is unreliable, so it's done once, deterministically, in code. */
  weeksToEvent: number | null;
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

/**
 * Plain mesocycle-position phase, with no knowledge of a target event -
 * used by display-only call sites (the dashboard's phase label, the profile
 * card) that don't have a weekOf/eventDate on hand. The authoritative path
 * used to actually generate a plan is resolvePhase() below, which can
 * override this with Taper/RaceWeek when an event is close.
 */
export function getPhaseForWeekIndex(weekIndex: number): PhaseInfo {
  const weekInMesocycle = (weekIndex % MESOCYCLE_LENGTH) + 1; // 1..4
  const isRecoveryWeek = weekInMesocycle === MESOCYCLE_LENGTH;
  const phase: TrainingPhase = isRecoveryWeek ? "Recovery" : weekIndex < MESOCYCLE_LENGTH ? "Base" : "Build";
  return { phase, weekInMesocycle, weeksToEvent: null };
}

/**
 * Authoritative phase resolution for actually generating a plan - same
 * mesocycle-position logic as getPhaseForWeekIndex, but overridden by an
 * event-driven Taper/RaceWeek when the rider has a target event date coming
 * up soon. Previously a target event was only handled as a loose prompt
 * instruction ("if eventDate is within 4 weeks, shift toward a taper") with
 * no real phase, no defined taper length, and the AI computing "how close"
 * itself from raw dates - the same unreliable-LLM-date-math problem already
 * fixed elsewhere (see ensureWorkoutDates). Here weeksToEvent is computed
 * once, deterministically, and used to select a real phase:
 *   - event this week or next (0-1 weeks out) -> "RaceWeek": minimal volume,
 *     short activation work only, no new training stress.
 *   - event 2-3 weeks out -> "Taper": progressively reduced volume while
 *     retaining some race-pace intensity (per standard taper practice -
 *     losing fitness during a taper is far less risky than blunting form
 *     with lingering fatigue).
 *   - otherwise -> normal Base/Build/Recovery mesocycle rotation, unaffected.
 * An event date in the past (weeksToEvent < 0) is treated as if there were
 * no event at all - nothing to taper toward anymore.
 */
export function resolvePhase(
  weekIndex: number,
  weekOf: string,
  eventDateIso?: string | null
): PhaseInfo {
  const base = getPhaseForWeekIndex(weekIndex);

  if (!eventDateIso) return base;

  const weekOfMs = new Date(weekOf + "T00:00:00Z").getTime();
  const eventMs = new Date(eventDateIso + "T00:00:00Z").getTime();
  if (Number.isNaN(weekOfMs) || Number.isNaN(eventMs)) return base;

  const weeksToEvent = Math.round((eventMs - weekOfMs) / (7 * 24 * 60 * 60 * 1000));

  if (weeksToEvent < 0) return { ...base, weeksToEvent: null }; // event already passed - ignore it
  if (weeksToEvent <= 1) return { phase: "RaceWeek", weekInMesocycle: base.weekInMesocycle, weeksToEvent };
  if (weeksToEvent <= 3) return { phase: "Taper", weekInMesocycle: base.weekInMesocycle, weeksToEvent };
  return { ...base, weeksToEvent };
}

/**
 * Advances (or holds) the macro-cycle pointer for a newly requested plan.
 * Regenerating the *same* week (weekOf unchanged) does not advance the
 * cycle - only a genuinely new week does, so re-rolling this week's plan a
 * few times doesn't fast-forward the rider through their own mesocycle.
 */
export function advanceMacroCycle(prev: MacroCycleState | null, weekOf: string): MacroCycleState {
  if (!prev) return { weekIndex: 0, lastWeekOf: weekOf };
  // Same week: never advance - prevents weekIndex drift from multiple generates
  if (prev.lastWeekOf === weekOf) return prev;
  // Only advance if new week is genuinely AFTER last week (7+ days)
  const prevMs = new Date(prev.lastWeekOf + "T00:00:00Z").getTime();
  const newMs = new Date(weekOf + "T00:00:00Z").getTime();
  const daysDiff = (newMs - prevMs) / (1000 * 60 * 60 * 24);
  if (daysDiff < 6) return prev; // not a new week - don't advance
  return { weekIndex: prev.weekIndex + 1, lastWeekOf: weekOf };
}
