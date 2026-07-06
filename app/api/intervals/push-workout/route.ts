/**
 * POST /api/intervals/push-workout
 *
 * Pushes an AI-generated workout to the user's Intervals.icu calendar as a
 * real structured .zwo entry - reuses the exact same ZWO XML generator this
 * app already uses for the manual "download for Zwift" button, so the
 * structure Intervals.icu parses is identical to what a rider would get by
 * downloading the file themselves. Once on Intervals.icu's calendar, its own
 * Garmin/Zwift sync (set up once in the rider's Intervals.icu account) relays
 * it onward.
 *
 * Body (JSON):
 *   {
 *     workoutDay: string,     // YYYY-MM-DD
 *     title: string,
 *     description: string,
 *     durationMin: number,
 *     type: string,
 *     targetPower?: string,
 *     tssPlanned?: number,
 *     structure?: WorkoutStructureBlock[],
 *   }
 *
 * Response: { ok: boolean, eventId?: string | number, error?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { pushWorkoutToIntervals, deleteEventFromIntervals } from "@/lib/intervals";
import { generateZwoXml, computeIfTss, structureToBlocks, type WorkoutStructureBlock } from "@/lib/zwo";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  const apiKey = cookieStore.get("zwift_intervals_key")?.value;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "Intervals.icu not connected. Connect it first in the weekly plan.",
    }, { status: 403 });
  }

  const body = await req.json() as {
    workoutDay?: string;
    title?: string;
    description?: string;
    durationMin?: number;
    type?: string;
    targetPower?: string;
    tssPlanned?: number;
    structure?: WorkoutStructureBlock[];
  };

  if (!body.workoutDay || !body.title || !body.durationMin) {
    return NextResponse.json({ ok: false, error: "Missing required fields: workoutDay, title, durationMin." });
  }

  // Same ZWO generator used for the manual Zwift download - if the AI
  // supplied a structure, generateZwoXml uses it directly (via
  // generateDefaultBlocks -> structureToBlocks); otherwise it falls back to
  // a type-based default shape, exactly like the download button does.
  const zwoXml = generateZwoXml({
    title: body.title,
    type: body.type ?? "Bike",
    durationMin: body.durationMin,
    targetPowerPctFtp: body.targetPower,
    description: body.description,
    structure: body.structure,
  });

  let effectiveTss = body.tssPlanned;
  if (effectiveTss == null && body.structure && body.structure.length > 0) {
    const { tss } = computeIfTss(structureToBlocks(body.structure));
    if (tss > 0) effectiveTss = Math.round(tss);
  }

  const result = await pushWorkoutToIntervals({
    apiKey,
    workoutDay: body.workoutDay,
    title: body.title,
    description: body.description ?? "",
    durationMin: body.durationMin,
    type: body.type ?? "Bike",
    zwoXml,
    tssPlanned: effectiveTss,
  });

  return NextResponse.json(result);
}

/**
 * DELETE /api/intervals/push-workout
 * Deletes a previously pushed workout from Intervals.icu.
 * Body: { eventId: string | number }
 */
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  const apiKey = cookieStore.get("zwift_intervals_key")?.value;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Intervals.icu not connected." }, { status: 403 });
  }

  const body = await req.json() as { eventId?: string | number };
  if (!body.eventId) {
    return NextResponse.json({ ok: false, error: "Missing eventId." }, { status: 400 });
  }

  const result = await deleteEventFromIntervals(apiKey, body.eventId);
  return NextResponse.json(result);
}
