import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getRiderIdentity } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import { fetchActivities, fetchOwnProfile } from "@/lib/zwift";
import WeekView from "./week-view";

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildDateMap(weekOf: string): Record<string, string> {
  const monday = new Date(weekOf + "T00:00:00Z");
  const dayMap: Record<string, string> = {};
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].forEach((name, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dayMap[name] = d.toISOString().slice(0, 10);
  });
  return dayMap;
}

function weekDatesFrom(weekOf: string): string[] {
  const monday = new Date(weekOf + "T00:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function formatWeekRange(weekOf: string): string {
  const monday = new Date(weekOf + "T12:00:00Z");
  const sunday = new Date(weekOf + "T12:00:00Z");
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default async function MobileWeekPage({
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
  const currentWeek = mondayOfCurrentWeek();
  const nextWeek    = addDays(currentWeek, 7);
  const weekAfterNext = addDays(currentWeek, 14);

  // Only allow current week or next week (no arbitrary dates)
  const params = await searchParams;
  const requested = params.week ?? "";
  const weekOf = requested === nextWeek || requested === weekAfterNext
    ? requested
    : currentWeek;

  const prevWeekHref = weekOf === currentWeek ? null : `/m/week`;
  const nextWeekHref = weekOf === currentWeek
    ? `/m/week?week=${nextWeek}`
    : weekOf === nextWeek
    ? `/m/week?week=${weekAfterNext}`
    : null;

  const isCurrentWeek = weekOf === currentWeek;

  // Parallel: plan + credentials + athlete name
  const cookieKeyEarly = cookieStore.get("zwift_intervals_key")?.value;
  const [plan, earlyKvCreds, zwiftProfile, cachedIdentity] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKeyEarly ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
  ]);
  const firstName = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateMap = buildDateMap(weekOf);
  const weekDates = weekDatesFrom(weekOf);

  const workouts = (plan?.workouts ?? []).map(w => ({
    ...w,
    date: w.date ?? dateMap[w.day] ?? undefined,
  }));

  // Fetch activities — ICU + Zwift direct merge (current week only; future weeks have no rides)
  let weekStatus: Record<string, string> = {};
  if (isCurrentWeek) {
    try {
      const cookieKey = cookieStore.get("zwift_intervals_key")?.value;
      const cookieId  = cookieStore.get("zwift_intervals_id")?.value;
      const icuKey = cookieKey ?? earlyKvCreds?.icuKey;
      const icuId  = cookieId  ?? earlyKvCreds?.icuId;

      const [icuActivities, zwiftRaw] = await Promise.all([
        (icuKey && icuId)
          ? Promise.race([
              fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error("icu_timeout")), 4000)),
            ]).catch(() => [])
          : Promise.resolve([]),
        Promise.race([
          fetchActivities(session.accessToken, session.athleteId!, 50),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("zwift_timeout")), 5000)),
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
      weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);
    } catch { /* best-effort */ }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Pinned name header */}
      <div style={{
        flexShrink: 0,
        padding: "16px 16px 14px",
        background: "var(--m-card)",
        borderBottom: "1px solid var(--m-border)",
      }}>
        <div style={{ fontSize: 12, color: "var(--m-muted)", fontWeight: 500, letterSpacing: ".3px", textTransform: "uppercase", marginBottom: 4 }}>
          This week
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-.6px" }}>
          {firstName ?? "Athlete"}
        </div>
      </div>

      {/* Scrollable week view */}
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>
        <WeekView
          workouts={workouts}
          weekOf={weekOf}
          weekRange={formatWeekRange(weekOf)}
          today={todayStr}
          summary={plan?.summary ?? null}
          weekStatus={weekStatus}
          prevWeekHref={prevWeekHref}
          nextWeekHref={nextWeekHref}
          isCurrentWeek={isCurrentWeek}
        />
      </div>
    </div>
  );
}
