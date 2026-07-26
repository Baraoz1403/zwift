import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session";

function isMobileUserAgent(ua: string): boolean {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
}

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME);

  if (!hasSession) {
    redirect("/login");
  }

  // Route mobile visitors to the mobile app, desktop to the dashboard.
  // This is what makes "Add to Home Screen" open the right version.
  const headerStore = await headers();
  const ua = headerStore.get("user-agent") ?? "";
  const mobile = isMobileUserAgent(ua);

  redirect(mobile ? "/m/today" : "/dashboard");
}
