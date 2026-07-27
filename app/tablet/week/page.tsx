/**
 * Tablet — Week view
 * Reuses the mobile WeekView client component (already built and tested).
 * The tablet shell (sidebar + layout) is provided by app/tablet/layout.tsx.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getRiderIdentity } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { computeWeekStatus } from "@/lib/activity-sync";
import WeekView from "@/app/m/week/week-view";
import { TabletPageHeader } from "../tablet-page-header";

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

  const [plan, kvCreds, zwiftProfile, cachedIdentity] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKey ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
  ]);
  const firstName = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;

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

  let weekStatus: Record<string,string> = {};
  try {
    const icuKey = cookieKey ?? kvCreds?.icuKey;
    const icuId  = cookieId  ?? kvCreds?.icuId;
    if (icuKey && icuId) {
      const activities = await Promise.race([
        fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
      ]);
      weekStatus = computeWeekStatus(workoutsWithDates, activities, today, weekDates);
    }
  } catch { /* best-effort */ }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--m-bg)", overflow: "hidden" }}>
      <TabletPageHeader
        section="This week"
        name={firstName}
        subtitle={formatWeekRange(weekOf)}
      />
      <div style={{ flex: 1, overflowY: "auto", padding: "28px" }}>
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
        />
      </div>
    </div>
  );
}
