"use client";

import { useState } from "react";

export default function IcuSyncButton() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [detail, setDetail] = useState("");

  async function handleSync() {
    if (state === "loading") return;
    setState("loading");
    setDetail("");
    try {
      const res = await fetch("/api/m/resync-plan", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (res.ok && data.ok) {
        const pushed = data.pushed ?? 0;
        const errs = (data.errors ?? []).length;
        setState("success");
        setDetail(pushed > 0
          ? `${pushed} workout${pushed > 1 ? "s" : ""} pushed to ICU`
          : errs > 0
          ? `Synced — ${errs} error(s): ${data.errors[0]}`
          : "Already in sync");
      } else {
        setState("error");
        setDetail(data.error ?? "Unknown error");
      }
    } catch {
      setState("error");
      setDetail("Network error — try again");
    }
  }

  const colors = {
    idle:    { bg: "var(--m-card-inner)", border: "var(--m-border)", text: "var(--m-muted)", dot: "#22c55e" },
    loading: { bg: "var(--m-card-inner)", border: "var(--m-border)", text: "var(--m-muted)", dot: "#94a3b8" },
    success: { bg: "rgba(34,197,94,0.06)", border: "rgba(34,197,94,0.25)", text: "#22c55e", dot: "#22c55e" },
    error:   { bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.25)", text: "#ef4444", dot: "#ef4444" },
  }[state];

  return (
    <button
      onClick={handleSync}
      disabled={state === "loading"}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px",
        background: colors.bg,
        border: "none", borderBottom: `1px solid ${colors.border}`,
        cursor: state === "loading" ? "default" : "pointer",
        WebkitTapHighlightColor: "transparent",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* ICU icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: "rgba(13,148,136,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#0d9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 21, color: "var(--m-text)", fontWeight: 700 }}>
            {state === "loading" ? "Syncing…" : "Sync plan to ICU"}
          </div>
          <div style={{ fontSize: 16, color: colors.text, marginTop: 2, fontWeight: 500 }}>
            {state === "idle"    ? "Push this week's plan to Intervals.icu" :
             state === "loading" ? "Pushing workouts…" :
             detail}
          </div>
        </div>
      </div>
      {/* Right indicator */}
      <div style={{ flexShrink: 0 }}>
        {state === "loading" ? (
          <span style={{ fontSize: 20, color: "var(--m-muted)", animation: "spin 1s linear infinite", display: "inline-block" }}>↻
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </span>
        ) : state === "success" ? (
          <span style={{ fontSize: 20, color: "#22c55e" }}>✓</span>
        ) : state === "error" ? (
          <span style={{ fontSize: 20, color: "#ef4444" }}>✕</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="var(--m-muted-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </button>
  );
}
