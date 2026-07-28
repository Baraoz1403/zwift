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
import type { ZwiftActivity } from "@/lib/zwift";

/**
 * Convert a Zwift activity to the IcuActivity shape used by computeWeekStatus.
 *
 * This lets us merge Zwift-direct activities with ICU activities so that rides
 * done in Zwift are always counted — even when the athlete has NOT set up the
 * Zwift → Intervals.icu sync in their ICU account.
 *
 * Zwift sport strings: "CYCLING", "RUNNING", "SWIMMING", etc.
 * ICU type strings:    "VirtualRide", "Run", "Ride", etc.
 */
export function zwiftActivityToIcu(act: ZwiftActivity): IcuActivity {
  // Map Zwift sport → ICU type
  let type = "VirtualRide";
  const sport = (act.sport as string | undefined)?.toUpperCase() ?? "";
  if (sport.includes("RUN"))  type = "VirtualRun";
  else if (sport.includes("SWIM")) type = "Swim";

  // Zwift startDate is ISO with Z: "2026-07-28T06:30:00.000Z"
  // IcuActivity expects local ISO without Z: "2026-07-28T06:30:00"
  const startLocal = act.startDate
    ? act.startDate.replace("Z", "").replace(/\.\d+$/, "")
    : "";

  return {
    id: act.id,
    type,
    start_date_local: startLocal,
    name: (act.name as string | undefined) ?? "Zwift activity",
    moving_time: act.movingTimeInMs ? Math.round(act.movingTimeInMs / 1000) : undefined,
    average_watts: (act.avgWatts as number | undefined) ?? null,
    average_heartrate: (act.avgHeartRate as number | undefined) ?? null,
    distance: (act.distanceInMeters as number | undefined) ?? undefined,
    // Flag so callers can identify the source
    _source: "zwift",
  };
}

/**
 * Merge ICU activities and Zwift-converted activities, deduplicating by date+sport.
 * ICU takes precedence — if ICU already has a ride on a given date, the Zwift
 * entry for that same date+sport is dropped (ICU likely got it from Zwift sync).
 */
export function mergeActivities(
  icuActivities: IcuActivity[],
  zwiftActivities: IcuActivity[],
): IcuActivity[] {
  // Build a set of "date|normalizedSport" already covered by ICU
  const CYCLING_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide", "MountainBikeRide", "GravelRide"]);
  const RUNNING_TYPES = new Set(["Run", "VirtualRun", "TrailRun"]);

  const key = (a: IcuActivity) => {
    const date = (a.start_date_local ?? "").slice(0, 10);
    const sport = CYCLING_TYPES.has(a.type) ? "cycling"
      : RUNNING_TYPES.has(a.type) ? "running"
      : a.type.toLowerCase();
    return `${date}|${sport}`;
  };

  const covered = new Set(icuActivities.map(key));
  const newFromZwift = zwiftActivities.filter(a => !covered.has(key(a)));
  return [...icuActivities, ...newFromZwift];
}

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

  // Index ICU activities by date (one or more per day).
  // ICU returns start_date_local (local time); fall back to start_date if absent.
  const actsByDate = new Map<string, IcuActivity[]>();
  for (const a of activities) {
    const raw = a.start_date_local ?? (a as Record<string, unknown>).start_date as string | undefined;
    const date = raw?.slice(0, 10);
    if (!date) continue;
    if (!actsByDate.has(date)) actsByDate.set(date, []);
    actsByDate.get(date)!.push(a);
  }

  for (const date of weekDates) {
    const workout = workouts.find(w => w.date === date);
    const dayActs = actsByDate.get(date) ?? [];
    // date < today: only mark as missed for PAST days, not today.
    // Today with no ICU activity yet = "planned" (the day isn't over).
    const hasPassed = date < today;

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
