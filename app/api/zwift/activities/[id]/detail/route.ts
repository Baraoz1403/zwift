import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchActivityFit, fetchOwnProfile, fetchRideOns, ZwiftApiError } from "@/lib/zwift";
import { parseFitRecords, FitRecord } from "@/lib/fit-parser";
import { cleanRideName } from "@/lib/stats";

// Caps how many points we send to the browser per ride - a 2 hour ride at
// 1 sample/sec is ~7200 points, more than a chart needs. We keep every Nth
// point evenly so the shape of the ride is preserved.
const MAX_POINTS = 600;

function downsample(records: FitRecord[]): FitRecord[] {
  if (records.length <= MAX_POINTS) return records;
  const step = records.length / MAX_POINTS;
  const out: FitRecord[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    out.push(records[Math.floor(i * step)]);
  }
  return out;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
    const activity = activities.find((a) => (a.id_str ?? String(a.id)) === id);
    if (!activity) {
      return NextResponse.json({ ok: false, error: "Ride not found." }, { status: 404 });
    }

    const [fit, rideOns] = await Promise.allSettled([
      fetchActivityFit(activity).then(parseFitRecords),
      fetchRideOns(session.accessToken, id),
    ]);

    return NextResponse.json({
      ok: true,
      activity: {
        id,
        name: cleanRideName(activity.name),
        sport: activity.sport,
        startDate: activity.startDate,
        distanceInMeters: activity.distanceInMeters,
        movingTimeInMs: activity.movingTimeInMs,
        avgWatts: activity.avgWatts,
        totalElevation: activity.totalElevation,
        worldId: activity.worldId,
        calories: activity.calories,
      },
      fit:
        fit.status === "fulfilled"
          ? { ok: true, points: downsample(fit.value) }
          : { ok: false, error: fit.reason instanceof Error ? fit.reason.message : "Could not load FIT data." },
      rideOns:
        rideOns.status === "fulfilled"
          ? { ok: true, givers: rideOns.value }
          : {
              ok: false,
              error:
                rideOns.reason instanceof ZwiftApiError
                  ? rideOns.reason.message
                  : "Could not load Ride On givers.",
            },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 }
    );
  }
}
