import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile, fetchActivities, fetchActivityFit, ZwiftActivity, ZwiftProfile } from "@/lib/zwift";
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
import LogoutButton from "./logout-button";
import DashboardFooter from "./footer";
import ActivityCharts from "./activity-chart";
import RidesTable from "./rides-table";
import AiInsights from "./ai-insights";
import AiInsightsLink from "./ai-insights-link";
import WeeklyPlan from "./weekly-plan";
import PersonalRecords from "./personal-records";
import ActivityHeatmap from "./activity-heatmap";
import { IconBolt, IconClock, IconDistance, IconFlame, IconHeart, IconTrend, IconList, IconCalendar } from "./icons";
import AvgCadenceCard from "./avg-cadence-card";
import AvgHRCard from "./avg-hr-card";
import HRAlertBanner from "./hr-alert-banner";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login");

  const session = await decryptSession(raw!);
  if (!session) redirect("/login");

  // If the Zwift access token has expired, bounce through the refresh route.
  // It will use the stored refresh_token to get a new one silently, then
  // redirect back here. If the refresh itself fails (e.g. Zwift password
  // changed), the refresh route clears the cookie and redirects to /login.
  if (session.expiresAt && session.expiresAt < Date.now()) {
    redirect("/api/auth/refresh?next=/dashboard");
  }

  let profile: ZwiftProfile | null = null;
  let profileError: string | null = null;
  let activities: ZwiftActivity[] = [];
  let activitiesError: string | null = null;

  // The profile fetch and the activities fetch don't depend on each other -
  // session.athleteId is already known right after login, so activities
  // doesn't actually need to wait for the profile response first. Running
  // them in parallel (instead of one after the other, like before) roughly
  // halves the time spent on network round trips before the page can even
  // start rendering.
  if (session.athleteId) {
    const [profileResult, activitiesResult] = await Promise.allSettled([
      fetchOwnProfile(session.accessToken),
      fetchActivities(session.accessToken, session.athleteId),
    ]);

    if (profileResult.status === "fulfilled") {
      profile = profileResult.value;
    } else {
      profileError =
        profileResult.reason instanceof Error
          ? profileResult.reason.message
          : "Could not load profile.";
    }

    if (activitiesResult.status === "fulfilled") {
      activities = activitiesResult.value;
    } else {
      activitiesError =
        activitiesResult.reason instanceof Error
          ? activitiesResult.reason.message
          : "Could not load ride history.";
    }
  } else {
    // Rare edge case: no athleteId in the session yet, so the profile must
    // be fetched first to learn it before activities can be requested.
    try {
      profile = await fetchOwnProfile(session.accessToken);
    } catch (e) {
      profileError = e instanceof Error ? e.message : "Could not load profile.";
    }
  }

  // Average watts from the last 10 rides that report it (activities are most-recent-first).
  // Average cadence comes from FIT files, handled by AvgCadenceCard (client component).
  const wattsRides = activities
    .filter(a => a.avgWatts && (a.avgWatts as number) > 0)
    .slice(0, 10);
  const avgWatts10 = wattsRides.length > 0
    ? Math.round(wattsRides.reduce((s, a) => s + (a.avgWatts as number), 0) / wattsRides.length)
    : null;

  // Average calories over the last 10 rides that report them.
  // Avg heart rate is NOT taken from the activity list (that field is unreliable there);
  // AvgHRCard fetches it lazily from FIT files via /api/zwift/chart-extras instead.
  const calRides = activities
    .filter(a => a.calories && (a.calories as number) > 0)
    .slice(0, 10);
  const avgCalories10 = calRides.length > 0
    ? Math.round(calRides.reduce((s, a) => s + (a.calories as number), 0) / calRides.length)
    : null;

  // Average distance and duration for the last 10 rides.
  const distRides = activities
    .filter(a => a.distanceInMeters && (a.distanceInMeters as number) > 0)
    .slice(0, 10);
  const avgDistKm = distRides.length > 0
    ? distRides.reduce((s, a) => s + (a.distanceInMeters as number), 0) / distRides.length / 1000
    : null;

  const timeRides = activities
    .filter(a => a.movingTimeInMs && (a.movingTimeInMs as number) > 0)
    .slice(0, 10);
  const avgTimeMs = timeRides.length > 0
    ? timeRides.reduce((s, a) => s + (a.movingTimeInMs as number), 0) / timeRides.length
    : null;
  const avgTimeFmt = avgTimeMs != null
    ? avgTimeMs >= 3600000
      ? { value: (avgTimeMs / 3600000).toFixed(1), unit: "h" }
      : { value: Math.round(avgTimeMs / 60000).toString(), unit: "min" }
    : null;

  // Power trend: compare last 5 rides vs the 5 before that — used for the header subtitle.
  const last5w = wattsRides.slice(0, 5);
  const prev5w = wattsRides.slice(5, 10);
  const last5wAvg = last5w.length >= 3
    ? Math.round(last5w.reduce((s, a) => s + (a.avgWatts as number), 0) / last5w.length)
    : null;
  const prev5wAvg = prev5w.length >= 3
    ? Math.round(prev5w.reduce((s, a) => s + (a.avgWatts as number), 0) / prev5w.length)
    : null;
  const powerDelta = (last5wAvg && prev5wAvg) ? last5wAvg - prev5wAvg : null;

  // Rare edge case: session had no athleteId, so activities couldn't be
  // requested in parallel above - now that the profile (and its real id)
  // has arrived, fetch them in this fallback path.
  if (!session.athleteId && profile?.id && activities.length === 0 && !activitiesError) {
    try {
      activities = await fetchActivities(session.accessToken, profile.id);
    } catch (e) {
      activitiesError = e instanceof Error ? e.message : "Could not load ride history.";
    }
  } else if (!session.athleteId && !profile?.id) {
    activitiesError = "Could not determine your Zwift rider id.";
  }

  const records = activities.length > 0 ? computeRecords(activities) : null;

  const clientActivities = activities.map(toClientActivity);

  return (
    <>
    <div className="dashboard">
      <div className="dashboard-header fade-in">
        {/* LEFT: icon tile + identity + greeting + tagline */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Blue product tile */}
          <div style={{
            width: 50, height: 50, borderRadius: 14, flexShrink: 0, marginTop: 3,
            background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(47,143,224,0.35)",
          }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
            </svg>
          </div>

          {/* Text stack */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 5 }}>
              AI Training Coach
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: "-0.6px", lineHeight: 1 }}>
                {profile?.firstName ? `Hi, ${profile.firstName}` : "Your Dashboard"}
              </h1>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}>
              Ride smarter, live better — powered by AI.
            </div>
          </div>
        </div>

        {/* RIGHT: Nav chips + Sign out */}
        <div className="header-nav-row">
          {!activitiesError && activities.length > 0 && (
            <>
              <a href="#weekly-plan" className="header-nav-chip">
                <IconCalendar size={15} />
                Weekly Plan
              </a>
              <a href="#todays-note" className="header-nav-chip">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", opacity: 0.8 }}>
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                Today&apos;s Note
              </a>
              <AiInsightsLink />
            </>
          )}
          <LogoutButton />
        </div>
      </div>

      {profile && (
        <div className="rubric-cards-grid fade-in">

          {/* Left column */}
          <div>
            <div className="stat-card" style={{ padding: 0, overflow: "hidden" }}>

              <div className="section-title" style={{ margin: "16px 18px 10px 20px" }}>
                <IconTrend size={14} />
                Power &amp; Cadence
                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--muted)", opacity: 0.6, marginLeft: 6 }}>· last 10 rides</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12 }}>
                <div className="stat-card-icon c-blue" style={{ flexShrink: 0 }}><IconTrend size={13} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Avg watts</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
                  {avgWatts10 != null
                    ? <><span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>W</span><span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--text)", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right" }}>{avgWatts10}</span></>
                    : <span style={{ fontSize: 19, fontWeight: 700, color: "var(--muted)", minWidth: 48, textAlign: "right" }}>—</span>}
                </div>
              </div>

              <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
              <AvgCadenceCard asRow />
              <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />
              <AvgHRCard mode="row" />

            </div>
          </div>

          {/* Right column */}
          <div>
            <div className="stat-card" style={{ padding: 0, overflow: "hidden" }}>

              <div className="section-title" style={{ margin: "16px 18px 10px 20px" }}>
                <IconBolt size={14} />
                Fitness
                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--muted)", opacity: 0.6, marginLeft: 6 }}>· last 10 rides</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12 }}>
                <div className="stat-card-icon c-orange" style={{ flexShrink: 0 }}><IconFlame size={13} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Avg calories</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
                  {avgCalories10 != null
                    ? <><span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>kcal</span><span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--text)", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right" }}>{avgCalories10}</span></>
                    : <span style={{ fontSize: 19, fontWeight: 700, color: "var(--muted)", minWidth: 48, textAlign: "right" }}>—</span>}
                </div>
              </div>

              <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />

              <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12 }}>
                <div className="stat-card-icon c-blue" style={{ flexShrink: 0 }}><IconDistance size={13} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Avg distance</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
                  {avgDistKm != null
                    ? <><span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>km</span><span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--text)", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right" }}>{avgDistKm.toFixed(1)}</span></>
                    : <span style={{ fontSize: 19, fontWeight: 700, color: "var(--muted)", minWidth: 48, textAlign: "right" }}>—</span>}
                </div>
              </div>

              <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />

              <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12 }}>
                <div className="stat-card-icon c-teal" style={{ flexShrink: 0 }}><IconClock size={13} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Avg duration</div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
                  {avgTimeFmt != null
                    ? <><span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{avgTimeFmt.unit}</span><span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--text)", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right" }}>{avgTimeFmt.value}</span></>
                    : <span style={{ fontSize: 19, fontWeight: 700, color: "var(--muted)", minWidth: 48, textAlign: "right" }}>—</span>}
                </div>
              </div>

            </div>
          </div>

        </div>
      )}

      {profileError && (
        <div className="notice" style={{ marginTop: 16 }}>
          You&apos;re signed in successfully, but profile data couldn&apos;t be loaded
          right now ({profileError}). This is a known rough edge we&apos;re still
          fixing - it doesn&apos;t affect your sign-in.
        </div>
      )}

      {!activitiesError && activities.length > 0 && (
        <>
          {/* HR anomaly banner — renders client-side after FIT file analysis */}
          <HRAlertBanner />

          {/* ── Most actionable: today's plan + AI coaching ── */}
          <div className="section fade-in" id="weekly-plan" style={{ scrollMarginTop: 24 }}>
            <WeeklyPlan />
          </div>

          <div className="section fade-in" id="ai-insights" style={{ scrollMarginTop: 24 }}>
            <AiInsights />
          </div>

          {/* ── Stats & history ── */}
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
      )}

      {activitiesError && (
        <div className="section fade-in">
          <div className="section-title"><IconList size={14} /> Rides</div>
          <div className="notice">
            Ride history couldn&apos;t be loaded right now ({activitiesError}).
          </div>
        </div>
      )}

    </div>
    <DashboardFooter />
    </>
  );
}

