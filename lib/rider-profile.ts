/**
 * Rider training profile - the "who are you and what do you want?" layer
 * that was missing from the weekly-plan generator. Previously the AI was
 * handed ride history and told to figure out the rider's goals from their
 * behaviour, which is unreliable. This gives it explicit intent: stated
 * goal, time budget per week, and session length - the three variables that
 * most directly shape what a good plan looks like for this specific person.
 * Stored in localStorage alongside the plan and macro-cycle state.
 */

export type TrainingGoal = "fitness" | "ftp" | "weight" | "event" | "fun";
export type SessionLength = "45" | "60" | "90" | "90plus";
export type Sport = "cycling" | "running" | "both";

export interface RiderTrainingProfile {
  goal: TrainingGoal;
  daysPerWeek: number;       // 1-7
  sessionLength: SessionLength;
  sport?: Sport;             // preferred discipline, optional (defaults to cycling)
  ageYears?: number;         // rider age, optional (auto-derived from Zwift if available)
  eventDate?: string;        // ISO date, optional
  notes?: string;            // free text, optional
}

export const SPORT_LABELS: Record<Sport, string> = {
  cycling: "Cycling",
  running: "Running",
  both:    "Cycling & Running",
};

export const GOAL_LABELS: Record<TrainingGoal, string> = {
  fitness: "Improve overall fitness",
  ftp:     "Increase FTP",
  weight:  "Lose weight",
  event:   "Train for an event",
  fun:     "Ride for fun",
};

export const SESSION_LENGTH_LABELS: Record<SessionLength, string> = {
  "45":      "Up to 45 min",
  "60":      "45–60 min",
  "90":      "60–90 min",
  "90plus":  "90+ min",
};

/** Session length midpoint in minutes - used to cap planned session durations. */
export const SESSION_LENGTH_MINUTES: Record<SessionLength, number> = {
  "45":     40,
  "60":     55,
  "90":     75,
  "90plus": 100,
};
