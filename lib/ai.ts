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
}

const SYSTEM_PROMPT =
  "You are a cycling coach analyzing a Zwift rider's recent activity data. " +
  "Each ride may include an avgHeartRate field (bpm, null if no HR sensor " +
  "data exists for that ride) alongside avgWatts - use both together to " +
  "comment on training effort and efficiency (e.g. rising heart rate at a " +
  "similar power suggests fatigue, falling heart rate at a similar power " +
  "suggests improving fitness). The rider's data may also include " +
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
