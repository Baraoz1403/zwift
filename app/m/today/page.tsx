import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { computeWeekStatus, statusLabel } from "@/lib/activity-sync";
import MobileWorkoutCard from "./workout-card";
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

  // Parallel: plan fetch + ICU credentials (avoid sequential KV round-trips)
  const cookieKeyEarly = cookieStore.get("zwift_intervals_key")?.value;
  const [plan, earlyKvCreds] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKeyEarly ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
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
  // Fast path: cookies (already present if ICU connected in same browser).
  // Fall back once to KV for cross-device (phone after connecting on desktop).
  // Hard timeout: 1.5 s max — a slow ICU response must never block the page.
  let weekStatus: Record<string, DayStatus> = {};
  try {
    const cookieKey = cookieStore.get("zwift_intervals_key")?.value;
    const cookieId  = cookieStore.get("zwift_intervals_id")?.value;
    // Use credentials already fetched in parallel above — no extra KV call
    const icuKey = cookieKey ?? earlyKvCreds?.icuKey;
    const icuId  = cookieId  ?? earlyKvCreds?.icuId;

    if (icuKey && icuId) {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("icu_timeout")), 1500)
      );
      const activities = await Promise.race([
        fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
        timeout,
      ]);
      weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);
    }
  } catch { /* best-effort — status stays "planned" if ICU slow/unavailable */ }

  const todayStatus: DayStatus = weekStatus[todayStr] ?? "planned";
  const todayWorkout =
    workouts.find(w => w.date === todayStr) ??
    workouts.find(w => w.day === todayDayName) ??
    null;

  if (!plan || workouts.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>
          Plan not ready yet
        </div>
        <div style={{ fontSize: 15, color: "#64748b", lineHeight: 1.65, marginBottom: 28 }}>
          Your weekly plan hasn&apos;t been generated yet. Open the dashboard to trigger it.
        </div>
        <a href="/dashboard" style={{
          display: "inline-block", padding: "15px 30px",
          background: "#2563eb", color: "#fff", borderRadius: 14,
          fontSize: 16, fontWeight: 700, textDecoration: "none",
        }}>
          Open Dashboard
        </a>
      </div>
    );
  }

  // ── Rest day but athlete rode anyway → Bonus ride screen ─────────────────
  if (!todayWorkout || todayStatus === "bonus") {
    const isBonus = todayStatus === "bonus";
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
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
    );
  }

  return (
    <MobileWorkoutCard
      workout={todayWorkout}
      weekWorkouts={workouts}
      today={todayStr}
      todayStatus={todayStatus}
      weekStatus={weekStatus}
    />
  );
}
