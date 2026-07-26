import { NextRequest, NextResponse } from "next/server";
import { getKnownAthletes, getStoredAthleteState } from "@/lib/kv-plan-state";

/**
 * GET /api/admin/list-athletes
 *
 * Fast, read-only companion to /api/admin/repair-plan: lists every athlete
 * in the zwift:athletes registry plus enough state to target a repair call
 * precisely (has an ICU key? has a cached macro-cycle position?) without
 * paying the cost of a full generation run just to find out who exists.
 * Same CRON_SECRET auth as the other admin/cron routes.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const header = req.headers.get("authorization");
  const queryParam = req.nextUrl.searchParams.get("secret");
  if (header !== `Bearer ${secret}` && queryParam !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const athleteIds = await getKnownAthletes();
  const details = await Promise.all(
    athleteIds.map(async (athleteId) => {
      const state = await getStoredAthleteState(athleteId);
      return {
        athleteId,
        hasIcuKey: Boolean(state.icuKey),
        icuId: state.icuId ?? null,
        lastPlanWeekOf: state.previousPlan?.weekOf ?? null,
        macroCycle: state.macroCycle,
      };
    })
  );

  return NextResponse.json({ ok: true, athletes: details });
}
