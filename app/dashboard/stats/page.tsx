import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile, fetchActivities, fetchActivityFit, ZwiftActivity } from "@/lib/zwift";
import { parseFitRecords } from "@/lib/fit-parser";
import {
  computeRecords,
  selectChartActivities,
  toClientActivity,
  mapWithConcurrency,
  getCachedFitExtras,
  setCachedFitExtras,
  type ChartExtra,
} from "@/lib/stats";
import ActivityCharts from "../activity-chart";
import RidesTable from "../rides-table";
import PersonalRecords from "../personal-records";
import ActivityHeatmap from "../activity-heatmap";
import { IconTrend, IconClock, IconDistance, IconFlame, IconList } from "../icons";
import AvgCadenceCard from "../avg-cadence-card";
import AvgHRCard from "../avg-hr-card";

/**
 * Stats page ("/dashboard/stats") - Power & Cadence + Fitness merged into
 * one metric-tile row, Personal Bests, performance trends, and ride
 * history/heatmap. Deliberately no coaching content here - see
 * app/dashboard/page.tsx (the Coach page) for Today's Note, workout cards,
 * and the AI/coach message area.
 */
export default async function StatsPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login");

  const session = await decryptSession(raw);
  if (!session) redirect("/login");

  let activities: ZwiftActivity[] = [];
  let activitiesError: string | null = null;

  try {
    let athleteId = session.athleteId;
    if (!athleteId) {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    }
    if (!athleteId) throw new Error("Could not determine your Zwift rider id.");
    activities = await fetchActivities(session.accessToken, athleteId);
  } catch (e) {
    activitiesError = e instanceof Error ? e.message : "Could not load ride history.";
  }

  if (activitiesError || activities.length === 0) {
    return (
      <div className="section fade-in">
        <div className="section-title"><IconList size={14} /> Stats</div>
        <div className="notice">
          {activitiesError
            ? `Ride history couldn't be loaded right now (${activitiesError}).`
            : "No rides yet — stats will appear here once you've logged at least one ride on Zwift."}
        </div>
      </div>
    );
  }

  const wattsRides = activities.filter(a => a.avgWatts && (a.avgWatts as number) > 0).slice(0, 10);
  const avgWatts10 = wattsRides.length > 0
    ? Math.round(wattsRides.reduce((s, a) => s + (a.avgWatts as number), 0) / wattsRides.length)
    : null;

  const calRides = activities.filter(a => a.calories && (a.calories as number) > 0).slice(0, 10);
  const avgCalories10 = calRides.length > 0
    ? Math.round(calRides.reduce((s, a) => s + (a.calories as number), 0) / calRides.length)
    : null;

  const distRides = activities.filter(a => a.distanceInMeters && (a.distanceInMeters as number) > 0).slice(0, 10);
  const avgDistKm = distRides.length > 0
    ? distRides.reduce((s, a) => s + (a.distanceInMeters as number), 0) / distRides.length / 1000
    : null;

  const timeRides = activities.filter(a => a.movingTimeInMs && (a.movingTimeInMs as number) > 0).slice(0, 10);
  const avgTimeMs = timeRides.length > 0
    ? timeRides.reduce((s, a) => s + (a.movingTimeInMs as number), 0) / timeRides.length
    : null;
  const avgTimeFmt = avgTimeMs != null
    ? avgTimeMs >= 3600000
      ? { value: (avgTimeMs / 3600000).toFixed(1), unit: "h" }
      : { value: Math.round(avgTimeMs / 60000).toString(), unit: "min" }
    : null;

  const clientActivities = activities.map(toClientActivity);

  return (
    <>
      {/* ── Merged Power & Cadence + Fitness — one row of metric tiles ── */}
      <div className="section fade-in">
        <div className="section-title" style={{ margin: "0 0 12px 0" }}>
          <IconTrend size={14} />
          Power &amp; Fitness
          <span style={{ fontSize: 10, fontWeight: 500, color: "var(--muted)", opacity: 0.6, marginLeft: 6 }}>· last 10 rides</span>
        </div>
        <div className="stat-grid stat-grid-6">
          <div className="stat-card">
            <div className="stat-card-head"><div className="stat-card-icon c-blue"><IconTrend size={13} /></div></div>
            <div className="label" style={{ marginTop: 8 }}>Avg watts</div>
            <div className="value">{avgWatts10 != null ? `${avgWatts10} W` : "—"}</div>
          </div>
          <AvgCadenceCard />
          <div className="stat-card" style={{ padding: 0 }}>
            <AvgHRCard mode="row" />
          </div>
          <div className="stat-card">
            <div className="stat-card-head"><div className="stat-card-icon c-orange"><IconFlame size={13} /></div></div>
            <div className="label" style={{ marginTop: 8 }}>Avg calories</div>
            <div className="value">{avgCalories10 != null ? `${avgCalories10} kcal` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head"><div className="stat-card-icon c-blue"><IconDistance size={13} /></div></div>
            <div className="label" style={{ marginTop: 8 }}>Avg distance</div>
            <div className="value">{avgDistKm != null ? `${avgDistKm.toFixed(1)} km` : "—"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head"><div className="stat-card-icon c-teal"><IconClock size={13} /></div></div>
            <div className="label" style={{ marginTop: 8 }}>Avg duration</div>
            <div className="value">{avgTimeFmt != null ? `${avgTimeFmt.value}${avgTimeFmt.unit}` : "—"}</div>
          </div>
        </div>
      </div>

      <Suspense
        fallback={
          <>
            <div className="section fade-in">
              <PersonalRecords activities={clientActivities} bestHeartRate={null} />
            </div>
            <div className="section fade-in">
              <div className="section-title"><IconTrend size={14} /> Performance trends</div>
              <div className="notice">Crunching your recent rides for heart rate/cadence…</div>
            </div>
          </>
        }
      >
        <ChartDataSection activities={activities} clientActivities={clientActivities} />
      </Suspense>

      <div className="section fade-in">
        <div className="section-title"><IconList size={14} /> Rides</div>
        <RidesTable activities={clientActivities} />
      </div>

      <div className="section fade-in">
        <ActivityHeatmap activities={clientActivities} />
      </div>
    </>
  );
}

/** Same FIT-heavy section as before, streamed in via Suspense so the tile
 *  row/rides table reach the browser immediately. See the original
 *  app/dashboard/page.tsx history for the full rationale. */
async function ChartDataSection({
  activities,
  clientActivities,
}: {
  activities: ZwiftActivity[];
  clientActivities: ZwiftActivity[];
}) {
  const chartActivities = activities.length > 0 ? selectChartActivities(activities, 30) : [];
  let chartExtras: ChartExtra[] = [];
  let bestHeartRate: { bpm: number; rideName?: string; rideDate?: string } | null = null;

  if (chartActivities.length > 0) {
    const results = await mapWithConcurrency(chartActivities, 4, async (a) => {
      const cached = getCachedFitExtras(a);
      if (cached) return cached;

      const buf = await fetchActivityFit(a);
      const fitRecords = parseFitRecords(buf);
      const hrVals = fitRecords.filter((r) => r.heartRate != null && r.heartRate > 0).map((r) => r.heartRate as number);
      const cadVals = fitRecords.filter((r) => r.cadence != null).map((r) => r.cadence as number);
      const extra: ChartExtra = {
        avgHeartRate: hrVals.length > 0 ? hrVals.reduce((s, v) => s + v, 0) / hrVals.length : null,
        avgCadence: cadVals.length > 0 ? cadVals.reduce((s, v) => s + v, 0) / cadVals.length : null,
      };
      setCachedFitExtras(a, extra);
      return extra;
    });
    chartExtras = results.map((r) => (r.status === "fulfilled" ? r.value : { avgHeartRate: null, avgCadence: null }));

    let bestIdx = -1;
    let bestBpm = -1;
    chartExtras.forEach((e, i) => {
      if (e.avgHeartRate != null && e.avgHeartRate > bestBpm) {
        bestBpm = e.avgHeartRate;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      const a = chartActivities[bestIdx];
      bestHeartRate = { bpm: bestBpm, rideName: a.name, rideDate: a.startDate };
    }
  }

  return (
    <>
      <div className="section fade-in">
        <PersonalRecords activities={clientActivities} bestHeartRate={bestHeartRate} />
      </div>
      <div className="section fade-in">
        <ActivityCharts activities={clientActivities} extras={chartExtras} />
      </div>
    </>
  );
}
