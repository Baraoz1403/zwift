/**
 * lib/rider-fingerprint.ts — Accumulated per-rider memory.
 *
 * The rider fingerprint is a persistent, growing picture of how a specific
 * rider responds to training. It records session feeling scores (1–5),
 * workout-type response patterns, FTP trajectory, and weekly skip habits.
 *
 * The fingerprint is injected into the AI coaching prompt each time a plan is
 * generated, so the coach learns the individual over time instead of treating
 * every plan generation as a fresh start.
 *
 * Storage: Vercel KV — key `zwift:{athleteId}:fingerprint`
 * All operations are best-effort and never throw.
 */

import { kvGet, kvSet, kvAvailable } from "./kv";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single logged session with a post-workout feeling score. */
export interface SessionLogEntry {
  date: string;          // ISO date "2025-07-01"
  workoutTitle: string;  // e.g. "Sweet Spot Classic"
  category: string;      // e.g. "Sweet Spot", "VO2max", "Recovery"
  feelingScore: number;  // 1 (💀 destroyed) – 5 (💪 felt great)
  note?: string;         // optional free-text from rider
}

/** Aggregated response pattern per workout category. */
export interface CategoryResponse {
  totalSessions: number;
  avgFeelingScore: number;   // rolling average, 1–5
  lastFeelingScore: number;
  lastSessionDate: string;
}

/** Complete fingerprint for one rider. */
export interface RiderFingerprint {
  /**
   * Per workout-category response patterns.
   * Key = category string (e.g. "Sweet Spot", "VO2max", "Recovery").
   * Derived from sessionLog; kept pre-aggregated to avoid recomputing.
   */
  categoryResponses: Record<string, CategoryResponse>;

  /**
   * FTP history — every time the rider's FTP changes we append here.
   * Source: 'measured' = actual FTP test, 'estimated' = AI inference.
   */
  ftpHistory: Array<{
    date: string;
    ftp: number;
    source: "measured" | "estimated";
  }>;

  /**
   * Weekly behavior patterns derived from adherence data.
   * We count how often each ISO weekday (1=Mon…7=Sun) was skipped vs planned.
   */
  weekdaySkipCounts: Record<number, number>;    // weekday → skip count
  weekdayPlannedCounts: Record<number, number>; // weekday → times planned

  /**
   * Rolling session log — last 84 entries (~12 weeks × 7 days).
   * Oldest entries are dropped when the array exceeds MAX_LOG_ENTRIES.
   */
  sessionLog: SessionLogEntry[];

  /** ISO timestamp of last update. */
  updatedAt: string;
}

const KV_KEY = (id: string) => `zwift:${id}:fingerprint`;
const MAX_LOG_ENTRIES = 84; // 12 weeks

// ─── Read / Write ─────────────────────────────────────────────────────────────

export async function getFingerprint(athleteId: string): Promise<RiderFingerprint | null> {
  if (!kvAvailable() || !athleteId) return null;
  try {
    const raw = await kvGet(KV_KEY(athleteId));
    return raw ? (JSON.parse(raw) as RiderFingerprint) : null;
  } catch {
    return null;
  }
}

async function saveFingerprint(athleteId: string, fp: RiderFingerprint): Promise<void> {
  if (!kvAvailable() || !athleteId) return;
  try {
    await kvSet(KV_KEY(athleteId), JSON.stringify(fp));
  } catch {
    // best-effort
  }
}

// ─── Update helpers ───────────────────────────────────────────────────────────

