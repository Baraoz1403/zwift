/**
 * POST /api/ai/season-plan
 *
 * Generates (or regenerates) a full season plan for the authenticated rider.
 * Stores it in KV and returns it.
 *
 * DELETE /api/ai/season-plan
 * Wipes the stored season plan (forces regeneration on next POST).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile } from "@/lib/zwift";
import { getStoredAthleteState } from "@/lib/kv-plan-state";
import { generateSeasonPlan, deleteSeasonPlan, getSeasonPlan } from "@/lib/season-plan";
import { mondayOfCurrentWeek } from "@/lib/periodization";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI not configured." }, { status: 500 });

  const athleteId = String(session.athleteId);

  try {
    // Load rider profile + Zwift profile for FTP and weight
    const [state, zwiftProfile] = await Promise.all([
      getStoredAthleteState(athleteId),
      fetchOwnProfile(session.accessToken ?? "").catch(() => null),
    ]);

    const profile = state.riderProfile;
    if (!profile) {
      return NextResponse.json({ ok: false, error: "No training profile saved. Set it up first." }, { status: 400 });
    }

    const ftp = zwiftProfile?.ftp ?? 200;
    const weightKg = zwiftProfile?.weight ? zwiftProfile.weight / 1000 : null;

    // Optional: caller can pass a custom startWeekOf (for testing)
    let startWeekOf: string;
    try {
      const body = await req.json().catch(() => ({}));
      startWeekOf = (body as { startWeekOf?: string }).startWeekOf ?? mondayOfCurrentWeek();
    } catch {
      startWeekOf = mondayOfCurrentWeek();
    }

    const plan = await generateSeasonPlan({
      athleteId,
      profile,
      currentFtp: ftp,
      weightKg,
      startWeekOf,
      apiKey,
    });

    return NextResponse.json({ ok: true, plan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  const plan = await getSeasonPlan(String(session.athleteId));
  return NextResponse.json({ ok: true, plan });
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  await deleteSeasonPlan(String(session.athleteId));
  return NextResponse.json({ ok: true, deleted: true });
}
