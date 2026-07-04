/**
 * TrainingPeaks API client
 *
 * Auth approach (corrected):
 * 1. The Production_tpAuth cookie value is NOT a Bearer token itself.
 * 2. It must be sent as a Cookie header to the token exchange endpoint:
 *    GET https://tpapi.trainingpeaks.com/users/v3/token
 * 3. That returns a short-lived access_token (1h TTL).
 * 4. Subsequent API calls use: Authorization: Bearer <access_token>
 *
 * Zwift sync: when a user connects TrainingPeaks to Zwift (in the Zwift
 * Companion app), any planned workout added to their TP calendar automatically
 * appears in Zwift's workout menu. Pushing via this integration is therefore
 * a supported, legitimate path — TrainingPeaks is Zwift's official partner.
 */

const TP_API = "https://tpapi.trainingpeaks.com";

/**
 * Exchange the Production_tpAuth cookie for a short-lived access token.
 * If the value already looks like an access token (starts with "gAAAA"),
 * returns it directly without doing an exchange.
 */
async function exchangeCookieForToken(tpCookieOrToken: string): Promise<string> {
  const val = tpCookieOrToken.trim();
  // Already an access token — use directly
  if (val.startsWith("gAAAA") || val.startsWith("eyJ")) {
    return val;
  }

  const res = await fetch(`${TP_API}/users/v3/token`, {
    method: "GET",
    headers: {
      Cookie: `Production_tpAuth=${val}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TrainingPeaks auth failed (${res.status}): ${body.slice(0, 120)}`);
  }

  const data = await res.json() as { success?: boolean; token?: { access_token?: string } };
  const accessToken = data?.token?.access_token;
  if (!accessToken) {
    throw new Error("TrainingPeaks token exchange returned no access_token");
  }
  return accessToken;
}

export interface TPAthleteProfile {
  personId?: number | string;
  athleteId?: number | string;
  userId?: number | string;
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

/** Validate a TP cookie and return the athlete profile. Throws on failure. */
export async function fetchTPProfile(tpCookie: string): Promise<TPAthleteProfile> {
  const accessToken = await exchangeCookieForToken(tpCookie);

  const res = await fetch(`${TP_API}/users/v3/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TrainingPeaks profile fetch failed (${res.status}): ${body.slice(0, 120)}`);
  }

  const data = await res.json() as { user?: TPAthleteProfile } | TPAthleteProfile;
  // API returns { user: { ... } } or the profile directly
  const profile = (data as { user?: TPAthleteProfile }).user ?? data as TPAthleteProfile;
  return profile;
}

/** Map our AI workout type to TrainingPeaks workoutTypeValueId */
function toTPWorkoutTypeId(type: string): number {
  const t = type.toLowerCase();
  if (t.includes("run")) return 3;
  if (t.includes("swim")) return 1;
  if (t.includes("strength") || t.includes("gym")) return 9;
  if (t.includes("walk")) return 13;
  return 2; // Bike
}

export interface PushWorkoutOptions {
  tpCookie: string;        // Production_tpAuth cookie value
  tpAthleteId: string;
  /** YYYY-MM-DD */
  workoutDay: string;
  title: string;
  description: string;
  /** minutes */
  durationMin: number;
  type: string;
  /** Optional TSS estimate */
  tssPlanned?: number;
}

export interface PushWorkoutResult {
  ok: boolean;
  workoutId?: string | number;
  error?: string;
  status?: number;
  responseBody?: string;
}

/**
 * Push a single planned workout to TrainingPeaks calendar.
 * Uses the tpapi.trainingpeaks.com internal API (cookie→token exchange).
 */
export async function pushWorkoutToTP(opts: PushWorkoutOptions): Promise<PushWorkoutResult> {
  let accessToken: string;
  try {
    accessToken = await exchangeCookieForToken(opts.tpCookie);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Workout payload for the v6 API
  const body = {
    athleteId: opts.tpAthleteId,
    workoutDay: `${opts.workoutDay}T00:00:00`,
    workoutTypeValueId: toTPWorkoutTypeId(opts.type),
    title: opts.title,
    description: opts.description,
    totalTimePlanned: opts.durationMin / 60, // TP v6 stores time in fractional hours (e.g. 1.5 = 90 min)
    ...(opts.tssPlanned ? { tssPlanned: opts.tssPlanned } : {}),
  };

  try {
    const res = await fetch(
      `${TP_API}/fitness/v6/athletes/${opts.tpAthleteId}/workouts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const text = await res.text().catch(() => "");
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }

    if (res.ok) {
      return {
        ok: true,
        workoutId: (parsed as Record<string, unknown>)?.workoutId ?? (parsed as Record<string, unknown>)?.id,
        status: res.status,
      };
    }

    return {
      ok: false,
      status: res.status,
      error: `HTTP ${res.status}`,
      responseBody: text.slice(0, 300),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
