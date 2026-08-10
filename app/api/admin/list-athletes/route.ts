import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getKnownAthletes, getStoredAthleteState } from "@/lib/kv-plan-state";

/**
 * GET /api/admin/list-athletes
 * Auth: CRON_SECRET header/query OR Barak session (athleteId 1040300).
 */

const ADMIN_ATHLETE_ID = "1040300";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  let authorized = false;

  // Check CRON_SECRET
  if (secret) {
    const header = req.headers.get("authorization");
    const queryParam = req.nextUrl.searchParams.get("secret");
    if (header === `Bearer ${secret}` || queryParam === secret) authorized = true;
  }

  // Check Barak's session
  if (!authorized) {
    try {
      const cookieStore = await cookies();
      const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      if (raw) {
        const session = await decryptSession(raw);
        if (session?.athleteId && String(session.athleteId) === ADMIN_ATHLETE_ID) {
          authorized = true;
        }
      }
    } catch {
      // session check failed
    }
  }

  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized.", v: 3 }, { status: 401 });
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

  return NextResponse.json({ ok: true, v: 3, athletes: details });
}
