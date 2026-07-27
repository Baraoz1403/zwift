import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const theme = req.nextUrl.searchParams.get("theme") ?? "light";
  const next  = req.nextUrl.searchParams.get("next")  ?? "/tablet/today";
  const res   = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set("mobileTheme", theme, { path: "/", maxAge: 31536000 });
  return res;
}
