/**
 * POST /api/trainingpeaks/push-workout
 *
 * Pushes an AI-generated workout to the user's TrainingPeaks calendar.
 * Because TrainingPeaks is an official Zwift partner, workouts pushed here
 * automatically sync to Zwift when the user has connected the two accounts
 * in the Zwift Companion app.
 *
 * Body (JSON):
 *   {
 *     workoutDay: string,     // YYYY-MM-DD
 *     title: string,
 *     description: string,
 *     durationMin: number,
 *     type: string,           // workout type from AI plan (e.g. "Endurance", "Intervals")
 *     targetPower?: string,   // optional %FTP target string
 *     tssPlanned?: number,    // optional TSS estimate
 *   }
 *
 * Response:
 *   { ok: boolean, workoutId?: string, error?: string, status?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { pushWorkoutToTP } from "@/lib/trainingpeaks";

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  // TP credentials live in dedicated cookies (zwift_tp_token / zwift_tp_id)
  const tpToken = cookieStore.get("zwift_tp_token")?.value;
  const tpAthleteId = cookieStore.get("zwift_tp_id")?.value;

  if (!tpToken || !tpAthleteId) {
    return NextResponse.json({
      ok: false,
      error: "TrainingPeaks not connected. Connect it first in the weekly plan.",
    }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json() as {
    workoutDay?: string;
    title?: string;
    description?: string;
    durationMin?: number;
    type?: string;
    targetPower?: string;
    tssPlanned?: number;
  };

  if (!body.workoutDay || !body.title || !body.durationMin) {
    return NextResponse.json({ ok: false, error: "Missing required fields: workoutDay, title, durationMin." });
  }

  // ── Push to TrainingPeaks ─────────────────────────────────────────────────
  const result = await pushWorkoutToTP({
    tpCookie: tpToken,
    tpAthleteId: tpAthleteId,
    workoutDay: body.workoutDay,
    title: body.title,
    description: body.description ?? "",
    durationMin: body.durationMin,
    type: body.type ?? "Bike",
    tssPlanned: body.tssPlanned,
  });

  return NextResponse.json(result);
}
