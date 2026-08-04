import { NextResponse } from "next/server";
import { refreshZwiftToken } from "@/lib/zwift";
import { runWeeklyPlanGeneration } from "@/lib/plan-runner";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";
import {
  getStoredZwiftRefreshToken,
  getStoredAthleteState,
  mirrorZwiftAuthToKv,
  mirrorStateToKv,
  setCachedPlan,
} from "@/lib/kv-plan-state";

// TEMPORARY one-shot: repair plan for athlete 5519895 — DELETE AFTER USE
export const maxDuration = 60;

export async function GET() {
  const athleteId = "5519895";
  const weekOf = mondayOfCurrentWeek();

  try {
    const storedRefreshToken = await getStoredZwiftRefreshToken(athleteId);
    if (!storedRefreshToken) {
      return NextResponse.json({ ok: false, error: "No Zwift refresh token for this athlete" });
    }

    let accessToken: string;
    try {
      const refreshed = await refreshZwiftToken(storedRefreshToken);
      await mirrorZwiftAuthToKv(athleteId, refreshed.refreshToken);
      accessToken = refreshed.accessToken;
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Zwift token refresh failed: ${e.message}` });
    }

    const state = await getStoredAthleteState(athleteId);

    const result = await runWeeklyPlanGeneration({
      athleteId,
      accessToken,
      weekOf,
      incomingCycle: state.macroCycle ?? null,
      previousPlan: state.previousPlan ?? undefined,
      riderProfile: state.riderProfile ?? undefined,
      forceRegenerate: true,
    });

    const plan = { weekOf, summary: result.plan.summary, workouts: result.plan.workouts };
    await setCachedPlan(athleteId, weekOf, plan.workouts);
    await mirrorStateToKv(athleteId, weekOf, result);

    let icuResult = null;
    try {
      icuResult = await syncPlanToIcuAndMark(athleteId, weekOf, plan, new Set(), result.firstName);
    } catch (e: any) {
      icuResult = { error: e.message };
    }

    return NextResponse.json({
      ok: true,
      athleteId,
      weekOf,
      phase: result.cycle?.phase,
      workoutCount: plan.workouts.length,
      workouts: plan.workouts.map((w) => `${w.day}: ${w.title}`),
      icuSync: icuResult,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack?.slice(0, 600) });
  }
}
