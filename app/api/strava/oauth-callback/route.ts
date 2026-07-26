/**
 * GET /api/strava/oauth-callback?code=...&scope=...
 *
 * Handles Strava's OAuth redirect after the user authorizes access.
 * Exchanges the authorization code for tokens and stores them in an
 * HttpOnly cookie, then redirects back to the dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { exchangeStravaCode, refreshStravaToken, type StravaTokens } from "@/lib/strava";

/** Cookie names for Strava credentials (separate small cookies, same pattern as TP). */
export const STRAVA_TOKEN_COOKIE  = "zwift_strava_token";
export const STRAVA_REFRESH_COOKIE = "zwift_strava_refresh";
export const STRAVA_EXPIRES_COOKIE = "zwift_strava_expires";
export const STRAVA_ID_COOKIE      = "zwift_strava_id";
export const STRAVA_NAME_COOKIE    = "zwift_strava_name";

function setCookies(cookieStore: Awaited<ReturnType<typeof cookies>>, tokens: StravaTokens) {
  const isSecure = process.env.NODE_ENV === "production";
  const base = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 60, // 60 days (refresh token is long-lived)
    path: "/",
  };
  cookieStore.set(STRAVA_TOKEN_COOKIE,   tokens.access_token,         base);
  cookieStore.set(STRAVA_REFRESH_COOKIE, tokens.refresh_token,         base);
  cookieStore.set(STRAVA_EXPIRES_COOKIE, String(tokens.expires_at),    base);
  cookieStore.set(STRAVA_ID_COOKIE,      String(tokens.athlete_id),    base);
  cookieStore.set(STRAVA_NAME_COOKIE,    tokens.athlete_name,          base);
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

  // Require Zwift session
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  const session = await decryptSession(raw);
  if (!session) return NextResponse.redirect(new URL("/", req.nextUrl.origin));

  // Strava returns error param when user denies access
  const searchParams = req.nextUrl.searchParams;
  const error = searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard?strava_error=${encodeURIComponent(error)}`, req.nextUrl.origin)
    );
  }

  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard?strava_error=no_code", req.nextUrl.origin)
    );
  }

  try {
    const tokens = await exchangeStravaCode(code);
    setCookies(cookieStore, tokens);
    return NextResponse.redirect(
      new URL("/dashboard?strava_connected=1", req.nextUrl.origin)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.redirect(
      new URL(`/dashboard?strava_error=${encodeURIComponent(msg)}`, req.nextUrl.origin)
    );
  }
}

/**
 * Helper used by other API routes: reads the Strava token from cookie,
 * auto-refreshes if expired, and returns a valid access token.
 * Returns null if Strava is not connected.
 */
export async function getValidStravaToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken  = cookieStore.get(STRAVA_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(STRAVA_REFRESH_COOKIE)?.value;
  const expiresAt    = Number(cookieStore.get(STRAVA_EXPIRES_COOKIE)?.value ?? 0);

  if (!accessToken || !refreshToken) return null;

  // If token expires within 60 seconds, refresh proactively
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec > 60) return accessToken;

  try {
    const tokens = await refreshStravaToken(refreshToken);
    setCookies(cookieStore, tokens);
    return tokens.access_token;
  } catch {
    return null;
  }
}
