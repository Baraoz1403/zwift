import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { fetchOwnProfile, ZwiftApiError } from "@/lib/zwift";
import { getIntervalsCredentials, getCachedPlan, getStoredAthleteState, getRiderIdentity } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import TabletSidebar from "./sidebar-nav";
import { TabletTopBar } from "./tablet-top-bar";
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
    redirect("/m");
  }

  // Proactive token refresh — same 5-minute buffer as the mobile layout.
  // Without this, a rider whose Zwift access token is about to expire would
  // hit the tablet and get 401 errors on the first data fetch instead of a
  // clean transparent refresh. The mobile layout has had this since day 1;
  // the tablet was missing it, which caused the "need to logout and back in"
  // symptom on iPad.
  const TOKEN_BUFFER_MS = 5 * 60 * 1000;
  if (session.refreshToken && session.expiresAt < Date.now() + TOKEN_BUFFER_MS) {
    redirect("/api/auth/refresh?next=/tablet/today");
  }

  const athleteId = String(session.athleteId);
  const weekOf    = mondayOfCurrentWeek();
  const cookieKey = cookieStore.get("zwift_intervals_key")?.value;

  // Parallel data fetch for the top bar
  let firstName: string | null = null;
  let ftp: number | null = null;
  try {
    const [profile, cachedId, kvCreds, plan, athleteState] = await Promise.all([
      fetchOwnProfile(session.accessToken).catch((e: unknown) => {
        // Auto-refresh if 401
        if (e instanceof ZwiftApiError && (e as ZwiftApiError).status === 401 && session.refreshToken) {
          redirect("/api/auth/refresh?next=/tablet/today");
        }
        return null;
      }),
      getRiderIdentity(athleteId).catch(() => null),
      cookieKey ? Promise.resolve(null) : getIntervalsCredentials(athleteId).catch(() => null),
      getCachedPlan(athleteId, weekOf).catch(() => null),
      getStoredAthleteState(athleteId).catch(() => null),
    ]);

    firstName = profile?.firstName ?? cachedId?.firstName ?? null;
    ftp       = profile?.ftp ?? cachedId?.ftp ?? null;

    // Phase + week from macro cycle
    const macro = (athleteState as { macroCycle?: { weekIndex: number } } | null)?.macroCycle ?? null;
    const currentPhase = macro
      ? (macro.weekIndex === 0 ? "Base" : macro.weekIndex % 4 === 3 ? "Recovery" : "Build")
      : null;
    const weekDisplayNum = macro ? macro.weekIndex + 1 : null;

    // Session count from plan
    const workouts = plan?.workouts ?? [];
    const weekWorkoutCount = workouts.filter(
      (w: { type?: string }) => !["rest","recovery"].some(k => (w.type ?? "").toLowerCase().includes(k))
    ).length;

    // Connection status — Zwift is always connected (required), ICU is optional
    const icuConnected = !!(cookieKey ?? kvCreds?.icuKey);

    // Greeting (UTC+3 approximation — same as mobile)
    const now       = new Date();
    const utcHour   = now.getUTCHours();
    const localHour = (utcHour + 3) % 24;
    const greeting  =
      localHour < 5  ? "Late night" :
      localHour < 12 ? "Good morning" :
      localHour < 17 ? "Good afternoon" :
      localHour < 21 ? "Good evening" : "Good night";
    const dateLabel = now.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Jerusalem",
    });

    // ICU gate — show connect screen if not set up
    if (!icuConnected) {
      const theme   = cookieStore.get("mobileTheme")?.value === "dark" ? "dark" : "light";
      const bodyBg  = theme === "light" ? "#f5f7fa" : "#0a0f1a";
      return (
        <>
          <style>{`html,body{background-color:${bodyBg}!important;margin:0;overflow:hidden!important;position:fixed!important;width:100%!important;height:100%!important;overscroll-behavior:none!important}`}</style>
          <div data-mobile-shell data-mobile-theme={theme} style={{ minHeight:"100dvh", background:"var(--m-bg)", fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif" }}>
            <MobileIcuConnect />
          </div>
        </>
      );
    }

    const theme  = cookieStore.get("mobileTheme")?.value === "dark" ? "dark" : "light";
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
          }
        `}</style>

        <div
          data-mobile-shell
          data-mobile-theme={theme}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--m-bg)",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
            WebkitFontSmoothing: "antialiased",
          }}
        >
          <IOSScrollFix />

          {/* ── Fixed top bar ─────────────────────────────────────────────── */}
          <TabletTopBar
            firstName={firstName}
            ftp={ftp}
            currentPhase={currentPhase}
            weekDisplayNum={weekDisplayNum}
            weekWorkoutCount={weekWorkoutCount}
            icuConnected={icuConnected}
            greeting={greeting}
            dateLabel={dateLabel}
          />

          {/* ── Left nav sidebar (landscape only) ────────────────────────── */}
          <TabletSidebar />

          {/*
            Content area: sits between top bar and bottom nav.
            marginLeft = sidebar width.
            Each page provides its own two-column layout where each column
            has overflow-y: auto so they scroll independently.
          */}
          {/*
            Main content area.
            - position:fixed so it sits exactly between the fixed top-bar
              and the fixed bottom-nav, independent of both.
            - left: 220px — clears the sidebar.
            - display:flex column so children can fill 100% height.
          */}
          {/*
            Main content: position:fixed fills the space between top-bar and
            bottom-nav, to the right of the sidebar. Pages passed as {children}
            must use flex:1 (not height:100%) to fill this flex column.
          */}
          <div
            className="tablet-main"
            style={{
              position: "fixed",
              top: "var(--tablet-bar-h)",
              bottom: "var(--tablet-footer-h)",
              left: 220,
              right: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              paddingTop: 16, // dark-background gap between top bar and column content
            }}
          >
            {children}
          </div>
        </div>
      </>
    );
  } catch (e) {
    // If anything above throws unexpectedly, redirect to login
    console.error("TabletLayout error:", e);
    redirect("/m");
  }
}
