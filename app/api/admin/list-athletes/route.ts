import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getKnownAthletes, getStoredAthleteState } from "@/lib/kv-plan-state";

/**
 * GET /api/admin/list-athletes
 *
 * Lists every athlete in the zwift:athletes registry.
 * Auth: CRON_SECRET header/query OR logged in as Barak (1040300).
 */

const ADMIN_ATHLETE_ID = "1040300";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    const queryParam = req.nextUrl.searchParams.get("secret");
    if (header === `Bearer ${secret}` || queryParam === secret) return true;
  }
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!raw) return false;
    const session = await decryptSession(raw);
    return Boolean(session?.athleteId && String(session.athleteId) === ADMIN_ATHLETE_ID);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
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
