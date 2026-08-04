import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getIntervalsCredentials } from "@/lib/kv-plan-state";
import MobileNav from "./mobile-nav";
import MobileLoginScreen from "./mobile-login";
import MobileIcuConnect from "./mobile-icu-connect";
import IOSScrollFix from "@/app/ios-scroll-fix";
import IpadRedirect from "./ipad-redirect";

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

  // Auto-refresh Zwift token when expired or within 5 minutes of expiry.
  // Transparent to the athlete — the refresh endpoint returns a fresh cookie
  // and redirects back to /m/today.
  const TOKEN_BUFFER_MS = 5 * 60 * 1000;
  if (session.refreshToken && session.expiresAt < Date.now() + TOKEN_BUFFER_MS) {
    redirect("/api/auth/refresh?next=/m/today");
  }

  // ── Intervals.icu gate ───────────────────────────────────────────────────
  const icuFromCookie = cookieStore.get("zwift_intervals_key")?.value;
  const icuConnected = icuFromCookie
    ? true
    : !!(await getIntervalsCredentials(String(session.athleteId)));

  if (!icuConnected) {
    // Check if there is a stored (but possibly expired) Bearer token in KV.
    // If so, try a silent re-auth (prompt=none) so the athlete never sees a
    // connect screen after the initial setup. This works when the athlete is
    // already logged into intervals.icu and has previously approved this client.
    // If silent re-auth fails (not logged in / consent revoked), intervals.icu
    // redirects back with ?error=... and the ICU connect screen shows instead.
    const { kvGet } = await import("@/lib/kv");
    const storedKey = await kvGet(`zwift:${session.athleteId}:icu_key`);
    if (storedKey?.startsWith("Bearer ")) {
      // Had a Bearer token before — attempt silent re-auth before showing screen
      redirect(`/api/intervals/oauth-start?from=m&prompt=none`);
    }
    return <MobileIcuConnect />;
  }

  // Read persisted theme preference (cookie set by ThemeToggleButton client component)
  const theme = cookieStore.get("mobileTheme")?.value === "dark" ? "dark" : "light";
  const bodyBg = theme === "light" ? "#f5f7fa" : "#0a0f1a";

  // Authenticated + ICU connected — show normal app shell with bottom navigation
  return (
    <>
      {/* Sync body/html so iOS overscroll chrome matches app theme */}
      <style>{`
        html, body {
          background-color: ${bodyBg} !important;
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
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
          WebkitFontSmoothing: "antialiased",
          overscrollBehavior: "none",
        }}
      >
        {/*
          Content area — position:absolute with explicit edges.
          This gives every child a definite, trustworthy height to resolve
          height:100% against — no flex-height ambiguity on iOS Safari.
          Bottom is set to clear the MobileNav (64px) + safe-area-bottom.
        */}
        <div style={{
          position: "absolute",
          top: "env(safe-area-inset-top, 0px)",
          left: 0,
          right: 0,
          bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
          overflow: "hidden",
        }}>
          {children}
        </div>

        {/* MobileNav: already position:fixed at bottom */}
        <MobileNav />
        {/* Stops iOS Safari viewport rubber-band bounce */}
        <IOSScrollFix />
        {/* Redirect iPads to /tablet/* — handles already-logged-in iPads that
            don't have the device_hint cookie yet (set at login for new logins) */}
        <IpadRedirect />
      </div>
    </>
  );
}
