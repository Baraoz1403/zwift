import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { saveAthletePhone, getAthletePhone } from "@/lib/kv-plan-state";

/**
 * GET  /api/profile/phone  — returns stored phone (masked)
 * POST /api/profile/phone  — saves phone number (E.164 format)
 *
 * Phone is stored separately from RiderTrainingProfile so it never
 * reaches the AI planning prompt. Used only for WhatsApp notifications.
 */

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  const athleteId = session?.athleteId ? String(session.athleteId) : null;
  if (!athleteId) return NextResponse.json({ ok: false, error: "No athlete ID." }, { status: 400 });

  const phone = await getAthletePhone(athleteId);
  if (!phone) return NextResponse.json({ ok: true, phone: null });

  // Mask: show last 4 digits only
  const masked = phone.slice(0, -4).replace(/\d/g, "•") + phone.slice(-4);
  return NextResponse.json({ ok: true, phone: masked, hasPhone: true });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  const athleteId = session?.athleteId ? String(session.athleteId) : null;
  if (!athleteId) return NextResponse.json({ ok: false, error: "No athlete ID." }, { status: 400 });

  let body: { phone?: string } = {};
  try { body = await req.json(); } catch { /* ok */ }

  const phone = (body.phone ?? "").trim();
  if (!phone) return NextResponse.json({ ok: false, error: "phone is required." }, { status: 400 });

  // Basic E.164 validation: + followed by 7–15 digits
  if (!/^\+\d{7,15}$/.test(phone)) {
    return NextResponse.json(
      { ok: false, error: "Phone must be in E.164 format, e.g. +972501234567" },
      { status: 400 }
    );
  }

  await saveAthletePhone(athleteId, phone);
  return NextResponse.json({ ok: true });
}
