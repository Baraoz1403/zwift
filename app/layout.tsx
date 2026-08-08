import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { pilotModeStatus } from "@/lib/pilot-mode";

export const metadata: Metadata = {
  title: "Volt AI",
  description: "Your personal AI cycling coach.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Volt AI" },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pilot = pilotModeStatus();
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Nicer typography than the system font stack. Loaded from a CDN at
            runtime (not an npm dependency) - if it fails to load for any
            reason, globals.css already falls back to the system font. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="pilot-mode-badge" role="status">
          PILOT · {pilot.readOnly ? "SYNC REQUIRES APPROVAL" : "WRITE ENABLED"}
        </div>
        {children}
      </body>
    </html>
  );
}
