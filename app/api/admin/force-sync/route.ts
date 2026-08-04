import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { getCachedPlan, getIntervalsCredentials, wasIntervalsSynced } from "@/lib/kv-plan-state";
import { syncPlanToIcuAndMark } from "@/lib/headless-sync";

const WEEK_OF = "2026-08-03";

export async function GET() {
  const athletes = await kvGet("zwift:athletes");
  const ids: string[] = athletes ? JSON.parse(athletes) : [];
  const results: Record<string, unknown> = {};

  for (const id of ids) {
    const creds = await getIntervalsCredentials(id);
    if (!creds) { results[id] = { skipped: "no_icu_creds" }; continue; }

    const plan = await getCachedPlan(id, WEEK_OF);
    if (!plan) { results[id] = { skipped: "no_plan" }; continue; }

    const alreadySynced = await wasIntervalsSynced(id, WEEK_OF);
    if (alreadySynced) { results[id] = { skipped: "already_synced" }; continue; }

    const syncResult = await syncPlanToIcuAndMark(id, WEEK_OF, plan, new Set<string>(), undefined);
    results[id] = syncResult ?? { skipped: "no_creds_returned" };
  }

  return NextResponse.json({ weekOf: WEEK_OF, results });
}
