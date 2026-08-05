import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState, getRiderIdentity, getFeedbackDone } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile, fetchActivities } from "@/lib/zwift";
import { computeWeekStatus, zwiftActivityToIcu, mergeActivities } from "@/lib/activity-sync";
import MobileWorkoutCard from "./workout-card";
import NoPlanScreen from "./no-plan-screen";
import FeedbackBanner from "./feedback-banner";
import BonusRideCard from "./bonus-ride-card";
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
  let todayIcuId: string | null = null;
  let todayAvgPower: number | null = null;
  let todayNormalizedPower: number | null = null;
  let todayDistanceKm: number | null = null;
  let todayTss: number | null = null;
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

    // Extract today's activity metadata for the feedback banner and ride card
    const todayActivity = activities.find(a =>
      a.start_date_local?.slice(0, 10) === todayStr
    );
    todayAvgHr = todayActivity?.average_heartrate ?? null;
    if (todayActivity) {
      todayActivityName = todayActivity.name ?? null;
      todayActivityDurationMin = todayActivity.moving_time
        ? Math.round(todayActivity.moving_time / 60) : null;
      todayIcuId = (todayActivity as { id?: string }).id ?? null;
      // Additional stats for BonusRideCard
      todayAvgPower = (todayActivity.average_watts != null && todayActivity.average_watts > 0)
        ? Math.round(todayActivity.average_watts) : null;
      todayNormalizedPower = (todayActivity.normalized_power != null && todayActivity.normalized_power > 0)
        ? Math.round(todayActivity.normalized_power) : null;
      todayDistanceKm = (todayActivity.distance != null && todayActivity.distance > 0)
        ? Math.round(todayActivity.distance / 100) / 10 : null; // m → km, 1 decimal
      todayTss = (todayActivity.icu_training_load != null && todayActivity.icu_training_load > 0)
        ? Math.round(todayActivity.icu_training_load) : null;
    }
  } catch { /* best-effort */ }

  const todayStatus: DayStatus = weekStatus[todayStr] ?? "planned";
  const todayWorkout =
    workouts.find(w => w.date === todayStr) ??
    workouts.find(w => w.day === todayDayName) ??
    null;

  // Server-side feedback check — if already done on any device, don't render FeedbackBanner at all.
  // This is the authoritative gate: no client-side race condition, no flash-then-hide.
  const feedbackAlreadyDone = await getFeedbackDone(athleteId, todayStr).catch(() => false);

  // ── Hero data ────────────────────────────────────────────────────────────
  // Use live Zwift profile when available; fall back to KV-cached identity
  // (written at login time) when the token is expired or the API is slow.
  const firstName = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;
  const ftp = zwiftProfile?.ftp ?? cachedIdentity?.ftp ?? null;

  // Connection status for header icons
  const icuConnected = !!(cookieKeyEarly ?? earlyKvCreds?.icuKey);
  const icuName = cookieStore.get("zwift_intervals_name")?.value ?? earlyKvCreds?.icuName ?? null;

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
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} weekIndex={weekIndex} weekWorkoutCount={weekWorkoutCount} todayStatus={todayStatus} workout={null} icuConnected={icuConnected} icuName={icuName} />
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
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} weekIndex={weekIndex} weekWorkoutCount={weekWorkoutCount} todayStatus={isBonus ? "bonus" : "planned"} workout={null} todayActivityDurationMin={todayActivityDurationMin} icuConnected={icuConnected} icuName={icuName} />
        <div style={SCROLL_STYLE}>
          {isBonus ? (
            /* Bonus ride — expandable ride card + feedback */
            <div style={{ padding: "16px 16px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".14em", color: "var(--m-muted)", textTransform: "uppercase" }}>
                  Today&apos;s session
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#FF5A1F", background: "rgba(255,90,31,0.08)", border: "1px solid rgba(255,90,31,0.28)", borderRadius: 3, padding: "2px 8px" }}>
                  Bonus
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)" }}>
                  Rest day planned
                </span>
              </div>

              {/* Tap to expand ride card — Week page day card style */}
              <BonusRideCard
                activityName={todayActivityName}
                durationMin={todayActivityDurationMin}
                avgHr={todayAvgHr}
                avgPower={todayAvgPower}
                normalizedPower={todayNormalizedPower}
                distanceKm={todayDistanceKm}
                tss={todayTss}
                ftp={ftp}
                date={todayStr}
              />

              {/* Feedback — server-side KV gate ensures it shows once across all devices */}
              {!feedbackAlreadyDone && <FeedbackBanner
                workoutTitle={todayActivityName ?? "Bonus ride"}
                workoutCategory="bonus"
                date={todayStr}
                avgHr={todayAvgHr}
                completed={true}
                actualDurationMin={todayActivityDurationMin}
                isBonus={true}
              />}
            </div>
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
      <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} weekIndex={weekIndex} weekWorkoutCount={weekWorkoutCount} todayStatus={todayStatus} workout={todayWorkout} icuConnected={icuConnected} icuName={icuName} />

      {/* Scrollable content */}
      <div style={SCROLL_STYLE}>
        {/* Feedback — shown after ride, cross-device KV sync (won't show twice) */}
        {/* Feedback — server-side gate prevents re-showing after submit on any device */}
        {!feedbackAlreadyDone && (todayStatus === "completed" || todayStatus === "bonus") && (
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
  firstName, ftp, phase, weekIndex, weekWorkoutCount, todayStatus, workout,
  icuConnected, icuName,
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
  icuName?: string | null;
}) {
  void ftp; void icuName; // not displayed in the minimal header

  const statusDone = todayStatus === "completed";

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

  const sessionLabel = workout
    ? (workout.title.length > 28 ? workout.title.slice(0, 26) + "\u2026" : workout.title)
    : "Rest Day";

  return (
    <div style={{ flexShrink: 0, background: "var(--m-bg)", padding: "16px 20px 0" }}>

      {/* Row 1: greeting (left) + date + theme toggle (right) */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", letterSpacing: ".7px", textTransform: "uppercase" }}>
            {timeGreeting}
          </div>
          <div style={{ fontSize: 12, color: "var(--m-muted)", marginTop: 3, fontWeight: 400 }}>
            {dateLabel}
          </div>
        </div>
        <ThemeToggleButton compact />
      </div>

      {/* Row 2: large athlete name */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 38, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-2px", lineHeight: 1 }}>
          {firstName ?? "Athlete"}
        </div>
      </div>

      {/* Row 3: status dots (Zwift · ICU) + phase info */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        {/* Zwift */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="#FF5A1F" style={{ flexShrink: 0 }}>
            <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", letterSpacing: ".2px" }}>Zwift</span>
        </div>
        <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--m-border)", flexShrink: 0 }} />
        {/* ICU */}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={icuConnected ? "#e11d48" : "#4b5563"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", letterSpacing: ".2px" }}>ICU</span>
        </div>
        {!icuConnected && (
          <a href="/api/intervals/oauth-start?from=m" style={{
            fontSize: 10, fontWeight: 700, color: "var(--m-btn-muted-txt)", textDecoration: "none",
            padding: "3px 8px", background: "var(--m-btn-muted)", borderRadius: 4, marginLeft: 2,
          }}>
            Connect
          </a>
        )}
        <div style={{ flex: 1 }} />
        {/* Phase + week + session count */}
        {phase && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", letterSpacing: ".2px" }}>
            {phase}
            {weekIndex != null ? ` \u00b7 Wk ${weekIndex + 1}` : ""}
            {weekWorkoutCount > 0 ? ` \u00b7 ${weekWorkoutCount}\u00d7` : ""}
          </span>
        )}
      </div>

      {/* Divider + today's workout label (clean row, no card) */}
      <div style={{
        borderTop: "1px solid var(--m-border)",
        paddingTop: 13, paddingBottom: 15,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {statusDone && (
            <div style={{
              width: 15, height: 15, borderRadius: "50%",
              border: "1.5px solid #22c55e",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3.2 5.7L6.5 2.3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <span style={{
            fontSize: 14, fontWeight: 700, letterSpacing: "-.2px",
            color: statusDone ? "#22c55e" : workout ? "var(--m-text)" : "var(--m-muted)",
          }}>
            {sessionLabel}
          </span>
        </div>
        {workout && (
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--m-muted)" }}>
            {workout.durationMin}min
          </span>
        )}
      </div>
    </div>
  );
}
