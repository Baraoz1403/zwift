import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session invalid or expired." }, { status: 401 });
  }

  try {
    const profile = await fetchOwnProfile(session.accessToken);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    if (e instanceof ZwiftApiError) {
      // Login is still valid even if the profile call itself fails (e.g. the
      // known 404 from the initial connection test) - report it without
      // breaking the whole dashboard.
      return NextResponse.json(
        { ok: false, error: e.message, status: e.status },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}
