import { NextRequest, NextResponse } from "next/server";
import { kvSet } from "@/lib/kv";

/**
 * POST /api/admin/reset-cycle
 * Resets the macroCycle for an athlete in KV.
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-secret") ?? new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { athleteId, weekIndex, lastWeekOf } = await req.json();
  if (!athleteId || weekIndex === undefined || !lastWeekOf) {
    return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }
  const key = `zwift:${athleteId}:macro_cycle`;
  const value = JSON.stringify({ weekIndex, lastWeekOf });
  await kvSet(key, value);
  return NextResponse.json({ ok: true, key, value });
}