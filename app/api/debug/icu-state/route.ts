import { NextResponse } from "next/server";

/**
 * The legacy endpoint exposed session and Intervals.icu connection metadata.
 * It is intentionally unavailable in the isolated pilot.
 */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Debug endpoint disabled in pilot" },
    { status: 404 },
  );
}
