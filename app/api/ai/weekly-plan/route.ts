import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchActivityFit, fetchOwnProfile } from "@/lib/zwift";
import { parseFitRecords } from "@/lib/fit-parser";
import { selectChartActivities, mapWithConcurrency, flagHeartRateAnomalies } from "@/lib/stats";
import { generateWeeklyPlan, AiInsightsError, RideSummary } from "@/lib/ai";

// Mirrors app/api/ai/insights/route.ts (same auth, same data-gathering
// pattern) but calls generateWeeklyPlan instead of generateInsights, and
// returns a structured weekly workout plan rather than free-text analysis.
export async function POST(_req: NextRequest) {
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

    const plan = await generateWeeklyPlan({
      firstName: profile.firstName,
      ftp: profile.ftp,
      weightKg: profile.weight ? profile.weight / 1000 : undefined,
      cyclingLevel:
        profile.achievementLevel != null ? Math.floor(profile.achievementLevel / 100) : undefined,
      runLevel:
        profile.runAchievementLevel != null ? Math.floor(profile.runAchievementLevel / 100) : undefined,
      rides,
    });

    return NextResponse.json({ ok: true, plan });
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
