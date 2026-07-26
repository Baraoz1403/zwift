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

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/intervals/oauth-callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // ACTIVITY:READ — fetch completed activities for training load analysis
    // CALENDAR:WRITE — push planned workouts to the athlete's calendar
    scope: "ACTIVITY:READ CALENDAR:WRITE",
  });

  return NextResponse.redirect(`${INTERVALS_AUTH_URL}?${params}`);
}
