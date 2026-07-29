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
const INTERVALS_OAUTH_TOKEN_URL = "https://intervals.icu/oauth/token";

/**
 * Resolve an ICU athlete ID for use in URL paths.
 *
 * Intervals.icu athlete IDs returned by their API can be:
 *   - A pure numeric string: "12345"   → use as-is
 *   - A prefixed string:     "i12345"  → numeric part works in URLs
 *   - A non-standard string: "a600"    → API rejects; use "me" instead
 *   - "0" or absent               → use "me"
 *
 * "me" always resolves correctly when using a personal API key.
 * This function is the single point of truth for ID → URL resolution.
 */
function resolveIcuId(athleteId: string | undefined): string {
  if (!athleteId || athleteId === "0" || athleteId === "me") return "me";
  // "i12345" → strip the "i" prefix → numeric part works in ICU API URLs
  const stripped = athleteId.replace(/^[a-zA-Z]+/, "");
  return /^\d+$/.test(stripped) ? stripped : "me";
}

/**
 * Build the Authorization header for an ICU API call.
 *
 * Accepts two credential forms:
 *  - API key (ic0_xxx…)  → HTTP Basic with username "API_KEY"
 *  - OAuth access token   → stored as "Bearer <token>"; returned as-is
 *
 * Callers simply pass whatever is stored in the zwift_intervals_key cookie.
 * The cookie holds either the raw API key (legacy) or "Bearer <token>" (OAuth).
 */
export function buildAuthHeader(cred: string): string {
  if (cred.startsWith("Bearer ")) return cred;
  const encoded = Buffer.from(`API_KEY:${cred}`).toString("base64");
  return `Basic ${encoded}`;
}

/** @deprecated Use buildAuthHeader() */
function basicAuthHeader(apiKey: string): string {
  return buildAuthHeader(apiKey);
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export interface IntervalsOAuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number; // seconds
}

/**
 * Exchange an authorization code (from the OAuth callback) for access + refresh
 * tokens. Requires INTERVALS_CLIENT_ID and INTERVALS_CLIENT_SECRET env vars.
 */
