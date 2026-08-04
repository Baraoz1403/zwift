import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";

export async function GET() {
  const athletes = await kvGet("zwift:athletes");
  const ids: string[] = athletes ? JSON.parse(athletes) : [];
  const profiles: Record<string, unknown> = {};
  for (const id of ids) {
    const [raw, planRaw] = await Promise.all([
      kvGet(`zwift:${id}:rider_profile`),
      kvGet(`zwift:${id}:plan:2026-08-03`),
    ]);
    const plan = planRaw ? JSON.parse(planRaw) : null;
    profiles[id] = {
      profile: raw ? JSON.parse(raw) : null,
      planWorkoutCount: plan?.workouts?.length ?? 0,
      planWorkoutTitles: plan?.workouts?.map((w: {title: string; type: string}) => `${w.title} (${w.type})`),
    };
  }
  return NextResponse.json(profiles);
}
