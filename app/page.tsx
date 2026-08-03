import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export default async function Home() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME);

  if (!hasSession) {
    // Preserve device hint in the next param so after login the user lands
    // on the right interface automatically.
    const hint = cookieStore.get("device_hint")?.value;
    redirect(hint === "tablet" ? "/login?next=/tablet/today" : "/login?next=/m/today");
  }

  // Respect device_hint cookie — desktop/tablet users land on /tablet/today
  const hint = cookieStore.get("device_hint")?.value;
  redirect(hint === "tablet" ? "/tablet/today" : "/m/today");
}
