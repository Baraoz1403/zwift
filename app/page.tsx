import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session";

/** True for phones; false for tablets, laptops, desktops. */
function isMobileUA(ua: string): boolean {
  // Match phones explicitly — exclude "iPad" and "Tablet" so those stay on
  // the tablet layout.  Pattern: contains "Mobile" but NOT "iPad"/"Tablet".
  return /Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua);
}

export default async function Home() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME);
  const ua = headerStore.get("user-agent") ?? "";

  const mobile = isMobileUA(ua);

  if (!hasSession) {
    redirect(mobile ? "/login?next=/m/today" : "/login?next=/tablet/today");
  }

  redirect(mobile ? "/m/today" : "/tablet/today");
}
