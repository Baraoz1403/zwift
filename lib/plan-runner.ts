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
 * Estimates current FTP from recent rides using power-duration scaling.
 * Prefers each ride's Normalized Power over plain avgWatts when available
 * (lib/stats.ts computeNormalizedPower) - FTP is by definition an estimate
 * of sustainable *effort*, and NP is the physiologically correct measure of
 * that for anything but a dead-steady ride (a 45-min ride with a few surges
 * has a true sustainable-effort level closer to its NP than its avgWatts,
 * which surges pull down relative to the steady portions). This directly
 * improves the accuracy of effectiveFtp, which every power target in the
 * generated plan is a percentage of - a meaningfully high-leverage fix.
 */
function estimateFtpFromRides(rides: RideSummary[]): number | null {
  const qualifying = rides.filter(
    (r) =>
      (!r.sport || r.sport.toLowerCase().includes("cycling")) &&
      (r.normalizedPower ?? r.avgWatts) > 60 &&
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
    return Math.round((r.normalizedPower ?? r.avgWatts) * factor);
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
  /** The rides fetched/used for this generation - exposed so a headless
   *  caller (the cron endpoint) can tell which days this week already have
   *  a real completed ride, the same "don't push a planned workout over an
   *  already-ridden day" check the browser does via weekActivities. */
  rides: RideSummary[];
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

  // One FIT fetch per ride already happens here for heart rate - reuse the
  // exact same parsed records to also compute Normalized Power, instead of
  // fetching/parsing the same file twice. See computeNormalizedPower's doc
  // comment in lib/stats.ts for why this materially improves training-load
  // accuracy over the old plain-avgWatts proxy.
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

  const estimatedFtp = estimateFtpFromRides(rides);
  // FTP computed from actual rides always wins over the manually-entered value.
  // The manual entry is often stale, outdated, or wrong (e.g. 276W entered years
  // ago while actual performance is 200W) — which directly causes workouts to be
  // built at impossible wattages (150% of 276W = 414W instead of 150% of 200W = 300W).
  // Only fall back to the manual profile.ftp when there is not enough ride data
  // to estimate (fewer than 3 qualifying rides of 30-100 min duration).
  const effectiveFtp = estimatedFtp ?? profile.ftp ?? undefined;

  const trainingLoad = computeTrainingLoad(rides, effectiveFtp ?? profile.ftp);

  const weekOf = opts.targetWeekOf ?? mondayOfCurrentWeek();
  const macroCycle = advanceMacroCycle(opts.incomingCycle ?? null, weekOf);
  // resolvePhase overrides the normal Base/Build/Recovery rotation with a
  // real Taper/RaceWeek phase when the rider's stated event date is close -
  // see the doc comment on resolvePhase for why this replaced the old
  // prompt-only "if eventDate is within 4 weeks..." handling.
  const cycle = resolvePhase(macroCycle.weekIndex, weekOf, opts.riderProfile?.eventDate ?? null);

  const lastWeekAdherence =
    opts.previousPlan && opts.previousPlan.weekOf !== weekOf
      ? computeAdherence(opts.previousPlan, rides, effectiveFtp ?? profile.ftp)
      : undefined;

  // When the rider is editing the CURRENT week's plan (previousPlan.weekOf === weekOf),
  // pass it as currentPlan so the AI does a surgical edit rather than a full regenerate.
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

  // Extract last week's workout titles for variety enforcement â only non-rest
  // days, and only when previousPlan covers a DIFFERENT week from this one
  // (same-week previousPlan is for surgical edits, not variety tracking).
  const previousWeekTitles =
    opts.previousPlan && opts.previousPlan.weekOf !== weekOf
      ? opts.previousPlan.workouts
          .filter((w) => w.type !== "Rest" && !w.type.toLowerCase().includes("rest"))
          .map((w) => w.title)
          .filter(Boolean)
      : undefined;

  // Load the rider's accumulated fingerprint (best-effort â null = no data yet or KV down)
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
