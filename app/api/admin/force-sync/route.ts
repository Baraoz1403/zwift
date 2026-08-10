import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
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
 * Auth: CRON_SECRET header/query OR Barak's session (athleteId 1040300).
 */

const ADMIN_ATHLETE_ID = "1040300";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("x-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
    const queryParam = req.nextUrl.searchParams.get("secret");
    if (header === secret || queryParam === secret) return true;
  }
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!raw) return false;
    const session = await decryptSession(raw);
    return Boolean(session?.athleteId && String(session.athleteId) === ADMIN_ATHLETE_ID);
  } catch {
    return false;
  }
}

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
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
