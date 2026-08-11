import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session";

/** True for phones; false for tablets, laptops, desktops. */
function isMobileUA(ua: string): boolean {
  // Match phones explicitly — exclude "iPad" and "Tablet" so those stay on
  // the tablet layout.  Pattern: contains "Mobile" but NOT "iPad"/"Tablet".
  return /Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua);
}

/** True for iPad/Android tablets. */
function isTabletUA(ua: string): boolean {
  return /iPad/i.test(ua) || (/Tablet/i.test(ua) && !/Mobile/i.test(ua));
}

export default async function Home() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME);
  const ua = headerStore.get("user-agent") ?? "";

  const mobile = isMobileUA(ua);
  const tablet = isTabletUA(ua);

  // Desktop (laptop/monitor) → full desktop dashboard
  // iPad / Android tablet → tablet layout
  // Phone → mobile layout
  if (!hasSession) {
    if (mobile) redirect("/login?next=/m/today");
    else if (tablet) redirect("/login?next=/tablet/today");
    else redirect("/login?next=/dashboard");
  }

  if (mobile) redirect("/m/today");
  else if (tablet) redirect("/tablet/today");
  else redirect("/dashboard");
}
