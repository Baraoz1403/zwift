/**
 * GET /api/debug/icu-state
 * Temporary debug endpoint — shows exactly what's in KV and cookies for the
 * current session's athlete. Remove once ICU connection is stable.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { kvGet } from "@/lib/kv";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? await decryptSession(raw) : null;

  const athleteId = session?.athleteId;

  // Read all ICU-related KV keys for this athlete
  const [icuKey, icuId, icuName, icuRefresh, icuExpires, oauthDebug] = athleteId
    ? await Promise.all([
        kvGet(`zwift:${athleteId}:icu_key`),
        kvGet(`zwift:${athleteId}:icu_id`),
        kvGet(`zwift:${athleteId}:icu_name`),
        kvGet(`zwift:${athleteId}:icu_refresh`),
        kvGet(`zwift:${athleteId}:icu_expires`),
        kvGet(`zwift:${athleteId}:oauth_debug`),
      ])
    : [null, null, null, null, null, null];

  return NextResponse.json({
    session: {
      athleteId: athleteId ?? "(undefined — Zwift profile fetch failed at login)",
      hasAccessToken: !!session?.accessToken,
      expiresAt: session?.expiresAt
        ? new Date(session.expiresAt).toISOString()
        : null,
    },
    cookies: {
      zwift_intervals_key: cookieStore.get("zwift_intervals_key")?.value
        ? `SET (starts with: ${cookieStore.get("zwift_intervals_key")!.value.slice(0, 20)}…)`
        : "NOT SET",
      zwift_intervals_id: cookieStore.get("zwift_intervals_id")?.value ?? "NOT SET",
    },
    kv: {
      icu_key: icuKey ? `SET (starts with: ${icuKey.slice(0, 20)}…)` : "NOT SET",
      icu_id: icuId ?? "NOT SET",
      icu_name: icuName ?? "NOT SET",
      icu_refresh: icuRefresh ? "SET" : "NOT SET",
      icu_expires: icuExpires
        ? `${icuExpires} (${new Date(Number(icuExpires)).toISOString()})`
        : "NOT SET",
    },
    oauth_debug: oauthDebug ? JSON.parse(oauthDebug) : null,
    diagnosis: athleteId
      ? icuKey
        ? "KV has ICU key — next login should auto-restore. If still showing ICU screen, cookie is the issue."
        : "KV has NO ICU key — OAuth callback either failed, or resolved to a different athleteId."
      : "athleteId is undefined in session — KV lookup impossible. Zwift profile fetch failed at login.",
  });
}
