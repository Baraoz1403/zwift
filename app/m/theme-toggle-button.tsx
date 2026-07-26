"use client";

import { useState, useEffect } from "react";

export function ThemeToggleButton() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // Read the current theme from the shell wrapper (set server-side from cookie)
    const shell = document.querySelector("[data-mobile-shell]") as HTMLElement | null;
    const current = (shell?.getAttribute("data-mobile-theme") as "dark" | "light") || "dark";
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
