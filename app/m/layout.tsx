import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import MobileNav from "./mobile-nav";

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
  if (!raw) redirect("/login?next=/m");
  const session = await decryptSession(raw);
  if (!session?.athleteId) redirect("/login?next=/m");

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
