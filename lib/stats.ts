/**
 * Pure number-crunching over a list of activities already fetched from
 * Zwift (lib/zwift.ts). Nothing here talks to the network - it only
 * derives "interesting" views out of data we already have, for the
 * personal-records, activity-heatmap, and trend-comparison features.
 */
import type { ZwiftActivity } from "./zwift";

function dayKey(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, in UTC
}

function msInDay(): number {
  return 24 * 60 * 60 * 1000;
}

/**
 * Oldest -> newest, the last `count` rides with a usable date - the exact
 * set the "Performance trends" charts draw. Exported so the dashboard page
 * can fetch per-ride extras (e.g. avg heart rate/cadence from each ride's
 * FIT file) for precisely this same set, in this same order, without
 * duplicating the selection logic and risking the two getting out of sync.
 */
export interface ChartExtra {
  avgHeartRate: number | null;
  avgCadence: number | null;
}

/**
 * Per-ride avg heart rate/cadence never changes once a ride is finished, but
 * the dashboard used to re-download and re-parse every ride's FIT file on
 * every single page load - the actual reason it stayed slow even after the
 * FIT work was moved out of the page's critical path with Suspense. Caching
 * each finished ride's result here (keyed by its stable id_str) means only
 * *new* rides since the server last restarted ever need a real download -
 * everything else is an instant in-memory lookup. This is a plain module-level
 * Map rather than a database because the whole app already has no DB; it
 * lives only as long as the Node process does (a `next dev`/`next start`
 * restart clears it, which just means the next load re-downloads, same as
 * before - never wrong, just sometimes a one-time cache miss).
 */
const fitExtrasCache = new Map<string, ChartExtra>();

export function getCachedFitExtras(activity: ZwiftActivity): ChartExtra | undefined {
  const key = activity.id_str ?? String(activity.id);
  return fitExtrasCache.get(key);
}

export function setCachedFitExtras(activity: ZwiftActivity, extra: ChartExtra): void {
  const key = activity.id_str ?? String(activity.id);
  fitExtrasCache.set(key, extra);
}

export function selectChartActivities(activities: ZwiftActivity[], count = 30): ZwiftActivity[] {
  return [...activities]
    .filter((a) => a.startDate)
    .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime())
    .slice(-count);
}

/**
 * Runs `fn` over every item, but only `limit` calls in flight at once
 * (instead of firing all of them at the same instant via Promise.allSettled).
 *
 * The dashboard used to kick off all ~20 FIT-file downloads simultaneously.
 * That was the original trigger for the "Maximum call stack size exceeded"
 * dev-server crash (a Node/undici bug consuming large response bodies) -
 * downloading them one at a time fixed it, but having 20 large downloads
 * land on the event loop in the same instant is exactly the kind of load
 * that bug (and others like it) thrive on. Bounding concurrency is the
 * standard fix for "many parallel large network calls" regardless of which
 * exact internal bug it happens to trip - same end result (every ride still
 * gets fetched), far less simultaneous load on Node's stream/body handling.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      try {
        const value = await fn(items[current], current);
        results[current] = { status: "fulfilled", value };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Strips a raw Zwift activity down to only the fields the dashboard UI
 * actually uses, before it crosses the Server -> Client Component boundary.
 *
 * Real activity objects from Zwift's API can carry extra fields we never
 * asked for and don't control the shape of (the `[key: string]: unknown`
 * index signature on ZwiftActivity exists for exactly this reason). Passing
 * those raw objects as props into client components means Next.js has to
 * serialize whatever happens to be in them. Sending only this fixed, known
 * shape instead is both smaller and removes that as a variable.
 */
/**
 * Zwift puts a redundant "Zwift - " prefix on the name of basically every
 * ride - since every ride here is obviously already a Zwift ride, showing
 * that word on every single row/card/tile is just noise. Strip it once here
 * so it disappears everywhere a ride name is displayed.
 */
