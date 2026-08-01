import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal middleware — all devices → /m/today.
 * Legacy tablet/dashboard/device-detection routing removed.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/m/today", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
