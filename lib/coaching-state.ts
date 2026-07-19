/**
 * lib/coaching-state.ts
 *
 * Persistent coaching state stored in KV, keyed per athlete.
 * Tracks which stimulus families have been used recently, the current
 * progression step per family, and what the next recommended action is.
 *
 * This is the "memory" that makes the planning system an adaptive coach
 * instead of a stateless weekly-plan generator. Without it, every week
 * starts from scratch and the AI has no way to build on what came before.
 *
 * Key: zwift:{athleteId}:coaching_state
 * TTL: 60 days (auto-cleanup for inactive athletes)
 */

import { kvGet, kvSet, kvAvailable } from "./kv";
import type { WeeklyWorkout } from "./ai";
import type { AdherenceSummary } from "./adherence";

// ── Stimulus families ─────────────────────────────────────────────────────────

export type StimulusFamily =
  | "endurance"
  | "tempo"
  | "sweetSpot"
  | "threshold"
  | "vo2max"
  | "neuromuscular"
  | "anaerobic";

/** Maps every named workout title to its stimulus family. */
export const WORKOUT_TO_FAMILY: Record<string, StimulusFamily> = {
  // Endurance (structured Z2)
  "Z2 with Cadence Drills":      "endurance",
  "Surge Ride":                   "endurance",
  "Endurance with Muscle Tension":"endurance",
  "Endurance Openers":            "endurance",
  // Tempo
  "Tempo Cruise":                 "tempo",
  "Tempo Ladder":                 "tempo",
  "Sub-Threshold Blocks":         "tempo",
  "Strength Endurance":           "tempo",
  // Sweet Spot
  "Sweet Spot Primer":            "sweetSpot",
  "Sweet Spot Classic":           "sweetSpot",
  "3×15 Sweet Spot":              "sweetSpot",
  "Extended Sweet Spot":          "sweetSpot",
  "Sweet Spot Progression":       "sweetSpot",
  "Sweet Spot Time Trial":        "sweetSpot",
  "Low-Cadence Sweet Spot":       "sweetSpot",
  // Threshold
  "Short Threshold Intervals":    "threshold",
  "Threshold Development":        "threshold",
  "Threshold Cruise Intervals":   "threshold",
  "Critical Power Development":   "threshold",
  "Threshold Pyramid":            "threshold",
  "2×20 FTP Blocks":              "threshold",
  "Descending Threshold":         "threshold",
  "Over-Under Intervals":         "threshold",
  "FTP Test Protocol":            "threshold",
  // VO2max
  "Micro Intervals":              "vo2max",
  "VO2max Pyramid":               "vo2max",
  "60/60 Intervals":              "vo2max",
  "4×4 Two-Set":                  "vo2max",
  "Norwegian 4×4":                "vo2max",
  "3-Minute VO2max Repeats":      "vo2max",
  "5×5 VO2max":                   "vo2max",
  "Seiler 4×8":                   "vo2max",
  // Neuromuscular
  "Sprint Builder":               "neuromuscular",
  "Spin-Up Sprints":              "neuromuscular",
  "Anaerobic Bursts":             "anaerobic",
  "Race Day Opener":              "neuromuscular",
  // Anaerobic / Intermittent
  "15/15 Micro-Intervals":        "anaerobic",
  "30/30 Blitz":                  "anaerobic",
  "Tabata Protocol":              "anaerobic",
  "40/20 HIIT":                   "anaerobic",
  "40/20 Ronnestad":              "anaerobic",
};

/**
 * Progression order within each stimulus family.
 * Earlier entries = easier/more accessible. The engine uses this
 * to determine "advance" (move right) or "regress" (move left).
 */
export const FAMILY_PROGRESSION: Record<StimulusFamily, string[]> = {
  endurance: [
    "Surge Ride",
    "Z2 with Cadence Drills",
    "Endurance with Muscle Tension",
    "Endurance Openers",
  ],
  tempo: [
    "Tempo Cruise",
    "Tempo Ladder",
    "Strength Endurance",
    "Sub-Threshold Blocks",
  ],
  sweetSpot: [
    "Sweet Spot Primer",
    "Sweet Spot Classic",
    "3×15 Sweet Spot",
    "Low-Cadence Sweet Spot",
    "Extended Sweet Spot",
    "Sweet Spot Progression",
    "Sweet Spot Time Trial",
  ],
  threshold: [
    "Short Threshold Intervals",
    "Threshold Development",
    "Threshold Cruise Intervals",
    "Threshold Pyramid",
    "Over-Under Intervals",
    "2×20 FTP Blocks",
    "Descending Threshold",
    "Critical Power Development",
  ],
  vo2max: [
    "VO2max Pyramid",
    "Micro Intervals",
    "60/60 Intervals",
    "4×4 Two-Set",
    "Norwegian 4×4",
    "3-Minute VO2max Repeats",
    "5×5 VO2max",
    "Seiler 4×8",
  ],
  neuromuscular: [
    "Sprint Builder",
    "Spin-Up Sprints",
    "Anaerobic Bursts",
    "Race Day Opener",
  ],
  anaerobic: [
    "15/15 Micro-Intervals",
    "30/30 Blitz",
    "40/20 HIIT",
    "40/20 Ronnestad",
    "Tabata Protocol",
  ],
};

