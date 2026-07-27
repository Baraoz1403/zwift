"use client";

import { useState, useEffect } from "react";

export function ThemeToggleButton({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    // Read the current theme from the shell wrapper (set server-side from cookie)
    const shell = document.querySelector("[data-mobile-shell]") as HTMLElement | null;
    const current = (shell?.getAttribute("data-mobile-theme") as "dark" | "light") || "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);

    // Instantly switch the shell attribute — all CSS vars cascade immediately
    const shell = document.querySelector("[data-mobile-shell]") as HTMLElement | null;
    if (shell) shell.setAttribute("data-mobile-theme", next);

    // Also sync the body background (visible on iOS overscroll)
    document.body.style.backgroundColor = next === "light" ? "#f0f4f8" : "#0a0f1a";

    // Persist for 30 days
    document.cookie = `mobileTheme=${next}; path=/; max-age=2592000; SameSite=Lax`;
  };

  const isLight = theme === "light";

  // Compact mode: small icon-only button (used in Today hero)
  if (compact) {
    return (
      <button
        onClick={toggle}
        title={isLight ? "Switch to dark mode" : "Switch to light mode"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 8,
          border: "1px solid var(--m-border)",
          background: "var(--m-card-inner)",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--m-muted)" strokeWidth="1.8" strokeLinecap="round">
          {isLight
            ? <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            : <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>}
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "16px 18px",
        background: "none",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div>
        <div style={{ fontSize: 18, color: "var(--m-text)", fontWeight: 700 }}>
          {isLight ? "Dark mode" : "Light mode"}
        </div>
        <div style={{ fontSize: 15, color: "var(--m-muted)", marginTop: 3 }}>
          {isLight ? "Switch to dark appearance" : "Switch to light appearance"}
        </div>
      </div>
      <div style={{
        width: 44, height: 26, borderRadius: 13, position: "relative",
        background: isLight ? "#F2541B" : "#334155",
        transition: "background 0.2s",
        flexShrink: 0,
      }}>
        <div style={{
          position: "absolute",
          top: 3, left: isLight ? 21 : 3,
          width: 20, height: 20, borderRadius: "50%",
          background: "#ffffff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
    </button>
  );
}
