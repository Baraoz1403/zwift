"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Coach / Stats tab navigation - the split introduced to keep the daily
 * "what do I ride today" flow (Coach, default) free of statistics, moving
 * all metrics/history/records to their own page (Stats) instead of mixing
 * both concerns on one long scroll.
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
    color: active ? "#fff" : "var(--text)",
    background: active ? "var(--accent)" : "transparent",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    transition: "all 0.15s ease",
  });

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <Link href="/dashboard" style={tabStyle(!isStats)}>Coach</Link>
      <Link href="/dashboard/stats" style={tabStyle(!!isStats)}>Stats</Link>
    </div>
  );
}
