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

  // position:absolute + inset:0 fills the nearest positioned ancestor exactly —
  // bypasses the Safari height:100% / flex resolution bug entirely.
  // On mobile: the nearest positioned ancestor is the layout's position:absolute content div.
  // On tablet: the nearest positioned ancestor is tablet-scroll-area (position:relative added in layout.tsx).
  // inset:0 shorthand not supported on iOS Safari < 14.5 — use explicit props.
  return (
    <div style={{
      position: "absolute",
      top: 0, left: 0, right: 0, bottom: 0,
      overflowY: "auto",
      overscrollBehavior: "contain",
    }}>
      <MobileProfileEditor initialProfile={profile} />
    </div>
  );
}
