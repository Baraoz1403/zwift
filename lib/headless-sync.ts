/**
 * Server-side (no browser, no cookies) push of a generated plan straight to
 * Intervals.icu using an API key read from KV. This is now the ONE sync
 * implementation for the whole app - both app/api/ai/weekly-plan/route.ts
 * (the interactive Generate/Regenerate path) and
 * app/api/ai/weekly-plan/cron/route.ts (the nightly headless path) call this
 * directly, right after a plan is generated, so a plan syncs exactly once
 * per generation no matter which path produced it or how many browsers/
 * devices are open.
 *
 * A client-side equivalent (pushPlanToIntervals in weekly-plan.tsx) used to
 * also exist and ran automatically after every browser-triggered generation.
 * It was removed because having both the browser AND the server push the
 * same plan is exactly what caused duplicate events on Intervals.icu/Zwift in
 * the first place: two devices opening the dashboard around the same
 * generation each ran their own push-then-cleanup pass, each blind to the
 * other's newly-created event ids.
 *
 * The algorithm below (push fresh copies first, only then clean up;
 * clean-up range spans the WHOLE plan week, not just active days; matched by
 * date, not by a single captured id) exists in its current shape because of
 * several real production bugs: an empty-calendar outage from
 * delete-before-push, a self-deleted just-created entry, and a stale entry
 * left forever on a day that turned into a Rest day. Change it carefully -
 * a from-scratch reimplementation would risk reintroducing any one of those.
 *
 * IMPORTANT — syncPlanToIntervalsHeadless only cleans within the plan being
 * synced's OWN week (its narrowest correct range: rest days included, other
 * weeks not). The old client-side pushPlanToIntervals also fired a SEPARATE,
 * much wider dedup pass (see wideCleanupRange() above) after every push, to
 * catch orphaned events from other weeks - a stale "next week" prefetch, or
 * duplicates left over from before sync worked correctly. When that client
 * code was removed, its callers (app/api/ai/weekly-plan/route.ts) must call
 * cleanupIcuDuplicates(wideCleanupRange()) themselves as a second step, or
 * exactly that class of stale-duplicate-in-another-week bug comes back.
 */
import { pushWorkoutToIntervals, listIntervalsEvents, deleteEventFromIntervals } from "./intervals";
import { generateZwoXml, isRestDay } from "./zwo";
import { workoutDateLabel, ensureWorkoutDates, normalizeToSix } from "./plan-shape";
import { getIntervalsCredentials, markIntervalsSynced } from "./kv-plan-state";
import { kvSet } from "./kv";
import type { WeeklyPlan, WeeklyWorkout } from "./ai";

export interface HeadlessSyncResult {
  pushed: number;
  deleted: number;
  errors: string[];
}

/**
 * The standard 7-week ICU dedup window (4 weeks back, current week, 2 weeks
 * ahead of "this Monday", UTC) - shared by every automatic/manual cleanup
 * pass so the cron job, the interactive route, and the manual "clean up
 * Zwift calendar" endpoint can't drift into three different ideas of "wide
 * enough". Was previously copy-pasted separately in each of those three
 * places; consolidated here after that drift already caused a real gap (see
 * the doc comment on syncPlanToIntervalsHeadless below).
 *
 * The +2-future-weeks / -4-past-weeks span exists because a narrower
 * range - e.g. just the plan being synced right now - misses orphaned
 * events sitting outside that one week: a stale "next week" plan generated
 * earlier, or last week's plan left over from before ICU sync worked
 * correctly, both show up to the rider as duplicate/wrong workouts in
 * Zwift's Custom Workouts menu even though the CURRENT week's sync is
 * working perfectly.
 */
export function wideCleanupRange(): { oldest: string; newest: string } {
  const now = new Date();
  const dow = now.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() + diffToMonday);
  const oldestDate = new Date(thisMonday);
  oldestDate.setUTCDate(thisMonday.getUTCDate() - 28);
  const newestDate = new Date(thisMonday);
  newestDate.setUTCDate(thisMonday.getUTCDate() + 6 + 14);
  return {
    oldest: oldestDate.toISOString().slice(0, 10),
    newest: newestDate.toISOString().slice(0, 10),
  };
}

