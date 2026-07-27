"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

const ZO = "#FF5A1F";

const TABS = [
  { href: "/tablet/today",   label: "Today",   icon: TodayIcon   },
  { href: "/tablet/week",    label: "Week",    icon: WeekIcon    },
  { href: "/tablet/coach",   label: "Coach",   icon: CoachIcon   },
  { href: "/tablet/profile", label: "Profile", icon: ProfileIcon },
];

export default function TabletSidebar({ firstName }: { firstName?: string | null }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [theme, setTheme]     = useState<"dark" | "light">("light");
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    const saved = document.cookie.split(";").find(c => c.trim().startsWith("mobileTheme="));
    setTheme(saved?.includes("dark") ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.cookie = `mobileTheme=${next}; path=/; max-age=31536000`;
    // Update the shell attribute — all CSS vars cascade immediately across the entire page
    const shell = document.querySelector("[data-mobile-shell]");
    if (shell) shell.setAttribute("data-mobile-theme", next);
  }

  async function signOut() {
    setSigning(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/m");
  }

  const isDark  = theme === "dark";
  const bg      = isDark ? "#0d1117" : "#ffffff";
  const border  = isDark ? "#21262d" : "#e4e9f0";
  const muted   = isDark ? "#6e7681" : "#94a3b8";
  const textCol = isDark ? "#f0f6fc" : "#0d1626";

  return (
    <>
    {/* ── Landscape: vertical sidebar ─────────────────────────────── */}
    <div className="tablet-sidebar" style={{
      width: 220, minHeight: "100dvh",
      background: bg,
      borderRight: `1px solid ${border}`,
      display: "flex", flexDirection: "column", flexShrink: 0,
      position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />

      {/* Brand */}
      <div style={{ padding: "28px 20px 24px", borderBottom: `1px solid ${border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 4, background: ZO, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: textCol, letterSpacing: "-.3px" }}>Volt AI</div>
            {firstName && <div style={{ fontSize: 14, color: muted, marginTop: 1 }}>{firstName}</div>}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
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
              <Icon color={active ? ZO : muted} />
              <span style={{
                fontSize: 16, fontWeight: active ? 700 : 500,
                color: active ? textCol : muted,
              }}>{label}</span>
              {active && <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: 1, background: ZO }} />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — theme toggle + sign out */}
      <div style={{ padding: "12px 12px calc(16px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${border}`, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Theme toggle — above Sign Out, toggles the ENTIRE site */}
        <button type="button" onClick={toggleTheme} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", borderRadius: 4, width: "100%",
          border: `1px solid ${border}`, background: "transparent",
          cursor: "pointer", fontFamily: "inherit",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="1.8" strokeLinecap="round">
            {isDark
              ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
              : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}
          </svg>
          <span style={{ fontSize: 14, color: muted, fontWeight: 500 }}>{isDark ? "Light mode" : "Dark mode"}</span>
        </button>

        {/* Sign out */}
        <button type="button" onClick={signOut} disabled={signing} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", borderRadius: 4, width: "100%",
          border: `1px solid ${border}`, background: "transparent",
          cursor: "pointer", fontFamily: "inherit", opacity: signing ? 0.5 : 1,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span style={{ fontSize: 14, color: muted, fontWeight: 500 }}>{signing ? "Signing out…" : "Sign out"}</span>
        </button>
      </div>
    </div>

    {/* ── Portrait: bottom nav ─────────────────────────────────────── */}
    <nav className="tablet-bottom-nav" style={{ background: bg, borderTopColor: border, borderTopWidth: 1, borderTopStyle: "solid", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}>
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href === "/tablet/today" && pathname === "/tablet");
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 4, textDecoration: "none", paddingTop: 8,
            WebkitTapHighlightColor: "transparent",
          }}>
            <Icon color={active ? ZO : muted} />
            <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? ZO : muted }}>
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
