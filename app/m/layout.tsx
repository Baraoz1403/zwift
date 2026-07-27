import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";
import MobileNav from "./mobile-nav";
import MobileLoginScreen from "./mobile-login";
import MobileIcuConnect from "./mobile-icu-connect";

export const metadata: Metadata = {
  title: "Volt AI",
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

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = raw ? await decryptSession(raw) : null;

  // Not authenticated — show the mobile login screen (no nav, no children)
  if (!session?.athleteId) {
    return <MobileLoginScreen />;
  }

  // ── Intervals.icu gate ───────────────────────────────────────────────────
  const icuFromCookie = cookieStore.get("zwift_intervals_key")?.value;
  const icuConnected = icuFromCookie
    ? true
    : !!(await getIntervalsCredentials(String(session.athleteId)));

  if (!icuConnected) {
    return <MobileIcuConnect />;
  }

  // Read persisted theme preference (cookie set by ThemeToggleButton client component)
  const theme = cookieStore.get("mobileTheme")?.value === "dark" ? "dark" : "light";
  const bodyBg = theme === "light" ? "#f5f7fa" : "#0a0f1a";

  // Authenticated + ICU connected — show normal app shell with bottom navigation
  return (
    <>
      {/* Sync body background with current theme to avoid iOS overscroll colour mismatch */}
      <style>{`html, body { background-color: ${bodyBg} !important; }`}</style>

      <div
        data-mobile-shell
        data-mobile-theme={theme}
        style={{
          height: "100dvh",
          overflow: "hidden",
          background: "var(--m-bg)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
          WebkitFontSmoothing: "antialiased",
          overscrollBehavior: "none",
        }}
      >
        {/* Safe area top spacer */}
        <div style={{ height: "env(safe-area-inset-top, 0px)", flexShrink: 0 }} />

        {/* Content area — overflow:hidden so each page manages its own scroll.
            Pages that need to scroll set overflowY:auto internally and add
            paddingBottom to clear the fixed bottom nav. */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {children}
        </div>

        {/* Fixed bottom navigation */}
        <MobileNav />
      </div>
    </>
  );
}
