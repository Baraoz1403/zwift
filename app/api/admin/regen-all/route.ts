import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { runWeeklyPlanGeneration } from "@/lib/plan-runner";
import { refreshZwiftToken } from "@/lib/zwift";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";
import {
  getKnownAthletes,
  getStoredZwiftRefreshToken,
  getStoredAthleteState,
  mirrorZwiftAuthToKv,
  setCachedPlan,
} from "@/lib/kv-plan-state";

/**
 * POST /api/admin/regen-all
 *
 * Regenerates plans for ALL registered athletes for one or more weeks,
 * running SEQUENTIALLY (one athlete × one week at a time) to avoid
 * Vercel concurrency / memory limits.
 *
 * Body: { weeks?: string[], athleteIds?: string[] }  — defaults to [currentWeek, nextWeek] for all athletes
 * Auth: Barak session (athleteId 1040300) OR x-admin-bypass header = first 16 chars of SESSION_SECRET.
 */

export const maxDuration = 300;
const ADMIN_ATHLETE_ID = "1040300";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Option 1: cookie session
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (raw) {
      const session = await decryptSession(raw);
      if (session?.athleteId && String(session.athleteId) === ADMIN_ATHLETE_ID) return true;
    }
  } catch { /* ignore */ }

  // Option 2: SESSION_SECRET bypass (first 16 chars) — for headless regen when no admin cookie
  const bypass = req.headers.get("x-admin-bypass");
  const sessionSecret = process.env.SESSION_SECRET;
  if (bypass && sessionSecret && bypass === sessionSecret.slice(0, 16)) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const currentWeek = mondayOfCurrentWeek();
  const nextWeek = (() => {
    const d = new Date(currentWeek + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const weeks: string[] = Array.isArray(body.weeks) && body.weeks.length > 0
    ? body.weeks
    : [currentWeek];

  const allAthleteIds = await getKnownAthletes();
  const athleteIds: string[] = Array.isArray(body.athleteIds) && body.athleteIds.length > 0
    ? body.athleteIds
    : allAthleteIds;

  const results: Record<string, Record<string, unknown>> = {};

  for (const athleteId of athleteIds) {
    results[athleteId] = {};
    for (const weekOf of weeks) {
      try {
        const refreshToken = await getStoredZwiftRefreshToken(athleteId);
        if (!refreshToken) {
          results[athleteId][weekOf] = { skipped: "no refresh token" };
          continue;
        }
        const refreshed = await refreshZwiftToken(refreshToken);
        await mirrorZwiftAuthToKv(athleteId, refreshed.refreshToken);
        const state = await getStoredAthleteState(athleteId);

        const result = await runWeeklyPlanGeneration({
          accessToken: refreshed.accessToken,
          incomingCycle: state.macroCycle,
          previousPlan: state.previousPlan,
          riderProfile: state.riderProfile,
          targetWeekOf: weekOf,
        });

        await setCachedPlan(athleteId, {
          weekOf: result.weekOf,
          summary: result.plan.summary,
          workouts: result.plan.workouts,
        });

        let pushed = 0, deleted = 0;
        if (state.icuKey) {
          const riddenDates = new Set(
            result.rides.map(r => (r.date ?? "").slice(0, 10)).filter(Boolean)
          );
          const syncResult = await syncPlanToIcuAndMark(
            athleteId, result.weekOf,
            { weekOf: result.weekOf, summary: result.plan.summary, workouts: result.plan.workouts },
            riddenDates, result.firstName,
          );
          pushed = syncResult?.pushed ?? 0;
          deleted = syncResult?.deleted ?? 0;
        }

        results[athleteId][weekOf] = {
          ok: true,
          workouts: result.plan.workouts.map(w => ({ day: w.day, title: w.title, type: w.type, durationMin: w.durationMin })),
          icu: { pushed, deleted },
        };
      } catch (e) {
        results[athleteId][weekOf] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  return NextResponse.json({ ok: true, weeks, athletes: athleteIds, results });
}
// build-trigger: regen-bypass-added
