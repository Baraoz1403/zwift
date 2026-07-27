/**
 * Shared KV read/write helpers for cross-device + headless plan state.
 *
 * Split out of app/api/ai/weekly-plan/route.ts so the exact same "mirror
 * what just happened to KV" logic is available to
 * app/api/ai/weekly-plan/cron/route.ts too, and so both routes agree on one
 * set of key names instead of each hand-rolling its own.
 *
 * All reads/writes are best-effort: kvSet/kvGet already no-op silently when
 * KV isn't configured (see lib/kv.ts), and every function here is safe to
 * call whether or not that's the case - a KV failure must never break the
 * interactive "Generate" flow for someone sitting at the dashboard, and for
 * the cron path a KV failure just means that one athlete is skipped this
 * run, not a hard crash for everyone else.
 */
import { kvGet, kvSet, kvAvailable } from "./kv";
import type { WeeklyWorkout } from "./ai";
import type { MacroCycleState } from "./periodization";
import type { RiderTrainingProfile } from "./rider-profile";

export interface StoredZwiftAuth {
  refreshToken: string;
  /** Not used to skip a refresh call (Zwift access tokens are short-lived
   *  and the cron job always runs infrequently enough to just refresh every
   *  time) - kept only for observability/debugging. */
  savedAt: number;
}

/** Registers an athlete in the "known athletes" registry the cron job scans. */
export async function registerAthlete(athleteId: string): Promise<void> {
  if (!kvAvailable()) return;
  try {
    const raw = await kvGet("zwift:athletes");
    const registry: string[] = raw ? JSON.parse(raw) : [];
    if (!registry.includes(athleteId)) {
      registry.push(athleteId);
      await kvSet("zwift:athletes", JSON.stringify(registry));
    }
  } catch {
    // best-effort
  }
}

