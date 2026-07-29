import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchOwnProfile } from "@/lib/zwift";
import { getCachedPlan, getIntervalsCredentials } from "@/lib/kv-plan-state";
import { fetchIcuActivities } from "@/lib/intervals";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import WeeklyPlan from "./weekly-plan";
import AiInsights from "./ai-insights";
import HRAlertBanner from "./hr-alert-banner";

/**
 * Coach page (default dashboard route, "/dashboard") - the daily "what do I
 * ride today" view: Today's Note + this week's workout cards (both inside
 * WeeklyPlan) and the coach-message area (AiInsights, plus the session
 * feedback chat inside WeeklyPlan). Deliberately NO statistics here - see
 * app/dashboard/stats/page.tsx for Power/Cadence, Fitness, Personal Bests,
 * and ride history. Shared header/auth lives in app/dashboard/layout.tsx.
 */
export default async function CoachPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login");

  const session = await decryptSession(raw);
  if (!session) redirect("/login");

  const athleteId = session.athleteId;
  const todayStr  = new Date().toISOString().slice(0, 10);
  const weekOf    = mondayOfCurrentWeek();

  // Fetch today's actual activity (ICU + Zwift) to detect bonus rides server-side.
  // This avoids the desktop client-side cache delay that caused bonus rides not
  // to appear on the home page until the async fetch completed.
  let todayStatus: "rest" | "bonus" | "planned" | "completed" | "missed" | "extra" = "planned";
  let todayActivityName: string | null = null;
  let todayActivityDurationMin: number | null = null;
  let todayAvgHr: number | null = null;
  let hasRides = false;

  try {
    // Week date range for activity fetch
    const monday = new Date(weekOf + "T00:00:00Z");
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });

    // ICU credentials (cookie or KV)
    const cookieKey = cookieStore.get("zwift_intervals_key")?.value;
    const cookieId  = cookieStore.get("zwift_intervals_id")?.value;
    const kvCreds = cookieKey ? null : (athleteId ? await getIntervalsCredentials(athleteId) : null);
    const icuKey = cookieKey ?? kvCreds?.icuKey;
    const icuId  = cookieId  ?? kvCreds?.icuId;

    // Parallel: plan + activities
    const [plan, zwiftRaw, icuActivities] = await Promise.all([
      athleteId ? getCachedPlan(athleteId, weekOf) : Promise.resolve(null),
      Promise.race([
        fetchActivities(session.accessToken, athleteId ?? "", 50),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 5000)),
      ]).catch(() => [] as Awaited<ReturnType<typeof fetchActivities>>),
      (icuKey && icuId)
        ? Promise.race([
            fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
            new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
          ]).catch(() => [])
        : Promise.resolve([]),
    ]);

    hasRides = zwiftRaw.length > 0;

    // Build date-keyed workouts from plan
    const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const dateMap: Record<string,string> = {};
    DAY_NAMES.forEach((d, i) => { dateMap[d] = weekDates[i]; });
    const workouts = (plan?.workouts ?? []).map(w => ({
      ...w,
      date: w.date ?? dateMap[w.day] ?? undefined,
    }));

    // Merge activities and compute status
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
    const weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);
    todayStatus = weekStatus[todayStr] ?? "planned";

    // Find today's activity details for the banner
    const todayAct = activities.find(a => (a.start_date_local ?? "").slice(0, 10) === todayStr);
    if (todayAct) {
      todayActivityName = todayAct.name ?? null;
      todayActivityDurationMin = todayAct.moving_time ? Math.round(todayAct.moving_time / 60) : null;
      todayAvgHr = todayAct.average_heartrate ?? null;
    }
  } catch (e) {
    // best-effort — never crash the page
    try {
      // Still check if athlete has any rides at all
      const acts = athleteId
        ? await fetchActivities(session.accessToken, athleteId, 1).catch(() => [])
        : [];
      hasRides = acts.length > 0;
    } catch {}
  }

  if (!hasRides) {
    return (
      <div className="section fade-in">
        <div className="notice">
          No rides yet — once you&apos;ve logged at least one ride on Zwift, your AI coach will build your first weekly plan here automatically.
        </div>
      </div>
    );
  }

  return (
    <>
      <HRAlertBanner />
      {/* Server-rendered bonus-ride / done banner — shows immediately, no
          client-side cache delay. Visible whenever today's status is known
          from ICU/Zwift data at render time. */}
      {(todayStatus === "bonus" || todayStatus === "completed") && (
        <div className="fade-in" style={{
          margin: "0 0 20px",
          padding: "14px 20px",
          borderRadius: 10,
          background: todayStatus === "bonus"
            ? "rgba(245,158,11,0.08)"
            : "rgba(34,197,94,0.08)",
          border: `1px solid ${todayStatus === "bonus" ? "rgba(245,158,11,0.28)" : "rgba(34,197,94,0.28)"}`,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <span style={{ fontSize: 24 }}>{todayStatus === "bonus" ? "🚴" : "✓"}</span>
          <div>
            <div style={{
              fontSize: 15, fontWeight: 800,
              color: todayStatus === "bonus" ? "#92400e" : "#15803d",
            }}>
              {todayStatus === "bonus"
                ? `Bonus ride today${todayActivityName ? ` · ${todayActivityName}` : ""}`
                : `Today's workout done${todayActivityName ? ` · ${todayActivityName}` : ""}`}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
              {[
                todayActivityDurationMin ? `${todayActivityDurationMin} min` : null,
                todayAvgHr ? `${Math.round(todayAvgHr)} bpm avg` : null,
              ].filter(Boolean).join(" · ") || (
                todayStatus === "bonus"
                  ? "Great job getting in an extra session on your rest day."
                  : "Your coach will factor this into the plan."
              )}
            </div>
          </div>
        </div>
      )}
      <div className="section fade-in" id="weekly-plan" style={{ scrollMarginTop: 24 }}>
        <WeeklyPlan />
      </div>
      <div className="section fade-in" id="ai-insights" style={{ scrollMarginTop: 24 }}>
        <AiInsights />
      </div>
    </>
  );
}
