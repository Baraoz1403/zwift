import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { fetchOwnProfile, type ZwiftProfile } from "@/lib/zwift";
import ConnectionsNavChip from "./connections-nav-chip";
import LogoutButton from "./logout-button";
import DashboardFooter from "./footer";
import DashboardNavTabs from "./dashboard-nav-tabs";

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

  return (
    <>
      <div className="dashboard">
        <div className="dashboard-header fade-in">
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{
              width: 50, height: 50, borderRadius: 14, flexShrink: 0, marginTop: 3,
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: "-0.6px", lineHeight: 1 }}>
                  {profile?.firstName ? `Hi, ${profile.firstName}` : "Your Dashboard"}
                </h1>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}>
                Ride smarter, live better — powered by AI.
              </div>
            </div>
          </div>

          <div className="header-nav-row">
            <DashboardNavTabs />
            <ConnectionsNavChip />
            <LogoutButton />
          </div>
        </div>

        {children}
      </div>
      <DashboardFooter />
    </>
  );
}
