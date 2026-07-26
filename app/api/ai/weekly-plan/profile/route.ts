import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { updateStoredRiderProfile } from "@/lib/kv-plan-state";
import type { RiderTrainingProfile } from "@/lib/rider-profile";

/**
 * POST /api/ai/weekly-plan/profile
 * Save the rider's training profile without triggering plan regeneration.
 * Body: { riderProfile: RiderTrainingProfile }
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const { riderProfile } = body as { riderProfile?: RiderTrainingProfile };
  if (!riderProfile || !riderProfile.goals || !riderProfile.daysRange) {
    return NextResponse.json({ ok: false, error: "Missing riderProfile fields." }, { status: 400 });
  }

  await updateStoredRiderProfile(String(session.athleteId), riderProfile);
  return NextResponse.json({ ok: true });
}
