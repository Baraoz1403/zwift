import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { updateFingerprintWithFeedback } from "@/lib/rider-fingerprint";
import type { SessionLogEntry } from "@/lib/rider-fingerprint";

/**
 * POST /api/ai/session-feedback
 *
 * Records a rider's post-workout feeling score (1–5) for a completed session.
 * The score is stored in the rider's fingerprint in KV and is injected into
 * future AI coaching prompts so the coach learns how this specific rider
 * responds to each workout type over time.
 *
 * Body: { date, workoutTitle, category, feelingScore, note? }
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });
  }

  const athleteId = session.athleteId;
  if (!athleteId) {
    return NextResponse.json({ ok: false, error: "Athlete ID not found in session." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { date, workoutTitle, category, feelingScore, note } = body as Record<string, unknown>;

  if (
    typeof date !== "string" ||
    typeof workoutTitle !== "string" ||
    typeof category !== "string" ||
    typeof feelingScore !== "number" ||
    feelingScore < 1 ||
    feelingScore > 5
  ) {
    return NextResponse.json(
      { ok: false, error: "Body must include date (string), workoutTitle (string), category (string), feelingScore (1–5 number)." },
      { status: 400 },
    );
  }

  const entry: SessionLogEntry = {
    date,
    workoutTitle,
    category,
    feelingScore,
    ...(typeof note === "string" && note ? { note } : {}),
  };

  await updateFingerprintWithFeedback(athleteId, entry);

  return NextResponse.json({ ok: true });
}