export function cleanRideName(name?: string | null): string | undefined {
  if (!name) return name ?? undefined;
  const stripped = name.replace(/^\s*zwift\s*[-–:]\s*/i, "").trim();
  return stripped || name;
}

export function toClientActivity(a: ZwiftActivity): ZwiftActivity {
  return {
    id: a.id,
    id_str: a.id_str,
    name: cleanRideName(a.name),
    sport: a.sport,
    startDate: a.startDate,
    distanceInMeters: a.distanceInMeters,
    movingTimeInMs: a.movingTimeInMs,
    avgWatts: a.avgWatts,
    totalElevation: a.totalElevation,
    worldId: a.worldId,
    calories: a.calories,
  };
}

// ---------- Personal records ----------

export interface PersonalRecords {
  totalRides: number;
  totalDistanceM: number;
  totalTimeMs: number;
  totalElevationM: number;
  longestDistance: { meters: number; activity: ZwiftActivity } | null;
  longestDuration: { ms: number; activity: ZwiftActivity } | null;
  highestAvgPower: { watts: number; activity: ZwiftActivity } | null;
  biggestClimb: { meters: number; activity: ZwiftActivity } | null;
  longestStreakDays: number;
  currentStreakDays: number;
}

export function computeRecords(activities: ZwiftActivity[]): PersonalRecords {
  let totalDistanceM = 0;
  let totalTimeMs = 0;
  let totalElevationM = 0;
  let longestDistance: PersonalRecords["longestDistance"] = null;
  let longestDuration: PersonalRecords["longestDuration"] = null;
  let highestAvgPower: PersonalRecords["highestAvgPower"] = null;
  let biggestClimb: PersonalRecords["biggestClimb"] = null;

  for (const a of activities) {
    totalDistanceM += a.distanceInMeters ?? 0;
    totalTimeMs += a.movingTimeInMs ?? 0;
    totalElevationM += a.totalElevation ?? 0;

    if (a.distanceInMeters && (!longestDistance || a.distanceInMeters > longestDistance.meters)) {
      longestDistance = { meters: a.distanceInMeters, activity: a };
    }
    if (a.movingTimeInMs && (!longestDuration || a.movingTimeInMs > longestDuration.ms)) {
      longestDuration = { ms: a.movingTimeInMs, activity: a };
    }
    if (a.avgWatts && (!highestAvgPower || a.avgWatts > highestAvgPower.watts)) {
      highestAvgPower = { watts: a.avgWatts, activity: a };
    }
    if (a.totalElevation && (!biggestClimb || a.totalElevation > biggestClimb.meters)) {
      biggestClimb = { meters: a.totalElevation, activity: a };
    }
  }

  // Streaks: unique ride-days, sorted, then walk for the longest run of
  // consecutive calendar days and whether "today" is still part of one.
  const uniqueDays = Array.from(
    new Set(activities.map((a) => dayKey(a.startDate)).filter((d): d is string => d !== null))
  ).sort();

  let longestStreakDays = 0;
  let runStart = 0;
  for (let i = 0; i < uniqueDays.length; i++) {
    if (i > 0) {
      const prev = new Date(uniqueDays[i - 1]).getTime();
      const cur = new Date(uniqueDays[i]).getTime();
      if (cur - prev > msInDay()) {
        runStart = i;
      }
    }
    longestStreakDays = Math.max(longestStreakDays, i - runStart + 1);
  }

  let currentStreakDays = 0;
  if (uniqueDays.length > 0) {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const yesterdayKey = new Date(today.getTime() - msInDay()).toISOString().slice(0, 10);
    const last = uniqueDays[uniqueDays.length - 1];
    if (last === todayKey || last === yesterdayKey) {
      currentStreakDays = 1;
      for (let i = uniqueDays.length - 1; i > 0; i--) {
        const prev = new Date(uniqueDays[i - 1]).getTime();
        const cur = new Date(uniqueDays[i]).getTime();
        if (cur - prev === msInDay()) {
          currentStreakDays++;
        } else {
          break;
        }
      }
    }
  }

  return {
    totalRides: activities.length,
    totalDistanceM,
    totalTimeMs,
    totalElevationM,
    longestDistance,
    longestDuration,
    highestAvgPower,
    biggestClimb,
    longestStreakDays,
    currentStreakDays,
  };
}

