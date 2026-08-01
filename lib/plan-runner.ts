/**
 * lib/plan-runner.ts
 *
 * Shared core for generating a weekly AI training plan, extracted out of
 * app/api/ai/weekly-plan/route.ts so the exact same logic can be invoked two
 * ways:
 *
 *   1. From the browser-authenticated route (cookie session) - the normal
 *      "Generate" button / profile-update flow.
 *   2. Headlessly from app/api/ai/weekly-plan/cron/route.ts (secret-header
 *      auth, no browser session) - the nightly proactive regeneration task.
 *
 * Both call paths need an already-resolved Zwift `accessToken` + `athleteId`;
 * how that token was obtained (live cookie session vs. a KV-stored refresh
 * token exchanged via refreshZwiftToken()) is the caller's concern, not this
 * module's.
 */

import { fetchActivities, fetchActivityFit, fetchOwnProfile } from "@/lib/zwift";
import { parseFitRecords } from "@/lib/fit-parser";
import { selectChartActivities, mapWithConcurrency, flagHeartRateAnomalies, computeNormalizedPower } from "@/lib/stats";
import { generateWeeklyPlan, AiInsightsError, RideSummary, WeeklyWorkout } from "@/lib/ai";
import { computeTrainingLoad, computeTrainingLoadFromIcu } from "@/lib/training-load";
import { advanceMacroCycle, getPhaseForWeekIndex, resolvePhase, mondayOfCurrentWeek, MacroCycleState } from "@/lib/periodization";
import { computeAdherence } from "@/lib/adherence";
import type { RiderTrainingProfile } from "@/lib/rider-profile";
import { getFingerprint, fingerprintToPromptSummary, recordFtpDataPoint } from "@/lib/rider-fingerprint";
import {
  registerAthlete,
  getCachedPlan,
  setCachedPlan,
  mirrorStateToKv,
  getStoredAthleteState,
  getIntervalsCredentials,
  wasIntervalsSynced,
} from "@/lib/kv-plan-state";
import { kvSet } from "@/lib/kv";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";
import { getCoachingState, saveCoachingState, buildUpdatedCoachingState } from "@/lib/coaching-state";
import { runSelectionEngine, selectionContextToPrompt } from "@/lib/workout-selection-engine";
import { fetchIcuActivities } from "@/lib/intervals";
import { getSeasonPlan, findSeasonWeek, seasonContextToPrompt } from "@/lib/season-plan";
import { buildIcuPerformanceContext } from "@/lib/icu-performance-context";

export { AiInsightsError };

/**
 * Rough FTP cross-check from recent ride power data - NOT a validated test.
 *
 * REVISED (July 2026) after an external methodology review correctly flagged
 * the previous version as unsound: it divided the average power of ANY ride
 * 20-180 min long (qualifying bar was just "> 80W", which almost every ride
 * clears, including easy Z2 spins) by a duration-based factor borrowed from
 * Coggan's naming but not his actual protocol, and used the result to
 * SILENTLY OVERRIDE the rider's own manually-entered, presumably
 * properly-tested FTP. A real FTP test requires a genuine near-maximal
 * effort (a 20-min all-out time trial, a ramp test, or a Critical-Power model
 * built from several true maximal efforts) - duration alone says nothing
 * about whether a given ride was ridden anywhere near that rider's ceiling.
 * An easy endurance ride, a drafted group ride, or a ride with coasting/
 * stoplights all produce a low average power that this formula would have
 * happily divided into a fabricated "FTP".
 *
 * Fix, in order of what changed:
 *   1. A manually-entered profile.ftp (from a real test the rider did) is now
 *      ALWAYS the authoritative value when present. This function no longer
 *      overrides it - it only fills the gap when no manual FTP exists at all,
 *      and even then the result is explicitly a rough estimate, not a
 *      replacement for the real "FTP Test Protocol" workout already in the
 *      library (20 min all-out, FTP = 0.95 x average power - see
 *      WORKOUT_LIBRARY in lib/coaching-knowledge.ts).
 *   2. The qualifying bar is now "genuinely hard for this rider" (power at or
 *      above roughly tempo effort relative to whatever FTP reference is
 *      available), not merely ">80W" - this excludes easy rides that say
 *      nothing about ceiling.
 *   3. Draft on a group ride doesn't "inflate" power the way the old comment
 *      claimed - draft lets a rider hold a given SPEED at LOWER power, so if
 *      anything a drafted ride's power data underrepresents solo capability.
 *      The old per-duration factor table conflated "long ride" with "drafted
 *      ride", which aren't the same thing; this version drops that assumption
 *      and instead only downweights rides long enough that pacing/fueling
 *      strategy (not just draft) would blunt a true maximal effort.
 *
 * Returns null whenever there isn't a reasonably confident signal - callers
 * must fall back to profile.ftp, and if that's also missing, treat this
 * rider as needing an actual FTP Test Protocol before any calibrated
 * intensity work.
 */
