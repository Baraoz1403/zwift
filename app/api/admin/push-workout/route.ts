import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getIntervalsCredentials, getCachedPlan, setCachedPlan } from "@/lib/kv-plan-state";
import { kvGet, kvSet } from "@/lib/kv";
import { pushWorkoutToIntervals, listIntervalsEvents, deleteEventFromIntervals } from "@/lib/intervals";
import { generateZwoXml } from "@/lib/zwo";
import { workoutDateLabel } from "@/lib/plan-shape";

export const maxDuration = 30;

const ADMIN_ATHLETE_ID = "1040300"; // Barak

/**
 * POST /api/admin/push-workout
 *
 * Pushes a single replacement workout to Intervals.icu for any athlete.
 * Fast path — no OpenAI, no plan regeneration. Generates ZWO directly from
 * the provided workout definition using the fixed interval-only block builder.
 *
 * Body: {
 *   athleteId: string,      // target athlete
 *   riderName: string,      // first name for personal TextEvent messages
 *   date: string,           // YYYY-MM-DD
 *   day: string,            // "Wednesday" etc (to update KV plan)
 *   title: string,
 *   type: string,           // workout type key for ZWO block inference
 *   durationMin: number,
 *   targetPowerPctFtp: string,  // e.g. "76-82%"
 *   description: string,
 * }
 *
 * Auth: Must be logged in as Barak.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session?.athleteId || String(session.athleteId) !== ADMIN_ATHLETE_ID) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: {
    athleteId: string;
    riderName: string;
    date: string;
    day: string;
    title: string;
    type: string;
    durationMin: number;
    targetPowerPctFtp: string;
    description: string;
  };

  try {
    body = await req.json();
    if (!body.athleteId || !body.date || !body.title) {
      return NextResponse.json({ error: "athleteId, date, and title are required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    // Get ICU credentials for the target athlete
    const creds = await getIntervalsCredentials(body.athleteId).catch(() => null);
    if (!creds?.icuKey || !creds?.icuId) {
      return NextResponse.json({ error: `No ICU credentials for athlete ${body.athleteId}` }, { status: 404 });
    }

    // Delete any existing WORKOUT event on this day
    const existing = await listIntervalsEvents(creds.icuKey, body.date, body.date, creds.icuId).catch(() => []);
    const deleted: string[] = [];
    for (const ev of existing.filter((e: { category: string }) => e.category === "WORKOUT")) {
      await deleteEventFromIntervals(creds.icuKey, ev.id, creds.icuId).catch(() => {});
      deleted.push(ev.name ?? ev.id);
    }

    // Build the titled workout (with date prefix)
    const dateLabel = workoutDateLabel(body.date);
    const titledWorkout = dateLabel ? `${dateLabel} · ${body.title}` : body.title;

    // Generate ZWO — uses the fixed generateDefaultBlocks (interval-only, cooldown ≤5 min)
    const zwoXml = generateZwoXml(
      {
        title: body.title,
        type: body.type,
        durationMin: body.durationMin,
        description: body.description,
        targetPowerPctFtp: body.targetPowerPctFtp,
      },
      undefined,
      "Zwift Dashboard AI",
      body.riderName,
    );

    // Push to ICU
    const result = await pushWorkoutToIntervals({
      apiKey: creds.icuKey,
      athleteId: creds.icuId,
      workoutDay: body.date,
      title: titledWorkout,
      description: body.description,
      durationMin: body.durationMin,
      type: body.type,
      zwoXml,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "ICU push failed" }, { status: 502 });
    }

    // Update the KV plan for this day (best-effort)
    if (body.day) {
      try {
        const weekOf = (() => {
          const d = new Date(body.date + "T00:00:00Z");
          const dow = d.getUTCDay(); // 0=Sun
          const diff = dow === 0 ? -6 : 1 - dow; // Monday
          d.setUTCDate(d.getUTCDate() + diff);
          return d.toISOString().slice(0, 10);
        })();

        const plan = await getCachedPlan(body.athleteId, weekOf);
        if (plan) {
          const updatedWorkouts = plan.workouts.map(w =>
            w.day === body.day
              ? { ...w, title: body.title, type: body.type, durationMin: body.durationMin, description: body.description, targetPowerPctFtp: body.targetPowerPctFtp }
              : w
          );
          await setCachedPlan(body.athleteId, { ...plan, workouts: updatedWorkouts });
        }

        // Update month_workouts KV
        const month = body.date.slice(0, 7);
        const monthKey = `zwift:${body.athleteId}:month_workouts:${month}`;
        const monthRaw = await kvGet(monthKey).catch(() => null);
        const existing_titles: string[] = monthRaw ? JSON.parse(monthRaw) : [];
        if (!existing_titles.includes(body.title)) {
          const merged = [...existing_titles, body.title];
          await kvSet(monthKey, JSON.stringify(merged), 45 * 24 * 60 * 60).catch(() => {});
        }
      } catch {
        // best-effort KV update — ICU push already succeeded
      }
    }

    return NextResponse.json({
      ok: true,
      athleteId: body.athleteId,
      date: body.date,
      title: titledWorkout,
      deleted,
      icuEventId: result.eventId,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
