/**
 * lib/icu-performance-context.ts
 *
 * Converts the last 30 completed ICU activities into a structured prompt
 * section that the AI injects when building the weekly training plan.
 *
 * Weighting scheme (user-defined):
 *   Performance metrics  →  50% most recent 10 / 30% middle 10 / 20% oldest 10
 *   Behavioral patterns  →  equal weight across all 30 (recency bias irrelevant
 *                            for detecting skip-day habits, preferred effort zones, etc.)
 *
 * This replaces "hope the AI picks well based on vague stats" with a concrete,
 * data-driven snapshot that survives the prompt's limited context window.
 */

import type { IcuActivity } from "@/lib/intervals";

const TRAINING_TYPES = new Set([
  "Ride", "VirtualRide", "GravelRide", "MountainBikeRide",
  "Run", "VirtualRun", "Workout", "EBikeRide",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(nums: number[]): number | null {
  const valid = nums.filter(n => n > 0 && Number.isFinite(n));
  if (!valid.length) return null;
  return valid.reduce((s, n) => s + n, 0) / valid.length;
}

function round1(n: number | null): string {
  return n == null ? "n/a" : n.toFixed(1);
}

function round0(n: number | null): string {
  return n == null ? "n/a" : Math.round(n).toString();
}

interface GroupStats {
  count: number;
  avgTss: number | null;
  avgPower: number | null;   // null when no power data in group
  avgHr: number | null;
  avgDurationMin: number | null;
}

function computeGroupStats(acts: IcuActivity[]): GroupStats {
  const tssList = acts.map(a => a.icu_training_load ?? 0).filter(Boolean) as number[];
  const powerList = acts
    .map(a => a.normalized_power ?? a.average_watts ?? 0)
    .filter(p => p > 0) as number[];
  const hrList = acts
    .map(a => a.average_heartrate ?? 0)
    .filter(h => h > 0) as number[];
  const durList = acts
    .map(a => (a.moving_time ?? 0) / 60)
    .filter(d => d > 0);

  return {
    count: acts.length,
    avgTss: avg(tssList),
    avgPower: avg(powerList),
    avgHr: avg(hrList),
    avgDurationMin: avg(durList),
  };
}

function weightedAvg(
  g1: number | null, g2: number | null, g3: number | null,
  w1 = 0.5, w2 = 0.3, w3 = 0.2,
): number | null {
  let sum = 0, totalW = 0;
  if (g1 != null) { sum += g1 * w1; totalW += w1; }
  if (g2 != null) { sum += g2 * w2; totalW += w2; }
  if (g3 != null) { sum += g3 * w3; totalW += w3; }
  return totalW === 0 ? null : sum / totalW;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a concise, AI-readable performance context block from the last 30
 * completed training activities.
 *
 * @param rawActivities  All activities fetched from ICU (any count, any order).
 *                       This function filters to training types, sorts newest-first,
 *                       and uses at most 30.
 * @returns              Multi-line string ready to append to the AI system prompt.
 *                       Empty string if < 3 usable activities (not enough signal).
 */
export function buildIcuPerformanceContext(rawActivities: IcuActivity[]): string {
  // Sort newest-first, filter to real training activities
  const activities = rawActivities
    .filter(a => TRAINING_TYPES.has(a.type))
    .sort((a, b) =>
      (b.start_date_local ?? "").localeCompare(a.start_date_local ?? ""),
    )
    .slice(0, 30);

  if (activities.length < 3) return "";   // not enough data to say anything useful

  // ── Split into 3 recency groups ──────────────────────────────────────────
  const g1 = activities.slice(0, 10);           // most recent 10 → weight 50%
  const g2 = activities.slice(10, 20);          // middle 10      → weight 30%
  const g3 = activities.slice(20, 30);          // oldest 10      → weight 20%

  const s1 = computeGroupStats(g1);
  const s2 = computeGroupStats(g2);
  const s3 = computeGroupStats(g3);

  const wTss     = weightedAvg(s1.avgTss, s2.avgTss, s3.avgTss);
  const wPower   = weightedAvg(s1.avgPower, s2.avgPower, s3.avgPower);
  const wHr      = weightedAvg(s1.avgHr, s2.avgHr, s3.avgHr);
  const wDurMin  = weightedAvg(s1.avgDurationMin, s2.avgDurationMin, s3.avgDurationMin);

  // Trend: recent group vs older groups
  const olderTss = weightedAvg(s2.avgTss, s3.avgTss, null, 0.6, 0.4, 0);
  const tssTrend =
    wTss == null || olderTss == null ? "stable" :
    wTss > olderTss * 1.08  ? "increasing (+8%+)" :
    wTss < olderTss * 0.92  ? "decreasing (-8%+)" :
    "stable";

  // ── Behavioral patterns (equal weight across all 30) ─────────────────────

  // Activity frequency by day-of-week
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayCounts = new Array(7).fill(0) as number[];
  for (const a of activities) {
    if (a.start_date_local) {
      const d = new Date(a.start_date_local);
      dayCounts[d.getDay()]++;
    }
  }
  const activeDays = dayNames
    .map((name, i) => ({ name, count: dayCounts[i] }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count);
  const topDays = activeDays.slice(0, 4).map(d => `${d.name}(${d.count}x)`).join(", ");

  // Typical skip days (days with 0 sessions across 30 activities)
  const skipDays = dayNames
    .map((name, i) => ({ name, count: dayCounts[i] }))
    .filter(d => d.count === 0)
    .map(d => d.name);

  // Activity type breakdown
  const typeCounts: Record<string, number> = {};
  for (const a of activities) {
    typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1;
  }
  const typeBreakdown = Object.entries(typeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([t, n]) => `${t}:${n}`)
    .join(", ");

  // Weekly volume estimate (simple: count activities, group by ISO week)
  const weekMap: Record<string, number> = {};
  for (const a of activities) {
    if (!a.start_date_local) continue;
    const d = new Date(a.start_date_local);
    // ISO week key: year-week
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    const key = `${d.getFullYear()}-${weekNum}`;
    weekMap[key] = (weekMap[key] ?? 0) + 1;
  }
  const weekCounts = Object.values(weekMap);
  const avgSessionsPerWeek = avg(weekCounts);

  // Recent 10 TSS by type (to detect power sport mix)
  const rideActivities = g1.filter(a => a.type.toLowerCase().includes("ride") || a.type === "Workout");
  const runActivities  = g1.filter(a => a.type.toLowerCase().includes("run"));
  const hasRuns = runActivities.length > 0;
  const hasRides = rideActivities.length > 0;

  // ── Format output ────────────────────────────────────────────────────────
  const lines: string[] = [
    "## ATHLETE PERFORMANCE HISTORY (last 30 activities, ICU data)",
    "",
    "**Weighted performance summary** (50% last 10 / 30% mid 10 / 20% oldest 10):",
    `- Avg session TSS: ${round1(wTss)} (trend: ${tssTrend})`,
    `- Avg normalized power: ${wPower ? round0(wPower) + "W" : "n/a (no power meter or run-only)"}`,
    `- Avg heart rate: ${wHr ? round0(wHr) + " bpm" : "n/a"}`,
    `- Avg session duration: ${wDurMin ? round0(wDurMin) + " min" : "n/a"}`,
    "",
    "**Recent 10 sessions** (highest recency — most important signal):",
    `- Count: ${s1.count} sessions`,
    `- Avg TSS: ${round1(s1.avgTss)}, Avg power: ${s1.avgPower ? round0(s1.avgPower) + "W" : "n/a"}, Avg HR: ${s1.avgHr ? round0(s1.avgHr) + " bpm" : "n/a"}`,
    `- Avg duration: ${s1.avgDurationMin ? round0(s1.avgDurationMin) + " min" : "n/a"}`,
    "",
    "**Behavioral patterns** (equal weight all 30 sessions):",
    `- Activity types: ${typeBreakdown || "n/a"}`,
    `- Most active days: ${topDays || "n/a"}`,
    skipDays.length > 0 ? `- Consistent rest days (no sessions): ${skipDays.join(", ")}` : "- No consistent rest days detected",
    `- Avg sessions/week: ${round1(avgSessionsPerWeek)}`,
    hasRides && hasRuns ? `- Multi-sport: mix of cycling (${rideActivities.length}/10 recent) and running (${runActivities.length}/10 recent) — plan accordingly` : "",
  ].filter(line => line !== "");

  lines.push(
    "",
    "**Planning directive**: Use this data to calibrate TSS targets, session duration,",
    "and intensity. Do NOT repeat workouts the athlete clearly isn't responding to",
    "(consistently low HR or power vs targets = wrong stimulus). Match volume to",
    "demonstrated weekly capacity. Respect the observed rest days.",
  );

  return lines.join("\n");
}
