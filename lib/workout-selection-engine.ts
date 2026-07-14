/**
 * lib/workout-selection-engine.ts
 *
 * Deterministic pre-LLM Workout Selection Engine.
 *
 * This runs BEFORE the AI call. It produces a SelectionContext that tells
 * the AI exactly which workouts it is allowed to prescribe and why —
 * replacing the previous approach of giving the AI an open-ended library
 * and hoping it would pick appropriately.
 *
 * What it does (per the spec):
 *  1. Enforces medical / safety restrictions (no-op for now — placeholder).
 *  2. Determines allowed weekly session count.
 *  3. Determines allowed number of intensity sessions.
 *  4. Analyzes recent stimulus exposure (21-day window).
 *  5. Analyzes result of recent structured sessions (completed vs skipped).
 *  6. Determines whether to REPEAT, PROGRESS, REGRESS, or CHANGE stimulus.
 *  7. Selects a small set (2-4) of eligible canonical workouts.
 *  8. Provides a reason for eligibility and rejection for each workout considered.
 *  9. Returns the context to pass to the AI.
 * 10. The AI then selects AMONG eligible candidates and explains its choice.
 */

import type { CoachingState, StimulusFamily } from "./coaching-state";
import { FAMILY_PROGRESSION, WORKOUT_TO_FAMILY } from "./coaching-state";
import type { TrainingLoadSummary } from "./training-load";
import type { RiderTrainingProfile } from "./rider-profile";

// ── Public types ──────────────────────────────────────────────────────────────

export interface EligibleWorkout {
  title: string;
  stimulusFamily: StimulusFamily;
  /** Why this workout is eligible for this week. */
  reason: string;
  /** The action that placed it here: REPEAT | PROGRESS | REGRESS | INTRO */
  action: "REPEAT" | "PROGRESS" | "REGRESS" | "INTRO";
}

export interface IneligibleWorkout {
  title: string;
  /** Why it was excluded. */
  reason: string;
}

export interface SelectionContext {
  /** The stimulus family the engine recommends making the primary focus this week. */
  priorityFamily: StimulusFamily | null;
  /** Why this family was chosen as priority. */
  priorityReason: string;
  /** Eligible workouts the AI MAY prescribe. Typically 2-4 per intensity slot. */
  eligibleWorkouts: EligibleWorkout[];
  /** Workouts explicitly blocked for this week, with reasons. */
  ineligibleWorkouts: IneligibleWorkout[];
  /** Total training sessions allowed this week (includes rest days NOT counted). */
  maxIntensitySessions: number;
  /** Human-readable summary of the 21-day stimulus exposure. */
  exposureSummary: string;
  /** One-line description of the progression decision. */
  progressionDecision: string;
  /** TSB interpretation as a contextual signal (NOT a hard gate). */
  tsbSignal: string;
}

// ── Phase → allowed stimulus families ────────────────────────────────────────

const PHASE_ALLOWED_FAMILIES: Record<string, StimulusFamily[]> = {
  Base:       ["endurance", "tempo", "neuromuscular"],
  Build:      ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular"],
  Build1:     ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular"],
  Build2:     ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular"],
  Specialty:  ["sweetSpot", "threshold", "vo2max", "neuromuscular", "anaerobic"],
  Taper:      ["endurance", "tempo", "sweetSpot"],
  RaceWeek:   ["endurance", "neuromuscular"],
  Recovery:   ["endurance"],
};

function getAllowedFamilies(phase: string): StimulusFamily[] {
  // Normalize phase label — "Build 1" → "Build1", etc.
  const key = phase.replace(/\s+/g, "");
  return PHASE_ALLOWED_FAMILIES[key]
    ?? PHASE_ALLOWED_FAMILIES[phase]
    ?? ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular"];
}

// ── Rider-level → allowed families ───────────────────────────────────────────

