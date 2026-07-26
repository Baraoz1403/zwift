import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import WorkoutCard from "./workout-card";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Map each workout's `day` field to a YYYY-MM-DD date within the given week. */
function buildDateMap(weekOf: string): Record<string, string> {
  // weekOf is the Monday (index 1 in JS getDay → 0 offset in our array)
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

export default async function TodayPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login?next=/today");

  const session = await decryptSession(raw);
  if (!session?.athleteId) redirect("/login?next=/today");

  const weekOf = mondayOfCurrentWeek();
  const plan = await getCachedPlan(String(session.athleteId), weekOf);

  // Today's day name
  const todayDate = new Date();
  const todayStr = todayDate.toISOString().slice(0, 10);
  const todayDayName = DAY_NAMES[todayDate.getDay()];

  // Build date map so we can match workouts to dates
  const dateMap = buildDateMap(weekOf);

  // Annotate workouts with their dates if not already set
  const workouts = (plan?.workouts ?? []).map(w => ({
    ...w,
    date: w.date ?? dateMap[w.day] ?? undefined,
  }));

  // Find today's workout by date or day name
  const todayWorkout =
    workouts.find(w => w.date === todayStr) ??
    workouts.find(w => w.day === todayDayName) ??
    null;

  if (!plan || workouts.length === 0) {
    return (
      <div style={{ width: "100%", maxWidth: 400, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>
          Plan not ready yet
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
          Your weekly plan is being generated. Open the dashboard to trigger it, then come back.
        </div>
        <a
          href="/dashboard"
          style={{
            display: "inline-block", padding: "12px 24px",
            background: "#2563eb", color: "#fff", borderRadius: 12,
            fontSize: 14, fontWeight: 600, textDecoration: "none",
          }}
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  if (!todayWorkout) {
    return (
      <div style={{ width: "100%", maxWidth: 400, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🛋️</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>
          Rest day
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
          No workout scheduled for today. Recovery is training too.
        </div>
        <a
          href="/dashboard"
          style={{
            display: "inline-block", padding: "12px 24px",
            background: "#1e293b", color: "#94a3b8", borderRadius: 12,
            fontSize: 14, textDecoration: "none",
          }}
        >
          See full week
        </a>
      </div>
    );
  }

  return (
    <WorkoutCard
      workout={todayWorkout}
      weekWorkouts={workouts}
      today={todayStr}
    />
  );
}
