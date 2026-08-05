/**
 * Tablet — Week view
 * Reuses the mobile WeekView client component (already built and tested).
 * The tablet shell (sidebar + layout) is provided by app/tablet/layout.tsx.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getRiderIdentity, getStoredAthleteState } from "@/lib/kv-plan-state";
import { kvGet } from "@/lib/kv";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile, fetchActivities } from "@/lib/zwift";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import WeekView from "@/app/m/week/week-view";
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

  const [plan, kvCreds, zwiftProfile, cachedIdentity, athleteState, trainingLoadRaw] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKey ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
    getStoredAthleteState(athleteId).catch(() => null),
    kvGet(`zwift:${athleteId}:training_load`).catch(() => null),
  ]);
  let ctl: number | null = null, atl: number | null = null, tsb: number | null = null, freshness: string | null = null;
  try {
    if (trainingLoadRaw) {
      const tl = JSON.parse(trainingLoadRaw) as Record<string, unknown>;
      ctl = typeof tl.ctl === "number" ? Math.round(tl.ctl) : null;
      atl = typeof tl.atl === "number" ? Math.round(tl.atl) : null;
      tsb = typeof tl.tsb === "number" ? Math.round(tl.tsb) : null;
      freshness = typeof tl.freshness === "string" ? tl.freshness : null;
    }
  } catch { /* best-effort */ }
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
    <div style={{ display: "flex", flexDirection: "column", background: "var(--m-bg)" }}>
      {/* Small in-content week title (main header is in layout TabletTopBar) */}
      <div style={{ padding:"14px 28px 10px", borderBottom:"1px solid var(--m-border)", background:"var(--m-card)" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"var(--m-muted)", textTransform:"uppercase", letterSpacing:".12em" }}>This week</div>
        <div style={{ fontSize:14, color:"var(--m-muted)", marginTop:2, fontWeight:500 }}>{formatWeekRange(weekOf)}</div>
      </div>
      {/* Body: week view on left, sidebar on right */}
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <div style={{ flex: 1, padding: "32px 36px" }}>
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
          ctl={ctl}
          atl={atl}
          tsb={tsb}
          freshness={freshness}
        />
      </div>
    </div>
  );
}
