/**
 * GET /api/intervals/oauth-callback?code=...
 *
 * Handles the Intervals.icu OAuth redirect after the user authorizes access.
 * Exchanges the authorization code for tokens and stores them in cookies,
 * then redirects back to the dashboard.
 *
 * The access token is stored as "Bearer <token>" in zwift_intervals_key so
 * all existing intervals API code (which reads that cookie) works without
 * change — buildAuthHeader() detects the "Bearer " prefix and skips Basic auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import {
  exchangeIntervalsCode,
  fetchIntervalsAthlete,
} from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { kvSet } from "@/lib/kv";
import { ensurePlanProvisioned } from "@/lib/plan-runner";

/** Cookie that carries the OAuth refresh token (separate from access token). */
export const INTERVALS_REFRESH_COOKIE = "zwift_intervals_refresh";
/** Cookie that carries the access token expiry (ms since epoch, as string). */
export const INTERVALS_EXPIRES_COOKIE = "zwift_intervals_token_exp";

// Token exchange can trigger plan generation (30-60s) for new athletes.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

  // Require Zwift session
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  const session = await decryptSession(raw);
  if (!session) return NextResponse.redirect(new URL("/", req.nextUrl.origin));

  // Parse the state param to determine where to redirect after OAuth.
  // oauth-start encodes { from: "m" | "dashboard" } in base64url JSON.
  const { searchParams } = req.nextUrl;
  const rawState = searchParams.get("state") ?? "";
  let returnTo = "/dashboard"; // default
  try {
    const stateData = JSON.parse(Buffer.from(rawState, "base64url").toString("utf-8"));
    if (stateData?.from === "m") returnTo = "/m";
  } catch { /* ignore malformed state — fall back to dashboard */ }

  // intervals.icu returns ?error=access_denied when user cancels
  const error = searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      new URL(`${returnTo}?icu_error=${encodeURIComponent(error)}`, req.nextUrl.origin)
    );
  }

  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL(`${returnTo}?icu_error=no_code`, req.nextUrl.origin)
    );
  }

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/intervals/oauth-callback`;

  try {
    const tokens = await exchangeIntervalsCode(code, redirectUri);

    const isSecure = process.env.NODE_ENV === "production";
    const cookieBase = {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax" as const,
      path: "/",
    };

    // Store access token as "Bearer <token>" in the existing key cookie.
    // buildAuthHeader() checks for this prefix so all ICU API calls work.
    const accessTokenValue = `Bearer ${tokens.access_token}`;
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    cookieStore.set("zwift_intervals_key", accessTokenValue, {
      ...cookieBase,
      maxAge: tokens.expires_in, // seconds
    });

    if (tokens.refresh_token) {
      cookieStore.set(INTERVALS_REFRESH_COOKIE, tokens.refresh_token, {
        ...cookieBase,
        maxAge: 60 * 60 * 24 * 365, // refresh tokens are long-lived
      });
    }

    cookieStore.set(INTERVALS_EXPIRES_COOKIE, String(expiresAt), {
      ...cookieBase,
      httpOnly: false, // readable by client JS so it can pre-emptively re-auth
      maxAge: 60 * 60 * 24 * 365,
    });

    // Fetch athlete info using the new token
    const athlete = await fetchIntervalsAthlete(accessTokenValue);
    // Store the raw ICU athlete ID as returned by the API — needed for webhook
    // reverse-lookup. API URL calls resolve this to "me" if non-numeric.
    const athleteId = athlete.id != null ? String(athlete.id).trim() : "0";
    const athleteName =
      (athlete.name as string | undefined) ??
      (athlete.email as string | undefined) ??
      "Intervals.icu user";

    cookieStore.set("zwift_intervals_id", athleteId, {
      ...cookieBase,
      maxAge: 60 * 60 * 24 * 365,
    });
    cookieStore.set("zwift_intervals_name", athleteName, {
      ...cookieBase,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    });

    // Mirror to KV for cross-device persistence
    let resolvedAthleteId = session.athleteId;
    if (!resolvedAthleteId) {
      try {
        const profile = await fetchOwnProfile(session.accessToken);
        resolvedAthleteId = profile.id != null ? String(profile.id) : undefined;
      } catch {
        // best-effort
      }
    }

    if (resolvedAthleteId) {
      await kvSet(`zwift:${resolvedAthleteId}:icu_key`, accessTokenValue);
      await kvSet(`zwift:${resolvedAthleteId}:icu_id`, athleteId);
      await kvSet(`zwift:${resolvedAthleteId}:icu_name`, athleteName);
      if (tokens.refresh_token) {
        await kvSet(`zwift:${resolvedAthleteId}:icu_refresh`, tokens.refresh_token);
        await kvSet(`zwift:${resolvedAthleteId}:icu_expires`, String(expiresAt));
      }

      // Auto-provision plan if needed
      await ensurePlanProvisioned(resolvedAthleteId, session.accessToken);
    }

    return NextResponse.redirect(
      new URL(`${returnTo}?icu_connected=1`, req.nextUrl.origin)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth exchange failed";
    return NextResponse.redirect(
      new URL(`${returnTo}?icu_error=${encodeURIComponent(msg)}`, req.nextUrl.origin)
    );
  }
}