function estimateFtpFromRides(rides: RideSummary[], referenceFtp?: number): number | null {
  const qualifying = rides.filter(
    (r) =>
      (!r.sport || r.sport.toLowerCase().includes("cycling")) &&
      r.durationMin >= 20 &&
      r.durationMin <= 180 &&
      (r.normalizedPower ?? r.avgWatts) > 80 &&
      // A ride only tells us anything about FTP if it was actually hard.
      // Without a reference we can't judge "hard" in absolute watts, so we
      // fall back to keeping only the top half of rides by power - a crude
      // but honest way to avoid averaging in easy spins when this is the
      // rider's very first estimate.
      (referenceFtp == null || (r.normalizedPower ?? r.avgWatts) >= referenceFtp * 0.75)
  );

  if (qualifying.length < 3) return null;

  // Sort by power descending; when we have no reference at all, this keeps
  // only genuinely hard efforts instead of blending in easy rides.
  const hardest = [...qualifying]
    .sort((a, b) => (b.normalizedPower ?? b.avgWatts) - (a.normalizedPower ?? a.avgWatts))
    .slice(0, referenceFtp == null ? Math.max(3, Math.ceil(qualifying.length / 2)) : 5);

  // A single sustained ~45-60 min effort near threshold is the closest
  // approximation to a real FTP test we can pull from ordinary ride data -
  // shorter rides overestimate (anaerobic contribution), much longer rides
  // underestimate (pacing/fueling, not draft, is the reason). This mild
  // duration adjustment only nudges the estimate; it never claims precision
  // a single non-maximal ride can't actually provide.
  function durationAdjustment(durMin: number): number {
    if (durMin < 30)  return 1.05;
    if (durMin < 45)  return 1.00;
    if (durMin < 75)  return 0.97;
    if (durMin < 120) return 0.94;
    return 0.90;
  }

  const estimates = hardest.map((r) => {
    const power = r.normalizedPower ?? r.avgWatts;
    return Math.round(power / durationAdjustment(r.durationMin));
  });
  const result = Math.round(estimates.reduce((s, v) => s + v, 0) / estimates.length);

  return result < 100 ? null : result;
}

export interface RunWeeklyPlanOptions {
  accessToken: string;
  ageYears?: number;
  incomingCycle?: MacroCycleState | null;
  previousPlan?: { weekOf: string; workouts: WeeklyWorkout[] } | null;
  riderProfile?: RiderTrainingProfile;
  riderNote?: string;
  targetWeekOf?: string;
}

export interface RunWeeklyPlanResult {
  athleteId: string;
  firstName?: string;
  plan: Awaited<ReturnType<typeof generateWeeklyPlan>>;
  macroCycle: MacroCycleState;
  cycle: ReturnType<typeof getPhaseForWeekIndex>;
  weekOf: string;
  rides: RideSummary[];
}

