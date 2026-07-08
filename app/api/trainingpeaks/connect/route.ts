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
import { kvSet, kvDel } from "@/lib/kv";

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
  const { tpToken, refreshToken, expiresIn, athleteId: clientAthleteId } = await req.json() as {
    tpToken?: string;
    refreshToken?: string | null;
    expiresIn?: number | null;
    athleteId?: string | null;
  };
  if (!tpToken?.trim()) {
    return NextResponse.json({ ok: false, error: "No token provided." });
  }

  // ── Validate / identify athlete ──────────────────────────────────────────
  // The bookmarklet (running on app.trainingpeaks.com) always sends `athleteId`
  // in the POST body, even when empty — its presence signals "the user ran the
  // bookmarklet and obtained a real TP token client-side, so we trust it without
  // a server-side round-trip to TP's API".
  //
  // Server-side calls to TP from Vercel can fail silently (TP may block
  // AWS/Vercel IPs, or rate-limit cross-server calls) and are avoided whenever
  // the bookmarklet path already did the work.
  //
  // athleteId can be empty string if the client-side profile fetch failed (e.g.
  // CORS on the user endpoint) — still skip server-side validation and store
  // the token. The athlete ID will be resolved on the first actual TP push via
  // the refreshTPToken / profile re-fetch path, or can remain empty if TP pushes
  // are not used.
  // `clientAthleteId` is `undefined` only when the `athleteId` key was absent
  // from the POST body entirely (old bookmarklet / direct API call).
  // When the new bookmarklet sends it — even as null or "" — it's defined,
  // which signals "user ran the bookmarklet and the token is real; skip server
  // validation".
  let tpAthleteId: string;
  let athleteName: string;

  if (clientAthleteId !== undefined) {
    // Bookmarklet path — trust the token, use whatever athlete ID the client got.
    tpAthleteId = clientAthleteId?.trim() ?? "";
    athleteName = "TrainingPeaks user";
  } else {
    // Direct API / legacy path — try to validate server-side.
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
    tpAthleteId = String(profile.personId ?? profile.athleteId ?? profile.userId ?? "");
    athleteName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "TrainingPeaks user";
  }

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
  // Store refresh token if TP provides one (allows auto-refresh without bookmarklet)
  if (refreshToken) {
    cookieStore.set("zwift_tp_refresh", refreshToken, cookieOpts);
  }
  // Store token expiry timestamp for proactive refresh warnings
  if (expiresIn) {
    const expiresAt = Date.now() + expiresIn * 1000;
    cookieStore.set("zwift_tp_expires", String(expiresAt), { ...cookieOpts, httpOnly: false });
  }

  // Mirror to KV so other devices auto-restore on login
  if (session.athleteId) {
    await kvSet(`zwift:${session.athleteId}:tp_token`, tpToken.trim());
    await kvSet(`zwift:${session.athleteId}:tp_id`, tpAthleteId);
    if (refreshToken) await kvSet(`zwift:${session.athleteId}:tp_refresh`, refreshToken);
    if (expiresIn) await kvSet(`zwift:${session.athleteId}:tp_expires_in`, String(expiresIn));
  }

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
  cookieStore.delete("zwift_tp_refresh");
  cookieStore.delete("zwift_tp_expires");

  // Remove from KV too (session was already decrypted above)
  if (session?.athleteId) {
    await kvDel(
      `zwift:${session.athleteId}:tp_token`,
      `zwift:${session.athleteId}:tp_refresh`,
      `zwift:${session.athleteId}:tp_id`,
      `zwift:${session.athleteId}:tp_expires_in`,
    );
  }

  const response = NextResponse.json({ ok: true });
  Object.entries(corsHeaders()).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}
