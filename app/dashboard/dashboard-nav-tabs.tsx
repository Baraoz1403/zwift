"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Coach / Stats tab navigation - the split introduced to keep the daily
 * "what do I ride today" flow (Coach, default) free of statistics, moving
 * all metrics/history/records to their own page (Stats) instead of mixing
 * both concerns on one long scroll.
 *
 * Lives exclusively inside the dark hero-banner header now (see
 * hero-banner.tsx), so the tab colors are tuned for a dark background
 * rather than the light theme tokens (var(--text) etc.) used elsewhere.
 */
export default function DashboardNavTabs() {
  const pathname = usePathname();
  const isStats = pathname?.startsWith("/dashboard/stats");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
    color: active ? "#0a0e1a" : "rgba(255,255,255,0.75)",
    background: active ? "#fff" : "rgba(255,255,255,0.06)",
    border: active ? "1px solid #fff" : "1px solid rgba(255,255,255,0.16)",
    transition: "all 0.15s ease",
  });

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <Link href="/dashboard" style={tabStyle(!isStats)}>Coach</Link>
      <Link href="/dashboard/stats" style={tabStyle(!!isStats)}>Stats</Link>
    </div>
  );
}
