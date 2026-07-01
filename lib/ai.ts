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
   * power produced that day (possible fatigue, illness, or a sensor issue);
   * "high" = the opposite (heart rate unusually elevated for that power).
   * Undefined/omitted means nothing unusual was detected for that ride.
   */
  hrFlag?: "low" | "high";
}

const SYSTEM_PROMPT =
  "You are a cycling coach analyzing a Zwift rider's recent activity data. " +
  "Each ride may include an avgHeartRate field (bpm, null if no HR sensor " +
  "data exists for that ride) alongside avgWatts - use both together to " +
  "comment on training effort and efficiency (e.g. rising heart rate at a " +
  "similar power suggests fatigue, falling heart rate at a similar power " +
  "suggests improving fitness). Some rides may also include an hrFlag field: " +
  "'low' means that ride's heart rate was unusually low for the power " +
  "produced, compared to the rider's own recent rides - worth calling out " +
  "specifically by date as a possible early sign of fatigue, illness, or a " +
  "heart-rate sensor issue, not just folded into a general trend comment; " +
  "'high' means the opposite (heart rate unusually elevated for that power, " +
  "e.g. early fatigue, heat, dehydration, or stress). Always mention any " +
  "hrFlag ride by its specific date when present - don't omit it even if " +
  "the overall trend looks fine. The rider's data may also include " +
  "cyclingLevel and/or runLevel (their Zwift XP level for each discipline) " +
  "- when present, weave a brief, natural mention of level/progression into " +
  "the analysis rather than just listing the number. Identify trends " +
  "(improving or declining), notable rides, and give 2-3 specific, " +
  "actionable suggestions for next week's training. Be concise and " +
  "encouraging. Under 200 words, plain prose, no markdown.";

