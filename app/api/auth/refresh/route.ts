import { NextRequest, NextResponse } from "next/server";
import { decryptSession, encryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { refreshZwiftToken, ZwiftApiError } from "@/lib/zwift";
import { mirrorZwiftAuthToKv } from "@/lib/kv-plan-state";

/**
 * GET /api/auth/refresh?next=/dashboard
 *
 * Reads the current session, uses the stored refresh_token to obtain a new
 * Zwift access_token, writes a fresh encrypted cookie, then redirects to
 * the `next` query param (default: /dashboard).
 *
 * If no refresh token is available or Zwift rejects the refresh (e.g. the
 * user changed their Zwift password), the session cookie is cleared and the
 * user is redirected to /login.
 */
export async function GET(req: NextRequest) {
  const nextUrl = req.nextUrl.searchParams.get("next") ?? "/dashboard";
  const raw = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!raw) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const session = await decryptSession(raw);
  if (!session || !session.refreshToken) {
    // No session or no refresh token stored — ask for a fresh login
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }

  try {
    const refreshed = await refreshZwiftToken(session.refreshToken);

    // Zwift may rotate the refresh token on every use - mirror whatever the
    // newest one is to KV so the cron job's own refresh call later doesn't
    // try to reuse an already-spent token (see lib/kv-plan-state.ts).
    if (session.athleteId) {
      await mirrorZwiftAuthToKv(session.athleteId, refreshed.refreshToken);
    }

    const newCookieValue = await encryptSession({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      athleteId: session.athleteId,
      expiresAt: Date.now() + refreshed.expiresInSeconds * 1000,
    });

    const res = NextResponse.redirect(new URL(nextUrl, req.url));
    res.cookies.set(SESSION_COOKIE_NAME, newCookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  } catch (e) {
    // Refresh token itself is expired or Zwift rejected it — force re-login
    const isApiError = e instanceof ZwiftApiError;
    console.error(
      `[auth/refresh] Token refresh failed${isApiError ? ` (HTTP ${(e as ZwiftApiError).status})` : ""}:`,
      (e as Error).message
    );
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }
}
