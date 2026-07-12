/**
 * POST /api/intervals/connect
 *
 * Validates an Intervals.icu personal API key and stores it in the user's
 * session cookies. Unlike TrainingPeaks, there's no bookmarklet or OAuth
 * dance — the rider just pastes the key they generated once at
 * intervals.icu/settings ("Developer Settings").
 *
 * Body: { apiKey: string }
 * Response: { ok: boolean, athleteName?: string, error?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchIntervalsAthlete } from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { kvSet, kvDel } from "@/lib/kv";
import { ensurePlanProvisioned } from "@/lib/plan-runner";

// ensurePlanProvisioned can involve a full AI plan generation (30-60s) for an
// athlete connecting ICU before ever having a plan - without this, Vercel
// would cut the function at the default 10s hobby-plan limit mid-connect.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in to Zwift." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  const { apiKey } = await req.json() as { apiKey?: string };
  if (!apiKey?.trim()) {
    return NextResponse.json({ ok: false, error: "No API key provided." });
  }

  let athlete;
  try {
    athlete = await fetchIntervalsAthlete(apiKey.trim());
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Intervals.icu validation failed. Check the key and try again.",
    });
  }

  const athleteName = (athlete.name as string | undefined) || (athlete.email as string | undefined) || "Intervals.icu user";
  const athleteId = String(athlete.id ?? "0");

  const isSecure = process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 365, // API keys don't expire like TP's 1h tokens - safe to keep for a year
    path: "/",
  };

  cookieStore.set("zwift_intervals_key", apiKey.trim(), cookieOpts);
  cookieStore.set("zwift_intervals_id", athleteId, cookieOpts);
  cookieStore.set("zwift_intervals_name", athleteName, { ...cookieOpts, httpOnly: false });

  // Mirror to KV so other devices (and the server-side auto-sync in
  // app/api/ai/weekly-plan/route.ts) can find this key. session.athleteId is
  // OPTIONAL on the session payload (lib/session-constants.ts) - it's only
  // populated when the login flow's own profile fetch succeeded. Trusting it
  // blindly here used to mean: if it was ever missing (an older session
  // minted before this field existed, or a transient profile-fetch hiccup at
  // login), the cookies above still get set fine - so the dashboard shows
  // "connected" - but this KV write silently no-ops, and the server-side sync
  // (which is KV-only, no cookies) finds nothing to push with, forever,
  // until the rider disconnects and reconnects. Resolving it fresh here
  // (same fetchOwnProfile call runWeeklyPlanGeneration and login already
  // make) means a connect action always durably lands in KV, regardless of
  // what happened to be cached on this session.
  let resolvedAthleteId = session.athleteId;
  if (!resolvedAthleteId) {
    try {
      const profile = await fetchOwnProfile(session.accessToken);
      resolvedAthleteId = profile.id != null ? String(profile.id) : undefined;
    } catch {
      // best-effort — fall through with resolvedAthleteId still undefined
    }
  }
  if (resolvedAthleteId) {
    await kvSet(`zwift:${resolvedAthleteId}:icu_key`, apiKey.trim());
    await kvSet(`zwift:${resolvedAthleteId}:icu_id`, athleteId);
    await kvSet(`zwift:${resolvedAthleteId}:icu_name`, athleteName);

    // ── Auto-provision: first plan + first sync, no button needed ─────────
    // Handles two cases: a brand-new athlete connecting ICU before ever
    // having a plan (generates + pushes their first one now), and an
    // existing athlete whose plan predates this connection (pushes the
    // already-cached plan using the key that just landed in KV, rather than
    // waiting for the athlete's next login or the nightly cron).
    await ensurePlanProvisioned(resolvedAthleteId, session.accessToken);
  }

  return NextResponse.json({ ok: true, athleteName, athleteId, kvSynced: !!resolvedAthleteId });
}

/** DELETE /api/intervals/connect — disconnect Intervals.icu */
export async function DELETE() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  cookieStore.delete("zwift_intervals_key");
  cookieStore.delete("zwift_intervals_id");
  cookieStore.delete("zwift_intervals_name");

  // Remove from KV too (session was already decrypted above)
  if (session?.athleteId) {
    await kvDel(
      `zwift:${session.athleteId}:icu_key`,
      `zwift:${session.athleteId}:icu_id`,
      `zwift:${session.athleteId}:icu_name`,
    );
  }

  return NextResponse.json({ ok: true });
}