export async function generateInsights(params: {
  firstName?: string;
  ftp?: number;
  weightKg?: number;
  /** Zwift cycling XP level (profile.achievementLevel / 100), if known. */
  cyclingLevel?: number;
  /** Zwift running XP level (profile.runAchievementLevel / 100), if known. */
  runLevel?: number;
  rides: RideSummary[];
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
}

export interface WeeklyPlan {
  /** ISO date (YYYY-MM-DD) of the Monday this plan covers. */
  weekOf: string;
  summary: string;
  workouts: WeeklyWorkout[];
}

const WEEKLY_PLAN_SYSTEM_PROMPT =
  "You are a cycling coach building a personalized one-week Zwift training " +
  "plan for a rider, based on their recent ride history (avgWatts, " +
  "avgHeartRate, distanceKm, durationMin, elevationM, date per ride) and " +
  "their FTP/weight/level/ageYears. The input also includes weekOfMonday " +
  "(YYYY-MM-DD, the Monday of the upcoming week this plan covers) - use it " +
  "to compute each workout's real calendar date (Monday=weekOfMonday, " +
  "Tuesday=weekOfMonday+1, etc). The input also includes a trainingLoad " +
  "object - {ctl, atl, tsb, freshness, ridesLast7Days, ridesPrior7Days} - " +
  "computed directly from the rider's ride history (a simplified version " +
  "of the standard cycling ATL/CTL/TSB training-load model: ctl is " +
  "longer-window 'fitness', atl is short-window recent 'fatigue', tsb = " +
  "ctl - atl is the freshness balance). Treat this object as the " +
  "authoritative signal for how fresh or fatigued the rider currently is " +
  "and how often they've actually been riding lately - do not re-derive " +
  "frequency or fatigue yourself from the raw ride list, and do not " +
  "default to a workout every day or a fixed session count. Base this " +
  "week's session COUNT (anywhere from 2 to 6) primarily on " +
  "ridesLast7Days/ridesPrior7Days, rounded to a sensible number - a rider " +
  "whose ridesLast7Days is around 3 should get roughly that, not suddenly " +
  "6. When freshness is 'fatigued' or tsb is clearly negative, build a " +
  "lighter week (fewer and/or easier sessions, more recovery) and say so " +
  "briefly in the summary. When freshness is 'fresh' (clearly positive " +
  "tsb) and recent rides otherwise look stable or improving, a normal " +
  "5-10% progression in total weekly volume is appropriate. When " +
  "freshness is 'neutral', hold this week's volume roughly steady. " +
  "The input also includes a cycle object - {phase, weekInMesocycle} - " +
  "tracking where this week sits in a recurring 4-week mesocycle: 'Base' " +
  "(early mesocycle, building aerobic foundation), 'Build' (later " +
  "mesocycles, progressive overload), or 'Recovery' (the scheduled lighter " +
  "4th week of the mesocycle). When phase is 'Recovery', this week's plan " +
  "MUST be a deliberately reduced-load week - cut total weekly volume by " +
  "roughly 40-60% versus this rider's recent normal week while keeping a " +
  "small amount of intensity (not a total off week) - regardless of how " +
  "fresh trainingLoad says they are - and the summary must say this is a " +
  "scheduled recovery week. Otherwise, use phase only as light supporting " +
  "context alongside trainingLoad: an early 'Build' week can lean into " +
  "progression a bit more confidently than a later one, and 'Base' weeks " +
  "should lean toward easy endurance riding plus a small amount of " +
  "genuinely hard work with little time at in-between threshold/sweet-spot " +
  "intensity, while 'Build' weeks can bring in more threshold/sweet-spot " +
  "sessions alongside the endurance and hard intervals. " +
  "trainingLoad/ridesLast7Days remain the primary drivers of this week's " +
  "actual content. " +
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
  "personalisation signal: (1) treat daysPerWeek as the rider's target " +
  "weekly session count - use it as the primary driver of how many sessions " +
  "to schedule, treating ridesLast7Days as a reality-check (if they've " +
  "been riding far fewer days than stated, don't suddenly jump up to " +
  "daysPerWeek in one week - step toward it gradually over 2-3 weeks); " +
  "(2) cap every planned session at sessionLengthMinutes - never schedule a " +
  "session longer than this value; " +
  "(3) let goal colour session type emphasis: 'Increase FTP' -> more " +
  "threshold/sweet-spot blocks; 'Lose weight / body composition' -> more " +
  "moderate-duration aerobic rides; 'Prepare for an event' -> build toward " +
  "event-specific demands and check eventDate to judge how close the event " +
  "is; 'General fitness' or 'Fun/enjoyment' -> balanced variety; " +
  "(4) if eventDate is present and within 4 weeks, note it in the summary " +
  "and shift toward a taper (cut volume, keep race-pace intensity); " +
  "(5) if notes is present and non-empty, read it for extra rider context " +
  "(injuries, preferences, schedule constraints) and adjust accordingly. " +
  "The sport field tells you the rider's primary discipline: 'Cycling' " +
  "means plan only cycling sessions (Zwift rides); 'Running' means plan " +
  "only running sessions; 'Cycling & Running' means mix both. Never " +
  "mix sports unless sport is 'Cycling & Running'. " +
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
  "Use session types/structures matching Zwift's own official plans (FTP " +
  "Builder, Build Me Up, Zwift Academy) and workout categories: " +
  "'Endurance'/'Foundation' (long steady Zone 1-2 ride), 'Tempo' (steady " +
  "Zone 3 block), 'Threshold' (repeated 5-8min efforts at/near FTP), " +
  "'Sweet Spot' (repeated 8-15min efforts at 88-94% FTP), 'VO2' (short " +
  "2-3min near-max efforts), 'Intermittent' (short 30s on/30s off bursts), " +
  "'Strength' (5-8x 15s near-maximal sprints with long recovery), " +
  "'Recovery' (very easy spin), or 'Rest' (no ride) - pick whichever " +
  "matches each day's role rather than inventing new labels. " +
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
  "If ageYears is provided and is 40 or above, lean toward an extra " +
  "recovery day between hard sessions, since recovery generally slows with " +
  "age. Some rides may include an hrFlag field: 'low' means that ride's " +
  "heart rate was unusually low for the power produced compared to the " +
  "rider's own recent rides (possible fatigue, illness, or a sensor " +
  "issue); 'high' means the opposite. Treat one or more recent hrFlag " +
  "rides as a real signal to build a lighter week (fewer/easier sessions, " +
  "more recovery, less high intensity) and mention this reasoning briefly " +
  "in the summary. Each planned session should also make sense in " +
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
  'omit/empty for rest days), "description": string (2-3 sentences ' +
  "describing the CONCRETE session structure in this format: warm-up → " +
  "main set (e.g. 3×8 min at 88-94% FTP, 3 min easy between) → " +
  "cool-down. Always state the exact intervals/blocks with durations and " +
  "%FTP targets. Never write a vague description like 'steady ride' or " +
  "'endurance ride' alone - riders need to know what to actually DO.)}] (include only the days that should have a " +
  "session - HARD LIMIT: always return EXACTLY 6 entries, no more, no less. " +
  "Include actual training sessions for riding/running days, and use " +
  "type='Rest', title='Rest Day', durationMin=0 for the remaining days " +
  "until you have 6 total. The UI displays a fixed 6-card grid - " +
  "returning fewer breaks the layout. " +
  "INTERVAL QUALITY: at least 1 session per week must be a genuine " +
  "interval workout (Threshold, Sweet Spot, VO2, or Intermittent) with " +
  "specific rep structure (e.g. 4×5 min at 95-105% FTP, 3 min recovery). " +
  "Even in Base phase, 1 hard session with intervals is required. " +
  "Riders should feel challenged and engaged, not bored.)}";

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
  const weekOfMonday = mondayOfCurrentWeek();

  const userContent = JSON.stringify({
    rider: params.firstName ?? "Rider",
    ftpWatts: params.ftp ?? null,
    weightKg: params.weightKg ?? null,
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
      ? { phase: params.cycle.phase, weekInMesocycle: params.cycle.weekInMesocycle }
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
          sessionLengthLabel: SESSION_LENGTH_LABELS[params.riderProfile.sessionLength],
          sessionLengthMinutes: SESSION_LENGTH_MINUTES[params.riderProfile.sessionLength],
          eventDate: params.riderProfile.eventDate ?? null,
          ageYears: params.riderProfile.ageYears ?? null,
          notes: params.riderProfile.notes ?? null,
        }
      : null,
    runLevel: params.runLevel ?? null,
    weekOfMonday,
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
        max_tokens: 1200,
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

  // Claude is instructed to return raw JSON, but strip a code-fence wrapper
  // defensively in case it adds one anyway.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiInsightsError("Could not parse the AI's weekly plan response.");
  }

  const obj = parsed as Partial<WeeklyPlan>;
  if (!obj || !Array.isArray(obj.workouts)) {
    throw new AiInsightsError("AI response was missing the expected weekly plan structure.");
  }

  return {
    weekOf: weekOfMonday,
    summary: typeof obj.summary === "string" ? obj.summary : "",
    workouts: obj.workouts as WeeklyWorkout[],
  };
}
