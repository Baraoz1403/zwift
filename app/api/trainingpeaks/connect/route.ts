/**
 * POST /api/trainingpeaks/connect
 *
 * Validates a TrainingPeaks auth token (the Production_tpAuth cookie value
 * from the user's browser) and stores it in their Zwift session.
 *
 * Body: { tpToken: string }
 * Response: { ok: boolean, athleteName?: string, error?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, encryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchTPProfile } from "@/lib/trainingpeaks";

export async function POST(req: NextRequest) {
  // ── Require existing Zwift session ────────────────────────────────────────
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in to Zwift." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  // ── Parse body ────────────────────────────────────────────────────────────
  const { tpToken } = await req.json() as { tpToken?: string };
  if (!tpToken?.trim()) {
    return NextResponse.json({ ok: false, error: "No token provided." });
  }

  // ── Validate token with TrainingPeaks ─────────────────────────────────────
  let profile;
  try {
    profile = await fetchTPProfile(tpToken.trim());
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "TrainingPeaks validation failed.",
    });
  }

  // tpapi returns personId/athleteId (not legacy .Id)
  const tpAthleteId = String(profile.personId ?? profile.athleteId ?? profile.userId ?? "");
  const athleteName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "TrainingPeaks user";

  // ── Update session with TP credentials ───────────────────────────────────
  const updatedSession = { ...session, tpToken: tpToken.trim(), tpAthleteId };
  const encrypted = await encryptSession(updatedSession);

  const res = NextResponse.json({ ok: true, athleteName, tpAthleteId });
  res.cookies.set(SESSION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return res;
}

/**
 * DELETE /api/trainingpeaks/connect — disconnect TrainingPeaks
 */
export async function DELETE() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  // Remove TP fields from session (strip tpToken + tpAthleteId, keep everything else)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tpToken: _tp, tpAthleteId: _tpId, ...rest } = session;
  const encrypted = await encryptSession({ ...rest });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
