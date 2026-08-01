/**
 * POST /api/intervals/connect-apikey
 *
 * Validates an Intervals.icu personal API key and stores it for the current
 * athlete. This is the single, reliable ICU connection method — no OAuth,
 * no redirects, no token expiry. The athlete gets their key once from
 * intervals.icu/settings and pastes it here.
 *
 * On success: stores key in KV (cross-device) and sets cookies on response.
 * On failure: returns { ok: false, error: "..." } with HTTP 400/401.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchIntervalsAthlete } from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { kvSet } from "@/lib/kv";

export async function POST(req: NextRequest) {
  // Require Zwift session
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return NextResponse.json({ ok: false, error: "API key is required." }, { status: 400 });

  // Validate the key by fetching the athlete's profile from Intervals.icu.
  // If this call succeeds, the key is valid and we have the athlete's ICU id + name.
  let athlete: { id?: string | number; name?: string; email?: string };
  try {
    athlete = await fetchIntervalsAthlete(apiKey);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid API key — could not connect to Intervals.icu." },
      { status: 401 }
    );
  }

  const icuId   = athlete.id   != null ? String(athlete.id).trim() : "0";
  const icuName = (athlete.name as string | undefined)
    ?? (athlete.email as string | undefined)
    ?? "Intervals.icu user";

  // Resolve the Zwift athlete ID for the KV key.
  let athleteId = session.athleteId;
  if (!athleteId) {
    try {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    } catch { /* best-effort */ }
  }

  // Store in KV for cross-device persistence.
  if (athleteId) {
    await Promise.all([
      kvSet(`zwift:${athleteId}:icu_key`,  apiKey),
      kvSet(`zwift:${athleteId}:icu_id`,   icuId),
      kvSet(`zwift:${athleteId}:icu_name`, icuName),
    ]);
  }

  // Build response with cookies set directly on it (the only reliable method).
  const isSecure = process.env.NODE_ENV === "production";
  const cookieBase = { httpOnly: true, secure: isSecure, sameSite: "lax" as const, path: "/" };
  const longLived  = { ...cookieBase, maxAge: 60 * 60 * 24 * 365 };

  const res = NextResponse.json({ ok: true, icuName });
  res.cookies.set("zwift_intervals_key",  apiKey,  longLived);
  res.cookies.set("zwift_intervals_id",   icuId,   longLived);
  res.cookies.set("zwift_intervals_name", icuName, { ...longLived, httpOnly: false });

  return res;
}
