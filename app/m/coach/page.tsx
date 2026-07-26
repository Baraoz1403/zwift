import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import CoachChat from "./coach-chat";

export default async function MobileCoachPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login?next=/m");
  const session = await decryptSession(raw);
  if (!session?.athleteId) redirect("/login?next=/m");

  return <CoachChat />;
}
