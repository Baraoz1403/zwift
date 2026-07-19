import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import { getKnownAthletes } from "@/lib/kv-plan-state";

/**
 * DELETE /api/admin/force-regen
 *
 * Deletes the cached plan for the current week for all known athletes,
 * forcing regeneration on the next cron run or login.
 *
 * Auth: same CRON_SECRET as the cron endpoint.
 * This endpoint is intentionally minimal and temporary.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekOf = req.nextUrl.searchParams.get("weekOf");
  if (!weekOf) {
    return NextResponse.json({ error: "weekOf param required (YYYY-MM-DD)" }, { status: 400 });
  }

  const athletes = await getKnownAthletes();
  const deleted: string[] = [];

  for (const athleteId of athletes) {
    const key = `zwift:${athleteId}:plan:${weekOf}`;
    await kvSet(key, "", 1); // expire in 1 second = effectively delete
    deleted.push(athleteId);
  }

  return NextResponse.json({ ok: true, weekOf, deleted });
}