// ── State schema ──────────────────────────────────────────────────────────────

export interface RecentStructuredSession {
  workoutTitle: string;
  stimulusFamily: StimulusFamily;
  /** YYYY-MM-DD */
  date: string;
  /** Whether the rider actually completed it (from adherence comparison). */
  result: "completed" | "partial" | "skipped" | "unknown";
}

export interface StimulusExposure {
  endurance:    number;
  tempo:        number;
  sweetSpot:    number;
  threshold:    number;
  vo2max:       number;
  neuromuscular:number;
  anaerobic:    number;
}

export interface CoachingState {
  athleteId: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
  /** Current periodization phase at last update. */
  currentPhase: string;
  /**
   * Structured sessions from the last 30 days.
   * Includes both planned+completed and planned+skipped entries.
   */
  recentSessions: RecentStructuredSession[];
  /**
   * Last completed workout title per stimulus family.
   * Used to determine the current progression position.
   */
  lastCompletedByFamily: Partial<Record<StimulusFamily, string>>;
  /**
   * Session counts per family in the last 21 days (completed sessions only).
   * Re-derived from recentSessions on each update.
   */
  exposureLast21Days: StimulusExposure;
  /**
   * The stimulus family the selection engine recommends prioritizing next week.
   * Written by the engine and read by the next generation call.
   */
  priorityFamilyNext: StimulusFamily | null;
  /** Human-readable explanation of the priority decision. */
  priorityReason: string | null;
  /** One-line summary of what last week's plan was trying to accomplish. */
  previousWeeklyObjective: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COACHING_STATE_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days

function emptyExposure(): StimulusExposure {
  return {
    endurance: 0, tempo: 0, sweetSpot: 0,
    threshold: 0, vo2max: 0, neuromuscular: 0, anaerobic: 0,
  };
}

/** Re-derives exposure counts from recentSessions, considering only the last 21 days. */
function computeExposure(sessions: RecentStructuredSession[]): StimulusExposure {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 21);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const exposure = emptyExposure();
  for (const s of sessions) {
    if (s.date < cutoffStr) continue;
    if (s.result !== "completed" && s.result !== "partial") continue;
    exposure[s.stimulusFamily] = (exposure[s.stimulusFamily] ?? 0) + 1;
  }
  return exposure;
}

/** Prunes sessions older than 30 days. */
function pruneOldSessions(sessions: RecentStructuredSession[]): RecentStructuredSession[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return sessions.filter(s => s.date >= cutoffStr);
}

// ── KV operations ─────────────────────────────────────────────────────────────

/** Loads the coaching state for an athlete. Returns null when not found. */
export async function getCoachingState(athleteId: string): Promise<CoachingState | null> {
  if (!kvAvailable() || !athleteId) return null;
  try {
    const raw = await kvGet(`zwift:${athleteId}:coaching_state`);
    if (!raw) return null;
    return JSON.parse(raw) as CoachingState;
  } catch {
    return null;
  }
}

/** Saves the coaching state. Best-effort — never throws. */
export async function saveCoachingState(state: CoachingState): Promise<void> {
  if (!kvAvailable() || !state.athleteId) return;
  try {
    await kvSet(
      `zwift:${state.athleteId}:coaching_state`,
      JSON.stringify(state),
      COACHING_STATE_TTL_SECONDS,
    );
  } catch {
    // best-effort — never block the generation flow
  }
}

/**
 * Updates the coaching state after a plan has been generated.
 *
 * This is the primary write path. It:
 * 1. Adds all non-rest sessions from the generated plan as "unknown" entries
 *    (completion unknown until the rider actually rides them).
 * 2. If adherence data for the PREVIOUS week is provided, marks sessions
 *    from that week as completed or skipped based on what the rider did.
 * 3. Prunes sessions older than 30 days.
 * 4. Recomputes 21-day exposure counts.
 * 5. Updates lastCompletedByFamily from completed sessions.
 *
 * @param existing   Previously stored state (null = first generation ever).
 * @param athleteId  Athlete ID.
 * @param generatedWorkouts  The workouts just output by the AI.
 * @param currentPhase       The phase used for this generation.
 * @param adherence  Adherence for the PREVIOUS week (not this one — this
 *                   week's rides haven't happened yet).
 * @param weeklyObjective    One-line description of what this week aims to do.
 * @param priorityFamily     The family the selection engine flagged as priority.
 * @param priorityReason     Reason for the priority decision.
 */
