import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { getFeedbackDone, setFeedbackDone } from "@/lib/kv-plan-state";

/**
 * GET /api/ai/feedback-status?date=YYYY-MM-DD
 * Returns { done: boolean } — whether this athlete already submitted feedback
 * for the given date. Account-level (KV-backed) so it syncs across devices.
 *
 * POST /api/ai/feedback-status
 * Body: { date: "YYYY-MM-DD" }
 * Marks feedback as done for this athlete+date in KV.
 */

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ done: false }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ done: false }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ done: false }, { status: 400 });

  const done = await getFeedbackDone(String(session.athleteId), date);
  return NextResponse.json({ done });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { date } = body as Record<string, unknown>;
  if (typeof date !== "string") return NextResponse.json({ ok: false }, { status: 400 });

  await setFeedbackDone(String(session.athleteId), date);
  return NextResponse.json({ ok: true });
}
