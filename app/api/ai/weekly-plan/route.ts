import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { WeeklyWorkout } from "@/lib/ai";
import { runWeeklyPlanGeneration, AiInsightsError } from "@/lib/plan-runner";
import { MacroCycleState } from "@/lib/periodization";
import type { RiderTrainingProfile } from "@/lib/rider-profile";
import { mirrorStateToKv, mirrorZwiftAuthToKv } from "@/lib/kv-plan-state";

// mirrorStateToKv / mirrorZwiftAuthToKv now live in lib/kv-plan-state.ts so
// app/api/ai/weekly-plan/cron/route.ts can share the exact same KV
// read/write logic instead of a second, drifting copy - see that file's
// doc comment for the full explanation of what each key is for.

// Mirrors app/api/ai/insights/route.ts (same auth, same data-gathering
// pattern) but calls generateWeeklyPlan instead of generateInsights, and
// returns a structured weekly workout plan rather than free-text analysis.
//
// The actual generation pipeline lives in lib/plan-runner.ts so it can also
// run headlessly from the nightly cron endpoint - this route is now just:
// resolve the browser session -> parse the body -> call the shared runner ->
// mirror the result to KV for the cron job's benefit -> respond.
export async function POST(req: NextRequest) {
  let ageYears: number | undefined;
  let incomingCycle: MacroCycleState | null = null;
  let previousPlan: { weekOf: string; workouts: WeeklyWorkout[] } | null = null;
  let riderProfile: RiderTrainingProfile | undefined;
  let riderNote: string | undefined;
  let targetWeekOf: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.ageYears === "number" && body.ageYears > 0) {
      ageYears = body.ageYears;
    }
    if (
      body?.macroCycle &&
      typeof body.macroCycle.weekIndex === "number" &&
      typeof body.macroCycle.lastWeekOf === "string"
    ) {
      incomingCycle = { weekIndex: body.macroCycle.weekIndex, lastWeekOf: body.macroCycle.lastWeekOf };
    }
    if (
      body?.previousPlan &&
      typeof body.previousPlan.weekOf === "string" &&
      Array.isArray(body.previousPlan.workouts)
    ) {
      previousPlan = { weekOf: body.previousPlan.weekOf, workouts: body.previousPlan.workouts };
    }
    if (body?.riderProfile && typeof body.riderProfile === "object") {
      riderProfile = body.riderProfile as RiderTrainingProfile;
    }
    if (typeof body?.riderNote === "string" && body.riderNote.trim()) {
      riderNote = body.riderNote.trim();
    }
    // Optional override so the dashboard can pre-generate *next* week's plan
    // ahead of time (rolling 6-day-ahead window) - must be a real Monday
    // ("YYYY-MM-DD"); anything else is ignored and we fall back to "now".
    if (typeof body?.targetWeekOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetWeekOf)) {
      targetWeekOf = body.targetWeekOf;
    }
  } catch {
    // No/invalid JSON body - fine, these all just stay unset.
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session invalid or expired." }, { status: 401 });
  }

  try {
    const result = await runWeeklyPlanGeneration({
      accessToken: session.accessToken,
      ageYears,
      incomingCycle,
      previousPlan,
      riderProfile,
      riderNote,
      targetWeekOf,
    });

    // Side effects only - never block or affect the response below.
    await mirrorStateToKv(result.athleteId, {
      riderProfile,
      macroCycle: result.macroCycle,
      plan: { weekOf: result.weekOf, workouts: result.plan.workouts },
    });
    // Keep the athlete's Zwift refresh token mirrored to KV every time we
    // see a live session - this is what lets the cron job obtain a fresh
    // access token headlessly later, without ever needing a browser here.
    await mirrorZwiftAuthToKv(result.athleteId, session.refreshToken);

    return NextResponse.json({ ok: true, plan: result.plan, macroCycle: result.macroCycle, cycle: result.cycle });
  } catch (e) {
    if (e instanceof AiInsightsError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
    }
    return NextResponse.json(
      { ok: false, error: "Unexpected error generating the weekly plan." },
      { status: 500 }
    );
  }
}
