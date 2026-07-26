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
import { pushWorkoutToTP, deleteWorkoutFromTP, refreshTPToken, listTPWorkouts } from "@/lib/trainingpeaks";
import type { WorkoutStructureBlock } from "@/lib/zwo";

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  // TP credentials live in dedicated cookies (zwift_tp_token / zwift_tp_id)
  let tpToken = cookieStore.get("zwift_tp_token")?.value;
  const tpAthleteId = cookieStore.get("zwift_tp_id")?.value;
  const tpRefresh   = cookieStore.get("zwift_tp_refresh")?.value;

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
    structure?: WorkoutStructureBlock[];
  };

  if (!body.workoutDay || !body.title || !body.durationMin) {
    return NextResponse.json({ ok: false, error: "Missing required fields: workoutDay, title, durationMin." });
  }

  // ── Push to TrainingPeaks (with auto-refresh retry on 401) ─────────────────
  const pushOpts = {
    tpCookie: tpToken,
    tpAthleteId,
    workoutDay: body.workoutDay,
    title: body.title,
    description: body.description ?? "",
    durationMin: body.durationMin,
    type: body.type ?? "Bike",
    tssPlanned: body.tssPlanned,
    structure: body.structure,
  };

  let result = await pushWorkoutToTP(pushOpts);

  // If the push failed with 401/403 and we have a refresh token, try once more
  if (!result.ok && (result.status === 401 || result.status === 403) && tpRefresh) {
    try {
      const refreshed = await refreshTPToken(tpRefresh);
      const isSecure = process.env.NODE_ENV === "production";
      cookieStore.set("zwift_tp_token", refreshed.accessToken, {
        httpOnly: true, secure: isSecure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
      });
      // TP may rotate the refresh token (single-use) — persist the new one or
      // the next refresh cycle will fail and force a manual reconnect.
      if (refreshed.refreshToken) {
        cookieStore.set("zwift_tp_refresh", refreshed.refreshToken, {
          httpOnly: true, secure: isSecure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
        });
      }
      cookieStore.set("zwift_tp_expires", String(Date.now() + (refreshed.expiresIn ?? 3600) * 1000), {
        httpOnly: false, secure: isSecure, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/",
      });
      result = await pushWorkoutToTP({ ...pushOpts, tpCookie: refreshed.accessToken });
    } catch {
      // Refresh failed — return original error
    }
  }

  return NextResponse.json(result);
}

/**
 * GET /api/trainingpeaks/push-workout?oldest=YYYY-MM-DD&newest=YYYY-MM-DD
 *
 * Lists workouts on the rider's TrainingPeaks calendar in a date range - the
 * server-truth source for finding and removing this app's own stale
 * duplicate pushes on an ongoing basis. Does NOT filter for safety here -
 * that filtering (title marker + no actual/completed data) happens
 * client-side in weekly-plan.tsx's cleanupStaleTPWorkouts, matching the same
 * pattern as the Intervals.icu listing endpoint.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  const tpToken = cookieStore.get("zwift_tp_token")?.value;
  const tpAthleteId = cookieStore.get("zwift_tp_id")?.value;
  if (!tpToken || !tpAthleteId) {
    return NextResponse.json({ ok: false, error: "TrainingPeaks not connected." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const oldest = searchParams.get("oldest");
  const newest = searchParams.get("newest");
  if (!oldest || !newest) {
    return NextResponse.json({ ok: false, error: "Missing oldest/newest query params." }, { status: 400 });
  }

  const workouts = await listTPWorkouts(tpToken, tpAthleteId, oldest, newest);
  return NextResponse.json({ ok: true, workouts });
}

/**
 * DELETE /api/trainingpeaks/push-workout
 *
 * Deletes a previously pushed workout from TrainingPeaks.
 * Body: { workoutId: string | number }
 */
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  const tpToken = cookieStore.get("zwift_tp_token")?.value;
  const tpAthleteId = cookieStore.get("zwift_tp_id")?.value;

  if (!tpToken || !tpAthleteId) {
    return NextResponse.json({ ok: false, error: "TrainingPeaks not connected." }, { status: 403 });
  }

  const body = await req.json() as { workoutId?: string | number };
  if (!body.workoutId) {
    return NextResponse.json({ ok: false, error: "Missing workoutId." }, { status: 400 });
  }

  const result = await deleteWorkoutFromTP({
    tpCookie: tpToken,
    tpAthleteId,
    workoutId: body.workoutId,
  });

  return NextResponse.json(result);
}
