import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

const HEADERS = (token: string) => ({
  Platform: "OSX",
  Source: "Game Client",
  "User-Agent": "CNL/3.30.8 (macOS 13 Ventura; Darwin Kernel 22.4.0) zwift/1.0.110983 curl/7.78.0",
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
});

async function tryFetch(url: string, token: string) {
  try {
    const r = await fetch(url, { headers: HEADERS(token) });
    const text = await r.text();
    try { return { status: r.status, data: JSON.parse(text) }; }
    catch { return { status: r.status, data: text.slice(0, 500) }; }
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

/**
 * Debug endpoint — probes multiple Zwift API endpoints to find Training Score.
 * Visit /api/zwift/debug-activity while logged in.
 */
export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const id = session.athleteId;
  if (!id) return NextResponse.json({ error: "No athlete ID" });

  const token = session.accessToken;
  const base = "https://us-or-rly101.zwift.com";

  const [profile, stats, fitness, goals, activities1] = await Promise.all([
    tryFetch(`${base}/api/profiles/${id}`, token),
    tryFetch(`${base}/api/profiles/${id}/stats`, token),
    tryFetch(`${base}/api/profiles/${id}/fitness`, token),
    tryFetch(`${base}/api/profiles/${id}/goals`, token),
    tryFetch(`${base}/api/profiles/${id}/activities?start=0&limit=1`, token),
  ]);

  // Fetch the full detail of the first activity — the list endpoint returns
  // a summary; the single-activity endpoint may expose extra fields such as
  // trainingLoad / Training Score that the list omits.
  let activityDetail = null;
  const firstActivityId = Array.isArray(activities1?.data)
    ? (activities1.data[0]?.id ?? activities1.data[0]?.id_str ?? null)
    : null;
  if (firstActivityId) {
    activityDetail = await tryFetch(
      `${base}/api/profiles/${id}/activities/${firstActivityId}`,
      token
    );
  }

  return NextResponse.json({
    athleteId: id,
    profile,
    stats,
    fitness,
    goals,
    activities1,
    activityDetail,           // full single-activity — check here for trainingLoad
    firstActivityId,
  });
}
