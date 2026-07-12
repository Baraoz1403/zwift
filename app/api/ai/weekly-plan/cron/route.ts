import { NextRequest, NextResponse } from "next/server";
import { refreshZwiftToken, ZwiftApiError } from "@/lib/zwift";
import { runWeeklyPlanGeneration, AiInsightsError } from "@/lib/plan-runner";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { ensureWorkoutDates, normalizeToSix } from "@/lib/plan-shape";
import { syncPlanToIntervalsHeadless, cleanupIcuDuplicates, wideCleanupRange } from "@/lib/headless-sync";
import {
  getKnownAthletes,
  getStoredZwiftRefreshToken,
  getStoredAthleteState,
  mirrorZwiftAuthToKv,
  mirrorStateToKv,
  setCachedPlan,
} from "@/lib/kv-plan-state";

/**
 * GET /api/ai/weekly-plan/cron
 *
 * Headless plan-continuation job - the whole point of this endpoint is that
 * a rider's weekly plan keeps generating and pushing to Intervals.icu/Zwift
 * even if they never open the dashboard that week. Before this existed, the
 * app's entire plan pipeline only ever ran as a side effect of someone
 * sitting at the dashboard and clicking "Generate" - so a rider who skipped
 * a week of checking in got a stale plan (or no plan at all) for however
 * long they stayed away.
 *
 * Intended trigger: Vercel Cron (see vercel.json - runs once daily). Auth
 * is a shared secret, not a browser session - there is no rider sitting at
 * a keyboard for this request. Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` for cron jobs defined in vercel.json
 * once the CRON_SECRET env var is set in the Vercel project (Project ->
 * Settings -> Environment Variables) - that's the one manual setup step
 * this needs; nothing here can set that env var itself.
 *
 * Per-athlete flow, all of it best-effort/isolated (one athlete's failure
 * never stops the run for anyone else):
 *   1. Read the athlete's Zwift refresh token from KV, exchange it for a
 *      fresh access token (and re-mirror whatever token Zwift returns -
 *      it may rotate the refresh token on every use).
 *   2. If a plan for the CURRENT week already exists in KV, there's nothing
 *      to do - this cron run's job is to notice a new week has started, not
 *      to needlessly regenerate an unchanged plan every day.
 *   3. Otherwise, run the exact same generation pipeline the interactive
 *      "Generate" button uses (lib/plan-runner.ts), mirror the result back
 *      to KV, then push it to Intervals.icu using the athlete's stored API
 *      key - the same push-then-delete, full-week-range dedup algorithm the
 *      interactive route uses (lib/headless-sync.ts - see its doc comment),
 *      so a plan that arrived via cron behaves identically to one generated
 *      by hand.
 *
 * TrainingPeaks is intentionally NOT auto-synced here (or anywhere
 * automatic): syncing both TP and Intervals.icu double-pushed every
 * AI-planned indoor session onto Zwift's own workout list, since both
 * platforms relay structured workouts onward to Zwift independently. TP
 * stays reserved for outdoor rides synced in from Garmin; every AI-planned
 * indoor session goes to Intervals.icu only, which already relays cleanly to
 * Zwift and (via the rider's own Intervals.icu -> Garmin sync) to Garmin too.
 */

// Generating a plan involves several sequential network calls (Zwift API,
// FIT file downloads, the AI call itself) per athlete - the default
// serverless timeout can be too short once more than a couple of athletes
// are registered. 60s covers Vercel's Hobby-plan ceiling; raise this if the
// project moves to Pro and this job ever needs more.
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

interface AthleteRunResult {
  athleteId: string;
  status: "generated" | "already-current" | "skipped-no-refresh-token" | "error";
  weekOf?: string;
  pushed?: number;
  deleted?: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const athleteIds = await getKnownAthletes();
  const weekOf = mondayOfCurrentWeek();
  const results: AthleteRunResult[] = [];

