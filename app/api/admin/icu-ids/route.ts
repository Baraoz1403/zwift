/**
 * GET  /api/admin/icu-ids
 *   Returns the stored ICU key (masked) + ICU athlete ID for every known athlete.
 *   Diagnoses cross-athlete calendar contamination: if multiple athletes share the
 *   same ICU athlete ID, all plan syncs go to the same calendar — last sync wins.
 *
 * POST /api/admin/icu-ids
 *   Body: { zwiftAthleteId: string, icuAthleteId: string }
 *   Overrides the stored ICU athlete ID for a coached athlete without changing the API key.
 *   Use when athletes share a coach API key but each has their own ICU athlete profile.
 *
 * Auth: CRON_SECRET required.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import { getKnownAthletes } from "@/lib/kv-plan-state";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  const queryParam = req.nextUrl.searchParams.get("secret");
  return header === `Bearer ${secret}` || queryParam === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const athleteIds = await getKnownAthletes();
  const rows = await Promise.all(athleteIds.map(async (zwiftId) => {
    const [rawKey, icuId, icuName] = await Promise.all([
      kvGet(`zwift:${zwiftId}:icu_key`),
      kvGet(`zwift:${zwiftId}:icu_id`),
      kvGet(`zwift:${zwiftId}:icu_name`),
    ]);
    const maskedKey = rawKey
      ? rawKey.startsWith("Bearer ")
        ? `Bearer ${rawKey.slice(7, 14)}...`
        : `${rawKey.slice(0, 6)}...`
      : null;
    return { zwiftId, maskedKey, icuId, icuName };
  }));

  return NextResponse.json({ ok: true, athletes: rows });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { zwiftAthleteId?: string; icuAthleteId?: string };
  if (!body.zwiftAthleteId || !body.icuAthleteId) {
    return NextResponse.json({ error: "zwiftAthleteId and icuAthleteId required" }, { status: 400 });
  }

  await kvSet(`zwift:${body.zwiftAthleteId}:icu_id`, body.icuAthleteId.trim());
  return NextResponse.json({ ok: true, zwiftId: body.zwiftAthleteId, icuId: body.icuAthleteId.trim() });
}