/**
 * Dedup + stale-past-event cleanup pass.
 *
 * For dates BEFORE this Monday (UTC): delete ALL WORKOUT events — these are
 * orphaned planned entries from old plan weeks that were never cleaned up.
 * They sit on Intervals.icu and get re-synced to Zwift on every ICU→Zwift
 * sync, appearing as "extra" workouts in Zwift's custom workout library even
 * though the current week's plan is clean. Removing them here is safe: they
 * are planned (WORKOUT category) events from past weeks, not completed
 * activity records which live in a different ICU category.
 *
 * For dates ON OR AFTER this Monday: keep one per date (the most recently
 * created one) and delete any duplicates — the normal dedup behaviour.
 *
 * Does NOT push any new events — safe to call mid-week.
 */
export async function cleanupIcuDuplicates(
  apiKey: string,
  athleteId: string | undefined,
  oldest: string,
  newest: string
): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = [];
  let deleted = 0;

  // Compute this Monday in UTC — everything strictly before this date is stale.
  const now = new Date();
  const dow = now.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() + diffToMonday);
  const thisMondayStr = thisMonday.toISOString().slice(0, 10);

  try {
    const allEvents = await listIntervalsEvents(apiKey, oldest, newest, athleteId);
    // Filter to WORKOUT events only — don't touch races, notes, or other
    // calendar entries that happen to share a date with a workout.
    const existingEvents = allEvents.filter(e => e.category === "WORKOUT");
    const byDate = new Map<string, (string | number)[]>();
    for (const e of existingEvents) {
      const day = (e.start_date_local ?? "").slice(0, 10);
      if (!day) continue;
      if (!byDate.has(day)) byDate.set(day, []);
      byDate.get(day)!.push(e.id);
    }
    for (const [day, ids] of byDate) {
      if (day < thisMondayStr) {
        // Past week: delete ALL workout events — they're orphaned plan entries.
        for (const id of ids) {
          const r = await deleteEventFromIntervals(apiKey, id, athleteId);
          if (r.ok) deleted++;
          else if (r.error) errors.push(`delete ${id}: ${r.error}`);
        }
      } else {
        // Current or future week: only remove same-day duplicates.
        if (ids.length <= 1) continue;
        // Keep the highest ID (most recently created on ICU), delete older duplicates.
        // Use numeric comparison — string comparison breaks for IDs of different lengths
        // (e.g. "9" > "10" as strings, but 10 > 9 as numbers).
        const keep = ids.reduce((a, b) => (Number(b) > Number(a) ? b : a));
        for (const id of ids) {
          if (id === keep) continue;
          const r = await deleteEventFromIntervals(apiKey, id, athleteId);
          if (r.ok) deleted++;
          else if (r.error) errors.push(`delete ${id}: ${r.error}`);
        }
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
  riddenDates: Set<string>,
  riderName?: string,
): Promise<HeadlessSyncResult> {
  const errors: string[] = [];
  let deleted = 0;

  // Build the full date range for the plan week upfront — used by both steps.
  const allDates = plan.workouts.map((w) => w.date).filter(Boolean).sort() as string[];
  if (allDates.length === 0) return { pushed: 0, deleted: 0, errors };
  const oldest = allDates[0];
  const newest = allDates[allDates.length - 1];

  // ── Step 1: DELETE all existing WORKOUT events for the plan week FIRST ────
  // This "delete before push" order eliminates the race condition where Zwift
  // syncs from ICU between the push and the old-event cleanup, causing a
  // transient duplicate state that gets cached in Zwift. Previously the code
  // pushed first then cleaned up — safe in theory (we kept the newly pushed
  // IDs) but left a window where both old and new events coexisted.
  try {
    const preExisting = await listIntervalsEvents(apiKey, oldest, newest, athleteId);
    const staleWorkouts = preExisting.filter(e => e.category === "WORKOUT");
    await Promise.all(staleWorkouts.map(async (e) => {
      const r = await deleteEventFromIntervals(apiKey, e.id, athleteId);
      if (r.ok) { deleted++; }
      else if (r.error) { errors.push(`pre-delete ${e.id}: ${r.error}`); }
    }));
  } catch (e) {
    errors.push(`pre-cleanup: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Step 2: PUSH fresh events for every non-rest unridden day ─────────────
  // Now that the slate is clean, push new events. No duplicates possible.
  // Run workouts: generateZwoXml emits <sportType>run</sportType> for run
  // workouts, and pushWorkoutToIntervals maps the type to "Run" via
  // toIntervalsSportType(), so ICU receives and syncs them to Zwift RUN mode.
  const daysToPush = plan.workouts.filter(
    (w) => !isRestDay(w.type) && !(w.date && riddenDates.has(w.date))
  );

  const pushOne = async (w: WeeklyWorkout) => {
    if (!w.date) return { ok: false as const };
    const dateLabel = workoutDateLabel(w.date);
    const titledWorkout = dateLabel ? `${dateLabel} · ${w.title}` : w.title;
    const zwoXml = generateZwoXml(w, undefined, "Zwift Dashboard AI", riderName);
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
  const pushedDates = new Set(
    daysToPush.filter((_, i) => pushResults[i].ok).map((w) => w.date).filter(Boolean) as string[]
  );

  return { pushed: pushedDates.size, deleted, errors };
}

export interface IntervalsSyncResult {
  pushed: number;
  deleted: number;
  errors: string[];
}

/**
 * The single entry point every caller (the interactive weekly-plan route,
 * the login/connect auto-provisioning flow) uses to push a plan to
 * Intervals.icu and clean up duplicates, in two passes: (1) the narrow
 * push-then-delete pass scoped to this plan's own week
 * (syncPlanToIntervalsHeadless above), then (2) a wide dedup-only sweep
 * (wideCleanupRange()) that catches orphaned events sitting OUTSIDE this
 * week - a stale previously-generated "next week" plan, or leftovers from
 * before sync worked correctly. Skipping step 2 was a real regression once
 * before (see this file's top doc comment) - keep both steps together here
 * so no caller can accidentally reproduce that gap.
 *
 * Marks the week as synced in KV on success so a later cache-hit read of
 * the same plan doesn't redundantly re-push. Returns null (skips entirely)
 * when the rider hasn't connected ICU.
 *
 * IMPORTANT: this used to also accept a `cookieFallback` (the ICU key/id
 * read from an in-flight request's own cookies) to self-heal KV entries
 * that were missing credentials. That was removed after it caused a real
 * cross-account credential leak: the ICU cookie is scoped to the BROWSER,
 * not to whichever Zwift athlete happens to be logged in on it - on a
 * shared browser/device, a second rider logging in with their own Zwift
 * account but inheriting the first rider's still-present ICU cookie had
 * that first rider's Intervals.icu key silently written into their OWN KV
 * entry, so their plan would have pushed to the FIRST rider's ICU/Zwift
 * calendar. The KV-write bug that fallback existed to work around is fixed
 * at its source now (app/api/intervals/connect/route.ts always resolves a
 * real athleteId before writing), so there's no gap left to compensate for
 * - only the credential-attribution risk. Never reintroduce a
 * cookie-derived credential fallback here; KV is the only trustworthy
 * source for which ICU account belongs to which Zwift athlete.
 */
export async function syncPlanToIcuAndMark(
  athleteId: string,
  weekOf: string,
  plan: { weekOf: string; summary: string; workouts: WeeklyWorkout[] },
  riddenDates: Set<string>,
  riderName?: string,
): Promise<IntervalsSyncResult | null> {
  const creds = await getIntervalsCredentials(athleteId);
  if (!creds) return null;

  const normalizedPlan = ensureWorkoutDates(normalizeToSix(plan));
  const narrow = await syncPlanToIntervalsHeadless(creds.icuKey, creds.icuId ?? undefined, normalizedPlan, riddenDates, riderName);

  const { oldest, newest } = wideCleanupRange();
  const wide = await cleanupIcuDuplicates(creds.icuKey, creds.icuId ?? undefined, oldest, newest);

  // Only mark synced when at least one workout was actually pushed.
  // If the push failed (expired OAuth token, ICU unreachable, 0 workouts
  // pushed), we intentionally leave the flag unset so the next plan load
  // retries automatically — fixing the root cause of "runs once, never again".
  if (narrow.pushed > 0) {
    await markIntervalsSynced(athleteId, weekOf);
  }

  // If every push failed with 401/403, the ICU token is expired.
  // Mark icu_invalid so the UI shows a reconnect screen on next load.
  // Without this, the cron fails silently forever and the athlete never knows.
  const allErrors = [...narrow.errors, ...wide.errors];
  const authFailures = allErrors.filter(e => e.includes("403") || e.includes("401")).length;
  const totalPushAttempts = narrow.pushed + allErrors.filter(e => e.startsWith("push")).length;
  if (narrow.pushed === 0 && totalPushAttempts > 0 && authFailures > 0) {
    await kvSet(`zwift:${athleteId}:icu_invalid`, "1", 24 * 60 * 60).catch(() => {});
  }

  return {
    pushed: narrow.pushed,
    deleted: narrow.deleted + wide.deleted,
    errors: allErrors,
  };
}
