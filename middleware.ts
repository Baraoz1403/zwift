import { NextRequest, NextResponse } from "next/server";
// Imported from session-constants, NOT @/lib/session - that file pulls in
// node:crypto + jose, which the Edge runtime (what middleware runs on)
// can't bundle. This file is plain constants only, safe for Edge.
import { SESSION_COOKIE_NAME } from "@/lib/session-constants";

/**
 * Detects phone vs tablet vs desktop from User-Agent and redirects the root
 * path "/" to the correct app surface:
 *   phone   → /m   (mobile PWA)
 *   tablet  → /tablet (iPad app)
 *   desktop → /dashboard
 *
 * Only fires on "/" — deep links are never touched so bookmarks work as-is.
 * The rider can override by navigating directly to any route.
 *
 * UA matching is intentionally broad (false positives towards mobile = better
 * UX than falsely sending a phone to the desktop dashboard).
 */
function detectDevice(ua: string): "phone" | "tablet" | "desktop" {
  const uaLower = ua.toLowerCase();

  // iPad detection: iPad UA or "Macintosh" on touch (modern iPadOS)
  // We can't detect touch in middleware (no DOM), so we match known iPad strings.
  if (
    uaLower.includes("ipad") ||
    (uaLower.includes("macintosh") && uaLower.includes("mobile")) ||
    // Android tablets: "android" without "mobile"
    (uaLower.includes("android") && !uaLower.includes("mobile"))
  ) {
    return "tablet";
  }

  // Phones
  if (
    uaLower.includes("iphone") ||
    uaLower.includes("ipod") ||
    (uaLower.includes("android") && uaLower.includes("mobile")) ||
    uaLower.includes("blackberry") ||
    uaLower.includes("windows phone")
  ) {
    return "phone";
  }

  return "desktop";
}

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
  const { pathname } = req.nextUrl;

  // ── Auth gate for protected routes ────────────────────────────────────────
  // Only protect /dashboard here — /m and /tablet layouts handle their own
  // unauthenticated state (they render MobileLoginScreen / redirect to /m).
  // Intercepting /m here would send the user to a desktop /login page instead
  // of the mobile login screen, which is the wrong UX.
  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Device auto-redirect on root "/" ─────────────────────────────────────
  // Redirect ALL visitors (authenticated or not) to the correct surface.
  // Unauthenticated mobile/tablet users land on /m or /tablet which show
  // the login screen. Unauthenticated desktop users land on /dashboard which
  // the auth gate above then sends to /login.
  if (pathname === "/") {
    const ua = req.headers.get("user-agent") ?? "";
    const device = detectDevice(ua);

    const dest =
      device === "phone"   ? "/m" :
      device === "tablet"  ? "/tablet/today" :
      "/dashboard";

    return NextResponse.redirect(new URL(dest, req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Apply to dashboard, mobile, tablet, and root
  matcher: ["/", "/dashboard/:path*", "/m/:path*", "/tablet/:path*"],
};
