import { NextRequest, NextResponse } from "next/server";

/**
 * Device routing — 307 + no-store (never cached).
 * iPad (device_hint=tablet cookie) → /tablet/today
 * Everything else → /m/today
 * Old /dashboard routes → /m/today (removes legacy hero page)
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Legacy dashboard → mobile app
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const res = NextResponse.redirect(new URL("/m/today", req.url), 307);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  // Root: route by device hint
  if (pathname === "/") {
    const deviceHint = req.cookies.get("device_hint")?.value;
    const dest = deviceHint === "tablet" ? "/tablet/today" : "/m/today";
    const res = NextResponse.redirect(new URL(dest, req.url), 307);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard", "/dashboard/:path*"],
};
