/**
 * Tablet — Week view
 * Reuses the mobile WeekView client component (already built and tested).
 * The tablet shell (sidebar + layout) is provided by app/tablet/layout.tsx.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getRiderIdentity, getStoredAthleteState } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile, fetchActivities } from "@/lib/zwift";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import WeekView from "@/app/m/week/week-view";
import { TabletPageHeader } from "../tablet-page-header";
import { TabletWeekSidebar } from "../tablet-week-sidebar";
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";

function formatWeekRange(weekOf: string): string {
  const monday = new Date(weekOf + "T00:00:00Z");
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default async function TabletWeekPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = String(session.athleteId);
  const weekOf    = mondayOfCurrentWeek();
  const cookieKey = cookieStore.get("zwift_intervals_key")?.value;
  const cookieId  = cookieStore.get("zwift_intervals_id")?.value;

  const [plan, kvCreds, zwiftProfile, cachedIdentity, athleteState] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKey ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
    getStoredAthleteState(athleteId).catch(() => null),
  ]);
  const firstName = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;
  const ftp = zwiftProfile?.ftp ?? cachedIdentity?.ftp ?? null;
  const macro = (athleteState as { macroCycle?: { weekIndex: number } } | null)?.macroCycle ?? null;
  const currentPhase = macro
    ? (macro.weekIndex === 0 ? "Base" : macro.weekIndex % 4 === 3 ? "Recovery" : "Build")
    : null;
  const weekDisplayNum = macro ? macro.weekIndex + 1 : null;

  const workouts = plan?.workouts ?? [];
  const today    = new Date().toISOString().slice(0, 10);

  const monday = new Date(weekOf + "T00:00:00Z");
  const weekDays = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const weekDates = weekDays.map((_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const dateMap: Record<string,string> = {};
  weekDays.forEach((d,i) => { dateMap[d] = weekDates[i]; });
  const workoutsWithDates = workouts.map(w => ({ ...w, date: w.date ?? dateMap[w.day] }));

  const weekWorkoutCount = workoutsWithDates.filter(
    (w: WeeklyWorkout) => !["rest","recovery"].some(k => (w.type ?? "").toLowerCase().includes(k))
  ).length;

  let weekStatus: Record<string, DayStatus> = {};
  let todayActivityName: string | null = null;
  let todayActivityDurationMin: number | null = null;
  let todayAvgHr: number | null = null;

  try {
    const icuKey = cookieKey ?? kvCreds?.icuKey;
    const icuId  = cookieId  ?? kvCreds?.icuId;

    const [icuActivities, zwiftRaw] = await Promise.all([
      (icuKey && icuId)
        ? Promise.race([
            fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
            new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
          ]).catch(() => [])
        : Promise.resolve([]),
      Promise.race([
        fetchActivities(session.accessToken, session.athleteId!, 50),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 5000)),
      ]).catch(() => []),
    ]);

    const zwiftAsIcu = zwiftRaw
      .map(zwiftActivityToIcu)
      .filter(a => {
        const d = a.start_date_local.slice(0, 10);
        return d >= weekDates[0] && d <= weekDates[6];
      });

    const activities = mergeActivities(
      icuActivities as import("@/lib/intervals").IcuActivity[],
      zwiftAsIcu,
    );
    weekStatus = computeWeekStatus(workoutsWithDates, activities, today, weekDates);

    const todayAct = activities.find(a => (a.start_date_local ?? "").slice(0, 10) === today);
    if (todayAct) {
      todayActivityName = todayAct.name ?? null;
      todayActivityDurationMin = todayAct.moving_time ? Math.round(todayAct.moving_time / 60) : null;
      todayAvgHr = todayAct.average_heartrate ?? null;
    }
  } catch { /* best-effort */ }

  const isBonus = weekStatus[today] === "bonus";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--m-bg)", overflow: "hidden" }}>
      <TabletPageHeader
        section="This week"
        name={firstName}
        subtitle={formatWeekRange(weekOf)}
      />
      {/* Body: week view on left, sidebar on right */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "28px" }}>
          <WeekView
            workouts={workoutsWithDates}
            weekOf={weekOf}
            weekRange={formatWeekRange(weekOf)}
            today={today}
            summary={plan?.summary ?? null}
            weekStatus={weekStatus}
            prevWeekHref={null}
            nextWeekHref={null}
            isCurrentWeek={true}
            hideNav={true}
          />
        </div>

        <TabletWeekSidebar
          ftp={ftp}
          currentPhase={currentPhase}
          weekDisplayNum={weekDisplayNum}
          workouts={workoutsWithDates}
          weekStatus={weekStatus}
          todayStr={today}
          planSummary={plan?.summary ?? null}
          weekWorkoutCount={weekWorkoutCount}
          isBonus={isBonus}
          todayActivityName={todayActivityName}
          todayActivityDurationMin={todayActivityDurationMin}
          todayAvgHr={todayAvgHr}
        />
      </div>
    </div>
  );
}
