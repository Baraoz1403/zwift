import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan } from "@/lib/kv-plan-state";
import { fetchOwnProfile } from "@/lib/zwift";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet } from "@/lib/kv";
import { ensurePlanProvisioned } from "@/lib/plan-runner";

/**
 * GET /api/ai/weekly-plan/state
 *
 * ARCHITECTURE FIX v2 (July 2026):
 * v1 fix moved getCachedPlan before getStoredAthleteState, but getCachedPlan
 * requires a valid athleteId. Sessions created before athleteId was stored in
 * the session cookie arrive here with session.athleteId = undefined, so
 * getCachedPlan returned null immediately and fell through to last_plan.
 *
 * v2 fix: resolve athleteId FIRST (from session or live profile fetch),
 * THEN call getCachedPlan with the confirmed ID. This guarantees the per-week
 * cache is always checked regardless of session vintage.
 */

// The background auto-provisioning call (see the after() call below) can run
// a full AI plan generation (30-60s) - keep this route alive long enough for
// that to finish even though the response itself returns almost instantly.
export const maxDuration = 60;

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session invalid or expired." }, { status: 401 });

  // Step 1: Resolve athleteId -- session first, live fetch as fallback.
  // This MUST happen before getCachedPlan: the cache is keyed by athleteId,
  // and older sessions may not have it stored.
  let athleteId = session.athleteId;
  if (!athleteId && session.accessToken) {
    try {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    } catch { /* best-effort */ }
  }

  if (!athleteId) {
    return NextResponse.json({ ok: true, riderProfile: null, macroCycle: null, plan: null });
  }

  // Step 2: Compute current and next week dates.
  const currentWeek = mondayOfCurrentWeek();
  const nextWeekDate = new Date(currentWeek + "T00:00:00Z");
  nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);
  const nextWeek = nextWeekDate.toISOString().slice(0, 10);

  // Step 3: Check per-week cache (Key 1) BEFORE reading last_plan (Key 2).
  // Priority: current week cache > last_plan if current week > next week cache > last_plan.
  // All three reads happen in parallel for speed.
  const [state, currentCached, nextCached] = await Promise.all([
    getStoredAthleteState(athleteId),
    getCachedPlan(athleteId, currentWeek),
    getCachedPlan(athleteId, nextWeek),
  ]);

  let plan = state.previousPlan;
  if (currentCached) {
    plan = currentCached;
  } else if (state.previousPlan?.weekOf === currentWeek) {
    plan = state.previousPlan;
  } else if (nextCached) {
    plan = nextCached;
  }

  // Step 4: Read macro cycle (best-effort -- don't block on failure).
  let macroCycle = state.macroCycle;
  try {
    const macroRaw = await kvGet(`zwift:${athleteId}:macro_cycle`);
    if (macroRaw) macroCycle = JSON.parse(macroRaw);
  } catch { /* best-effort */ }

  // Auto-provision in the BACKGROUND, after the response is sent - this is
  // the dashboard's normal, most-frequently-hit read path (fires on every
  // page load), so it's the one place guaranteed to catch an athlete with a
  // long-lived session cookie who won't hit the login route again for weeks.
  // ensurePlanProvisioned no-ops quickly (one extra KV read) for anyone who
  // already has this week's plan, so this never slows down a normal load;
  // for anyone missing one, the plan/sync completes shortly after this
  // response, ready by their next reload. See its doc comment (lib/plan-
  // runner.ts) for why every login/connect/dashboard-load path needs its own
  // call to this instead of relying solely on the weekly cron.
  after(() => ensurePlanProvisioned(athleteId!, session.accessToken));

  return NextResponse.json({
    ok: true,
    riderProfile: state.riderProfile ?? null,
    macroCycle,
    plan,
  });
}
