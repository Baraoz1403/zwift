import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { getStoredAthleteState } from "@/lib/kv-plan-state";
import { fetchOwnProfile } from "@/lib/zwift";

/**
 * GET /api/ai/weekly-plan/state
 *
 * Returns the server's (KV) view of this rider's current plan/macro-cycle/
 * profile, keyed by their Zwift athlete id - the same store the cron job
 * (app/api/ai/weekly-plan/cron/route.ts) reads and every interactive
 * "Generate" call writes to.
 *
 * Why this route exists: before it did, the dashboard's only source of
 * truth on page load was each browser's OWN localStorage. That worked fine
 * on one device, but a second device (a rider checking from an iPad, say)
 * had no way to know a plan for the current week already existed - it would
 * see its own empty/stale local cache, decide the plan was "fully stale",
 * and call the AI to generate an independent SECOND plan for the same week.
 * That second plan could easily differ from the first (different AI
 * response), and once it synced to Intervals.icu/Zwift it would look like
 * two devices were pushing "different rides" for the same days - which is
 * exactly what was reported. The dashboard's bootstrap effect now calls this
 * route before ever deciding to auto-generate, so any device opening the
 * app adopts whatever the server already has for the current week instead
 * of silently forking its own copy.
 */
export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  }

  const session = await decryptSession(raw);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session invalid or expired." }, { status: 401 });
  }
  // Try to resolve athleteId — either from the session (happy path) or by
  // fetching the Zwift profile live (older sessions that were created before
  // athleteId was stored). Without this, any device with a pre-athleteId
  // session cookie would always get plan:null, auto-generate a fresh plan,
  // and diverge from every other device. A live profile fetch is cheap (~1
  // round-trip) and only runs when athleteId is missing from the session.
  let athleteId = session.athleteId;
  if (!athleteId && session.accessToken) {
    try {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    } catch {
      // best-effort — if this fails we report no plan rather than erroring
    }
  }

  if (!athleteId) {
    return NextResponse.json({ ok: true, riderProfile: null, macroCycle: null, plan: null });
  }

  const state = await getStoredAthleteState(athleteId);
  return NextResponse.json({
    ok: true,
    riderProfile: state.riderProfile ?? null,
    macroCycle: state.macroCycle,
    plan: state.previousPlan,
  });
}
