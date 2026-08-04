import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";

export async function GET() {
  const athletes = await kvGet("zwift:athletes");
  const ids: string[] = athletes ? JSON.parse(athletes) : [];
  const results: Record<string, unknown> = {};
  for (const id of ids) {
    const [profile, plan, icuKey, icuId, icuInvalid, icuSynced, macro, rt] = await Promise.all([
      kvGet(`zwift:${id}:rider_profile`),
      kvGet(`zwift:${id}:plan:2026-08-03`),
      kvGet(`zwift:${id}:icu_key`),
      kvGet(`zwift:${id}:icu_id`),
      kvGet(`zwift:${id}:icu_invalid`),
      kvGet(`zwift:${id}:icu_synced:2026-08-03`),
      kvGet(`zwift:${id}:macro_cycle`),
      kvGet(`zwift:${id}:refresh_token`),
    ]);
    results[id] = {
      hasProfile: !!profile,
      hasPlan: !!plan,
      hasIcuKey: !!icuKey,
      icuKeyType: icuKey ? (icuKey.startsWith("Bearer ") ? "Bearer/OAuth" : "API_KEY") : null,
      icuId,
      icuInvalid: icuInvalid ?? null,
      icuSynced: icuSynced ?? null,
      hasMacro: !!macro,
      hasRefreshToken: !!rt,
    };
  }
  return NextResponse.json({ athletes: ids, results });
}
