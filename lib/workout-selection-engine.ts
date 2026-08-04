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
  // Sweet Spot is included in Base: it sits at the aerobic/anaerobic boundary
  // (88-93% FTP) and builds large aerobic base without the recovery debt of
  // threshold work. Excluding it from Base produces plans that are stuck at
  // pure Z2/tempo for an entire 4-week block — too conservative for a rider
  // with a tested FTP who wants to progress.
  // Base phase: aerobic foundation only — Z2, Tempo, Sweet Spot.
  // Neuromuscular/sprint work belongs in Build phase (power on top of base).
  Base:       ["endurance", "tempo", "sweetSpot"],
  Build:      ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular"],
  Build1:     ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular"],
  Build2:     ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular"],
  Specialty:  ["sweetSpot", "threshold", "vo2max", "neuromuscular", "anaerobic"],
  Taper:      ["endurance", "tempo", "sweetSpot"],
  RaceWeek:   ["endurance", "neuromuscular"],
  Recovery:   ["endurance", "sweetSpot"],  // Active recovery: reduced volume but one short SS block is physiologically sound
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
 * When a Zwift profile has no weight on file, we can't compute W/kg.
 * Rather than defaulting to Beginner (which permanently caps an experienced
 * rider at endurance+tempo forever), infer a rough level from FTP alone.
 * These thresholds are deliberately conservative — the goal is to avoid the
 * "235W rider treated as untrained" failure mode, not to be a precise
 * classifier. Real W/kg classification takes over the moment weight is set.
 */
function impliedLevelFromFtp(ftp: number | null | undefined): number | null {
  if (!ftp || ftp <= 0) return null;
  if (ftp >= 300) return 3.8; // Advanced
  if (ftp >= 220) return 3.2; // Intermediate → threshold + VO2max unlocked
  if (ftp >= 175) return 2.9; // Novice → sweetSpot unlocked
  if (ftp >= 140) return 2.6; // Low Novice
  return 2.2; // Beginner
  // Rationale: 235W @ ~75kg = 3.13 W/kg → Intermediate.
  // The previous thresholds (250 cutoff) placed 235W in Novice, blocking
  // threshold and VO2max work for a demonstrably non-beginner athlete.
}

/**
 * W/kg classification gates which families are available.
 * Neuromuscular / anaerobic are high-intensity but rely on fast-twitch
 * recruitment rather than aerobic capacity, so they're available at all
 * levels (just at shorter durations / lower volumes).
 *
 * When weight is missing from the Zwift profile, wPerKg will be null.
 * Rather than defaulting to Beginner permanently, we fall back to
 * `impliedLevelFromFtp()` so an experienced rider with a tested FTP gets
 * the appropriate workout families even before they fill in their weight.
 */
function getAllowedFamiliesByLevel(wPerKg: number | null, ftpFallback?: number | null): StimulusFamily[] {
  const level = wPerKg ?? impliedLevelFromFtp(ftpFallback);
  if (level == null || level < 2.5) {
    // Beginner — endurance + tempo only (sweetSpot needs a minimum aerobic base)
    return ["endurance", "tempo", "neuromuscular"];
  }
  if (level < 3.0) {
    // Novice — add sweetSpot and short anaerobic bursts
    return ["endurance", "tempo", "sweetSpot", "neuromuscular", "anaerobic"];
  }
  if (level < 3.5) {
    // Intermediate — add threshold, VO2max entry-level sessions
    return ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular", "anaerobic"];
  }
  // Trained / Advanced — full library
  return ["endurance", "tempo", "sweetSpot", "threshold", "vo2max", "neuromuscular", "anaerobic"];
}

/**
 * For a cold-start (no coaching history), determine which ladder rung to
 * start from based on rider ability. A 235W rider should not start at
 * "Surge Ride" (rung 0) — that's the most basic session in the library.
 * We place them at an appropriate starting position so their first week
 * is challenging and progressive, not remedial.
 */
