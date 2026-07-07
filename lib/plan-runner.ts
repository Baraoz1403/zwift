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
import { selectChartActivities, mapWithConcurrency, flagHeartRateAnomalies } from "@/lib/stats";
import { generateWeeklyPlan, AiInsightsError, RideSummary, WeeklyWorkout } from "@/lib/ai";
import { computeTrainingLoad } from "@/lib/training-load";
import { advanceMacroCycle, getPhaseForWeekIndex, mondayOfCurrentWeek, MacroCycleState } from "@/lib/periodization";
import { computeAdherence } from "@/lib/adherence";
import type { RiderTrainingProfile } from "@/lib/rider-profile";

export { AiInsightsError };

/**
 * Estimates current FTP from recent rides using average-power duration scaling.
 * (Moved verbatim from the old inline copy in app/api/ai/weekly-plan/route.ts —
 * see that file's git history for the original reasoning comment.)
 */
function estimateFtpFromRides(rides: RideSummary[]): number | null {
  const qualifying = rides.filter(
    (r) =>
      (!r.sport || r.sport.toLowerCase().includes("cycling")) &&
      r.avgWatts > 60 &&
      r.durationMin >= 30 &&
      r.durationMin <= 100
  );
  if (qualifying.length < 3) return null;

  const estimates = qualifying.map((r) => {
    const dur = r.durationMin;
    const factor =
      dur < 40 ? 0.90
      : dur < 55 ? 0.95
      : dur < 75 ? 1.00
      : 1.05;
    return Math.round(r.avgWatts * factor);
  });

  return Math.max(...estimates);
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
}

/**
 * Runs the full plan-generation pipeline: fetch profile + recent rides from
 * Zwift, estimate FTP, compute training load / adherence / periodization,
 * then call generateWeeklyPlan(). Throws AiInsightsError for
 * expected/user-facing failures (e.g. "not enough ride history"), or a plain
 * Error for anything unexpected - callers decide how to map that to a response.
 */
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

  const hrResults = await mapWithConcurrency(recentActivities, 4, async (a) => {
    const buf = await fetchActivityFit(a);
    const fitRecords = parseFitRecords(buf);
    const hrVals = fitRecords
      .filter((r) => r.heartRate != null && r.heartRate > 0)
      .map((r) => r.heartRate as number);
    return hrVals.length > 0 ? hrVals.reduce((s, v) => s + v, 0) / hrVals.length : null;
  });
  const avgHeartRates = hrResults.map((r) => (r.status === "fulfilled" ? r.value : null));

  const rides: RideSummary[] = recentActivities.map((a, i) => ({
    date: a.startDate as string,
    sport: a.sport as string | undefined,
    distanceKm: Math.round(((a.distanceInMeters ?? 0) as number) / 100) / 10,
    durationMin: Math.round(((a.movingTimeInMs ?? 0) as number) / 60000),
    avgWatts: Math.round((a.avgWatts ?? 0) as number),
    elevationM: Math.round((a.totalElevation ?? 0) as number),
    avgHeartRate: avgHeartRates[i] != null ? Math.round(avgHeartRates[i] as number) : null,
  }));

  const hrFlags = flagHeartRateAnomalies(rides);
  for (const [index, direction] of hrFlags) {
    rides[index].hrFlag = direction;
  }

  if (rides.length === 0) {
    throw new AiInsightsError("Not enough ride history yet to build a plan.");
  }

  const estimatedFtp = estimateFtpFromRides(rides);
  const effectiveFtp =
    estimatedFtp && profile.ftp && estimatedFtp < profile.ftp - 10
      ? estimatedFtp
      : (profile.ftp ?? estimatedFtp ?? undefined);

  const trainingLoad = computeTrainingLoad(rides, effectiveFtp ?? profile.ftp);

  const weekOf = opts.targetWeekOf ?? mondayOfCurrentWeek();
  const macroCycle = advanceMacroCycle(opts.incomingCycle ?? null, weekOf);
  const cycle = getPhaseForWeekIndex(macroCycle.weekIndex);

  const lastWeekAdherence =
    opts.previousPlan && opts.previousPlan.weekOf !== weekOf
      ? computeAdherence(opts.previousPlan, rides, effectiveFtp ?? profile.ftp)
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
  });

  return { athleteId, plan, macroCycle, cycle, weekOf };
}
