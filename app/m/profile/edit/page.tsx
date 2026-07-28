import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getStoredAthleteState } from "@/lib/kv-plan-state";
import MobileProfileEditor from "./profile-editor";

export default async function MobileProfileEditPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const state = await getStoredAthleteState(String(session.athleteId));
  const profile = state.riderProfile ?? null;

  // Use the same flex pattern as all other pages: outer height:100% flex column,
  // inner flex:1 overflowY:auto. Direct height:100% + overflowY:auto is unreliable
  // on Safari/iOS when the parent height comes from a flex algorithm (not explicit px).
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 }}>
        <MobileProfileEditor initialProfile={profile} />
      </div>
    </div>
  );
}
