/**
 * POST /api/intervals/update-ftp
 *
 * Updates the rider's FTP on Intervals.icu using the computed Coggan FTP
 * from ride data. Called automatically after plan generation when effectiveFtp
 * differs from what Intervals.icu has stored.
 *
 * Body: { ftp: number }
 * Response: { ok: boolean, error?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

const INTERVALS_API = "https://intervals.icu/api/v1";

function basicAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`API_KEY:${apiKey}`).toString("base64");
  return `Basic ${encoded}`;
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ ok: false, error: "Session expired." }, { status: 401 });

  const apiKey = cookieStore.get("zwift_intervals_key")?.value;
  const athleteId = cookieStore.get("zwift_intervals_id")?.value ?? "me";

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Intervals.icu not connected." });
  }

  const { ftp } = await req.json() as { ftp?: number };
  if (!ftp || typeof ftp !== "number" || ftp < 50 || ftp > 600) {
    return NextResponse.json({ ok: false, error: "Invalid FTP value." });
  }

  try {
    // Intervals.icu stores FTP as a time-series "fitness" field via PUT /athlete/:id
    const res = await fetch(`${INTERVALS_API}/athlete/${athleteId}`, {
      method: "PUT",
      headers: {
        Authorization: basicAuthHeader(apiKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ftp }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      return NextResponse.json({ ok: true, ftp });
    }

    const text = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: `Intervals.icu returned ${res.status}: ${text.slice(0, 200)}` });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
