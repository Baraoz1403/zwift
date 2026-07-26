import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchActivityFit } from "@/lib/zwift";
import { parseFitRecords } from "@/lib/fit-parser";
import {
  selectChartActivities,
  mapWithConcurrency,
  flagHeartRateAnomalies,
  computeHRTrend,
} from "@/lib/stats";
import type { RideSummary } from "@/lib/ai";

export type HRAlertLevel = "orange" | "red" | "black";

export interface HRAlertResponse {
  ok: boolean;
  level: HRAlertLevel | null;
  /** Short bold headline shown in the banner */
  headline: string | null;
  /** Explanatory sentence(s) shown below the headline */
  detail: string | null;
  /** Quantitative context for the coaching page / AI */
  hrDeltaPct?: number | null;
  wattsDeltaPct?: number | null;
  trend?: string | null;
  ridesAnalyzed?: number;
}

/**
 * GET /api/zwift/hr-alert
 *
 * Fetches the rider's last 10 rides' FIT heart rate data (bounded concurrency)
 * and cross-references it with watts from the activity list to run
 * computeHRTrend(). Returns one of three alert levels:
 *
 *   orange  – early warning; ease off
 *   red     – significant concern; rest required
 *   black   – critical; stop training / see a doctor
 *
 * Returns { ok: true, level: null } if data is insufficient or the trend is
 * normal. This endpoint intentionally never throws — a banner that flickers
 * with errors would be more disruptive than no banner at all.
 */
export async function GET(): Promise<NextResponse> {
  const NULL_RESULT: HRAlertResponse = { ok: true, level: null, headline: null, detail: null };

  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!raw) return NextResponse.json(NULL_RESULT);

    const session = await decryptSession(raw);
    if (!session) return NextResponse.json(NULL_RESULT);

    const athleteId = session.athleteId;
    if (!athleteId) return NextResponse.json(NULL_RESULT);

    const activities = await fetchActivities(session.accessToken, athleteId);
    // selectChartActivities returns rides oldest-first; we take the last 10 (most recent)
    const chartActs = selectChartActivities(activities, 30);
    const last10 = chartActs.slice(-10);

    if (last10.length < 7) return NextResponse.json(NULL_RESULT);

    // Fetch HR from FIT files (bounded to 4 concurrent downloads)
    const fitResults = await mapWithConcurrency(last10, 4, async (a) => {
      try {
        const buf = await fetchActivityFit(a);
        const records = parseFitRecords(buf);
        const hrVals = records
          .filter((r) => r.heartRate != null && r.heartRate > 0)
          .map((r) => r.heartRate as number);
        return hrVals.length > 0
          ? hrVals.reduce((s, v) => s + v, 0) / hrVals.length
          : null;
      } catch {
        return null;
      }
    });

    // Flatten PromiseSettledResult to plain values (null on rejection)
    const hrValues = fitResults.map((r) => (r.status === "fulfilled" ? r.value : null));

    // Build RideSummary[] (oldest-first, matching last10 order)
    const rides: RideSummary[] = last10.map((a, i) => ({
      date: (a.startDate as string) ?? "",
      sport: a.sport as string | undefined,
      distanceKm: Math.round(((a.distanceInMeters ?? 0) as number) / 100) / 10,
      durationMin: Math.round(((a.movingTimeInMs ?? 0) as number) / 60000),
      avgWatts: Math.round((a.avgWatts ?? 0) as number),
      elevationM: Math.round((a.totalElevation ?? 0) as number),
      avgHeartRate: hrValues[i] != null ? Math.round(hrValues[i] as number) : null,
    }));

    // Flag individual HR anomalies (required for consecutiveLowHRRides)
    const flags = flagHeartRateAnomalies(rides);
    for (const [idx, dir] of flags) {
      rides[idx].hrFlag = dir;
    }

    // computeHRTrend expects newest-first
    const newestFirst = [...rides].reverse();
    const trend = computeHRTrend(newestFirst, 4);

    // Not enough data to be confident
    if (trend.ridesWithHRData < 7) return NextResponse.json(NULL_RESULT);

    const hr = trend.hrDeltaPct ?? 0;
    const w = trend.wattsDeltaPct ?? 0;
    const consec = trend.consecutiveLowHRRides;
    const n = trend.ridesWithHRData;

    let level: HRAlertLevel | null = null;
    let headline: string | null = null;
    let detail: string | null = null;

    if (trend.trend === "suppressed") {
      // HR down + watts down — blunted autonomic response
      const hrDrop = Math.abs(hr);
      const wDrop = Math.abs(w);

      if (hrDrop >= 18 || consec >= 6) {
        // Critical: severe or very persistent suppression
        level = "black";
        headline = "Stop Training — Critical HR Suppression";
        detail =
          `Your heart rate is ${hrDrop.toFixed(0)}% below your baseline across ${n} recent rides, ` +
          `and your power has also dropped ${wDrop.toFixed(0)}%. This is a significant, sustained ` +
          `blunted cardiac response. Rest completely for at least a week. ` +
          `If you feel unwell, experience chest tightness, or this pattern continues, consult your doctor.`;
      } else if (hrDrop >= 12 || consec >= 4) {
        // Significant: likely overreaching or illness onset
        level = "red";
        headline = "Rest Required — HR Suppression Detected";
        detail =
          `Over your last ${n} rides, your average HR is ${hrDrop.toFixed(0)}% below your baseline, ` +
          `while power has also dropped ${wDrop.toFixed(0)}%. ` +
          `This pattern — HR that can't reach normal levels — is a classic sign of overreaching or early illness. ` +
          `Cut training intensity significantly this week and prioritise sleep and nutrition.`;
      } else {
        // Early warning
        level = "orange";
        headline = "HR Watch — Early Suppression Signal";
        detail =
          `Your HR over recent rides is running ${hrDrop.toFixed(0)}% lower than your baseline ` +
          `alongside a ${wDrop.toFixed(0)}% drop in power. ` +
          `This may indicate accumulated fatigue. Consider an easier week, extra sleep, ` +
          `and check for other signs of illness.`;
      }
    } else if (trend.trend === "declining") {
      // HR elevated relative to power — fatigue or environmental stress
      if (hr >= 18) {
        level = "red";
        headline = "Rest Required — Elevated HR";
        detail =
          `Your average HR over recent rides is ${hr.toFixed(0)}% higher than your baseline ` +
          `for the same effort. This level of cardiac strain indicates significant fatigue, ` +
          `dehydration, or possible illness. Take a full recovery week of low-intensity riding only.`;
      } else if (hr >= 10) {
        level = "orange";
        headline = "Fatigue Watch — HR Trending Up";
        detail =
          `Your HR is running ${hr.toFixed(0)}% above your baseline across recent rides — ` +
          `your body is working harder than usual for the same power output. ` +
          `A lighter week now will prevent deeper overreaching.`;
      }
    }

    // No alert if improving or stable
    if (!level) return NextResponse.json(NULL_RESULT);

    const response: HRAlertResponse = {
      ok: true,
      level,
      headline,
      detail,
      hrDeltaPct: trend.hrDeltaPct,
      wattsDeltaPct: trend.wattsDeltaPct,
      trend: trend.trend,
      ridesAnalyzed: n,
    };
    return NextResponse.json(response);
  } catch {
    // Never let errors surface as visible errors in the UI
    return NextResponse.json(NULL_RESULT);
  }
}