/** Returns every athlete id the app has ever seen a login/plan for. */
export async function getKnownAthletes(): Promise<string[]> {
  if (!kvAvailable()) return [];
  try {
    const raw = await kvGet("zwift:athletes");
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Mirrors a Zwift refresh token to KV, keyed by athlete id - called after
 * every successful login AND every successful token refresh (Zwift may
 * rotate the refresh token itself, so the newest one always wins). This is
 * the missing piece that lets the cron job obtain a fresh access token for
 * an athlete without any browser session at all: the interactive login/
 * refresh flows keep the token alive here as a side effect of the rider's
 * own normal usage, and the cron job just reads whatever was last saved.
 *
 * If the rider never opens the dashboard for long enough that even this
 * refresh token itself expires, the cron job's refresh call will fail for
 * that athlete and that run is skipped for them - there's no way around
 * needing at least occasional real usage to keep Zwift's own token chain
 * alive, but that's a Zwift-imposed constraint, not one this app adds.
 */
export async function mirrorZwiftAuthToKv(athleteId: string, refreshToken: string | undefined): Promise<void> {
  if (!kvAvailable() || !athleteId || !refreshToken) return;
  try {
    await kvSet(`zwift:${athleteId}:refresh_token`, refreshToken);
    await kvSet(`zwift:${athleteId}:refresh_token_saved_at`, String(Date.now()));
  } catch {
    // best-effort
  }
}

export async function getStoredZwiftRefreshToken(athleteId: string): Promise<string | null> {
  if (!kvAvailable()) return null;
  return kvGet(`zwift:${athleteId}:refresh_token`);
}

export interface MirrorPlanStateInput {
  riderProfile?: RiderTrainingProfile;
  macroCycle: MacroCycleState;
  plan: { weekOf: string; workouts: WeeklyWorkout[] };
}

/**
 * Mirrors the state a plan-generation call just used/produced into KV, so a
 * later headless run (cron) or a login from a different device can pick up
 * exactly where this one left off, instead of starting the rider's
 * mesocycle/profile over from nothing.
 */
export async function mirrorStateToKv(athleteId: string, data: MirrorPlanStateInput): Promise<void> {
  if (!kvAvailable() || !athleteId) return;
  try {
    await registerAthlete(athleteId);
    if (data.riderProfile) {
      await kvSet(`zwift:${athleteId}:rider_profile`, JSON.stringify(data.riderProfile));
    }
    await kvSet(`zwift:${athleteId}:macro_cycle`, JSON.stringify(data.macroCycle));
    await kvSet(`zwift:${athleteId}:last_plan`, JSON.stringify(data.plan));
    await kvSet(`zwift:${athleteId}:last_plan_at`, String(Date.now()));
  } catch {
    // Never let KV mirroring failures affect the interactive response.
  }
}

/**
 * Updates ONLY the stored rider profile, independent of any plan/macro-cycle
 * write. Needed for the weekly-plan route's cache-hit path: when a plan for
 * the requested week already sits in KV, that route intentionally skips the
 * whole generation pipeline (and therefore skips mirrorStateToKv, which
 * requires a freshly generated macroCycle + plan to write alongside the
 * profile) - but the request can still be carrying a just-edited
 * riderProfile (training-profile.tsx dispatches "zwift:profile-saved", which
 * immediately calls handleGenerate() with the new profile, regardless of
 * whether the plan itself changes). Without this, a profile edit made after
 * this week's plan was already generated (i.e. almost every edit, since the
 * plan is usually already cached) never reached KV at all: the rider's own
 * next page load re-fetches /api/ai/weekly-plan/state, which reads back
 * whatever rider_profile was stored the LAST time a plan was actually
 * generated for this week - silently reverting every edit made since,
 * including deletions, back to that stale snapshot, forever, until the plan
 * cache itself expires or a riderNote forces a real regeneration.
 */
export async function updateStoredRiderProfile(athleteId: string, riderProfile: RiderTrainingProfile): Promise<void> {
  if (!kvAvailable() || !athleteId) return;
  try {
    await kvSet(`zwift:${athleteId}:rider_profile`, JSON.stringify(riderProfile));
  } catch {
    // best-effort — never block the response
  }
}

export interface StoredAthleteState {
  riderProfile?: RiderTrainingProfile;
  macroCycle: MacroCycleState | null;
  previousPlan: { weekOf: string; workouts: WeeklyWorkout[] } | null;
  icuKey: string | null;
  icuId: string | null;
}

// ── Per-week plan cache ───────────────────────────────────────────────────────
// The interactive POST route and the prefetch both write here so any device
// that asks for the same week gets the cached result without an AI call.
// TTL is 14 days so stale plans are cleaned up automatically.
// Key format: zwift:{athleteId}:plan:{weekOf}  (e.g. zwift:12345:plan:2026-07-06)
const PLAN_CACHE_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

export interface CachedWeeklyPlan {
  weekOf: string;
  summary: string;
  workouts: WeeklyWorkout[];
}

/** Read the cached plan for a specific week. Returns null if not cached or KV unavailable. */
export async function getCachedPlan(athleteId: string, weekOf: string): Promise<CachedWeeklyPlan | null> {
  if (!kvAvailable() || !athleteId || !weekOf) return null;
  try {
    const raw = await kvGet(`zwift:${athleteId}:plan:${weekOf}`);
    return raw ? (JSON.parse(raw) as CachedWeeklyPlan) : null;
  } catch {
    return null;
  }
}

/** Cache a generated plan for a specific week. 14-day TTL auto-cleans stale entries. */
export async function setCachedPlan(athleteId: string, plan: CachedWeeklyPlan): Promise<void> {
  if (!kvAvailable() || !athleteId || !plan.weekOf) return;
  try {
    await kvSet(`zwift:${athleteId}:plan:${plan.weekOf}`, JSON.stringify(plan), PLAN_CACHE_TTL_SECONDS);
  } catch {
    // best-effort — never block the response
  }
}

// ── Per-week Intervals.icu sync marker ────────────────────────────────────
// Tracks whether the CURRENTLY cached plan for a given week has already been
// confirmed pushed to Intervals.icu at least once. Exists so a cache-hit
// read of an already-synced plan (the common case: every subsequent page
// load for the same week) doesn't re-push a fresh ZWO copy every time -
// only the very first read after a plan lacks this marker (freshly
// generated, or a plan that was cached before ICU was connected, or before
// this marker existed at all) triggers a sync. Same TTL as the plan cache
// itself so the marker never outlives the plan it describes.
const ICU_SYNC_MARKER_TTL_SECONDS = PLAN_CACHE_TTL_SECONDS;

// ── Rider identity cache (firstName + ftp) ───────────────────────────────────
// Written at login and on every successful profile fetch so pages have a
// reliable fallback when the live Zwift API call fails (expired token, rate
// limit) — instead of showing "Athlete" and no FTP.

export async function storeRiderIdentity(
  athleteId: string,
  firstName: string | undefined,
  ftp: number | undefined,
): Promise<void> {
  if (!kvAvailable() || !athleteId) return;
  try {
    await kvSet(`zwift:${athleteId}:identity`, JSON.stringify({ firstName, ftp }), 30 * 24 * 3600);
  } catch { /* best-effort */ }
}

export async function getRiderIdentity(
  athleteId: string,
): Promise<{ firstName?: string; ftp?: number } | null> {
  if (!kvAvailable() || !athleteId) return null;
  try {
    const raw = await kvGet(`zwift:${athleteId}:identity`);
    return raw ? (JSON.parse(raw) as { firstName?: string; ftp?: number }) : null;
  } catch { return null; }
}

export async function wasIntervalsSynced(athleteId: string, weekOf: string): Promise<boolean> {
  if (!kvAvailable() || !athleteId || !weekOf) return false;
  try {
    return (await kvGet(`zwift:${athleteId}:plan:${weekOf}:icu_synced`)) === "1";
  } catch {
    return false;
  }
}

export async function markIntervalsSynced(athleteId: string, weekOf: string): Promise<void> {
  if (!kvAvailable() || !athleteId || !weekOf) return;
  try {
    await kvSet(`zwift:${athleteId}:plan:${weekOf}:icu_synced`, "1", ICU_SYNC_MARKER_TTL_SECONDS);
  } catch {
    // best-effort
  }
}

/** Reads back everything the cron job needs to regenerate + push a plan for one athlete. */
export async function getStoredAthleteState(athleteId: string): Promise<StoredAthleteState> {
  const [profileRaw, macroRaw, planRaw, icuKey, icuId] = await Promise.all([
    kvGet(`zwift:${athleteId}:rider_profile`),
    kvGet(`zwift:${athleteId}:macro_cycle`),
    kvGet(`zwift:${athleteId}:last_plan`),
    kvGet(`zwift:${athleteId}:icu_key`),
    kvGet(`zwift:${athleteId}:icu_id`),
  ]);
  return {
    riderProfile: profileRaw ? (JSON.parse(profileRaw) as RiderTrainingProfile) : undefined,
    macroCycle: macroRaw ? (JSON.parse(macroRaw) as MacroCycleState) : null,
    previousPlan: planRaw ? (JSON.parse(planRaw) as { weekOf: string; workouts: WeeklyWorkout[] }) : null,
    icuKey,
    icuId,
  };
}

export interface IntervalsCredentials {
  icuKey: string;
  icuId: string | null;
}

/**
 * Lighter read than getStoredAthleteState for callers that only need the
 * Intervals.icu credentials - e.g. the interactive weekly-plan route, which
 * pushes the freshly generated plan to ICU server-side right after
 * generation instead of leaving that to the browser (see the doc comment on
 * the sync call in app/api/ai/weekly-plan/route.ts for why). Returns null
 * when the rider hasn't connected Intervals.icu, so callers can just skip
 * the sync rather than branching on an empty string.
 */
export async function getIntervalsCredentials(athleteId: string): Promise<IntervalsCredentials | null> {
  if (!kvAvailable() || !athleteId) return null;
  const icuKey = await kvGet(`zwift:${athleteId}:icu_key`);
  if (!icuKey) return null;
  const icuId = await kvGet(`zwift:${athleteId}:icu_id`);
  return { icuKey, icuId };
}

// ── WhatsApp phone number ─────────────────────────────────────────────────────
// Stored separately from RiderTrainingProfile so it never reaches the AI prompt.
// Format: E.164 (e.g. "+972501234567"). Passed to Twilio when ICU webhook fires.

export async function saveAthletePhone(athleteId: string, phone: string): Promise<void> {
  if (!kvAvailable() || !athleteId) return;
  try {
    // Normalise: strip spaces, ensure leading +
    const normalised = phone.trim().replace(/\s+/g, "");
    await kvSet(`zwift:${athleteId}:whatsapp_phone`, normalised);
  } catch { /* best-effort */ }
}

export async function getAthletePhone(athleteId: string): Promise<string | null> {
  if (!kvAvailable() || !athleteId) return null;
  return kvGet(`zwift:${athleteId}:whatsapp_phone`);
}

/**
 * Reverse-lookup: given an Intervals.icu athlete ID (e.g. "i12345"),
 * find the Zwift athlete ID in the registry. Used by the ICU webhook to
 * identify who just finished a ride without requiring a session cookie.
 * Returns null if not found.
 */
export async function findAthleteByIcuId(icuAthleteId: string): Promise<string | null> {
  if (!kvAvailable() || !icuAthleteId) return null;
  try {
    const raw = await kvGet("zwift:athletes");
    const registry: string[] = raw ? JSON.parse(raw) : [];
    for (const athleteId of registry) {
      const stored = await kvGet(`zwift:${athleteId}:icu_id`);
      if (stored === icuAthleteId) return athleteId;
    }
    return null;
  } catch {
    return null;
  }
}