export async function exchangeIntervalsCode(
  code: string,
  redirectUri: string,
): Promise<IntervalsOAuthTokens> {
  const clientId = process.env.INTERVALS_CLIENT_ID;
  const clientSecret = process.env.INTERVALS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("INTERVALS_CLIENT_ID / INTERVALS_CLIENT_SECRET not configured.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(INTERVALS_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return await res.json() as IntervalsOAuthTokens;
}

/**
 * Refresh an expired OAuth access token using the stored refresh token.
 */
export async function refreshIntervalsToken(refreshToken: string): Promise<IntervalsOAuthTokens> {
  const clientId = process.env.INTERVALS_CLIENT_ID;
  const clientSecret = process.env.INTERVALS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("INTERVALS_CLIENT_ID / INTERVALS_CLIENT_SECRET not configured.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(INTERVALS_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return await res.json() as IntervalsOAuthTokens;
}

export interface IntervalsAthlete {
  id?: string | number;
  name?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Validate an API key and return the athlete profile. Throws on auth failure.
 *
 * Tries /athlete/me first (the standard self-referential endpoint), then falls
 * back to /athlete/0. A 401/403 from either endpoint means the key is wrong.
 * A 404 or non-auth error means the endpoint path may differ across accounts —
 * in that case we return an empty profile so the key still gets stored and can
 * be validated on first push.
 */
export async function fetchIntervalsAthlete(apiKey: string): Promise<IntervalsAthlete> {
  const endpoints = ["/athlete/me", "/athlete/0"] as const;

  for (const endpoint of endpoints) {
    let res: Response;
    try {
      res = await fetch(`${INTERVALS_API}${endpoint}`, {
        headers: { Authorization: basicAuthHeader(apiKey), Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Network / timeout — try next endpoint, or fall through to empty profile
      continue;
    }

    if (res.ok) {
      return await res.json() as IntervalsAthlete;
    }

    // Definitive auth failure — the key is wrong, no point retrying
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => "");
      throw new Error(`Invalid API key (${res.status}). Please check the key and try again.${body ? " — " + body.slice(0, 80) : ""}`);
    }

    // 404 or other — try the next endpoint
  }

  // Both endpoints failed for non-auth reasons (network, unexpected format).
  // Return an empty profile so the key is stored; it will be validated on first push.
  return {};
}

export interface PushIntervalsOptions {
  apiKey: string;
  /** Athlete ID returned at connect time (from zwift_intervals_id cookie).
   *  Falls back to "me" (the REST self-referential shortcut) if omitted. */
  athleteId?: string;
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
    const res = await fetch(`${INTERVALS_API}/athlete/${opts.athleteId ?? "me"}/events`, {
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

export interface IntervalsEvent {
  id: string | number;
  start_date_local?: string;
  category?: string;
  name?: string;
  filename?: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * Lists planned-workout ("WORKOUT" category) events on the rider's
 * Intervals.icu calendar within a date range (inclusive, YYYY-MM-DD).
 *
 * This exists so the app can ask Intervals.icu itself what's already on the
 * calendar before pushing a new plan, rather than trusting only the
 * push-tracking id list a single browser keeps in localStorage. That
 * localStorage list is scoped to one browser/device - if the rider opens the
 * dashboard from a second device or a fresh browser profile, that context
 * has no record of what an *earlier* session already pushed, auto-syncs the
 * same plan again, and has nothing to delete before doing so. Querying the
 * real calendar state makes cleanup authoritative regardless of which
 * device did the previous push - see syncPlanToIntervalsHeadless in
 * lib/headless-sync.ts, the sole sync implementation (used by both the
 * interactive weekly-plan route and the nightly cron).
 */
export async function listIntervalsEvents(
  apiKey: string,
  oldest: string,
  newest: string,
  athleteId?: string
): Promise<IntervalsEvent[]> {
  try {
    // Do NOT include ?category=WORKOUT in the URL — the ICU API doesn't
    // document that filter and may return [] or a non-array wrapper when it
    // doesn't recognise it, silently killing all cleanup. Fetch all events in
    // the date range; callers filter by category in JS instead.
    const url = `${INTERVALS_API}/athlete/${athleteId ?? "me"}/events?oldest=${oldest}&newest=${newest}`;
    const res = await fetch(url, {
      headers: { Authorization: basicAuthHeader(apiKey), Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // ICU may return a plain array OR a wrapped object { events: [...] }.
    // Handle both so a shape change never silently kills cleanup.
    if (Array.isArray(data)) return data as IntervalsEvent[];
    if (data && Array.isArray((data as Record<string, unknown>).events))
      return (data as { events: IntervalsEvent[] }).events;
    return [];
  } catch {
    return [];
  }
}

// ── Completed activities (real training data) ─────────────────────────────────

/**
 * A completed activity as returned by the ICU activities API.
 * ICU aggregates ALL activities regardless of source (Zwift, Garmin, Strava,
 * manual) and computes TSS correctly for every sport type, including HR-based
 * TSS for runs and other non-power activities. This is the single most
 * reliable source of training load data for a multi-sport athlete.
 */
export interface IcuActivity {
  /** Activity ID */
  id: string | number;
  /** e.g. "Ride", "Run", "Walk", "VirtualRide", "NordicSki" */
  type: string;
  /** ISO local time, e.g. "2026-07-15T07:00:00" */
  start_date_local: string;
  /** Activity name as entered by the athlete or auto-generated by device */
  name: string;
  /** Duration in seconds */
  moving_time?: number;
  /** ICU's computed Training Stress Score — correct for ALL sports */
  icu_training_load?: number;
  /** Average power (watts) — null for run/walk/swim */
  average_watts?: number | null;
  /** Normalized power (watts) — null when unavailable */
  normalized_power?: number | null;
  /** Average heart rate (bpm) */
  average_heartrate?: number | null;
  /** Distance in meters */
  distance?: number;
  [key: string]: unknown;
}

/**
 * Fetches completed activities from Intervals.icu for a given date range.
 *
 * This is intentionally separate from `listIntervalsEvents` (which fetches
 * PLANNED workout events from the calendar). Activities are COMPLETED sessions
 * — real rides, runs, gym sessions — ingested from Zwift, Garmin, Strava, etc.
 *
 * ICU computes `icu_training_load` (TSS) for every activity using:
 *  - Power-based TSS when NP + FTP are available
 *  - HR-based (hrTSS) for activities without power
 *  - rTSS (run TSS) for running using pace + threshold pace
 *
 * This replaces the app's internal Zwift-FIT-only TSS proxy which:
 *  1. Returns 0 for all runs (no power meter)
 *  2. Is blind to activities done on Garmin, outside, or on any non-Zwift device
 */
export async function fetchIcuActivities(
  apiKey: string,
  athleteId: string,
  oldest: string,
  newest: string,
): Promise<IcuActivity[]> {
  try {
    const url = `${INTERVALS_API}/athlete/${resolveIcuId(athleteId)}/activities?oldest=${oldest}&newest=${newest}`;
    const res = await fetch(url, {
      headers: { Authorization: basicAuthHeader(apiKey), Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data as IcuActivity[];
    // Some ICU responses are wrapped: { activities: [...] }
    if (data && Array.isArray((data as Record<string, unknown>).activities))
      return (data as { activities: IcuActivity[] }).activities;
    return [];
  } catch {
    return [];
  }
}

export interface IcuWellness {
  ctl: number;   // Chronic Training Load — "fitness"
  atl: number;   // Acute Training Load — "fatigue"
  tsb: number;   // Training Stress Balance — "freshness" (CTL - ATL)
  date: string;  // YYYY-MM-DD
}

/**
 * Fetch the athlete's latest CTL / ATL / TSB from Intervals.icu's wellness endpoint.
 *
 * ICU computes these daily from ALL activities (Zwift, Garmin, Strava, manual)
 * using each sport's correct TSS formula (power-based, HR-based, etc.).
 * We request the last 7 days and return the most recent entry that has CTL data.
 *
 * Returns null if ICU is not reachable or the athlete has no data yet.
 */
export async function fetchIcuWellness(
  apiKey: string,
  athleteId: string,
): Promise<IcuWellness | null> {
  try {
    const newest = new Date().toISOString().slice(0, 10);
    const oldestDate = new Date();
    oldestDate.setDate(oldestDate.getDate() - 7);
    const oldest = oldestDate.toISOString().slice(0, 10);

    const url = `${INTERVALS_API}/athlete/${resolveIcuId(athleteId)}/wellness?oldest=${oldest}&newest=${newest}`;
    const res = await fetch(url, {
      headers: { Authorization: buildAuthHeader(apiKey), Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    const entries = Array.isArray(data) ? data : [];

    // ICU returns entries oldest-first; scan from the end to find the latest with CTL
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i] as Record<string, unknown>;
      const ctl = typeof e.ctl === "number" ? e.ctl : null;
      const atl = typeof e.atl === "number" ? e.atl : null;
      const tsb = typeof e.form === "number" ? e.form : (typeof e.tsb === "number" ? e.tsb : null);
      if (ctl !== null && atl !== null && tsb !== null) {
        return { ctl, atl, tsb, date: String(e.id ?? e.date ?? "") };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Auto-register our activity webhook in the athlete's Intervals.icu account.
 *
 * Called immediately after the athlete connects ICU (in both the API-key
 * /connect route and the OAuth /oauth-callback route). This means athletes
 * receive WhatsApp feedback automatically — no manual webhook setup in ICU.
 *
 * How it works:
 *   1. GET existing webhooks → skip if our URL is already registered.
 *   2. POST new webhook for "activity_created" event → our /api/webhooks/intervals endpoint.
 *
 * The ICU webhook fires within 2-5 minutes of a Zwift ride finishing
 * (Zwift→ICU sync processes quickly). This is the fastest possible path
 * given that Zwift itself has no push notification system.
 *
 * Returns true if registered (or already registered), false on any error.
 * Errors are non-fatal — the 30-min cron job is a reliable fallback.
 */
export async function ensureIcuWebhookRegistered(
  credentialOrBearerToken: string,
  athleteId: string,
  webhookUrl: string,
): Promise<boolean> {
  const auth = buildAuthHeader(credentialOrBearerToken);
  const id   = resolveIcuId(athleteId);

  try {
    // 1. Check if already registered
    const listRes = await fetch(`${INTERVALS_API}/athlete/${id}/webhooks`, {
      headers: { Authorization: auth, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (listRes.ok) {
      const existing = await listRes.json() as Array<{ url?: string }>;
      if (Array.isArray(existing) && existing.some(w => w.url === webhookUrl)) {
        return true; // already registered — nothing to do
      }
    }

    // 2. Register the webhook
    const createRes = await fetch(`${INTERVALS_API}/athlete/${id}/webhooks`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        url: webhookUrl,
        event: "activity_created",
      }),
      signal: AbortSignal.timeout(8000),
    });

    return createRes.ok;
  } catch {
    return false;
  }
}

/** Delete a planned workout from Intervals.icu by event id. 404 counts as success (already gone). */
export async function deleteEventFromIntervals(apiKey: string, eventId: string | number, athleteId?: string): Promise<DeleteIntervalsResult> {
  try {
    const res = await fetch(`${INTERVALS_API}/athlete/${athleteId ?? "me"}/events/${eventId}`, {
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
