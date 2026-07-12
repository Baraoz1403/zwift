/**
 * lib/workout-selector.ts
 *
 * Deterministic, code-driven selection of WHICH named workouts land on which
 * days of a Base/Build/Recovery week - separated from writing about them.
 *
 * Before this existed, the AI was asked to both SELECT sessions (which
 * categories, how many, what week-over-week progression) AND write
 * descriptions in the same call. Despite explicit prompt rules ("IRON LAW:
 * 2+ structured intensity sessions"), plans kept coming back flat
 * (Foundation Ride + Easy Run + Spin & Recover, no real intensity) because
 * session SELECTION is a rules problem, not a language-generation problem -
 * an LLM asked to simultaneously juggle W/kg gating, TSB, mesocycle
 * progression, and week-over-week variety, on every single call, drifts.
 * This module makes selection a fixed function of
 * {phase, weekInMesocycle, daysPerWeek, wPerKg, tsb}. The AI's only
 * remaining job (see generateWeeklyPlan in lib/ai.ts) is writing the
 * personal, data-grounded description for each pre-chosen session - which
 * is what LLMs are actually good at, and where all the variance in a real
 * plan SHOULD live.
 *
 * Progression table (2 mesocycles = 8 weeks, matching MESOCYCLE_LENGTH=4 in
 * lib/periodization.ts - weekInMesocycle 4 is always Recovery regardless of
 * which mesocycle):
 *   Base week 1:  Sweet Spot 2x8 min @ 90%  + Foundation Ride 60 + Sprint Builder
 *   Base week 2:  Sweet Spot 2x10 min @ 90% + Foundation Ride 60 + Sprint Builder
 *   Base week 3:  Sweet Spot 3x8 min @ 91%  + Foundation Ride 75 + Sprint Builder
 *   Recovery:     Spin & Recover + Foundation Ride (the only week Foundation is primary)
 *   Build week 1: Threshold 3x6 min @ 97%  + Sweet Spot Classic + Foundation Ride
 *   Build week 2: Threshold 3x8 min @ 97%  + Sweet Spot Classic + Foundation Ride
 *   Build week 3: Threshold 2x12 min @ 97% + Micro Intervals 16x30/30 + Foundation Ride
 *
 * Two safety gates run AFTER the table lookup, before the week is finalized:
 *   1. W/kg gate: a rider below 2.5 W/kg (beginner, per
 *      RIDER_LEVEL_THRESHOLDS in lib/coaching-knowledge.ts) cannot yet
 *      handle true Threshold/VO2max work - those sessions get replaced with
 *      their SESSION_PREREQUISITES fallback. 2.5-3.0 W/kg (novice) is capped
 *      the same way as a deliberate simplification: the full "late-Build +
 *      good-TSB" carve-out documented in lib/ai.ts's prompt isn't modeled
 *      here, so novices are held to Sweet-Spot-or-under until they cross
 *      3.0 W/kg. This errs safe, not precise.
 *   2. TSB gate: TSB < -20 replaces the single HARDEST session in the week
 *      with its SESSION_PREREQUISITES fallback - a tired rider gets one
 *      easier week, not a wholesale rewrite.
 *
 * Scope: this drives selection for the standard Base/Build/Recovery
 * rotation - the week-to-week case that was actually going flat. Taper,
 * RaceWeek, and a rider-note-driven surgical day edit keep going through the
 * existing AI-driven path in lib/ai.ts, which already has dedicated, working
 * logic for those (event-driven volume cuts, exact-day overrides) that this
 * fixed weekly table doesn't model - see generateWeeklyPlan's call site for
 * the exact condition that decides which path a given plan takes.
 */

import type { WorkoutStructureBlock } from "./zwo";
import { SESSION_PREREQUISITES, RIDER_LEVEL_THRESHOLDS, WORKOUT_LIBRARY, resolveCanonicalStructure } from "./coaching-knowledge";

