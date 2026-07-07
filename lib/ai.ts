/**
 * Thin client for the Claude API, used by the AI Insights feature.
 *
 * Only an aggregated, numeric summary of the rider's recent rides is ever
 * sent here - no raw GPS data, no ride files, nothing beyond what's already
 * shown on the dashboard itself (first name, FTP, weight, and per-ride
 * date/sport/distance/duration/avg power/elevation).
 */

import type { TrainingLoadSummary } from "./training-load";
import { mondayOfCurrentWeek, type PhaseInfo } from "./periodization";
import type { AdherenceSummary } from "./adherence";
import type { RiderTrainingProfile } from "./rider-profile";
import { GOAL_LABELS, SESSION_LENGTH_LABELS, SESSION_LENGTH_MINUTES, SPORT_LABELS, DAYS_RANGE_MID } from "./rider-profile";
import type { HRTrendAnalysis } from "./stats";
import type { WorkoutStructureBlock } from "./zwo";
import { WORKOUT_LIBRARY_PROMPT } from "./coaching-knowledge";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export class AiInsightsError extends Error {}

export interface RideSummary {
  date?: string;
  sport?: string;
  distanceKm: number;
  durationMin: number;
  avgWatts: number;
  elevationM: number;
  /** Average heart rate for the ride, from its FIT file - null when no HR
   *  sensor data was recorded for that ride. */
  avgHeartRate?: number | null;
  /**
   * Set when this ride's heart-rate-to-power ratio was a statistical outlier
   * against the rider's own recent baseline (see lib/stats.ts,
   * flagHeartRateAnomalies). "low" = heart rate stayed unusually low for the
   * power produced that day; "high" = unusually elevated.
   */
  hrFlag?: "low" | "high";
  /** Average cadence (rpm) for the ride, from the activity API - null if unavailable. */
  avgCadence?: number | null;
  /**
   * Normalized Power (Coggan algorithm, see lib/stats.ts computeNormalizedPower)
   * computed from this ride's per-second FIT power stream - null when no
   * power-meter data was recorded that day (e.g. a run) or the ride was too
   * short for a 30s rolling window. This is the physiologically-correct
   * intensity measure for variable-effort rides (intervals, group rides) -
   * a ride can have low avgWatts but high normalizedPower if it was spiky,
   * and that gap is real training stress avgWatts alone hides.
   */
  normalizedPower?: number | null;
}

const SYSTEM_PROMPT =
  "You are an expert cycling coach and exercise physiologist analyzing a " +
  "Zwift rider's recent activity data. Your analysis is data-driven, " +
  "evidence-based, and prioritizes rider health and safety alongside " +
  "performance. " +

  // ── Per-ride HR fields ──
  "Each ride may include avgHeartRate (bpm, null if no HR sensor) and " +
  "avgWatts. Use both together: rising HR at similar power suggests " +
  "accumulating fatigue; falling HR at similar power suggests aerobic " +
  "adaptation/improving fitness. Some rides include an hrFlag: 'low' " +
  "means HR was unusually low for the power produced (compared to the " +
  "rider's own baseline); 'high' means unusually elevated. Always call " +
  "out any hrFlag ride by its specific date — never fold it silently into " +
  "a general trend summary. " +

  // ── HR trend object (the main new capability) ──
  "The input also includes an hrTrend object with these fields: " +
  "trend ('suppressed'|'improving'|'declining'|'stable'), " +
  "recentAvgHR and baselineAvgHR (bpm), recentAvgWatts and " +
  "baselineAvgWatts (watts), hrDeltaPct (% HR change from baseline to " +
  "recent — negative means HR trending down), wattsDeltaPct, " +
  "efficiencyDeltaPct (% change in watts-per-bpm ratio), and " +
  "consecutiveLowHRRides (how many of the most-recent consecutive rides " +
  "had hrFlag='low'). " +

  "Interpret hrTrend.trend as follows: " +

  "'suppressed' — This is the most serious signal. The rider's heart " +
  "rate is consistently failing to rise to its normal level despite " +
  "effort, while power output is ALSO declining. This is a blunted " +
  "cardiac autonomic response. It means the autonomic nervous system is " +
  "not driving HR up normally during exercise. The most common causes in " +
  "trained cyclists: (1) non-functional overreaching / early overtraining " +
  "syndrome — the body has accumulated too much stress without adequate " +
  "recovery; (2) onset of illness (viral or bacterial) — HR suppression " +
  "often appears 1-3 days before other symptoms; (3) severe sleep debt " +
  "or accumulated life stress; (4) significant dehydration; (5) " +
  "medications such as beta-blockers. In rare cases it can indicate " +
  "cardiac arrhythmia or autonomic dysfunction. YOU MUST call this out " +
  "clearly and specifically — do not soften it into a vague 'rest' " +
  "recommendation. Tell the rider what you are seeing (HR not responding " +
  "to effort, power declining), what it likely means (blunted autonomic " +
  "response, a red flag for overreaching or illness), what to do " +
  "(minimum 3-5 days complete rest from intensity, prioritise sleep, " +
  "hydration, and nutrition, monitor resting HR daily on waking — if " +
  "resting HR is elevated above normal by 5+ bpm that confirms " +
  "overreaching), and when to see a doctor (if pattern continues beyond " +
  "7-10 days, or if accompanied by chest discomfort, unusual breathlessness, " +
  "or irregular heartbeat). Frame this as important data the rider needed " +
  "to know, not as a failure. " +
  "If consecutiveLowHRRides >= 3, emphasise that this is a sustained " +
  "multi-ride pattern, not a one-off anomaly. " +

  "'declining' — HR rising for the same or lower power output: the " +
  "body is working harder to produce the same result. This is normal " +
  "short-term fatigue from training load accumulation. Recommend a " +
  "lighter week (lower volume, no high-intensity sessions), adequate " +
  "sleep, and good nutrition. It is NOT a health red flag unless it " +
  "persists beyond 2 weeks without improvement. " +

  "'improving' — HR falling for the same or higher power: the " +
  "cardiovascular system is adapting positively. This is the desired " +
  "training response (aerobic efficiency gain). Acknowledge it warmly " +
  "and suggest a modest progressive load increase (5-8% volume). " +

  "'stable' — HR/power relationship consistent with recent baseline. " +
  "Normal training response. Comment briefly on consistency. " +

  // ── Normalized Power cross-reference ──
  "Each ride may also include a normalizedPower field (watts, null if no " +
  "power meter that day) alongside avgWatts. A large gap where " +
  "normalizedPower is notably higher than avgWatts means the ride was " +
  "spiky/variable (intervals, group ride surges, hilly terrain) and " +
  "carried more real physiological stress than avgWatts alone suggests - " +
  "prefer normalizedPower over avgWatts when judging how hard a ride " +
  "actually was. A small gap means a steady, controlled effort. " +

  // ── Cadence cross-reference ──
  "Each ride may also include an avgCadence field (rpm, null if unavailable). " +
  "When present, use cadence as an additional signal: a declining cadence " +
  "alongside suppressed HR can indicate the rider is backing off effort " +
  "(which may explain why HR is lower), whereas maintained or rising " +
  "cadence with suppressed HR is a stronger sign of a genuine physiological " +
  "issue rather than just reduced effort. " +

  // ── General coaching instructions ──
  "The rider's data may also include cyclingLevel and/or runLevel (Zwift " +
  "XP levels) — weave it into a point below only if it's genuinely " +
  "relevant (e.g. a level-up), not as a routine mention. " +
  "OUTPUT FORMAT: return AT MOST 5 short points, one per line, separated " +
  "by a single newline character - nothing else. Each line must stand " +
  "alone as a single complete thought, roughly 6-12 words - short and " +
  "punchy, not a full sentence with clauses. Still be specific (name the " +
  "actual date/number/trend, don't generalize) but say it in as few words " +
  "as possible - cut connecting words rather than dropping the number or " +
  "date itself. Do NOT " +
  "add bullet characters, dashes, numbers, or any other line prefix - " +
  "return the bare sentences only, the interface adds its own bullet " +
  "marker. Do NOT use markdown (no **, no #, no backticks). Lead with the " +
  "most important signal: if hrTrend.trend is 'suppressed', that MUST be " +
  "the first line and must not be softened. Otherwise order points by " +
  "how actionable/important they are for this specific week, most " +
  "important first. Only include a point that adds real information - " +
  "skip filler like generic encouragement with no data behind it. Be " +
  "direct, encouraging, and evidence-based.";

