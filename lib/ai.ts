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

  // ── Cadence cross-reference ──
  "Each ride may also include an avgCadence field (rpm, null if unavailable). " +
  "When present, use cadence as an additional signal: a declining cadence " +
  "alongside suppressed HR can indicate the rider is backing off effort " +
  "(which may explain why HR is lower), whereas maintained or rising " +
  "cadence with suppressed HR is a stronger sign of a genuine physiological " +
  "issue rather than just reduced effort. " +

  // ── General coaching instructions ──
  "The rider's data may also include cyclingLevel and/or runLevel (Zwift " +
  "XP levels) — weave a brief natural mention into the analysis. " +
  "Identify trends, call out notable rides with dates, and give 2-3 " +
  "specific actionable suggestions. Lead with the most important signal " +
  "(if hrTrend.trend is 'suppressed', that MUST be the first and most " +
  "prominent point — do not bury it). Be direct, encouraging, and " +
  "evidence-based. Under 220 words, plain prose, no markdown.";

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
  'omit/empty for rest days), "description": string (1-2 sentence ' +
  "plain-English goal — e.g. 'Build VO2max with hard 5-min efforts' " +
  "or 'Foundation endurance at easy conversational pace'), " +
  '"structure": array of workout blocks (REQUIRED for all non-rest sessions, ' +
  "omit only for type='Rest' days). Each element: " +
  '{"type":"warmup"|"steadystate"|"intervals"|"cooldown",' +
  '"durationMin":number (total block minutes; for intervals: repeats*(onSec+offSec)/60),' +
  '"powerFtp":number (power as fraction of FTP — e.g. 0.90=90%, 1.10=110%),' +
  '"label":string, and for intervals also: "repeats":number,"onSec":number,' +
  '"offSec":number,"recoveryPowerFtp":number}. ' +
  "CRITICAL: sum of all structure[].durationMin MUST equal the workout's durationMin. " +
  "Example (75-min VO2max): structure:[" +
  '{"type":"warmup","durationMin":15,"powerFtp":0.60,"label":"Easy warm-up"},' +
  '{"type":"intervals","durationMin":50,"powerFtp":1.10,' +
  '"recoveryPowerFtp":0.50,"repeats":5,"onSec":300,"offSec":300,' +
  '"label":"5x5 min VO2max"},{"type":"cooldown","durationMin":10,' +
  '"powerFtp":0.55,"label":"Cool-down"}]}] ' +
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
        max_tokens: 2000,
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
