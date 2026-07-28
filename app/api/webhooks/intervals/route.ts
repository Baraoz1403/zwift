import { NextRequest, NextResponse } from "next/server";
import {
  findAthleteByIcuId,
  getAthletePhone,
  getCachedPlan,
} from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet, kvSet } from "@/lib/kv";
import { sendWhatsApp, buildFeedbackMessage } from "@/lib/whatsapp";

/**
 * POST /api/webhooks/intervals
 *
 * Receives activity-completed webhooks from Intervals.icu.
 * When an athlete finishes a ride/run/workout, ICU POSTs here.
 * We then send a WhatsApp message asking them to rate the session.
 *
 * Setup in Intervals.icu:
 *   Settings → Webhooks → New webhook
 *   URL: https://zwift-delta.vercel.app/api/webhooks/intervals
 *   Events: activity_created
 *   (Optional) Secret: set INTERVALS_WEBHOOK_SECRET env var to verify
 *
 * ICU webhook payload (relevant fields):
 * {
 *   "type": "activity",
 *   "event": "created",
 *   "data": {
 *     "id": 12345678,
 *     "athlete_id": "i12345",         ← ICU athlete ID
 *     "name": "Morning Ride",
 *     "type": "Ride",
 *     "start_date_local": "2026-07-27T07:30:00",
 *     "moving_time": 3600,            ← seconds
 *     "average_heartrate": 142.3,
 *     "average_watts": 198.0,
 *     ...
 *   }
 * }
 *
 * All non-Ride/VirtualRide/Run activities (walks, strength, etc.) are
 * silently ignored — we only ping after actual training sessions.
 */

const TRAINING_TYPES = new Set([
  "Ride", "VirtualRide", "Run", "VirtualRun",
  "GravelRide", "MountainBikeRide", "EBikeRide", "Workout",
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Parse payload ──────────────────────────────────────────────────────
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // ── 2. Optional webhook secret verification ───────────────────────────────
  const secret = process.env.INTERVALS_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("x-intervals-signature") ?? "";
    if (sig !== secret) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
  }

  // ── 3. Extract activity data ──────────────────────────────────────────────
  // ICU sends either flat payload or nested under "data"
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const icuAthleteId = (data.athlete_id ?? payload.athlete_id) as string | undefined;
  const activityType = (data.type ?? "") as string;
  const activityName = (data.name ?? "Today's workout") as string;
  const startLocal   = (data.start_date_local ?? "") as string;
  const movingSec    = Number(data.moving_time ?? 0);
  const avgHr        = data.average_heartrate != null ? Number(data.average_heartrate) : null;

  // Only process actual training activities
  if (!TRAINING_TYPES.has(activityType)) {
    return NextResponse.json({ ok: true, skipped: true, reason: `type=${activityType}` });
  }

  // Must have an athlete ID
  if (!icuAthleteId) {
    return NextResponse.json({ ok: false, error: "No athlete_id in payload" }, { status: 400 });
  }

  // ── 4. Resolve Zwift athlete ID from ICU ID ───────────────────────────────
  const athleteId = await findAthleteByIcuId(icuAthleteId);
  if (!athleteId) {
    // Not a registered athlete — silently OK (could be someone else's ICU org)
    return NextResponse.json({ ok: true, skipped: true, reason: "athlete not found" });
  }

  // ── 5. Get phone number ───────────────────────────────────────────────────
  const phone = await getAthletePhone(athleteId);
  if (!phone) {
    // No phone registered — nothing to send
    return NextResponse.json({ ok: true, skipped: true, reason: "no phone registered" });
  }

  // ── 6. Find planned workout title for today ───────────────────────────────
  const activityDate = startLocal.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const weekOf = mondayOfCurrentWeek();
  const plan = await getCachedPlan(athleteId, weekOf);

  let workoutTitle = activityName;
  if (plan?.workouts) {
    const planned = plan.workouts.find(w => w.date === activityDate);
    if (planned && !/rest/i.test(planned.type)) {
      workoutTitle = planned.title;
    }
  }

  // ── 7. Deduplication — same KV flags as the cron job ─────────────────────
  // Prevents double-send when both the webhook and the cron fire for the same
  // activity (possible when Zwift→ICU sync is enabled).
  const icuActivityId = (data.id ?? "") as string | number;
  const today = activityDate;
  const dateFlagKey = `zwift:${athleteId}:fb_sent:${today}`;

  // Date-level flag: if cron already sent today, skip
  const alreadySentToday = await kvGet(dateFlagKey).catch(() => null);
  if (alreadySentToday) {
    console.log(`[webhook/intervals] athlete=${athleteId} skipped — already sent today`);
    return NextResponse.json({ ok: true, skipped: true, reason: "already_sent_today" });
  }

  // Activity-level flag (keyed by ICU activity id)
  if (icuActivityId) {
    const actFlagKey = `zwift:${athleteId}:fb_icu:${icuActivityId}`;
    const alreadySentAct = await kvGet(actFlagKey).catch(() => null);
    if (alreadySentAct) {
      console.log(`[webhook/intervals] athlete=${athleteId} skipped — already sent for activity ${icuActivityId}`);
      return NextResponse.json({ ok: true, skipped: true, reason: "already_sent_activity" });
    }
    // Mark before sending to prevent race with cron
    await kvSet(actFlagKey, "1").catch(() => {});
  }
  await kvSet(dateFlagKey, "1").catch(() => {});

  // ── 8. Build and send WhatsApp ────────────────────────────────────────────
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://zwift-delta.vercel.app";
  const durationMin = Math.round(movingSec / 60);

  // firstName not readily available here without hitting Zwift API;
  // use a generic greeting. If important, add KV cache for firstName later.
  const message = buildFeedbackMessage({
    firstName: null,
    workoutTitle,
    durationMin,
    avgHr,
    baseUrl,
  });

  const result = await sendWhatsApp(phone, message);
  console.log(
    `[webhook/intervals] athlete=${athleteId} type=${activityType} phone=****${phone.slice(-4)} whatsapp=${result.ok ? "sent" : result.error}`
  );

  return NextResponse.json({ ok: true, whatsapp: result });
}

/**
 * GET /api/webhooks/intervals
 * Intervals.icu may ping the webhook URL to verify it's alive.
 */
export function GET() {
  return NextResponse.json({ ok: true, service: "Zwift AI Webhook" });
}