function coldStartRung(wPerKg: number | null, ftpFallback?: number | null): number {
  const level = wPerKg ?? impliedLevelFromFtp(ftpFallback);
  if (level == null || level < 2.5) return 0;   // Beginner → rung 0 (most basic)
  if (level < 3.0) return 1;                    // Novice → rung 1
  if (level < 3.5) return 2;                    // Intermediate → rung 2
  if (level < 4.0) return 3;                    // Trained (3.5-4.0 W/kg) → rung 3 (e.g. "4×4 Two-Set" for vo2max)
  return 4;                                      // Advanced (4.0+ W/kg) → rung 4 (e.g. "Norwegian 4×4" for vo2max)
  // Rung 1 for Intermediate: e.g. sweetSpot = "Sweet Spot Classic",
  // threshold = "Threshold Development". Rung 2 would jump straight to
  // "3×15 Sweet Spot" with no prior session — too aggressive for a cold start.
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
 *  - INTRO: No history for this family at all → start at coldStart rung
 *    (derived from rider W/kg so an experienced rider skips remedial sessions).
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
  initialRung: number = 0,
): { action: ProgressionAction; targetIndex: number } {
  const ladder = FAMILY_PROGRESSION[family];
  if (!ladder || ladder.length === 0) return { action: "INTRO", targetIndex: 0 };

  // No history — start at the ability-appropriate rung, not always 0.
  // initialRung is computed from wPerKg/FTP by the caller; it ensures a
  // 235W rider doesn't start at "Surge Ride" (the most basic endurance entry).
  if (!lastCompleted || !(lastCompleted in WORKOUT_TO_FAMILY)) {
    const startRung = Math.min(initialRung, ladder.length - 1);
    return { action: "INTRO", targetIndex: startRung };
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
  initialRung: number = 0,
): EligibleWorkout[] {
  const ladder = FAMILY_PROGRESSION[family];
  if (!ladder || ladder.length === 0) return [];

  const { action, targetIndex } = determineProgression(family, lastCompleted, exposureCount, initialRung);

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

  // Neuromuscular and anaerobic are SUPPLEMENTARY — they support aerobic
  // development, never replace it as the primary stimulus. Cap their score
  // so they can never rank #1. A rider should always get their aerobic
  // training block first (sweetSpot / threshold / tempo), with neuromuscular
  // as a secondary session. Without this cap, a rider with no neuromuscular
  // history always gets Sprint Builder as priority, crowding out the more
  // important aerobic work.
  const nmCap = 7; // below the 10-point max, ensuring aerobic families rank higher when fresh
  for (const s of scored) {
    if (s.fam === "neuromuscular" || s.fam === "anaerobic") {
      s.score = Math.min(s.score, nmCap);
    }
  }

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
  /**
   * Workout titles from the PREVIOUS week's plan. Eligible workouts that
   * match any of these titles are demoted to alternatives so the same
   * session is never prescribed two weeks in a row. The AI may still choose
   * a demoted title if no better alternative exists, but it won't be the
   * primary recommendation.
   */
  previousWeekTitles?: string[];
}

export function runSelectionEngine(input: SelectionEngineInput): SelectionContext {
  const { coachingState, trainingLoad, phase, cyclingLevel, ftp, weightKg, riderProfile, previousWeekTitles } = input;

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
  // Use the implied level when wPerKg is null (no weight in profile) so a
  // 235W rider doesn't get capped at 1 intensity session/week.
  const effectiveWPerKg = wPerKg ?? (effectiveFtp ? impliedLevelFromFtp(effectiveFtp) : null);
  const baseCap = baseIntensityCap(cyclingLevel, effectiveWPerKg);
  const maxIntensitySessions = intensityCapFromTsb(tsb, baseCap);

  // ── 4. Allowed families (phase + level intersection) ────────────────────────
  const phaseAllowed = getAllowedFamilies(phase);
  // Pass effectiveFtp as fallback so a rider with no weight on their Zwift
  // profile still gets appropriate families (e.g. 235W FTP → Intermediate,
  // not Beginner). See getAllowedFamiliesByLevel() and impliedLevelFromFtp().
  const levelAllowed = getAllowedFamiliesByLevel(wPerKg, effectiveFtp);
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

  // Cold-start rung: when a family has NO history at all, place the rider
  // at an ability-appropriate position rather than rung 0 (most basic).
  // A 235W FTP rider should not begin with "Surge Ride" (endurance rung 0).
  const startRung = coldStartRung(wPerKg, effectiveFtp);

  // Intermediate+ riders (effectiveWPerKg ≥ 3.0) get 3 families instead of 2.
  // In Base phase, the scoring order is always: endurance → tempo → sweetSpot.
  // With only 2 families selected, sweetSpot is always squeezed out even though
  // it's allowed and physiologically appropriate for an experienced rider.
  // Adding the 3rd family gives the AI: Z2 + Tempo + Sweet Spot as options,
  // which is exactly right for a 235W FTP athlete in a Base week.
  // Threshold lowered from 3.0 to 2.5: Novice riders (2.5-3.0 W/kg) also
  // need Sweet Spot in their eligible list.
  const familySlot = (effectiveWPerKg != null && effectiveWPerKg >= 2.5) ? 3 : 2;
  const familiesForSelection = maxIntensitySessions > 0
    ? ranked.slice(0, Math.min(familySlot, ranked.length))
    : [];

  const alwaysIncludeEndurance = !familiesForSelection.includes("endurance");

  if (alwaysIncludeEndurance && allowed.includes("endurance")) {
    familiesForSelection.push("endurance");
  }

  for (const fam of familiesForSelection) {
    const workouts = workoutsForFamily(fam, lastCompleted[fam], exposure[fam] ?? 0, startRung);
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
    } else {
      ineligibleWorkouts.push({
        title: `[All ${fam} sessions]`,
        reason: `Not a priority stimulus this week — focus on the eligible families above.`,
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

  // Mark previous-week titles as ineligible so the AI knows not to repeat them.
  // A title that appeared last week should not be the primary recommendation
  // this week — the rider deserves a different stimulus even if the progression
  // ladder would normally suggest the same rung.
  const prevTitleSet = new Set(previousWeekTitles ?? []);
  const finalEligible = deduped.map(w => {
    if (!prevTitleSet.has(w.title)) return w;
    // Don't remove — just flag it so the AI deprioritizes it.
    return {
      ...w,
      reason: `${w.reason} ⚠ Prescribed last week — prefer an alternative if one is available.`,
    };
  });

  // Add previously-used titles to ineligible list so the engine's constraint
  // block is explicit in the AI prompt.
  for (const title of prevTitleSet) {
    if (!deduped.some(w => w.title === title)) continue; // only if it was eligible
    ineligibleWorkouts.push({
      title,
      reason: "Prescribed last week. Prescribe a different session to provide stimulus variety.",
    });
  }

  return {
    priorityFamily,
    priorityReason,
    eligibleWorkouts: finalEligible,
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
