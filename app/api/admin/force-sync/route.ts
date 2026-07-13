import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";
import { listIntervalsEvents, deleteEventFromIntervals } from "@/lib/intervals";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";

/**
 * POST /api/admin/force-sync
 * Deletes ALL planned workouts for the current week from Intervals.icu
 * for every registered athlete, then re-pushes the current plan.
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-secret") ?? new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Get all registered athletes
  const athleteListRaw = await kvGet("zwift:athletes");
  const athletes: string[] = athleteListRaw ? JSON.parse(athleteListRaw) : [];
  
  const results: Record<string, unknown> = {};

  for (const athleteId of athletes) {
    try {
      const creds = await getIntervalsCredentials(athleteId);
      if (!creds?.icuKey) { results[athleteId] = { error: "no ICU key" }; continue; }

      // Wide cleanup: 6 weeks back to 3 weeks forward
      const now = new Date();
      const oldest = new Date(now); oldest.setUTCDate(oldest.getUTCDate() - 42);
      const newest = new Date(now); newest.setUTCDate(newest.getUTCDate() + 21);
      
      const oldestStr = oldest.toISOString().slice(0,10);
      const newestStr = newest.toISOString().slice(0,10);

      // List all planned events in range
      const events = await listIntervalsEvents(creds.icuKey, creds.icuId ?? athleteId, oldestStr, newestStr);
      const planned = events.filter((e: {type?: string}) => e.type === "Workout" || !e.type);
      
      // Delete all planned events
      let deleted = 0;
      for (const ev of planned) {
        try { await deleteEventFromIntervals(creds.icuKey, creds.icuId ?? athleteId, ev.id); deleted++; } 
        catch { /* continue */ }
      }

      // Get current plan from KV
      const planRaw = await kvGet(`zwift:${athleteId}:plan:2026-07-13`);
      const plan = planRaw ? JSON.parse(planRaw) : null;

      let pushed = 0;
      if (plan) {
        const syncResult = await syncPlanToIcuAndMark(
          athleteId, plan, creds.icuKey, creds.icuId ?? athleteId, { force: true }
        );
        pushed = syncResult?.pushed ?? 0;
      }

      results[athleteId] = { deleted, pushed, plan: plan?.weekOf ?? "no plan" };
    } catch (e) {
      results[athleteId] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, athletes, results });
}