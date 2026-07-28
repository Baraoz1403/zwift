import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getRiderIdentity } from "@/lib/kv-plan-state";
import { fetchOwnProfile } from "@/lib/zwift";
import CoachChat from "./coach-chat";

export default async function MobileCoachPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = String(session.athleteId);
  const [zwiftProfile, cachedIdentity] = await Promise.all([
    fetchOwnProfile(session.accessToken).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
  ]);
  const firstName = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <CoachChat firstName={firstName} />
    </div>
  );
}
