import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan } from "@/lib/kv-plan-state";
import { fetchOwnProfile } from "@/lib/zwift";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet } from "@/lib/kv";

/**
 * GET /api/ai/weekly-plan/state
 *
 * ARCHITECTURE FIX (July 2026):
 * Previously read only from zwift:{id}:last_plan (Key 2) via mirrorStateToKv.
 * This always returned the PREVIOUS week's plan because mirrorStateToKv only
 * writes when result.weekOf === currentWeek -- but by the time Generate is
 * clicked for the new week, still holds the old week's data.
 *
 * Fix: check per-week cache (Key 1: zwift:{id}:plan:{weekOf}) for current
 * week FIRST. Fall back to last_plan only if no current-week cache exists.
 * This ensures every device always loads the correct current-week plan on
 * page load, with zero user action required.
 */
export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session invalid or expired." }, { status: 401 });

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

  const state = await getStoredAthleteState(athleteId);

  // Compute current week and next week Monday dates
  const currentWeek = mondayOfCurrentWeek();
  const nextWeekDate = new Date(currentWeek + "T00:00:00Z");
  nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);
  const nextWeek = nextWeekDate.toISOString().slice(0, 10);

  // KEY FIX: Read from per-week cache first (Key 1), not last_plan (Key 2).
  // Priority: current week cache > last_plan if current > next week cache > last_plan
  const [currentCached, nextCached] = await Promise.all([
    getCachedPlan(athleteId, currentWeek),
    getCachedPlan(athleteId, nextWeek),
  ]);

  let plan = state.previousPlan; // default: whatever last_plan has
  if (currentCached) {
    plan = currentCached; // best: current week from per-week cache
  } else if (state.previousPlan?.weekOf === currentWeek) {
    plan = state.previousPlan; // also fine: last_plan happens to be current week
  } else if (nextCached) {
    plan = nextCached; // prefetched next week
  }
  // else: fall through to state.previousPlan (may be stale, dashboard will auto-generate)

  // Read macro cycle
  let macroCycle = state.macroCycle;
  try {
    const macroRaw = await kvGet(`zwift:${athleteId}:macro_cycle`);
    if (macroRaw) macroCycle = JSON.parse(macroRaw);
  } catch { /* best-effort */ }

  return NextResponse.json({
    ok: true,
    riderProfile: state.riderProfile ?? null,
    macroCycle,
    plan,
  });
}
