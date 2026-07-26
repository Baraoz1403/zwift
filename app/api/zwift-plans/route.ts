import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";

const API_HOST = "us-or-rly101.zwift.com";
const GAME_HEADERS = {
  Platform: "OSX",
  Source: "Game Client",
  "User-Agent": "CNL/3.30.8 (macOS 13 Ventura; Darwin Kernel 22.4.0) zwift/1.0.110983 curl/7.78.0",
};

async function probe(path: string, token: string) {
  try {
    const r = await fetch(`https://${API_HOST}${path}`, {
      headers: { ...GAME_HEADERS, Authorization: `Bearer ${token}` },
    });
    return { path, status: r.status, ok: r.ok, body: r.ok ? await r.json() : await r.text() };
  } catch (e) {
    return { path, status: 0, ok: false, body: String(e) };
  }
}

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  const endpoints = [
    "/api/training-plans",
    "/api/workout-plans",
    "/api/workouts",
    "/api/v2/workouts",
    "/api/v2/plans",
    "/api/plans",
    "/api/workout-categories",
    "/api/structured-workouts",
  ];

  const results = await Promise.all(endpoints.map(p => probe(p, session.accessToken)));
  return NextResponse.json(results);
}
