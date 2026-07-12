import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { cleanupIcuDuplicates, wideCleanupRange } from "@/lib/headless-sync";

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

  // Scan the standard 7-week window (4 past weeks + current week + 2 future
  // weeks) - see wideCleanupRange()'s doc comment for why the range needs to
  // extend beyond just the current week.
  const { oldest, newest } = wideCleanupRange();

  // Guard against "0" — that's the fallback value set at login when the ICU
  // athlete ID wasn't available, and /athlete/0/events would return 404.
  const result = await cleanupIcuDuplicates(icuKey, icuId && icuId !== "0" ? icuId : undefined, oldest, newest);
  return NextResponse.json({ ok: true, deleted: result.deleted, errors: result.errors, range: { oldest, newest } });
}
