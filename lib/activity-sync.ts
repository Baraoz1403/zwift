/**
 * lib/activity-sync.ts
 *
 * Compares the athlete's actual completed ICU activities against the
 * AI-generated plan for the current week. Produces a per-date status map
 * that the mobile UI uses to show completed / missed / bonus badges.
 *
 * Runs server-side only (in page.tsx server components) — no API route needed.
 */

import type { WeeklyWorkout } from "@/lib/ai";
import type { IcuActivity } from "@/lib/intervals";

export type DayStatus =
  | "planned"       // workout planned, not yet due or no data
  | "completed"     // planned workout + matching ICU activity found
  | "missed"        // planned workout, date passed, no matching ICU activity
  | "rest"          // rest day, no activity
  | "bonus"         // rest day but athlete did an activity anyway
  | "extra";        // planned different sport but athlete did something

/** ICU activity types that count as "cycling" */
const CYCLING_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide", "MountainBikeRide", "GravelRide"]);
/** ICU activity types that count as "running" */
const RUNNING_TYPES = new Set(["Run", "VirtualRun", "TrailRun", "Walk", "Hike"]);

function isCycling(type: string) { return CYCLING_TYPES.has(type); }
function isRunning(type: string) { return RUNNING_TYPES.has(type); }

/** Whether a plan workout type implies cycling. Defaults to cycling. */
function planIsCycling(workoutType: string): boolean {
  const t = workoutType.toLowerCase();
  return !t.includes("run") && !t.includes("walk") && !t.includes("hike");
}

/** Whether a plan workout is a rest/recovery day. */
function isRestWorkout(workout: WeeklyWorkout): boolean {
  const t = (workout.title + " " + workout.type).toLowerCase();
  return t.includes("rest") || t.includes("recovery") || t.includes("off") || workout.durationMin === 0;
}

/**
 * Returns a map of ISO date → DayStatus for every day of the week.
 *
 * @param workouts  This week's plan workouts (with .date populated)
 * @param activities ICU completed activities for the week
 * @param today      ISO date string (YYYY-MM-DD) of today
 * @param weekDates  All 7 ISO dates for the week (Mon-Sun)
 */
export function computeWeekStatus(
  workouts: (WeeklyWorkout & { date?: string })[],
  activities: IcuActivity[],
  today: string,
  weekDates: string[],
): Record<string, DayStatus> {
  const result: Record<string, DayStatus> = {};

  // Index ICU activities by date (one or more per day)
  const actsByDate = new Map<string, IcuActivity[]>();
  for (const a of activities) {
    const date = a.start_date_local?.slice(0, 10);
    if (!date) continue;
    if (!actsByDate.has(date)) actsByDate.set(date, []);
    actsByDate.get(date)!.push(a);
  }

  for (const date of weekDates) {
    const workout = workouts.find(w => w.date === date);
    const dayActs = actsByDate.get(date) ?? [];
    const hasPassed = date <= today;

    if (!workout || isRestWorkout(workout)) {
      // Rest day
      if (dayActs.length > 0) {
        result[date] = "bonus"; // athlete rode/ran on rest day
      } else {
        result[date] = "rest";
      }
      continue;
    }

    // Planned workout day
    if (dayActs.length === 0) {
      result[date] = hasPassed ? "missed" : "planned";
      continue;
    }

    // Check if any activity matches the planned sport
    const planCycling = planIsCycling(workout.type);
    const sportMatch = dayActs.some(a =>
      planCycling ? isCycling(a.type) : isRunning(a.type)
    );

    result[date] = sportMatch ? "completed" : "extra";
  }

  return result;
}

/** Short human label and color for a day status */
export function statusLabel(s: DayStatus): { text: string; color: string; emoji: string } {
  switch (s) {
    case "completed": return { text: "Done",   color: "#22c55e", emoji: "✓" };
    case "missed":    return { text: "Missed", color: "#ef4444", emoji: "✗" };
    case "bonus":     return { text: "Bonus",  color: "#f59e0b", emoji: "+" };
    case "extra":     return { text: "Done",   color: "#22c55e", emoji: "✓" };
    case "planned":   return { text: "",       color: "#3b82f6", emoji: ""  };
    case "rest":      return { text: "",       color: "#475569", emoji: ""  };
  }
}
