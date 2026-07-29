import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState, getRiderIdentity } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile, fetchActivities } from "@/lib/zwift";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import MobileWorkoutCard from "./workout-card";
import NoPlanScreen from "./no-plan-screen";
import { ThemeToggleButton } from "../theme-toggle-button";
import type { DayStatus } from "@/lib/activity-sync";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

export default async function MobileTodayPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = String(session.athleteId);
  const weekOf = mondayOfCurrentWeek();

  // Parallel: plan + ICU creds + Zwift profile + athlete state
  const cookieKeyEarly = cookieStore.get("zwift_intervals_key")?.value;
  const [plan, earlyKvCreds, zwiftProfile, athleteState, cachedIdentity] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKeyEarly ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getStoredAthleteState(athleteId).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
  ]);

  const todayDate = new Date();
  const todayStr = todayDate.toISOString().slice(0, 10);
  const todayDayName = DAY_NAMES[todayDate.getDay()];
  const dateMap = buildDateMap(weekOf);
  const weekDates = weekDatesFrom(weekOf);

  const workouts = (plan?.workouts ?? []).map(w => ({
    ...w,
    date: w.date ?? dateMap[w.day] ?? undefined,
  }));

  // ── Fetch activities for this week (ICU + Zwift direct merge) ──────────
  // ICU covers all platforms IF the athlete has set up Zwift→ICU sync.
  // We ALSO fetch from Zwift directly so rides are counted regardless of sync.
  let weekStatus: Record<string, DayStatus> = {};
  let todayAvgHr: number | null = null;
  let todayActivityName: string | null = null;
  let todayActivityDurationMin: number | null = null;
  try {
    const cookieKey = cookieStore.get("zwift_intervals_key")?.value;
    const cookieId  = cookieStore.get("zwift_intervals_id")?.value;
    const icuKey = cookieKey ?? earlyKvCreds?.icuKey;
    const icuId  = cookieId  ?? earlyKvCreds?.icuId;

    // Fetch ICU + Zwift in parallel, both best-effort with timeouts
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

    // Convert Zwift activities to IcuActivity shape, filter to this week
    const zwiftAsIcu = zwiftRaw
      .map(zwiftActivityToIcu)
      .filter(a => {
        const d = a.start_date_local.slice(0, 10);
        return d >= weekDates[0] && d <= weekDates[6];
      });

    // Merge: ICU wins on duplicates (it's the authoritative source when available)
    const activities = mergeActivities(icuActivities as import("@/lib/intervals").IcuActivity[], zwiftAsIcu);

    weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);

    // Extract today's activity metadata for the feedback banner
    const todayActivity = activities.find(a =>
      a.start_date_local?.slice(0, 10) === todayStr
    );
    todayAvgHr = todayActivity?.average_heartrate ?? null;
    if (todayActivity) {
      todayActivityName = todayActivity.name ?? null;
      todayActivityDurationMin = todayActivity.moving_time
        ? Math.round(todayActivity.moving_time / 60) : null;
    }
  } catch { /* best-effort */ }

  const todayStatus: DayStatus = weekStatus[todayStr] ?? "planned";
  const todayWorkout =
    workouts.find(w => w.date === todayStr) ??
    workouts.find(w => w.day === todayDayName) ??
    null;

  // ── Hero data ────────────────────────────────────────────────────────────
  // Use live Zwift profile when available; fall back to KV-cached identity
  // (written at login time) when the token is expired or the API is slow.
  const firstName = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;
  const ftp = zwiftProfile?.ftp ?? cachedIdentity?.ftp ?? null;

  // Connection status for header icons
  const icuConnected = !!(cookieKeyEarly ?? earlyKvCreds?.icuKey);

  const macro = athleteState?.macroCycle ?? null;
  let currentPhase: string | null = null;
  let weekIndex: number | null = null;
  if (macro) {
    const wi = (macro as { weekIndex: number }).weekIndex ?? 0;
    weekIndex = wi;
    currentPhase = wi === 0 ? "Base" : (wi % 4) === 3 ? "Recovery" : "Build";
  }

  // Count planned workouts this week (non-rest)
  const weekWorkoutCount = workouts.filter(
    w => !["rest", "recovery"].some(k => (w.type ?? "").toLowerCase().includes(k))
  ).length;

  const SCROLL_STYLE: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    overscrollBehavior: "contain",
    // No paddingBottom needed — layout content area already ends above the nav
  };

  const PAGE_SHELL: React.CSSProperties = {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  // ── No plan ──────────────────────────────────────────────────────────────
  if (!plan || workouts.length === 0) {
    return (
      <div style={PAGE_SHELL}>
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} weekIndex={weekIndex} weekWorkoutCount={weekWorkoutCount} todayStatus={todayStatus} workout={null} icuConnected={icuConnected} />
        <div style={SCROLL_STYLE}>
          <NoPlanScreen />
        </div>
      </div>
    );
  }

  // ── Rest day / Bonus ─────────────────────────────────────────────────────
  if (!todayWorkout || todayStatus === "bonus") {
    const isBonus = todayStatus === "bonus";
    return (
      <div style={PAGE_SHELL}>
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} weekIndex={weekIndex} weekWorkoutCount={weekWorkoutCount} todayStatus={isBonus ? "bonus" : "planned"} workout={null} todayActivityDurationMin={todayActivityDurationMin} icuConnected={icuConnected} />
        <div style={SCROLL_STYLE}>
          {isBonus ? (
            /* Bonus ride — show actual ride data + feedback banner */
            <>
              <div style={{ padding: "16px 16px 0" }}>
                {/* Bonus badge + rest day context */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".14em", color: "var(--m-muted)", textTransform: "uppercase" }}>
                    Today&apos;s session
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, padding: "2px 8px" }}>
                    Bonus
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)" }}>
                    Rest day planned
                  </span>
                </div>

                {/* Ride data card */}
                <div style={{
                  borderRadius: 4, overflow: "hidden",
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderTop: "3px solid #f59e0b", marginBottom: 10,
                }}>
                  <div style={{ height: 70, background: "var(--m-card-inner)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
                    🚴
                  </div>
                  <div style={{ padding: "14px 16px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 5 }}>
                      Bonus ride
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--m-text)", lineHeight: 1.15, letterSpacing: "-0.4px", marginBottom: 10 }}>
                      {todayActivityName ?? "Bonus ride"}
                    </div>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {todayActivityDurationMin && todayActivityDurationMin > 0 && (
                        <div style={{ background: "var(--m-card-inner)", borderRadius: 3, padding: "8px 12px", textAlign: "center", border: "1px solid var(--m-border)" }}>
                          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--m-text)", lineHeight: 1 }}>{todayActivityDurationMin}</div>
                          <div style={{ fontSize: 11, color: "var(--m-muted)", marginTop: 2, fontWeight: 500 }}>min</div>
                        </div>
                      )}
                      {todayAvgHr && todayAvgHr > 0 && (
                        <div style={{ background: "rgba(239,68,68,0.08)", borderRadius: 3, padding: "8px 12px", textAlign: "center", border: "1px solid rgba(239,68,68,0.2)" }}>
                          <div style={{ fontSize: 17, fontWeight: 700, color: "#ef4444", lineHeight: 1 }}>{Math.round(todayAvgHr)}</div>
                          <div style={{ fontSize: 11, color: "rgba(239,68,68,0.5)", marginTop: 2, fontWeight: 500 }}>bpm avg</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </>
          ) : (
            /* Pure rest day — calm, no drama */
            <div style={{ padding: "16px 16px 0" }}>
              <div style={{ background: "var(--m-card)", border: "1px solid var(--m-border)", borderRadius: 4, padding: "22px 20px", marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--m-text)", marginBottom: 8 }}>Rest day</div>
                <div style={{ fontSize: 16, color: "var(--m-muted)", lineHeight: 1.65, marginBottom: 18 }}>
                  No workout scheduled today. Quality rest is as important as the training itself.
                </div>
                <a href="/m/week" style={{ display: "block", textAlign: "center", padding: "14px", borderRadius: 4, background: "var(--m-card-inner)", border: "1px solid var(--m-border)", color: "var(--m-muted)", fontSize: 17, fontWeight: 600, textDecoration: "none" }}>
                  See this week&apos;s plan →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={PAGE_SHELL}>

      {/* Hero header — outside scroll area so it never moves */}
      <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} weekIndex={weekIndex} weekWorkoutCount={weekWorkoutCount} todayStatus={todayStatus} workout={todayWorkout} icuConnected={icuConnected} />

      {/* Scrollable content */}
      <div style={SCROLL_STYLE}>
        {/* Main workout card */}
        <MobileWorkoutCard
          workout={todayWorkout}
          weekWorkouts={workouts}
          today={todayStr}
          todayStatus={todayStatus}
          weekStatus={weekStatus}
        />

      </div>
    </div>
  );
}

// ── Hero header (server-rendered) ─────────────────────────────────────────────

type HeroWorkout = { title: string; durationMin?: number; type?: string } | null;

function TodayHero({
  firstName, ftp, phase, weekIndex, weekWorkoutCount, todayStatus, workout,
  icuConnected,
}: {
  firstName: string | null;
  ftp: number | null;
  phase: string | null;
  weekIndex: number | null;
  weekWorkoutCount: number;
  todayStatus: DayStatus | "bonus";
  workout: HeroWorkout;
  todayActivityDurationMin?: number | null;
  icuConnected: boolean;
}) {
  const statusDone   = todayStatus === "completed";
  const statusBonus  = todayStatus === "bonus";
  const isRestOrBonus = !workout || statusBonus;

  const utcHour = new Date().getUTCHours();
  const localHour = (utcHour + 3) % 24;
  const timeGreeting =
    localHour < 5  ? "Late night" :
    localHour < 12 ? "Good morning" :
    localHour < 17 ? "Good afternoon" :
    localHour < 21 ? "Good evening" : "Good night";

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "Asia/Jerusalem",
  });

  // Today's session label — bonus/rest days just say "Rest Day" (no bonus mention in header)
  const sessionLabel = workout
    ? (workout.title.length > 26 ? workout.title.slice(0, 24) + "…" : workout.title)
    : "Rest Day";

  // Detect workout zone color for the session chip
  const workoutType = (workout?.title ?? "").toLowerCase();
  const sessionColor =
    workoutType.includes("sweet") ? "#10b981" :
    workoutType.includes("threshold") || workoutType.includes("ftp") ? "#FF5A1F" :
    workoutType.includes("vo2") ? "#ef4444" :
    workoutType.includes("tempo") ? "#3b82f6" :
    workoutType.includes("sprint") ? "#a855f7" :
    workoutType.includes("endurance") || workoutType.includes("z2") ? "#22d3ee" :
    "var(--m-muted)";

  return (
    <div style={{
      flexShrink: 0,
      background: "var(--m-card)",
      borderBottom: "1px solid var(--m-border)",
      padding: "12px 18px 14px",
    }}>
      {/* Row 1: greeting + theme toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 500, letterSpacing: ".5px", textTransform: "uppercase" }}>
          {timeGreeting} · {dateLabel}
        </div>
        <ThemeToggleButton compact />
      </div>

      {/* Row 2: athlete name + Zwift/ICU connection chips */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1.5px", lineHeight: 1 }}>
          {firstName ?? "Athlete"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {/* Zwift — always connected */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 9px", borderRadius: 6,
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "#22c55e", letterSpacing: ".06em" }}>Zwift</span>
          </div>
          {/* ICU */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 9px", borderRadius: 6,
            background: icuConnected ? "rgba(34,197,94,0.08)" : "rgba(100,116,139,0.08)",
            border: `1px solid ${icuConnected ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.18)"}`,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: icuConnected ? "#22c55e" : "#64748b", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: icuConnected ? "#22c55e" : "#94a3b8", letterSpacing: ".06em" }}>ICU</span>
          </div>
        </div>
      </div>

      {/* Row 3: stat cards — same MetricCard composition as the Profile page, compact for the header.
          Background = var(--m-card), border = var(--m-border), value = colored, label = muted gray. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {/* FTP */}
        {ftp && (
          <div style={{
            background: "var(--m-card)", border: "1px solid var(--m-border)",
            borderRadius: 12, padding: "10px 12px", textAlign: "center", flex: 1,
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#00C2FF", lineHeight: 1, letterSpacing: "-.5px" }}>{ftp}W</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>FTP</div>
          </div>
        )}
        {/* Phase — Build=red, Recovery=amber, Base=purple */}
        {phase && (() => {
          const phaseColor = phase === "Recovery" ? "#f59e0b" : phase === "Build" ? "#ef4444" : "#818cf8";
          return (
            <div style={{
              background: "var(--m-card)", border: "1px solid var(--m-border)",
              borderRadius: 12, padding: "10px 12px", textAlign: "center", flex: 1,
            }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: phaseColor, lineHeight: 1 }}>{phase}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>
                {weekIndex !== null ? `Wk ${weekIndex + 1}` : "Phase"}
              </div>
            </div>
          );
        })()}
        {/* Sessions this week */}
        {weekWorkoutCount > 0 && (
          <div style={{
            background: "var(--m-card)", border: "1px solid var(--m-border)",
            borderRadius: 12, padding: "10px 12px", textAlign: "center", flex: 1,
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#FF5A1F", lineHeight: 1 }}>{weekWorkoutCount}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4 }}>Sessions</div>
          </div>
        )}
        {/* Today's workout label */}
        <div style={{
          flex: 2, background: "var(--m-card)", border: "1px solid var(--m-border)",
          borderLeft: `3px solid ${isRestOrBonus ? "var(--m-border)" : sessionColor}`,
          borderRadius: 12, padding: "10px 12px",
          display: "flex", alignItems: "center",
          minWidth: 0,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: isRestOrBonus ? "var(--m-muted)" : sessionColor,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {statusDone && workout ? `✓ ${sessionLabel}` : sessionLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