  for (const athleteId of athleteIds) {
    try {
      const storedRefreshToken = await getStoredZwiftRefreshToken(athleteId);
      if (!storedRefreshToken) {
        results.push({ athleteId, status: "skipped-no-refresh-token" });
        continue;
      }

      // Always refresh the Zwift token on every cron run — even mid-week
      // when this athlete already has a current plan. Without this, the
      // "already-current" early-exit skips the refresh, and by Sunday night
      // when a new plan is actually needed the token may have expired.
      // The token refresh is cheap (one HTTP call) and keeps the token chain
      // alive regardless of whether a plan is generated this run.
      const refreshed = await refreshZwiftToken(storedRefreshToken);
      await mirrorZwiftAuthToKv(athleteId, refreshed.refreshToken);

      const state = await getStoredAthleteState(athleteId);

      // Already have this week's plan — no need to regenerate, but run a
      // dedup pass on ICU to clean up any duplicate events that may have
      // accumulated from a previous cross-device race condition. This is a
      // read-then-selective-delete: it never pushes new events, so it's safe
      // to call mid-week without knowing which days the athlete has ridden.
      if (state.previousPlan?.weekOf === weekOf) {
        let icuCleaned: number | undefined;
        if (state.icuKey) {
          try {
            const { oldest, newest } = wideCleanupRange();
            const cleanResult = await cleanupIcuDuplicates(
              state.icuKey,
              state.icuId ?? undefined,
              oldest,
              newest
            );
            icuCleaned = cleanResult.deleted;
          } catch {
            // best-effort — don't fail the whole cron run for a cleanup hiccup
          }
        }
        results.push({ athleteId, status: "already-current", weekOf, deleted: icuCleaned });
        continue;
      }

      const result = await runWeeklyPlanGeneration({
        accessToken: refreshed.accessToken,
        incomingCycle: state.macroCycle,
        previousPlan: state.previousPlan,
        riderProfile: state.riderProfile,
        targetWeekOf: weekOf,
      });

      await mirrorStateToKv(athleteId, {
        riderProfile: state.riderProfile,
        macroCycle: result.macroCycle,
        plan: { weekOf: result.weekOf, workouts: result.plan.workouts },
      });
      // Populate the per-week cache so interactive requests from the browser
      // (including next-week prefetch from another device) get this result
      // without re-calling the AI.
      await setCachedPlan(athleteId, {
        weekOf: result.weekOf,
        summary: result.plan.summary,
        workouts: result.plan.workouts,
      });

      let pushed: number | undefined;
      let deleted: number | undefined;
      if (state.icuKey) {
        const normalizedPlan = ensureWorkoutDates(
          normalizeToSix({ weekOf: result.weekOf, summary: result.plan.summary, workouts: result.plan.workouts })
        );
        const riddenDates = new Set(
          result.rides.map((r) => (r.date ?? "").slice(0, 10)).filter(Boolean)
        );
        const syncResult = await syncPlanToIntervalsHeadless(
          state.icuKey,
          state.icuId ?? undefined,
          normalizedPlan,
          riddenDates
        );
        pushed = syncResult.pushed;
        deleted = syncResult.deleted;
        // Also sweep the wider window - the narrow sync above only cleans
        // THIS plan's own week; orphaned events from other weeks (a stale
        // "next week" prefetch, or leftovers from before sync worked) need
        // the same wide pass the "already-current" branch above runs.
        try {
          const { oldest, newest } = wideCleanupRange();
          const wideResult = await cleanupIcuDuplicates(state.icuKey, state.icuId ?? undefined, oldest, newest);
          deleted += wideResult.deleted;
        } catch {
          // best-effort
        }
      }

      results.push({ athleteId, status: "generated", weekOf: result.weekOf, pushed, deleted });
    } catch (e) {
      const isApiError = e instanceof ZwiftApiError;
      const isAiError = e instanceof AiInsightsError;
      results.push({
        athleteId,
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

  return NextResponse.json({ ok: true, weekOf, athleteCount: athleteIds.length, results });
}
