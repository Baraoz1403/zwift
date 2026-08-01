import { NextRequest, NextResponse } from "next/server";

/**
 * All devices → /m/today.
 * 307 (temporary) + no-store so browsers never cache these redirects.
 * Also catches /dashboard and /tablet so old cached 308s chain correctly.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/tablet")
  ) {
    const res = NextResponse.redirect(new URL("/m/today", req.url), 307);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/tablet/:path*"],
};
