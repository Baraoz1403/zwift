import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session";

function isTabletUserAgent(ua: string): boolean {
  // iPad with standard UA; also catches iPadOS 13+ "Request Desktop" mode via
  // the "Macintosh" + no "Mobile" combination — handled separately server-side
  // as navigator.maxTouchPoints is not available here. Standard iPad UA suffices.
  return /iPad/i.test(ua);
}

function isMobileUserAgent(ua: string): boolean {
  return /iPhone|iPod|Android|Mobile/i.test(ua);
}

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME);

  if (!hasSession) {
    // Pass ?next=/ so the middleware's device-detection fires after login
    // and routes phone → /m, tablet → /tablet, desktop → /dashboard.
    // Without this, the login page defaults to /dashboard regardless of device.
    redirect("/login?next=/");
  }

  // Route all visitors to the active app. Desktop → /m/today (same as mobile).
  // The old /dashboard route is legacy and no longer the entry point.
  const headerStore = await headers();
  const ua = headerStore.get("user-agent") ?? "";

  if (isTabletUserAgent(ua)) redirect("/tablet/today");
  // All other devices (phone, desktop, unknown) → mobile app
  redirect("/m/today");
}
