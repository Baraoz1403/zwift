/**
 * Thin client for the Claude API, used by the AI Insights feature.
 *
 * Only an aggregated, numeric summary of the rider's recent rides is ever
 * sent here - no raw GPS data, no ride files, nothing beyond what's already
 * shown on the dashboard itself (first name, FTP, weight, and per-ride
 * date/sport/distance/duration/avg power/elevation).
 */

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
  "avgHeartRate, distanceKm, durationMin, elevationM per ride) and their " +
  "FTP/weight/level. Some rides may include an hrFlag field: 'low' means " +
  "that ride's heart rate was unusually low for the power produced compared " +
  "to the rider's own recent rides (possible fatigue, illness, or a sensor " +
  "issue); 'high' means the opposite. Treat one or more recent hrFlag rides " +
  "as a real signal to build a lighter week (more recovery/endurance, less " +
  "high intensity) and mention this reasoning briefly in the summary. " +
  "Design 4-6 sessions across the week (a mix of endurance, intervals/sweet " +
  "spot, and at least one rest or easy recovery day) that reflect the " +
  "rider's current fitness and recent training load - harder if they look " +
  "under-trained/improving with room to push, lighter if there are signs of " +
  "fatigue (rising heart rate at similar power, very high recent frequency, " +
  "or an hrFlag ride). " +
  "Respond with ONLY valid JSON (no markdown, no code fences, no " +
  "commentary) matching exactly this shape: " +
  '{"summary": string (<=2 sentences, plain prose), "workouts": [{"day": ' +
  'string (Monday..Sunday), "type": string, "title": string, "durationMin": ' +
  'number, "targetPowerPctFtp": string (e.g. "65-75%", omit/empty for rest ' +
  'days), "description": string (1-3 sentences, the actual session ' +
  "structure)}]}";

export async function generateWeeklyPlan(params: {
  firstName?: string;
  ftp?: number;
  weightKg?: number;
  cyclingLevel?: number;
  runLevel?: number;
  rides: RideSummary[];
}): Promise<WeeklyPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiInsightsError(
      "ANTHROPIC_API_KEY is not set. Add your own Anthropic API key to .env.local to enable AI-generated weekly plans."
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

  // Monday of the current week (UTC) - a stable "week of" label that doesn't
  // depend on exactly when during the week the plan happens to be generated.
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  const weekOf = monday.toISOString().slice(0, 10);

  return {
    weekOf,
    summary: typeof obj.summary === "string" ? obj.summary : "",
    workouts: obj.workouts as WeeklyWorkout[],
  };
}
