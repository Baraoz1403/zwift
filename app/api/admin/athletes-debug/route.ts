import { NextRequest, NextResponse } from "next/server";
import { getKnownAthletes, getStoredAthleteState } from "@/lib/kv-plan-state";

export async function GET(req: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  const querySecret = req.nextUrl.searchParams.get("secret");
  if (!secret || querySecret !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const athleteIds = await getKnownAthletes();
  const details = await Promise.all(
    athleteIds.map(async (athleteId) => {
      const state = await getStoredAthleteState(athleteId);
      return {
        athleteId,
        hasRiderProfile: !!state.riderProfile,
        riderName: (state.riderProfile as any)?.name ?? null,
        hasIcuKey: !!state.icuKey,
        icuId: state.icuId ?? null,
        lastPlanWeekOf: state.previousPlan?.weekOf ?? null,
        macroCycleWeekIndex: state.macroCycle?.weekIndex ?? null,
      };
    })
  );
  return NextResponse.json({ ok: true, count: athleteIds.length, athletes: details });
}
