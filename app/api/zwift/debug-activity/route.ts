import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

/**
 * Debug endpoint — returns the raw JSON of the 3 most recent activities
 * so we can see exactly which field Zwift uses for Training Score.
 * Visit /api/zwift/debug-activity in the browser to inspect.
 */
export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const athleteId = session.athleteId;
  if (!athleteId) return NextResponse.json({ error: "No athlete ID" });

  const resp = await fetch(
    `https://us-or-rly101.zwift.com/api/profiles/${athleteId}/activities?start=0&limit=3`,
    {
      headers: {
        Platform: "OSX",
        Source: "Game Client",
        "User-Agent": "CNL/3.30.8 (macOS 13 Ventura; Darwin Kernel 22.4.0) zwift/1.0.110983 curl/7.78.0",
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    }
  );

  const data = await resp.json();
  // Return raw data so we can inspect ALL field names
  return NextResponse.json({ ok: true, raw: data });
}
