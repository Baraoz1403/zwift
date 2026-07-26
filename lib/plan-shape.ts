/**
 * Shared plan-shape helpers - single source of truth for turning whatever
 * the AI returned into a well-formed, gap-free weekly plan with reliable
 * per-workout dates.
 *
 * Previously these lived only inside app/dashboard/weekly-plan.tsx (a
 * client component), which was fine while the only thing that ever built a
 * plan was the browser. Now that a plan can also be generated headlessly
 * (app/api/ai/weekly-plan/cron/route.ts, with no browser involved at all -
 * see lib/plan-runner.ts's doc comment), that logic has to be usable from
 * plain server code too. Duplicating it risked exactly the kind of
 * client/server drift that caused the day-name/date mismatch bug earlier
 * this project (see ensureWorkoutDates' doc comment below) - one copy,
 * imported from both places, is the whole point of this file.
 */
import type { WeeklyPlan, WeeklyWorkout } from "./ai";
import { isRestDay } from "./zwo";

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Ensures every workout has a concrete ISO date string ("YYYY-MM-DD"),
 * computed from the plan's weekOf (Monday, always set by our own code - see
 * weekOfMonday in lib/ai.ts, never by the AI) plus the workout's day-of-week
 * index.
 *
 * This USED to trust the AI's own `date` field whenever it supplied one -
 * LLM date arithmetic is unreliable and doesn't have to be *consistently*
 * wrong to cause damage: a workout could come back with day="Tuesday",
 * date="2026-07-08" (actually a Wednesday) - internally self-contradictory.
 * Everything keyed off `date` (ICU/TP pushes, Zwift's own calendar,
 * weekActivities matching) then disagreed with everything keyed off `day`.
 *
 * The fix: never trust the AI's arithmetic for this. `day` (a weekday name)
 * is a far simpler thing for the model to get right than full date math, and
 * `weekOf` is deterministic (our own code, not the AI's). So `date` is
 * ALWAYS recomputed from those two - the AI's own `date` field, if present,
 * is ignored entirely - guaranteeing day-name and date can never disagree.
 */
export function ensureWorkoutDates(plan: WeeklyPlan): WeeklyPlan {
  const base = new Date(plan.weekOf + "T00:00:00Z");
  return {
    ...plan,
    workouts: plan.workouts.map((w) => {
      const dayIndex = WEEK_DAYS.indexOf(w.day);
      if (dayIndex < 0) return w; // unrecognized day name — leave whatever date it had, if any
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + dayIndex);
      return { ...w, date: d.toISOString().slice(0, 10) };
    }),
  };
}

/**
 * Normalizes the AI's response to exactly one entry per real calendar day
 * (7 - Monday through Sunday). Used to trim down to 6 and silently drop a
 * rest day whenever the AI returned a full 7-day week - a rest day is still
 * a real day and belongs on the grid (and in any downstream sync) like any
 * other; the *display* layer is what decides to only show 6 of the 7 at a
 * time (see computeForwardWindow in weekly-plan.tsx).
 */
export function normalizeToSix(plan: WeeklyPlan): WeeklyPlan {
  let workouts: WeeklyWorkout[] = [...plan.workouts].sort(
    (a, b) => WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day)
  );

  while (workouts.length > 7) {
    const restIdx = workouts.findIndex((w) => isRestDay(w.type));
    if (restIdx >= 0) {
      workouts.splice(restIdx, 1);
    } else {
      workouts.pop();
    }
  }

  if (workouts.length < 7) {
    const usedDays = new Set(workouts.map((w) => w.day));
    for (const day of WEEK_DAYS) {
      if (workouts.length >= 7) break;
      if (!usedDays.has(day)) {
        const dayIndex = WEEK_DAYS.indexOf(day);
        const base = new Date(plan.weekOf + "T00:00:00Z");
        base.setUTCDate(base.getUTCDate() + dayIndex);
        workouts.push({
          day,
          date: base.toISOString().slice(0, 10),
          type: "Rest",
          title: "Rest Day",
          durationMin: 0,
          description: "Active recovery — light walking or stretching is fine.",
        });
        usedDays.add(day);
      }
    }
    workouts.sort((a, b) => WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day));
  }

  return { ...plan, workouts };
}

/** "2026-07-08" -> "Mon Jul 8" - the workout-title prefix shown in Zwift/TP/ICU. */
export function workoutDateLabel(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}
