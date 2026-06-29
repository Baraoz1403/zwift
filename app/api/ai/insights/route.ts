import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchActivityFit, fetchOwnProfile } from "@/lib/zwift";
import { parseFitRecords } from "@/lib/fit-parser";
import { selectChartActivities, mapWithConcurrency } from "@/lib/stats";
import { generateInsights, AiInsightsError, RideSummary } from "@/lib/ai";

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

    // Same last-20-rides selection the dashboard charts use, so the AI's
    // ride window matches what's already visible on screen.
    const recentActivities = selectChartActivities(activities);

    // Heart rate isn't on the activity list itself - it only exists inside
    // each ride's FIT file, so it has to be downloaded and parsed per ride,
    // same as the dashboard's "Highest avg heart rate" record card and the
    // combined trend chart. Bounded concurrency for the same reason noted in
    // lib/stats.ts (mapWithConcurrency): avoids firing ~20 large downloads
    // at once.
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

    if (rides.length === 0) {
      return NextResponse.json({ ok: false, error: "Not enough ride history yet for insights." });
    }

    const insight = await generateInsights({
      firstName: profile.firstName,
      ftp: profile.ftp,
      weightKg: profile.weight ? profile.weight / 1000 : undefined,
      cyclingLevel:
        profile.achievementLevel != null ? Math.floor(profile.achievementLevel / 100) : undefined,
      runLevel:
        profile.runAchievementLevel != null ? Math.floor(profile.runAchievementLevel / 100) : undefined,
      rides,
    });

    return NextResponse.json({ ok: true, insight });
  } catch (e) {
    if (e instanceof AiInsightsError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "Unexpected error generating insights." }, { status: 500 });
  }
}
