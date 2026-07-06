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
import { kvSet, kvDel } from "@/lib/kv";

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

  // Mirror to KV so other devices auto-restore on login
  if (session.athleteId) {
    await kvSet(`zwift:${session.athleteId}:icu_key`, apiKey.trim());
    await kvSet(`zwift:${session.athleteId}:icu_id`, athleteId);
    await kvSet(`zwift:${session.athleteId}:icu_name`, athleteName);
  }

  return NextResponse.json({ ok: true, athleteName, athleteId });
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
