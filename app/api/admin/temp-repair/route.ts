import { NextResponse } from "next/server";
import { refreshZwiftToken } from "@/lib/zwift";
import { runWeeklyPlanGeneration } from "@/lib/plan-runner";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import type { MacroCycleState } from "@/lib/periodization";
import type { WeeklyWorkout } from "@/lib/ai";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";
import {
  getStoredZwiftRefreshToken,
  getStoredAthleteState,
  mirrorZwiftAuthToKv,
  mirrorStateToKv,
  setCachedPlan,
} from "@/lib/kv-plan-state";

// TEMPORARY one-shot: repair plan for athlete 5519895 (week Aug 3)
// DELETE IMMEDIATELY AFTER USE
export const maxDuration = 60;

export async function GET() {
  const athleteId = "5519895";
  const weekOf = mondayOfCurrentWeek(); // 2026-08-03

  try {
    const storedRefreshToken = await getStoredZwiftRefreshToken(athleteId);
    if (!storedRefreshToken) {
      return NextResponse.json({ ok: false, error: "No Zwift refresh token stored for this athlete" });
    }

    // Refresh Zwift token
    let accessToken: string;
    try {
      const refreshed = await refreshZwiftToken(storedRefreshToken);
      await mirrorZwiftAuthToKv(athleteId, refreshed.refreshToken);
      accessToken = refreshed.accessToken;
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Zwift token refresh failed: ${e.message}` });
    }

    const state = await getStoredAthleteState(athleteId);
    const runningMacroCycle: MacroCycleState | null = state.macroCycle;
    const runningPreviousPlan: { weekOf: string; workouts: WeeklyWorkout[] } | null = state.previousPlan;

    // Generate plan
    const result = await runWeeklyPlanGeneration({
      athleteId,
      accessToken,
      weekOf,
      incomingCycle: runningMacroCycle,
      previousPlan: runningPreviousPlan ?? undefined,
      riderProfile: state.riderProfile ?? undefined,
      forceRegenerate: true,
    });

    await setCachedPlan(athleteId, weekOf, result.workouts);
    await mirrorStateToKv(athleteId, weekOf, result);

    // Sync to ICU
    let icuResult = null;
    if (state.icuKey && state.icuId) {
      try {
        icuResult = await syncPlanToIcuAndMark(athleteId, weekOf, result.workouts, state.icuKey, state.icuId);
      } catch (e: any) {
        icuResult = { error: e.message };
      }
    }

    return NextResponse.json({
      ok: true,
      athleteId,
      weekOf,
      workoutCount: result.workouts.length,
      workoutTitles: result.workouts.map((w: WeeklyWorkout) => `${w.day}: ${w.title}`),
      icuSync: icuResult,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack?.slice(0, 500) });
  }
}
