/**
 * GET /api/strava/oauth-start
 *
 * Redirects the user to Strava's OAuth authorization page.
 * After approval, Strava will redirect back to /api/strava/oauth-callback.
 *
 * Requires env vars: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { buildStravaAuthUrl } from "@/lib/strava";

export async function GET(req: NextRequest) {
  // Require Zwift session — only logged-in users can connect Strava
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not logged in to Zwift." }, { status: 401 });
  }
  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ error: "Session expired." }, { status: 401 });
  }

  if (!process.env.STRAVA_CLIENT_ID) {
    return NextResponse.json(
      { error: "STRAVA_CLIENT_ID is not configured. Add it to your Vercel env vars." },
      { status: 500 }
    );
  }

  // Build the callback URL from the incoming request's origin
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/strava/oauth-callback`;

  const authUrl = buildStravaAuthUrl(redirectUri);
  return NextResponse.redirect(authUrl);
}
