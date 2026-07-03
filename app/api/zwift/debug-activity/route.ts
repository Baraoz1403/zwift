import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

const GAME_HEADERS = (token: string) => ({
  Platform: "OSX",
  Source: "Game Client",
  "User-Agent": "CNL/3.30.8 (macOS 13 Ventura; Darwin Kernel 22.4.0) zwift/1.0.110983 curl/7.78.0",
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
});

// Zwift Companion app (iOS) uses a mobile user agent — some endpoints
// return additional fields (like Training Score) only to the mobile client.
const MOBILE_HEADERS = (token: string) => ({
  "User-Agent": "Zwift Companion/3.53.0 (com.zwift.zwiftcompanion; build:3.53.0; iOS 17.4.1)",
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "x-zwift-platform": "iOS",
});

async function tryFetch(url: string, headers: Record<string, string>) {
  try {
    const r = await fetch(url, { headers });
    const text = await r.text();
    try { return { status: r.status, data: JSON.parse(text) }; }
    catch { return { status: r.status, data: text.slice(0, 500) }; }
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

/**
 * Debug endpoint — probes multiple Zwift API endpoints to find Training Score.
 * Tries both game-client and mobile (Companion app) headers.
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
  const gh = GAME_HEADERS(token);
  const mh = MOBILE_HEADERS(token);

  const [profile, stats, fitness, goals, activities1] = await Promise.all([
    tryFetch(`${base}/api/profiles/${id}`, gh),
    tryFetch(`${base}/api/profiles/${id}/stats`, gh),
    tryFetch(`${base}/api/profiles/${id}/fitness`, gh),
    tryFetch(`${base}/api/profiles/${id}/goals`, gh),
    tryFetch(`${base}/api/profiles/${id}/activities?start=0&limit=1`, gh),
  ]);

  // Get the first activity ID for detail fetches
  const firstActivityId = Array.isArray(activities1?.data)
    ? (activities1.data[0]?.id_str ?? activities1.data[0]?.id ?? null)
    : null;

  // Fetch the single-activity detail with BOTH headers — game client and mobile.
  // The Companion app (mobile) sometimes sees extra fields like trainingLoad.
  const [activityDetailGame, activityDetailMobile] = firstActivityId
    ? await Promise.all([
        tryFetch(`${base}/api/profiles/${id}/activities/${firstActivityId}`, gh),
        tryFetch(`${base}/api/profiles/${id}/activities/${firstActivityId}`, mh),
      ])
    : [null, null];

  // Also probe mobile-only endpoints the Companion app might use
  const [mobileActivities, mobileProfile, workoutResult] = await Promise.all([
    tryFetch(`${base}/api/profiles/${id}/activities?start=0&limit=1`, mh),
    tryFetch(`${base}/api/profiles/${id}`, mh),
    firstActivityId
      ? tryFetch(`${base}/api/workout/workout_result/${firstActivityId}`, mh)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    athleteId: id,
    firstActivityId,
    // Game client results
    profile,
    stats,
    fitness,
    goals,
    activities1,
    activityDetailGame,      // single activity via game client — check for trainingLoad
    // Mobile / Companion app results
    activityDetailMobile,    // same endpoint, mobile UA — may have extra fields
    mobileActivities,        // activity list via mobile UA
    mobileProfile,           // profile via mobile UA
    workoutResult,           // /workout/workout_result/{id} — Companion-specific endpoint
  });
}
