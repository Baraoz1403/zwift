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
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";
import { kvDel } from "@/lib/kv";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchActivities } from "@/lib/zwift";
import { listIntervalsEvents, deleteEventFromIntervals } from "@/lib/intervals";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  void req;
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

  // Clear the icu_synced marker so the push runs even if it previously succeeded.
  // This is the correct thing to do when the user explicitly asks for a resync.
  await kvDel(`zwift:${athleteId}:plan:${weekOf}:icu_synced`).catch(() => {});

  // Build ridden dates so already-completed days don't get re-pushed
  let riddenDates = new Set<string>();
  try {
    const activities = await fetchActivities(session.accessToken, session.athleteId!);
    riddenDates = new Set(
      activities.map(a => ((a.startDate as string) ?? "").slice(0, 10)).filter(Boolean)
    );
  } catch { /* best-effort */ }

  const result = await syncPlanToIcuAndMark(athleteId, weekOf, plan, riddenDates);
  if (!result) {
    return NextResponse.json({ ok: false, error: "ICU credentials missing or invalid — please reconnect in Settings." });
  }

  // ── Clean up orphaned next-week ICU events ────────────────────────────────
  // The wide cleanup in syncPlanToIcuAndMark only DEDUPLICATES future events,
  // it never deletes them. This means stale events from a previously-synced
  // next-week plan remain on ICU and appear alongside this week's workouts
  // in Zwift's custom workout menu — producing the "part from this week,
  // part from next week" confusion.
  //
  // Fix: after syncing this week, check if a next-week plan is cached in KV.
  // If there IS one, those events are valid — leave them.
  // If there is NOT one, every WORKOUT event in next week's date range is
  // an orphan from a previous generation cycle and should be removed.
  let orphanedDeleted = 0;
  try {
    // Compute next Monday (weekOf + 7 days) and next Sunday (+ 13 days)
    const base = new Date(weekOf + "T00:00:00Z");
    const nextMondayDate = new Date(base);
    nextMondayDate.setUTCDate(base.getUTCDate() + 7);
    const nextSundayDate = new Date(base);
    nextSundayDate.setUTCDate(base.getUTCDate() + 13);
    const nextMonday = nextMondayDate.toISOString().slice(0, 10);
    const nextSunday  = nextSundayDate.toISOString().slice(0, 10);

    const nextWeekPlan = await getCachedPlan(athleteId, nextMonday);
    if (!nextWeekPlan) {
      // No valid next-week plan — any WORKOUT events in that range are orphans
      const nextWeekEvents = await listIntervalsEvents(
        creds.icuKey, nextMonday, nextSunday, creds.icuId ?? undefined
      );
      const orphans = nextWeekEvents.filter(e => e.category === "WORKOUT");
      const deleteResults = await Promise.all(
        orphans.map(e => deleteEventFromIntervals(creds.icuKey, e.id, creds.icuId ?? undefined))
      );
      orphanedDeleted = deleteResults.filter(r => r.ok).length;
    }
  } catch { /* best-effort — never block the response */ }

  return NextResponse.json({
    ok: result.pushed > 0 || result.errors.length === 0,
    pushed: result.pushed,
    deleted: result.deleted + orphanedDeleted,
    errors: result.errors,
    weekOf,
  });
}
