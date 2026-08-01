import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const COOKIES_TO_CLEAR = [
  SESSION_COOKIE_NAME,
  "zwift_intervals_key",
  "zwift_intervals_refresh",
  "zwift_intervals_token_exp",
  "zwift_intervals_id",
  "zwift_intervals_name",
];

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of COOKIES_TO_CLEAR) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}

/** GET /api/auth/logout — used by anchor tags (href). Clears all session
 *  cookies and redirects to the login screen. */
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/m";
  const res = NextResponse.redirect(new URL(next, req.nextUrl.origin));
  for (const name of COOKIES_TO_CLEAR) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