/**
 * W/kg classification gates which families are available.
 * Neuromuscular / anaerobic are high-intensity but rely on fast-twitch
 * recruitment rather than aerobic capacity, so they're available at all
 * levels (just at shorter durations / lower volumes).
 */
function getAllowedFamiliesByLevel(wPerKg: number | null): StimulusFamily[] {
  if (wPerKg == null || wPerKg < 2.5) {
    // Beginner — endurance + tempo only (sweetSpot needs a minimum aerobic base)
    return ["endurance", "tempo", "neuromuscular"];
  }
  if (wPerKg < 3.0) {
    // Novice — add sweetSpot and short anaerobic bursts
    return ["endurance", "tempo", "sweetSpot", "neuromuscular", "anaerobic"];
  }
  if (wPerKg < 3.5) {
    // Intermediate — add threshold, VO2max entry-level sessions
    return ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular", "anaerobic"];
  }
  // Trained / Advanced — full library
  return ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular", "anaerobic"];
}

// ── TSB signal ────────────────────────────────────────────────────────────────

function describeTsb(tsb: number | null | undefined): string {
  if (tsb == null) return "TSB unknown — plan conservatively.";
  if (tsb > 10)    return `TSB ${tsb.toFixed(0)}: rider is well-rested. Hard sessions will be productive.`;
  if (tsb > 0)     return `TSB ${tsb.toFixed(0)}: rider is fresh. Normal training week is appropriate.`;
  if (tsb >= -10)  return `TSB ${tsb.toFixed(0)}: slight fatigue — the intensity still works, recovery after is important.`;
  if (tsb >= -20)  return `TSB ${tsb.toFixed(0)}: meaningful fatigue — keep intensity sessions to 2/week maximum; choose lower-stress variants if available.`;
  if (tsb >= -30)  return `TSB ${tsb.toFixed(0)}: significant fatigue. Limit to 1 intensity session this week. Prioritize endurance recovery.`;
  return `TSB ${tsb.toFixed(0)}: very high fatigue. Recovery priority — endurance sessions only. No intensity this week.`;
}

function intensityCapFromTsb(tsb: number | null | undefined, baseMax: number): number {
  if (tsb == null) return Math.min(baseMax, 2);
  if (tsb < -30)   return 0;
  if (tsb < -20)   return 1;
  if (tsb < -10)   return Math.min(baseMax, 2);
  return baseMax;
}

// ── Intensity session count ───────────────────────────────────────────────────

/**
 * Base maximum intensity sessions per week, derived from rider experience level.
 * TSB may further reduce this (see intensityCapFromTsb).
 */
function baseIntensityCap(cyclingLevel: number | null | undefined, wPerKg: number | null): number {
  const level = cyclingLevel ?? 0;
  if (wPerKg != null && wPerKg < 2.5) return 1;  // Beginner — limit load
  if (wPerKg != null && wPerKg < 3.0) return 2;  // Novice
  if (level < 20 || (wPerKg != null && wPerKg < 3.0)) return 2;
  return 3; // Trained / advanced
}

// ── Progression logic ─────────────────────────────────────────────────────────

type ProgressionAction = "REPEAT" | "PROGRESS" | "REGRESS" | "INTRO";

/**
 * Given the last completed workout in a family and the number of times
 * that family appeared in the last 21 days, determine the next action.
 *
 * Rules:
 *  - INTRO: No history for this family at all → start at index 0.
 *  - PROGRESS: Completed the current rung ≥ 1 time → move one rung up.
 *  - REPEAT: Last workout was skipped or result is "unknown" (not yet ridden)
 *    → keep the same rung to give the rider another chance.
 *  - REGRESS: exposure count for this family is 0 (was done >21 days ago)
 *    → drop one rung as a refresher before advancing again.
 */
