"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    // Full reload — layout will see no session and show login screen
    window.location.href = "/m";
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        background: "transparent", border: "none",
        cursor: loading ? "default" : "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <span style={{ fontSize: 14, color: loading ? "#7f1d1d" : "#ef4444" }}>
        {loading ? "Signing out…" : "Sign out"}
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M9 18l6-6-6-6" stroke="#ef4444" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
