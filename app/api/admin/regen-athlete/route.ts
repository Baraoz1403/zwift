import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { runWeeklyPlanGeneration } from "@/lib/plan-runner";
import { refreshZwiftToken } from "@/lib/zwift";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";
import {
  getStoredZwiftRefreshToken,
  getStoredAthleteState,
  mirrorZwiftAuthToKv,
  setCachedPlan,
} from "@/lib/kv-plan-state";

/**
 * POST /api/admin/regen-athlete
 *
 * Session-authenticated endpoint that force-regenerates a specific athlete's
 * weekly plan, bypassing the KV cache. Intended for admin use by Barak to
 * update plans for managed athletes (Adi, Omri, etc.) without CRON_SECRET.
 *
 * Body: { athleteId: string, weekOf?: string }
 * Auth: Must be logged in as Barak (athleteId 1040300) — sole admin.
 */

export const maxDuration = 300; // Match weekly-plan route — AI generation + ICU sync can take 60-120s

const ADMIN_ATHLETE_ID = "1040300"; // Barak

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session?.athleteId || String(session.athleteId) !== ADMIN_ATHLETE_ID) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let targetAthleteId: string;
  let weekOf: string;
  try {
    const body = await req.json();
    if (!body?.athleteId) return NextResponse.json({ error: "athleteId required" }, { status: 400 });
    targetAthleteId = String(body.athleteId);
    weekOf = typeof body.weekOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.weekOf)
      ? body.weekOf
      : mondayOfCurrentWeek();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const refreshToken = await getStoredZwiftRefreshToken(targetAthleteId);
    if (!refreshToken) {
      return NextResponse.json({ error: `No stored refresh token for athlete ${targetAthleteId}` }, { status: 404 });
    }

    const refreshed = await refreshZwiftToken(refreshToken);
    await mirrorZwiftAuthToKv(targetAthleteId, refreshed.refreshToken);

    const state = await getStoredAthleteState(targetAthleteId);

    const result = await runWeeklyPlanGeneration({
      accessToken: refreshed.accessToken,
      incomingCycle: state.macroCycle,
      previousPlan: state.previousPlan,
      riderProfile: state.riderProfile,
      targetWeekOf: weekOf,
    });

    await setCachedPlan(targetAthleteId, {
      weekOf: result.weekOf,
      summary: result.plan.summary,
      workouts: cleanedWorkouts,
    });

    // Push to ICU
    let pushed = 0, deleted = 0;
    if (state.icuKey) {
      const riddenDates = new Set(
        result.rides.map(r => (r.date ?? "").slice(0, 10)).filter(Boolean)
      );
      const syncResult = await syncPlanToIcuAndMark(
        targetAthleteId,
        result.weekOf,
        { weekOf: result.weekOf, summary: result.plan.summary, workouts: cleanedWorkouts },
        riddenDates,
        result.firstName,
      );
      pushed = syncResult?.pushed ?? 0;
      deleted = syncResult?.deleted ?? 0;
    }

    const FORBIDDEN = ["foundation ride", "free ride", "base ride", "easy ride", "endurance ride", "z2 ride", "long endurance"];

    // Route-level safety net: if ai.ts hard replacement missed any forbidden workouts,
    // replace them here unconditionally before saving to KV and pushing to ICU.
    const cleanedWorkouts = result.plan.workouts.map(w => {
      if (w.type === "Rest" || w.type?.toLowerCase().includes("rest")) return w;
      const t = w.title.toLowerCase();
      if (!FORBIDDEN.some(p => t.includes(p))) return w;
      const totalMin = w.durationMin > 0 ? w.durationMin : 50;
      const warmup = 10; const cooldown = 5; const drillsMin = totalMin - warmup - cooldown;
      const repeats = Math.max(2, Math.round(drillsMin / 10));
      const onSec = Math.round((drillsMin / repeats) * 60 * 0.75);
      const offSec = Math.round((drillsMin / repeats) * 60 * 0.25);
      return { ...w, title: "Z2 with Cadence Drills", type: "Endurance" as const,
        structure: [
          { type: "warmup" as const, durationMin: warmup, powerFtp: 0.60, label: "Easy warm-up" },
          { type: "intervals" as const, durationMin: drillsMin, powerFtp: 0.65, repeats, onSec, offSec, recoveryPowerFtp: 0.65, label: `${repeats}x cadence drills — 85/100 rpm` },
          { type: "cooldown" as const, durationMin: cooldown, powerFtp: 0.50, label: "Easy spin-down" },
        ],
      };
    });

    const forbidden = cleanedWorkouts
      .filter(w => w.type !== "Rest" && FORBIDDEN.some(p => w.title.toLowerCase().includes(p)))
      .map(w => `${w.day}: ${w.title}`);

    return NextResponse.json({
      ok: true,
      athleteId: targetAthleteId,
      weekOf: result.weekOf,
      workouts: cleanedWorkouts.map(w => ({ day: w.day, title: w.title, type: w.type, durationMin: w.durationMin })),
      icu: { pushed, deleted },
      forbidden,
      _v: "route-v2",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
