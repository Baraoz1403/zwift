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
import { IconBolt, IconFlame, IconHeart, IconTrend, IconList, IconCalendar } from "./icons";
import AvgCadenceCard from "./avg-cadence-card";
import AvgHRCard from "./avg-hr-card";
import HRAlertBanner from "./hr-alert-banner";
import FitnessStatusChip from "./fitness-status-chip";

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
              Train smarter, every week — powered by your ride data.
            </div>
          </div>
        </div>

        {/* RIGHT: Nav chips + Sign out (top), data chips (bottom) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!activitiesError && activities.length > 0 && (
              <>
                <a href="#weekly-plan" className="header-nav-chip">
                  <IconCalendar size={15} />
                  Weekly Plan
                </a>
                