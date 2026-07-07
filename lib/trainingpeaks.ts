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

import {
  type WorkoutStructureBlock,
  structureToBlocks,
  buildTPWireStructure,
  computeIfTss,
} from "./zwo";

const TP_API = "https://tpapi.trainingpeaks.com";

export interface TPRefreshResult {
  accessToken: string;
  /** New refresh token, if TP rotated it (single-use refresh tokens). Reuse the
   *  old one only if TP didn't send a new one. */
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * Try to refresh the TP access token using a refresh token.
 * Returns the new access token (and, if TP rotated it, a new refresh token),
 * or throws if refresh fails.
 *
 * IMPORTANT: TrainingPeaks may rotate refresh tokens (single-use — each
 * refresh call invalidates the old one and issues a new one). Callers MUST
 * persist the returned refreshToken (when present) and overwrite the old one,
 * or the next refresh cycle will fail and force a manual reconnect.
 */
export async function refreshTPToken(refreshToken: string): Promise<TPRefreshResult> {
  // TP may support a refresh endpoint — attempt it.
  // (If TP doesn't support refresh tokens, this will fail with a 4xx.)
  const res = await fetch(`${TP_API}/users/v3/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!res.ok) {
    throw new Error(`TP refresh failed (${res.status})`);
  }
  const data = await res.json() as {
    token?: { access_token?: string; refresh_token?: string; expires_in?: number };
  };
  const token = data?.token?.access_token;
  if (!token) throw new Error("No access_token in TP refresh response");
  return {
    accessToken: token,
    refreshToken: data?.token?.refresh_token,
    expiresIn: data?.token?.expires_in,
  };
}

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
  /** Machine-readable interval structure from the AI plan. When present,
   *  this is converted into TrainingPeaks' native structured-workout wire
   *  format and sent as the `structure` field - this is the piece that
   *  makes the pushed entry a real, rideable structured workout instead of
   *  a plain calendar note, which is what's required for it to ever show
   *  up in Zwift's own Custom Workouts menu. */
  structure?: WorkoutStructureBlock[];
}

export interface PushWorkoutResult {
  ok: boolean;
  workoutId?: string | number;
  error?: string;
  status?: number;
  responseBody?: string;
}

export interface DeleteWorkoutResult {
  ok: boolean;
  error?: string;
}

export interface TPWorkoutSummary {
  workoutId: string | number;
  title?: string;
  workoutDay?: string;
  /** Hours - planned duration. */
  totalTimePlanned?: number | null;
  /** Hours - ACTUAL duration. Only present once a real ride (e.g. synced
   *  from Garmin) has been attached to this workout slot. */
  totalTime?: number | null;
  distance?: number | null;
  [key: string]: unknown;
}

/**
 * Lists workouts on the rider's TrainingPeaks calendar within a date range.
 *
 * Exists so the app can find and remove its OWN stale duplicate pushes on an
 * ongoing basis (not a one-off pass) without ever risking a real completed
 * outdoor Garmin ride. TP's workout list mixes planned and completed entries
 * in the same collection - the safety rule enforced by the caller (see
 * cleanupStaleTPWorkouts below) is to only ever touch a workout that BOTH
 * carries our own title marker AND has no actual/completed data attached
 * (totalTime/distance are empty) - i.e. something we planned that nothing
 * real has ever been recorded against.
 */
export async function listTPWorkouts(
  tpCookie: string,
  tpAthleteId: string,
  oldest: string,
  newest: string
): Promise<TPWorkoutSummary[]> {
  let accessToken: string;
  try {
    accessToken = await exchangeCookieForToken(tpCookie);
  } catch {
    return [];
  }
  try {
    const res = await fetch(
      `${TP_API}/fitness/v6/athletes/${tpAthleteId}/workouts/${oldest}/${newest}`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as TPWorkoutSummary[]) : [];
  } catch {
    return [];
  }
}

/**
 * Delete a planned workout from TrainingPeaks by workoutId.
 * Returns ok:true also on 404 (already gone).
 */
export async function deleteWorkoutFromTP(opts: {
  tpCookie: string;
  tpAthleteId: string;
  workoutId: string | number;
}): Promise<DeleteWorkoutResult> {
  let accessToken: string;
  try {
    accessToken = await exchangeCookieForToken(opts.tpCookie);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const res = await fetch(
      `${TP_API}/fitness/v6/athletes/${opts.tpAthleteId}/workouts/${opts.workoutId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );
    // 204 No Content = success; 404 = already deleted — both are fine
    if (res.ok || res.status === 404) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

  // If the AI plan included a machine-readable structure, convert it into
  // TP's native structured-workout wire format. `structure` on the TP v6
  // payload must be a JSON *string*, not a nested object - confirmed against
  // TP's own workouts endpoint via the open-source trainingpeaks-mcp project.
  let structureJson: string | undefined;
  let effectiveTss = opts.tssPlanned;
  let effectiveIf: number | undefined;
  if (opts.structure && opts.structure.length > 0) {
    const blocks = structureToBlocks(opts.structure);
    const wire = buildTPWireStructure(blocks);
    structureJson = JSON.stringify(wire);
    const { intensityFactor, tss } = computeIfTss(blocks);
    if (effectiveTss == null && tss > 0) effectiveTss = tss;
    if (intensityFactor > 0) effectiveIf = intensityFactor;
  }

  // TP's own sport map uses matching family/value IDs for every sport we
  // support (Bike 2/2, Run 3/3, Swim 1/1, Strength 9/9, Walk 13/13) - both
  // fields are required on create, so reuse the same id for each.
  const workoutTypeId = toTPWorkoutTypeId(opts.type);

  // Workout payload for the v6 API
  const body = {
    athleteId: opts.tpAthleteId,
    workoutDay: `${opts.workoutDay}T00:00:00`,
    workoutTypeFamilyId: workoutTypeId,
    workoutTypeValueId: workoutTypeId,
    title: opts.title,
    description: opts.description,
    totalTimePlanned: opts.durationMin / 60, // TP v6 stores time in fractional hours (e.g. 1.5 = 90 min)
    ...(effectiveTss ? { tssPlanned: effectiveTss } : {}),
    ...(effectiveIf ? { ifPlanned: effectiveIf } : {}),
    ...(structureJson ? { structure: structureJson } : {}),
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
