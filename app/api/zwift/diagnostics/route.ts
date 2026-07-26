import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchActivities, fetchOwnProfile } from "@/lib/zwift";
import { runActivityDiagnostics } from "@/lib/zwift-diagnostics";

// One-off exploratory endpoint - not a permanent feature. Picks the rider's
// most recent activity and checks, against the real Zwift servers, whether
// the FIT-file download, ride-type fields, and the rideon endpoint actually
// work. Nothing here is stored anywhere; results just go back to the browser.
export async function GET(req: NextRequest) {
  const requestedId = req.nextUrl.searchParams.get("id");
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
    const athleteId = session.athleteId ?? (profile.id != null ? String(profile.id) : undefined);
    if (!athleteId) {
      return NextResponse.json(
        { ok: false, error: "Could not determine your Zwift rider id." },
        { status: 200 }
      );
    }

    const activities = await fetchActivities(session.accessToken, athleteId);
    if (activities.length === 0) {
      return NextResponse.json({ ok: false, error: "No activities found to test against." });
    }

    const sorted = [...activities].sort(
      (a, b) => new Date(b.startDate ?? 0).getTime() - new Date(a.startDate ?? 0).getTime()
    );

    const target = requestedId
      ? sorted.find((a) => (a.id_str ?? String(a.id)) === requestedId) ?? sorted[0]
      : sorted[0];

    const report = await runActivityDiagnostics(session.accessToken, target);
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 200 }
    );
  }
}
