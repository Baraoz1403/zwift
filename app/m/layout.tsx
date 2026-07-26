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
  themeColor: "#0a0f1a",
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
  // Mirrors the desktop mandatory gate: no ICU = no app.
  // Fast path: check cookie (set by oauth-callback). If absent, hit KV so
  // a desktop-connected athlete isn't re-prompted on their phone.
  const icuFromCookie = cookieStore.get("zwift_intervals_key")?.value;
  const icuConnected = icuFromCookie
    ? true
    : !!(await getIntervalsCredentials(String(session.athleteId)));

  if (!icuConnected) {
    return <MobileIcuConnect />;
  }

  // Authenticated + ICU connected — show normal app shell with bottom navigation
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0f1a",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
      overscrollBehavior: "none",
    }}>
      {/* Safe area top spacer */}
      <div style={{ height: "env(safe-area-inset-top, 0px)", flexShrink: 0 }} />

      {/* Scrollable content; pad bottom so content clears the fixed nav */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
      }}>
        {children}
      </div>

      {/* Fixed bottom navigation */}
      <MobileNav />
    </div>
  );
}
