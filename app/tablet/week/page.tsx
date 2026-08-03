/**
 * Tablet — Week view
 * Reuses the mobile WeekView client component (already built and tested).
 * The tablet shell (sidebar + layout) is provided by app/tablet/layout.tsx.
 *
 * Supports ?week=YYYY-MM-DD query param so the user can browse
 * current / next / week-after-next.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getRiderIdentity, getStoredAthleteState } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile, fetchActivities } from "@/lib/zwift";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import WeekView from "@/app/m/week/week-view";
import { TabletWeekSidebar } from "../tablet-week-sidebar";
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(weekOf: string): string {
  const monday = new Date(weekOf + "T00:00:00Z");
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default async function TabletWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = String(session.athleteId);

  // ── Week selection (bounded: current / next / week-after-next) ──────────
  const currentWeek    = mondayOfCurrentWeek();
  const nextWeek       = addDays(currentWeek, 7);
  const weekAfterNext  = addDays(currentWeek, 14);

  const params  = await searchParams;
  const requested = params.week ?? "";
  const weekOf  = (requested === nextWeek || requested === weekAfterNext)
    ? requested
    : currentWeek;

  const isCurrentWeek = weekOf === currentWeek;

  const prevWeekHref = isCurrentWeek
    ? null
    : weekOf === nextWeek
    ? `/tablet/week`
    : `/tablet/week?week=${nextWeek}`;

  const nextWeekHref = weekOf === currentWeek
    ? `/tablet/week?week=${nextWeek}`
    : weekOf === nextWeek
    ? `/tablet/week?week=${weekAfterNext}`
    : null;

  // ── Data fetch ──────────────────────────────────────────────────────────
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

  const ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const today    = new Date().toISOString().slice(0, 10);

  const monday = new Date(weekOf + "T00:00:00Z");
  const weekDates = ALL_DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const dateMap: Record<string, string> = {};
  ALL_DAYS.forEach((d, i) => { dateMap[d] = weekDates[i]; });

  const workouts = plan?.workouts ?? [];
  const workoutsWithDates = workouts.map(w => ({ ...w, date: w.date ?? dateMap[w.day] }));

  const weekWorkoutCount = workoutsWithDates.filter(
    (w: WeeklyWorkout) => !["rest","recovery"].some(k => (w.type ?? "").toLowerCase().includes(k))
  ).length;

  // ── Activity fetch (current week only — future weeks have no rides) ─────
  let weekStatus: Record<string, DayStatus> = {};
  let bonusActivities: Record<string, import("@/app/m/week/week-view").BonusActivityInfo> = {};
  let todayActivityName: string | null = null;
  let todayActivityDurationMin: number | null = null;
  let todayAvgHr: number | null = null;

  if (isCurrentWeek) {
    try {
      const icuKey = cookieKey ?? kvCreds?.icuKey;
      const icuId  = cookieId  ?? kvCreds?.icuId;

      const [icuActivities, zwiftRaw] = await Promise.all([
        (icuKey && icuId)
          ? Promise.race([
              fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
              new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
            ]).catch(async (e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
                const { kvSet } = await import("@/lib/kv");
                kvSet(`zwift:${athleteId}:icu_invalid`, "1", 24 * 60 * 60).catch(() => {});
              }
              return [];
            })
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
      for (const a of activities) {
        const d = (a.start_date_local ?? "").slice(0, 10);
        if (weekStatus[d] === "bonus") {
          bonusActivities[d] = {
            durationMin: a.moving_time ? Math.round(a.moving_time / 60) : undefined,
            avgPower: a.average_watts ?? undefined,
            normalizedPower: a.normalized_power ?? undefined,
            avgHr: a.average_heartrate ?? undefined,
            tss: a.icu_training_load ?? undefined,
            distanceKm: a.distance ? Math.round(a.distance / 100) / 10 : undefined,
            sport: a.type ?? undefined,
          };
        }
      }

      const todayAct = activities.find(a => (a.start_date_local ?? "").slice(0, 10) === today);
      if (todayAct) {
        todayActivityName = todayAct.name ?? null;
        todayActivityDurationMin = todayAct.moving_time ? Math.round(todayAct.moving_time / 60) : null;
        todayAvgHr = todayAct.average_heartrate ?? null;
      }
    } catch { /* best-effort */ }
  }

  const isBonus = weekStatus[today] === "bonus";

  const weekLabel = isCurrentWeek ? "This week" : "Next week";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--m-bg)", overflow: "hidden" }}>
      {/* In-content week title */}
      <div style={{ padding: "14px 28px 10px", borderBottom: "1px solid var(--m-border)", background: "var(--m-card)", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".12em" }}>
          {weekLabel}
        </div>
        <div style={{ fontSize: 14, color: "var(--m-muted)", marginTop: 2, fontWeight: 500 }}>
          {formatWeekRange(weekOf)}
        </div>
      </div>

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
            bonusActivities={bonusActivities}
            prevWeekHref={prevWeekHref}
            nextWeekHref={nextWeekHref}
            isCurrentWeek={isCurrentWeek}
            hideNav={false}
          />
        </div>

        <TabletWeekSidebar
          ftp={ftp}
          currentPhase={currentPhase}
          weekDisplayNum={weekDisplayNum}
          workouts={workoutsWithDates}
          weekStatus={weekStatus}
          bonusActivities={bonusActivities}
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
