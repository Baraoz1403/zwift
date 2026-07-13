import { NextRequest, NextResponse } from "next/server";
import { refreshZwiftToken, ZwiftApiError } from "@/lib/zwift";
import { runWeeklyPlanGeneration, AiInsightsError } from "@/lib/plan-runner";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import type { MacroCycleState } from "@/lib/periodization";
import type { WeeklyWorkout } from "@/lib/ai";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";
import {
  getKnownAthletes,
  getStoredZwiftRefreshToken,
  getStoredAthleteState,
  mirrorZwiftAuthToKv,
  mirrorStateToKv,
  setCachedPlan,
} from "@/lib/kv-plan-state";

/**
 * GET /api/admin/repair-plan
 *
 * One-off repair tool: force-regenerates a rider's plan for specific weeks
 * (bypassing the per-week KV cache that every normal path respects) and
 * force-pushes the result to Intervals.icu, replacing whatever is currently
 * sitting on the rider's calendar for those weeks. Exists because
 * app/api/ai/weekly-plan/cron/route.ts deliberately does NOT do this - it
 * only ever generates a not-yet-existing week and only ever dedups an
 * already-current one, so a week that was already generated with old/buggy
 * selection logic (e.g. the Foundation-Ride-padding bug this tool was built
 * to clean up after) stays cached and stale forever without a way to force
 * it. This is that missing "throw out the cache and redo this week
 * properly" lever, meant to be run by hand, not on a schedule.
 *
 * Auth: same shared-secret pattern as the cron route (CRON_SECRET) - there
 * is no browser session for a headless repair run either.
 *
 * Query params:
 *   athleteId  - optional; repair only this athlete. Default: every athlete
 *                in the zwift:athletes registry.
 *   weeks      - optional, comma-separated "YYYY-MM-DD" Mondays. Default:
 *                the current week's Monday and the following Monday (the
 *                two-week window this tool was first built to fix).
 *
 * Each athlete's weeks are processed sequentially, oldest first, threading
 * the macro-cycle state from one week's result into the next's input -
 * exactly like a rider actually living through those weeks would - so a
 * two-week repair doesn't desync the mesocycle pointer from the phase each
 * regenerated plan actually reflects.
 */

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed - refuse to run an unconfigured, unauthenticated job
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const queryParam = req.nextUrl.searchParams.get("secret");
  if (queryParam === secret) return true;
  return false;
}

interface WeekRunResult {
  weekOf: string;
  status: "generated" | "error";
  pushed?: number;
  deleted?: number;
  errors?: string[];
  error?: string;
}

interface AthleteRepairResult {
  athleteId: string;
  status: "repaired" | "skipped-no-refresh-token" | "error";
  weeks?: WeekRunResult[];
  error?: string;
}

function defaultWeeks(): string[] {
  const thisMonday = mondayOfCurrentWeek();
  const next = new Date(thisMonday + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 7);
  return [thisMonday, next.toISOString().slice(0, 10)];
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const athleteIdParam = req.nextUrl.searchParams.get("athleteId");
  const weeksParam = req.nextUrl.searchParams.get("weeks");
  const weeks = weeksParam
    ? weeksParam.split(",").map((w) => w.trim()).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w))
    : defaultWeeks();
  const currentWeekMonday = mondayOfCurrentWeek();

  const athleteIds = athleteIdParam ? [athleteIdParam] : await getKnownAthletes();
  const results: AthleteRepairResult[] = [];

  for (const athleteId of athleteIds) {
    try {
      const storedRefreshToken = await getStoredZwiftRefreshToken(athleteId);
      if (!storedRefreshToken) {
        results.push({ athleteId, status: "skipped-no-refresh-token" });
        continue;
      }

      const refreshed = await refreshZwiftToken(storedRefreshToken);
      await mirrorZwiftAuthToKv(athleteId, refreshed.refreshToken);

      const state = await getStoredAthleteState(athleteId);
      let runningMacroCycle: MacroCycleState | null = state.macroCycle;
      let runningPreviousPlan: { weekOf: string; workouts: WeeklyWorkout[] } | null = state.previousPlan;

      const weekResults: WeekRunResult[] = [];
      for (const weekOf of [...weeks].sort()) {
        try {
          const result = await runWeeklyPlanGeneration({
            accessToken: refreshed.accessToken,
            incomingCycle: runningMacroCycle,
            previousPlan: runningPreviousPlan,
            riderProfile: state.riderProfile,
            targetWeekOf: weekOf,
          });

          await setCachedPlan(athleteId, {
            weekOf: result.weekOf,
            summary: result.plan.summary,
            workouts: result.plan.workouts,
          });

          // Only move the "current pointer" (last_plan / macro_cycle) for the
          // real current week - mirrors the same rule the interactive route
          // uses so a repaired future week doesn't get treated as "now".
          if (result.weekOf === currentWeekMonday) {
            await mirrorStateToKv(athleteId, {
              riderProfile: state.riderProfile,
              macroCycle: result.macroCycle,
              plan: { weekOf: result.weekOf, workouts: result.plan.workouts },
            });
          }

          runningMacroCycle = result.macroCycle;
          runningPreviousPlan = { weekOf: result.weekOf, workouts: result.plan.workouts };

          let pushed: number | undefined;
          let deleted: number | undefined;
          let errors: string[] | undefined;
          if (state.icuKey) {
            // syncPlanToIcuAndMark always pushes fresh copies + cleans up
            // duplicates on every call, regardless of any prior "already
            // synced" marker - exactly what's needed to overwrite stale
            // Foundation Ride spam already sitting on the calendar.
            const riddenDates = new Set(
              result.rides.map((r) => (r.date ?? "").slice(0, 10)).filter(Boolean)
            );
            const syncResult = await syncPlanToIcuAndMark(
              athleteId,
              result.weekOf,
              { weekOf: result.weekOf, summary: result.plan.summary, workouts: result.plan.workouts },
              riddenDates
            );
            pushed = syncResult?.pushed;
            deleted = syncResult?.deleted;
            errors = syncResult?.errors;
          }

          weekResults.push({ weekOf: result.weekOf, status: "generated", pushed, deleted, errors });
        } catch (e) {
          const isApiError = e instanceof ZwiftApiError;
          const isAiError = e instanceof AiInsightsError;
          weekResults.push({
            weekOf,
            status: "error",
            error: isApiError
              ? `Zwift API error (HTTP ${(e as ZwiftApiError).status}): ${(e as Error).message}`
              : isAiError
              ? (e as Error).message
              : e instanceof Error
              ? e.message
              : String(e),
          });
        }
      }

      results.push({ athleteId, status: "repaired", weeks: weekResults });
    } catch (e) {
      results.push({
        athleteId,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, weeks, athleteCount: athleteIds.length, results });
}
