import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { getCachedPlan } from "@/lib/kv-plan-state";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";
import { mondayOfCurrentWeek } from "@/lib/periodization";

/**
 * POST /api/admin/force-sync
 *
 * Re-pushes each registered athlete's already-cached CURRENT-week plan to
 * Intervals.icu, replacing whatever's on the calendar now - a cheap resync
 * for when the cached plan content is already correct but the calendar
 * itself has drifted (stale duplicates, a manual ICU edit, Zwift showing a
 * cached copy of an old push). Unlike /api/admin/repair-plan, this does NOT
 * regenerate anything (no AI call) - if the cached plan itself is wrong,
 * use repair-plan instead.
 *
 * Rewritten from an earlier version of this file that called
 * listIntervalsEvents/deleteEventFromIntervals directly with wrong-order
 * arguments (real signatures are (apiKey, oldest, newest, athleteId) and
 * (apiKey, eventId, athleteId) respectively - this file had icuId and
 * eventId swapped) and manually deleted every event BEFORE pushing
 * replacements. That delete-before-push ordering is exactly the bug
 * lib/headless-sync.ts's own doc comment documents as a real past
 * production incident (an empty-calendar outage when the push step failed
 * after the wipe already succeeded) - syncPlanToIcuAndMark exists
 * specifically to push fresh copies first and only then delete stale ones,
 * matched by date. Reusing it here instead of re-deriving the same logic a
 * second, less-safe way.
 *
 * Protected by CRON_SECRET, same pattern as every other admin/cron route.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const athleteListRaw = await kvGet("zwift:athletes");
  const athletes: string[] = athleteListRaw ? JSON.parse(athleteListRaw) : [];
  const weekOf = mondayOfCurrentWeek();

  const results: Record<string, unknown> = {};

  for (const athleteId of athletes) {
    try {
      const plan = await getCachedPlan(athleteId, weekOf);
      if (!plan) {
        results[athleteId] = { skipped: "no cached plan for current week" };
        continue;
      }

      // riddenDates unknown here (no Zwift access token in this headless
      // admin path) - passing an empty set means an already-ridden day gets
      // a redundant planned event re-pushed, same accepted trade-off the
      // interactive route's self-heal branch makes for the same reason.
      const syncResult = await syncPlanToIcuAndMark(athleteId, weekOf, plan, new Set());
      results[athleteId] = {
        pushed: syncResult?.pushed ?? 0,
        deleted: syncResult?.deleted ?? 0,
        errors: syncResult?.errors ?? [],
      };
    } catch (e) {
      results[athleteId] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, weekOf, athletes, results });
}
