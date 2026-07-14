import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { WeeklyWorkout } from "@/lib/ai";
import { runWeeklyPlanGeneration, AiInsightsError } from "@/lib/plan-runner";
import { MacroCycleState, mondayOfCurrentWeek } from "@/lib/periodization";
import type { RiderTrainingProfile } from "@/lib/rider-profile";
import {
  mirrorStateToKv,
  mirrorZwiftAuthToKv,
  getCachedPlan,
  setCachedPlan,
  wasIntervalsSynced,
  updateStoredRiderProfile,
} from "@/lib/kv-plan-state";
import { kvGet } from "@/lib/kv";
import { syncPlanToIcuAndMark, type IntervalsSyncResult } from "@/lib/headless-sync";
import { fetchActivities } from "@/lib/zwift";

// mirrorStateToKv / mirrorZwiftAuthToKv now live in lib/kv-plan-state.ts so
// app/api/ai/weekly-plan/cron/route.ts can share the exact same KV
// read/write logic instead of a second, drifting copy - see that file's
// doc comment for the full explanation of what each key is for.

// Mirrors app/api/ai/insights/route.ts (same auth, same data-gathering
// pattern) but calls generateWeeklyPlan instead of generateInsights, and
// returns a structured weekly workout plan rather than free-text analysis.
//
// The actual generation pipeline lives in lib/plan-runner.ts so it can also
// run headlessly from the nightly cron endpoint - this route is now just:
// resolve the browser session -> parse the body -> call the shared runner ->
// mirror the result to KV for the cron job's benefit -> respond.

