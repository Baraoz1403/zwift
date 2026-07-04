/**
 * POST /api/zwift/push-workout
 *
 * Attempts to push a .zwo workout file directly to the user's Zwift account
 * using their existing bearer token. We probe several candidate endpoints in
 * order — Zwift's internal API is reverse-engineered and undocumented, so we
 * try the most likely paths and return detailed probe results so we can
 * identify the working one if any of them succeed.
 *
 * This runs in parallel with waiting for Zwift's official Training Connections
 * API approval (developers@zwift.com). If Zwift approves us, we swap this
 * probe logic for the official endpoint. If one of these probes works first,
 * even better.
 *
 * Body (JSON):
 *   { xml: string, title: string, athleteId?: string }
 *
 * Response:
 *   { ok: boolean, method?: string, probes: ProbeResult[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";

const API_HOST = "us-or-rly101.zwift.com";

interface ProbeResult {
  endpoint: string;
  method: string;
  status: number | null;
  ok: boolean;
  body: string;
}

/** Try one endpoint — captures status + first 400 chars of response body */
async function probe(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | FormData
): Promise<ProbeResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body instanceof FormData ? headers : { ...headers, "Content-Type": "application/xml" },
      body,
    });
    const text = await res.text().catch(() => "");
    return {
      endpoint: url,
      method,
      status: res.status,
      ok: res.ok,
      body: text.slice(0, 400),
    };
  } catch (e) {
    return {
      endpoint: url,
      method,
      status: null,
      ok: false,
      body: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function POST(req: NextRequest) {
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

  // ── Parse body ────────────────────────────────────────────────────────────
  const { xml, title } = await req.json() as { xml: string; title: string };
  if (!xml) return NextResponse.json({ ok: false, error: "No workout XML provided." });

  const token = session.accessToken;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, application/xml, */*",
    "User-Agent": "Zwift/1.0 (zwift-dashboard)",
  };

  // ── Probe candidate endpoints ─────────────────────────────────────────────
  // We try every plausible path. The first 2xx wins and we report it.
  // Even 4xx responses are useful: 401 = auth works but wrong path,
  // 403 = need partnership, 404 = wrong path, 422 = right path wrong body.
  const probes: ProbeResult[] = [];

  // Candidate 1: direct workout upload by athleteId (most likely)
  probes.push(await probe(
    `https://${API_HOST}/api/workouts/${athleteId}`,
    "POST",
    authHeaders,
    xml
  ));

  // Candidate 2: player-profile style path
  probes.push(await probe(
    `https://${API_HOST}/api/player-profile/athletes/${athleteId}/workouts`,
    "POST",
    authHeaders,
    xml
  ));

  // Candidate 3: with filename hint as query param
  const slug = encodeURIComponent(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60));
  probes.push(await probe(
    `https://${API_HOST}/api/workouts/${athleteId}?name=${slug}`,
    "POST",
    authHeaders,
    xml
  ));

  // Candidate 4: multipart/form-data (some APIs expect file upload)
  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "application/xml" }), `${slug}.zwo`);
  probes.push(await probe(
    `https://${API_HOST}/api/workouts/${athleteId}/upload`,
    "POST",
    authHeaders,
    fd
  ));

  // Candidate 5: Training Connections style (if Zwift approves us, this is
  // what will eventually work — but the path is speculative)
  probes.push(await probe(
    `https://${API_HOST}/api/training/workouts/${athleteId}`,
    "POST",
    authHeaders,
    xml
  ));

  // ── Evaluate ──────────────────────────────────────────────────────────────
  const winner = probes.find((p) => p.ok);

  return NextResponse.json({
    ok: !!winner,
    method: winner?.endpoint ?? null,
    athleteId,
    probes,   // full probe log — shows in diagnostics
  });
}
