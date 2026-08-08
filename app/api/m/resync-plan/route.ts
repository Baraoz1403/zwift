/**
 * POST /api/m/resync-plan
 *
 * Session-authenticated endpoint. Re-pushes the current week's cached plan
 * to Intervals.icu without regenerating it or requiring CRON_SECRET.
 *
 * Use this when the plan is correct in Volt but missing from ICU/Zwift
 * (e.g. after the ICU token expired and was refreshed, or after reconnecting
 * ICU). Clears the icu_synced marker first so the push always runs even if
 * a previous sync had succeeded.
 *
 * Returns { ok: boolean, pushed: number, deleted: number, errors: string[] }.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials } from "@/lib/kv-plan-state";
import { syncPlanToIntervalsHeadless } from "@/lib/headless-sync";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchActivities } from "@/lib/zwift";
import { withPilotIcuWriteApproval } from "@/lib/pilot-mode";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body?.confirm !== "APPROVE_ICU_SYNC") {
    return NextResponse.json(
      { ok: false, error: "Explicit plan approval is required." },
      { status: 400 },
    );
  }
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  const athleteId = String(session.athleteId);
  const weekOf = mondayOfCurrentWeek();

  const plan = await getCachedPlan(athleteId, weekOf);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "No plan cached for current week. Generate a plan first." });
  }

  const creds = await getIntervalsCredentials(athleteId);
  if (!creds) {
    return NextResponse.json({ ok: false, error: "Intervals.icu not connected. Please connect in Settings." });
  }

  // Build ridden dates so already-completed days don't get re-pushed
  let riddenDates = new Set<string>();
  try {
    const activities = await fetchActivities(session.accessToken, session.athleteId!);
    riddenDates = new Set(
      activities.map(a => ((a.startDate as string) ?? "").slice(0, 10)).filter(Boolean)
    );
  } catch { /* best-effort */ }

  const result = await withPilotIcuWriteApproval(() =>
    // Pilot approval is deliberately limited to the reviewed plan's own week.
    // Completed activities are a different ICU category and are never touched.
    syncPlanToIntervalsHeadless(creds.icuKey, creds.icuId ?? undefined, plan, riddenDates)
  );
  if (!result) {
    return NextResponse.json({ ok: false, error: "ICU credentials missing or invalid — please reconnect in Settings." });
  }

  return NextResponse.json({
    ok: result.pushed > 0 || result.errors.length === 0,
    pushed: result.pushed,
    deleted: result.deleted,
    errors: result.errors,
    weekOf,
  });
}
