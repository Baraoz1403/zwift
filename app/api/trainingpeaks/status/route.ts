/**
 * GET /api/trainingpeaks/status
 * Returns whether TrainingPeaks is connected in the current session.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ connected: false });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: !!session.tpToken,
    tpAthleteId: session.tpAthleteId ?? null,
  });
}
