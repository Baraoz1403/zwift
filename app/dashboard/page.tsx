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
import Link from "next/link";
import LogoutButton from "./logout-button";
import DashboardFooter from "./footer";
import ActivityCharts from "./activity-chart";
import RidesTable from "./rides-table";
import AiInsights from "./ai-insights";
import AiInsightsLink from "./ai-insights-link";
import WeeklyPlan from "./weekly-plan";
import PersonalRecords from "./personal-records";
import ActivityHeatmap from "./activity-heatmap";
import TrendComparison from "./trend-comparison";
import SignalChips from "./signal-chips";
import { IconBolt, IconFlame, IconUser, IconHeart, IconScale, IconBike, IconRun, IconTrend, IconList, IconTrophy, IconCalendar } from "./icons";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login");

  const session = await decryptSession(raw!);
  if (!session) redirect("/login");

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

  // Zwift's own site shows a VO2max estimate on the rider's "Fitness
  // Metrics" page, but that's computed by an undisclosed Zwift algorithm
  // behind a different, separate endpoint we don't have access to here -
  // /api/profiles/me has no vo2max field at all. The standard, widely-used
  // approximation from power data is the Coggan formula, which only needs
  // FTP and weight (both of which we already have): VO2max (ml/kg/min) =
  // 10.8 x (FTP watts / weight kg) + 7. It won't match Zwift's exact number,
  // but it's the same formula most third-party "Zwift VO2max calculator"
  // tools use to approximate it, so it's labelled as an estimate in the UI.
  const weightKg = profile?.weight ? profile.weight / 1000 : null;
  const vo2max =
    profile?.ftp && weightKg ? 10.8 * (profile.ftp / weightKg) + 7 : null;

  // Zwift's rider "Level" shown on the site, split by discipline - cycling
  // (achievementLevel) and running (runAchievementLevel). Both are stored as
  // level*100, so floor(.../100) gives the displayed level number.
  const cyclingLevel =
    profile?.achievementLevel != null ? Math.floor(profile.achievementLevel / 100) : null;
  const runLevel =
    profile?.runAchievementLevel != null ? Math.floor(profile.runAchievementLevel / 100) : null;

  // Look for the most recent FTP/Ramp test ride to find an honest "as of" date.
  // Zwift's profile API doesn't expose when FTP was last changed, so we search
  // ride names for known test patterns. If none found, we show "from Zwift profile"
  // without a date rather than misleadingly showing today's date.
  const ftpTestRide = activities
    .filter(a => {
      const name = (a.name ?? "").toLowerCase();
      return name.includes("ramp") || name.includes("ftp test") || name.includes("ftp-test");
    })
    .sort((a, b) =>
      new Date(b.startDate ?? 0).getTime() - new Date(a.startDate ?? 0).getTime()
    )[0] ?? null;

  const ftpDateLabel = ftpTestRide?.startDate
    ? new Date(ftpTestRide.startDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null; // null = show "from Zwift profile" instead

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
              {records && records.currentStreakDays > 1 && (
                <span className="streak-badge">
                  <IconFlame size={14} />
                  {records.currentStreakDays} day streak
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}>
              Train smarter, every week — powered by your ride data.
            </div>
          </div>
        </div>

        {/* RIGHT: Nav chips + Sign out */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        <div className="stat-grid stat-grid-compact fade-in">
          <SignalChips />
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-card-icon c-amber">
                <IconBolt size={13} />
              </div>
              <div className="label" style={{ margin: 0 }}>FTP</div>
            </div>
            <div className="value">{profile.ftp ?? "n/a"}</div>
            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
              {ftpDateLabel ? `as of ${ftpDateLabel}` : "from Zwift profile"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-card-icon c-red">
                <IconHeart size={13} />
              </div>
              <div className="label" style={{ margin: 0 }}>VO2max (est.)</div>
            </div>
            <div className="value">{vo2max != null ? vo2max.toFixed(1) : "n/a"}</div>
            <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
              {ftpDateLabel ? `est. ${ftpDateLabel}` : "est. from FTP"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-card-icon c-teal">
                <IconScale size={13} />
              </div>
              <div className="label" style={{ margin: 0 }}>Weight</div>
            </div>
            <div className="value">
              {profile.weight ? `${(profile.weight / 1000).toFixed(1)} kg` : "n/a"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-card-icon c-orange">
                <IconBike size={13} />
              </div>
              <div className="label" style={{ margin: 0 }}>Level (cycling)</div>
            </div>
            <div className="value">{cyclingLevel ?? "n/a"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head">
              <div className="stat-card-icon c-green">
                <IconRun size={13} />
              </div>
              <div className="label" style={{ margin: 0 }}>Level (running)</div>
            </div>
            <div className="value">{runLevel ?? "n/a"}</div>
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
          {/* ── Most actionable: today’s plan + AI coaching ── */}
          <div className="section fade-in" id="weekly-plan" style={{ scrollMarginTop: 24, marginTop: 16 }}>
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
        <div className="section-title"><IconTrend size={14} /> Performance trends</div>
        <ActivityCharts activities={clientActivities} extras={chartExtras} />
      </div>
      </>
  );
}
