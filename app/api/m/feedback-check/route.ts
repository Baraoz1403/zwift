/**
 * POST /api/m/feedback-check
 *
 * Called by the Today page client component (FeedbackTrigger) immediately
 * after the page renders. Checks whether the athlete has completed a ride
 * today (from Zwift API directly — no ICU sync required) and sends a
 * WhatsApp feedback request if:
 *   1. A ride/workout was completed today.
 *   2. We haven't already sent a feedback request for today (KV flag).
 *
 * This replaces the ICU webhook approach, which required the athlete to
 * manually configure a webhook in their Intervals.icu account settings.
 * Now feedback just works — zero setup for athletes.
 *
 * The KV flag key is zwift:{athleteId}:fb_sent:{YYYY-MM-DD}.
 * It expires after 24h so the flag auto-clears the next day.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities } from "@/lib/zwift";
import { getCachedPlan, getAthletePhone } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet, kvSet } from "@/lib/kv";
import { sendWhatsApp, buildFeedbackMessage } from "@/lib/whatsapp";
import { getRiderIdentity } from "@/lib/kv-plan-state";

const RIDE_SPORTS = new Set(["CYCLING", "RUNNING", "VIRTUALRIDE", "VIRTUALRUN"]);

function todayLocalISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(_req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, reason: "unauthenticated" });
  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false, reason: "no session" });

  const athleteId = String(session.athleteId);
  const today = todayLocalISO();

  // ── Guard: already sent today? ────────────────────────────────────────────
  const flagKey = `zwift:${athleteId}:fb_sent:${today}`;
  const alreadySent = await kvGet(flagKey).catch(() => null);
  if (alreadySent) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already_sent_today" });
  }

  // ── Phone required ────────────────────────────────────────────────────────
  const phone = await getAthletePhone(athleteId).catch(() => null);
  if (!phone) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_phone" });
  }

  // ── Fetch recent Zwift activities ─────────────────────────────────────────
  // Fetch the last 30 activities; filter to today's date.
  let todayActivity: { name?: string; movingTimeInMs?: number; avgHeartRate?: number } | null = null;
  try {
    const activities = await Promise.race([
      fetchActivities(session.accessToken, session.athleteId!, 30),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);

    const todayRide = activities.find(a => {
      if (!a.startDate) return false;
      const date = a.startDate.slice(0, 10);
      if (date !== today) return false;
      const sport = (a.sport as string | undefined)?.toUpperCase() ?? "CYCLING";
      return RIDE_SPORTS.has(sport);
    });

    if (todayRide) {
      todayActivity = {
        name: todayRide.name as string | undefined,
        movingTimeInMs: todayRide.movingTimeInMs,
        avgHeartRate: todayRide.avgHeartRate,
      };
    }
  } catch {
    return NextResponse.json({ ok: true, skipped: true, reason: "zwift_error" });
  }

  if (!todayActivity) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_ride_today" });
  }

  // ── Find planned workout title ────────────────────────────────────────────
  const weekOf = mondayOfCurrentWeek();
  const plan = await getCachedPlan(athleteId, weekOf).catch(() => null);
  const planned = plan?.workouts?.find(w => w.date === today);
  const workoutTitle = (planned && !/rest/i.test(planned.type))
    ? planned.title
    : (todayActivity.name ?? "Today's ride");

  // ── Set flag BEFORE sending (prevents double-send if WA call is slow) ────
  await kvSet(flagKey, "1").catch(() => {});
  // TTL: 28 hours so flag always clears before tomorrow's ride
  // kvSet doesn't support TTL directly — use a dated key; cleanup is automatic
  // by tomorrow's different key.

  // ── Send WhatsApp ─────────────────────────────────────────────────────────
  const identity = await getRiderIdentity(athleteId).catch(() => null);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://zwift-delta.vercel.app";
  const durationMin = todayActivity.movingTimeInMs
    ? Math.round(todayActivity.movingTimeInMs / 60000)
    : null;

  const message = buildFeedbackMessage({
    firstName: identity?.firstName ?? null,
    workoutTitle,
    durationMin,
    avgHr: todayActivity.avgHeartRate ?? null,
    baseUrl,
  });

  const result = await sendWhatsApp(phone, message);

  console.log(
    `[feedback-check] athlete=${athleteId} ride="${workoutTitle}" phone=****${phone.slice(-4)} wa=${result.ok ? "sent" : result.error}`
  );

  return NextResponse.json({ ok: true, sent: result.ok, error: result.error });
}
