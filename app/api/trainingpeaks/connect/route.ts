/**
 * POST /api/trainingpeaks/connect
 *
 * Validates a TrainingPeaks auth token (the Production_tpAuth cookie value
 * from the user's browser) and stores it in their Zwift session.
 *
 * Body: { tpToken: string }
 * Response: { ok: boolean, athleteName?: string, error?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchTPProfile } from "@/lib/trainingpeaks";

// Allow the TrainingPeaks bookmarklet (running on app.trainingpeaks.com) to POST
// credentials directly to this endpoint. The bookmarklet exchanges the TP session
// cookie (HttpOnly) for a gAAAA token on the TP origin, then sends it here via
// a credentialed cross-origin fetch so we never have to touch DevTools.
const CORS_ORIGIN = "https://app.trainingpeaks.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** Handle CORS preflight from the bookmarklet */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  // ── Require existing Zwift session ────────────────────────────────────────
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in to Zwift." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  // ── Parse body ────────────────────────────────────────────────────────────
  const { tpToken } = await req.json() as { tpToken?: string };
  if (!tpToken?.trim()) {
    return NextResponse.json({ ok: false, error: "No token provided." });
  }

  // ── Validate token with TrainingPeaks ─────────────────────────────────────
  let profile;
  try {
    profile = await fetchTPProfile(tpToken.trim());
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "TrainingPeaks validation failed.",
    });
  }

  // tpapi returns personId/athleteId (not legacy .Id)
  const tpAthleteId = String(profile.personId ?? profile.athleteId ?? profile.userId ?? "");
  const athleteName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "TrainingPeaks user";

  // ── Store TP credentials in a separate cookie to avoid 4KB session limit ──
  // The Zwift session already contains large tokens; adding the gAAAA TP token
  // (800+ chars) would push the encrypted cookie over the browser's 4KB limit.
  // Solution: write tpToken + tpAthleteId to a dedicated "zwift_tp" cookie.
  const isSecure = process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };

  cookieStore.set("zwift_tp_token", tpToken.trim(), cookieOpts);
  cookieStore.set("zwift_tp_id", tpAthleteId, cookieOpts);

  const response = NextResponse.json({ ok: true, athleteName, tpAthleteId });
  Object.entries(corsHeaders()).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

/**
 * DELETE /api/trainingpeaks/connect — disconnect TrainingPeaks
 */
export async function DELETE() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  // Remove TP cookies
  cookieStore.delete("zwift_tp_token");
  cookieStore.delete("zwift_tp_id");
  const response = NextResponse.json({ ok: true });
  Object.entries(corsHeaders()).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}
