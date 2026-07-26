import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import MobileWorkoutCard from "./workout-card";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function buildDateMap(weekOf: string): Record<string, string> {
  const monday = new Date(weekOf + "T00:00:00Z");
  const dayMap: Record<string, string> = {};
  const planDayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  planDayOrder.forEach((name, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dayMap[name] = d.toISOString().slice(0, 10);
  });
  return dayMap;
}

export default async function MobileTodayPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const weekOf = mondayOfCurrentWeek();
  const plan = await getCachedPlan(String(session.athleteId), weekOf);

  const todayDate = new Date();
  const todayStr = todayDate.toISOString().slice(0, 10);
  const todayDayName = DAY_NAMES[todayDate.getDay()];
  const dateMap = buildDateMap(weekOf);

  const workouts = (plan?.workouts ?? []).map(w => ({
    ...w,
    date: w.date ?? dateMap[w.day] ?? undefined,
  }));

  const todayWorkout =
    workouts.find(w => w.date === todayStr) ??
    workouts.find(w => w.day === todayDayName) ??
    null;

  if (!plan || workouts.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
          Plan not ready yet
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 28 }}>
          Your weekly plan hasn&apos;t been generated yet. Open the dashboard to trigger it.
        </div>
        <a
          href="/dashboard"
          style={{
            display: "inline-block", padding: "14px 28px",
            background: "#2563eb", color: "#fff", borderRadius: 14,
            fontSize: 15, fontWeight: 700, textDecoration: "none",
          }}
        >
          Open Dashboard
        </a>
      </div>
    );
  }

  if (!todayWorkout) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🛋️</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
          Rest day
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
          No workout scheduled today. Recovery is training too.
        </div>
      </div>
    );
  }

  return (
    <MobileWorkoutCard
      workout={todayWorkout}
      weekWorkouts={workouts}
      today={todayStr}
    />
  );
}