function determineProgression(
  family: StimulusFamily,
  lastCompleted: string | undefined,
  exposureCount: number,
): { action: ProgressionAction; targetIndex: number } {
  const ladder = FAMILY_PROGRESSION[family];
  if (!ladder || ladder.length === 0) return { action: "INTRO", targetIndex: 0 };

  // No history — start at the beginning
  if (!lastCompleted || !(lastCompleted in WORKOUT_TO_FAMILY)) {
    return { action: "INTRO", targetIndex: 0 };
  }

  const currentIdx = ladder.indexOf(lastCompleted);
  if (currentIdx === -1) {
    // Workout title not on ladder (edge case) — start at beginning
    return { action: "INTRO", targetIndex: 0 };
  }

  if (exposureCount === 0) {
    // Family hasn't appeared in 21 days — regress one rung as refresher
    const target = Math.max(0, currentIdx - 1);
    return { action: "REGRESS", targetIndex: target };
  }

  if (exposureCount >= 2) {
    // Appeared ≥ 2 times in 21 days — advance if not at top
    const target = Math.min(ladder.length - 1, currentIdx + 1);
    return { action: currentIdx === target ? "REPEAT" : "PROGRESS", targetIndex: target };
  }

  // Appeared once — hold position (give the rider a second dose before advancing)
  return { action: "REPEAT", targetIndex: currentIdx };
}

// ── Eligible workout derivation ───────────────────────────────────────────────

function workoutsForFamily(
  family: StimulusFamily,
  lastCompleted: string | undefined,
  exposureCount: number,
): EligibleWorkout[] {
  const ladder = FAMILY_PROGRESSION[family];
  if (!ladder || ladder.length === 0) return [];

  const { action, targetIndex } = determineProgression(family, lastCompleted, exposureCount);

  const results: EligibleWorkout[] = [];

  // Primary recommendation: the target rung
  const primary = ladder[targetIndex];
  results.push({
    title: primary,
    stimulusFamily: family,
    action,
    reason: buildEligibilityReason(family, action, primary, targetIndex, ladder),
  });

  // Alternative: one rung above (if exists) — gives AI a harder option when rider is fresh
  if (targetIndex + 1 < ladder.length && action !== "REGRESS") {
    const harder = ladder[targetIndex + 1];
    results.push({
      title: harder,
      stimulusFamily: family,
      action: "PROGRESS",
      reason: `Alternative harder option (${family} rung ${targetIndex + 2}/${ladder.length}). Prescribe only if TSB is positive and rider is performing well.`,
    });
  }

  // Alternative: one rung below (if exists) — gives AI a softer option
  if (targetIndex - 1 >= 0 && action !== "INTRO") {
    const easier = ladder[targetIndex - 1];
    results.push({
      title: easier,
      stimulusFamily: family,
      action: "REGRESS",
      reason: `Conservative fallback (${family} rung ${targetIndex}/${ladder.length}). Use if TSB is below -20 or rider reports fatigue.`,
    });
  }

  return results;
}

function buildEligibilityReason(
  family: StimulusFamily,
  action: ProgressionAction,
  title: string,
  idx: number,
  ladder: string[],
): string {
  const pos = `${family} rung ${idx + 1}/${ladder.length}`;
  switch (action) {
    case "INTRO":
      return `First-ever ${family} session for this rider. Starting at the beginning of the ${family} ladder (${pos}).`;
    case "PROGRESS":
      return `Rider has completed the previous ${family} rung. Advancing to ${title} (${pos}).`;
    case "REPEAT":
      return `One prior dose of ${family} in the last 21 days. Repeating current position (${pos}) to consolidate stimulus before advancing.`;
    case "REGRESS":
      return `${family} family hasn't appeared in 21+ days. Stepping back one rung (${pos}) as a refresher before re-advancing.`;
  }
}

// ── Priority family selection ─────────────────────────────────────────────────

/**
 * Rank the allowed families by "most needed" logic:
 *  1. Families with zero exposure in 21 days and zero prior sessions (INTRO) → highest priority.
 *  2. Families with low exposure (0-1) that the rider has done before → high.
 *  3. Families with high exposure (2+) → lower priority (they're already getting it).
 *
 * Among ties, prefer higher-stimulus families during Build phases and lower-stimulus
 * during Base / Taper / Recovery.
 */