// ---------- Activity heatmap ----------

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  distanceM: number;
  movingTimeMs: number;
  rides: number;
}

/**
 * One entry per calendar day for the last `days` days (default ~26 weeks,
 * GitHub-contributions style), oldest first, including empty rest days -
 * the grid needs every day present to line up into even week columns.
 */
export function buildHeatmap(activities: ZwiftActivity[], days = 182): HeatmapDay[] {
  const byDay = new Map<string, HeatmapDay>();
  for (const a of activities) {
    const key = dayKey(a.startDate);
    if (!key) continue;
    const existing = byDay.get(key) ?? { date: key, distanceM: 0, movingTimeMs: 0, rides: 0 };
    existing.distanceM += a.distanceInMeters ?? 0;
    existing.movingTimeMs += a.movingTimeInMs ?? 0;
    existing.rides += 1;
    byDay.set(key, existing);
  }

  const out: HeatmapDay[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * msInDay());
    const key = d.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? { date: key, distanceM: 0, movingTimeMs: 0, rides: 0 });
  }
  return out;
}

// ---------- Trend comparison ----------

export type TrendPeriod = "week" | "month";

export interface PeriodAgg {
  rides: number;
  distanceM: number;
  movingTimeMs: number;
  elevationM: number;
  avgWatts: number | null;
}

export interface TrendDelta {
  value: number;
  pct: number | null; // null when previous was 0 (can't divide)
}

export interface TrendResult {
  period: TrendPeriod;
  current: PeriodAgg;
  previous: PeriodAgg;
  deltas: {
    rides: TrendDelta;
    distanceM: TrendDelta;
    movingTimeMs: TrendDelta;
    elevationM: TrendDelta;
    avgWatts: TrendDelta;
  };
}

function periodRangeMs(period: TrendPeriod): number {
  return period === "week" ? 7 * msInDay() : 30 * msInDay();
}

function aggregate(activities: ZwiftActivity[], fromMs: number, toMs: number): PeriodAgg {
  const inRange = activities.filter((a) => {
    if (!a.startDate) return false;
    const t = new Date(a.startDate).getTime();
    return !isNaN(t) && t >= fromMs && t < toMs;
  });
  const distanceM = inRange.reduce((s, a) => s + (a.distanceInMeters ?? 0), 0);
  const movingTimeMs = inRange.reduce((s, a) => s + (a.movingTimeInMs ?? 0), 0);
  const elevationM = inRange.reduce((s, a) => s + (a.totalElevation ?? 0), 0);
  const withPower = inRange.filter((a) => a.avgWatts);
  const avgWatts =
    withPower.length > 0 ? withPower.reduce((s, a) => s + (a.avgWatts ?? 0), 0) / withPower.length : null;
  return { rides: inRange.length, distanceM, movingTimeMs, elevationM, avgWatts };
}

function delta(current: number, previous: number): TrendDelta {
  return {
    value: current - previous,
    pct: previous !== 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export function computeTrend(activities: ZwiftActivity[], period: TrendPeriod): TrendResult {
  const now = Date.now();
  const span = periodRangeMs(period);
  const current = aggregate(activities, now - span, now);
  const previous = aggregate(activities, now - span * 2, now - span);

  return {
    period,
    current,
    previous,
    deltas: {
      rides: delta(current.rides, previous.rides),
      distanceM: delta(current.distanceM, previous.distanceM),
      movingTimeMs: delta(current.movingTimeMs, previous.movingTimeMs),
      elevationM: delta(current.elevationM, previous.elevationM),
      avgWatts: delta(current.avgWatts ?? 0, previous.avgWatts ?? 0),
    },
  };
}
