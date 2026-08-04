import { NextRequest, NextResponse } from "next/server";
import { refreshZwiftToken, ZwiftApiError } from "@/lib/zwift";
import { runWeeklyPlanGeneration, AiInsightsError } from "@/lib/plan-runner";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { ensureWorkoutDates, normalizeToSix } from "@/lib/plan-shape";
import { syncPlanToIntervalsHeadless, cleanupIcuDuplicates, wideCleanupRange } from "@/lib/headless-sync";
import { kvSet } from "@/lib/kv";
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
 * Headless plan-continuation job. The dashboard has NO manual "Generate new
 * plan" button - a rider's only interaction with plan content is Today's
 * Note. This endpoint is therefore the sole scheduled source of a rider's
 * plan for a week they never explicitly requested via a note: without it,
 * a rider who never types a note would never get a plan for a new week at
 * all.
 *
 * Intended trigger: Vercel Cron (see vercel.json), scheduled for Sundays at
 * 17:00 UTC = 20:00 Israel Daylight Time (UTC+3, roughly late March-late
 * October). During Israel Standard Time (UTC+2, the rest of the year) this
 * lands at 19:00 local instead of 20:00 - Vercel Cron schedules run in fixed
 * UTC and can't shift for a target timezone's DST, so this is a deliberate,
 * documented ~1-hour seasonal drift rather than a bug. The day (Sunday) is
 * unaffected either way since Israel is always ahead of UTC.
 *
 * Auth is a shared secret, not a browser session - there is no rider sitting
 * at a keyboard for this request. Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` for cron jobs defined in vercel.json
 * once the CRON_SECRET env var is set in the Vercel project (Project ->
 * Settings -> Environment Variables) - that's the one manual setup step
 * this needs; nothing here can set that env var itself.
 *
 * Per-athlete flow, all of it best-effort/isolated (one athlete's failure
 * never stops the run for anyone else - see the try/catch per iteration and
 * the `results` array logging a status for every single athlete):
 *   1. Read the athlete's Zwift refresh token from KV, exchange it for a
 *      fresh access token (and re-mirror whatever token Zwift returns -
 *      it may rotate the refresh token on every use).
 *   2. Compute the COMING week's Monday (tomorrow, since this always runs
 *      on a Sunday) - NOT mondayOfCurrentWeek(), which on a Sunday returns
 *      the week that's ENDING. Running this proactively the night before a
 *      new week starts, for the coming week specifically, is the whole
 *      point of the Sunday-night schedule; using "today's" week here would
 *      silently regenerate the week that's already almost over instead.
 *   3. If a plan for that coming week already exists in KV (e.g. the rider
 *      already used Today's Note this week, or a prior cron run already
 *      succeeded), skip regeneration but still run a dedup pass on ICU to
 *      clean up any duplicate events that may have accumulated - read-then-
 *      selective-delete, never pushes new events, safe to call redundantly.
 *   4. Otherwise, run the exact same generation pipeline the interactive
 *      route/Today's Note flow uses (lib/plan-runner.ts), mirror the result
 *      back to KV, then push it to Intervals.icu using the athlete's stored
 *      API key - the same push-then-delete, full-week-range dedup algorithm
 *      every sync path uses (lib/headless-sync.ts - see its doc comment).
 *
 * Every athlete in the zwift:athletes registry (see lib/kv-plan-state.ts's
 * getKnownAthletes) is processed - there is no single-athlete special case
 * anywhere in this file. New athletes are added to that registry by
 * ensurePlanProvisioned (lib/plan-runner.ts), which runs on every login,
 * every Intervals.icu connect, and every dashboard load - so an athlete
 * reaches this cron's registry long before their first Sunday run, without
 * needing to click anything.
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

  // WeekOf target: on Sunday, plan the upcoming week (starts tomorrow Monday).
  // On Mon–Sat, ensure the CURRENT week has a plan (retry safety net).
  // This cron now runs daily so a Sunday failure is caught the next day.
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  let weekOf: string;
  if (dow === 0) {
    // Sunday: target next Monday (tomorrow)
    const nextMon = new Date(now);
    nextMon.setUTCDate(now.getUTCDate() + 1);
    weekOf = nextMon.toISOString().slice(0, 10);
  } else {
    // Mon–Sat: target this week's Monday
    weekOf = mondayOfCurrentWeek();
  }

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
        // Mark icu_invalid when all pushes fail with 401/403 — expired token.
        // Without this the athlete never sees a reconnect prompt.
        const pushErrs = syncResult.errors.filter(e => e.startsWith("push"));
        const authFails = pushErrs.filter(e => e.includes("403") || e.includes("401")).length;
        if (pushed === 0 && pushErrs.length > 0 && authFails === pushErrs.length) {
          await kvSet(`zwift:${athleteId}:icu_invalid`, "1", 24 * 60 * 60).catch(() => {});
        }
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
