"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const TABS = [
  { href: "/m/today",       label: "Today",   Icon: TodayIcon   },
  { href: "/m/week",        label: "Week",    Icon: WeekIcon    },
  { href: "/m/coach",       label: "Coach",   Icon: CoachIcon   },
  { href: "/m/profile",     label: "Profile", Icon: ProfileIcon },
  { href: "/m/legal/terms", label: "Legal",   Icon: LegalIcon   },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      background: "var(--m-nav-bg)",
      borderTop: "1px solid var(--m-border)",
      display: "flex",
      alignItems: "stretch",
      zIndex: 100,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || (href === "/m/today" && pathname === "/m") ||
          (href === "/m/legal/terms" && pathname.startsWith("/m/legal"));
        const color = active ? "#F2541B" : "var(--m-nav-inactive)";
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
              height: 64,
              textDecoration: "none",
              gap: 3,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Icon color={color} />
            <span style={{
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              color,
              letterSpacing: ".2px",
            }}>
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function TodayIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <path d="M12 7v5l3 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WeekIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CoachIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h4l4 4 4-4h4a2 2 0 002-2V4a2 2 0 00-2-2z"
        stroke={color} strokeWidth="1.8" strokeLinejoin="round"
      />
      <path d="M8 9h8M8 13h5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.8" />
      <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LegalIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="13" x2="8" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="16" y1="17" x2="8" y2="17" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
