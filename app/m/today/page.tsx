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
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={isBonus ? "bonus" : "planned"} />
        <div style={{ padding: "24px 16px" }}>
          {isBonus ? (
            /* Bonus ride — athlete rode on their rest day. Keep it short + positive. */
            <div style={{
              background: "rgba(34,197,94,0.07)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 20, padding: "22px 20px",
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
                  <div style={{ fontSize: 15, color: "#475569", marginTop: 2 }}>Today was a rest day — nice bonus work</div>
                </div>
              </div>
              <div style={{ fontSize: 15, color: "#475569", lineHeight: 1.65 }}>
                Your training load has been updated. The AI will factor this extra session into next week.
              </div>
              <a href="/m/week" style={{
                display: "block", marginTop: 16, textAlign: "center",
                padding: "14px", borderRadius: 14,
                background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)",
                color: "#22c55e", fontSize: 17, fontWeight: 700, textDecoration: "none",
              }}>
                View weekly plan →
              </a>
            </div>
          ) : (
            /* Pure rest day — calm, no drama */
            <div style={{
              background: "#111827",
              border: "1px solid #1e293b",
              borderRadius: 20, padding: "22px 20px",
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", marginBottom: 8 }}>Rest day</div>
              <div style={{ fontSize: 16, color: "#475569", lineHeight: 1.65, marginBottom: 18 }}>
                No workout scheduled today. Quality rest is as important as the training itself.
              </div>
              <a href="/m/week" style={{
                display: "block", textAlign: "center",
                padding: "14px", borderRadius: 14,
                background: "#0f172a", border: "1px solid #1e293b",
                color: "#64748b", fontSize: 17, fontWeight: 600, textDecoration: "none",
              }}>
                See this week&apos;s plan →
              </a>
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
// Design language matches the desktop HeroBanner: purple→cyan gradient icon,
// "AI TRAINING COACH" label in cyan, weight-900 greeting, subtle grid overlay.

function TodayHero({
  firstName, ftp, phase, todayStatus,
}: {
  firstName: string | null;
  ftp: number | null;
  phase: string | null;
  todayStatus: DayStatus | "bonus";
}) {
  const statusDone   = todayStatus === "completed";
  const statusMissed = todayStatus === "missed";
  const statusBonus  = todayStatus === "bonus";

  const statusValue = statusDone ? "Done ✓" : statusMissed ? "Missed" : statusBonus ? "Bonus" : "Planned";
  const statusColor = statusDone ? "#22c55e" : statusMissed ? "#ef4444" : statusBonus ? "#f59e0b" : "#64748b";

  return (
    <div style={{
      position: "relative",
      padding: "22px 20px 20px",
      background: "linear-gradient(140deg, #030c1e 0%, #09162e 55%, #04091a 100%)",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* Neural grid — same as desktop HeroBanner */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.045) 1px, transparent 1px)
        `,
        backgroundSize: "38px 38px",
        WebkitMaskImage: "radial-gradient(ellipse 100% 100% at 50% 0%, black 0%, transparent 85%)",
        maskImage: "radial-gradient(ellipse 100% 100% at 50% 0%, black 0%, transparent 85%)",
      }} />
      {/* Purple aurora blob — top right, matches desktop */}
      <div style={{
        position: "absolute", top: -60, right: -40, width: 220, height: 220,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 65%)",
        filter: "blur(32px)", pointerEvents: "none",
      }} />
      {/* Bottom separator line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.28), rgba(124,58,237,0.28), transparent)",
        pointerEvents: "none",
      }} />

      {/* Brand chip row — same layout as desktop banner-nav */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 18, position: "relative",
      }}>
        {/* Icon — purple→cyan gradient, identical to desktop */}
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          background: "linear-gradient(135deg, #7C3AED 0%, #00D4FF 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 20px rgba(0,212,255,0.35), 0 4px 12px rgba(124,58,237,0.3)",
        }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
            <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z" />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label — same style as desktop "AI TRAINING COACH" */}
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.2em",
            textTransform: "uppercase", color: "#00D4FF", marginBottom: 3,
          }}>
            AI Training Coach
          </div>
          {/* Greeting — weight 900, same as desktop */}
          <div style={{
            fontSize: 28, fontWeight: 900, color: "#f8fafc",
            letterSpacing: "-0.6px", lineHeight: 1.05,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {firstName ? `Hey, ${firstName}` : "Today's Workout"}
          </div>
        </div>

        {/* Today status badge — top right */}
        <div style={{
          flexShrink: 0,
          padding: "5px 12px",
          borderRadius: 20,
          background: `${statusColor}18`,
          border: `1px solid ${statusColor}40`,
          fontSize: 13, fontWeight: 700, color: statusColor,
          whiteSpace: "nowrap",
        }}>
          {statusValue}
        </div>
      </div>

      {/* Metric cards — FTP + Phase */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, position: "relative",
      }}>
        <HeroCard label="FTP" value={ftp ? `${ftp} W` : "—"} color="#00D4FF" filled={!!ftp} />
        <HeroCard label="Training phase" value={phase ?? "—"} color="#7C3AED" filled={!!phase} />
      </div>
    </div>
  );
}

function HeroCard({ label, value, color, filled }: {
  label: string; value: string; color: string; filled?: boolean;
}) {
  return (
    <div style={{
      background: filled ? `${color}10` : "rgba(9,22,46,0.7)",
      border: `1px solid ${filled ? color + "35" : "rgba(0,212,255,0.1)"}`,
      borderRadius: 14,
      padding: "12px 14px",
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 5 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em" }}>
        {label}
      </div>
    </div>
  );
}
