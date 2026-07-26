/**
 * GET /api/strava/activities
 *
 * Fetches the user's recent Strava activities and returns them in a format
 * compatible with the Zwift ride summary, ready for use by the AI planner.
 *
 * Only returns activities that are NOT duplicates of Zwift rides (outdoor /
 * Garmin activities that the Zwift API doesn't have). The deduplication uses
 * start_date ± 5 min similarity to identify Zwift auto-uploads to Strava.
 *
 * Response:
 *   { ok: true,  activities: RideSummary[], athleteName: string }
 *   { ok: false, error: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import {
  fetchStravaActivities,
  refreshStravaToken,
  deduplicateStravaActivities,
  type StravaActivity,
} from "@/lib/strava";
import {
  STRAVA_TOKEN_COOKIE,
  STRAVA_REFRESH_COOKIE,
  STRAVA_EXPIRES_COOKIE,
  STRAVA_NAME_COOKIE,
} from "../oauth-callback/route";
import { fetchActivities } from "@/lib/zwift";
import type { RideSummary } from "@/lib/ai";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

  // Require Zwift session
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  // Require Strava connection
  let accessToken  = cookieStore.get(STRAVA_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(STRAVA_REFRESH_COOKIE)?.value;
  const expiresAt    = Number(cookieStore.get(STRAVA_EXPIRES_COOKIE)?.value ?? 0);
  const athleteName  = cookieStore.get(STRAVA_NAME_COOKIE)?.value ?? "Strava";

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ ok: false, error: "Strava not connected." });
  }

  // Auto-refresh token if needed
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec < 60) {
    try {
      const tokens = await refreshStravaToken(refreshToken);
      accessToken = tokens.access_token;
      const isSecure = process.env.NODE_ENV === "production";
      const base = { httpOnly: true, secure: isSecure, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 60, path: "/" };
      cookieStore.set(STRAVA_TOKEN_COOKIE,   tokens.access_token,      base);
      cookieStore.set(STRAVA_REFRESH_COOKIE, tokens.refresh_token,      base);
      cookieStore.set(STRAVA_EXPIRES_COOKIE, String(tokens.expires_at), base);
    } catch {
      return NextResponse.json({ ok: false, error: "Strava token refresh failed." });
    }
  }

  try {
    // Fetch Strava activities
    const stravaActivities = await fetchStravaActivities(accessToken, 60);

    // Fetch recent Zwift activities to detect duplicates
    const athleteId = session.athleteId ?? "";
    let zwiftDatesMs: number[] = [];
    try {
      const zwiftActs = await fetchActivities(session.accessToken, athleteId);
      zwiftDatesMs = zwiftActs
        .filter(a => typeof a.startDate === "string")
        .map(a => new Date(a.startDate as string).getTime());
    } catch {
      // If Zwift fetch fails, still return Strava data (no dedup)
    }

    // Filter out duplicates of Zwift rides
    const uniqueStrava = deduplicateStravaActivities(stravaActivities, zwiftDatesMs);

    // Convert to RideSummary format for the AI planner
    const rides: RideSummary[] = uniqueStrava
      .filter(a => !a.trainer) // exclude virtual/indoor (already in Zwift)
      .map(a => ({
        date:        a.start_date,
        sport:       mapStravaSport(a.sport_type ?? a.type),
        distanceKm:  Math.round((a.distance / 1000) * 10) / 10,
        durationMin: Math.round(a.moving_time / 60),
        avgWatts:    Math.round(a.average_watts ?? 0),
        elevationM:  Math.round(a.total_elevation_gain ?? 0),
        avgHeartRate: a.average_heartrate ? Math.round(a.average_heartrate) : null,
        avgCadence:  a.average_cadence ? Math.round(a.average_cadence) : null,
      }));

    return NextResponse.json({ ok: true, activities: rides, athleteName });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Failed to fetch Strava activities.",
    });
  }
}

/** Map Strava sport_type strings to the vocabulary the AI planner uses. */
function mapStravaSport(stravaType: string): string {
  const t = stravaType.toLowerCase();
  if (t.includes("run")) return "RUNNING";
  if (t.includes("ride") || t.includes("cycling")) return "CYCLING";
  if (t.includes("swim")) return "SWIMMING";
  if (t.includes("walk") || t.includes("hike")) return "WALKING";
  return "CYCLING"; // default
}
