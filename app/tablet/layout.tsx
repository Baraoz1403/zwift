import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";
import TabletSidebar from "./sidebar-nav";
import MobileIcuConnect from "@/app/m/mobile-icu-connect";
import IOSScrollFix from "@/app/ios-scroll-fix";

export const metadata: Metadata = {
  title: "Volt AI — iPad",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Volt AI" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FF5A1F",
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
        data-mobile-theme="light"
        style={{ minHeight: "100dvh", background: "var(--m-bg)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}
      >
        <MobileIcuConnect />
      </div>
    );
  }

  const theme = cookieStore.get("mobileTheme")?.value === "dark" ? "dark" : "light";
  const bodyBg = theme === "light" ? "#f5f7fa" : "#0a0f1a";

  return (
    <>
      <style>{`
        html, body {
          background-color: ${bodyBg} !important;
          margin: 0;
          overflow: hidden !important;
          position: fixed !important;
          width: 100% !important;
          height: 100% !important;
          overscroll-behavior: none !important;
          -webkit-overflow-scrolling: auto !important;
        }
      `}</style>

      <div
        data-mobile-shell
        data-mobile-theme={theme}
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "var(--m-bg)",
          display: "flex",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
          WebkitFontSmoothing: "antialiased",
          overscrollBehavior: "none",
        }}
      >
        {/* Stops iOS Safari viewport rubber-band bounce */}
        <IOSScrollFix />
        {/* Fixed sidebar */}
        <TabletSidebar firstName={firstName} />

        {/*
          Main content — outer shell is fixed-height (100dvh) so the browser
          never scrolls the window. The inner .tablet-scroll-area does all the
          scrolling, which makes position:sticky work correctly on TabletPageHeader.
          The footer lives OUTSIDE the scroll area so it is always visible and
          cannot be scrolled past.
        */}
        <div className="tablet-main" style={{
          flex: 1,
          marginLeft: 220,
          height: "100%",
          overflow: "hidden",           /* outer shell never scrolls */
          paddingTop: "env(safe-area-inset-top, 0px)",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Content area — overflow:hidden so each page manages its own scroll.
              Pages use height:100% + internal overflowY:auto to pin their headers. */}
          <div className="tablet-scroll-area" style={{ flex: 1, overflow: "hidden" }}>
            {children}
          </div>

          {/* Footer — outside scroll area, always pinned to bottom, hidden in portrait (bottom nav takes over) */}
          <footer className="tablet-footer" style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 24,
            padding: "13px 40px",
            background: "var(--m-card)",
            borderTop: "1px solid var(--m-border)",
          }}>
            <a href="/m/legal/terms" style={{ fontSize: 13, color: "#ffffff", textDecoration: "none", fontWeight: 500 }}>Terms of Service</a>
            <span style={{ color: "var(--m-border)" }}>·</span>
            <a href="/m/legal/privacy" style={{ fontSize: 13, color: "#ffffff", textDecoration: "none", fontWeight: 500 }}>Privacy Policy</a>
            <span style={{ color: "var(--m-border)" }}>·</span>
            <span style={{ fontSize: 13, color: "var(--m-muted)", fontWeight: 400 }}>Volt AI</span>
          </footer>
        </div>
      </div>
    </>
  );
}
