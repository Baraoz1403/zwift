import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";
import MobileNav from "./mobile-nav";
import MobileLoginScreen from "./mobile-login";
import MobileIcuConnect from "./mobile-icu-connect";

export const metadata: Metadata = {
  title: "Zwift AI Coach",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Train" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f5f7fa",
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
          minHeight: "100dvh",
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

        {/* Scrollable content; pad bottom so content clears the fixed nav */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
        }}>
          {children}

          {/* Legal footer — visible from every page, sits above bottom nav */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
            padding: "20px 16px 8px",
            borderTop: "1px solid var(--m-border)",
            marginTop: 12,
          }}>
            <a href="/m/legal/terms" style={{
              fontSize: 13, color: "var(--m-muted)", textDecoration: "none", fontWeight: 500,
            }}>Terms of Service</a>
            <span style={{ color: "var(--m-border)", fontSize: 14 }}>·</span>
            <a href="/m/legal/privacy" style={{
              fontSize: 13, color: "var(--m-muted)", textDecoration: "none", fontWeight: 500,
            }}>Privacy Policy</a>
          </div>
        </div>

        {/* Fixed bottom navigation */}
        <MobileNav />
      </div>
    </>
  );
}