function emptyFingerprint(): RiderFingerprint {
  return {
    categoryResponses: {},
    ftpHistory: [],
    weekdaySkipCounts: {},
    weekdayPlannedCounts: {},
    sessionLog: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Recomputes categoryResponses from scratch from the session log. */
function recomputeCategories(sessionLog: SessionLogEntry[]): Record<string, CategoryResponse> {
  const byCategory: Record<string, SessionLogEntry[]> = {};
  for (const entry of sessionLog) {
    if (!byCategory[entry.category]) byCategory[entry.category] = [];
    byCategory[entry.category].push(entry);
  }

  const result: Record<string, CategoryResponse> = {};
  for (const [cat, entries] of Object.entries(byCategory)) {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const avg = sorted.reduce((sum, e) => sum + e.feelingScore, 0) / sorted.length;
    const last = sorted[sorted.length - 1];
    result[cat] = {
      totalSessions: sorted.length,
      avgFeelingScore: Math.round(avg * 10) / 10,
      lastFeelingScore: last.feelingScore,
      lastSessionDate: last.date,
    };
  }
  return result;
}

/**
 * Appends a post-workout feeling score to the fingerprint and saves.
 * Called by /api/ai/session-feedback when the rider rates a completed session.
 */
export async function updateFingerprintWithFeedback(
  athleteId: string,
  entry: SessionLogEntry,
): Promise<void> {
  if (!kvAvailable() || !athleteId) return;
  try {
    const fp = (await getFingerprint(athleteId)) ?? emptyFingerprint();

    // Remove any existing entry for the same date (idempotent upsert)
    fp.sessionLog = fp.sessionLog.filter((e) => e.date !== entry.date);
    fp.sessionLog.push(entry);

    // Keep only the most recent MAX_LOG_ENTRIES entries
    fp.sessionLog.sort((a, b) => a.date.localeCompare(b.date));
    if (fp.sessionLog.length > MAX_LOG_ENTRIES) {
      fp.sessionLog = fp.sessionLog.slice(-MAX_LOG_ENTRIES);
    }

    // Recompute category aggregates
    fp.categoryResponses = recomputeCategories(fp.sessionLog);
    fp.updatedAt = new Date().toISOString();

    await saveFingerprint(athleteId, fp);
  } catch {
    // best-effort
  }
}

/**
 * Records an FTP data point. Called whenever the rider's FTP changes.
 * No-ops silently if KV is unavailable.
 */
export async function recordFtpDataPoint(
  athleteId: string,
  ftp: number,
  source: "measured" | "estimated",
): Promise<void> {
  if (!kvAvailable() || !athleteId) return;
  try {
    const fp = (await getFingerprint(athleteId)) ?? emptyFingerprint();
    const today = new Date().toISOString().slice(0, 10);
    // Replace any same-day entry
    fp.ftpHistory = fp.ftpHistory.filter((e) => e.date !== today);
    fp.ftpHistory.push({ date: today, ftp, source });
    // Keep last 52 entries (~1 year)
    fp.ftpHistory.sort((a, b) => a.date.localeCompare(b.date));
    if (fp.ftpHistory.length > 52) fp.ftpHistory = fp.ftpHistory.slice(-52);
    fp.updatedAt = new Date().toISOString();
    await saveFingerprint(athleteId, fp);
  } catch {
    // best-effort
  }
}

// ─── AI prompt injection ──────────────────────────────────────────────────────

const FEELING_LABELS: Record<number, string> = {
  1: "destroyed / couldn't finish",
  2: "harder than expected",
  3: "challenging but completed",
  4: "strong and controlled",
  5: "felt great / could do more",
};

/**
 * Converts the fingerprint into a concise text block for injection into the
 * AI coaching system prompt. Keeps it under ~400 tokens so it never dominates
 * the context.
 *
 * Returns null if the fingerprint is null or has fewer than 2 session entries
 * (not enough data to say anything meaningful).
 */
export function fingerprintToPromptSummary(fp: RiderFingerprint | null): string | null {
  if (!fp || fp.sessionLog.length < 2) return null;

  const lines: string[] = [];
  lines.push("## Rider Learning Profile (accumulated memory)");
  lines.push(
    `Data from ${fp.sessionLog.length} logged session${fp.sessionLog.length === 1 ? "" : "s"}.`,
  );

  // ── FTP trajectory ──
  if (fp.ftpHistory.length >= 2) {
    const oldest = fp.ftpHistory[0];
    const newest = fp.ftpHistory[fp.ftpHistory.length - 1];
    const delta = newest.ftp - oldest.ftp;
    const sign = delta >= 0 ? "+" : "";
    lines.push(
      `\nFTP trend: ${oldest.ftp}W on ${oldest.date} → ${newest.ftp}W on ${newest.date} (${sign}${delta}W over ${fp.ftpHistory.length} data points).`,
    );
  }

  // ── Category response patterns ──
  const cats = Object.entries(fp.categoryResponses).sort(
    ([, a], [, b]) => b.totalSessions - a.totalSessions,
  );
  if (cats.length > 0) {
    lines.push("\nWorkout category feel scores (1–5 scale):");
    for (const [cat, resp] of cats) {
      const label = FEELING_LABELS[Math.round(resp.avgFeelingScore)] ?? "";
      lines.push(
        `  • ${cat}: avg ${resp.avgFeelingScore}/5 over ${resp.totalSessions} sessions` +
          (label ? ` — tends to feel "${label}"` : "") +
          `. Last session: ${resp.lastFeelingScore}/5 (${resp.lastSessionDate}).`,
      );
    }
  }

  // ── Coaching implications ──
  const implications: string[] = [];

  // Consistently brutal VO2max
  const vo2 = fp.categoryResponses["VO2max"];
  if (vo2 && vo2.avgFeelingScore <= 2.5 && vo2.totalSessions >= 3) {
    implications.push(
      "VO2max sessions consistently feel very hard — prefer shorter rep formats (3×3, 40/20) over longer ones (5×5, Seiler 4×8) until score improves.",
    );
  }
  // Thriving on sweet spot
  const ss = fp.categoryResponses["Sweet Spot"];
  if (ss && ss.avgFeelingScore >= 4.0 && ss.totalSessions >= 3) {
    implications.push(
      "Sweet Spot sessions consistently feel strong — rider is ready to progress toward threshold work.",
    );
  }
  // Recovery sessions rated as hard
  const rec = fp.categoryResponses["Recovery"];
  if (rec && rec.avgFeelingScore <= 2.5 && rec.totalSessions >= 2) {
    implications.push(
      "Recovery sessions rated as hard — check that recovery power targets are genuinely ≤55% FTP, not drifting upward.",
    );
  }
  // Last session very hard
  const lastEntry = fp.sessionLog[fp.sessionLog.length - 1];
  if (lastEntry?.feelingScore === 1) {
    implications.push(
      `Last session (${lastEntry.workoutTitle} on ${lastEntry.date}) was rated 1/5 (destroyed). Consider a recovery session or volume reduction this week.`,
    );
  }
  // Trending upward
  const recentLog = fp.sessionLog.slice(-6);
  if (recentLog.length >= 4) {
    const recentAvg = recentLog.reduce((s, e) => s + e.feelingScore, 0) / recentLog.length;
    const olderLog = fp.sessionLog.slice(-12, -6);
    if (olderLog.length >= 4) {
      const olderAvg = olderLog.reduce((s, e) => s + e.feelingScore, 0) / olderLog.length;
      if (recentAvg - olderAvg >= 0.7) {
        implications.push(
          "Rider feel scores are trending upward over the last 6 sessions — fitness is adapting, consider progressing intensity.",
        );
      } else if (olderAvg - recentAvg >= 0.7) {
        implications.push(
          "Rider feel scores are declining over the last 6 sessions — possible accumulated fatigue, consider backing off volume.",
        );
      }
    }
  }

  if (implications.length > 0) {
    lines.push("\nCoaching implications from this rider's history:");
    for (const imp of implications) {
      lines.push(`  → ${imp}`);
    }
  }

  lines.push(
    "\nUse the above to personalise this week's plan. Prioritise formats the rider handles well; be cautious with categories where scores are consistently low.",
  );

  return lines.join("\n");
}
