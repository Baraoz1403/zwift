import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState, getRiderIdentity } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile, fetchActivities } from "@/lib/zwift";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import MobileWorkoutCard from "./workout-card";
import NoPlanScreen from "./no-plan-screen";
import FeedbackBanner from "./feedback-banner";
import FeedbackTrigger from "./feedback-trigger";
import CoachMessageBox from "./coach-message-box";
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

  const macro = athleteState?.macroCycle ?? null;
  let currentPhase: string | null = null;
  if (macro) {
    const wi = (macro as { weekIndex: number }).weekIndex ?? 0;
    currentPhase = wi === 0 ? "Base" : (wi % 4) === 3 ? "Recovery" : "Build";
  }

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

              {/* Feedback banner — adapted for bonus (skip plan-check, go straight to RPE) */}
              <FeedbackBanner
                workoutTitle={todayActivityName ?? "Bonus ride"}
                workoutCategory="bonus"
                date={todayStr}
                avgHr={todayAvgHr}
                completed={true}
                actualDurationMin={todayActivityDurationMin}
                isBonus={true}
              />
              <CoachMessageBox date={todayStr} />
            </>
          ) : (
            /* Pure rest day — calm, no drama */
            <>
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
              <CoachMessageBox date={todayStr} />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={PAGE_SHELL}>
      {/* Fires /api/m/feedback-check after page load — sends WhatsApp if
          the athlete completed a ride today and hasn't been messaged yet.
          No ICU webhook setup required. */}
      <FeedbackTrigger />

      {/* Hero header — outside scroll area so it never moves */}
      <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={todayStatus} workout={todayWorkout} />

      {/* Scrollable content */}
      <div style={SCROLL_STYLE}>
        {/* Feedback banner — always shown for today's workout.
            ICU sync can lag; don't wait for "completed" status. */}
        <FeedbackBanner
          workoutTitle={todayWorkout.title}
          workoutCategory={todayWorkout.type ?? ""}
          date={todayStr}
          avgHr={todayAvgHr}
          completed={todayStatus === "completed" || todayStatus === "bonus"}
          plannedDurationMin={todayWorkout.durationMin}
          actualActivityName={todayActivityName}
          actualDurationMin={todayActivityDurationMin}
        />

        {/* Main workout card */}
        <MobileWorkoutCard
          workout={todayWorkout}
          weekWorkouts={workouts}
          today={todayStr}
          todayStatus={todayStatus}
          weekStatus={weekStatus}
        />

        {/* Always-visible free-text message to coach */}
        <CoachMessageBox date={todayStr} />
      </div>
    </div>
  );
}

// ── Hero header (server-rendered) ─────────────────────────────────────────────

type HeroWorkout = { title: string; durationMin?: number; type?: string } | null;

function TodayHero({
  firstName, ftp, phase, todayStatus, workout,
}: {
  firstName: string | null;
  ftp: number | null;
  phase: string | null;
  todayStatus: DayStatus | "bonus";
  workout: HeroWorkout;
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
    ? { text: "✓ Done",  color: "#15803d", bg: "#dcfce7", border: "1px solid #bbf7d0" }
    : statusMissed
    ? { text: "Missed",  color: "#dc2626", bg: "#fee2e2", border: "1px solid #fecaca" }
    : null;

  return (
    <div style={{
      flexShrink: 0,
      background: "var(--m-card)",
      borderBottom: "1px solid var(--m-border)",
      padding: "14px 20px",
    }}>
      {/* Row 1: greeting + theme toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "var(--m-muted)", fontWeight: 500, letterSpacing: ".3px" }}>
          {timeGreeting}
        </div>
        <ThemeToggleButton compact />
      </div>

      {/* Row 2: athlete name (left) + Done/Missed badge (right) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1.5px", lineHeight: 1 }}>
          {firstName ?? "Athlete"}
        </div>
        {statusBadge && (
          <span style={{
            fontSize: 14, fontWeight: 800, borderRadius: 4,
            color: statusBadge.color, background: statusBadge.bg,
            border: statusBadge.border,
            padding: "6px 14px", letterSpacing: ".01em", flexShrink: 0,
          }}>{statusBadge.text}</span>
        )}
      </div>

      {/* Row 3: date (left) + FTP, phase, workout (right) */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, color: "var(--m-muted)" }}>{dateLabel}</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {ftp && (
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--m-text)", lineHeight: 1 }}>
              {ftp}&thinsp;<span style={{ fontSize: 12, fontWeight: 600, color: "var(--m-muted)" }}>W FTP</span>
            </div>
          )}
          {phase && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#FF5A1F",
              background: "rgba(255,90,31,0.1)", border: "1px solid rgba(255,90,31,0.3)",
              padding: "2px 8px", borderRadius: 3,
            }}>{phase}</span>
          )}
          {/* Today's planned session — truncated if long */}
          <span style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 500, maxWidth: 160, textAlign: "right", lineHeight: 1.2 }}>
            {workout
              ? (workout.title.length > 22 ? workout.title.slice(0, 20) + "…" : workout.title)
              : (todayStatus === "bonus" ? "Rest Day + Bonus" : "Rest Day")}
          </span>
        </div>
      </div>
    </div>
  );
}
