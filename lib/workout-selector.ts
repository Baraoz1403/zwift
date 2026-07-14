/**
 * lib/workout-selector.ts
 *
 * Deterministic, code-driven selection of WHICH named workout goes on WHICH
 * day of the week - separated entirely from writing about it. The AI's only
 * remaining job (see generateWeeklyPlan in lib/ai.ts) is writing the
 * personal, data-grounded description for each pre-chosen session.
 *
 * FIXED WEEKLY TEMPLATE (every day has a permanent role - this is not a
 * dynamic placement algorithm anymore, see the history note below for why):
 *   Monday:    Z2 with Cadence Drills       (65-73% FTP, 60 min) — intervals
 *   Tuesday:   Sweet Spot / Threshold       (88-97% FTP, ~50-60 min) - PRIMARY
 *   Wednesday: Rest
 *   Thursday:  Sprint Builder or Threshold  (50-56 min) — secondary intensity
 *   Friday:    Surge Ride                   (65-73% + 110% surges, 50 min) — intervals
 *   Saturday:  Endurance with Muscle Tension (65-73% Z2, 70-80 min) — intervals
 *   Sunday:    Rest
 *
 * Progression (weekInMesocycle 1-4, 4 is always Recovery):
 *   Base week 1: Tuesday Sweet Spot 2x8  + Thursday Sprint Builder
 *   Base week 2: Tuesday Sweet Spot 2x10 + Thursday Sprint Builder
 *   Base week 3: Tuesday Sweet Spot 3x8  + Thursday Sprint Builder
 *   Recovery:    All Rest Days (no flat Spin & Recover — intervals-only rule)
 *   Build week 1: Tuesday Sweet Spot Classic + Thursday Threshold 3x6
 *   Build week 2: Tuesday Sweet Spot Classic + Thursday Threshold 3x8
 *   Build week 3: Tuesday Sweet Spot Classic + Thursday Threshold 2x12
 *
 * Two safety gates run AFTER the template lookup, before the week is
 * finalized, applied independently to Tuesday's and Thursday's sessions:
 *   1. W/kg gate: a rider below 2.5 W/kg (beginner, per
 *      RIDER_LEVEL_THRESHOLDS in lib/coaching-knowledge.ts) cannot yet
 *      handle true Threshold work - it gets replaced with its
 *      SESSION_PREREQUISITES fallback. 2.5-3.0 W/kg (novice) is capped the
 *      same way as a deliberate simplification: the full "late-Build +
 *      good-TSB" carve-out documented in lib/ai.ts's prompt isn't modeled
 *      here, so novices are held to Sweet-Spot-or-under until they cross
 *      3.0 W/kg. This errs safe, not precise.
 *   2. TSB gate: TSB < -20 downgrades whichever of Tuesday/Thursday is
 *      harder to its SESSION_PREREQUISITES fallback - a tired rider gets one
 *      easier week, not a wholesale rewrite.
 *
 * HISTORY - why this replaced the previous "3 sessions + Foundation-Ride
 * padding" design: that version (a) had a real placement bug that dropped a
 * session and produced weeks with 5 forced Rest days (fixed, then this
 * rewrite followed), and (b) even once fixed, padded every extra day beyond
 * the 3 core sessions with an IDENTICAL "Foundation Ride" filler - a rider
 * on a 5-6 day/week profile got the same Foundation Ride four days running,
 * which reads as template output, not coaching, even though nothing was
 * technically wrong. Giving every day of the week a distinct, permanent
 * role (cadence work Monday, easy spin Friday, long ride Saturday) removes
 * both problems at once: there is no placement algorithm left to have a
 * bug, and no day repeats another day's session.
 *
 * Scope: this drives the standard Base/Build/Recovery rotation. Taper,
 * RaceWeek, and a rider-note-driven surgical day edit keep going through the
 * existing AI-driven path in lib/ai.ts, which already has dedicated, working
 * logic for those (event-driven volume cuts, exact-day overrides) that this
 * fixed template doesn't model - see generateWeeklyPlan's call site for the
 * exact condition that decides which path a given plan takes.
 */

import type { WorkoutStructureBlock } from "./zwo";
import { SESSION_PREREQUISITES, RIDER_LEVEL_THRESHOLDS, WORKOUT_LIBRARY, resolveCanonicalStructure } from "./coaching-knowledge";

export type SelectorPhase = "Base" | "Build" | "Recovery";

export interface SelectorInput {
  phase: SelectorPhase;
  /** 1-based position within the 4-week mesocycle - 4 is always Recovery. */
  weekInMesocycle: 1 | 2 | 3 | 4;
  /** FTP / body weight in kg. Null if unknown - the W/kg gate no-ops. */
  wPerKg: number | null;
  /** Training Stress Balance. Null if unknown - the TSB gate no-ops. */
  tsb: number | null;
}

