import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import WeekView from "./week-view";

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

export default async function MobileWeekPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login?next=/m");
  const session = await decryptSession(raw);
  if (!session?.athleteId) redirect("/login?next=/m");

  const weekOf = mondayOfCurrentWeek();
  const plan = await getCachedPlan(String(session.athleteId), weekOf);

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateMap = buildDateMap(weekOf);

  const workouts = (plan?.workouts ?? []).map(w => ({
    ...w,
    date: w.date ?? dateMap[w.day] ?? undefined,
  }));

  return (
    <WeekView
      workouts={workouts}
      weekOf={weekOf}
      today={todayStr}
      summary={plan?.summary ?? null}
    />
  );
}