export type SelectorPhase = "Base" | "Build" | "Recovery";

export interface SelectorInput {
  phase: SelectorPhase;
  /** 1-based position within the 4-week mesocycle - 4 is always Recovery. */
  weekInMesocycle: 1 | 2 | 3 | 4;
  /** Rider's target session count this week (from riderProfile.daysPerWeek
   *  or a ridesLast7Days-based estimate - same source lib/ai.ts's prompt
   *  already used for this before selection moved to code). */
  daysPerWeek: number;
  /** FTP / body weight in kg. Null if unknown - the W/kg gate no-ops. */
  wPerKg: number | null;
  /** Training Stress Balance. Null if unknown - the TSB gate no-ops. */
  tsb: number | null;
}

export interface SelectedWorkout {
  /** e.g. "Sweet Spot", "Threshold", "VO2max", "Neuromuscular", "Foundation", "Recovery" */
  category: string;
  /** Exact title the AI must use verbatim - see generateWeeklyPlan's merge step. */
  title: string;
  durationMin: number;
  targetPowerPctFtp: string;
  structure: WorkoutStructureBlock[];
}

export interface SelectedDay {
  day: string;
  /** null = Rest day */
  workout: SelectedWorkout | null;
}

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ─── Structure builders ──────────────────────────────────────────────────
// Literal, hand-specified blocks - mirrors the style of
// CANONICAL_WORKOUT_STRUCTURES in lib/coaching-knowledge.ts. Titles that
// exactly match an existing canonical library entry (Sprint Builder, Spin &
// Recover, Foundation Ride at 60 min, Sweet Spot Classic) are deliberately
// reused so normalizeWeeklyPlan's canonical-injection step in lib/ai.ts uses
// the library's own precise blocks; titles for the custom rep-schemes this
// progression table needs (e.g. "Sweet Spot 2×8", not a library entry) are
// unique on purpose so that same injection step leaves them untouched.

function zone2(durationMin: number): WorkoutStructureBlock[] {
  const warm = Math.max(8, Math.round(durationMin * 0.16));
  const cool = Math.max(8, Math.round(durationMin * 0.13));
  const steady = durationMin - warm - cool;
  return [
    { type: "warmup", durationMin: warm, powerFtp: 0.65, label: "Easy warm-up" },
    { type: "steadystate", durationMin: steady, powerFtp: 0.69, label: "Z2 @ 65-73% FTP" },
    { type: "cooldown", durationMin: cool, powerFtp: 0.55, label: "Easy cool-down" },
  ];
}

function foundationRide(durationMin = 60): SelectedWorkout {
  return {
    category: "Foundation",
    title: "Foundation Ride",
    durationMin,
    targetPowerPctFtp: "65-73%",
    structure: zone2(durationMin),
  };
}

