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
import ActualActivityCard from "./actual-activity-card";
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
                <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, padding: "2px 8px" }}>
                  Bonus
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)" }}>
                  Rest day planned
                </span>
              </div>

                  <ActualActivityCard
                activityName={todayActivityName}
                durationMin={todayActivityDurationMin}
                avgHr={todayAvgHr}
                avgPower={todayAvgPower}
                normalizedPower={todayNormalizedPower}
                distanceKm={todayDistanceKm}
                tss={todayTss}
                ftp={ftp}
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
        {!feedbackAlreadyDone && (todayStatus === "completed" || todayStatus === "bonus" || todayStatus === "extra") && (
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

        {todayStatus === "extra" && todayActivityName ? (
          /* Extra: different sport than planned — actual ride is the story */
          <div style={{ padding: "16px 16px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".14em", color: "var(--m-muted)", textTransform: "uppercase" }}>
                Today&apos;s session
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, padding: "2px 8px" }}>
                Different sport
              </span>
            </div>

            {/* Actual ride — rich card matching planned workout card style */}
            <ActualActivityCard
              activityName={todayActivityName}
              durationMin={todayActivityDurationMin}
              avgHr={todayAvgHr}
              avgPower={todayAvgPower}
              normalizedPower={todayNormalizedPower}
              distanceKm={todayDistanceKm}
              tss={todayTss}
              ftp={ftp}
            />

            {/* What was planned — compact footnote */}
            <div style={{
              background: "var(--m-card-inner)", borderRadius: 4,
              border: "1px solid var(--m-border)", padding: "12px 14px",
              marginBottom: 10,
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 6 }}>
                What was planned
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-text)" }}>
                {todayWorkout.title}
              </div>
              {todayWorkout.durationMin > 0 && (
                <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 4 }}>
                  {todayWorkout.durationMin} min{todayWorkout.type ? ` · ${todayWorkout.type}` : ""}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Normal: planned / completed / missed workout card */
          <MobileWorkoutCard
            workout={todayWorkout}
            weekWorkouts={workouts}
            today={todayStr}
            todayStatus={todayStatus}
            weekStatus={weekStatus}
          />
        )}

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

      {/* Row 2: athlete name */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1.5px", lineHeight: 1 }}>
          {firstName ?? "Athlete"}
        </div>
      </div>

      {/* Row 3: Connection status card — same design as Settings page */}
      <div style={{
        background: "var(--m-card)", borderRadius: 14,
        border: "1px solid var(--m-border)", marginBottom: 12,
      }}>
        {/* Zwift row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 16px", borderBottom: "1px solid var(--m-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,90,31,0.13)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {/* Zwift official logo — orange lightning bolt */}
              <svg width="20" height="20" viewBox="0 0 20 20" fill="#FF5A1F">
                <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--m-text)" }}>Zwift</div>
              <div style={{ fontSize: 14, color: "#22c55e", fontWeight: 500, marginTop: 2 }}>Connected</div>
            </div>
          </div>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }}/>
        </div>
        {/* intervals.icu row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "13px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: icuConnected ? "rgba(13,148,136,0.12)" : "rgba(100,116,139,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {/* intervals.icu logo — ECG/activity line in ICU brand teal */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={icuConnected ? "#0d9488" : "var(--m-muted)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--m-text)" }}>Intervals.icu</div>
              <div style={{ fontSize: 14, color: icuConnected ? "#22c55e" : "var(--m-muted)", fontWeight: 500, marginTop: 2 }}>
                {icuConnected ? (icuName ?? "Connected") : "Not connected"}
              </div>
            </div>
          </div>
          {icuConnected
            ? <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }}/>
            : <a href="/api/intervals/oauth-start?from=m" style={{ fontSize: 14, fontWeight: 600, color: "var(--m-btn-muted-txt)", textDecoration: "none", padding: "7px 14px", background: "var(--m-btn-muted)", borderRadius: 9 }}>Connect</a>
          }
        </div>
      </div>

      {/* Row 3: 3 stat cards — MetricCard style (matches Profile page).
          Background = var(--m-card), border neutral, value = colored, label = muted gray. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
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
      </div>

      {/* Row 4: today's session label — full width so it never truncates */}
      <div style={{
        background: "var(--m-card)", border: "1px solid var(--m-border)",
        borderLeft: `3px solid ${isRestOrBonus ? "var(--m-border)" : sessionColor}`,
        borderRadius: 12, padding: "10px 14px", marginBottom: 10,
        display: "flex", alignItems: "center",
      }}>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: isRestOrBonus ? "var(--m-muted)" : sessionColor,
        }}>
          {statusDone && workout ? `✓ ${sessionLabel}` : sessionLabel}
        </span>
      </div>
    </div>
  );
}
