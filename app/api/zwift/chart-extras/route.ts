import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchActivityFit, fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";
import { parseFitRecords } from "@/lib/fit-parser";
import { selectChartActivities, mapWithConcurrency, type ChartExtra } from "@/lib/stats";

/**
 * On-demand FIT-derived extras (avg heart rate/cadence) for the Performance
 * trends chart's larger ride-count windows (60/90/120).
 *
 * The dashboard page itself only pre-fetches extras for the *default*
 * 30-ride window server-side on every load - downloading and parsing a FIT
 * file per ride is by far the most expensive thing this app does, and doing
 * it for up to 120 rides on every single dashboard visit (including simply
 * clicking "Back to dashboard" from a ride's detail page) is what made that
 * navigation take forever and occasionally appear to hang. Fetching the
 * bigger windows here instead, lazily, only when the user actually picks
 * 60/90/120 in the chart's selector, keeps every normal dashboard
 * load/back-navigation fast while still making the bigger windows available
 * on request.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session invalid or expired." }, { status: 401 });
  }

  const countParam = Number(req.nextUrl.searchParams.get("count"));
  const count = [30, 60, 90, 120].includes(countParam) ? countParam : 120;

  try {
    let athleteId = session.athleteId;
    if (!athleteId) {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    }
    if (!athleteId) {
      return NextResponse.json(
        { ok: false, error: "Could not determine your Zwift rider id." },
        { status: 200 }
      );
    }

    const activities = await fetchActivities(session.accessToken, athleteId);
    const chartActivities = selectChartActivities(activities, count);

    const results = await mapWithConcurrency(chartActivities, 4, async (a) => {
      const buf = await fetchActivityFit(a);
      const fitRecords = parseFitRecords(buf);
      const hrVals = fitRecords
        .filter((r) => r.heartRate != null && r.heartRate > 0)
        .map((r) => r.heartRate as number);
      const cadVals = fitRecords.filter((r) => r.cadence != null).map((r) => r.cadence as number);
      return {
        avgHeartRate: hrVals.length > 0 ? hrVals.reduce((s, v) => s + v, 0) / hrVals.length : null,
        avgCadence: cadVals.length > 0 ? cadVals.reduce((s, v) => s + v, 0) / cadVals.length : null,
      } as ChartExtra;
    });

    const extras: ChartExtra[] = results.map((r) =>
      r.status === "fulfilled" ? r.value : { avgHeartRate: null, avgCadence: null }
    );

    return NextResponse.json({ ok: true, count, extras });
  } catch (e) {
    if (e instanceof ZwiftApiError) {
      return NextResponse.json({ ok: false, error: e.message, status: e.status }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}