// AI plan generation takes 30-60 seconds (FIT file downloads + Claude API).
// Without this, Vercel cuts the function at the default 10s hobby-plan limit.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let ageYears: number | undefined;
  let incomingCycle: MacroCycleState | null = null;
  let previousPlan: { weekOf: string; workouts: WeeklyWorkout[] } | null = null;
  let riderProfile: RiderTrainingProfile | undefined;
  let riderNote: string | undefined;
  let targetWeekOf: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.ageYears === "number" && body.ageYears > 0) {
      ageYears = body.ageYears;
    }
    if (
      body?.macroCycle &&
      typeof body.macroCycle.weekIndex === "number" &&
      typeof body.macroCycle.lastWeekOf === "string"
    ) {
      incomingCycle = { weekIndex: body.macroCycle.weekIndex, lastWeekOf: body.macroCycle.lastWeekOf };
    }
    if (
      body?.previousPlan &&
      typeof body.previousPlan.weekOf === "string" &&
      Array.isArray(body.previousPlan.workouts)
    ) {
      previousPlan = { weekOf: body.previousPlan.weekOf, workouts: body.previousPlan.workouts };
    }
    if (body?.riderProfile && typeof body.riderProfile === "object") {
      riderProfile = body.riderProfile as RiderTrainingProfile;
    }
    if (typeof body?.riderNote === "string" && body.riderNote.trim()) {
      riderNote = body.riderNote.trim();
    }
    // Optional override so the dashboard can pre-generate *next* week's plan
    // ahead of time (rolling 6-day-ahead window) - must be a real Monday
    // ("YYYY-MM-DD"); anything else is ignored and we fall back to "now".
    if (typeof body?.targetWeekOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetWeekOf)) {
      targetWeekOf = body.targetWeekOf;
    }
  } catch {
    // No/invalid JSON body - fine, these all just stay unset.
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session invalid or expired." }, { status: 401 });
  }

  // ── KV plan cache check ────────────────────────────────────────────────────
  // If a plan for this exact week is already in KV (from a prior Generate on
  // any device, or from the nightly cron), return it immediately without
  // calling the AI. This eliminates the main cost driver: the rolling 6-day
  // "prefetch next week" that fires on every page load from every device once
  // fewer than 6 days remain in the current week. Without this cache, each
  // device independently hits the AI for the same next-week plan because
  // localStorage (where the prefetch result is stored) is device-specific.
  //
  // Bypass conditions — always regenerate when:
  //   1. riderNote is set: the rider explicitly typed a change request (surgical edit).
  //   2. No athleteId in session: can't key the cache, just generate.
  const effectiveWeekOf = targetWeekOf ?? mondayOfCurrentWeek();
  if (session.athleteId && !riderNote) {
    const cached = await getCachedPlan(session.athleteId, effectiveWeekOf);
    if (cached) {
      // A profile edit (training-profile.tsx's "zwift:profile-saved" ->
      // handleGenerate()) reaches this exact branch almost every time,
      // because editing the profile rarely invalidates the already-cached
      // plan for the current week. Without this write, the riderProfile this
      // request just carried would be silently dropped on the floor - the
      // cache-hit path used to return early with no KV write at all, so the
      // server's stored profile stayed frozen at whatever it was the last
      // time a plan was genuinely (re)generated. See updateStoredRiderProfile's
      // doc comment for the full user-visible symptom this caused.
      if (riderProfile) {
        await updateStoredRiderProfile(session.athleteId, riderProfile);
      }

      // Also return the stored macro cycle so the client can update its cycle display.
      let cachedMacroCycle: MacroCycleState | null = null;
      try {
        const macroRaw = await kvGet(`zwift:${session.athleteId}:macro_cycle`);
        cachedMacroCycle = macroRaw ? (JSON.parse(macroRaw) as MacroCycleState) : null;
      } catch { /* best-effort */ }

      // ── Self-heal: sync to ICU if this cached plan was never confirmed
      // synced ─────────────────────────────────────────────────────────────
      // No new generation happened here (that's the whole point of the
      // cache), so normally there's nothing new to push. But a plan can be
      // sitting in cache with NO successful sync behind it yet - e.g. it was
      // cached before the rider connected Intervals.icu, or before automatic
      // server-side sync existed at all. Without this check such a plan
      // would sit in cache, unsynced, forever - every future read is a cache
      // hit that (before this check) skipped sync unconditionally. Checking
      // wasIntervalsSynced keeps this cheap: once a week is confirmed
      // synced, every subsequent cache-hit read for it skips straight past
      // this block.
      let intervalsSync: IntervalsSyncResult | null = null;
      try {
        if (!(await wasIntervalsSynced(session.athleteId, effectiveWeekOf))) {
          let riddenDates = new Set<string>();
          try {
            const activities = await fetchActivities(session.accessToken, session.athleteId);
            riddenDates = new Set(
              activities.map((a) => ((a.startDate as string) ?? "").slice(0, 10)).filter(Boolean)
            );
          } catch {
            // best-effort — worst case a already-ridden day gets a redundant planned event
          }
          intervalsSync = await syncPlanToIcuAndMark(session.athleteId, effectiveWeekOf, cached, riddenDates);
        }
      } catch {
        // best-effort — a self-heal failure must never break the cached-plan response
      }

      return NextResponse.json({ ok: true, plan: cached, macroCycle: cachedMacroCycle, cycle: null, intervalsSync });
    }
  }

  try {
    const result = await runWeeklyPlanGeneration({
      accessToken: session.accessToken,
      ageYears,
      incomingCycle,
      previousPlan,
      riderProfile,
      riderNote,
      targetWeekOf,
    });

    // ── Post-generation KV writes ──────────────────────────────────────────
    // Always write to the per-week cache so subsequent requests for the same
    // week (from other devices, or the cron) get the result without re-calling
    // the AI. TTL = 14 days (auto-cleans stale entries).
    await setCachedPlan(result.athleteId, {
      weekOf: result.weekOf,
      summary: result.plan.summary,
      workouts: result.plan.workouts,
    });

    // Mirror state to KV for the cron job — but ONLY for the current week.
    // The prefetch generates next week's plan with targetWeekOf = next Monday;
    // mirroring that to last_plan would overwrite the current week's entry,
    // causing the cron's "already-current" check to false-positive on next
    // week before that week has actually started.
    const currentWeek = mondayOfCurrentWeek();
    if (result.weekOf === currentWeek) {
      await mirrorStateToKv(result.athleteId, {
        riderProfile,
        macroCycle: result.macroCycle,
        plan: { weekOf: result.weekOf, workouts: result.plan.workouts },
      });
    }
    // Keep the athlete's Zwift refresh token mirrored to KV every time we
    // see a live session - this is what lets the cron job obtain a fresh
    // access token headlessly later, without ever needing a browser here.
    await mirrorZwiftAuthToKv(result.athleteId, session.refreshToken);

    // ── Automatic Intervals.icu sync (server-side, no rider action) ────────
    // Every freshly generated plan is pushed to Intervals.icu -> Zwift/Garmin
    // right here, the moment it's generated - not as a browser-triggered
    // action after the response comes back. That used to be the client's job
    // (syncPlanToConnectedPlatforms in weekly-plan.tsx), which caused a real
    // cross-device bug: two devices opening the dashboard around the same
    // generation each ran their own push-then-cleanup pass, each blind to the
    // other's newly-created event ids, so events piled up on the calendar
    // instead of being replaced. Doing it exactly once, here, server-side,
    // means there is only ever one sync per generation regardless of how many
    // browsers/devices are open. See syncPlanToIcuAndMark's doc comment for
    // why this includes a wide dedup sweep, not just this week's own range -
    // best-effort: a sync failure here must never break the interactive
    // response, and the nightly cron reconciles ICU state again regardless.
    let intervalsSync: IntervalsSyncResult | null = null;
    try {
      const riddenDates = new Set(
        result.rides.map