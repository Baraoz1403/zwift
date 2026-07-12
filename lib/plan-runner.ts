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
 * Both call paths need an already-resolved Zwift accessToken + athleteId;
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
 * Coggan Power-Duration FTP Estimation from last 30 CYCLING rides.
 *
 * METHODOLOGY:
 * Every ride has anaerobic contribution that inflates power above true FTP.
 * We divide by a duration-specific Coggan factor to recover FTP estimate.
 *
 * Coggan factors (power / factor = FTP estimate):
 *   < 20 min  -> 1.10  (high anaerobic)
 *   < 30 min  -> 1.05
 *   < 45 min  -> 1.00  (near FTP effort)
 *   < 60 min  -> 0.97
 *   < 75 min  -> 0.95
 *   < 90 min  -> 0.93
 *   < 120 min -> 0.91
 *   >= 120 min -> 0.88 (group ride / draft discounted at 0.5x weight)
 *
 * Uses Normalized Power (NP) over avgWatts when available.
 * Result: weighted average of TOP 5 estimates (not Math.max - avoids outliers).
 * Group rides (>=120 min) weighted 0.5x.
 *
 * HARD RULES:
 * - Requires >= 3 qualifying CYCLING rides (20-180 min, power > 80W)
 * - Result < 100W -> suspect data -> returns null
 * - This result ALWAYS overrides manual profile.ftp when non-null
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

  // Coggan Protocol: computed FTP from rides ALWAYS overrides manual profile.ftp.
  // Manual entry is stale fallback only - never the primary source.
  // Previous bug: 30-100 min filter caused null return for 60-75 min rides,
  // falling back to profile.ftp=276W -> impossible workout targets (414W).
  // Fixed: 20-180 min range covers all typical rides including 1-hour sessions.
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