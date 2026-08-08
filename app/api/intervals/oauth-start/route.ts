/**
 * GET /api/intervals/oauth-start
 *
 * Redirects the user to the Intervals.icu OAuth consent page.
 * After authorization, intervals.icu redirects to /api/intervals/oauth-callback.
 *
 * Requires env vars: INTERVALS_CLIENT_ID, INTERVALS_CLIENT_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

const INTERVALS_AUTH_URL = "https://intervals.icu/oauth/authorize";
const PILOT_REDIRECT_URI = "https://zwift-git-agent-volt-e2e-pilot-barak1403-9441s-projects.vercel.app/api/intervals/oauth-callback";

export async function GET(req: NextRequest) {
  // Require Zwift session — only logged-in users can connect Intervals.icu
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not logged in to Zwift." }, { status: 401 });
  }
  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ error: "Session expired." }, { status: 401 });
  }

  const clientId = process.env.INTERVALS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "INTERVALS_CLIENT_ID is not configured." },
      { status: 500 }
    );
  }

  // Encode the return destination in the OAuth state param so the callback
  // can redirect back to the right place (/m vs /dashboard).
  const from = req.nextUrl.searchParams.get("from") ?? "dashboard";
  const origin = req.nextUrl.origin;
  const redirectUri = from === "pilot"
    ? PILOT_REDIRECT_URI
    : `${origin}/api/intervals/oauth-callback`;
  // prompt=none triggers a silent re-auth — intervals.icu skips the consent
  // screen if the user is already authenticated and has previously approved
  // this client. Used for automatic token renewal when the Bearer token expires.
  const silent = req.nextUrl.searchParams.get("prompt") === "none";
  const state = Buffer.from(JSON.stringify({ from, silent })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // ACTIVITY:READ  — fetch completed activities for training load analysis
    // CALENDAR:WRITE — push planned workouts to the athlete's calendar
    // SETTINGS:READ  — read athlete profile (id, name) after token exchange
    scope: "ACTIVITY:READ CALENDAR:WRITE SETTINGS:READ",
    state,
    ...(silent ? { prompt: "none" } : {}),
  });

  return NextResponse.redirect(`${INTERVALS_AUTH_URL}?${params}`);
}
