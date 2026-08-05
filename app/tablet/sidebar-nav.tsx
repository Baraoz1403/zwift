"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const ZO = "#FF5A1F";

const TABS = [
  { href: "/tablet/today",    label: "Today",    icon: TodayIcon    },
  { href: "/tablet/week",     label: "Week",     icon: WeekIcon     },
  { href: "/tablet/coach",    label: "Coach",    icon: CoachIcon    },
  { href: "/tablet/profile",  label: "Profile",  icon: ProfileIcon  },
  { href: "/tablet/settings", label: "Settings", icon: SettingsIcon },
];

/**
 * TabletSidebar — landscape vertical sidebar + portrait bottom nav.
 *
 * Theme sync: All colors use CSS custom properties (var(--m-card), var(--m-border),
 * var(--m-muted), var(--m-text)) which are defined under [data-mobile-shell][data-mobile-theme]
 * selectors in globals.css. This means theme changes applied by ThemeToggleButton
 * (which sets data-mobile-theme on the shell div) cascade here automatically —
 * no JS state or cookie reads needed.
 */
export default function TabletSidebar() {
  const pathname = usePathname();

  return (
    <>
    {/* ── Landscape: vertical sidebar (starts below the fixed top bar) ─ */}
    <div className="tablet-sidebar" style={{
      width: 220,
      background: "var(--m-card)",
      borderRight: "1px solid var(--m-border)",
      display: "flex", flexDirection: "column", flexShrink: 0,
      position: "fixed",
      top: "var(--tablet-bar-h)",
      left: 0, bottom: "var(--tablet-footer-h)",
      zIndex: 50,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      overflow: "hidden",
    }}>
      {/* Nav — no brand section (top bar handles branding) */}
      <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/tablet/today" && pathname === "/tablet");
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px", borderRadius: 4,
              background: active ? `${ZO}12` : "transparent",
              border: `1px solid ${active ? ZO + "35" : "transparent"}`,
              textDecoration: "none",
            }}>
              <Icon color={active ? ZO : "var(--m-muted)"} />
              <span style={{
                fontSize: 16, fontWeight: active ? 700 : 500,
                color: active ? "var(--m-text)" : "var(--m-muted)",
              }}>{label}</span>
              {active && <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: 1, background: ZO }} />}
            </Link>
          );
        })}
      </nav>

    </div>

    {/* ── Portrait + landscape: bottom nav (always visible) ────────── */}
    <nav className="tablet-bottom-nav" style={{
      background: "var(--m-card)",
      borderTopColor: "var(--m-border)", borderTopWidth: 1, borderTopStyle: "solid",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href === "/tablet/today" && pathname === "/tablet");
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 4, textDecoration: "none", paddingTop: 8,
            WebkitTapHighlightColor: "transparent",
          }}>
            <Icon color={active ? ZO : "var(--m-muted)"} />
            <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? ZO : "var(--m-muted)" }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
    </>
  );
}

function TodayIcon({ color }: { color: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.9"/><path d="M12 7v5l3 2" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function WeekIcon({ color }: { color: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.9"/><path d="M3 10h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.9" strokeLinecap="round"/></svg>;
}
function CoachIcon({ color }: { color: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h4l4 4 4-4h4a2 2 0 002-2V4a2 2 0 00-2-2z" stroke={color} strokeWidth="1.9" strokeLinejoin="round"/><path d="M8 9h8M8 13h5" stroke={color} strokeWidth="1.9" strokeLinecap="round"/></svg>;
}
function ProfileIcon({ color }: { color: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.9"/><path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke={color} strokeWidth="1.9" strokeLinecap="round"/></svg>;
}
function SettingsIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.9"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
