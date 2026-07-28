/**
 * GET /api/ai/activity-check/cron
 *
 * Runs every 30 minutes. For every registered athlete, fetches their most
 * recent Zwift activities (directly from Zwift API — no ICU dependency) and
 * sends a WhatsApp feedback request immediately after a ride is detected.
 *
 * The result: athletes receive WhatsApp within ~30 minutes of finishing any
 * Zwift ride — even rides that were NOT planned through this app, and even
 * when Zwift is not synced to Intervals.icu. Zero athlete setup required.
 *
 * Detection logic:
 *   - Fetch the athlete's last 10 Zwift activities.
 *   - Filter to activities that ENDED within the past 35 minutes
 *     (35 min window covers the 30-min cron interval + 5 min slack).
 *   - If any found AND no feedback sent for this activity yet (KV flag),
 *     send WhatsApp and set the flag.
 *
 * KV flag key: zwift:{athleteId}:fb_act:{activityId}
 *   (Activity-level granularity, not date-level, so two rides on the same
 *    day each get their own feedback request.)
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` automatically for
 * cron jobs defined in vercel.json. The CRON_SECRET env var must be set in
 * the Vercel project settings — the one manual step required.
 *
 * Schedule: every 30 minutes (see vercel.json: "* /30 * * * *" without space)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getKnownAthletes,
  getStoredZwiftRefreshToken,
  getCachedPlan,
  getAthletePhone,
  getRiderIdentity,
} from "@/lib/kv-plan-state";
import { refreshZwiftToken, fetchActivities } from "@/lib/zwift";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet, kvSet } from "@/lib/kv";
import { sendWhatsApp, buildFeedbackMessage } from "@/lib/whatsapp";

// Allow up to 60s — processing multiple athletes with network calls takes time.
export const maxDuration = 60;

/** Activity types we care about for feedback */
const FEEDBACK_SPORTS = new Set(["CYCLING", "RUNNING", "SWIMMING", "VIRTUALRIDE", "VIRTUALRUN"]);

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const queryParam = req.nextUrl.searchParams.get("secret");
  if (queryParam === secret) return true;
  return false;
}

interface AthleteResult {
  athleteId: string;
  status: "sent" | "no_ride" | "already_sent" | "no_phone" | "skipped" | "error";
  activityId?: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const athleteIds = await getKnownAthletes();
  const results: AthleteResult[] = [];

  // Window: activities that ENDED within the last 35 minutes
  // (30 min cron interval + 5 min safety buffer for late uploads)
  const windowMs = 35 * 60 * 1000;
  const nowMs = Date.now();

  for (const athleteId of athleteIds) {
    try {
      // ── 1. Refresh Zwift token ──────────────────────────────────────────
      const refreshToken = await getStoredZwiftRefreshToken(athleteId);
      if (!refreshToken) {
        results.push({ athleteId, status: "skipped" });
        continue;
      }

      let accessToken: string;
      try {
        const refreshed = await refreshZwiftToken(refreshToken);
        accessToken = refreshed.accessToken;
      } catch {
        results.push({ athleteId, status: "error", error: "token_refresh_failed" });
        continue;
      }

      // ── 2. Fetch recent activities (last 10 only — we just want recent) ─
      const activities = await fetchActivities(accessToken, athleteId, 10).catch(() => []);

      // ── 3. Find a ride that ended in the detection window ───────────────
      let foundActivity: { id: number; name?: string; movingTimeInMs?: number; avgHeartRate?: number } | null = null;

      for (const act of activities) {
        const sport = (act.sport as string | undefined)?.toUpperCase() ?? "CYCLING";
        if (!FEEDBACK_SPORTS.has(sport)) continue;

        // Zwift startDate is UTC ISO: "2026-07-28T07:30:00.000Z"
        // Compute end time = startDate + movingTimeInMs
        if (!act.startDate || !act.movingTimeInMs) continue;
        const startMs  = new Date(act.startDate as string).getTime();
        const endMs    = startMs + (act.movingTimeInMs as number);
        const ageMs    = nowMs - endMs;

        // In window AND finished (not ongoing)
        if (ageMs >= 0 && ageMs <= windowMs) {
          foundActivity = {
            id: act.id,
            name: act.name as string | undefined,
            movingTimeInMs: act.movingTimeInMs as number,
            avgHeartRate: act.avgHeartRate as number | undefined,
          };
          break; // take the most recent qualifying ride
        }
      }

      if (!foundActivity) {
        results.push({ athleteId, status: "no_ride" });
        continue;
      }

      // ── 4. Check if we already sent feedback for this activity ──────────
      const flagKey = `zwift:${athleteId}:fb_act:${foundActivity.id}`;
      const alreadySent = await kvGet(flagKey).catch(() => null);
      if (alreadySent) {
        results.push({ athleteId, status: "already_sent", activityId: foundActivity.id });
        continue;
      }

      // ── 5. Get phone number ─────────────────────────────────────────────
      const phone = await getAthletePhone(athleteId).catch(() => null);
      if (!phone) {
        results.push({ athleteId, status: "no_phone", activityId: foundActivity.id });
        continue;
      }

      // ── 6. Find planned workout title (if any) ──────────────────────────
      const today = new Date().toISOString().slice(0, 10);
      const weekOf = mondayOfCurrentWeek();
      const plan = await getCachedPlan(athleteId, weekOf).catch(() => null);
      const planned = plan?.workouts?.find(w => w.date === today);
      const workoutTitle = (planned && !/rest/i.test(planned.type))
        ? planned.title
        : (foundActivity.name ?? "Today's ride");

      // ── 7. Set flag BEFORE sending (prevents duplicate if WA is slow) ───
      await kvSet(flagKey, "1").catch(() => {});
      // Also set the date-level flag so FeedbackTrigger (app open) doesn't
      // double-send on the same day
      await kvSet(`zwift:${athleteId}:fb_sent:${today}`, "1").catch(() => {});

      // ── 8. Send WhatsApp ────────────────────────────────────────────────
      const identity = await getRiderIdentity(athleteId).catch(() => null);
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://zwift-delta.vercel.app";
      const durationMin = Math.round((foundActivity.movingTimeInMs ?? 0) / 60000);

      const message = buildFeedbackMessage({
        firstName: identity?.firstName ?? null,
        workoutTitle,
        durationMin: durationMin > 0 ? durationMin : null,
        avgHr: foundActivity.avgHeartRate ?? null,
        baseUrl,
      });

      const waResult = await sendWhatsApp(phone, message);

      console.log(
        `[activity-check/cron] athlete=${athleteId} act=${foundActivity.id}` +
        ` title="${workoutTitle}" phone=****${phone.slice(-4)}` +
        ` wa=${waResult.ok ? "sent" : waResult.error}`
      );

      results.push({ athleteId, status: waResult.ok ? "sent" : "error", activityId: foundActivity.id, error: waResult.error });
    } catch (err) {
      results.push({ athleteId, status: "error", error: (err as Error).message });
    }
  }

  const sent = results.filter(r => r.status === "sent").length;
  console.log(`[activity-check/cron] done. athletes=${athleteIds.length} sent=${sent}`);
  return NextResponse.json({ ok: true, athletes: athleteIds.length, sent, results });
}
