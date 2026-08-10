import { NextRequest, NextResponse } from "next/server";

/**
 * Device routing — 307 + no-store (never cached by browser/CDN).
 *
 * Phone (UA contains "Mobile" but not "iPad") → /m/today
 * iPad + Desktop → /tablet/today
 * /dashboard → /m/today (removes legacy hero page)
 *
 * device_hint cookie overrides auto-detection when present.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Legacy dashboard → device-appropriate view
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const deviceHint = req.cookies.get("device_hint")?.value;
    const ua = req.headers.get("user-agent") ?? "";
    const isPhone = !deviceHint
      ? /Mobile/.test(ua) && !/iPad/.test(ua)
      : deviceHint === "mobile";
    const dest = isPhone ? "/m/today" : "/tablet/today";
    const res = NextResponse.redirect(new URL(dest, req.url), 307);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  // Root: detect device
  if (pathname === "/") {
    const deviceHint = req.cookies.get("device_hint")?.value;
    let dest: string;

    if (deviceHint === "tablet") {
      dest = "/tablet/today";
    } else if (deviceHint === "mobile") {
      dest = "/m/today";
    } else {
      // Auto-detect: phones have "Mobile" in UA (iPads and desktops don't)
      const ua = req.headers.get("user-agent") ?? "";
      const isPhone = /Mobile/.test(ua) && !/iPad/.test(ua);
      dest = isPhone ? "/m/today" : "/tablet/today";
    }

    const res = NextResponse.redirect(new URL(dest, req.url), 307);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard", "/dashboard/:path*"],
};
