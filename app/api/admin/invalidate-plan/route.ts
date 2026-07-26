import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { kvDel } from "@/lib/kv";

/**
 * DELETE /api/admin/invalidate-plan?weekOf=YYYY-MM-DD
 *
 * Deletes the KV-cached plan for the requesting athlete's specific week.
 * Requires a live browser session (cookie auth) — no CRON_SECRET needed.
 * Useful when code changes need to force-regenerate a cached plan without
 * waiting for the cron or triggering a full 60s generation inline.
 *
 * After calling this, the next dashboard load (or cron run) will regenerate
 * the plan fresh using whatever code is currently deployed.
 */
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }
  const session = await decryptSession(raw);
  if (!session?.athleteId) {
    return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });
  }

  const weekOf = req.nextUrl.searchParams.get("weekOf");
  if (!weekOf || !/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) {
    return NextResponse.json({ ok: false, error: "weekOf required (YYYY-MM-DD)." }, { status: 400 });
  }

  const planKey = `zwift:${session.athleteId}:plan:${weekOf}`;
  const syncKey = `zwift:${session.athleteId}:icuSynced:${weekOf}`;
  await kvDel(planKey, syncKey);

  return NextResponse.json({ ok: true, deleted: [planKey, syncKey], athleteId: session.athleteId });
}