export interface SelectedWorkout {
  category: string;
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
// Titles that exactly match an existing canonical library entry (Sprint
// Builder, Sweet Spot Classic, Z2 with Cadence Drills, Surge Ride,
// Endurance with Muscle Tension) are deliberately reused so
// normalizeWeeklyPlan's canonical-injection step in lib/ai.ts uses the
// library's own precise blocks; titles for custom rep-schemes this
// progression needs (e.g. "Sweet Spot 2×8") are unique on purpose so that
// same injection step leaves them untouched.
//
// NOTE: zone2Ride() (flat steadystate) has been removed — all sessions must
// be interval-structured per the intervals-only rule. Any flat fallback now
// uses zone2CadenceDrills() instead.

/** Monday - matches CANONICAL_WORKOUT_STRUCTURES["Z2 with Cadence Drills"]
 *  exactly (60 min total). */
function zone2CadenceDrills(): SelectedWorkout {
  return {
    category: "Foundation",
    title: "Z2 with Cadence Drills",
    durationMin: 60,
    targetPowerPctFtp: "65-73%",
    structure: [
      { type: "warmup", durationMin: 10, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "intervals", durationMin: 40, powerFtp: 0.68, recoveryPowerFtp: 0.65,
        repeats: 4, onSec: 480, offSec: 120, label: "4×8 min Z2 + 2 min cadence drill (100-110 rpm)" },
      { type: "cooldown", durationMin: 10, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

/** Friday - Surge Ride: 6×1 min surges @ 110% FTP within Z2 base.
 *  Interval-structured (complies with intervals-only rule), low metabolic cost.
 *  Distinct from Monday (surges vs. cadence drills) so the two easy days
 *  don't read as the same session. */
function surgeRide(): SelectedWorkout {
  return {
    category: "Endurance",
    title: "Surge Ride",
    durationMin: 50,
    targetPowerPctFtp: "65-73% with 110% surges",
    structure: [
      { type: "warmup", durationMin: 10, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "intervals", durationMin: 30, powerFtp: 1.10, recoveryPowerFtp: 0.68,
        repeats: 6, onSec: 60, offSec: 240, label: "6×1 min @ 110% FTP, 4 min Z2 recovery" },
      { type: "cooldown", durationMin: 10, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

/** Saturday - Endurance with Muscle Tension: 4×5 min low-cadence (55 rpm)
 *  blocks within Z2. Interval-structured (complies with intervals-only rule),
 *  builds leg strength with minimal lactate load. Duration varies by phase.
 *  REPLACES flat "Long Endurance" which violated the intervals-only rule. */
function enduranceWithMuscleTension(durationMin: number): SelectedWorkout {
  // Warmup / cooldown scale with total duration; 4 blocks are always 4×5 min = 20 min work.
  const warm = Math.max(10, Math.round(durationMin * 0.20));
  const cool = Math.max(8, Math.round(durationMin * 0.15));
  // Remaining time after blocks (4×5 = 20 min) split as Z2 bridges between blocks
  const blockWork = 20; // 4 × 5 min
  const blockRec = Math.round((durationMin - warm - cool - blockWork) / 3); // 3 recovery bridges
  const actualRec = Math.max(3, blockRec);
  const bridgeTotal = actualRec * 3;
  // Recalculate warmup to hit exact durationMin
  const adjustedWarm = durationMin - cool - blockWork - bridgeTotal;

  return {
    category: "Endurance",
    title: "Endurance with Muscle Tension",
    durationMin,
    targetPowerPctFtp: "65-73% Z2, cadence 55 rpm during blocks",
    structure: [
      { type: "warmup", durationMin: Math.max(8, adjustedWarm), powerFtp: 0.67, label: "Easy warm-up, build to Z2" },
      { type: "intervals", durationMin: blockWork + bridgeTotal, powerFtp: 0.70, recoveryPowerFtp: 0.67,
        repeats: 4, onSec: 300, offSec: actualRec * 60,
        label: "4×5 min @ 68-72% FTP, cadence 55 rpm; recover Z2 between" },
      { type: "cooldown", durationMin: cool, powerFtp: 0.55, label: "Easy cool-down" },
    ],
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
    durationMin: 55,
    targetPowerPctFtp: "89-93%",
    structure: [
      { type: "warmup", durationMin: 10, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 36, powerFtp: 0.91, recoveryPowerFtp: 0.50,
        repeats: 3, onSec: 480, offSec: 240, label: "3×8 min @ 91% FTP" },
      { type: "cooldown", durationMin: 9, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  };
}

/** Build phase Tuesday - matches CANONICAL_WORKOUT_STRUCTURES["Sweet Spot
 *  Classic"] exactly (60 min, 3×10 min @ 90%). */
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

/** Base phase Thursday - matches CANONICAL_WORKOUT_STRUCTURES["Sprint
 *  Builder"] exactly. */
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

// spinAndRecover() REMOVED — flat session, violates the intervals-only rule.
// Recovery week sessions are now pure Rest Days. See Recovery case in
// selectWeeklyWorkouts below. A rider who wants movement can ride at their
// own discretion; the coach doesn't prescribe a flat spin as a workout.

// ─── Safety gates ────────────────────────────────────────────────────────

type WkgTier = "beginner" | "novice" | "intermediate" | "trained" | "advanced" | "elite";

function classifyWkg(wPerKg: number): WkgTier {
  const found = RIDER_LEVEL_THRESHOLDS.find((t) => wPerKg >= t.minWkg && wPerKg < t.maxWkg);
  return (found?.label.toLowerCase() as WkgTier) ?? "elite";
}

/** True if this category needs a gate-check at all (Foundation/Endurance/
 *  Recovery are always safe regardless of level/fatigue). */
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

/** Maps a library fallback name to the Title-Case category strings this
 *  module's own gates check against. WORKOUT_LIBRARY's own `category` field
 *  uses lowercase single-word values ("endurance", "sweetspot") for a
 *  different purpose (the AI prompt) - this keeps the two vocabularies from
 *  silently drifting apart. */
const FALLBACK_CATEGORY: Record<string, string> = {
  "Sweet Spot Classic": "Sweet Spot",
  "Tempo Cruise": "Tempo",
  "Sprint Builder": "Neuromuscular",
  "Z2 with Cadence Drills": "Foundation",
  // Foundation Ride and Spin & Recover removed — flat sessions violate the intervals-only rule.
};

/** Falls back to a named library entry via the shared canonical-structure
 *  resolver, so a downgrade uses the same precise blocks the rest of the
 *  app does rather than a second hand-written copy. */
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

function downgrade(session: SelectedWorkout): SelectedWorkout {
  const key = sessionPrereqKey(session.category);
  if (!key) return session;
  const fallbackName = SESSION_PREREQUISITES[key].fallback;
  // Final fallback: Z2 with Cadence Drills (interval-structured, always safe).
  // Foundation Ride is flat and violates the intervals-only rule.
  return buildFromLibrary(fallbackName) ?? zone2CadenceDrills();
}

/** Applies the W/kg gate then the TSB gate to a single day's session -
 *  Tuesday and Thursday are gated independently of each other. */
function applyGates(session: SelectedWorkout, wPerKg: number | null, tsb: number | null): SelectedWorkout {
  let result = session;

  if (wPerKg != null && isGated(result.category)) {
    const tier = classifyWkg(wPerKg);
    if (tier === "beginner" && result.category !== "Sweet Spot") {
      result = downgrade(result);
    } else if (tier === "novice" && (result.category === "Threshold" || result.category === "VO2max")) {
      result = downgrade(result);
    }
  }

  if (tsb != null && tsb < -20 && isGated(result.category)) {
    result = downgrade(result);
  }

  return result;
}

// ─── Progression table ───────────────────────────────────────────────────

function tuesdaySession(phase: "Base" | "Build", weekInMesocycle: 1 | 2 | 3): SelectedWorkout {
  if (phase === "Base") {
    if (weekInMesocycle === 1) return sweetSpot2x8();
    if (weekInMesocycle === 2) return sweetSpot2x10();
    return sweetSpot3x8();
  }
  return sweetSpotClassic();
}

function thursdaySession(phase: "Base" | "Build", weekInMesocycle: 1 | 2 | 3): SelectedWorkout {
  if (phase === "Base") return sprintBuilder();
  if (weekInMesocycle === 1) return threshold3x6();
  if (weekInMesocycle === 2) return threshold3x8();
  return threshold2x12();
}

// ─── Public entry point ──────────────────────────────────────────────────

export function selectWeeklyWorkouts(input: SelectorInput): SelectedDay[] {
  if (input.phase === "Recovery") {
    // Recovery week = all Rest Days. The intervals-only rule prohibits
    // prescribing a flat Spin & Recover session. The rider rests;
    // adaptation converts last mesocycle's training stress into fitness.
    return DAY_ORDER.map((day) => ({ day, workout: null }));
  }

  const weekInMesocycle = (input.weekInMesocycle === 4 ? 3 : input.weekInMesocycle) as 1 | 2 | 3;
  const tuesday = applyGates(tuesdaySession(input.phase, weekInMesocycle), input.wPerKg, input.tsb);
  const thursday = applyGates(thursdaySession(input.phase, weekInMesocycle), input.wPerKg, input.tsb);
  // Saturday duration: Build = 80 min (was 90 - but Endurance with Muscle Tension
  // at 90 min would mean very long recovery bridges; 80 min is appropriate),
  // Base = 70 min. These are structured interval sessions now, not flat rides.
  const saturdayDurationMin = input.phase === "Build" ? 80 : 70;

  return [
    { day: "Monday", workout: zone2CadenceDrills() },
    { day: "Tuesday", workout: tuesday },
    { day: "Wednesday", workout: null },
    { day: "Thursday", workout: thursday },
    { day: "Friday", workout: surgeRide() },
    { day: "Saturday", workout: enduranceWithMuscleTension(saturdayDurationMin) },
    { day: "Sunday", workout: null },
  ];
}
