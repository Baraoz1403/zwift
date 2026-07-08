import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
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

  // Scan a 5-week window (4 past weeks + current week) so accumulated
  // duplicates from prior plan pushes are swept up, not just today's week.
  // The rider's Zwift calendar shows workouts from all these weeks, so
  // a narrow current-week-only range leaves old duplicates behind.
  const now = new Date();
  const dow = now.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() + diffToMonday);
  // oldest = 4 weeks before this Monday
  const oldestDate = new Date(thisMonday);
  oldestDate.setUTCDate(thisMonday.getUTCDate() - 28);
  // newest = this Sunday
  const newestDate = new Date(thisMonday);
  newestDate.setUTCDate(thisMonday.getUTCDate() + 6);
  const oldest = oldestDate.toISOString().slice(0, 10);
  const newest = newestDate.toISOString().slice(0, 10);

  const result = await cleanupIcuDuplicates(icuKey, icuId ?? undefined, oldest, newest);
  return NextResponse.json({ ok: true, deleted: result.deleted, errors: result.errors, range: { oldest, newest } });
}
