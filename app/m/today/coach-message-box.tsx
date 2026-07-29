"use client";

import { useState } from "react";

/**
 * CoachMessageBox — always-visible free-text message to coach.
 * Shown on every Today page variant (planned workout, rest day, bonus).
 * Sends to /api/ai/coaching-note. Single send per session (state resets on refresh).
 */
export default function CoachMessageBox({ date }: { date: string }) {
  const [text, setText]   = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  async function send() {
    if (!text.trim() || state !== "idle") return;
    setState("sending");
    try {
      await fetch("/api/ai/coaching-note", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text.trim(), date }),
      });
      setState("done");
    } catch {
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div style={{ margin: "0 16px 16px", padding: "14px 16px", background: "var(--m-card)", border: "1px solid var(--m-border)", borderRadius: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>✓ Message sent to coach</div>
      </div>
    );
  }

  return (
    <div style={{ margin: "0 16px 16px", padding: "14px 16px", background: "var(--m-card)", border: "1px solid var(--m-border)", borderRadius: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--m-muted)", marginBottom: 10 }}>
        Message your coach
      </div>
      <textarea
        rows={2}
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={state === "sending"}
        placeholder="e.g. Feeling tired, knee bothering me, want to change Thursday…"
        style={{
          width: "100%", boxSizing: "border-box", padding: "11px 13px",
          background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
          borderRadius: 4, color: "var(--m-text)", fontSize: 14, fontFamily: "inherit",
          lineHeight: 1.5, resize: "none", outline: "none",
        }}
      />
      <button
        onClick={send}
        disabled={!text.trim() || state === "sending"}
        style={{
          width: "100%", marginTop: 8, padding: "12px",
          background: text.trim() && state === "idle" ? "#FF5A1F" : "var(--m-card-inner)",
          border: "none", borderRadius: 4,
          color: text.trim() && state === "idle" ? "#fff" : "var(--m-muted)",
          fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {state === "sending" ? "Sending…" : "Send to coach"}
      </button>
    </div>
  );
}
