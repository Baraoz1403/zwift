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

  // Check ICU token validity: expiry timestamp + 401-detected invalid flag
  const { kvGet, kvSet } = await import("@/lib/kv");
  const [icuKvExpires, icuInvalid] = await Promise.all([
    kvGet(`zwift:${session.athleteId}:icu_expires`),
    kvGet(`zwift:${session.athleteId}:icu_invalid`),
  ]);
  // If the key is a Bearer OAuth token and we have no stored expiry,
  // it was set before expiry tracking was added — probe ICU to verify it's still valid.
  // API keys (non-Bearer) never expire so skip the probe for those.
  let icuProbeExpired = false;
  const icuKeyKv = icuFromCookie ?? null;
  if (!icuKvExpires && icuKeyKv?.startsWith("Bearer ")) {
    // Quick HEAD-like check: fetch athlete profile — cheap, same auth as pushes
    try {
      const { fetchIntervalsAthlete } = await import("@/lib/intervals");
      await fetchIntervalsAthlete(icuKeyKv);
    } catch {
      // 401 or network error — treat as expired
      icuProbeExpired = true;
      // Mark in KV so layout doesn't re-probe on every load
      kvSet(`zwift:${session.athleteId}:icu_invalid`, "1", 24 * 60 * 60).catch(() => {});
    }
  }

  const icuTokenExpired =
    (icuKvExpires ? Number(icuKvExpires) < Date.now() : false) ||
    icuInvalid === "1" ||
    icuProbeExpired;

  const icuConnected = !icuTokenExpired && (icuFromCookie
    ? true
    : !!(await getIntervalsCredentials(String(session.athleteId))));

  if (!icuConnected || icuTokenExpired) {
    // Token expired or invalidated by a 401 — show reconnect screen if we have
    // a stored key, otherwise show first-time connect screen.
    const storedKey = await kvGet(`zwift:${session.athleteId}:icu_key`);
    const hasHadIcu = storedKey?.startsWith("Bearer ") || !!icuFromCookie;
    return hasHadIcu ? <MobileIcuConnect reconnect /> : <MobileIcuConnect />;
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
