/**
 * lib/season-plan.ts
 *
 * A season plan is the coaching brain that was missing.
 * It is generated ONCE from the rider's profile (goal, event date, FTP,
 * days/week) and stored in KV. Every subsequent weekly plan is an
 * EXECUTION of the season plan — not a fresh invention.
 *
 * Without a season plan, every weekly generation starts from scratch and
 * has no concept of "we are 6 weeks into a 14-week build toward your event."
 * With a season plan, the AI knows exactly where the rider is in their arc,
 * what was accomplished in prior weeks, and what the next 4 weeks must
 * deliver to hit the target. That's the difference between a scheduler
 * and a coach.
 *
 * KV key: zwift:{athleteId}:season_plan
 * TTL: 120 days (regenerate when goals change or event passes)
 */

import { kvGet, kvSet, kvAvailable } from "./kv";
import type { RiderTrainingProfile } from "./rider-profile";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeasonWeek {
  /** 1-based position in the season. */
  weekIndex: number;
  phase: "Base" | "Build" | "Peak" | "Recovery";
  /** One-line coaching theme, e.g. "Aerobic Foundation — establish Z2 base" */
  theme: string;
  /**
   * The primary quality session for this week.
   * Must be an exact title from the workout library (workout-selector.ts or
   * coaching-knowledge.ts WORKOUT_LIBRARY). The weekly plan executor maps
   * this to a concrete interval structure.
   */
  tuesdayTitle: string;
  /**
   * The secondary quality session (Thursday).
   * Same constraint — exact library title.
   */
  thursdayTitle: string;
  /** Target weekly TSS (Training Stress Score) for this week. */
  tssTarget: number;
  /**
   * 2-3 sentence coaching note explaining what this week is trying to
   * accomplish physiologically and what the rider should focus on.
   * Written for the rider, not for the code.
   */
  coachNote: string;
}

export interface SeasonPlan {
  athleteId: string;
  /** ISO timestamp of last generation. */
  createdAt: string;
  /** YYYY-MM-DD of the first Monday of the season. */
  startWeekOf: string;
  /** YYYY-MM-DD of the target event, or null. */
  eventDate: string | null;
  /** One-line description of the season goal, written by the AI. */
  goalSummary: string;
  /** Total number of weeks in the plan. */
  totalWeeks: number;
  /** Projected FTP at end of plan (from AI estimate). */
  projectedFtpGain: number | null;
  weeks: SeasonWeek[];
}

// ── KV helpers ────────────────────────────────────────────────────────────────

const KEY = (athleteId: string) => `zwift:${athleteId}:season_plan`;
const TTL = 120 * 24 * 60 * 60; // 120 days

export async function getSeasonPlan(athleteId: string): Promise<SeasonPlan | null> {
  if (!kvAvailable() || !athleteId) return null;
  try {
    const raw = await kvGet(KEY(athleteId));
    if (!raw) return null;
    return JSON.parse(raw) as SeasonPlan;
  } catch {
    return null;
  }
}

export async function saveSeasonPlan(plan: SeasonPlan): Promise<void> {
  if (!kvAvailable() || !plan.athleteId) return;
  try {
    await kvSet(KEY(plan.athleteId), JSON.stringify(plan), TTL);
  } catch {
    // best-effort — never block plan generation
  }
}

export async function deleteSeasonPlan(athleteId: string): Promise<void> {
  if (!kvAvailable() || !athleteId) return;
  try {
    const { kvDel } = await import("./kv");
    await kvDel(KEY(athleteId));
  } catch {}
}

// ── Week locator ──────────────────────────────────────────────────────────────

/**
 * Returns the SeasonWeek that corresponds to the given weekOf date.
 * Returns null if the season plan doesn't cover that date.
 */
export function findSeasonWeek(plan: SeasonPlan, weekOf: string): SeasonWeek | null {
  const startMs = new Date(plan.startWeekOf + "T00:00:00Z").getTime();
  const targetMs = new Date(weekOf + "T00:00:00Z").getTime();
  const diffWeeks = Math.round((targetMs - startMs) / (7 * 24 * 60 * 60 * 1000));
  if (diffWeeks < 0 || diffWeeks >= plan.weeks.length) return null;
  return plan.weeks[diffWeeks] ?? null;
}

// ── Season plan → AI system prompt fragment ───────────────────────────────────

/**
 * Builds the season-context block injected into the weekly plan system prompt.
 * This is what transforms "generate a week" into "execute week N of a season."
 */