export async function runWeeklyPlanGeneration(
  opts: RunWeeklyPlanOptions
): Promise<RunWeeklyPlanResult> {
  const profile = await fetchOwnProfile(opts.accessToken);
  const athleteId = profile.id != null ? String(profile.id) : undefined;
  if (!athleteId) {
    throw new AiInsightsError("Could not determine your Zwift rider id.");
  }

  const activities = await fetchActivities(opts.accessToken, athleteId);
  const recentActivities = selectChartActivities(activities);

  const fitResults = await mapWithConcurrency(recentActivities, 4, async (a) => {
    const buf = await fetchActivityFit(a);
    const fitRecords = parseFitRecords(buf);
    const hrVals = fitRecords
      .filter((r) => r.heartRate != null && r.heartRate > 0)
      .map((r) => r.heartRate as number);
    const avgHeartRate = hrVals.length > 0 ? hrVals.reduce((s, v) => s + v, 0) / hrVals.length : null;
    const normalizedPower = computeNormalizedPower(fitRecords);
    return { avgHeartRate, normalizedPower };
  });
  const avgHeartRates = fitResults.map((r) => (r.status === "fulfilled" ? r.value.avgHeartRate : null));
  const normalizedPowers = fitResults.map((r) => (r.status === "fulfilled" ? r.value.normalizedPower : null));

  const rides: RideSummary[] = recentActivities.map((a, i) => ({
    date: a.startDate as string,
    sport: a.sport as string | undefined,
    distanceKm: Math.round(((a.distanceInMeters ?? 0) as number) / 100) / 10,
    durationMin: Math.round(((a.movingTimeInMs ?? 0) as number) / 60000),
    avgWatts: Math.round((a.avgWatts ?? 0) as number),
    elevationM: Math.round((a.totalElevation ?? 0) as number),
    avgHeartRate: avgHeartRates[i] != null ? Math.round(avgHeartRates[i] as number) : null,
    normalizedPower: normalizedPowers[i] ?? null,
  }));

  const hrFlags = flagHeartRateAnomalies(rides);
  for (const [index, direction] of hrFlags) {
    rides[index].hrFlag = direction;
  }

  if (rides.length === 0) {
    throw new AiInsightsError("Not enough ride history yet to build a plan.");
  }

  // Manual profile.ftp - a real test result the rider entered - is now the
  // authoritative source whenever it exists. estimateFtpFromRides() only
  // fills the gap when there's no manual value at all, and even then it's a
  // rough cross-check, not a replacement for a real test. This inverts the
  // previous "computed always wins" behavior, which is the fix for the
  // external review's most serious finding: silently overriding a rider's
  // real, tested FTP with a number derived from the average power of
  // whatever rides happened to be in their recent history (including easy
  // ones) is not defensible. See estimateFtpFromRides()'s doc for the rest.
  // FTP comes exclusively from the rider's Zwift profile (set after a real
  // FTP test). Never estimate from ride history — an easy Z2 spin or a
  // drafted group ride produces a power number that says nothing about FTP.
  // If profile.ftp is null, the AI system prompt will tell the rider to run
  // the FTP Test Protocol before any intensity work is prescribed.
  const effectiveFtp = profile.ftp ?? undefined;

  // Auto-sync Zwift FTP to Intervals.icu — fire-and-forget.
  // Ensures every ZWO file pushed to ICU uses the same FTP reference as the plan.
  // Also mirror to the rider fingerprint so the mobile profile always shows
  // the Zwift value — single source of truth, no divergence possible.
  if (effectiveFtp && effectiveFtp >= 100) {
    const appUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://zwift-delta.vercel.app";
    fetch(`${appUrl}/api/intervals/update-ftp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ftp: effectiveFtp }),
    }).catch(() => {});
    // Mirror to fingerprint — ensures mobile profile reads the Zwift FTP,
    // not a stale estimate. Source = "measured" because Zwift sets ftp only
    // after a real FTP test or a manual entry by the rider.
    await recordFtpDataPoint(athleteId, effectiveFtp, "measured");
  }

  // Use ICU-computed TSS when available — covers ALL sports (running, gym, outdoor
  // rides) with proper rTSS / hrTSS, not just Zwift power rides. Falls back to
  // the Zwift FIT proxy automatically when ICU isn't connected or returns nothing.
  const icuCreds = await getIntervalsCredentials(athleteId);
  // Fetch 90 days so we reliably capture 30 training activities even for athletes
  // training 3x/week. The extra range costs nothing (ICU paginates on their side).
  const icuActivities =
    icuCreds?.icuId && icuCreds?.icuKey
      ? await fetchIcuActivities(
          icuCreds.icuKey,
          icuCreds.icuId,
          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          new Date().toISOString().slice(0, 10),
        )
      : [];
  const trainingLoad = computeTrainingLoadFromIcu(icuActivities, rides, effectiveFtp ?? profile.ftp);

  // Build weighted ICU performance context (50/30/20 recency weighting) for
  // the AI prompt. This is the concrete historical data the AI uses to calibrate
  // TSS targets, duration, and intensity — NOT just "hope the AI picks well."
  const icuPerformanceContext = buildIcuPerformanceContext(icuActivities);

  const weekOf = opts.targetWeekOf ?? mondayOfCurrentWeek();
  const macroCycle = advanceMacroCycle(opts.incomingCycle ?? null, weekOf);
  const cycle = resolvePhase(macroCycle.weekIndex, weekOf, opts.riderProfile?.eventDate ?? null);

  const lastWeekAdherence =
    opts.previousPlan && opts.previousPlan.weekOf !== weekOf
      ? computeAdherence(opts.previousPlan, rides, effectiveFtp ?? profile.ftp)
      : undefined;

  const currentPlan =
    opts.previousPlan && opts.previousPlan.weekOf === weekOf
      ? opts.previousPlan
      : undefined;

  let resolvedAge = opts.ageYears;
  if (!resolvedAge && opts.riderProfile?.ageYears) {
    resolvedAge = opts.riderProfile.ageYears;
  }
  if (!resolvedAge && profile.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth);
    const now = new Date();
    const years = now.getUTCFullYear() - dob.getUTCFullYear();
    const hadBirthday =
      now.getUTCMonth() > dob.getUTCMonth() ||
      (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
    resolvedAge = hadBirthday ? years : years - 1;
  }

  const previousWeekTitles =
    opts.previousPlan && opts.previousPlan.weekOf !== weekOf
      ? opts.previousPlan.workouts
          .filter((w) => w.type !== "Rest" && !w.type.toLowerCase().includes("rest"))
          .map((w) => w.title)
          .filter(Boolean)
      : undefined;

  const fingerprint = await getFingerprint(athleteId);
  const riderFingerprint = fingerprintToPromptSummary(fingerprint);

  // ── Coaching state + selection engine ────────────────────────────────────
  // Load persistent coaching state (null on first-ever generation or KV
  // unavailable — both are fine, engine handles null gracefully).
  const coachingState = await getCoachingState(athleteId);

  const weightKg = profile.weight ? profile.weight / 1000 : undefined;
  const cyclingLevel =
    profile.achievementLevel != null ? Math.floor(profile.achievementLevel / 100) : undefined;

  // Run the deterministic selection engine BEFORE the AI call. It analyzes
  // recent stimulus exposure, determines priority family, and produces the
  // eligible workout list. This replaces "hope the AI picks well" with a
  // code-guaranteed constraint set.
  const selectionCtx = runSelectionEngine({
    coachingState,
    riderProfile: opts.riderProfile,
    trainingLoad,
    phase: cycle.phase,
    cyclingLevel,
    ftp: effectiveFtp,
    weightKg,
    previousWeekTitles,
  });
  const selectionContextPrompt = selectionContextToPrompt(selectionCtx);

  // ── Season plan context ───────────────────────────────────────────────────
  // Load the stored season plan and find the current week within it.
  // This provides the "coaching brain" — the multi-week arc that transforms
  // isolated weekly generation into execution of a long-term plan.
  const seasonPlan = await getSeasonPlan(athleteId);
  const currentSeasonWeek = seasonPlan ? findSeasonWeek(seasonPlan, weekOf) : null;
  const previousSeasonWeek = seasonPlan && currentSeasonWeek && currentSeasonWeek.weekIndex > 1
    ? (seasonPlan.weeks[currentSeasonWeek.weekIndex - 2] ?? null)
    : null;
  const seasonContext = currentSeasonWeek && seasonPlan
    ? seasonContextToPrompt(seasonPlan, currentSeasonWeek, previousSeasonWeek)
    : null;

  const plan = await generateWeeklyPlan({
    firstName: profile.firstName,
    ftp: effectiveFtp,
    weightKg,
    cyclingLevel,
    runLevel:
      profile.runAchievementLevel != null ? Math.floor(profile.runAchievementLevel / 100) : undefined,
    ageYears: resolvedAge,
    rides,
    trainingLoad,
    cycle,
    lastWeekAdherence,
    riderProfile: opts.riderProfile,
    riderNote: opts.riderNote,
    targetWeekOf: weekOf,
    currentPlan,
    previousWeekTitles,
    riderFingerprint,
    selectionContext: selectionContextPrompt,
    seasonContext: seasonContext ?? undefined,
    icuPerformanceContext: icuPerformanceContext || undefined,
  });

  // ── Cache ICU performance context for the coach (Marco) ─────────────────
  // The chat route (Marco) doesn't call ICU on every message (too slow). Instead
  // it reads this cached summary which is rebuilt here whenever a plan is generated.
  // TTL = 7 days — rebuilt weekly with each plan generation cycle.
  if (icuPerformanceContext) {
    kvSet(`zwift:${athleteId}:icu_perf_ctx`, icuPerformanceContext, 7 * 24 * 60 * 60).catch(() => {});
  }

  // ── Save updated coaching state ───────────────────────────────────────────
  // Best-effort — never blocks the return of the plan.
  try {
    const weeklyObjective = plan.summary.slice(0, 120); // first 120 chars as objective
    const updatedState = buildUpdatedCoachingState(
      coachingState,
      athleteId,
      plan.workouts,
      cycle.phase,
      lastWeekAdherence,
      weeklyObjective,
      selectionCtx.priorityFamily,
      selectionCtx.priorityReason,
    );
    await saveCoachingState(updatedState);
  } catch {
    // never propagate coaching-state errors — the plan is already generated
  }

  return { athleteId, firstName: profile.firstName ?? undefined, plan, macroCycle, cycle, weekOf, rides };
}

/**
 * Best-effort, idempotent auto-provisioning: called on every login and every
 * Intervals.icu connect so a rider never has to press a button to get their
 * first plan or their first ICU sync. Before this existed, an athlete was
 * only added to the cron's known-athletes registry as a SIDE EFFECT of a
 * manual "Generate" click succeeding - so an athlete who connected ICU (and
 * was already getting their completed rides synced in, independent of this
 * app) but never happened to click Generate sat registered nowhere, with no
 * planned workouts ever pushed, indefinitely. Now that the manual button is
 * gone entirely, this is the only remaining path that can create a rider's
 * very first plan.
 *
 * HARD REQUIREMENT: no plan is generated at all for an athlete with no
 * Intervals.icu connection on record. This app hit the same confusion
 * repeatedly - a rider gets a plan, has no idea it can never reach Zwift
 * because they never connected ICU, and the "why isn't this working"
 * debugging always traces back to a missing icu_key. Refusing to spend an
 * AI call producing a plan that has nowhere to sync closes that class of
 * problem at the root instead of chasing each instance of it. The
 * onboarding gate in app/dashboard/layout.tsx enforces the same rule at the
 * UI level (a rider literally cannot reach Today's Note without connecting
 * first) - this is the code-level backstop for the paths that don't go
 * through that UI at all (cron, direct login/connect).
 *
 * Steps: (1) register the athlete so the nightly cron picks them up going
 * forward, (2) bail out here if ICU isn't connected yet, (3) generate a plan
 * for the current week if one doesn't already exist, (4) push it to
 * Intervals.icu if this week hasn't been confirmed synced yet (covers both
 * "just generated it" and "a plan already existed but was never synced,
 * e.g. ICU was connected afterward").
 *
 * Swallows all its own errors - this must never turn a successful login or
 * a successful ICU connect into a failure response just because plan
 * generation or sync hit a snag. The nightly cron and the next login/connect
 * both get another chance.
 */
export async function ensurePlanProvisioned(athleteId: string, accessToken: string): Promise<void> {
  try {
    await registerAthlete(athleteId);

    // No ICU connection on record - refuse to generate anything yet. See
    // this function's doc comment for why "generate now, sync later" is no
    // longer acceptable.
    if (!(await getIntervalsCredentials(athleteId))) return;

    const currentWeek = mondayOfCurrentWeek();
    let cached = await getCachedPlan(athleteId, currentWeek);

    if (!cached) {
      const state = await getStoredAthleteState(athleteId);
      const result = await runWeeklyPlanGeneration({
        accessToken,
        incomingCycle: state.macroCycle,
        previousPlan: state.previousPlan,
        riderProfile: state.riderProfile,
      });
      cached = {
        weekOf: result.weekOf,
        summary: result.plan.summary,
        workouts: result.plan.workouts,
      };
      await setCachedPlan(result.athleteId, cached);
      await mirrorStateToKv(result.athleteId, {
        riderProfile: state.riderProfile,
        macroCycle: result.macroCycle,
        plan: { weekOf: result.weekOf, workouts: result.plan.workouts },
      });

      const creds = await getIntervalsCredentials(athleteId);
      if (creds) {
        const riddenDates = new Set(
          result.rides.map((r) => (r.date ?? "").slice(0, 10)).filter(Boolean)
        );
        await syncPlanToIcuAndMark(athleteId, result.weekOf, cached, riddenDates, result.firstName);
      }
      return;
    }

    // A plan already exists for this week - the only thing left to check is
    // whether it's actually been synced (e.g. ICU was connected AFTER this
    // plan was generated, or the plan predates automatic sync existing).
    if (!(await wasIntervalsSynced(athleteId, currentWeek))) {
      const creds = await getIntervalsCredentials(athleteId);
      if (creds) {
        // riderName not available here (no fresh profile fetch) — ZWO messages
        // will still appear but without the personalized name. The nightly cron
        // path (which goes through runWeeklyPlanGeneration) always has firstName.
        await syncPlanToIcuAndMark(athleteId, currentWeek, cached, new Set());
      }
    }
  } catch {
    // best-effort
  }
}
