import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState, getRiderIdentity } from "@/lib/kv-plan-state";
import { kvGet } from "@/lib/kv";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile, fetchActivities } from "@/lib/zwift";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";
import { WeekDayListClient, type DayRowData, type RideSummary, type WeekNavData } from "./week-sidebar-client";

const ZO = "#FF5A1F";

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const ALL_DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

/** Returns a new weekOf date shifted by n weeks */
function addWeeks(weekOf: string, n: number): string {
  const d = new Date(weekOf + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

/** "2026-08-03" → "Aug 3 – 9" */
function weekLabel(weekOf: string): string {
  const monday = new Date(weekOf + "T00:00:00Z");
  const sunday = new Date(weekOf + "T00:00:00Z");
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

/** Inline stat chip for the "actual ride" section */
function ActualRideChip({ label, value, color = "var(--m-text)" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
      borderRadius: 8, padding: "10px 14px", textAlign: "center", minWidth: 80,
    }}>
      <div style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>{label}</div>
    </div>
  );
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

function weekDatesFrom(weekOf: string): string[] {
  const monday = new Date(weekOf + "T00:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function detectZoneColor(w: WeeklyWorkout): string {
  const t = (w.title + " " + (w.type ?? "")).toLowerCase();
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "#10b981";
  if (t.includes("threshold") || t.includes("ftp"))         return "#FF5A1F";
  if (t.includes("vo2") || t.includes("norwegian"))         return "#ef4444";
  if (t.includes("tempo"))                                   return "#3b82f6";
  if (t.includes("sprint") || t.includes("neuromuscular"))  return "#a855f7";
  if (t.includes("endurance") || t.includes("z2"))          return "#22d3ee";
  return ZO;
}

function detectZoneLabel(w: WeeklyWorkout): string {
  const t = (w.title + " " + (w.type ?? "")).toLowerCase();
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "Sweet Spot";
  if (t.includes("threshold") || t.includes("ftp"))        return "Threshold";
  if (t.includes("vo2") || t.includes("norwegian"))        return "VO2max";
  if (t.includes("tempo"))                                  return "Tempo";
  if (t.includes("sprint") || t.includes("neuromuscular")) return "Neuromuscular";
  if (t.includes("endurance") || t.includes("z2"))         return "Endurance";
  return "Structured";
}

function blockColor(pct: number): string {
  if (pct >= 120) return "#ef4444";
  if (pct >= 106) return "#f97316";
  if (pct >= 95)  return "#f59e0b";
  if (pct >= 88)  return "#10b981";
  if (pct >= 76)  return "#22d3ee";
  if (pct >= 56)  return "#3b82f6";
  return "#64748b";
}

export default async function TabletTodayPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>> | Record<string, string>;
}) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = String(session.athleteId);
  const currentWeekOf = mondayOfCurrentWeek();
  const cookieKey = cookieStore.get("zwift_intervals_key")?.value;

  // Support ?week=YYYY-MM-DD for viewing other weeks in the sidebar
  const params = searchParams instanceof Promise ? await searchParams : (searchParams ?? {});
  const weekParam = typeof params?.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : null;
  // sidebarWeekOf: the week shown in the sidebar (may differ from current)
  // For the main panel (today's workout), we always use currentWeekOf.
  const sidebarWeekOf = weekParam ?? currentWeekOf;
  const isCurrentWeek = sidebarWeekOf === currentWeekOf;

  // weekOf in the rest of the file refers to the SIDEBAR week (for plan/date lookups).
  // todayWorkout + todayStatus always use currentWeekOf for the main panel.
  const weekOf = sidebarWeekOf;

  const [sidebarPlan, currentPlan, earlyKvCreds, zwiftProfile, athleteState, cachedIdentity, trainingLoadRaw] = await Promise.all([
    getCachedPlan(athleteId, sidebarWeekOf),
    isCurrentWeek ? Promise.resolve(null) : getCachedPlan(athleteId, currentWeekOf),
    cookieKey ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getStoredAthleteState(athleteId).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
    kvGet(`zwift:${athleteId}:training_load`).catch(() => null),
  ]);
  let ctl: number | null = null, atl: number | null = null, tsb: number | null = null;
  try {
    if (trainingLoadRaw) {
      const tl = JSON.parse(trainingLoadRaw) as Record<string, unknown>;
      ctl = typeof tl.ctl === "number" ? Math.round(tl.ctl) : null;
      atl = typeof tl.atl === "number" ? Math.round(tl.atl) : null;
      tsb = typeof tl.tsb === "number" ? Math.round(tl.tsb) : null;
    }
  } catch { /* best-effort */ }
  // plan = the sidebar week's plan; todayPlan = current week's plan for the main panel
  const plan = sidebarPlan;
  const todayPlan = isCurrentWeek ? sidebarPlan : currentPlan;

  const todayDate    = new Date();
  const todayStr     = todayDate.toISOString().slice(0, 10);
  const todayDayName = DAY_NAMES[todayDate.getDay()];
  const dateMap      = buildDateMap(weekOf);
  const weekDates    = weekDatesFrom(weekOf);

  // sidebarWorkouts: for the RIGHT panel (selected week)
  const workouts = (plan?.workouts ?? []).map(w => ({ ...w, date: w.date ?? dateMap[w.day] ?? undefined }));
  // todayWorkouts: for the LEFT panel (always current week)
  const todayPlanWorkouts = isCurrentWeek
    ? workouts
    : (todayPlan?.workouts ?? []).map(w => ({ ...w, date: w.date ?? buildDateMap(currentWeekOf)[w.day] ?? undefined }));

  let weekStatus: Record<string, DayStatus> = {};
  let allActivities: import("@/lib/intervals").IcuActivity[] = [];
  let todayAvgHr: number | null = null;
  let todayActivityName: string | null = null;
  let todayActivityDurationMin: number | null = null;
  try {
    const cookieId = cookieStore.get("zwift_intervals_id")?.value;
    const icuKey = cookieKey ?? earlyKvCreds?.icuKey;
    const icuId  = cookieId  ?? earlyKvCreds?.icuId;

    // Fetch both ICU and Zwift directly (same as mobile today page).
    // ICU may lag behind real-time; Zwift direct ensures rides show as "Done"
    // immediately without waiting for the ICU sync to run.
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
      .filter((a: { start_date_local: string }) => {
        const d = a.start_date_local.slice(0, 10);
        return d >= weekDates[0] && d <= weekDates[6];
      });

    const activities = mergeActivities(
      icuActivities as import("@/lib/intervals").IcuActivity[],
      zwiftAsIcu,
    );
    allActivities = activities;
    // weekStatus is computed from the SIDEBAR week's workouts (for the sidebar dots)
    weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);

    // Extract today's activity for bonus ride display (always from current week)
    const todayActivity = activities.find(a => a.start_date_local?.slice(0, 10) === todayStr);
    if (todayActivity) {
      todayAvgHr = todayActivity.average_heartrate ?? null;
      todayActivityName = todayActivity.name ?? null;
      todayActivityDurationMin = todayActivity.moving_time
        ? Math.round(todayActivity.moving_time / 60) : null;
    }
  } catch { /* best-effort */ }

  // todayStatus and todayWorkout always use CURRENT WEEK (main panel)
  const todayStatus: DayStatus = weekStatus[todayStr] ?? "planned";
  const todayWorkout =
    todayPlanWorkouts.find(w => w.date === todayStr) ??
    todayPlanWorkouts.find(w => w.day === todayDayName) ??
    null;

  const firstName    = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;
  const ftp          = zwiftProfile?.ftp ?? cachedIdentity?.ftp ?? null;
  const macro        = (athleteState as { macroCycle?: { weekIndex: number } } | null)?.macroCycle ?? null;
  const currentPhase = macro
    ? (macro.weekIndex === 0 ? "Base" : macro.weekIndex % 4 === 3 ? "Recovery" : "Build")
    : null;

  const utcHour   = todayDate.getUTCHours();
  const localHour = (utcHour + 3) % 24;
  const greeting  = localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = todayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Jerusalem" });

  const isBonus    = todayStatus === "bonus";
  const isRest     = !isBonus && (!todayWorkout || ["rest","recovery"].some(k => (todayWorkout.type ?? "").toLowerCase().includes(k)));
  const zoneColor  = !isRest && !isBonus && todayWorkout ? detectZoneColor(todayWorkout) : isBonus ? "#f59e0b" : "#64748b";
  const zoneLabel  = !isRest && !isBonus && todayWorkout ? detectZoneLabel(todayWorkout) : isBonus ? "Bonus Ride" : "";
  const statusLabel = todayStatus === "completed" ? "Done ✓" : todayStatus === "missed" ? "Missed" : todayStatus === "bonus" ? "Bonus 🚴" : "Planned";
  const statusColor = todayStatus === "completed" ? "#22c55e" : todayStatus === "missed" ? "#ef4444" : todayStatus === "bonus" ? "#f59e0b" : "#94a3b8";
  const weekWorkoutCount = workouts.filter(
    w => !["rest","recovery"].some(k => (w.type ?? "").toLowerCase().includes(k))
  ).length;
  const weekDisplayNum = macro ? macro.weekIndex + 1 : null;

  // Build serializable ride summaries for completed days
  const completedRides: Record<string, RideSummary> = {};
  for (const a of allActivities) {
    const date = a.start_date_local?.slice(0, 10);
    if (date) {
      completedRides[date] = {
        name: (a.name as string) ?? "Ride",
        date,
        durationMin: a.moving_time ? Math.round((a.moving_time as number) / 60) : 0,
        avgWatts: (a.average_watts as number | null) ?? null,
        normalizedPower: (a.normalized_power as number | null) ?? null,
        avgHr: (a.average_heartrate as number | null) ?? null,
        maxHr: (a["max_heartrate"] as number | null) ?? null,
        tss: (a.icu_training_load as number | null) ?? null,
        distanceKm: a.distance ? Math.round((a.distance as number) / 100) / 10 : null,
      };
    }
  }

  // Actual ride data for today (from ICU/Zwift activities)
  const todayActualRide: RideSummary | null = completedRides[todayStr] ?? null;

  // Build day rows for the sidebar (uses sidebarWeekOf's workouts)
  const sidebarDateMap = isCurrentWeek ? dateMap : buildDateMap(sidebarWeekOf);
  const sidebarWeekDates = isCurrentWeek ? weekDates : weekDatesFrom(sidebarWeekOf);
  const sidebarWorkoutsWithDates = isCurrentWeek
    ? workouts
    : (plan?.workouts ?? []).map(w => ({ ...w, date: w.date ?? sidebarDateMap[w.day] ?? undefined }));

  const dayRows: DayRowData[] = ALL_DAYS.map(dayName => {
    const w        = sidebarWorkoutsWithDates.find(x => x.day === dayName);
    const isRest   = !w || ["rest","recovery"].some(k => (w.type ?? "").toLowerCase().includes(k));
    // Use sidebar week's date for the row
    const dateStr  = w?.date ?? sidebarDateMap[dayName];
    const dateNum  = dateStr ? new Date(dateStr + "T12:00:00").getDate() : undefined;
    // isToday: only highlight if we're viewing current week AND this is today
    const isToday  = isCurrentWeek && dateStr === todayStr;
    const dayStatus = dateStr ? (weekStatus[dateStr] as DayStatus | undefined) : undefined;
    const rowColor  = !isRest && w ? detectZoneColor(w) : undefined;
    const rowLabel  = !isRest && w ? detectZoneLabel(w) : undefined;
    return {
      dayName,
      date: dateStr,
      dateNum,
      isToday,
      isRest: !w ? true : isRest,
      workoutTitle: !isRest && w ? w.title : undefined,
      zoneLabel: rowLabel,
      zoneColor: rowColor,
      durationMin: !isRest && w ? w.durationMin : undefined,
      status: isCurrentWeek ? dayStatus : (dateStr ? (sidebarWeekDates.includes(dateStr) ? "planned" : undefined) : undefined),
      ride: isCurrentWeek && dayStatus === "completed" && dateStr ? completedRides[dateStr] : undefined,
    };
  });

  // Week navigation data for the sidebar
  const weekNav: WeekNavData = {
    prevWeekUrl: `/tablet/today?week=${addWeeks(sidebarWeekOf, -1)}`,
    nextWeekUrl: `/tablet/today?week=${addWeeks(sidebarWeekOf, 1)}`,
    currentWeekUrl: `/tablet/today`,
    weekLabel: weekLabel(sidebarWeekOf),
    isCurrentWeek,
    hasPlan: (plan?.workouts?.length ?? 0) > 0,
  };

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "var(--m-bg)", color: "var(--m-text)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      overflow: "hidden",
    }}>

      {/* ── BODY ────────────────────────────────────────────────────────── */}
      {/* No per-page header — the full-width TabletTopBar in layout.tsx shows
          greeting, name, connection icons, and fitness chips for all tablet pages. */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT: Today workout */}
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "32px 40px" }}>

          {/* ── WORKOUT CONTENT ──────────────────────────────────────────── */}
          {isRest || (!todayWorkout && !isBonus) ? (
            /* ── REST DAY ─────────────────────────────────────────────── */
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 20 }}>
                Today&apos;s session
              </div>
              <div style={{
                background: "var(--m-card)", border: "1px solid var(--m-border)",
                borderRadius: 4, padding: "40px 36px",
                display: "flex", alignItems: "center", gap: 28,
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 4, flexShrink: 0,
                  background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
                }}>🌙</div>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1px", lineHeight: 1, marginBottom: 10 }}>
                    Rest Day
                  </div>
                  <div style={{ fontSize: 18, color: "var(--m-muted)", lineHeight: 1.6, maxWidth: 420 }}>
                    Recovery is where adaptation happens. No training today — this is the work.
                  </div>
                </div>
              </div>
            </div>
          ) : isBonus ? (
            /* ── BONUS RIDE ─────────────────────────────────────────────── */
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em" }}>
                  Today&apos;s session
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 800, color: "#92400e",
                  background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)",
                  borderRadius: 4, padding: "3px 10px",
                }}>🚴 Bonus ride</span>
                <span style={{ fontSize: 13, color: "var(--m-muted)", fontWeight: 500 }}>Rest day planned</span>
              </div>

              {/* Bonus ride card */}
              <div style={{
                background: "var(--m-card)", border: "1px solid var(--m-border)",
                borderLeft: "4px solid #f59e0b",
                borderRadius: 4, padding: "28px 32px", marginBottom: 16,
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
                  borderRadius: 3, padding: "3px 10px", marginBottom: 14,
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b" }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: ".1em" }}>Bonus Ride</span>
                </div>

                <h1 style={{ margin: "0 0 16px", fontSize: 36, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1px", lineHeight: 1.1 }}>
                  {todayActivityName ?? "Bonus ride"}
                </h1>

                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {todayActivityDurationMin && todayActivityDurationMin > 0 && (
                    <div style={{
                      background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
                      borderRadius: 4, padding: "12px 20px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "var(--m-text)", lineHeight: 1 }}>{todayActivityDurationMin}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>min</div>
                    </div>
                  )}
                  {todayAvgHr && todayAvgHr > 0 && (
                    <div style={{
                      background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 4, padding: "12px 20px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: "#ef4444", lineHeight: 1 }}>{Math.round(todayAvgHr)}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(239,68,68,0.5)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>bpm avg</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Coach note for bonus */}
              <div style={{
                background: "var(--m-card)", border: "1px solid var(--m-border)",
                borderRadius: 4, padding: "20px 24px",
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
                  Note
                </div>
                <div style={{ fontSize: 16, color: "var(--m-muted)", lineHeight: 1.65 }}>
                  Great work getting an extra session in on your rest day. Your coach will factor this into next week&apos;s load.
                </div>
              </div>
            </div>
          ) : (
            /* ── WORKOUT ──────────────────────────────────────────────── */
            <div>
              {/* Section label + status */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em" }}>
                  Today&apos;s session
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: statusColor,
                  background: `${statusColor}14`, border: `1px solid ${statusColor}30`,
                  borderRadius: 3, padding: "4px 10px",
                }}>
                  {statusLabel}
                </div>
              </div>

              {/* Main workout card */}
              <div style={{
                background: "var(--m-card)", border: "1px solid var(--m-border)",
                borderLeft: `4px solid ${zoneColor}`,
                borderRadius: 4, padding: "28px 32px", marginBottom: 16,
              }}>
                {/* Zone badge */}
                {zoneLabel && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: `${zoneColor}12`, border: `1px solid ${zoneColor}25`,
                    borderRadius: 3, padding: "3px 10px", marginBottom: 14,
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: zoneColor }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: zoneColor, textTransform: "uppercase", letterSpacing: ".1em" }}>{zoneLabel}</span>
                  </div>
                )}

                <h1 style={{ margin: "0 0 12px", fontSize: 42, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1px", lineHeight: 1.1 }}>
                  {todayWorkout.title}
                </h1>

                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  {todayWorkout.durationMin > 0 && (
                    <span style={{ fontSize: 18, fontWeight: 600, color: "var(--m-muted)" }}>
                      {todayWorkout.durationMin} min
                    </span>
                  )}
                  {todayWorkout.targetPowerPctFtp && (
                    <span style={{ fontSize: 17, fontWeight: 700, color: zoneColor }}>
                      {todayWorkout.targetPowerPctFtp}
                    </span>
                  )}
                </div>
              </div>

              {/* Power bar chart */}
              {todayWorkout.structure && todayWorkout.structure.length > 0 && (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderRadius: 4, padding: "20px 24px 16px", marginBottom: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14 }}>
                    Power profile
                  </div>
                  <PowerBarChart blocks={todayWorkout.structure} durationMin={todayWorkout.durationMin} />
                </div>
              )}

              {/* Description */}
              {todayWorkout.description && (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderRadius: 4, padding: "20px 24px", marginBottom: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>
                    Coach note
                  </div>
                  <div style={{ fontSize: 17, color: "var(--m-text)", lineHeight: 1.75 }}>
                    {todayWorkout.description}
                  </div>
                </div>
              )}

              {/* ── Actual ride (when the day is completed) ─────────── */}
              {(todayStatus === "completed" || todayStatus === "extra") && todayActualRide && (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderLeft: "4px solid #22c55e",
                  borderRadius: 4, padding: "20px 24px", marginBottom: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#22c55e", textTransform: "uppercase", letterSpacing: ".1em" }}>
                      Actual ride
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--m-text)", marginBottom: 14, lineHeight: 1.2 }}>
                    {todayActualRide.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {todayActualRide.durationMin > 0 && (
                      <ActualRideChip label="Duration" value={`${todayActualRide.durationMin} min`} />
                    )}
                    {todayActualRide.avgWatts != null && todayActualRide.avgWatts > 0 && (
                      <ActualRideChip label="Avg Power" value={`${Math.round(todayActualRide.avgWatts)}W`} color="#22d3ee" />
                    )}
                    {todayActualRide.normalizedPower != null && todayActualRide.normalizedPower > 0 && (
                      <ActualRideChip label="NP" value={`${Math.round(todayActualRide.normalizedPower)}W`} color="#60a5fa" />
                    )}
                    {todayActualRide.avgHr != null && todayActualRide.avgHr > 0 && (
                      <ActualRideChip label="Avg HR" value={`${Math.round(todayActualRide.avgHr)} bpm`} color="#ef4444" />
                    )}
                    {todayActualRide.tss != null && todayActualRide.tss > 0 && (
                      <ActualRideChip label="TSS" value={Math.round(todayActualRide.tss).toString()} color="#a78bfa" />
                    )}
                    {todayActualRide.distanceKm != null && todayActualRide.distanceKm > 0 && (
                      <ActualRideChip label="Distance" value={`${todayActualRide.distanceKm.toFixed(1)} km`} color="#34d399" />
                    )}
                  </div>
                  {todayStatus === "extra" && (
                    <div style={{ marginTop: 12, fontSize: 13, color: "var(--m-muted)" }}>
                      Different sport than planned — great cross-training!
                    </div>
                  )}
                </div>
              )}

              {/* Session structure */}
              {todayWorkout.structure && todayWorkout.structure.length > 0 && (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderRadius: 4, padding: "20px 24px",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14 }}>
                    Session structure
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {todayWorkout.structure.map((block, i) => {
                      const pct  = Math.round((block.powerFtp ?? 0) * 100);
                      const bc   = blockColor(pct);
                      const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
                      const timeDet = block.type === "intervals" && block.onSec
                        ? `${Math.round(block.onSec / 60)}/${Math.round((block.offSec ?? 0) / 60)} min`
                        : "";
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "11px 14px",
                          background: "var(--m-card-inner)",
                          border: "1px solid var(--m-border)",
                          borderLeft: `3px solid ${bc}`,
                          borderRadius: 4,
                        }}>
                          <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: "var(--m-text)" }}>
                            {reps && <span style={{ color: bc, marginRight: 5, fontWeight: 800 }}>{reps}</span>}
                            {block.label || block.type}
                            {timeDet && <span style={{ color: "var(--m-muted)", fontSize: 15, marginLeft: 8 }}>{timeDet}</span>}
                          </div>
                          <span style={{ fontSize: 15, color: "var(--m-muted)", flexShrink: 0 }}>{block.durationMin ?? 0} min</span>
                          {pct > 0 && (
                            <span style={{
                              fontSize: 13, fontWeight: 800, color: bc,
                              background: `${bc}12`, border: `1px solid ${bc}25`,
                              padding: "2px 8px", borderRadius: 3, flexShrink: 0,
                            }}>
                              {pct}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Legal footer */}
          <div style={{
            marginTop: 40, paddingTop: 20,
            borderTop: "1px solid var(--m-border)",
            display: "flex", alignItems: "center", gap: 20,
          }}>
            <a href="/m/legal/terms" style={{ fontSize: 14, color: "var(--m-muted)", textDecoration: "none", fontWeight: 500 }}>Terms of Service</a>
            <span style={{ color: "var(--m-border)" }}>·</span>
            <a href="/m/legal/privacy" style={{ fontSize: 14, color: "var(--m-muted)", textDecoration: "none", fontWeight: 500 }}>Privacy Policy</a>
            <span style={{ color: "var(--m-border)" }}>·</span>
            <span style={{ fontSize: 14, color: "var(--m-muted)", fontWeight: 500 }}>© 2025 Volt AI</span>
          </div>
        </div>

        {/* RIGHT: Week panel ─────────────────────────────────────────── */}
        <div style={{
          width: 280, flexShrink: 0,
          borderLeft: "1px solid var(--m-border)",
          background: "var(--m-card)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          display: "flex", flexDirection: "column",
        }}>
          {/* FITNESS METRICS — sticky, monochromatic. FTP/Phase/Sessions live in the top bar; only CTL/ATL/TSB here. */}
          <div style={{
            padding: "24px 20px", borderBottom: "1px solid var(--m-border)",
            position: "sticky", top: 0, zIndex: 10,
            background: "var(--m-card)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 14 }}>
              Fitness metrics
            </div>
            {/* CTL / ATL / TSB — monochromatic cards, only TSB keeps red/green as a meaningful signal */}
            {(ctl != null || atl != null || tsb != null) && (
              <div style={{ display: "flex", gap: 8 }}>
                {ctl != null && (
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--m-border)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--m-text)", lineHeight: 1 }}>{ctl}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>CTL</div>
                  </div>
                )}
                {atl != null && (
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--m-border)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--m-text)", lineHeight: 1 }}>{atl}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>ATL</div>
                  </div>
                )}
                {tsb != null && (
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--m-border)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: tsb >= 0 ? "#22c55e" : "#ef4444", lineHeight: 1 }}>{tsb > 0 ? "+" : ""}{tsb}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>TSB</div>
                  </div>
                )}
              </div>
            )}
            {/* Bonus ride highlight — shown when athlete rode on a rest day */}
            {isBonus && (
              <div style={{
                marginTop: 10,
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: 8, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>
                  🚴 Bonus ride today
                </div>
                {todayActivityName && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--m-text)", marginBottom: 6, lineHeight: 1.3 }}>
                    {todayActivityName.length > 28 ? todayActivityName.slice(0, 26) + "…" : todayActivityName}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  {todayActivityDurationMin && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{todayActivityDurationMin} min</span>
                  )}
                  {todayAvgHr && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>{Math.round(todayAvgHr)} bpm</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Week list */}
          <div style={{ padding: "20px 20px 0", flex: 1 }}>
            <WeekDayListClient days={dayRows} weekNav={weekNav} />
          </div>

          {/* Plan summary */}
          {plan?.summary && (
            <div style={{ padding: "0 20px 24px" }}>
              <div style={{
                background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
                borderRadius: 6, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 8 }}>
                  Week plan
                </div>
                <div style={{ fontSize: 14, color: "var(--m-muted)", lineHeight: 1.7 }}>
                  {plan.summary.slice(0, 160)}{plan.summary.length > 160 ? "…" : ""}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PowerBarChart({ blocks, durationMin }: {
  blocks: Array<{ type: string; durationMin?: number; powerFtp?: number; repeats?: number; onSec?: number; offSec?: number }>;
  durationMin: number;
}) {
  const totalMin = blocks.reduce((s, b) => s + (b.durationMin ?? 0), 0) || durationMin || 60;
  const expanded: Array<{ durationMin: number; powerFtp: number }> = [];
  for (const b of blocks) {
    if (b.type === "intervals" && b.repeats && b.onSec && b.offSec) {
      const onMin = b.onSec / 60, offMin = b.offSec / 60;
      for (let r = 0; r < b.repeats; r++) {
        expanded.push({ durationMin: onMin,  powerFtp: b.powerFtp ?? 0.75 });
        expanded.push({ durationMin: offMin, powerFtp: 0.5 });
      }
    } else {
      expanded.push({ durationMin: b.durationMin ?? 0, powerFtp: b.powerFtp ?? 0.65 });
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64 }}>
        {expanded.map((seg, i) => {
          const pct = Math.round((seg.powerFtp ?? 0) * 100);
          const color = blockColor(pct);
          const widthPct = (seg.durationMin / totalMin) * 100;
          const heightPct = Math.min(100, Math.max(8, pct));
          return (
            <div key={i} title={`${pct}% FTP · ${seg.durationMin.toFixed(1)} min`} style={{
              flex: `${widthPct} 0 0`, height: `${heightPct}%`,
              background: color, borderRadius: 2, opacity: 0.85, minWidth: 2,
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--m-muted)" }}>0</span>
        <span style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 600 }}>{totalMin} min</span>
      </div>
    </div>
  );
}
