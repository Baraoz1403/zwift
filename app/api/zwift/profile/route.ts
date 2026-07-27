import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, encryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile, refreshZwiftToken, ZwiftApiError } from "@/lib/zwift";
import { mirrorZwiftAuthToKv } from "@/lib/kv-plan-state";

/**
 * GET /api/zwift/profile
 *
 * Returns the logged-in rider's Zwift profile (name, FTP, weight, level).
 *
 * Auto-refreshes the Zwift access token on 401 — this is the permanent fix
 * for FTP disappearing from the dashboard. The Zwift access token expires in
 * ~1 hour but the session cookie lives 30 days. Without this refresh, any
 * page load more than ~1h after login would see ftp=null in PhaseCard because
 * fetchOwnProfile throws a ZwiftApiError(401) and the route returned
 * { ok: false }, causing weekly-plan.tsx to bail before setFtp().
 *
 * Refresh flow:
 *   1. Try fetchOwnProfile with the stored access token.
 *   2. On ZwiftApiError with status 401: call refreshZwiftToken() with the
 *      stored refresh token.
 *   3. Write a new encrypted session cookie with the fresh token pair.
 *   4. Mirror the newest refresh token to KV (for the cron job).
 *   5. Retry fetchOwnProfile with the new access token.
 *   6. On any other error (no refresh token, Zwift rejects refresh): return
 *      ok: false without touching the cookie — let the cron/health paths handle it.
 */
export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session invalid or expired." }, { status: 401 });
  }

  // ── First attempt ────────────────────────────────────────────────────────────
  try {
    const profile = await fetchOwnProfile(session.accessToken);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    // Only attempt refresh on a definitive 401 from Zwift.
    // Other errors (network, 5xx) propagate normally below.
    const isExpired = e instanceof ZwiftApiError && e.status === 401;
    if (!isExpired || !session.refreshToken) {
      if (e instanceof ZwiftApiError) {
        return NextResponse.json(
          { ok: false, error: e.message, status: e.status },
          { status: 200 }
        );
      }
      return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
    }
  }

  // ── Token refresh path ───────────────────────────────────────────────────────
  try {
    const refreshed = await refreshZwiftToken(session.refreshToken);

    // Mirror the newest refresh token to KV — Zwift may rotate it on every
    // use; the cron job must always use the most recently issued one or its
    // own refresh call will fail with "already used".
    if (session.athleteId) {
      await mirrorZwiftAuthToKv(session.athleteId, refreshed.refreshToken);
    }

    // Write a fresh session cookie with the new token pair so subsequent
    // page loads (profile, plan generation, etc.) all use the live token
    // without needing to pass through this refresh path again for ~1h.
    const newCookieValue = await encryptSession({
      accessToken:  refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      athleteId:    session.athleteId,
      expiresAt:    Date.now() + refreshed.expiresInSeconds * 1000,
    });

    const isSecure = process.env.NODE_ENV === "production";
    cookieStore.set(SESSION_COOKIE_NAME, newCookieValue, {
      httpOnly: true,
      secure:   isSecure,
      sameSite: "lax",
      path:     "/",
      maxAge:   60 * 60 * 24 * 30, // 30 days — same as login
    });

    // Retry with the fresh access token.
    const profile = await fetchOwnProfile(refreshed.accessToken);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    // Refresh failed (Zwift rejected the refresh token, or a network error).
    // Return a clear error but do NOT delete the cookie — the cron/health
    // paths may still revive the session, and a forced logout here would
    // surprise a rider who's mid-session.
    if (e instanceof ZwiftApiError) {
      return NextResponse.json(
        { ok: false, error: e.message, status: e.status },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: false, error: "Token refresh failed." }, { status: 500 });
  }
}
