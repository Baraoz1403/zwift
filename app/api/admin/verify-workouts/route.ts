import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getIntervalsCredentials, getCachedPlan } from "@/lib/kv-plan-state";
import { kvGet } from "@/lib/kv";
import { listIntervalsEvents } from "@/lib/intervals";
import { mondayOfCurrentWeek } from "@/lib/periodization";

export const maxDuration = 30;

const ADMIN_ATHLETE_ID = "1040300";

/**
 * GET /api/admin/verify-workouts?athletes=1040300,5519895,5864809
 * Fetches real ICU events for each athlete for the current week.
 * Auth: must be logged in as Barak.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session?.athleteId || String(session.athleteId) !== ADMIN_ATHLETE_ID) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const weekOf = mondayOfCurrentWeek();
  const sunday = new Date(weekOf + "T00:00:00Z");
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const endDate = sunday.toISOString().slice(0, 10);

  const athleteParam = req.nextUrl.searchParams.get("athletes") ?? "1040300,5519895,5864809";
  const athleteIds = athleteParam.split(",").map(s => s.trim());

  const results: Record<string, unknown> = {};

  for (const athleteId of athleteIds) {
    try {
      // Get stored credentials
      let icuKey: string | null = null;
      let icuAthleteId: string | null = null;

      if (athleteId === ADMIN_ATHLETE_ID) {
        // Barak: try cookie first, then KV
        const cookieKey = cookieStore.get("zwift_intervals_key")?.value;
        const cookieId  = cookieStore.get("zwift_intervals_id")?.value;
        if (cookieKey && cookieId) { icuKey = cookieKey; icuAthleteId = cookieId; }
      }
      if (!icuKey) {
        const creds = await getIntervalsCredentials(athleteId).catch(() => null);
        icuKey = creds?.icuKey ?? null;
        icuAthleteId = creds?.icuId ?? null;
      }

      if (!icuKey || !icuAthleteId) {
        results[athleteId] = { error: "No ICU credentials found" };
        continue;
      }

      // Fetch ICU WORKOUT events for this week
      const events = await listIntervalsEvents(icuKey, weekOf, endDate, icuAthleteId);
      const workouts = events.filter(e => e.category === "WORKOUT");

      // Also get cached plan for comparison
      const plan = await getCachedPlan(athleteId, weekOf);
      const planWorkouts = (plan?.workouts ?? [])
        .filter(w => w.type !== "Rest" && !w.type?.toLowerCase().includes("rest"))
        .map(w => ({ day: w.day, title: w.title, type: w.type, durationMin: w.durationMin }));

      results[athleteId] = {
        weekOf,
        icuEventsCount: workouts.length,
        icuWorkouts: workouts.map(e => ({
          date: e.start_date_local?.slice(0, 10),
          name: e.name,
          description: (e.description ?? "").slice(0, 120),
        })),
        kvPlanWorkouts: planWorkouts,
      };
    } catch (e) {
      results[athleteId] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, results });
}
