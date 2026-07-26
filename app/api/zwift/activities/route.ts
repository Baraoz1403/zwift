import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";

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
    // athleteId is normally cached on the session at login time. If it's
    // missing for some reason (e.g. an older session from before this was
    // added), fall back to fetching it from /api/profiles/me on demand.
    let athleteId = session.athleteId;
    if (!athleteId) {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    }

    if (!athleteId) {
      return NextResponse.json(
        { ok: false, error: "Could not determine your Zwift rider id." },
        { status: 200 }
      );
    }

    const activities = await fetchActivities(session.accessToken, athleteId);
    return NextResponse.json({ ok: true, activities });
  } catch (e) {
    if (e instanceof ZwiftApiError) {
      return NextResponse.json(
        { ok: false, error: e.message, status: e.status },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}
