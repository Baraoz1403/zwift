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
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={todayStatus} workout={null} />
        <NoPlanScreen />
      </>
    );
  }

  // ── Rest day / Bonus ─────────────────────────────────────────────────────
  if (!todayWorkout || todayStatus === "bonus") {
    const isBonus = todayStatus === "bonus";
    return (
      <>
        <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={isBonus ? "bonus" : "planned"} workout={null} />
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
      <TodayHero firstName={firstName} ftp={ftp} phase={currentPhase} todayStatus={todayStatus} workout={todayWorkout} />

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
  const statusBonus  = todayStatus === "bonus";

  // Time-of-day greeting (Israel is UTC+3 in summer)
  const utcHour = new Date().getUTCHours();
  const localHour = (utcHour + 3) % 24;
  const timeGreeting =
    localHour < 5  ? "Late night," :
    localHour < 12 ? "Good morning," :
    localHour < 17 ? "Good afternoon," :
    localHour < 21 ? "Good evening," : "Good night,";

  // Zwift brand colors
  const ZO = "#F2541B"; // Zwift Orange — primary brand
  const ZB = "#009CDF"; // Zwift Electric Blue — secondary

  // Status pill
  const statusLabel = statusDone ? "Done ✓" : statusMissed ? "Missed" : statusBonus ? "Bonus ride" : "Planned";
  const statusColor = statusDone ? "#22c55e" : statusMissed ? "#ef4444" : statusBonus ? "#f59e0b" : ZB;

  // Today's date label
  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "Asia/Jerusalem",
  });

  const isRun = /run|jog|treadmill/i.test(workout?.type ?? "");

  // Ticker items — personal metrics woven in with brand messages
  const tickerItems = [
    { dot: ZO,       text: "ZWIFT AI TRAINING COACH" },
    { dot: ZB,       text: ftp ? `FTP · ${ftp} W` : "FTP ANALYSIS ACTIVE" },
    { dot: ZO,       text: "REAL-TIME POWER ANALYSIS" },
    { dot: ZB,       text: phase ? `${phase.toUpperCase()} PHASE` : "ADAPTIVE TRAINING ENGINE" },
    { dot: ZO,       text: "TSB · CTL · ATL TRACKING" },
    { dot: ZB,       text: "INTERVALS.ICU SYNC ACTIVE" },
    { dot: ZO,       text: "PHYSIOLOGICAL LOAD MONITOR" },
    { dot: ZB,       text: "PROGRESSIVE OVERLOAD ALGORITHM" },
  ];

  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(140deg, #030c1e 0%, #09162e 55%, #04091a 100%)",
      overflow: "hidden",
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
    }}>
      <style>{`
        @keyframes mHeroPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.2; transform: scale(0.65); }
        }
        @keyframes mHeroTicker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes mHeroAurora {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.15); }
        }
        @keyframes mHeroShimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* ── Neural grid — Zwift Blue tint ── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(0,156,223,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,156,223,0.06) 1px, transparent 1px)
        `,
        backgroundSize: "36px 36px",
        WebkitMaskImage: "radial-gradient(ellipse 120% 100% at 65% 0%, black 0%, transparent 78%)",
        maskImage: "radial-gradient(ellipse 120% 100% at 65% 0%, black 0%, transparent 78%)",
      }} />

      {/* ── Zwift Orange aurora top-right ── */}
      <div style={{
        position: "absolute", top: -90, right: -70, width: 320, height: 320,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(242,84,27,0.28) 0%, transparent 65%)",
        filter: "blur(50px)", pointerEvents: "none",
        animation: "mHeroAurora 9s ease-in-out infinite",
      }} />

      {/* ── Zwift Blue glow bottom-left ── */}
      <div style={{
        position: "absolute", bottom: -30, left: -30, width: 200, height: 200,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,156,223,0.18) 0%, transparent 65%)",
        filter: "blur(35px)", pointerEvents: "none",
        animation: "mHeroAurora 12s ease-in-out infinite reverse",
      }} />

      {/* ── Content area ── */}
      <div style={{ padding: "20px 20px 20px", position: "relative", zIndex: 1 }}>

        {/* Top row: brand chip + date */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 20,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, rgba(242,84,27,0.22), rgba(0,156,223,0.14))",
            border: "1px solid rgba(0,156,223,0.32)",
            borderRadius: 10, padding: "6px 13px 6px 8px",
            boxShadow: "0 0 20px rgba(0,156,223,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}>
            {/* Pulsing live dot */}
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: ZO,
              boxShadow: `0 0 8px ${ZO}`,
              animation: "mHeroPulse 1.8s ease-in-out infinite",
              flexShrink: 0,
            }} />
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: `linear-gradient(135deg, ${ZO} 0%, ${ZB} 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 10px rgba(0,156,223,0.5)`,
            }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="white">
                <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z" />
              </svg>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "0.18em",
              color: "rgba(248,250,252,0.92)", textTransform: "uppercase",
            }}>AI Coach</span>
          </div>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: "rgba(248,250,252,0.38)", letterSpacing: "0.01em",
          }}>
            {dateLabel}
          </div>
        </div>

        {/* Personal greeting */}
        <div style={{ marginBottom: workout ? 16 : 18 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 500,
            color: "rgba(0,156,223,0.85)",
            marginBottom: 1, letterSpacing: "0.02em",
          }}>
            {timeGreeting}
          </div>
          <div style={{
            fontSize: 40, fontWeight: 900, color: "#f8fafc",
            letterSpacing: "-1.4px", lineHeight: 1.0,
          }}>
            {firstName ?? "Athlete"}
          </div>
        </div>

        {/* Workout preview */}
        {workout && (
          <div style={{
            background: statusDone ? "rgba(34,197,94,0.08)" : "rgba(0,156,223,0.06)",
            border: `1px solid ${statusDone ? "rgba(34,197,94,0.28)" : "rgba(0,156,223,0.2)"}`,
            borderRadius: 16, padding: "13px 15px", marginBottom: 14,
            backdropFilter: "blur(10px)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 7,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: statusDone ? "#22c55e" : "rgba(0,156,223,0.8)",
              }}>
                {statusDone ? "Completed" : "Today's Session"}
              </div>
              <div style={{
                padding: "3px 10px", borderRadius: 20,
                background: `${statusColor}1a`, border: `1px solid ${statusColor}40`,
                fontSize: 11, fontWeight: 700, color: statusColor,
              }}>
                {statusLabel}
              </div>
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, color: "#f1f5f9",
              letterSpacing: "-0.3px", lineHeight: 1.2, marginBottom: 7,
            }}>
              {workout.title}
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              {workout.durationMin && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: "rgba(248,250,252,0.45)",
                  background: "rgba(248,250,252,0.06)", padding: "3px 10px", borderRadius: 8,
                }}>
                  {workout.durationMin} min
                </span>
              )}
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: isRun ? "#f97316" : "rgba(0,156,223,0.85)",
                background: isRun ? "rgba(249,115,22,0.1)" : "rgba(0,156,223,0.09)",
                padding: "3px 10px", borderRadius: 8,
              }}>
                {isRun ? "🏃 Run" : "🚴 Ride"}
              </span>
            </div>
          </div>
        )}

        {/* Metric cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <HeroCard label="FTP" value={ftp ? `${ftp} W` : "—"} color={ZB} accent filled={!!ftp} />
          <HeroCard label="Phase" value={phase ?? "—"} color={ZO} filled={!!phase} />
        </div>
      </div>

      {/* ── Animated ticker bar (same as desktop HeroBanner) ── */}
      <div style={{
        borderTop: "1px solid rgba(242,84,27,0.2)",
        background: "linear-gradient(90deg, rgba(0,156,223,0.05), rgba(242,84,27,0.04))",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          animation: "mHeroTicker 32s linear infinite",
          whiteSpace: "nowrap",
          padding: "9px 0",
        }}>
          {/* Doubled for seamless loop */}
          {[0, 1].map(rep => (
            <span key={rep} style={{ display: "inline-flex", alignItems: "center" }}>
              {tickerItems.map((item, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "0 28px",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
                    color: "rgba(248,250,252,0.45)",
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                    textTransform: "uppercase",
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                      background: item.dot,
                      boxShadow: `0 0 6px ${item.dot}`,
                    }} />
                    {item.text}
                  </span>
                  <span style={{ color: "rgba(248,250,252,0.12)", fontSize: 12 }}>·</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroCard({ label, value, color, filled, accent }: {
  label: string; value: string; color: string; filled?: boolean; accent?: boolean;
}) {
  return (
    <div style={{
      background: filled
        ? `${color}0d`
        : "rgba(9,22,46,0.6)",
      border: `1px solid ${filled ? color + "30" : "rgba(0,156,223,0.08)"}`,
      borderRadius: 14,
      padding: "13px 14px",
      position: "relative",
      overflow: "hidden",
    }}>
      {accent && filled && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${color}80, transparent)`,
        }} />
      )}
      <div style={{
        fontSize: 24, fontWeight: 900, color,
        lineHeight: 1, marginBottom: 5,
        fontVariantNumeric: "tabular-nums",
        textShadow: filled ? `0 0 20px ${color}50` : "none",
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, color: "rgba(248,250,252,0.35)",
        fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em",
      }}>
        {label}
      </div>
    </div>
  );
}
