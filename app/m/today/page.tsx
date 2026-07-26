import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { computeWeekStatus } from "@/lib/activity-sync";
import MobileWorkoutCard from "./workout-card";
import NoPlanScreen from "./no-plan-screen";
import FeedbackBanner from "./feedback-banner";
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
  const [plan, earlyKvCreds, zwiftProfile, athleteState] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKeyEarly ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getStoredAthleteState(athleteId).catch(() => null),
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
    }
  } catch { /* best-effort */ }

  const todayStatus: DayStatus = weekStatus[todayStr] ?? "planned";
  const todayWorkout =
    workouts.find(w => w.date === todayStr) ??
    workouts.find(w => w.day === todayDayName) ??
    null;

  // ── Hero data ────────────────────────────────────────────────────────────
  const firstName = zwiftProfile?.firstName ?? null;
  const ftp = zwiftProfile?.ftp ?? null;

  const macro = athleteState?.macroCycle ?? null;
  let currentPhase: string | null = null;
  if (macro) {
    const wi = (macro as { weekIndex: number }).weekIndex ?? 0;
    currentPhase = wi === 0 ? "Base" : (wi % 4) === 3 ? "Recovery" : "Build";
  }

  // ── No plan ──────────────────────────────────────────────────────────────
  if (!plan || workouts.length === 0) {
    return (
      <>
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={todayStatus} />
        <NoPlanScreen />
      </>
    );
  }

  // ── Rest day / Bonus ─────────────────────────────────────────────────────
  if (!todayWorkout || todayStatus === "bonus") {
    const isBonus = todayStatus === "bonus";
    return (
      <>
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={todayStatus} />
        <div style={{ padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>{isBonus ? "🔥" : "🛋️"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", marginBottom: 10 }}>
            {isBonus ? "Bonus ride detected!" : "Rest day"}
          </div>
          <div style={{ fontSize: 15, color: "#64748b", lineHeight: 1.65 }}>
            {isBonus
              ? "You trained on a rest day — great dedication. Your training load has been updated automatically."
              : "No workout scheduled today. Recovery is training too."}
          </div>
          {isBonus && (
            <div style={{
              marginTop: 20, padding: "14px 20px",
              background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 14, fontSize: 14, color: "#f59e0b",
            }}>
              Your coach will factor this into next week&apos;s plan.
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Hero header */}
      <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={todayStatus} />

      {/* Post-ride feedback banner */}
      {todayStatus === "completed" && (
        <FeedbackBanner workoutTitle={todayWorkout.title} date={todayStr} />
      )}

      {/* Main workout card */}
      <MobileWorkoutCard
        workout={todayWorkout}
        weekWorkouts={workouts}
        today={todayStr}
        todayStatus={todayStatus}
        weekStatus={weekStatus}
      />
    </>
  );
}

// ── Hero header (server-rendered) ─────────────────────────────────────────────

function TodayHero({
  firstName, ftp, phase, todayStatus,
}: {
  firstName: string | null;
  ftp: number | null;
  phase: string | null;
  todayStatus: DayStatus;
}) {
  return (
    <div style={{
      position: "relative",
      padding: "28px 22px 24px",
      background: "linear-gradient(160deg, #020817 0%, #0a1628 55%, #0f1e38 100%)",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* Background glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37,99,235,0.2) 0%, transparent 70%)",
      }} />

      {/* Brand + greeting */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16, position: "relative" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(37,99,235,0.42)",
        }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
            <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z" />
          </svg>
        </div>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".18em",
            textTransform: "uppercase", color: "#3b82f6", marginBottom: 4,
          }}>
            AI Training Coach
          </div>
          <div style={{
            fontSize: 28, fontWeight: 900, color: "#f8fafc",
            letterSpacing: "-.5px", lineHeight: 1.05,
          }}>
            {firstName ? `Hey, ${firstName}` : "Today"}
          </div>
        </div>
      </div>

      {/* Stat pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }}>
        {ftp && (
          <Pill color="#3b82f6" dimColor="#1d4ed8">
            <strong style={{ fontSize: 14, fontWeight: 800 }}>{ftp}W</strong>
            <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.75 }}>FTP</span>
          </Pill>
        )}
        {phase && (
          <Pill color="#818cf8" dimColor="#4f46e5">
            <strong style={{ fontSize: 14, fontWeight: 800 }}>{phase}</strong>
            <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.75 }}>Phase</span>
          </Pill>
        )}
        {todayStatus === "completed" && (
          <Pill color="#22c55e" dimColor="#15803d">
            <span style={{ fontSize: 14, fontWeight: 800 }}>✓ Workout done</span>
          </Pill>
        )}
        {todayStatus === "missed" && (
          <Pill color="#ef4444" dimColor="#b91c1c">
            <span style={{ fontSize: 14, fontWeight: 800 }}>Missed today</span>
          </Pill>
        )}
      </div>
    </div>
  );
}

function Pill({ color, dimColor, children }: {
  color: string;
  dimColor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center",
      background: `${color}15`,
      border: `1px solid ${color}30`,
      borderRadius: 20, padding: "6px 14px",
      color,
    }}>
      {children}
    </div>
  );
}
