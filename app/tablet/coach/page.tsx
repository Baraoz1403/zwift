/**
 * Tablet — Coach tab
 * Uses the mobile CoachChat client component but adds the shared TabletPageHeader.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { fetchOwnProfile } from "@/lib/zwift";
import { getRiderIdentity } from "@/lib/kv-plan-state";
import { TabletPageHeader } from "../tablet-page-header";
import CoachChat from "@/app/m/coach/coach-chat";

export default async function TabletCoachPage() {
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--m-bg)", overflow: "hidden" }}>
      <TabletPageHeader
        section="AI Coach"
        name={firstName}
        subtitle="Training insights & plan generation"
      />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 28px 28px" }}>
        <CoachChat />
      </div>
    </div>
  );
}
