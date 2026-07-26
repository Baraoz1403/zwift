import { NextRequest, NextResponse } from "next/server";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";

/**
 * GET /api/admin/reveal-icu-key?athleteId=...
 *
 * Single-athlete-only (never a bulk listing, unlike list-athletes) readback
 * of a stored Intervals.icu API key - needed to run the same direct
 * ICU-API verification (list events, confirm no orphans) against an
 * athlete whose raw key wasn't provided out of band. Same CRON_SECRET auth
 * as every other admin route; requires an explicit athleteId so a single
 * call can't dump every athlete's credentials at once.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const header = req.headers.get("authorization");
  const queryParam = req.nextUrl.searchParams.get("secret");
  if (header !== `Bearer ${secret}` && queryParam !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const athleteId = req.nextUrl.searchParams.get("athleteId");
  if (!athleteId) {
    return NextResponse.json({ ok: false, error: "athleteId required." }, { status: 400 });
  }

  const creds = await getIntervalsCredentials(athleteId);
  if (!creds) {
    return NextResponse.json({ ok: false, error: "No ICU credentials on record for this athlete." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, athleteId, icuKey: creds.icuKey, icuId: creds.icuId });
}
