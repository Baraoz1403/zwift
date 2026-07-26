/**
 * GET /api/strava/status
 *
 * Reports whether the user has a valid Strava connection.
 * Used by the dashboard to show/hide the Strava banner.
 *
 * Response: { connected: boolean, athleteName?: string }
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  STRAVA_TOKEN_COOKIE,
  STRAVA_NAME_COOKIE,
} from "../oauth-callback/route";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(STRAVA_TOKEN_COOKIE)?.value;
  const name  = cookieStore.get(STRAVA_NAME_COOKIE)?.value;
  return NextResponse.json({
    connected: !!token,
    athleteName: name ?? null,
  });
}

/**
 * DELETE /api/strava/status — disconnect Strava
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("zwift_strava_token");
  cookieStore.delete("zwift_strava_refresh");
  cookieStore.delete("zwift_strava_expires");
  cookieStore.delete("zwift_strava_id");
  cookieStore.delete("zwift_strava_name");
  return NextResponse.json({ ok: true });
}
