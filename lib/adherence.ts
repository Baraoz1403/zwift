/**
 * Plan-vs-actual feedback loop - Layer 4 of the training-knowledge
 * infrastructure. Compares the previous week's plan (cached client-side,
 * since this app still has no database) against what the rider actually
 * rode, and turns it into a short, human-readable summary handed to the AI
 * before it builds the next week's plan. This is the piece that turns
 * "computes a plan" into "a coach who knows whether last week's plan
 * actually worked for this rider" - without it, a consistently-skipped
 * Thursday interval session would just repeat forever, unnoticed.
 */
import type { RideSummary, WeeklyWorkout } from "./ai";

export interface AdherenceSummary {
  weekOf: string;
  /** Non-rest planned sessions only - rest days aren't "missed" if skipped. */
  plannedSessions: number;
  completedSessions: number;
  missedSessions: number;
  /** Short, specific call-outs (max 6) - e.g. "Thu (Sweet Spot): planned
   *  but not completed." Capped so the prompt stays compact. */
  notes: string[];
}

function parsePctRange(pct?: string): [number, number] | null {
  if (!pct) return null;
  const m = pct.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]) / 100, Number(m[2]) / 100];
}

export function computeAdherence(
  previousPlan: { weekOf: string; workouts: WeeklyWorkout[] },
  rides: RideSummary[],
  ftp?: number
): AdherenceSummary {
  const ridesByDate = new Map<string, RideSummary[]>();
  for (const r of rides) {
    if (!r.date) continue;
    const key = r.date.slice(0, 10);
    const list = ridesByDate.get(key) ?? [];
    list.push(r);
    ridesByDate.set(key, list);
  }

  let plannedSessions = 0;
  let completedSessions = 0;
  let missedSessions = 0;
  const notes: string[] = [];

  for (const w of previousPlan.workouts) {
    const isRest = /rest/i.test(w.type);
    const dayRides = w.date ? ridesByDate.get(w.date) ?? [] : [];

    if (isRest) {
      if (dayRides.length > 0) {
        notes.push(`${w.day}: rode anyway on a scheduled rest day.`);
      }
      continue;
    }

    plannedSessions++;
    if (dayRides.length === 0) {
      missedSessions++;
      notes.push(`${w.day} (${w.type}): planned but not completed.`);
      continue;
    }

    completedSessions++;
    const actualMin = dayRides.reduce((s, r) => s + (r.durationMin || 0), 0);
    if (w.durationMin > 0 && actualMin < w.durationMin * 0.6) {
      notes.push(
        `${w.day} (${w.type}): completed but notably shorter than planned (${actualMin} of ${w.durationMin} min).`
      );
    }

    // Only judge intensity when both an FTP and a parsed target % range
    // exist - generous +/-15% bands to allow for real-world pacing
    // variance. Prefers each ride's Normalized Power over plain avgWatts
    // when available (lib/stats.ts computeNormalizedPower) - for an
    // interval session in particular, whole-ride avgWatts is diluted by the
    // recovery segments and will look "under target" even when the rider
    // nailed every interval, whereas NP reflects the true session intensity.
    const pctRange = parsePctRange(w.targetPowerPctFtp);
    if (pctRange && ftp && ftp > 0) {
      const bestWatts = Math.max(...dayRides.map((r) => r.normalizedPower ?? r.avgWatts ?? 0));
      const [lowPct, highPct] = pctRange;
      const lowWatts = ftp * lowPct * 0.85;
      const highWatts = ftp * highPct * 1.15;
      if (bestWatts < lowWatts) {
        notes.push(`${w.day} (${w.type}): completed, but average power was below the planned target.`);
      } else if (bestWatts > highWatts) {
        notes.push(`${w.day} (${w.type}): completed at notably higher intensity than planned.`);
      }
    }
  }

  return {
    weekOf: previousPlan.weekOf,
    plannedSessions,
    completedSessions,
    missedSessions,
    notes: notes.slice(0, 6),
  };
}
