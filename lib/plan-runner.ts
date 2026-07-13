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
import { computeTrainingLoad } from "@/lib/training-load";
import { advanceMacroCycle, getPhaseForWeekIndex, resolvePhase, mondayOfCurrentWeek, MacroCycleState } from "@/lib/periodization";
import { computeAdherence } from "@/lib/adherence";
import type { RiderTrainingProfile } from "@/lib/rider-profile";
import { getFingerprint, fingerprintToPromptSummary } from "@/lib/rider-fingerprint";
import {
  registerAthlete,
  getCachedPlan,
  setCachedPlan,
  mirrorStateToKv,
  getStoredAthleteState,
  getIntervalsCredentials,
  wasIntervalsSynced,
} from "@/lib/kv-plan-state";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";

export { AiInsightsError };

/**
 * Coggan Power-Duration FTP Estimation Ã¢ÂÂ applied to last 30 CYCLING rides.
 *
 * METHODOLOGY (Coggan, 2003):
 * Every ride duration has an anaerobic contribution that inflates avgWatts
 * above true FTP. We divide by a duration-specific factor to remove that
 * contribution and recover the underlying FTP estimate.
 *
 *   < 20 min Ã¢ÂÂ ÃÂ· 1.10  (high anaerobic contribution)
 *   < 30 min Ã¢ÂÂ ÃÂ· 1.05
 *   < 45 min Ã¢ÂÂ ÃÂ· 1.00  (Ã¢ÂÂ FTP effort zone)
 *   < 60 min Ã¢ÂÂ ÃÂ· 0.97
 *   < 75 min Ã¢ÂÂ ÃÂ· 0.95
 *   < 90 min Ã¢ÂÂ ÃÂ· 0.93
 *   < 120 min Ã¢ÂÂ ÃÂ· 0.91
 *   Ã¢ÂÂ¥ 120 min Ã¢ÂÂ ÃÂ· 0.88 (group ride / draft Ã¢ÂÂ discounted)
 *
 * Uses Normalized Power (NP) over avgWatts when available Ã¢ÂÂ NP is the
 * physiologically correct measure of sustained effort for variable-pace rides.
 *
 * Result: weighted average of TOP 5 estimates. Group rides (Ã¢ÂÂ¥120 min) are
 * weighted at 0.5ÃÂ to reduce draft-inflated outliers.
 *
 * HARD RULES:
 * - Requires Ã¢ÂÂ¥ 3 qualifying rides (20-180 min, CYCLING, power > 80W)
 * - Result < 100W Ã¢ÂÂ suspect data Ã¢ÂÂ returns null (falls back to profile.ftp)
 * - This function's result ALWAYS overrides manual profile.ftp when Ã¢ÂÂ¥ 100W
 */
function estimateFtpFromRides(rides: RideSummary[]): number | null {
  function cogganFactor(durMin: number): number {
    if (durMin < 20)  return 1.10;
    if (durMin < 30)  return 1.05;
    if (durMin < 45)  return 1.00;
    if (durMin < 60)  return 0.97;
    if (durMin < 75)  return 0.95;
    if (durMin < 90)  return 0.93;
    if (durMin < 120) return 0.91;
    return 0.88;
  }

  const qualifying = rides.filter(
    (r) =>
      (!r.sport || r.sport.toLowerCase().includes("cycling")) &&
      (r.normalizedPower ?? r.avgWatts) > 80 &&
      r.durationMin >= 20 &&
      r.durationMin <= 180
  );

  if (qualifying.length < 3) return null;

  const estimates = qualifying.map((r) => {
    const power = r.normalizedPower ?? r.avgWatts;
    const estimate = Math.round(power / cogganFactor(r.durationMin));
    const weight = r.durationMin >= 120 ? 0.5 : 1.0;
    return { estimate, weight };
  });

  // Weighted average of top 5 estimates by value
  const top5 = estimates
    .sort((a, b) => b.estimate - a.estimate)
    .slice(0, 5);

  const totalWeight = top5.reduce((s, e) => s + e.weight, 0);
  const weightedSum = top5.reduce((s, e) => s + e.estimate * e.weight, 0);
  const result = Math.round(weightedSum / totalWeight);

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

  // Coggan Protocol: computed FTP from last 30 rides ALWAYS overrides manual entry.
  // Manual profile.ftp is a stale fallback only Ã¢ÂÂ never the primary source.
  // See estimateFtpFromRides() doc for the full methodology.
  const estimatedFtp = estimateFtpFromRides(rides);
  const effectiveFtp = estimatedFtp ?? profile.ftp ?? undefined;

  // Auto-sync computed FTP to Intervals.icu — fire-and-forget.
  // Ensures every ZWO file pushed to Intervals uses the same FTP as the plan.
  // Never blocks plan generation; a failure here is non-critical.
  if (effectiveFtp && effectiveFtp >= 100) {
    const appUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://zwift-delta.vercel.app";
    fetch(`${appUrl}/api/intervals/update-ftp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ftp: effectiveFtp }),
    }).catch(() => {});
  }

  const trainingLoad = computeTrainingLoad(rides, effectiveFtp ?? profile.ftp);

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

  const plan = await generateWeeklyPlan({
    firstName: profile.firstName,
    ftp: effectiveFtp,
    weightKg: profile.weight ? profile.weight / 1000 : undefined,
    cyclingLevel:
      profile.achievementLevel != null ? Math.floor(profile.achievementLevel / 100) : undefined,
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
  });

  return { athleteId, plan, macroCycle, cycle, weekOf, rides };
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
        await syncPlanToIcuAndMark(athleteId, result.weekOf, cached, riddenDates);
      }
      return;
    }

    // A plan already exists for this week - the only thing left to check is
    // whether it's actually been synced (e.g. ICU was connected AFTER this
    // plan was generated, or the plan predates automatic sync existing).
    if (!(await wasIntervalsSynced(athleteId, currentWeek))) {
      const creds = await getIntervalsCredentials(athleteId);
      if (creds) {
        await syncPlanToIcuAndMark(athleteId, currentWeek, cached, new Set());
      }
    }
  } catch {
    // best-effort
  }
}
