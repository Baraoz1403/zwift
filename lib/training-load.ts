/**
 * Deterministic training-load model - the foundation of the "rider
 * readiness" layer feeding generateWeeklyPlan (lib/ai.ts).
 *
 * Until now the AI was handed a flat list of recent rides and asked to
 * eyeball signs of fatigue/frequency itself, from scratch, on every single
 * call. This computes the same kind of numbers real coaching software does
 * - a simplified version of the standard Coggan/TrainingPeaks ATL/CTL/TSB
 * model: a short-window "fatigue" average and a long-window "fitness"
 * average of daily training stress, whose gap ("freshness"/TSB) is the
 * classic readiness signal - once, in code, so the model is told the answer
 * instead of guessing it from raw dates each time.
 *
 * This is intentionally a simplification, not a clinical-grade TSS engine:
 * each ride's "intensity factor" is avgWatts / FTP (or, when no FTP is on
 * file, avgWatts relative to the rider's own recent peak avgWatts, so the
 * numbers still mean something in relative terms). Real TSS uses Normalized
 * Power, which runs higher than plain average power on anything but a
 * dead-steady ride, so this proxy tends to slightly *underestimate* true
 * stress on highly variable rides - fine for a relative week-to-week trend
 * signal, which is all this is used for.
 */
import type { RideSummary } from "./ai";

export interface TrainingLoadSummary {
  /** Chronic Training Load - ~42-day exponentially weighted average daily
   *  stress ("fitness"). Higher = more built-up aerobic base. */
  ctl: number;
  /** Acute Training Load - ~7-day exponentially weighted average daily
   *  stress ("fatigue"). Higher = more recent hard/frequent riding. */
  atl: number;
  /** ctl - atl (Training Stress Balance). Clearly positive = fresh/rested;
   *  clearly negative = carrying fatigue; near zero = balanced. */
  tsb: number;
  freshness: "fresh" | "neutral" | "fatigued";
  /** Rides in the most recent 7 days vs the 7 days before that - lets the
   *  plan react to a frequency change without re-deriving it from raw dates. */
  ridesLast7Days: number;
  ridesPrior7Days: number;
}

const ATL_DAYS = 7;
const CTL_DAYS = 42;

function dayKey(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Coggan TSS shape (durationHours * intensityFactor^2 * 100). Uses the
 * ride's real Normalized Power (lib/stats.ts computeNormalizedPower, from
 * the FIT file's per-second power stream) when available - that's what
 * actual TSS is defined against, and it correctly assigns more stress to a
 * spiky interval ride than a steady ride with the same average watts, which
 * plain avgWatts cannot distinguish. Falls back to avgWatts only when NP
 * couldn't be computed for that ride (no power meter that day, or too short
 * for a 30s window) - still useful as a relative trend signal, just less
 * precise, exactly as the old always-avgWatts version was for every ride.
 */
function tssProxy(ride: RideSummary, referenceWatts: number): number {
  const effortWatts = ride.normalizedPower ?? ride.avgWatts;
  if (!ride.durationMin || ride.durationMin <= 0 || !effortWatts || referenceWatts <= 0) return 0;
  const intensityFactor = effortWatts / referenceWatts;
  const durationHours = ride.durationMin / 60;
  return durationHours * intensityFactor * intensityFactor * 100;
}

/**
 * Computes the rider's current training load/freshness from their recent
 * ride history. `asOf` defaults to now - the model answers "how fresh is
 * this rider right now, about to plan their next week", not any past date.
 */
export function computeTrainingLoad(
  rides: RideSummary[],
  ftp?: number,
  asOf: Date = new Date()
): TrainingLoadSummary {
  const dated = rides.filter((r) => dayKey(r.date) !== null);

  if (dated.length === 0) {
    return { ctl: 0, atl: 0, tsb: 0, freshness: "neutral", ridesLast7Days: 0, ridesPrior7Days: 0 };
  }

  const referenceWatts = ftp && ftp > 0 ? ftp : Math.max(1, ...dated.map((r) => r.avgWatts || 0));

  const dailyStressByDate: Record<string, number> = {};
  for (const r of dated) {
    const key = dayKey(r.date)!;
    dailyStressByDate[key] = (dailyStressByDate[key] ?? 0) + tssProxy(r, referenceWatts);
  }

  const earliestKey = dated.reduce<string>((min, r) => {
    const k = dayKey(r.date)!;
    return k < min ? k : min;
  }, dayKey(dated[0].date)!);

  const lookbackStart = new Date(asOf.getTime() - CTL_DAYS * 86400000);
  const earliestDate = new Date(earliestKey);
  const startDate = earliestDate.getTime() < lookbackStart.getTime() ? lookbackStart : earliestDate;

  // Walk day-by-day from the start date up to `asOf`, decaying both
  // exponentially weighted averages daily - same shape as the standard
  // ATL/CTL model, driven by our own daily stress proxy.
  let atl = 0;
  let ctl = 0;
  const atlDecay = Math.exp(-1 / ATL_DAYS);
  const ctlDecay = Math.exp(-1 / CTL_DAYS);
  for (const d = new Date(startDate); d.getTime() <= asOf.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const stress = dailyStressByDate[key] ?? 0;
    atl = atl * atlDecay + stress * (1 - atlDecay);
    ctl = ctl * ctlDecay + stress * (1 - ctlDecay);
  }

  const daysAgo = (key: string) => (asOf.getTime() - new Date(key).getTime()) / 86400000;
  const ridesLast7Days = dated.filter((r) => {
    const a = daysAgo(dayKey(r.date)!);
    return a >= 0 && a < 7;
  }).length;
  const ridesPrior7Days = dated.filter((r) => {
    const a = daysAgo(dayKey(r.date)!);
    return a >= 7 && a < 14;
  }).length;

  const tsb = ctl - atl;
  // Thresholds are heuristic, tuned to this proxy's own scale rather than
  // literal TrainingPeaks calibration - they only drive a convenience label;
  // the raw ctl/atl/tsb numbers (sent to the AI as-is) are the real signal.
  const freshness: TrainingLoadSummary["freshness"] = tsb > 5 ? "fresh" : tsb < -5 ? "fatigued" : "neutral";

  return {
    ctl: round1(ctl),
    atl: round1(atl),
    tsb: round1(tsb),
    freshness,
    ridesLast7Days,
    ridesPrior7Days,
  };
}
