import { NextResponse } from "next/server";

/**
 * Direct workout writes to Zwift are outside the pilot contract.
 * Pilot workouts must flow through Intervals.icu and sync onward to Zwift.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Direct Zwift upload disabled; use Intervals.icu sync" },
    { status: 404 },
  );
}
