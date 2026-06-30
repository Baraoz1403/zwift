import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchActivityFit, fetchOwnProfile } from "@/lib/zwift";
import { parseFitRecords } from "@/lib/fit-parser";
import { selectChartActivities, mapWithConcurrency, flagHeartRateAnomalies } from "@/lib/stats";
import { generateWeeklyPlan, AiInsightsError, RideSummary, WeeklyWorkout } from "@/lib/ai";
import { computeTrainingLoad } from "@/lib/training-load";
import { advanceMacroCycle, getPhaseForWeekIndex, mondayOfCurrentWeek, MacroCycleState } from "@/lib/periodization";
import { computeAdherence } from "@/lib/adherence";

// Mirrors app/api/ai/insights/route.ts (same auth, same data-gathering
// pattern) but calls generateWeeklyPlan instead of generateInsights, and
// returns a structured weekly workout plan rather than free-text analysis.
export async function POST(req: NextRequest) {
  // ageYears is optional and never required - Zwift's API doesn't expose a
  // birthdate, so this only arrives if the rider chose to type it in on the
  // weekly-plan card (see app/dashboard/weekly-plan.tsx). macroCycle is the
  // rider's own browser-stored periodization pointer (lib/periodization.ts)
  // - absent on this rider's very first plan ever, in which case the cycle
  // starts fresh at week 0 ("Base").
  // previousPlan is the rider's own last cached plan (lib/adherence.ts
  // compares it against what they actually rode) - the dashboard only sends
  // it when it's genuinely from an earlier week, not when re-rolling the
  // current week's plan.
  let ageYears: number | undefined;
  let incomingCycle: MacroCycleState | null = null;
  let previousPlan: { weekOf: string; workouts: WeeklyWorkout[] } | null = null;
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

  try {
    const profile = await fetchOwnProfile(session.accessToken);
    const athleteId = session.athleteId ?? (profile.id != null ? String(profile.id) : undefined);
    if (!athleteId) {
      return NextResponse.json(
        { ok: false, error: "Could not determine your Zwift rider id." },
        { status: 200 }
      );
    }

    const activities = await fetchActivities(session.accessToken, athleteId);
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
      return NextResponse.json({ ok: false, error: "Not enough ride history yet to build a plan." });
    }

    const trainingLoad = computeTrainingLoad(rides, profile.ftp);

    // weekOf must match exactly what generateWeeklyPlan computes internally
    // (same shared helper) so "is this a genuinely new week" is judged
    // consistently rather than against a separately-computed date.
    const weekOf = mondayOfCurrentWeek();
    const macroCycle = advanceMacroCycle(incomingCycle, weekOf);
    const cycle = getPhaseForWeekIndex(macroCycle.weekIndex);

    // Only compare against a genuinely earlier week - never against the
    // plan currently being regenerated for this same week.
    const lastWeekAdherence =
      previousPlan && previousPlan.weekOf !== weekOf
        ? computeAdherence(previousPlan, rides, profile.ftp)
        : undefined;

    const plan = await generateWeeklyPlan({
      firstName: profile.firstName,
      ftp: profile.ftp,
      weightKg: profile.weight ? profile.weight / 1000 : undefined,
      cyclingLevel:
        profile.achievementLevel != null ? Math.floor(profile.achievementLevel / 100) : undefined,
      runLevel:
        profile.runAchievementLevel != null ? Math.floor(profile.runAchievementLevel / 100) : undefined,
      ageYears,
      rides,
      trainingLoad,
      cycle,
      lastWeekAdherence,
    });

    return NextResponse.json({ ok: true, plan, macroCycle, cycle });
  } catch (e) {
    if (e instanceof AiInsightsError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
    }
    return NextResponse.json(
      { ok: false, error: "Unexpected error generating the weekly plan." },
      { status: 500 }
    );
  }
}
