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

  return (
    <div style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain" }}>
      <MobileProfileEditor initialProfile={profile} />
    </div>
  );
}
