/**
 * Tablet — Coach tab
 * Left: CoachChat (AI Q&A). Right: Week sidebar (same as Today page).
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { fetchOwnProfile } from "@/lib/zwift";
import {
  getRiderIdentity,
  getCachedPlan,
  getStoredAthleteState,
  getIntervalsCredentials,
} from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { computeWeekStatus } from "@/lib/activity-sync";
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";
import { TabletPageHeader } from "../tablet-page-header";
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

  const todayStr  = new Date().toISOString().slice(0, 10);
  const weekDates = weekDatesFrom(weekOf);
  const dateMap   = buildDateMap(weekOf);
  const workouts: WeeklyWorkout[] = (plan?.workouts ?? []).map(w => ({ ...w, date: w.date ?? dateMap[w.day] ?? undefined }));

  let weekStatus: Record<string, DayStatus> = {};
  try {
    const cookieId = cookieStore.get("zwift_intervals_id")?.value;
    const icuKey = cookieKey ?? earlyKvCreds?.icuKey;
    const icuId  = cookieId  ?? earlyKvCreds?.icuId;
    if (icuKey && icuId) {
      const activities = await Promise.race([
        fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
      ]);
      weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);
    }
  } catch { /* best-effort */ }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--m-bg)", overflow: "hidden" }}>
      <TabletPageHeader
        section="AI Coach"
        name={firstName}
        subtitle="Training insights & plan generation"
      />

      {/* Body: chat on left, week sidebar on right */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Chat area */}
        <div style={{ flex: 1, overflow: "hidden", padding: "0 28px" }}>
          <CoachChat firstName={firstName} />
        </div>

        {/* Week sidebar — same as Today page */}
        <TabletWeekSidebar
          ftp={ftp}
          currentPhase={currentPhase}
          workouts={workouts}
          weekStatus={weekStatus}
          todayStr={todayStr}
          planSummary={plan?.summary ?? null}
        />
      </div>
    </div>
  );
}
