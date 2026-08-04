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

    let icuStatus = "no_key";
    if (icuKey && icuId) {
      // Test with "me" (always valid for any key) AND with the stored ID
      const resolvedId = icuId.startsWith("i") ? icuId.slice(1) : icuId;
      const [meRes, idRes] = await Promise.all([
        fetch(`https://intervals.icu/api/v1/athlete/me/profile`, {
          headers: { Authorization: buildAuthHeader(icuKey) },
        }).then(r => `me:${r.status}`).catch(e => `me:error:${e}`),
        fetch(`https://intervals.icu/api/v1/athlete/${resolvedId}/profile`, {
          headers: { Authorization: buildAuthHeader(icuKey) },
        }).then(r => `id:${r.status}`).catch(e => `id:error:${e}`),
      ]);
      icuStatus = `${meRes} | ${idRes}`;

      // If both fail with 401/403 → mark icu_invalid so reconnect screen appears
      if (meRes.includes(":401") || meRes.includes(":403")) {
        await kvSet(`zwift:${id}:icu_invalid`, "1", 7 * 24 * 60 * 60).catch(() => {});
        icuStatus += " → marked icu_invalid";
      }
    }
    results[id] = { icuId, icuKeyType: icuKey ? (icuKey.startsWith("Bearer ") ? "Bearer/OAuth" : "API_KEY") : null, icuStatus };
  }
  return NextResponse.json({ athletes: ids, results });
}
