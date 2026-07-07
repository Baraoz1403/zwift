/**
 * Server-side (no browser, no cookies) equivalent of pushPlanToIntervals in
 * app/dashboard/weekly-plan.tsx - lets app/api/ai/weekly-plan/cron/route.ts
 * push a freshly generated plan straight to Intervals.icu using an API key
 * read from KV, without a rider ever opening the dashboard.
 *
 * This intentionally mirrors the client version's algorithm exactly (push
 * fresh copies first, only then clean up; clean-up range spans the WHOLE
 * plan week, not just active days; matched by date, not by a single
 * captured id) rather than reinventing it - that algorithm exists in its
 * current shape because of several real production bugs (an empty-calendar
 * outage from delete-before-push, a self-deleted just-created entry, and a
 * stale entry left forever on a day that turned into a Rest day - see the
 * doc comments on pushPlanToIntervals and on the cleanup-range fix in
 * weekly-plan.tsx). A from-scratch reimplementation here would risk
 * reintroducing any one of those.
 */
import { pushWorkoutToIntervals, listIntervalsEvents, deleteEventFromIntervals } from "./intervals";
import { generateZwoXml, isRestDay } from "./zwo";
import { workoutDateLabel } from "./plan-shape";
import type { WeeklyPlan, WeeklyWorkout } from "./ai";

export interface HeadlessSyncResult {
  pushed: number;
  deleted: number;
  errors: string[];
}

/**
 * Dedup-only pass: for each date in [oldest..newest] that already has more than
 * one WORKOUT event on ICU, keep the most-recently-created one and delete the
 * rest. Does NOT push any new events — safe to call mid-week without knowing
 * which days the athlete has already ridden. Returns the count of events deleted.
 */
export async function cleanupIcuDuplicates(
  apiKey: string,
  athleteId: string | undefined,
  oldest: string,
  newest: string
): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = [];
  let deleted = 0;
  try {
    const existingEvents = await listIntervalsEvents(apiKey, oldest, newest, athleteId);
    const byDate = new Map<string, (string | number)[]>();
    for (const e of existingEvents) {
      const day = (e.start_date_local ?? "").slice(0, 10);
      if (!day) continue;
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day)!.push(e.id);
    }
    for (const [, ids] of byDate) {
      if (ids.length <= 1) continue;
      // Keep the highest ID (most recently created on ICU), delete older duplicates.
      const keep = ids.reduce((a, b) => (String(b) > String(a) ? b : a));
      for (const id of ids) {
        if (id === keep) continue;
        const r = await deleteEventFromIntervals(apiKey, id, athleteId);
        if (r.ok) deleted++;
        else if (r.error) errors.push(`delete ${id}: ${r.error}`);
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  return { deleted, errors };
}

export async function syncPlanToIntervalsHeadless(
  apiKey: string,
  athleteId: string | undefined,
  plan: WeeklyPlan,
  riddenDates: Set<string>
): Promise<HeadlessSyncResult> {
  const errors: string[] = [];

  // 1. Push fresh copies first for every non-rest day that hasn't actually
  // been ridden yet (same rule as the client: an already-ridden day's own
  // completed-ride data is the source of truth, not the plan).
  const daysToPush = plan.workouts.filter(
    (w) => !isRestDay(w.type) && !(w.date && riddenDates.has(w.date))
  );

  const pushOne = async (w: WeeklyWorkout) => {
    if (!w.date) return { ok: false as const };
    const dateLabel = workoutDateLabel(w.date);
    const titledWorkout = dateLabel ? `${dateLabel} · ${w.title}` : w.title;
    const zwoXml = generateZwoXml(w);
    const r = await pushWorkoutToIntervals({
      apiKey,
      athleteId,
      workoutDay: w.date,
      title: titledWorkout,
      description: w.description,
      durationMin: w.durationMin,
      type: w.type,
      zwoXml,
    });
    if (!r.ok && r.error) errors.push(`push ${w.date}: ${r.error}`);
    return r;
  };

  const pushResults = await Promise.all(daysToPush.map(pushOne));
  const newlyPushedIds = new Set(
    pushResults.filter((r) => r.ok && r.eventId != null).map((r) => r.eventId as string | number)
  );
  const pushedDates = new Set(
    daysToPush.filter((_, i) => pushResults[i].ok).map((w) => w.date).filter(Boolean) as string[]
  );

  // 2. Clean up, matched by date, spanning the FULL plan week (not just the
  // days we pushed to this cycle) - see the cleanup-range fix in
  // weekly-plan.tsx for why a narrower range leaves stale entries behind on
  // days that used to be active and are now Rest.
  const allDates = plan.workouts.map((w) => w.date).filter(Boolean).sort() as string[];
  if (allDates.length === 0) return { pushed: pushedDates.size, deleted: 0, errors };
  const oldest = allDates[0];
  const newest = allDates[allDates.length - 1];

  let deleted = 0;
  try {
    const existingEvents = await listIntervalsEvents(apiKey, oldest, newest, athleteId);
    const byDate = new Map<string, (string | number)[]>();
    for (const e of existingEvents) {
      const day = (e.start_date_local ?? "").slice(0, 10);
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day)!.push(e.id);
    }

    const idsToDelete = new Set<string | number>();
    for (const [day, ids] of byDate) {
      if (pushedDates.has(day)) {
        const known = ids.filter((id) => newlyPushedIds.has(id));
        const keep = known.length > 0 ? known[0] : ids.reduce((a, b) => (String(b) > String(a) ? b : a));
        for (const id of ids) if (id !== keep) idsToDelete.add(id);
      } else {
        // Not a date we pushed this cycle (rest day, or already ridden) -
        // any existing entry there is stale and safe to remove.
        for (const id of ids) idsToDelete.add(id);
      }
    }

    for (const id of idsToDelete) {
      const r = await deleteEventFromIntervals(apiKey, id, athleteId);
      if (r.ok) {
        deleted++;
      } else if (r.error) {
        errors.push(`delete ${id}: ${r.error}`);
      }
    }
  } catch (e) {
    errors.push(`cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { pushed: pushedDates.size, deleted, errors };
}
