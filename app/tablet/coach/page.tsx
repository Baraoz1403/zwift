/**
 * Tablet — Coach tab
 * Left: CoachChat (AI Q&A). Right: Week sidebar (same as Today page).
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { fetchOwnProfile, fetchActivities } from "@/lib/zwift";
import {
  getRiderIdentity,
  getCachedPlan,
  getStoredAthleteState,
  getIntervalsCredentials,
} from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";
import { TabletWeekSidebar } from "../tablet-week-sidebar";
import CoachChat from "@/app/m/coach/coach-chat";

const ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function weekDatesFrom(weekOf: string): string[] {
  const monday = new Date(weekOf + "T00:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function buildDateMap(weekOf: string): Record<string, string> {
  const monday = new Date(weekOf + "T00:00:00Z");
  const map: Record<string, string> = {};
  ALL_DAYS.forEach((d, i) => {
    const dt = new Date(monday);
    dt.setUTCDate(monday.getUTCDate() + i);
    map[d] = dt.toISOString().slice(0, 10);
  });
  return map;
}

export default async function TabletCoachPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = String(session.athleteId);
  const weekOf    = mondayOfCurrentWeek();
  const cookieKey = cookieStore.get("zwift_intervals_key")?.value;

  const [zwiftProfile, cachedIdentity, plan, earlyKvCreds, athleteState] = await Promise.all([
    fetchOwnProfile(session.accessToken).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
    getCachedPlan(athleteId, weekOf),
    cookieKey ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    getStoredAthleteState(athleteId).catch(() => null),
  ]);

  const firstName    = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;
  const ftp          = zwiftProfile?.ftp ?? cachedIdentity?.ftp ?? null;
  const macro        = (athleteState as { macroCycle?: { weekIndex: number } } | null)?.macroCycle ?? null;
  const currentPhase = macro
    ? (macro.weekIndex === 0 ? "Base" : macro.weekIndex % 4 === 3 ? "Recovery" : "Build")
    : null;
  const weekDisplayNum = macro ? macro.weekIndex + 1 : null;

  const todayStr  = new Date().toISOString().slice(0, 10);
  const weekDates = weekDatesFrom(weekOf);
  const dateMap   = buildDateMap(weekOf);
  const workouts: WeeklyWorkout[] = (plan?.workouts ?? []).map(w => ({ ...w, date: w.date ?? dateMap[w.day] ?? undefined }));

  const weekWorkoutCount = workouts.filter(
    w => !["rest","recovery"].some(k => (w.type ?? "").toLowerCase().includes(k))
  ).length;

  let weekStatus: Record<string, DayStatus> = {};
  let todayActivityName: string | null = null;
  let todayActivityDurationMin: number | null = null;
  let todayAvgHr: number | null = null;

  try {
    const cookieId = cookieStore.get("zwift_intervals_id")?.value;
    const icuKey = cookieKey ?? earlyKvCreds?.icuKey;
    const icuId  = cookieId  ?? earlyKvCreds?.icuId;

    // Fetch both ICU and Zwift direct (same as Today page) for complete detection
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
        const d = a.start_date_local?.slice(0, 10) ?? "";
        return d >= weekDates[0] && d <= weekDates[6];
      });

    const activities = mergeActivities(
      icuActivities as import("@/lib/intervals").IcuActivity[],
      zwiftAsIcu,
    );
    weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);

    const todayAct = activities.find(a => (a.start_date_local ?? "").slice(0, 10) === todayStr);
    if (todayAct) {
      todayActivityName = todayAct.name ?? null;
      todayActivityDurationMin = todayAct.moving_time ? Math.round(todayAct.moving_time / 60) : null;
      todayAvgHr = todayAct.average_heartrate ?? null;
    }
  } catch { /* best-effort */ }

  const isBonus = weekStatus[todayStr] === "bonus";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--m-bg)", overflow: "hidden" }}>
      {/* Small in-content coach title (main header is in layout TabletTopBar) */}
      <div style={{ padding:"14px 28px 10px", borderBottom:"1px solid var(--m-border)", background:"var(--m-card)", flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"var(--m-muted)", textTransform:"uppercase", letterSpacing:".12em" }}>AI Coach</div>
        <div style={{ fontSize:14, color:"var(--m-muted)", marginTop:2, fontWeight:500 }}>Training insights & plan generation</div>
      </div>

      {/* Body: chat on left, week sidebar on right */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Chat area */}
        <div style={{ flex: 1, overflow: "hidden", padding: "0 28px" }}>
          <CoachChat firstName={firstName} />
        </div>

        {/* Week sidebar — full parity with Today page */}
        <TabletWeekSidebar
          ftp={ftp}
          currentPhase={currentPhase}
          weekDisplayNum={weekDisplayNum}
          workouts={workouts}
          weekStatus={weekStatus}
          todayStr={todayStr}
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
