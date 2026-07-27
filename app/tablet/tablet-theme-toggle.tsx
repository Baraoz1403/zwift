"use client";

import { useState, useEffect } from "react";

export function TabletThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const saved = document.cookie.split(";").find(c => c.trim().startsWith("mobileTheme="));
    setTheme(saved?.includes("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.cookie = `mobileTheme=${next}; path=/; max-age=31536000`;
    const shell = document.querySelector("[data-mobile-shell]");
    if (shell) shell.setAttribute("data-mobile-theme", next);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 12px", borderRadius: 4,
        border: "1px solid var(--m-border)",
        background: "transparent", cursor: "pointer",
        fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--m-muted)" strokeWidth="1.8" strokeLinecap="round">
        {isDark
          ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
          : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}
      </svg>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--m-muted)" }}>
        {isDark ? "Light" : "Dark"}
      </span>
    </button>
  );
}
