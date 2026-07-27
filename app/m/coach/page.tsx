import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import CoachChat from "./coach-chat";

export default async function MobileCoachPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <CoachChat />
    </div>
  );
}
