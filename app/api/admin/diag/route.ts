import { NextResponse } from "next/server";
import { kvGet, kvSet } from "@/lib/kv";
import { buildAuthHeader } from "@/lib/intervals";

export async function GET() {
  const athletes = await kvGet("zwift:athletes");
  const ids: string[] = athletes ? JSON.parse(athletes) : [];
  const results: Record<string, unknown> = {};

  for (const id of ids) {
    const [icuKey, oldIcuId] = await Promise.all([
      kvGet(`zwift:${id}:icu_key`),
      kvGet(`zwift:${id}:icu_id`),
    ]);

    if (!icuKey) { results[id] = { status: "no_key" }; continue; }

    // Fetch real athlete profile using "me" — always resolves correctly for any valid key
    let realId: string | null = null;
    let profileStatus = "";
    try {
      const res = await fetch(`https://intervals.icu/api/v1/athlete/me/profile`, {
        headers: { Authorization: buildAuthHeader(icuKey) },
      });
      profileStatus = `${res.status}`;
      if (res.ok) {
        const profile = await res.json() as Record<string, unknown>;
        realId = profile.id as string ?? null;
      }
    } catch (e) {
      profileStatus = `error: ${e}`;
    }

    let action = "no_change";
    if (realId && realId !== oldIcuId) {
      await kvSet(`zwift:${id}:icu_id`, realId).catch(() => {});
      action = `updated: ${oldIcuId} → ${realId}`;
    } else if (realId === oldIcuId) {
      action = "already_correct";
    }

    results[id] = { oldIcuId, realId, profileStatus, action };
  }
  return NextResponse.json({ athletes: ids, results });
}