export function buildUpdatedCoachingState(
  existing: CoachingState | null,
  athleteId: string,
  generatedWorkouts: WeeklyWorkout[],
  currentPhase: string,
  adherence: AdherenceSummary | undefined,
  weeklyObjective: string,
  priorityFamily: StimulusFamily | null,
  priorityReason: string | null,
): CoachingState {
  const base: CoachingState = existing ?? {
    athleteId,
    updatedAt: new Date().toISOString(),
    currentPhase,
    recentSessions: [],
    lastCompletedByFamily: {},
    exposureLast21Days: emptyExposure(),
    priorityFamilyNext: null,
    priorityReason: null,
    previousWeeklyObjective: null,
  };

  // Start from existing sessions, cloned.
  let sessions: RecentStructuredSession[] = [...(base.recentSessions ?? [])];

  // If adherence data covers the previous week, mark those sessions.
  // adherence.notes contains entries like "Sweet Spot Classic — not completed"
  // We match by workout title where possible.
  if (adherence) {
    const missedTitles = new Set<string>(
      (adherence.notes ?? [])
        .filter(n => n.toLowerCase().includes("not completed") || n.toLowerCase().includes("skipped"))
        .map(n => {
          const m = n.match(/^([^—]+)/);
          return m ? m[1].trim() : "";
        })
        .filter(Boolean)
    );

    // Update result for existing "unknown" entries whose dates are in the
    // previous week.
    sessions = sessions.map(s => {
      if (s.result !== "unknown") return s;
      const title = s.workoutTitle;
      if (missedTitles.has(title)) return { ...s, result: "skipped" as const };
      // If this week was in the plan and adherence says completedSessions > 0,
      // tentatively mark it completed. (Heuristic — best we can do without
      // per-session timestamps from Zwift.)
      if (adherence.completedSessions > 0) return { ...s, result: "completed" as const };
      return s;
    });
  }

  // Time-based auto-advance: sessions planned 7+ days ago that are still
  // "unknown" (no FIT file match ever confirmed them) are promoted to
  // "partial". This prevents the progression ladder from freezing indefinitely
  // when a rider cross-trains, runs, or uses a different device that doesn't
  // produce a Zwift FIT file. Without this, the system stays at the same rung
  // forever and prescribes the same workout every week.
  // "partial" counts toward exposure and lastCompleted, so the ladder advances
  // — but it's distinguishable from a genuine "completed" confirmation.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
  sessions = sessions.map(s => {
    if (s.result !== "unknown") return s;
    if (s.date < sevenDaysAgoStr) return { ...s, result: "partial" as const };
    return s;
  });

  // Add sessions from the newly generated plan.
  const today = new Date().toISOString().slice(0, 10);
  for (const w of generatedWorkouts) {
    if (!w.title || w.type === "Rest" || w.type?.toLowerCase().includes("rest")) continue;
    const family = WORKOUT_TO_FAMILY[w.title];
    if (!family) continue;
    const date = w.date ?? today;
    // Don't add duplicates for the same date+title.
    if (sessions.some(s => s.date === date && s.workoutTitle === w.title)) continue;
    sessions.push({ workoutTitle: w.title, stimulusFamily: family, date, result: "unknown" });
  }

  // Prune old sessions.
  sessions = pruneOldSessions(sessions);

  // Recompute 21-day exposure.
  const exposure = computeExposure(sessions);

  // Recompute lastCompletedByFamily from completed sessions (descending by date).
  const completed = sessions
    .filter(s => s.result === "completed" || s.result === "partial")
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastCompleted: Partial<Record<StimulusFamily, string>> = {};
  for (const s of completed) {
    if (!lastCompleted[s.stimulusFamily]) {
      lastCompleted[s.stimulusFamily] = s.workoutTitle;
    }
  }

  return {
    athleteId,
    updatedAt: new Date().toISOString(),
    currentPhase,
    recentSessions: sessions,
    lastCompletedByFamily: lastCompleted,
    exposureLast21Days: exposure,
    priorityFamilyNext: priorityFamily,
    priorityReason,
    previousWeeklyObjective: weeklyObjective,
  };
}