function rankFamilies(
  allowed: StimulusFamily[],
  exposure: Record<string, number>,
  lastCompleted: Partial<Record<StimulusFamily, string>>,
  phase: string,
): StimulusFamily[] {
  // Family intensity weight — higher = more physiological stress
  const intensityWeight: Record<StimulusFamily, number> = {
    endurance:     1,
    tempo:         2,
    sweetSpot:     3,
    threshold:     4,
    vo2max:        5,
    neuromuscular: 3,
    anaerobic:     4,
  };

  const isHighIntensityPhase = /build|specialty/i.test(phase);

  const scored = allowed.map(fam => {
    const exp = exposure[fam] ?? 0;
    const hasHistory = Boolean(lastCompleted[fam]);
    const weight = intensityWeight[fam];

    // Base score: inverse of exposure (lower = more needed)
    let score = 10 - Math.min(exp * 3, 9); // 10 (zero exp) → 1 (3+ exp)

    // Bonus for INTRO families during appropriate phases
    if (!hasHistory && isHighIntensityPhase && weight >= 3) score += 3;

    // During build phases, prefer higher-intensity families when exposure is equal
    if (isHighIntensityPhase) score += weight * 0.5;

    // During base/taper/recovery, prefer lower-intensity families
    if (!isHighIntensityPhase) score += (6 - weight) * 0.5;

    return { fam, score };
  });

  // Endurance always gets a baseline floor — it can never be "too well covered"
  // because all riders benefit from ongoing aerobic base work.
  const enduranceEntry = scored.find(s => s.fam === "endurance");
  if (enduranceEntry) enduranceEntry.score = Math.max(enduranceEntry.score, 2);

  return scored
    .sort((a, b) => b.score - a.score)
    .map(s => s.fam);
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface SelectionEngineInput {
  coachingState: CoachingState | null;
  /** rider profile for level/FTP/weight context */
  riderProfile?: RiderTrainingProfile;
  trainingLoad?: TrainingLoadSummary;
  phase: string;
  /** From profile.achievementLevel / 100 */
  cyclingLevel?: number;
  ftp?: number;
  weightKg?: number;
}

export function runSelectionEngine(input: SelectionEngineInput): SelectionContext {
  const { coachingState, trainingLoad, phase, cyclingLevel, ftp, weightKg, riderProfile } = input;

  // ── 1. Compute W/kg ─────────────────────────────────────────────────────────
  // ftp and weightKg come from the Zwift profile (plan-runner.ts), not from
  // RiderTrainingProfile (which doesn't store these values).
  const effectiveFtp = ftp ?? null;
  const effectiveWeight = weightKg ?? null;
  const wPerKg = effectiveFtp && effectiveWeight && effectiveWeight > 0
    ? Math.round((effectiveFtp / effectiveWeight) * 100) / 100
    : null;

  // ── 2. TSB signal ───────────────────────────────────────────────────────────
  const tsb = trainingLoad?.tsb ?? null;
  const tsbSignal = describeTsb(tsb);

  // ── 3. Intensity session cap ────────────────────────────────────────────────
  const baseCap = baseIntensityCap(cyclingLevel, wPerKg);
  const maxIntensitySessions = intensityCapFromTsb(tsb, baseCap);

  // ── 4. Allowed families (phase + level intersection) ────────────────────────
  const phaseAllowed = getAllowedFamilies(phase);
  const levelAllowed = getAllowedFamiliesByLevel(wPerKg);
  const allowed = phaseAllowed.filter(f => levelAllowed.includes(f));

  // ── 5. Exposure and history from coaching state ─────────────────────────────
  const exposure = coachingState?.exposureLast21Days ?? {
    endurance: 0, tempo: 0, sweetSpot: 0,
    threshold: 0, vo2max: 0, neuromuscular: 0, anaerobic: 0,
  };
  const lastCompleted = coachingState?.lastCompletedByFamily ?? {};

  // ── 6. Exposure summary ─────────────────────────────────────────────────────
  const nonZeroExposure = (Object.entries(exposure) as [StimulusFamily, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const exposureSummary = nonZeroExposure
    ? `Last 21 days (completed sessions): ${nonZeroExposure}.`
    : "No structured sessions recorded in the last 21 days — treat as a fresh start.";

  // ── 7. Rank families and pick priority ─────────────────────────────────────
  const ranked = rankFamilies(allowed, exposure, lastCompleted, phase);
  const priorityFamily = ranked[0] ?? null;

  // ── 8. Progression decision for priority family ─────────────────────────────
  let progressionDecision = "No priority family — prescribe endurance only.";
  if (priorityFamily) {
    const { action, targetIndex } = determineProgression(
      priorityFamily,
      lastCompleted[priorityFamily],
      exposure[priorityFamily] ?? 0,
    );
    const ladder = FAMILY_PROGRESSION[priorityFamily];
    const targetTitle = ladder[targetIndex] ?? "—";
    progressionDecision = `${priorityFamily.toUpperCase()} — action: ${action}. Target rung: "${targetTitle}" (${targetIndex + 1}/${ladder.length}).`;
  }

  // ── 9. Priority reason ──────────────────────────────────────────────────────
  const priorityReason = buildPriorityReason(
    priorityFamily,
    ranked,
    exposure,
    lastCompleted,
    phase,
    allowed,
  );

  // ── 10. Build eligible workout list ────────────────────────────────────────
  // For each top-ranked family (up to 2 families, limited by intensity cap),
  // select the progression-appropriate workouts.
  const eligibleWorkouts: EligibleWorkout[] = [];
  const ineligibleWorkouts: IneligibleWorkout[] = [];

  // Always include at least one endurance option (endurance is allowed in all phases)
  const familiesForSelection = maxIntensitySessions > 0
    ? ranked.slice(0, Math.min(2, ranked.length))
    : [];

  const alwaysIncludeEndurance = !familiesForSelection.includes("endurance");

  if (alwaysIncludeEndurance && allowed.includes("endurance")) {
    familiesForSelection.push("endurance");
  }

  for (const fam of familiesForSelection) {
    const workouts = workoutsForFamily(fam, lastCompleted[fam], exposure[fam] ?? 0);
    eligibleWorkouts.push(...workouts);
  }

  // Mark excluded families as ineligible with reasons
  const allFamilies: StimulusFamily[] = [
    "endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular", "anaerobic"
  ];
  for (const fam of allFamilies) {
    if (familiesForSelection.includes(fam)) continue;
    if (!phaseAllowed.includes(fam)) {
      ineligibleWorkouts.push({
        title: `[All ${fam} sessions]`,
        reason: `Not appropriate for the ${phase} phase.`,
      });
    } else if (!levelAllowed.includes(fam)) {
      ineligibleWorkouts.push({
        title: `[All ${fam} sessions]`,
        reason: `Requires higher W/kg than this rider currently has${wPerKg ? ` (${wPerKg} W/kg)` : ""}.`,
      });
    } else if (maxIntensitySessions === 0 && fam !== "endurance") {
      ineligibleWorkouts.push({
        title: `[All ${fam} sessions]`,
        reason: `TSB is very negative (${tsb?.toFixed(0) ?? "unknown"}). No intensity sessions this week.`,
      });
    }
  }

  // Deduplicate eligible workouts by title (a title might appear in multiple families)
  const seen = new Set<string>();
  const deduped = eligibleWorkouts.filter(w => {
    if (seen.has(w.title)) return false;
    seen.add(w.title);
    return true;
  });

  return {
    priorityFamily,
    priorityReason,
    eligibleWorkouts: deduped,
    ineligibleWorkouts,
    maxIntensitySessions,
    exposureSummary,
    progressionDecision,
    tsbSignal,
  };
}

function buildPriorityReason(
  priorityFamily: StimulusFamily | null,
  ranked: StimulusFamily[],
  exposure: Record<string, number>,
  lastCompleted: Partial<Record<StimulusFamily, string>>,
  phase: string,
  allowed: StimulusFamily[],
): string {
  if (!priorityFamily) return "No families are available for this phase and rider level.";

  const exp = exposure[priorityFamily] ?? 0;
  const last = lastCompleted[priorityFamily];
  const parts: string[] = [`Phase: ${phase}.`];

  if (exp === 0 && !last) {
    parts.push(`${priorityFamily} has NEVER been trained — introducing it.`);
  } else if (exp === 0) {
    parts.push(`${priorityFamily} has not appeared in 21 days (last: "${last}") — returning to it.`);
  } else {
    parts.push(`${priorityFamily} has the lowest recent exposure among ready families (${exp} session(s) in 21 days).`);
  }

  if (ranked.length > 1) {
    const next = ranked[1];
    const nextExp = exposure[next] ?? 0;
    parts.push(`Runner-up: ${next} (${nextExp} sessions in 21 days).`);
  }

  if (!allowed.length) {
    parts.push("NOTE: No families allowed — check phase/level configuration.");
  }

  return parts.join(" ");
}

// ── Prompt serialization ──────────────────────────────────────────────────────

/**
 * Converts a SelectionContext into a compact, structured prompt block
 * that can be injected into the WEEKLY_PLAN_SYSTEM_PROMPT.
 *
 * This is the bridge between the deterministic engine and the AI.
 * The AI MUST respect the eligible/ineligible lists as hard constraints.
 */
export function selectionContextToPrompt(ctx: SelectionContext): string {
  const lines: string[] = [
    "══════════════════════════════════════════════════════",
    "WORKOUT SELECTION ENGINE OUTPUT — HARD CONSTRAINTS",
    "══════════════════════════════════════════════════════",
    "",
    `MAXIMUM INTENSITY SESSIONS THIS WEEK: ${ctx.maxIntensitySessions}`,
    `TSB SIGNAL: ${ctx.tsbSignal}`,
    "",
    `STIMULUS EXPOSURE (last 21 days): ${ctx.exposureSummary}`,
    "",
    `PRIORITY STIMULUS FAMILY: ${ctx.priorityFamily ?? "none"}`,
    `WHY: ${ctx.priorityReason}`,
    "",
    `PROGRESSION DECISION: ${ctx.progressionDecision}`,
    "",
    "ELIGIBLE WORKOUTS — YOU MAY SELECT ONLY FROM THIS LIST:",
  ];

  if (ctx.eligibleWorkouts.length === 0) {
    lines.push("  (none — prescribe Rest Day or endurance-only if available)");
  } else {
    for (const w of ctx.eligibleWorkouts) {
      lines.push(`  • ${w.title} [${w.stimulusFamily}, ${w.action}] — ${w.reason}`);
    }
  }

  lines.push("");
  lines.push("INELIGIBLE WORKOUTS — DO NOT PRESCRIBE:");

  if (ctx.ineligibleWorkouts.length === 0) {
    lines.push("  (none explicitly blocked — but still respect the eligible list above)");
  } else {
    for (const w of ctx.ineligibleWorkouts) {
      lines.push(`  ✗ ${w.title} — ${w.reason}`);
    }
  }

  lines.push("");
  lines.push("INSTRUCTION: Select your primary intensity session from the ELIGIBLE list above.");
  lines.push("If multiple eligible workouts exist, choose the one that best fits this rider's");
  lines.push("readiness and goals, and explain your choice in the plan summary.");
  lines.push("══════════════════════════════════════════════════════");

  return lines.join("\n");
}