export function seasonContextToPrompt(
  plan: SeasonPlan,
  currentWeek: SeasonWeek,
  previousWeek: SeasonWeek | null,
): string {
  const lines: string[] = [
    "══ SEASON PLAN CONTEXT (read this first — it overrides generic phase logic) ══",
    "",
    `Season goal: ${plan.goalSummary}`,
    `Total weeks: ${plan.totalWeeks} | Current: Week ${currentWeek.weekIndex} of ${plan.totalWeeks}`,
    `Phase: ${currentWeek.phase} | Theme: ${currentWeek.theme}`,
    `TSS target this week: ~${currentWeek.tssTarget}`,
    "",
    `Coach note for this week: ${currentWeek.coachNote}`,
    "",
    `Primary quality session (Tuesday): ${currentWeek.tuesdayTitle}`,
    `Secondary quality session (Thursday): ${currentWeek.thursdayTitle}`,
    "",
  ];

  if (previousWeek) {
    lines.push(
      `Previous week (Week ${previousWeek.weekIndex}): ${previousWeek.theme}`,
      `  → Tuesday was: ${previousWeek.tuesdayTitle}`,
      `  → Thursday was: ${previousWeek.thursdayTitle}`,
      "",
    );
  }

  const weeksRemaining = plan.totalWeeks - currentWeek.weekIndex;
  lines.push(
    `Weeks remaining in season: ${weeksRemaining}`,
    plan.eventDate ? `Target event date: ${plan.eventDate}` : "",
    "",
    "INSTRUCTIONS:",
    `The season plan suggests Tuesday = "${currentWeek.tuesdayTitle}" and Thursday = "${currentWeek.thursdayTitle}".`,
    "These are SUGGESTIONS from the season arc — use them as guidance for session type and intensity zone.",
    "You are NOT required to use these exact titles. Build each workout from scratch using the rider's current",
    "TSB, FTP, and phase. The session TYPE should match the suggestion; the exact structure is yours to design.",
    "Every workout must have a complete structure[] with warmup, intervals/blocks, and cooldown.",
    "Power targets must be in exact watts derived from the rider's FTP (e.g., 207W not '88%').",
    "══════════════════════════════════════════════════════════════════════════════",
  );

  return lines.filter((l) => l !== undefined).join("\n");
}

// ── AI generation ─────────────────────────────────────────────────────────────

/**
 * Valid Tuesday quality session titles (Base phase → Build phase progression).
 * These map to concrete structures in workout-selector.ts or coaching-knowledge.ts.
 */
const TUESDAY_LIBRARY = [
  // Base phase — sweet spot progression
  "Sweet Spot 2×8",
  "Sweet Spot 2×10",
  "Sweet Spot 3×8",
  "Sweet Spot Classic",    // 3×10 @ 90%
  "Sweet Spot 3×12",
  "Extended Sweet Spot",   // 2×20 @ 88%
  // Build phase
  "Threshold 3×6",
  "Threshold 3×8",
  "Threshold 2×12",
  "Over-Under Intervals",
  "Critical Power Development",
  // Peak
  "VO2max Pyramid",
  "4×4 Two-Set",
  "Norwegian 4×4",
  "FTP Test Protocol",
];

const THURSDAY_LIBRARY = [
  // Base phase — tempo/aerobic secondary
  "Tempo 2×15",
  "Tempo 2×18",
  "Tempo 2×20",
  // Build phase — threshold secondary
  "Threshold 3×6",
  "Threshold 3×8",
  "Threshold 2×12",
  "Over-Under Intervals",
  // Peak
  "VO2max Pyramid",
  "60/60 Intervals",
  "Sprint Builder",         // legitimate for peak/race-prep
];

/**
 * Generates a full season plan via the AI.
 *
 * This is a one-shot call — the AI generates all N weeks in one response.
 * The result is stored in KV and used to guide every subsequent weekly plan.
 *
 * @param athleteId  Athlete ID
 * @param profile    Rider training profile (goals, eventDate, etc.)
 * @param currentFtp Current FTP in watts
 * @param weightKg   Body weight in kg (for W/kg context)
 * @param startWeekOf  YYYY-MM-DD of the first Monday to start the season
 * @param apiKey     Anthropic API key
 */
