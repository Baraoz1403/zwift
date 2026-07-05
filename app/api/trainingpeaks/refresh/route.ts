/**
 * POST /api/trainingpeaks/refresh
 *
 * Attempts to refresh the TrainingPeaks access token using the stored
 * refresh token (zwift_tp_refresh cookie).
 *
 * Returns: { ok: boolean, renewed?: boolean, error?: string }
 *   renewed: true  = got a new token
 *   renewed: false = refresh not needed (token still valid) or no refresh available
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { refreshTPToken } from "@/lib/trainingpeaks";

export async function POST() {
  const cookieStore = await cookies();

  // Must be logged in to Zwift
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? await decryptSession(raw) : null;
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const refreshToken = cookieStore.get("zwift_tp_refresh")?.value;
  const expiresAtStr = cookieStore.get("zwift_tp_expires")?.value;

  // No refresh token stored — can't auto-refresh
  if (!refreshToken) {
    return NextResponse.json({ ok: false, renewed: false, error: "No refresh token stored. Re-connect TrainingPeaks." });
  }

  // Check if token actually needs refresh (expires within 10 minutes)
  if (expiresAtStr) {
    const expiresAt = Number(expiresAtStr);
    const tenMinutes = 10 * 60 * 1000;
    if (!isNaN(expiresAt) && expiresAt > Date.now() + tenMinutes) {
      // Token still valid — no need to refresh
      return NextResponse.json({ ok: true, renewed: false });
    }
  }

  // Attempt the refresh
  let newToken: string;
  try {
    newToken = await refreshTPToken(refreshToken);
  } catch (e) {
    return NextResponse.json({
      ok: false,
      renewed: false,
      error: e instanceof Error ? e.message : "TP token refresh failed",
    });
  }

  // Store the new token
  const isSecure = process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };

  cookieStore.set("zwift_tp_token", newToken, cookieOpts);

  // Reset expiry to 1 hour from now (standard TP token TTL)
  const newExpiresAt = Date.now() + 60 * 60 * 1000;
  cookieStore.set("zwift_tp_expires", String(newExpiresAt), { ...cookieOpts, httpOnly: false });

  return NextResponse.json({ ok: true, renewed: true });
}