function sweetSpot2x8(): SelectedWorkout {
  return {
    category: "Sweet Spot",
    title: "Sweet Spot 2×8",
    durationMin: 50,
    targetPowerPctFtp: "88-92%",
    structure: [
      { type: "warmup", durationMin: 14, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 24, powerFtp: 0.90, recoveryPowerFtp: 0.50,
        repeats: 2, onSec: 480, offSec: 240, label: "2×8 min @ 90% FTP" },
      { type: "cooldown", durationMin: 12, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

function sweetSpot2x10(): SelectedWorkout {
  return {
    category: "Sweet Spot",
    title: "Sweet Spot 2×10",
    durationMin: 55,
    targetPowerPctFtp: "88-92%",
    structure: [
      { type: "warmup", durationMin: 14, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 28, powerFtp: 0.90, recoveryPowerFtp: 0.50,
        repeats: 2, onSec: 600, offSec: 240, label: "2×10 min @ 90% FTP" },
      { type: "cooldown", durationMin: 13, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

function sweetSpot3x8(): SelectedWorkout {
  return {
    category: "Sweet Spot",
    title: "Sweet Spot 3×8",
    durationMin: 60,
    targetPowerPctFtp: "89-93%",
    structure: [
      { type: "warmup", durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 36, powerFtp: 0.91, recoveryPowerFtp: 0.50,
        repeats: 3, onSec: 480, offSec: 240, label: "3×8 min @ 91% FTP" },
      { type: "cooldown", durationMin: 12, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

function sweetSpotClassic(): SelectedWorkout {
  return {
    category: "Sweet Spot",
    title: "Sweet Spot Classic",
    durationMin: 60,
    targetPowerPctFtp: "88-93%",
    structure: [
      { type: "warmup", durationMin: 10, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 42, powerFtp: 0.90, recoveryPowerFtp: 0.50,
        repeats: 3, onSec: 600, offSec: 240, label: "3×10 min @ 90% FTP" },
      { type: "cooldown", durationMin: 8, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

function threshold3x6(): SelectedWorkout {
  return {
    category: "Threshold",
    title: "Threshold 3×6",
    durationMin: 50,
    targetPowerPctFtp: "95-98%",
    structure: [
      { type: "warmup", durationMin: 12, powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 27, powerFtp: 0.97, recoveryPowerFtp: 0.52,
        repeats: 3, onSec: 360, offSec: 180, label: "3×6 min @ 97% FTP" },
      { type: "cooldown", durationMin: 11, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

function threshold3x8(): SelectedWorkout {
  return {
    category: "Threshold",
    title: "Threshold 3×8",
    durationMin: 56,
    targetPowerPctFtp: "95-98%",
    structure: [
      { type: "warmup", durationMin: 12, powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 33, powerFtp: 0.97, recoveryPowerFtp: 0.52,
        repeats: 3, onSec: 480, offSec: 180, label: "3×8 min @ 97% FTP" },
      { type: "cooldown", durationMin: 11, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

function threshold2x12(): SelectedWorkout {
  return {
    category: "Threshold",
    title: "Threshold 2×12",
    durationMin: 55,
    targetPowerPctFtp: "96-99%",
    structure: [
      { type: "warmup", durationMin: 12, powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 32, powerFtp: 0.97, recoveryPowerFtp: 0.52,
        repeats: 2, onSec: 720, offSec: 240, label: "2×12 min @ 97% FTP" },
      { type: "cooldown", durationMin: 11, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

function microIntervals16x3030(): SelectedWorkout {
  return {
    category: "VO2max",
    title: "Micro Intervals 16×30/30",
    durationMin: 45,
    targetPowerPctFtp: "115-120%",
    structure: [
      { type: "warmup", durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 16, powerFtp: 1.18, recoveryPowerFtp: 0.55,
        repeats: 16, onSec: 30, offSec: 30, label: "16×30s @ 118% FTP / 30s @ 55% FTP" },
      { type: "cooldown", durationMin: 17, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

function sprintBuilder(): SelectedWorkout {
  return {
    category: "Neuromuscular",
    title: "Sprint Builder",
    durationMin: 50,
    targetPowerPctFtp: "Z1-Z2 with all-out sprints",
    structure: [
      { type: "warmup", durationMin: 15, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 22, powerFtp: 1.50, recoveryPowerFtp: 0.52,
        repeats: 8, onSec: 15, offSec: 150, label: "8×15 s all-out sprints (last sprint near-equal to first in peak power)" },
      { type: "cooldown", durationMin: 13, powerFtp: 0.52, label: "Z2 flush cool-down" },
    ],
  };
}

function spinAndRecover(): SelectedWorkout {
  return {
    category: "Recovery",
    title: "Spin & Recover",
    durationMin: 30,
    targetPowerPctFtp: "50-60%",
    structure: [
      { type: "warmup", durationMin: 3, powerFtp: 0.55, label: "Easy spin in" },
      { type: "steadystate", durationMin: 24, powerFtp: 0.55, label: "Z1 active recovery @ 50-60% FTP, 90+ rpm" },
      { type: "cooldown", durationMin: 3, powerFtp: 0.50, label: "Easy spin out" },
    ],
  };
}

/** Maps a library fallback name to the Title-Case category strings this
 *  module's own gates (isGated/sessionPrereqKey) check against.
 *  WORKOUT_LIBRARY's own `category` field uses lowercase single-word values
 *  ("endurance", "sweetspot") for a different purpose (the AI prompt) - this
 *  keeps the two vocabularies from silently drifting apart, which would
 *  otherwise make a downgraded session invisible to a second gate pass
 *  (e.g. TSB gate running after the W/kg gate already downgraded a session). */
const FALLBACK_CATEGORY: Record<string, string> = {
  "Sweet Spot Classic": "Sweet Spot",
  "Tempo Cruise": "Tempo",
  "Sprint Builder": "Neuromuscular",
  "Foundation Ride": "Foundation",
  "Spin & Recover": "Recovery",
};

/** Falls back to a named library entry (e.g. SESSION_PREREQUISITES'
 *  fallback names) via the shared canonical-structure resolver, so a
 *  downgrade always uses the same precise blocks the rest of the app does
 *  rather than a second hand-written copy. */
function buildFromLibrary(name: string): SelectedWorkout | null {
  const entry = WORKOUT_LIBRARY.find((w) => w.name === name);
  const structure = entry ? resolveCanonicalStructure(name, entry.durationMin) : null;
  if (!entry || !structure) return null;
  return {
    category: FALLBACK_CATEGORY[name] ?? entry.category,
    title: entry.name,
    durationMin: entry.durationMin,
    targetPowerPctFtp: "",
    structure,
  };
}

// ─── Progression table ───────────────────────────────────────────────────

/** Hard/quality sessions for a Base/Build week, ordered HARDEST FIRST - the
 *  order the TSB gate downgrades in (see selectWeeklyWorkouts). */
function baseBuildSessions(phase: "Base" | "Build", weekInMesocycle: 1 | 2 | 3): SelectedWorkout[] {
  if (phase === "Base") {
    if (weekInMesocycle === 1) return [sweetSpot2x8(), sprintBuilder(), foundationRide(60)];
    if (weekInMesocycle === 2) return [sweetSpot2x10(), sprintBuilder(), foundationRide(60)];
    return [sweetSpot3x8(), sprintBuilder(), foundationRide(75)];
  }
  if (weekInMesocycle === 1) return [threshold3x6(), sweetSpotClassic(), foundationRide(60)];
  if (weekInMesocycle === 2) return [threshold3x8(), sweetSpotClassic(), foundationRide(60)];
  return [threshold2x12(), microIntervals16x3030(), foundationRide(60)];
}

// ─── Safety gates ────────────────────────────────────────────────────────

type WkgTier = "beginner" | "novice" | "intermediate" | "trained" | "advanced" | "elite";

function classifyWkg(wPerKg: number): WkgTier {
  const found = RIDER_LEVEL_THRESHOLDS.find((t) => wPerKg >= t.minWkg && wPerKg < t.maxWkg);
  return (found?.label.toLowerCase() as WkgTier) ?? "elite";
}

/** True if this category requires a gate-check at all (Foundation/Recovery
 *  are always safe regardless of level/fatigue). */
function isGated(category: string): boolean {
  return category === "Threshold" || category === "VO2max" || category === "Sweet Spot" || category === "Neuromuscular";
}

function sessionPrereqKey(category: string): keyof typeof SESSION_PREREQUISITES | null {
  switch (category) {
    case "Threshold": return "threshold";
    case "VO2max": return "vo2max";
    case "Sweet Spot": return "sweetspot";
    case "Neuromuscular": return "neuromuscular";
    default: return null;
  }
}

function downgrade(session: SelectedWorkout): SelectedWorkout {
  const key = sessionPrereqKey(session.category);
  if (!key) return session;
  const fallbackName = SESSION_PREREQUISITES[key].fallback;
  return buildFromLibrary(fallbackName) ?? foundationRide(60);
}

/** W/kg gate: a rider under 3.0 W/kg (beginner or novice, per
 *  RIDER_LEVEL_THRESHOLDS) isn't ready for true Threshold/VO2max work -
 *  every gated session above Sweet Spot gets replaced. See this file's top
 *  doc comment for why novice is capped the same as beginner here. */
function applyWkgGate(sessions: SelectedWorkout[], wPerKg: number | null): SelectedWorkout[] {
  if (wPerKg == null) return sessions;
  const tier = classifyWkg(wPerKg);
  if (tier !== "beginner" && tier !== "novice") return sessions;
  return sessions.map((s) => {
    if (!isGated(s.category)) return s;
    if (tier === "beginner" && s.category !== "Sweet Spot") return downgrade(s);
    if (tier === "novice" && (s.category === "Threshold" || s.category === "VO2max")) return downgrade(s);
    return s;
  });
}

/** TSB gate: a rider deep in fatigue (TSB < -20) gets ONE easier week, not a
 *  wholesale rewrite - only the single hardest session (first in the
 *  hardest-first ordered array) is downgraded. */
function applyTsbGate(sessions: SelectedWorkout[], tsb: number | null): SelectedWorkout[] {
  if (tsb == null || tsb >= -20) return sessions;
  const hardestIndex = sessions.findIndex((s) => isGated(s.category));
  if (hardestIndex === -1) return sessions;
  return sessions.map((s, i) => (i === hardestIndex ? downgrade(s) : s));
}

// ─── Day placement ───────────────────────────────────────────────────────

/**
 * Places the (already gated) session list across Monday-Sunday: hard day ->
 * easy/rest day alternation, matching the "never two hard days back to
 * back" rule already established elsewhere in this app. Fills remaining
 * slots up to daysPerWeek with an extra Foundation Ride; anything beyond
 * daysPerWeek is Rest. Sunday is a valid training day, never defaulted to
 * rest purely for being last, matching lib/ai.ts's existing convention.
 */
function placeSessions(sessions: SelectedWorkout[], daysPerWeek: number): SelectedDay[] {
  const clampedDays = Math.max(2, Math.min(7, Math.round(daysPerWeek)));
  const toPlace = [...sessions];
  while (toPlace.length < clampedDays) toPlace.push(foundationRide(45));

  const result: SelectedDay[] = DAY_ORDER.map((day) => ({ day, workout: null }));
  let dayIdx = 0;
  let sessionIdx = 0;
  let lastWasHard = false;

  while (sessionIdx < toPlace.length && dayIdx < 7) {
    const session = toPlace[sessionIdx];
    const isHard = session.category !== "Foundation" && session.category !== "Recovery";
    // Force a rest/gap day if the previous placed day was hard and this one
    // is too - burns a day slot rather than stacking two hard days.
    if (isHard && lastWasHard && dayIdx < 6) {
      dayIdx++;
      continue;
    }
    result[dayIdx].workout = session;
    lastWasHard = isHard;
    dayIdx++;
    sessionIdx++;
  }

  return result;
}

// ─── Public entry point ──────────────────────────────────────────────────

export function selectWeeklyWorkouts(input: SelectorInput): SelectedDay[] {
  if (input.phase === "Recovery") {
    const sessions = [spinAndRecover(), foundationRide(60)];
    return placeSessions(sessions, Math.min(input.daysPerWeek, 4));
  }

  const weekInMesocycle = input.weekInMesocycle === 4 ? 3 : input.weekInMesocycle; // defensive
  let sessions = baseBuildSessions(input.phase, weekInMesocycle as 1 | 2 | 3);
  sessions = applyWkgGate(sessions, input.wPerKg);
  sessions = applyTsbGate(sessions, input.tsb);
  return placeSessions(sessions, input.daysPerWeek);
}
