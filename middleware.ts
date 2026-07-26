import { NextRequest, NextResponse } from "next/server";
// Imported from session-constants, NOT @/lib/session - that file pulls in
// node:crypto + jose, which the Edge runtime (what middleware runs on)
// can't bundle. This file is plain constants only, safe for Edge.
import { SESSION_COOKIE_NAME } from "@/lib/session-constants";

// Lightweight gate: only checks that a session cookie is present. Real
// decryption/validation happens server-side in route handlers and pages,
// since that's where the data that actually matters gets fetched.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard") && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
