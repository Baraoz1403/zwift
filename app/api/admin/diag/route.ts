import { NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import { buildAuthHeader } from "@/lib/intervals";

export async function GET() {
  const athletes = await kvGet("zwift:athletes");
  const ids: string[] = athletes ? JSON.parse(athletes) : [];
  const results: Record<string, unknown> = {};

  for (const id of ids) {
    const [icuKey, icuId] = await Promise.all([
      kvGet(`zwift:${id}:icu_key`),
      kvGet(`zwift:${id}:icu_id`),
    ]);
    if (!icuKey || !icuId) { results[id] = { status: "no_key" }; continue; }

    const numericId = icuId.startsWith("i") ? icuId.slice(1) : icuId;
    const prefixedId = icuId.startsWith("i") ? icuId : `i${icuId}`;
    const auth = buildAuthHeader(icuKey);

    const [withPrefix, withNumeric, withMe] = await Promise.all([
      fetch(`https://intervals.icu/api/v1/athlete/${prefixedId}/events?oldest=2026-08-03&newest=2026-08-09`, { headers: { Authorization: auth } }).then(r => r.status),
      fetch(`https://intervals.icu/api/v1/athlete/${numericId}/events?oldest=2026-08-03&newest=2026-08-09`, { headers: { Authorization: auth } }).then(r => r.status),
      fetch(`https://intervals.icu/api/v1/athlete/me/events?oldest=2026-08-03&newest=2026-08-09`, { headers: { Authorization: auth } }).then(r => r.status),
    ]);

    results[id] = { icuId, withPrefix, withNumeric, withMe };

    // If "me" works but numeric doesn't — push via "me" path works, flag it
  }
  return NextResponse.json({ athletes: ids, results });
}
