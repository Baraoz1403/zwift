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
 *
 * IMPORTANT: cookies must be set on the redirect response object, NOT via
 * cookieStore.set(). In Next.js 14 Route Handlers, cookieStore.set() cookies
 * are NOT included when a NextResponse.redirect() is returned — the two are
 * separate response objects and the Set-Cookie headers are lost. Always call
 * res.cookies.set() on the same response that gets returned.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import {
  exchangeIntervalsCode,
  fetchIntervalsAthlete,
  ensureIcuWebhookRegistered,
} from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { kvSet } from "@/lib/kv";
import { ensurePlanProvisioned } from "@/lib/plan-runner";

/** Cookie that carries the OAuth refresh token (separate from access token). */
export const INTERVALS_REFRESH_COOKIE = "zwift_intervals_refresh";
/** Cookie that carries the access token expiry (ms since epoch, as string). */
export const INTERVALS_EXPIRES_COOKIE = "zwift_intervals_token_exp";

// Token exchange can take a few seconds. Plan generation is now fire-and-forget.
export const maxDuration = 30;

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

  // Write a debug log entry to KV so we can inspect it at /api/debug/icu-state
  // even when Vercel function logs aren't accessible. Keyed by athlete so each
  // rider's last attempt is stored independently. Removed once flow is stable.
  const debugKey = `zwift:${session.athleteId ?? "unknown"}:oauth_debug`;
  const writeDebug = (step: string, detail: string) =>
    kvSet(debugKey, JSON.stringify({ step, detail, ts: new Date().toISOString() })).catch(() => {});

  try {
    await writeDebug("exchange_start", `code_length=${code.length} redirect_uri=${redirectUri}`);
    const tokens = await exchangeIntervalsCode(code, redirectUri);
    await writeDebug("exchange_ok", `has_access=${!!tokens.access_token} has_refresh=${!!tokens.refresh_token} expires_in=${tokens.expires_in}`);

    const isSecure = process.env.NODE_ENV === "production";
    const cookieBase = {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax" as const,
      path: "/",
    };

    const accessTokenValue = `Bearer ${tokens.access_token}`;
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    // Fetch athlete info using the new token.
    // Uses SETTINGS:READ scope — if not granted, fall back to "me" (which the
    // push endpoint accepts as a self-referential ID). This makes the flow
    // resilient even if the client registration doesn't include SETTINGS:READ.
    let athleteId = "me";
    let athleteName = "Intervals.icu user";
    try {
      const athlete = await fetchIntervalsAthlete(accessTokenValue);
      if (athlete.id != null) athleteId = String(athlete.id).trim();
      athleteName =
        (athlete.name as string | undefined) ??
        (athlete.email as string | undefined) ??
        "Intervals.icu user";
    } catch {
      // SETTINGS:READ not granted or endpoint unavailable — "me" fallback is safe
      await writeDebug("athlete_fetch_skipped", "fallback to athleteId=me");
    }

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

    await writeDebug("kv_write", `resolvedAthleteId=${resolvedAthleteId ?? "undefined"} icuId=${athleteId} icuName=${athleteName}`);

    if (resolvedAthleteId) {
      await Promise.all([
        kvSet(`zwift:${resolvedAthleteId}:icu_key`, accessTokenValue),
        kvSet(`zwift:${resolvedAthleteId}:icu_id`, athleteId),
        kvSet(`zwift:${resolvedAthleteId}:icu_name`, athleteName),
        ...(tokens.refresh_token ? [
          kvSet(`zwift:${resolvedAthleteId}:icu_refresh`, tokens.refresh_token),
          kvSet(`zwift:${resolvedAthleteId}:icu_expires`, String(expiresAt)),
        ] : []),
      ]);

      // Fire-and-forget — do NOT await. Plan generation calls OpenAI and can
      // take 30–60 s. The nightly cron and next app load both retry if needed.
      void ensurePlanProvisioned(resolvedAthleteId, session.accessToken).catch(() => {});

      // Auto-register ICU webhook for real-time WhatsApp feedback after rides
      const webhookUrl = `${req.nextUrl.origin}/api/webhooks/intervals`;
      void ensureIcuWebhookRegistered(accessTokenValue, athleteId, webhookUrl).catch(() => {});
    }

    // Build the redirect response, then set ALL cookies on it directly.
    // NEVER use cookieStore.set() here — those cookies are on a different
    // response object and are silently discarded when NextResponse.redirect()
    // is returned. The browser would never receive Set-Cookie headers.
    const res = NextResponse.redirect(
      new URL(`${returnTo}?icu_connected=1`, req.nextUrl.origin)
    );

    res.cookies.set("zwift_intervals_key", accessTokenValue, {
      ...cookieBase,
      maxAge: tokens.expires_in, // seconds — typically 3600
    });

    if (tokens.refresh_token) {
      res.cookies.set(INTERVALS_REFRESH_COOKIE, tokens.refresh_token, {
        ...cookieBase,
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    res.cookies.set(INTERVALS_EXPIRES_COOKIE, String(expiresAt), {
      ...cookieBase,
      httpOnly: false, // readable by client JS
      maxAge: 60 * 60 * 24 * 365,
    });

    res.cookies.set("zwift_intervals_id", athleteId, {
      ...cookieBase,
      maxAge: 60 * 60 * 24 * 365,
    });

    res.cookies.set("zwift_intervals_name", athleteName, {
      ...cookieBase,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    });

    await writeDebug("redirect_ok", `returnTo=${returnTo} cookie_key_set=true expires_in=${tokens.expires_in}`);
    return res;

  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth exchange failed";
    await writeDebug("error", msg);
    return NextResponse.redirect(
      new URL(`${returnTo}?icu_error=${encodeURIComponent(msg)}`, req.nextUrl.origin)
    );
  }
}
