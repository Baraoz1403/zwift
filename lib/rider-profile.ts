/**
 * Rider training profile - the "who are you and what do you want?" layer
 * that was missing from the weekly-plan generator.
 * Stored in localStorage alongside the plan and macro-cycle state.
 */

export type TrainingGoal = "fitness" | "ftp" | "weight" | "event" | "fun";
export type SessionLength = "45" | "60" | "90" | "90plus";
export type Sport = "cycling" | "running" | "both";
export type DaysRange = "1-2" | "2-3" | "3-4" | "4-5" | "5-6";

export interface RiderTrainingProfile {
  goals: TrainingGoal[];     // one or more goals
  daysRange: DaysRange;      // weekly session count range
  sessionLength: SessionLength;
  sports: Sport[];           // one or more disciplines
  ageYears?: number;
  eventDate?: string;
  notes?: string;
  // legacy compat
  goal?: TrainingGoal;
  daysPerWeek?: number;
  sport?: Sport;
}

export const SPORT_LABELS: Record<Sport, string> = {
  cycling: "Cycling",
  running: "Running",
  both:    "Cycling & Running",
};

export const GOAL_LABELS: Record<TrainingGoal, string> = {
  fitness: "Improve overall fitness",
  ftp:     "Increase FTP",
  weight:  "Lose weight / body composition",
  event:   "Train for an event",
  fun:     "Ride for fun",
};

export const DAYS_RANGE_LABELS: Record<DaysRange, string> = {
  "1-2": "1–2 days / week",
  "2-3": "2–3 days / week",
  "3-4": "3–4 days / week",
  "4-5": "4–5 days / week",
  "5-6": "5–6 days / week",
};

/** Midpoint of each range - used to cap session count in the AI prompt. */
export const DAYS_RANGE_MID: Record<DaysRange, number> = {
  "1-2": 1.5,
  "2-3": 2.5,
  "3-4": 3.5,
  "4-5": 4.5,
  "5-6": 5.5,
};

export const SESSION_LENGTH_LABELS: Record<SessionLength, string> = {
  "45":     "Up to 45 min",
  "60":     "45–60 min",
  "90":     "60–90 min",
  "90plus": "90+ min",
};

export const SESSION_LENGTH_MINUTES: Record<SessionLength, number> = {
  "45":     40,
  "60":     55,
  "90":     75,
  "90plus": 100,
};