export async function generateInsights(params: {
  firstName?: string;
  ftp?: number;
  weightKg?: number;
  /** Zwift cycling XP level (profile.achievementLevel / 100), if known. */
  cyclingLevel?: number;
  /** Zwift running XP level (profile.runAchievementLevel / 100), if known. */
  runLevel?: number;
  rides: RideSummary[];
  /**
   * Multi-ride HR trend analysis from lib/stats.computeHRTrend — gives the AI
   * a structured, physiologically-interpreted view of how the rider's
   * heart-rate-to-power relationship has shifted over recent rides vs their
   * historical baseline. The AI uses this to detect blunted HR response
   * (possible overreaching/illness), aerobic efficiency improvements, or
   * accumulated fatigue patterns that aren't visible in per-ride hrFlag alone.
   */
  hrTrend?: HRTrendAnalysis | null;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiInsightsError(
      "ANTHROPIC_API_KEY is not set. Add your own Anthropic API key to .env.local to enable AI insights."
    );
  }

  const userContent = JSON.stringify({
    rider: params.firstName ?? "Rider",
    ftpWatts: params.ftp ?? null,
    weightKg: params.weightKg ?? null,
    cyclingLevel: params.cyclingLevel ?? null,
    runLevel: params.runLevel ?? null,
    rides: params.rides,
    hrTrend: params.hrTrend ?? null,
  });

  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) {
    throw new AiInsightsError(`Network error calling the Claude API: ${(e as Error).message}`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new AiInsightsError(`Claude API returned HTTP ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new AiInsightsError("Unexpected response shape from the Claude API.");
  }
  return text;
}

export interface WeeklyWorkout {
  /** Monday..Sunday */
  day: string;
  /** ISO date (YYYY-MM-DD) this session actually falls on in the upcoming week. */
  date?: string;
  /** e.g. "Endurance", "Sweet Spot", "Intervals", "Recovery", "Rest" */
  type: string;
  title: string;
  durationMin: number;
  /** e.g. "65-75%" of FTP - omitted/empty for rest days. */
  targetPowerPctFtp?: string;
  description: string;
  /** Machine-readable interval structure generated by the AI. When present, ZWO
   *  generation and thumbnail rendering use these blocks directly instead of
   *  inferring structure from the type string alone. */
  structure?: WorkoutStructureBlock[];
}

export interface WeeklyPlan {
  /** ISO date (YYYY-MM-DD) of the Monday this plan covers. */
  weekOf: string;
  summary: string;
  workouts: WeeklyWorkout[];
}

/**
 * Validates and repairs the AI's raw JSON response before it ever reaches
 * the dashboard. Previously there was NO server-side check here at all - the
 * parsed JSON was cast straight to WeeklyWorkout[] and trusted completely.
 * That let two classes of bug through silently: a workout's `structure`
 * durations not summing to its stated `durationMin` (so the card shows one
 * duration while a different one gets pushed/executed), and malformed or
 * physiologically-nonsensical block values reaching the ZWO/TP pipeline.
 * This is a defensive net, not a replacement for good prompting - the system
 * prompt already instructs the model correctly; this just guarantees the
 * *data* is internally consistent even when the model drifts.
 */
function normalizeWeeklyPlan(workouts: WeeklyWorkout[]): WeeklyWorkout[] {
  const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const normalized = workouts.map((w) => {
    const isRest = w.type === "Rest" || isRestDayType(w.type);
    if (isRest || !Array.isArray(w.structure) || w.structure.length === 0) {
      return { ...w, structure: isRest ? undefined : w.structure };
    }

    // Drop any block missing the fields it needs to be usable downstream.
    const cleanBlocks = w.structure.filter((b) => {
      if (!b || typeof b.durationMin !== "number" || b.durationMin <= 0) return false;
      if (typeof b.powerFtp !== "number" || b.powerFtp <= 0) return false;
      if (!["warmup", "steadystate", "intervals", "cooldown"].includes(b.type)) return false;
      return true;
    }).map((b) => ({
      ...b,
      // Clamp to a physiologically sane range - guards against an
      // occasional hallucinated value (e.g. powerFtp: 9 instead of 0.9)
      // reaching the ZWO file or TP push.
      powerFtp: Math.min(2.2, Math.max(0.3, b.powerFtp)),
      recoveryPowerFtp: b.recoveryPowerFtp != null
        ? Math.min(1.2, Math.max(0.3, b.recoveryPowerFtp))
        : b.recoveryPowerFtp,
    }));

    if (cleanBlocks.length === 0) {
      // Nothing usable survived validation - fall back to type-based
      // inference (generateDefaultBlocks) rather than pushing garbage.
      return { ...w, structure: undefined };
    }

    // The structure is the *actual* thing that gets built into a ZWO file
    // and pushed to TP - if its total minutes disagree with the stated
    // durationMin (model arithmetic drift), trust the structure and correct
    // durationMin to match, so the card, the file, and the TP push all agree
    // on one real number instead of three different ones.
    const structuredMin = cleanBlocks.reduce((sum, b) => sum + b.durationMin, 0);
    const durationMin = structuredMin > 0 ? Math.round(structuredMin) : w.durationMin;

    return { ...w, structure: cleanBlocks, durationMin };
  });

  // Guarantee exactly 6 entries - the UI is a fixed 6-card grid.
  while (normalized.length < 6) {
    const day = DAY_ORDER[normalized.length % 7] ?? `Day ${normalized.length + 1}`;
    normalized.push({ day, type: "Rest", title: "Rest Day", durationMin: 0, description: "", structure: undefined });
  }
  return normalized.slice(0, 6);
}

function isRestDayType(type: string | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("rest");
}

const WEEKLY_PLAN_SYSTEM_PROMPT =
  "CRITICAL: ALL output — every title, description, type, and rationale field — " +
  "MUST be written in English only. Never use Hebrew or any other language, " +
  "even if the rider's note is written in Hebrew. Translate any Hebrew input to " +
  "English for internal understanding, but always respond in English.\n\n" +
  "You are a cycling coach building a personalized one-week Zwift training " +
  "plan for a rider, based on their recent ride history (avgWatts, " +
  "avgHeartRate, distanceKm, durationMin, elevationM, date per ride) and " +
  "their FTP/weight/level/ageYears. The input also includes weekOfMonday " +
  "(YYYY-MM-DD, the Monday of the upcoming week this plan covers), a " +
  "separate today field (YYYY-MM-DD, the actual real-world current date), " +
  "and a weekDates object - a precomputed lookup mapping each day name " +
  "(Monday..Sunday) directly to its exact calendar date for THIS plan's " +
  "week, e.g. {\"Monday\":\"2026-07-06\",...,\"Sunday\":\"2026-07-12\"}. " +
  "ALWAYS use weekDates directly for a workout's date field and for " +
  "resolving any day name mentioned in riderNote (e.g. 'Sunday', " +
  "'Wednesday') - never compute it yourself via addition on weekOfMonday. " +
  "This matters: date arithmetic done in free-form reasoning has produced " +
  "real, hard-to-notice bugs before (a request naming one day silently " +
  "landing on the wrong one), which is exactly why weekDates is handed to " +
  "you pre-computed. Use today (not weekOfMonday, not arithmetic) only to " +
  "resolve a RELATIVE reference in riderNote such as 'today' or 'tomorrow' " +
  "- for 'tomorrow', take the calendar date one day after today and match " +
  "it against weekDates' values to find which day name that is, since " +
  "today can fall anywhere inside or before the plan's week (e.g. " +
  "requesting a mid-week update). The input also " +
  "includes a trainingLoad " +
  "object - {ctl, atl, tsb, freshness, ridesLast7Days, ridesPrior7Days} - " +
  "computed directly from the rider's ride history (a simplified version " +
  "of the standard cycling ATL/CTL/TSB training-load model: ctl is " +
  "longer-window 'fitness', atl is short-window recent 'fatigue', tsb = " +
  "ctl - atl is the freshness balance). Treat this object as the " +
  "authoritative signal for how fresh or fatigued the rider currently is - " +
  "do not re-derive fatigue yourself from the raw ride list. " +
  "SESSION COUNT: if riderProfile.daysPerWeek is present, that is the " +
  "rider's own deliberate, explicitly-configured choice and is the " +
  "AUTHORITATIVE target for this week's session count starting with THIS " +
  "plan - schedule that many training days now, not a gradual ramp toward " +
  "it over future weeks. Only schedule fewer than daysPerWeek when " +
  "trainingLoad clearly justifies it (freshness is 'fatigued', or tsb is " +
  "clearly negative, or this is a scheduled Recovery week - see cycle " +
  "below) - and when you do, the summary MUST say so explicitly and by " +
  "name, e.g. 'You asked for 5-6 sessions this week; your current fatigue " +
  "signal (TSB -18) suggests scaling back to 4 for now - back to your full " +
  "target once you're fresher.' Never silently schedule fewer sessions " +
  "than daysPerWeek without stating the specific reason in the summary - a " +
  "rider who set a target and gets fewer days with no explanation has no " +
  "way to tell a deliberate decision from a bug. If riderProfile is absent " +
  "or daysPerWeek is null, fall back to basing session COUNT (anywhere " +
  "from 2 to 7) on ridesLast7Days/ridesPrior7Days instead, rounded to a " +
  "sensible number - a rider whose ridesLast7Days is around 3 should get " +
  "roughly that, not suddenly 6. Sunday is a valid training day — never " +
  "default it to rest unless the session count is already reached. In either case: when freshness is " +
  "'fatigued' or tsb is clearly negative, build a lighter week (fewer " +
  "and/or easier sessions, more recovery) and say so briefly in the " +
  "summary. When freshness is 'fresh' (clearly positive tsb) and recent " +
  "rides otherwise look stable or improving, a normal 5-10% progression in " +
  "total weekly volume is appropriate. When freshness is 'neutral', hold " +
  "this week's volume roughly steady. " +
  "The input also includes a cycle object - {phase, weekInMesocycle, " +
  "weeksToEvent} - tracking where this week sits in a recurring 4-week " +
  "mesocycle: 'Base' (early mesocycle, building aerobic foundation), " +
  "'Build' (later mesocycles, progressive overload), 'Recovery' (the " +
  "scheduled lighter 4th week of the mesocycle), 'Taper', or 'RaceWeek'. " +
  "weeksToEvent (whole weeks until the rider's target event, already " +
  "computed - never recompute it yourself from eventDate) is only non-null " +
  "when phase is 'Taper' or 'RaceWeek', or as informational context " +
  "otherwise; ignore it when null. " +
  "When phase is 'Recovery', this week's plan " +
  "MUST be a deliberately reduced-load week - cut total weekly volume by " +
  "roughly 40-60% versus this rider's recent normal week while keeping a " +
  "small amount of intensity (not a total off week) - regardless of how " +
  "fresh trainingLoad says they are - and the summary must say this is a " +
  "scheduled recovery week. " +
  "When phase is 'Taper' (event is 2-3 weeks away): reduce total weekly " +
  "volume progressively (roughly 20-30% below this rider's recent normal " +
  "week, more the closer weeksToEvent gets to 0) while KEEPING some " +
  "race-pace intensity - short, sharp touches of threshold/VO2max work, " +
  "not high volume of it. Losing fitness during a short taper is a much " +
  "smaller risk than carrying fatigue into the event; when in doubt, cut " +
  "volume before cutting intensity. State clearly in the summary that " +
  "this is a taper week counting down to their event. " +
  "When phase is 'RaceWeek' (event is this week or next): this week's " +
  "training load must be minimal - short, easy rides plus at most one " +
  "brief activation session ('Race Day Opener' from the workout library) " +
  "placed 1-2 days before the event date itself; the event day and the day " +
  "immediately after should be full rest (schedule the event day itself as " +
  "a Rest Day in the plan - the rider records the actual event separately). " +
  "No new training stress this week under any circumstances, regardless of " +
  "how fresh trainingLoad looks. State the event is imminent in the summary " +
  "and wish them well. " +
  "Otherwise (Base/Build, no imminent event), use phase only as light " +
  "supporting context alongside trainingLoad: an early 'Build' week can " +
  "lean into progression a bit more confidently than a later one, and " +
  "'Base' weeks should lean toward easy endurance riding plus a small " +
  "amount of genuinely hard work with little time at in-between " +
  "threshold/sweet-spot intensity, while 'Build' weeks can bring in more " +
  "threshold/sweet-spot sessions alongside the endurance and hard " +
  "intervals. trainingLoad/ridesLast7Days remain the primary drivers of " +
  "this week's actual content outside Taper/RaceWeek. " +
  "The input may also include a lastWeekAdherence object - " +
  "{plannedSessions, completedSessions, missedSessions, notes} - comparing " +
  "last week's plan against what the rider actually rode (notes are short, " +
  "specific call-outs, e.g. a particular day's session not completed, " +
  "completed much shorter than planned, completed at the wrong intensity, " +
  "or rode on a scheduled rest day). When present, use it as real feedback " +
  "on whether last week's plan actually fit this rider: if a hard session " +
  "type was repeatedly missed or cut short, that's a signal it was too " +
  "ambitious - ease that specific session type back this week rather than " +
  "repeating the same miss. If everything was completed as planned (or " +
  "more), that supports the normal progression. Briefly acknowledge any " +
  "clear pattern from lastWeekAdherence in the summary, but stay " +
  "encouraging, not punitive - missing a session is data, not a failure. " +
  "Absent/null lastWeekAdherence just means there's nothing to compare yet " +
  "(first plan, or regenerating the same week) - proceed normally. " +
  "The input may also include a riderProfile object - {sport, goal, daysPerWeek, " +
  "sessionLengthLabel, sessionLengthMinutes, eventDate, notes} - containing " +
  "the rider's own stated training intent. When present, use it as a strong " +
  "personalisation signal: (1) daysPerWeek is handled above under SESSION " +
  "COUNT - it's authoritative starting with this plan, not a gradual ramp; " +
  "(2) cap every planned session at sessionLengthMinutes - never schedule a " +
  "session longer than this value; " +
  "(3) let goal colour session type emphasis: 'Increase FTP' -> more " +
  "threshold/sweet-spot blocks; 'Lose weight / body composition' -> more " +
  "moderate-duration aerobic rides; 'Prepare for an event' -> build toward " +
  "event-specific demands; 'General fitness' or 'Fun/enjoyment' -> balanced " +
  "variety; " +
  "(4) whether and how close a target event is comes from cycle.phase/" +
  "weeksToEvent (see above), already computed - Taper/RaceWeek phase " +
  "handling there is authoritative, don't separately judge closeness from " +
  "the raw eventDate string here; " +
  "(5) if notes is present and non-empty, read it for extra rider context " +
  "(injuries, preferences, schedule constraints) and adjust accordingly. " +
  "The sport field tells you the rider's primary discipline: 'Cycling' " +
  "means plan only cycling sessions (Zwift rides); 'Running' means plan " +
  "only running sessions; 'Cycling & Running' means mix both. Never " +
  "mix sports unless sport is 'Cycling & Running'. " +
  "The input may also include a trainingEnvironment field on riderProfile: " +
  "'indoor' means the rider only trains on Zwift/a trainer - every single " +
  "session must be fully executable indoors on Zwift (never prescribe " +
  "outdoor-only sessions like real-road group rides, hill repeats on " +
  "actual terrain, or trail/open-water work); 'outdoor' means the rider " +
  "trains outdoors only (real rides/runs tracked via Garmin) - prescribe " +
  "outdoor-appropriate sessions freely (terrain-based efforts, long routes, " +
  "weather-dependent pacing) and note in each session's description that " +
  "it's an outdoor session; 'both' means mix venues deliberately - use " +
  "Zwift for structured interval/threshold work where exact power control " +
  "matters, and outdoor for long endurance rides/runs or terrain-specific " +
  "work, stating the intended venue (Zwift vs outdoor) in every session " +
  "description so the rider knows where to do it. Absent/null " +
  "trainingEnvironment defaults to 'indoor' - treat every session as " +
  "Zwift-only in that case. " +
  "Running plan structure (apply when sport is 'Running' or 'Cycling & " +
  "Running'): follow Hal Higdon-style progressive principles. " +
  "(1) The long run is the anchor - always the slowest session " +
  "(conversational easy, 60-70% HRmax), never raced; schedule it on " +
  "Sunday or the last run day of the week. " +
  "(2) Increase weekly running distance max 10% per week (the 10% rule " +
  "- violating this is injury cause #1). " +
  "(3) Cross-training days are Zwift cycling sessions at Z1-Z2: for " +
  "10K and half-marathon goals, plan Foundation/Recovery Zwift rides on " +
  "cross-train days (Wed/Sat). This perfectly fits 'Cycling & Running'. " +
  "(4) Long run day = no Zwift cycling that day. " +
  "(5) Running session count by goal: 5K goal = 3 runs/week; 10K goal " +
  "= 3 runs + 2 cross-train; half marathon = 4 runs + 1-2 cross-train " +
  "days. Never schedule more than 4 running sessions per week for novice " +
  "or intermediate runners. " +
  "(6) Running easy-day sessions are 'Easy Run' type, long run is " +
  "'Long Run' type, tempo/harder runs are 'Tempo Run' type. " +
  "Absent/null riderProfile means no profile set - proceed normally. " +
  "The input may also include a riderNote field - free text the rider " +
  "typed just before requesting this specific plan. The riderNote field " +
  "is the HIGHEST PRIORITY input in the entire request - it overrides " +
  "default periodization, phase rules, and even rest days. Always start " +
  "your summary with a sentence explicitly stating what the rider asked " +
  "for and exactly how you honored it. Two kinds of note are common: " +
  "(1) how they feel right now (e.g. 'tired legs', 'feeling great', 'sore " +
  "back', or the same in any language including Hebrew) - adjust this " +
  "week's intensity/volume accordingly, same as a fatigue signal; " +
  "(2) an explicit scheduling request naming a day or relative date " +
  "(e.g. 'put a hard workout tomorrow', 'I need Thursday off', 'long ride " +
  "on Saturday', 'add a ride on Sunday in addition to what's already " +
  "there', 'cancel Friday', or in Hebrew: 'אימון מחר', 'מנוחה ביום חמישי', " +
  "'תוסיף רכיבה ביום ראשון', 'בטל פעילות בשישי', 'תכניס פעילות בשבת') - " +
  "Hebrew day names map directly to English weekDates keys: " +
  "ראשון=Sunday, שני=Monday, שלישי=Tuesday, רביעי=Wednesday, " +
  "חמישי=Thursday, שישי=Friday, שבת=Saturday. " +
  "Resolve the named/relative day to its exact calendar date using weekDates " +
  "(a named day is a direct weekDates lookup; a relative day like 'tomorrow' " +
  "resolves via today first), then UNCONDITIONALLY apply the change on that " +
  "exact date: 'cancel'/'בטל'/'הסר' means make it a rest day; " +
  "'add'/'תכניס'/'הוסף' means add a workout (replacing rest if needed). " +
  "A request phrased as 'in addition to' or 'as well as' the existing plan " +
  "means: change ONLY that one day, leave every other day's session exactly " +
  "as you'd otherwise have scheduled it. " +
  "If the rider asks for a workout tomorrow and tomorrow currently has no " +
  "workout, add one. If they ask for a rest day on a workout day, make it " +
  "rest. A day-specific request ALWAYS overrides the daysPerWeek session " +
  "count cap. The rider knows their own schedule. " +
  "The only exceptions: two hard sessions back-to-back (insert easy " +
  "session in between) or Recovery-week volume cap - in those cases get as " +
  "close as safely possible and explain why in the summary. " +
  "Absent/null riderNote means no note - proceed normally. " +
  "For any day at or before the today field that already has a matching " +
  "ride in the rides array (same date), that day is already history, not " +
  "a live prescription - do not invent an unrelated placeholder title/type " +
  "for it (e.g. labelling it 'Foundation Ride' when the rider actually rode " +
  "something else that day). Keep that day's title/type consistent with " +
  "what the rides data suggests was actually done (infer session type from " +
  "its avgWatts relative to ftpWatts if nothing more specific is knowable), " +
  "and write its description as a short retrospective note on that ride " +
  "rather than a forward-looking prescription. " +

  // ── Rider W/kg classification ──
  "The input includes a wPerKg field (FTP ÷ body weight in kg). Use it to " +
  "classify the rider before choosing sessions: " +
  "< 2.5 W/kg = beginner (Foundation, Tempo, Sprint Builder only; no threshold or VO2max; " +
  "sweet spot maximum 3×10 min in late Build); " +
  "2.5-3.0 W/kg = novice (add Sweet Spot Classic, Micro Intervals, 30/30 Blitz; " +
  "Threshold Cruise Intervals only in late Build at TSB ≥ -8); " +
  "3.0-3.5 W/kg = intermediate (full sweet spot range + Threshold Development + " +
  "Threshold Cruise Intervals + 4×4 Two-Set; Norwegian 4×4 only if TSB ≥ 0); " +
  "3.5+ W/kg = trained/advanced (full library including Norwegian 4×4, 2×20 FTP Blocks, " +
  "Over-Under Intervals, Descending Threshold). " +
  "If wPerKg is null, infer from ftpWatts: < 150 W = beginner, " +
  "150-220 W = novice/intermediate, > 220 W = trained. " +
  "Always mention the rider's W/kg level in the plan summary (e.g. 'At 3.2 W/kg " +
  "you're in the intermediate range — this week introduces Threshold Development.') " +

  // ── Named workout library ──
  WORKOUT_LIBRARY_PROMPT + " " +

  "The workout name in the 'title' field MUST match a name from the library " +
  "above (e.g. 'Sweet Spot Classic', 'Norwegian 4×4', 'Foundation Ride'). " +
  "Do NOT invent generic names like 'Endurance Ride' or 'Interval Session'. " +
  "The 'type' field should still be one of the standard categories: " +
  "'Endurance'/'Foundation', 'Tempo', 'Threshold', 'Sweet Spot', 'VO2', " +
  "'Intermittent', 'Strength'/'Neuromuscular', 'Recovery', or 'Rest'. " +
  "The 'description' field is a SHORT coaching note — max 2 sentences, " +
  "35 words total. Sentence 1: one specific reason this session fits the " +
  "rider RIGHT NOW (fatigue, phase, or last week). Sentence 2: one key " +
  "execution cue. Example: 'TSB -6 means today is easy — Z2 only, no surges. " +
  "Hit 100-110 rpm on the cadence blocks and back off if breathing gets laboured.' " +
  "Never write paragraphs. Never repeat what title/type already say. " +
  "POWER ZONE RULE: All power targets MUST use % FTP or Coggan zone " +
  "names (Z1-Z7), never absolute watt values (not '200W' - FTP varies " +
  "per rider). Sweet spot is sustained 10-30 min blocks at 84-97% FTP " +
  "(NOT short sprint efforts). " +
  "Apply standard periodization following Zwift's own official plan " +
  "structure (FTP Builder, Build Me Up). Key rules: " +
  "(1) 80% of weekly volume in Z1-Z2 (Foundation/Recovery sessions), " +
  "only 20% hard - never invert this ratio. " +
  "(2) Never schedule two hard sessions on consecutive days. Always put " +
  "a Foundation or Recovery session between hard efforts. " +
  "(3) Weekly sequence: hard day -> easy day -> hard day -> easy day. " +
  "(4) Workout type progression by goal: " +
  "FTP goal beginner (weeks 1-3): Foundation + Strength + Tempo only. " +
  "FTP goal weeks 4+: add Intermittent (30s on/off). " +
  "FTP goal weeks 5+: add Threshold Development (4-8min Z4 intervals). " +
  "Weight/fitness goal: prioritize long Z2 Foundation blocks (fat-burning), " +
  "add Tempo for caloric burn, keep Strength for metabolism. " +
  "IMPORTANT: even for weight/fitness goals, always include at least 1 " +
  "structured session per week (Tempo or Sweet Spot) - a week of pure " +
  "Z2 rides is monotonous and less effective for adaptation. Vary the " +
  "stimulus: one hard-ish day makes the easy days actually count. " +
  "Event goal: 4+ weeks out = volume; 2-3 weeks out = Sweet Spot/Threshold; " +
  "1 week out = taper (cut volume 40-50%, keep one short sharp effort). " +
  "(5) Session count cap: max 2-3 hard (Threshold/VO2/Sweet Spot/ " +
  "Intermittent) sessions per week for recreational riders. " +
  "(6) Volume ramp: increase total weekly duration max 10% per week " +
  "during load blocks. Never increase volume AND intensity same week. " +
  "Some rides may include a normalizedPower field (watts) alongside " +
  "avgWatts - when normalizedPower is notably higher than avgWatts, that " +
  "ride was variable/spiky (real interval or group-ride effort, not a " +
  "steady spin) and carried more true stress than avgWatts implies; " +
  "trainingLoad.ctl/atl/tsb already account for this (they're computed " +
  "from normalizedPower when available), so you don't need to re-derive " +
  "fatigue from it yourself - just use it, when present, to judge whether " +
  "a specific recent ride was a hard effort worth acknowledging by name. " +
  "If ageYears is provided and is 40 or above, lean toward an extra " +
  "recovery day between hard sessions, since recovery generally slows with " +
  "age. Some rides may include an hrFlag field: 'low' means that ride's " +
  "heart rate was unusually low for the power produced compared to the " +
  "rider's own recent rides (possible fatigue, illness, or a sensor " +
  "issue); 'high' means the opposite. Treat one or more recent hrFlag " +
  "rides as a real signal to build a lighter week (fewer/easier sessions, " +
  "more recovery, less high intensity) and mention this reasoning briefly " +
  "in the summary. The input also includes an hrTrend object — " +
  "if hrTrend.trend is 'suppressed' (HR not rising to meet effort AND " +
  "power declining), build a VERY light recovery week: Z1-Z2 only, no " +
  "intervals at all, max 3 sessions, and state clearly in the summary " +
  "that a blunted HR response was detected and this week is a mandatory " +
  "recovery week; if trend is 'declining', cut volume ~20% and drop hard " +
  "intervals; if trend is 'improving' or 'stable', proceed normally with " +
  "trainingLoad/phase guidance. Each planned session should also make sense in " +
  "relation to the others in the week (e.g. a long endurance ride " +
  "followed by a rest day, then a moderate session before the next hard " +
  "effort) rather than a random unconnected list - briefly note the " +
  "week's overall shape/logic in the summary. " +
  "Respond with ONLY valid JSON (no markdown, no code fences, no " +
  "commentary) matching exactly this shape: " +
  '{"summary": string (2-3 sentences. ALWAYS open by naming the specific ' +
  'signals that drove this plan, e.g. "Based on 4 rides last week, a ' +
  'neutral TSB of -3, and your Base phase week 1, this week..." — ' +
  'the rider must immediately see WHY this plan was built for them ' +
  'personally, not for a generic athlete. Then describe the week shape.), ' +
  '"workouts": [{"day": string ' +
  '(Monday..Sunday), "date": string (YYYY-MM-DD, the actual calendar date ' +
  'for that day in the upcoming week), "type": string, "title": string, ' +
  '"durationMin": number, "targetPowerPctFtp": string (e.g. "65-75%", ' +
  'omit/empty for rest days), ' +

  // ── Description: the most important field for plan quality ──
  '"description": string — THIS IS THE MOST IMPORTANT FIELD. ' +
  'Write 2-3 sentences that feel like a personal message from a coach who actually studied this rider\'s data. ' +
  'SENTENCE 1 — WHY NOW: reference one specific data point (e.g. their exact TSB value, the number of rides last ' +
  'week, their training phase/week number, their age, their W/kg level, a recent HR flag, or an adherence note from last week). ' +
  'SENTENCE 2 — HOW: one sharp, precise execution cue for the hardest part of this workout — exact % FTP target, ' +
  'cadence, pacing strategy, or what to do if power fades (draw from the workout\'s own execution cue in the library). ' +
  'SENTENCE 3 (optional but strongly encouraged) — FEEL: what success looks like, or a heads-up about what will be hard ' +
  'and what to do if it is (draw from the workout\'s successFeel in the library). ' +
  'NEVER write generic statements like "Build aerobic base at easy pace," "Improve fitness with intervals," or ' +
  '"This session targets your aerobic system." These are content-free and destroy plan quality. ' +
  'RIGHT example — Foundation ride, TSB +6, Base wk 2: "TSB is at +6 and you\'re in Base week 2 — ' +
  'your aerobic system is fresh and ready to absorb volume without fatiguing. ' +
  'Hold 65-73% FTP for the full 40 minutes; cadence 88-95 rpm; if you can\'t speak in full sentences, ' +
  'you\'re above Z2 — back off. ' +
  'You should finish feeling like you could ride 30 more minutes — if you do, the pace was exactly right." ' +
  'RIGHT example — Threshold Development, TSB -8, 3 consecutive hard weeks: "Three hard weeks in a row have ' +
  'dropped your TSB to -8, so I\'m keeping the blocks short (4×8 min) rather than jumping to 2×20 — ' +
  'you\'ll get the same threshold stimulus with less recovery debt. ' +
  'Start block 1 at 97% FTP — your ego will want to push harder immediately, don\'t; ' +
  'the first block is a calibration, not a sprint. ' +
  'If power fades more than 5% in the last 2 minutes of any block, end that block early — quality beats duration here." ' +
  'The description MUST be specific to THIS rider on THIS week — not a Wikipedia entry about the workout type.), ' +

  '"structure": array of workout blocks (REQUIRED for all non-rest sessions, ' +
  "omit only for type='Rest' days). Each element: " +
  '{"type":"warmup"|"steadystate"|"intervals"|"cooldown",' +
  '"durationMin":number (total block minutes; for intervals: repeats*(onSec+offSec)/60),' +
  '"powerFtp":number (power as fraction of FTP — e.g. 0.90=90%, 1.10=110%),' +
  '"label":string (use the exact interval format in the label, e.g. "4×8 min @ 100% FTP"), ' +
  'and for intervals also: "repeats":number,"onSec":number,' +
  '"offSec":number,"recoveryPowerFtp":number}. ' +
  "CRITICAL: sum of all structure[].durationMin MUST equal the workout's durationMin. " +
  "VARIETY: choose the specific library variant that matches this rider's current load and progression. " +
  "If this rider had Sweet Spot Classic (3×10 min) last week, use Extended Sweet Spot (2×20 min) or Sweet Spot Progression (10+15+20 min) this week — never repeat the same interval pattern two weeks running. " +
  "The structure should reflect the EXACT protocol from the named workout library (correct repeats, durations, power targets). " +
  "Example (75-min VO2max): structure:[" +
  '{"type":"warmup","durationMin":15,"powerFtp":0.60,"label":"Easy warm-up"},' +
  '{"type":"intervals","durationMin":50,"powerFtp":1.10,' +
  '"recoveryPowerFtp":0.50,"repeats":5,"onSec":300,"offSec":300,' +
  '"label":"5×5 min @ 110% FTP"},{"type":"cooldown","durationMin":10,' +
  '"powerFtp":0.55,"label":"Easy cool-down"}]}] ' +
  "(HARD LIMIT: always return EXACTLY 6 entries total. " +
  "Include actual sessions for riding/running days, and use " +
  "type='Rest', title='Rest Day', durationMin=0 for the remaining days " +
  "until you have 6 total. The UI displays a fixed 6-card grid — " +
  "returning fewer breaks the layout. " +
  "INTERVAL QUALITY: at least 1 session per week must be a genuine " +
  "interval workout (Threshold, Sweet Spot, VO2, or Intermittent) " +
  "with a structure array containing an intervals block with real " +
  "repeats, onSec, and offSec values (e.g. repeats:5, onSec:300, offSec:180). " +
  "Even in Base phase, 1 hard session with intervals is required. " +
  "Riders should feel challenged, engaged, and coached — not like they got a generic template.)}";

export async function generateWeeklyPlan(params: {
  firstName?: string;
  ftp?: number;
  weightKg?: number;
  cyclingLevel?: number;
  runLevel?: number;
  /** Rider's age in years, if they've chosen to provide it - not exposed by
   *  the Zwift API, so this only arrives when the rider enters it manually. */
  ageYears?: number;
  rides: RideSummary[];
  /** Computed once in code (lib/training-load.ts) from `rides` + `ftp` -
   *  the authoritative freshness/frequency signal, see WEEKLY_PLAN_SYSTEM_PROMPT. */
  trainingLoad?: TrainingLoadSummary;
  /** Computed once in code (lib/periodization.ts) from the rider's stored
   *  macro-cycle position - which mesocycle week this is, see
   *  WEEKLY_PLAN_SYSTEM_PROMPT. */
  cycle?: PhaseInfo;
  /** Computed once in code (lib/adherence.ts) by comparing last week's
   *  cached plan against what the rider actually rode - absent on this
   *  rider's first-ever plan, or when generating again within the same week. */
  lastWeekAdherence?: AdherenceSummary;
  /** The rider's stated training profile (goal, available days, session
   *  length, optional target event date, free notes) - absent if the rider
   *  hasn't filled in the profile card yet. */
  riderProfile?: RiderTrainingProfile;
  /** Free-text note the rider typed before regenerating - how they feel
   *  today (e.g. "tired legs", "feeling great", "sore back"). The plan
   *  should take this into account when scheduling intensity. */
  riderNote?: string;
  /** Override for which Monday this plan covers - "YYYY-MM-DD". Used by the
   *  dashboard's rolling 6-day-ahead window to pre-generate *next* week's
   *  plan a few days early (once the current week's remaining days can no
   *  longer fill the display) without waiting for that week to actually
   *  start. Defaults to the real current week when omitted. */
  targetWeekOf?: string;
}): Promise<WeeklyPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiInsightsError(
      "ANTHROPIC_API_KEY is not set. Add your own Anthropic API key to .env.local to enable AI-generated weekly plans."
    );
  }

  // Monday of the week this plan covers (UTC) - computed up front and handed
  // to the model so it can fill in each workout's real calendar "date"
  // instead of guessing what date "Wednesday" falls on. Shared with
  // lib/periodization.ts so the cached plan's weekOf, the macro-cycle
  // pointer, and this prompt's date math never drift apart.
  const weekOfMonday = params.targetWeekOf ?? mondayOfCurrentWeek();

  // Precomputed day-name -> exact date lookup for this plan's week, handed
  // to the model instead of asking it to add N days to weekOfMonday itself.
  // This project has repeatedly hit real bugs from LLM-computed date
  // arithmetic (see ensureWorkoutDates in lib/plan-shape.ts and resolvePhase
  // in lib/periodization.ts for two earlier instances) - a rider note
  // naming a specific day ("add a ride on Sunday") is the one remaining
  // place that arithmetic could still happen inside the model's own
  // reasoning rather than in code, since free-text day-name resolution
  // can't be moved to code entirely. Removing the *arithmetic* step (a
  // lookup instead of addition) closes that gap as much as possible for a
  // model call that fundamentally still has to parse natural language.
  const weekDates: Record<string, string> = {};
  {
    const base = new Date(weekOfMonday + "T00:00:00Z");
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    dayNames.forEach((day, i) => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + i);
      weekDates[day] = d.toISOString().slice(0, 10);
    });
  }

  const userContent = JSON.stringify({
    rider: params.firstName ?? "Rider",
    ftpWatts: params.ftp ?? null,
    weightKg: params.weightKg ?? null,
    /** W/kg rider level: < 2.5 beginner, 2.5-3.0 novice, 3.0-3.5 intermediate, 3.5+ trained/advanced */
    wPerKg: (params.ftp && params.weightKg && params.weightKg > 0)
      ? Math.round((params.ftp / params.weightKg) * 10) / 10
      : null,
    ageYears: params.ageYears ?? null,
    cyclingLevel: params.cyclingLevel ?? null,
    trainingLoad: params.trainingLoad
      ? {
          ctl: params.trainingLoad.ctl,
          atl: params.trainingLoad.atl,
          tsb: params.trainingLoad.tsb,
          freshness: params.trainingLoad.freshness,
          ridesLast7Days: params.trainingLoad.ridesLast7Days,
          ridesPrior7Days: params.trainingLoad.ridesPrior7Days,
        }
      : null,
    cycle: params.cycle
      ? {
          phase: params.cycle.phase,
          weekInMesocycle: params.cycle.weekInMesocycle,
          weeksToEvent: params.cycle.weeksToEvent ?? null,
        }
      : null,
    lastWeekAdherence: params.lastWeekAdherence
      ? {
          plannedSessions: params.lastWeekAdherence.plannedSessions,
          completedSessions: params.lastWeekAdherence.completedSessions,
          missedSessions: params.lastWeekAdherence.missedSessions,
          notes: params.lastWeekAdherence.notes,
        }
      : null,
    riderProfile: params.riderProfile
      ? {
          sports: (params.riderProfile.sports ?? (params.riderProfile.sport ? [params.riderProfile.sport] : ["cycling"]))
            .map(s => SPORT_LABELS[s])
            .join(" + "),
          goals: (params.riderProfile.goals ?? (params.riderProfile.goal ? [params.riderProfile.goal] : ["fitness"]))
            .map(g => GOAL_LABELS[g])
            .join(", "),
          daysPerWeek: params.riderProfile.daysRange
            ? DAYS_RANGE_MID[params.riderProfile.daysRange]
            : (params.riderProfile.daysPerWeek ?? null),
          trainingEnvironment: params.riderProfile.environment ?? "indoor",
          sessionLengthLabel: SESSION_LENGTH_LABELS[params.riderProfile.sessionLength],
          sessionLengthMinutes: SESSION_LENGTH_MINUTES[params.riderProfile.sessionLength],
          eventDate: params.riderProfile.eventDate ?? null,
          ageYears: params.riderProfile.ageYears ?? null,
          notes: params.riderProfile.notes ?? null,
        }
      : null,
    runLevel: params.runLevel ?? null,
    weekOfMonday,
    weekDates,
    today: new Date().toISOString().slice(0, 10),
    rides: params.rides,
    riderNote: params.riderNote ?? null,
  });

  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: WEEKLY_PLAN_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) {
    throw new AiInsightsError(`Network error calling the Claude API: ${(e as Error).message}`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new AiInsightsError(`Claude API returned HTTP ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new AiInsightsError("Unexpected response shape from the Claude API.");
  }

  // Extract the JSON object robustly: find the outermost { ... } block.
  // This handles code-fence wrappers, preamble text, or any other extra
  // content the model may add around the JSON object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AiInsightsError("Could not parse the AI's weekly plan response.");
  }
  const cleaned = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Include the tail of the raw response so we can diagnose truncation vs. malformed JSON.
    const tail = cleaned.slice(-300);
    throw new AiInsightsError(`Parse failed. Response tail: ${tail}`);
  }

  const obj = parsed as Partial<WeeklyPlan>;
  if (!obj || !Array.isArray(obj.workouts)) {
    throw new AiInsightsError("AI response was missing the expected weekly plan structure.");
  }

  return {
    weekOf: weekOfMonday,
    summary: typeof obj.summary === "string" ? obj.summary : "",
    workouts: normalizeWeeklyPlan(obj.workouts as WeeklyWorkout[]),
  };
}
