import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Today · Zwift AI",
  description: "Your daily workout",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Train" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0)",
    }}>
      {children}
    </div>
  );
}