export async function generateSeasonPlan(params: {
  athleteId: string;
  profile: RiderTrainingProfile;
  currentFtp: number;
  weightKg: number | null;
  startWeekOf: string;
  apiKey: string;
}): Promise<SeasonPlan> {
  const { athleteId, profile, currentFtp, weightKg, startWeekOf, apiKey } = params;

  const wPerKg = weightKg && weightKg > 0 ? +(currentFtp / weightKg).toFixed(2) : null;

  // Determine season length
  let totalWeeks = 14; // sensible default
  if (profile.eventDate) {
    const start = new Date(startWeekOf + "T00:00:00Z");
    const event = new Date(profile.eventDate + "T00:00:00Z");
    const diffWeeks = Math.round((event.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (diffWeeks >= 6 && diffWeeks <= 24) totalWeeks = diffWeeks;
  }

  const systemPrompt = `You are an expert cycling coach building a multi-week season plan.
Your output is a structured JSON season plan — not prose, not a generic template.
Every week must be physiologically justified and connect to the rider's stated goal.

WORKOUT LIBRARY — Tuesday can only use titles from this list:
${TUESDAY_LIBRARY.map((t) => `  - "${t}"`).join("\n")}

Thursday can only use titles from this list:
${THURSDAY_LIBRARY.map((t) => `  - "${t}"`).join("\n")}

Recovery weeks (every 4th week, or if TSB is collapsing) must use:
  - tuesdayTitle: "Sweet Spot 2×8"
  - thursdayTitle: "Tempo 2×15"
  - tssTarget: 60% of the preceding week's target

PROGRESSION RULES:
1. Base phase (first 40-50% of weeks): Build aerobic capacity. Start conservatively.
   Tuesday progresses: 2×8 → 2×10 → 3×8 → Classic (3×10) → 3×12 → Extended (2×20)
   Thursday progresses: Tempo 2×15 → 2×18 → 2×20 (then repeats or steps to threshold)
2. Build phase (next 35-40%): Introduce threshold and VO2max. Maintain sweet spot.
   Tuesday: Threshold 3×6 → 3×8 → 2×12 → Over-Under → Critical Power
   Thursday: Threshold 3×6 → 3×8 → VO2max Pyramid → 60/60 Intervals
3. Peak phase (final 10-15%, if eventDate): Sharpen. Reduce volume, maintain intensity.
4. Recovery weeks: reduced load, same sessions but early-progression versions.

TSS guidelines (4-5 sessions/week rider at 60-90 min/session):
  Early Base: 200-260 TSS/week
  Late Base: 260-320 TSS/week
  Build: 290-360 TSS/week
  Recovery: 140-200 TSS/week
  Peak: 220-280 TSS/week

Output ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "goalSummary": "one sentence",
  "projectedFtpGain": <watts or null>,
  "weeks": [
    {
      "weekIndex": 1,
      "phase": "Base",
      "theme": "short theme",
      "tuesdayTitle": "exact title from library",
      "thursdayTitle": "exact title from library",
      "tssTarget": 240,
      "coachNote": "2-3 sentences for the rider"
    }
  ]
}`;

  const userContent = JSON.stringify({
    athleteId,
    goal: profile.goals,
    eventDate: profile.eventDate ?? null,
    notes: profile.notes ?? null,
    daysPerWeek: profile.daysRange,
    sessionLength: profile.sessionLength,
    currentFtp,
    wPerKg,
    startWeekOf,
    totalWeeks,
  });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Season plan AI call failed: HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data?.content?.[0]?.text ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Season plan: no JSON in AI response");

  let parsed: { goalSummary: string; projectedFtpGain: number | null; weeks: SeasonWeek[] };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error(`Season plan: JSON parse failed: ${(e as Error).message}`);
  }

  if (!Array.isArray(parsed.weeks) || parsed.weeks.length === 0) {
    throw new Error("Season plan: AI returned no weeks");
  }

  // Validate titles against library (replace unknowns with a safe fallback)
  const tuesdaySet = new Set(TUESDAY_LIBRARY);
  const thursdaySet = new Set(THURSDAY_LIBRARY);
  const safeWeeks: SeasonWeek[] = parsed.weeks.map((w, i) => ({
    weekIndex: i + 1,
    phase: (["Base", "Build", "Peak", "Recovery"].includes(w.phase) ? w.phase : "Base") as SeasonWeek["phase"],
    theme: String(w.theme ?? "Training week"),
    tuesdayTitle: tuesdaySet.has(w.tuesdayTitle) ? w.tuesdayTitle : "Sweet Spot 2×8",
    thursdayTitle: thursdaySet.has(w.thursdayTitle) ? w.thursdayTitle : "Tempo 2×15",
    tssTarget: typeof w.tssTarget === "number" ? w.tssTarget : 250,
    coachNote: String(w.coachNote ?? ""),
  }));

  const plan: SeasonPlan = {
    athleteId,
    createdAt: new Date().toISOString(),
    startWeekOf,
    eventDate: profile.eventDate ?? null,
    goalSummary: String(parsed.goalSummary ?? "Build cycling fitness"),
    totalWeeks: safeWeeks.length,
    projectedFtpGain: typeof parsed.projectedFtpGain === "number" ? parsed.projectedFtpGain : null,
    weeks: safeWeeks,
  };

  await saveSeasonPlan(plan);
  return plan;
}
