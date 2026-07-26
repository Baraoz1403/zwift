/**
 * Temporary diagnostic endpoint — dumps raw field names + values from
 * the Zwift profile and the 3 most recent activities so we can identify
 * the exact field name for "Training Score".
 * DELETE this file after the field is confirmed.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  try {
    const athleteId = session.athleteId ?? (await fetchOwnProfile(session.accessToken)).id;
    const [profile, activities] = await Promise.all([
      fetchOwnProfile(session.accessToken),
      fetchActivities(session.accessToken, athleteId as string | number, 25),
    ]);

    // Return profile fields + the first 3 activity objects in full
    return NextResponse.json({
      ok: true,
      profileFields: Object.fromEntries(
        Object.entries(profile).map(([k, v]) => [k, v])
      ),
      recentActivities: activities.slice(0, 3).map(a =>
        Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v]))
      ),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
