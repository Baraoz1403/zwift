import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";

export interface FitnessPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss: number;
  status: "overreaching" | "productive" | "fresh" | "detraining";
}

export interface FitnessTrendsResponse {
  ok: boolean;
  points?: FitnessPoint[];
  current?: FitnessPoint;
  error?: string;
}

const ATL_DAYS = 7;
const CTL_DAYS = 42;
const CHART_DAYS = 90; // 3 months
const WARMUP_DAYS = CTL_DAYS; // extra days to seed CTL before the chart window

function statusFromTsb(tsb: number): FitnessPoint["status"] {
  if (tsb < -20) return "overreaching";
  if (tsb < -5)  return "productive";
  if (tsb <= 10) return "fresh";
  return "detraining";
}

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  try {
    let athleteId = session.athleteId;
    if (!athleteId) {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    }
    if (!athleteId) {
      return NextResponse.json({ ok: false, error: "Could not determine athlete ID." }, { status: 200 });
    }

    const [profileResult, activitiesResult] = await Promise.allSettled([
      fetchOwnProfile(session.accessToken),
      fetchActivities(session.accessToken, athleteId, 200),
    ]);

    const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
    const activities = activitiesResult.status === "fulfilled" ? activitiesResult.value : [];

    const ftp = profile?.ftp ?? 0;
    const referenceWatts = ftp > 0
      ? ftp
      : Math.max(1, ...activities.map(a => (a.avgWatts as number) || 0));

    // Build daily TSS map: date string → total TSS for that day.
    // Prefer Zwift's own per-activity trainingLoad field (the same number
    // Zwift Companion uses to build the Training Score) over our watts proxy.
    const dailyTss: Record<string, number> = {};
    for (const a of activities) {
      if (!a.startDate) continue;
      const dateKey = (a.startDate as string).slice(0, 10);

      // Zwift stores its own training load per activity under one of these fields.
      // Using it means our CTL (= Training Score) matches Companion exactly.
      const zwiftLoad =
        (a.trainingLoad as number) ||
        (a.activityTrainingLoad as number) ||
        0;

      let tss: number;
      if (zwiftLoad > 0) {
        tss = zwiftLoad;
      } else {
        // Fallback proxy when Zwift doesn't include a trainingLoad value
        const durationHours = ((a.movingTimeInMs as number) || 0) / 3600000;
        const watts = (a.avgWatts as number) || 0;
        if (!durationHours || !watts) continue;
        const intensityFactor = watts / referenceWatts;
        tss = durationHours * intensityFactor * intensityFactor * 100;
      }

      dailyTss[dateKey] = (dailyTss[dateKey] ?? 0) + tss;
    }

    // Walk day-by-day from (chartStart - warmup) to today,
    // computing exponentially weighted CTL and ATL
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const chartStart = new Date(today);
    chartStart.setUTCDate(today.getUTCDate() - CHART_DAYS + 1);

    const walkStart = new Date(chartStart);
    walkStart.setUTCDate(chartStart.getUTCDate() - WARMUP_DAYS);

    const atlDecay = Math.exp(-1 / ATL_DAYS);
    const ctlDecay = Math.exp(-1 / CTL_DAYS);
    let atl = 0;
    let ctl = 0;

    const points: FitnessPoint[] = [];

    for (
      const d = new Date(walkStart);
      d.getTime() <= today.getTime();
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const key = d.toISOString().slice(0, 10);
      const tss = dailyTss[key] ?? 0;
      atl = atl * atlDecay + tss * (1 - atlDecay);
      ctl = ctl * ctlDecay + tss * (1 - ctlDecay);

      // Only collect points in the visible chart window
      if (d.getTime() >= chartStart.getTime()) {
        const tsb = ctl - atl;
        points.push({
          date: key,
          ctl: Math.round(ctl * 10) / 10,
          atl: Math.round(atl * 10) / 10,
          tsb: Math.round(tsb * 10) / 10,
          tss: Math.round(tss),
          status: statusFromTsb(tsb),
        });
      }
    }

    const current = points[points.length - 1] ?? null;
    return NextResponse.json({ ok: true, points, current });
  } catch (e) {
    if (e instanceof ZwiftApiError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}
