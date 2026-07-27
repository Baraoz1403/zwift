"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

const ZO = "#FF5A1F";
const ZB = "#00C2FF";

const TABS = [
  { href: "/tablet/today",   label: "Today",   icon: TodayIcon   },
  { href: "/tablet/week",    label: "Week",    icon: WeekIcon    },
  { href: "/tablet/coach",   label: "Coach",   icon: CoachIcon   },
  { href: "/tablet/profile", label: "Profile", icon: ProfileIcon },
];

export default function TabletSidebar({ firstName }: { firstName?: string | null }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [theme, setTheme]   = useState<"dark" | "light">("light");
  const [signing, setSigning] = useState(false);

  // Sync with persisted cookie on first render
  useEffect(() => {
    const saved = document.cookie.split(";").find(c => c.trim().startsWith("mobileTheme="));
    if (saved?.includes("light")) setTheme("light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.cookie = `mobileTheme=${next}; path=/; max-age=31536000`;
    // Update the shell attribute so CSS vars switch immediately
    const shell = document.querySelector("[data-mobile-shell]");
    if (shell) shell.setAttribute("data-mobile-theme", next);
  }

  async function signOut() {
    setSigning(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }

  const bg      = theme === "dark" ? "#0d1424" : "#ffffff";
  const border  = theme === "dark" ? "#1e3050" : "#e4e9f0";
  const mutedTx = theme === "dark" ? "#5a7498" : "#94a3b8";
  const activeLabel = theme === "dark" ? "#f8fafc" : "#0d1626";
  const nameTx  = theme === "dark" ? "rgba(248,250,252,0.6)" : "#64748b";

  return (
    <>
    {/* ── Landscape: vertical sidebar ─────────────────────────────────────── */}
    <div className="tablet-sidebar" style={{
      width: 220,
      minHeight: "100dvh",
      background: bg,
      borderRight: `1px solid ${border}`,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      position: "fixed",
      top: 0,
      left: 0,
      bottom: 0,
      zIndex: 50,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {/* Safe area top */}
      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />

      {/* Brand */}
      <div style={{ padding: "24px 20px 20px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          background: "transparent",
          borderRadius: 12, padding: "6px 4px",
          width: "100%", boxSizing: "border-box",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: ZO,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="17" height="17" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.2px", color: theme === "dark" ? "#f8fafc" : "#0f172a" }}>
              Volt AI
            </div>
            {firstName && (
              <div style={{ fontSize: 12, fontWeight: 500, color: nameTx, marginTop: 1 }}>
                {firstName}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/tablet/today" && pathname === "/tablet");
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 16px",
                borderRadius: 12,
                background: active ? `${ZO}18` : "transparent",
                border: `1px solid ${active ? ZO + "40" : "transparent"}`,
                textDecoration: "none",
                transition: "all 0.15s",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Icon color={active ? ZO : mutedTx} />
              <span style={{
                fontSize: 15, fontWeight: active ? 700 : 500,
                color: active ? activeLabel : mutedTx,
                letterSpacing: active ? "-0.2px" : "0",
              }}>
                {label}
              </span>
              {active && (
                <div style={{ marginLeft: "auto", width: 4, height: 4, borderRadius: "50%", background: ZO }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div style={{ padding: "12px 12px calc(12px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 16px", borderRadius: 12,
            border: `1px solid ${border}`,
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={mutedTx} strokeWidth="1.8" strokeLinecap="round">
            {theme === "dark"
              ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
              : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            }
          </svg>
          <span style={{ fontSize: 13, fontWeight: 500, color: mutedTx }}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
        </button>

        {/* Sign out */}
        <button
          type="button"
          onClick={signOut}
          disabled={signing}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 16px", borderRadius: 12,
            border: `1px solid ${border}`,
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            opacity: signing ? 0.5 : 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={mutedTx} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 500, color: mutedTx }}>
            {signing ? "Signing out…" : "Sign out"}
          </span>
        </button>
      </div>
    </div>

    {/* ── Portrait: horizontal bottom nav bar ─────────────────────────────── */}
    <nav
      className="tablet-bottom-nav"
      style={{
        background: bg,
        borderTopColor: border,
        borderTopWidth: 1,
        borderTopStyle: "solid",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href === "/tablet/today" && pathname === "/tablet");
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              textDecoration: "none",
              paddingTop: 8,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Icon color={active ? ZO : mutedTx} />
            <span style={{
              fontSize: 10,
              fontWeight: active ? 700 : 500,
              color: active ? ZO : mutedTx,
              letterSpacing: "0.02em",
            }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
    </>
  );
}

// ── Icon components ───────────────────────────────────────────────────────────

function TodayIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.9"/>
      <path d="M12 7v5l3 2" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function WeekIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.9"/>
      <path d="M3 10h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.9" strokeLinecap="round"/>
    </svg>
  );
}
function CoachIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h4l4 4 4-4h4a2 2 0 002-2V4a2 2 0 00-2-2z" stroke={color} strokeWidth="1.9" strokeLinejoin="round"/>
      <path d="M8 9h8M8 13h5" stroke={color} strokeWidth="1.9" strokeLinecap="round"/>
    </svg>
  );
}
function ProfileIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.9"/>
      <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke={color} strokeWidth="1.9" strokeLinecap="round"/>
    </svg>
  );
}
