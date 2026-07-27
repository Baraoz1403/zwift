import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";
import TabletSidebar from "./sidebar-nav";
import MobileIcuConnect from "@/app/m/mobile-icu-connect";

export const metadata: Metadata = {
  title: "Zwift AI Coach — iPad",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Train" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0f1a",
};

export default async function TabletLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? await decryptSession(raw) : null;

  // Auth gate
  if (!session?.athleteId) {
    redirect("/m");  // Reuse the mobile login screen
  }

  // Auto-refresh Zwift token if expired (same logic as layout.tsx)
  let firstName: string | null = null;
  try {
    const profile = await fetchOwnProfile(session.accessToken);
    firstName = profile.firstName ?? null;
  } catch (e) {
    if (e instanceof ZwiftApiError && e.status === 401 && session.refreshToken) {
      redirect("/api/auth/refresh?next=/tablet/today");
    }
  }

  // ICU gate
  const icuFromCookie = cookieStore.get("zwift_intervals_key")?.value;
  const icuConnected = icuFromCookie
    ? true
    : !!(await getIntervalsCredentials(String(session.athleteId)));

  if (!icuConnected) {
    return (
      <div
        data-mobile-shell
        data-mobile-theme="dark"
        style={{ minHeight: "100dvh", background: "var(--m-bg)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}
      >
        <MobileIcuConnect />
      </div>
    );
  }

  const theme = cookieStore.get("mobileTheme")?.value === "light" ? "light" : "dark";
  const bodyBg = theme === "light" ? "#f0f4f8" : "#0a0f1a";

  return (
    <>
      <style>{`html, body { background-color: ${bodyBg} !important; margin: 0; }`}</style>

      <div
        data-mobile-shell
        data-mobile-theme={theme}
        style={{
          minHeight: "100dvh",
          background: "var(--m-bg)",
          display: "flex",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {/* Fixed sidebar */}
        <TabletSidebar firstName={firstName} />

        {/* Main content — offset by sidebar width */}
        <div style={{
          flex: 1,
          marginLeft: 220,
          minHeight: "100dvh",
          overflowY: "auto",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}>
          {children}
        </div>
      </div>
    </>
  );
}
