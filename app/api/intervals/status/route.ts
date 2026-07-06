/**
 * GET /api/intervals/status
 * Returns whether Intervals.icu is connected in the current session.
 * API keys don't expire like TP's 1h tokens, so presence of the cookie is
 * enough here - actual validity is (re)checked on push.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const apiKey = cookieStore.get("zwift_intervals_key")?.value;
  const athleteName = cookieStore.get("zwift_intervals_name")?.value;

  return NextResponse.json({
    connected: !!apiKey,
    athleteName: athleteName ?? null,
  });
}
