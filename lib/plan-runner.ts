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

export { AiInsightsError };

/**
 * Coggan Power-Duration FTP Estimation â applied to last 30 CYCLING rides.
 *
 * METHODOLOGY (Coggan, 2003):
 * Every ride duration has an anaerobic contribution that inflates avgWatts
 * above true FTP. We divide by a duration-specific factor to remove that
 * contribution and recover the underlying FTP estimate.
 *
 *   < 20 min â Ã· 1.10  (high anaerobic contribution)
 *   < 30 min â Ã· 1.05
 *   < 45 min â Ã· 1.00  (â FTP effort zone)
 *   < 60 min â Ã· 0.97
 *   < 75 min â Ã· 0.95
 *   < 90 min â Ã· 0.93
 *   < 120 min â Ã· 0.91
 *   â¥ 120 min â Ã· 0.88 (group ride / draft â discounted)
 *
 * Uses Normalized Power (NP) over avgWatts when available â NP is the
 * physiologically correct measure of sustained effort for variable-pace rides.
 *
 * Result: weighted average of TOP 5 estimates. Group rides (â¥120 min) are
 * weighted at 0.5Ã to reduce draft-inflated outliers.
 *
 * HARD RULES:
 * - Requires â¥ 3 qualifying rides (20-180 min, CYCLING, power > 80W)
 * - Result < 100W â suspect data â returns null (falls back to profile.ftp)
 * - This function's result ALWAYS overrides manual profile.ftp when â¥ 100W
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
  // Manual profile.ftp is a stale fallback only â never the primary source.
  // See estimateFtpFromRides() doc for the full methodology.
  const estimatedFtp = estimateFtpFromRides(rides);
  const effectiveFtp = estimatedFtp ?? profile.ftp ?? undefined;

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
