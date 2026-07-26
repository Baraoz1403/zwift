import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { saveCoachingNote } from "@/lib/rider-fingerprint";

/**
 * POST /api/ai/coaching-note
 *
 * Stores a free-text note from the rider to the coach in the rider fingerprint.
 * These notes are injected into the next AI-generated training plan so the
 * coach can adapt the plan to what the rider wrote.
 *
 * Body: { date: string; note: string }
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

  const { date, note } = body as Record<string, unknown>;

  if (typeof date !== "string" || typeof note !== "string" || !note.trim()) {
    return NextResponse.json(
      { ok: false, error: "Body must include date (string) and note (non-empty string)." },
      { status: 400 },
    );
  }

  await saveCoachingNote(athleteId, date, note);

  return NextResponse.json({ ok: true });
}