/**
 * Everything that needs per-ride FIT data (heart rate/cadence) - Personal
 * Records' "best heart rate" tile and the Performance trends chart's
 * default 30-ride window - lives in this one async component so the rest of
 * the dashboard (header, stat cards, rides table, AI insights, heatmap,
 * trend comparison) can render and reach the browser immediately instead of
 * blocking on ~30 FIT-file downloads first. DashboardPage wraps this in a
 * <Suspense> boundary; Next.js streams this section in afterwards, in place
 * of the fallback, once it resolves.
 */
async function ChartDataSection({
  activities,
  clientActivities,
}: {
  activities: ZwiftActivity[];
  clientActivities: ZwiftActivity[];
}) {
  // Only pre-fetch FIT extras (avg heart rate/cadence) for the chart's
  // *default* 30-ride window here. Downloading + parsing a FIT file per ride
  // is the most expensive thing this app does, and doing that for the full
  // 120-ride universe on every single dashboard load - including every time
  // someone just clicks "Back to dashboard" from a ride's detail page - is
  // what made that navigation painfully slow. If the user picks a bigger
  // window (60/90/120) in the chart, activity-chart.tsx fetches just that
  // extra data lazily from /api/zwift/chart-extras instead.
  const chartActivities = activities.length > 0 ? selectChartActivities(activities, 30) : [];
  let chartExtras: ChartExtra[] = [];
  let bestHeartRate: { bpm: number; rideName?: string; rideDate?: string } | null = null;

  if (chartActivities.length > 0) {
    // Bounded concurrency (4 at a time) instead of firing all FIT downloads
    // simultaneously - see the comment on mapWithConcurrency in lib/stats.ts
    // for why: that many large response bodies landing on Node's
    // fetch/stream handling at the same instant is exactly the kind of load
    // that triggered the dashboard's stack-overflow crash.
    const results = await mapWithConcurrency(chartActivities, 4, async (a) => {
      // A finished ride's heart rate/cadence never changes, so once it's
      // been computed once, every later dashboard load can just reuse it
      // instead of re-downloading and re-parsing the same FIT file again.
      const cached = getCachedFitExtras(a);
      if (cached) return cached;

      const buf = await fetchActivityFit(a);
      const fitRecords = parseFitRecords(buf);
      const hrVals = fitRecords
        .filter((r) => r.heartRate != null && r.heartRate > 0)
        .map((r) => r.heartRate as number);
      const cadVals = fitRecords.filter((r) => r.cadence != null).map((r) => r.cadence as number);
      const extra: ChartExtra = {
        avgHeartRate: hrVals.length > 0 ? hrVals.reduce((s, v) => s + v, 0) / hrVals.length : null,
        avgCadence: cadVals.length > 0 ? cadVals.reduce((s, v) => s + v, 0) / cadVals.length : null,
      };
      setCachedFitExtras(a, extra);
      return extra;
    });
    chartExtras = results.map((r) =>
      r.status === "fulfilled" ? r.value : { avgHeartRate: null, avgCadence: null }
    );

    // "Best" here just means highest average heart rate seen across the same
    // recent rides the charts already cover - we only have heart rate data
    // for rides whose FIT file we downloaded above, not the full history.
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
