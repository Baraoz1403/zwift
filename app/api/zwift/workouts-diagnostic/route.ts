/**
 * GET /api/zwift/workouts-diagnostic
 *
 * Probes Zwift's API to discover the working workout endpoint and format.
 * Tries multiple GET paths so we can reverse-engineer the exact structure
 * Zwift expects before we try to POST a new workout.
 *
 * Returns:
 *   {
 *     ok: boolean,
 *     athleteId: string,
 *     probes: GETProbeResult[],     // all attempted GETs
 *     workouts?: unknown[],         // parsed workout list if any probe succeeded
 *     format?: "json" | "xml",
 *   }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile } from "@/lib/zwift";

const API_HOST = "us-or-rly101.zwift.com";

interface GETProbeResult {
  endpoint: string;
  status: number | null;
  ok: boolean;
  contentType: string | null;
  /** First 600 chars of raw body */
  bodyPreview: string;
  /** Parsed JSON if content-type is JSON */
  parsed?: unknown;
}

async function probeGet(
  url: string,
  token: string
): Promise<GETProbeResult> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, application/xml, */*",
        "User-Agent": "Zwift/1.0 (zwift-dashboard)",
      },
    });
    const contentType = res.headers.get("content-type");
    const text = await res.text().catch(() => "");
    let parsed: unknown = undefined;
    if (contentType?.includes("json")) {
      try { parsed = JSON.parse(text); } catch { /* keep undefined */ }
    }
    return {
      endpoint: url,
      status: res.status,
      ok: res.ok,
      contentType,
      bodyPreview: text.slice(0, 600),
      parsed,
    };
  } catch (e) {
    return {
      endpoint: url,
      status: null,
      ok: false,
      contentType: null,
      bodyPreview: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  let athleteId = session.athleteId;
  if (!athleteId) {
    try {
      const profile = await fetchOwnProfile(session.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
    } catch { /* fall through */ }
  }
  if (!athleteId) {
    return NextResponse.json({ ok: false, error: "Could not determine Zwift rider id." });
  }

  const token = session.accessToken;
  const probes: GETProbeResult[] = [];

  // ── Probe GET candidates ─────────────────────────────────────────────────
  // Goal: find which path returns workout data, and in what format.

  // 1. Most likely: /api/workouts/{athleteId}
  probes.push(await probeGet(
    `https://${API_HOST}/api/workouts/${athleteId}`,
    token
  ));

  // 2. Player profile path
  probes.push(await probeGet(
    `https://${API_HOST}/api/player-profile/athletes/${athleteId}/workouts`,
    token
  ));

  // 3. Versioned API
  probes.push(await probeGet(
    `https://${API_HOST}/api/v2/workouts/${athleteId}`,
    token
  ));

  // 4. Training namespace
  probes.push(await probeGet(
    `https://${API_HOST}/api/training/workouts/${athleteId}`,
    token
  ));

  // 5. Workout (singular) — some Zwift APIs use workout vs workouts
  probes.push(await probeGet(
    `https://${API_HOST}/api/workout/workouts/${athleteId}`,
    token
  ));

  // 6. Custom workouts (another naming pattern seen in community research)
  probes.push(await probeGet(
    `https://${API_HOST}/api/workouts/custom/${athleteId}`,
    token
  ));

  // ── Evaluate ──────────────────────────────────────────────────────────────
  const winner = probes.find((p) => p.ok);
  let workouts: unknown[] | undefined;
  let format: "json" | "xml" | undefined;

  if (winner) {
    if (winner.contentType?.includes("json") && winner.parsed) {
      format = "json";
      workouts = Array.isArray(winner.parsed)
        ? winner.parsed
        : (winner.parsed as Record<string, unknown>)?.workouts as unknown[] ?? [winner.parsed];
    } else if (winner.contentType?.includes("xml") || winner.bodyPreview.startsWith("<")) {
      format = "xml";
      // Return raw preview as a single-element array for display
      workouts = [{ raw: winner.bodyPreview }];
    }
  }

  return NextResponse.json({
    ok: !!winner,
    athleteId,
    probes,
    workouts,
    format,
    successEndpoint: winner?.endpoint ?? null,
  });
}
