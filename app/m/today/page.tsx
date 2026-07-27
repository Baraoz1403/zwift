import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState, getRiderIdentity } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { computeWeekStatus } from "@/lib/activity-sync";
import MobileWorkoutCard from "./workout-card";
import NoPlanScreen from "./no-plan-screen";
import FeedbackBanner from "./feedback-banner";
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

  // ── Fetch ICU activities for this week ──────────────────────────────────
  let weekStatus: Record<string, DayStatus> = {};
  let todayAvgHr: number | null = null;
  let todayActivityName: string | null = null;
  let todayActivityDurationMin: number | null = null;
  try {
    const cookieKey = cookieStore.get("zwift_intervals_key")?.value;
    const cookieId  = cookieStore.get("zwift_intervals_id")?.value;
    const icuKey = cookieKey ?? earlyKvCreds?.icuKey;
    const icuId  = cookieId  ?? earlyKvCreds?.icuId;

    if (icuKey && icuId) {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("icu_timeout")), 4000)
      );
      const activities = await Promise.race([
        fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
        timeout,
      ]);
      weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);
      // Extract today's avg heart rate for the feedback banner
      const todayActivity = activities.find(a =>
        a.start_date_local?.slice(0, 10) === todayStr
      );
      todayAvgHr = todayActivity?.average_heartrate ?? null;
      // Pass actual activity metadata so FeedbackBanner can detect deviation
      if (todayActivity) {
        todayActivityName = todayActivity.name ?? null;
        todayActivityDurationMin = todayActivity.moving_time
          ? Math.round(todayActivity.moving_time / 60) : null;
      }
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

  const macro = athleteState?.macroCycle ?? null;
  let currentPhase: string | null = null;
  if (macro) {
    const wi = (macro as { weekIndex: number }).weekIndex ?? 0;
    currentPhase = wi === 0 ? "Base" : (wi % 4) === 3 ? "Recovery" : "Build";
  }

  const SCROLL_STYLE: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
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
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={todayStatus} workout={null} />
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
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={isBonus ? "bonus" : "planned"} workout={null} />
        <div style={{ ...SCROLL_STYLE, padding: "24px 16px", paddingBottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}>
          {isBonus ? (
            /* Bonus ride — athlete rode on their rest day. Keep it short + positive. */
            <div style={{
              background: "rgba(34,197,94,0.07)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 4, padding: "22px 20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: "rgba(34,197,94,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24,
                }}>✓</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>Extra ride logged</div>
                  <div style={{ fontSize: 15, color: "var(--m-muted)", marginTop: 2 }}>Today was a rest day — nice bonus work</div>
                </div>
              </div>
              <div style={{ fontSize: 15, color: "var(--m-muted)", lineHeight: 1.65 }}>
                Your training load has been updated. The AI will factor this extra session into next week.
              </div>
              <a href="/m/week" style={{
                display: "block", marginTop: 16, textAlign: "center",
                padding: "14px", borderRadius: 4,
                background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)",
                color: "#22c55e", fontSize: 17, fontWeight: 700, textDecoration: "none",
              }}>
                View weekly plan →
              </a>
            </div>
          ) : (
            /* Pure rest day — calm, no drama */
            <div style={{
              background: "var(--m-card)",
              border: "1px solid var(--m-border)",
              borderRadius: 4, padding: "22px 20px",
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--m-text)", marginBottom: 8 }}>Rest day</div>
              <div style={{ fontSize: 16, color: "var(--m-muted)", lineHeight: 1.65, marginBottom: 18 }}>
                No workout scheduled today. Quality rest is as important as the training itself.
              </div>
              <a href="/m/week" style={{
                display: "block", textAlign: "center",
                padding: "14px", borderRadius: 4,
                background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
                color: "var(--m-muted)", fontSize: 17, fontWeight: 600, textDecoration: "none",
              }}>
                See this week&apos;s plan →
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={PAGE_SHELL}>
      {/* Hero header — outside scroll area so it never moves */}
      <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={todayStatus} workout={todayWorkout} />

      {/* Scrollable content */}
      <div style={SCROLL_STYLE}>
        {/* Feedback banner — only after workout is confirmed completed or bonus */}
        {(todayStatus === "completed" || todayStatus === "bonus") && (
          <FeedbackBanner
            workoutTitle={todayWorkout.title}
            workoutCategory={todayWorkout.type ?? ""}
            date={todayStr}
            avgHr={todayAvgHr}
            completed={true}
            plannedDurationMin={todayWorkout.durationMin}
            actualActivityName={todayActivityName}
            actualDurationMin={todayActivityDurationMin}
          />
        )}

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
  firstName, ftp, phase, todayStatus,
}: {
  firstName: string | null;
  ftp: number | null;
  phase: string | null;
  todayStatus: DayStatus | "bonus";
  workout: HeroWorkout; // kept in signature so callers don't need to change
}) {
  const statusDone   = todayStatus === "completed";
  const statusMissed = todayStatus === "missed";

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

  const statusBadge = statusDone
    ? { text: "Done ✓",  color: "#16a34a", bg: "#dcfce7" }
    : statusMissed
    ? { text: "Missed",  color: "#dc2626", bg: "#fee2e2" }
    : null;

  return (
    <div style={{
      flexShrink: 0,
      background: "var(--m-card)",
      borderBottom: "1px solid var(--m-border)",
      padding: "16px 20px 16px",
    }}>
      {/* Top row: greeting + theme toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "var(--m-muted)", fontWeight: 500, letterSpacing: ".3px" }}>
          {timeGreeting}
        </div>
        <ThemeToggleButton compact />
      </div>

      {/* Athlete name row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ fontSize: 36, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1.5px", lineHeight: 1 }}>
          {firstName ?? "Athlete"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {phase && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#FF5A1F",
              background: "rgba(255,90,31,0.1)", border: "1px solid rgba(255,90,31,0.3)",
              padding: "3px 10px", borderRadius: 3,
            }}>{phase}</span>
          )}
          {ftp && (
            <span style={{ fontSize: 12, color: "var(--m-muted)", fontWeight: 500 }}>{ftp} W FTP</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 13, color: "var(--m-muted)" }}>{dateLabel}</span>
        {statusBadge && (
          <span style={{
            fontSize: 11, fontWeight: 700, borderRadius: 3,
            color: statusBadge.color, background: statusBadge.bg,
            padding: "2px 8px",
          }}>{statusBadge.text}</span>
        )}
      </div>
    </div>
  );
}
