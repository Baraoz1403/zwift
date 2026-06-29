import { NextRequest, NextResponse } from "next/server";
import { loginToZwift, fetchOwnProfile, ZwiftAuthError, ZwiftApiError } from "@/lib/zwift";
import { encryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are both required." },
      { status: 400 }
    );
  }

  try {
    const result = await loginToZwift(email, password);

    // Best-effort: grab the real Zwift player id from /api/profiles/me so
    // future per-rider calls (activities, events) have it. If this single
    // extra call fails for some reason, login still proceeds - the
    // dashboard's own profile fetch will surface any real problem clearly.
    let athleteId: string | undefined;
    try {
      const profile = await fetchOwnProfile(result.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    } catch {
      athleteId = undefined;
    }

    const cookieValue = await encryptSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      athleteId,
      expiresAt: Date.now() + result.expiresInSeconds * 1000,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days; the Zwift token inside may need refreshing sooner
    });
    return res;
  } catch (e) {
    if (e instanceof ZwiftAuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof ZwiftApiError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { ok: false, error: "Unexpected server error during login." },
      { status: 500 }
    );
  }
}
