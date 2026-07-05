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
import { refreshTPToken } from "@/lib/trainingpeaks";
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
  let tpToken     = cookieStore.get("zwift_tp_token")?.value;
  const tpAthleteId = cookieStore.get("zwift_tp_id")?.value;
  const tpRefresh   = cookieStore.get("zwift_tp_refresh")?.value;
  const tpExpiresAt = Number(cookieStore.get("zwift_tp_expires")?.value ?? "0");

  // Auto-refresh if token is expired/expiring and we have a refresh token
  if (tpRefresh && (!tpToken || (tpExpiresAt && tpExpiresAt < Date.now() + 5 * 60 * 1000))) {
    try {
      const newToken = await refreshTPToken(tpRefresh);
      // Update the cookie for this response cycle (next request will also use it)
      const isSecure = process.env.NODE_ENV === "production";
      const cookieOpts = { httpOnly: true, secure: isSecure, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 30, path: "/" };
      cookieStore.set("zwift_tp_token", newToken, cookieOpts);
      cookieStore.set("zwift_tp_expires", String(Date.now() + 60 * 60 * 1000), { ...cookieOpts, httpOnly: false });
      tpToken = newToken;
    } catch {
      // Refresh failed — will fall through to expired state
    }
  }

  // Probe the TP API to verify the token is actually valid
  let tpExpired = false;
  if (tpToken) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const probe = await fetch(
        `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${tpAthleteId}/workouts?startDate=${today}&endDate=${today}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${tpToken}`, Accept: "application/json" },
          signal: AbortSignal.timeout(4000),
        }
      );
      if (probe.status === 401 || probe.status === 403) tpExpired = true;
    } catch {
      // Network error — assume token might still be ok
    }
  }
  const tp = {
    connected: !!tpToken && !tpExpired,
    tokenExpired: tpExpired,
    hasRefreshToken: !!tpRefresh,
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
