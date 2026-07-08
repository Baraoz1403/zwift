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
