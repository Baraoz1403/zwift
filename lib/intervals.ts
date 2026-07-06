/**
 * Intervals.icu API client
 *
 * Unlike TrainingPeaks (their public API is OAuth2, approval-gated, and
 * explicitly NOT available for personal use — 7-10 day review, commercial
 * developers only), Intervals.icu's personal API works immediately for any
 * user: generate an API key at intervals.icu/settings ("Developer Settings"
 * near the bottom of the page), then call the API with HTTP Basic auth —
 * username "API_KEY", password the key itself. No approval process, no
 * bookmarklet, no cross-origin dance, no expiring 1h tokens to babysit.
 *
 * Structured workouts are pushed as a real .zwo file (the `file_contents`
 * field on POST /events) — this app already generates that exact XML for
 * the manual "download for Zwift" button (see lib/zwo.ts generateZwoXml),
 * so we reuse it as-is. Once pushed, Intervals.icu's own Garmin sync
 * (connected once by the rider in their Intervals.icu account settings)
 * delivers structured workouts straight to supported Garmin watches, and
 * Intervals.icu can also push into Zwift — same "push once, their platform
 * relays it onward" model as TrainingPeaks, but self-service end to end.
 *
 * Reference: https://forum.intervals.icu/t/api-access-to-intervals-icu/609
 *            https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090
 */

const INTERVALS_API = "https://intervals.icu/api/v1";

function basicAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`API_KEY:${apiKey}`).toString("base64");
  return `Basic ${encoded}`;
}

export interface IntervalsAthlete {
  id?: string | number;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Validate an API key and return the athlete profile. Throws on failure.
 * Athlete id "0" is a documented shortcut for "whoever this API key belongs to".
 */
export async function fetchIntervalsAthlete(apiKey: string): Promise<IntervalsAthlete> {
  const res = await fetch(`${INTERVALS_API}/athlete/0`, {
    headers: { Authorization: basicAuthHeader(apiKey), Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Intervals.icu validation failed (${res.status}): ${body.slice(0, 120)}`);
  }
  return await res.json() as IntervalsAthlete;
}

export interface PushIntervalsOptions {
  apiKey: string;
  /** YYYY-MM-DD */
  workoutDay: string;
  title: string;
  description: string;
  /** minutes */
  durationMin: number;
  type: string; // our AI workout type, e.g. "Endurance", "Intervals", "Run"
  /** Full .zwo XML — pass the same string this app generates for manual Zwift export. */
  zwoXml: string;
  tssPlanned?: number;
}

export interface PushIntervalsResult {
  ok: boolean;
  eventId?: string | number;
  error?: string;
  status?: number;
}

export interface DeleteIntervalsResult {
  ok: boolean;
  error?: string;
}

function toIntervalsSportType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("run")) return "Run";
  if (t.includes("swim")) return "Swim";
  if (t.includes("strength") || t.includes("gym")) return "WeightTraining";
  if (t.includes("walk")) return "Walk";
  return "Ride";
}

/**
 * Push a single planned workout to the Intervals.icu calendar as a real
 * structured .zwo entry (not a plain text note) - this is what lets
 * Intervals.icu parse actual steps, calculate training load itself, and
 * relay a rideable structured workout onward to Garmin/Zwift.
 */
export async function pushWorkoutToIntervals(opts: PushIntervalsOptions): Promise<PushIntervalsResult> {
  const safeName = opts.title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "workout";
  const body = {
    category: "WORKOUT",
    start_date_local: `${opts.workoutDay}T00:00:00`,
    type: toIntervalsSportType(opts.type),
    name: opts.title,
    description: opts.description,
    filename: `${opts.workoutDay}-${safeName}.zwo`,
    file_contents: opts.zwoXml,
    moving_time: Math.round(opts.durationMin * 60),
    ...(opts.tssPlanned ? { icu_training_load: Math.round(opts.tssPlanned) } : {}),
  };

  try {
    const res = await fetch(`${INTERVALS_API}/athlete/0/events`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(opts.apiKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text().catch(() => "");
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }

    if (res.ok) {
      return {
        ok: true,
        eventId: (parsed as Record<string, unknown> | null)?.id as string | number | undefined,
        status: res.status,
      };
    }
    return { ok: false, status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Delete a planned workout from Intervals.icu by event id. 404 counts as success (already gone). */
export async function deleteEventFromIntervals(apiKey: string, eventId: string | number): Promise<DeleteIntervalsResult> {
  try {
    const res = await fetch(`${INTERVALS_API}/athlete/0/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: basicAuthHeader(apiKey), Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok || res.status === 404) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
