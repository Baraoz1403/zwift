import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile } from "@/lib/zwift";
import { getStoredAthleteState } from "@/lib/kv-plan-state";
import { cleanupIcuDuplicates } from "@/lib/headless-sync";

/**
 * POST /api/intervals/cleanup
 *
 * Scans the current week's ICU events and deletes any duplicates —
 * keeping only the most-recently-created event per date. Safe to call
 * mid-week: it never pushes new events, only removes old ones.
 *
 * Called from the dashboard "Clean up Zwift calendar" action when the
 * rider notices duplicate workouts in the Zwift app (a side effect of
 * cross-device races that accumulated before the auto-sync was removed).
 */
export async function POST() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  // Resolve ICU key from cookie
  const icuKey = cookieStore.get("zwift_intervals_key")?.value;
  const icuId  = cookieStore.get("zwift_intervals_id")?.value;
  if (!icuKey) return NextResponse.json({ ok: false, error: "Intervals.icu not connected." });

  // Resolve athleteId (same fallback logic as the state endpoint)
  let athleteId = session.athleteId;
  if (!athleteId && session.accessToken) {
    try {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    } catch { /* best-effort */ }
  }

  // Get date range from the stored plan
  let oldest: string | undefined;
  let newest: string | undefined;
  if (athleteId) {
    const state = await getStoredAthleteState(athleteId);
    if (state.previousPlan?.workouts?.length) {
      const dates = state.previousPlan.workouts
        .map(w => (w as { date?: string }).date)
        .filter((d): d is string => !!d)
        .sort();
      oldest = dates[0];
      newest = dates[dates.length - 1];
    }
  }

  // If no stored plan, clean the current calendar week as fallback
  if (!oldest || !newest) {
    const now = new Date();
    const dow = now.getUTCDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + diffToMonday);
    oldest = monday.toISOString().slice(0, 10);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    newest = sunday.toISOString().slice(0, 10);
  }

  const result = await cleanupIcuDuplicates(icuKey, icuId ?? undefined, oldest, newest);
  return NextResponse.json({ ok: true, deleted: result.deleted, errors: result.errors, range: { oldest, newest } });
}
