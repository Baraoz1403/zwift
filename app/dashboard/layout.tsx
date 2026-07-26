import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile, type ZwiftProfile } from "@/lib/zwift";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";
import LogoutButton from "./logout-button";
import DashboardFooter from "./footer";
import IntervalsOnboarding from "./intervals-onboarding";
import HeroBanner from "./hero-banner";

/**
 * Shared chrome for both dashboard pages (Coach at /dashboard, Stats at
 * /dashboard/stats): auth check, greeting header, Coach/Stats tab nav,
 * connections/logout. Previously all of this plus every page's own content
 * lived in one long page.tsx - split out here once the dashboard became two
 * actual routes instead of one long scroll, so the auth/greeting logic
 * isn't duplicated in each page.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) redirect("/login");

  const session = await decryptSession(raw);
  if (!session) redirect("/login");

  if (session.expiresAt && session.expiresAt < Date.now()) {
    redirect("/api/auth/refresh?next=/dashboard");
  }

  let profile: ZwiftProfile | null = null;
  try {
    profile = await fetchOwnProfile(session.accessToken);
  } catch {
    // Best-effort - a failed profile fetch just means a generic greeting;
    // each page's own data fetch will surface any real problem clearly.
  }

  // ── Mandatory Intervals.icu onboarding gate ─────────────────────────────
  // Root cause of the recurring "athlete never gets synced" confusion this
  // app has hit repeatedly: a rider could reach the full dashboard, get a
  // generated plan, and have no idea their workouts were never reaching
  // Zwift because they'd never connected ICU - the connection was framed as
  // optional and easy to miss. Closing that permanently: a brand-new athlete
  // (no icu_key on record) sees ONLY this connect screen - no Coach tab, no
  // Stats tab, nothing else reachable - until they actually connect. Plan
  // generation itself is also gated on this same check (see
  // ensurePlanProvisioned in lib/plan-runner.ts), so there's no path left
  // where a plan can exist without ICU already wired up to receive it.
  // session.athleteId is optional (lib/session-constants.ts) - fall back to
  // the profile just fetched above rather than treating a missing field as
  // "not connected" for an athlete who actually is.
  const athleteId = session.athleteId ?? (profile?.id != null ? String(profile.id) : undefined);
  const hasIntervalsConnected = athleteId
    ? (await getIntervalsCredentials(athleteId)) !== null
    : false;

  if (!hasIntervalsConnected) {
    return (
      <div className="dashboard">
        <div className="dashboard-header fade-in">
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{
              width: 50, height: 50, borderRadius: 10, flexShrink: 0, marginTop: 3,
              background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(47,143,224,0.35)",
            }}>
              <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
                <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 5 }}>
                AI Training Coach
              </div>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: "-0.6px", lineHeight: 1 }}>
                {profile?.firstName ? `Welcome, ${profile.firstName}` : "Welcome"}
              </h1>
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400, marginTop: 6 }}>
                One-time setup: connect Intervals.icu so your AI training plan can actually reach Zwift.
              </div>
            </div>
          </div>
          <div className="header-nav-row">
            <LogoutButton />
          </div>
        </div>

        <IntervalsOnboarding />
      </div>
    );
  }

  return (
    <>
      <div className="dashboard">
        <div className="fade-in">
          <HeroBanner firstName={profile?.firstName ?? null} />
        </div>

        {children}
      </div>
      <DashboardFooter />
    </>
  );
}
