import { NextResponse } from "next/server";
import { kvGet, kvSet, kvDel } from "@/lib/kv";

const WEEK_OF = "2026-08-03";

export async function GET() {
  const athletes = await kvGet("zwift:athletes");
  const ids: string[] = athletes ? JSON.parse(athletes) : [];
  const results: Record<string, unknown> = {};

  for (const id of ids) {
    const ops: string[] = [];

    // 1. Delete current week plan cache → forces fresh generation with real ICU data
    await kvDel(`zwift:${id}:plan:${WEEK_OF}`);
    await kvDel(`zwift:${id}:icu_synced:${WEEK_OF}`);
    ops.push("plan_cache_deleted", "icu_synced_cleared");

    // 2. Fix Adi's profile: add gender: "male"
    if (id === "5519895") {
      const raw = await kvGet(`zwift:${id}:rider_profile`);
      if (raw) {
        const profile = JSON.parse(raw);
        if (!profile.gender) {
          profile.gender = "male";
          await kvSet(`zwift:${id}:rider_profile`, JSON.stringify(profile));
          ops.push("gender_male_added");
        }
      }
    }

    results[id] = { ops };
  }

  return NextResponse.json({ weekOf: WEEK_OF, results, note: "Plans deleted. Next VOLT load will regenerate with real ICU training data." });
}
