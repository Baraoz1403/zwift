/**
 * GET /api/health
 *
 * Checks the status of every integration in one request.
 * Used by the Connections panel to show live status indicators.
 *
 * Response:
 * {
 *   zwift:  { connected: boolean, athleteName?: string },
 *   tp:     { connected: boolean, athleteName?: string, tokenExpiresSoon?: boolean },
 *   strava: { connected: boolean, athleteName?: string, configured: boolean },
 *   garmin: { configured: boolean },   // inferred from TP — no direct API
 * }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import {
  STRAVA_TOKEN_COOKIE,
  STRAVA_REFRESH_COOKIE,
  STRAVA_NAME_COOKIE,
} from "@/app/api/strava/oauth-callback/route";

export async function GET() {
  const cookieStore = await cookies();

  // ── Zwift ──────────────────────────────────────────────────────────────────
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? await decryptSession(raw) : null;
  const zwift = {
    connected: !!session,
    athleteId: session?.athleteId ?? null,
  };

  // ── TrainingPeaks ──────────────────────────────────────────────────────────
  const tpToken     = cookieStore.get("zwift_tp_token")?.value;
  const tpAthleteId = cookieStore.get("zwift_tp_id")?.value;
  // Cookies don't expose their expiry to server code.
  // We detect "expiring soon" by attempting a lightweight API call when the
  // token exists — if it 401s, the token is already expired.
  let tpExpired = false;
  if (tpToken) {
    try {
      const probe = await fetch(
        `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${tpAthleteId}/workouts?startDate=${new Date().toISOString().slice(0, 10)}&endDate=${new Date().toISOString().slice(0, 10)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${tpToken}`, Accept: "application/json" },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (probe.status === 401 || probe.status === 403) tpExpired = true;
    } catch {
      // network error — assume token might still be ok, don't flag as expired
    }
  }
  const tp = {
    connected: !!tpToken && !tpExpired,
    tokenExpired: tpExpired,
    athleteId: tpAthleteId ?? null,
  };

  // ── Strava ─────────────────────────────────────────────────────────────────
  const stravaConfigured = !!(
    process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET
  );
  const stravaToken   = cookieStore.get(STRAVA_TOKEN_COOKIE)?.value;
  const stravaRefresh = cookieStore.get(STRAVA_REFRESH_COOKIE)?.value;
  const stravaName    = cookieStore.get(STRAVA_NAME_COOKIE)?.value;
  const strava = {
    configured: stravaConfigured,
    connected:  !!stravaToken && !!stravaRefresh,
    athleteName: stravaName ?? null,
  };

  // ── Garmin ─────────────────────────────────────────────────────────────────
  // Garmin syncs through TrainingPeaks — we cannot probe it directly.
  // We surface it as "active" when TP is connected (user still needs to
  // link TP↔Garmin once in TrainingPeaks account settings).
  const garmin = {
    viaTp: true,
    note: "Syncs automatically through TrainingPeaks once linked in TP account settings.",
  };

  return NextResponse.json({ zwift, tp, strava, garmin });
}
