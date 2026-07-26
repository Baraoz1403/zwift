"use client";

import { useState } from "react";

export default function NoPlanScreen() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function generate() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setState("done");
        setMsg("Plan ready! Loading…");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setState("error");
        setMsg(data.error ?? "Something went wrong");
      }
    } catch {
      setState("error");
      setMsg("Network error — try again");
    }
  }

  return (
    <div style={{ padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 52, marginBottom: 18 }}>📋</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>
        No plan yet
      </div>
      <div style={{ fontSize: 15, color: "#64748b", lineHeight: 1.65, marginBottom: 28 }}>
        Generate your personalized weekly training plan based on your last 30 Zwift rides.
      </div>

      <button
        onClick={generate}
        disabled={state === "loading" || state === "done"}
        style={{
          width: "100%", padding: "18px",
          background:
            state === "done"    ? "#166534" :
            state === "error"   ? "#7f1d1d" :
            state === "loading" ? "#1d4ed8aa" : "#2563eb",
          color: "#fff", border: "none", borderRadius: 18,
          fontSize: 17, fontWeight: 700,
          cursor: state === "loading" || state === "done" ? "default" : "pointer",
          boxShadow: state === "idle" ? "0 4px 20px #2563eb40" : "none",
          transition: "background .2s",
        }}
      >
        {state === "idle"    ? "Generate my plan" :
         state === "loading" ? "Generating — this may take a minute…" :
         state === "done"    ? "✓ Plan ready!" : "Try again"}
      </button>

      {msg && (
        <div style={{
          marginTop: 14, fontSize: 14,
          color: state === "error" ? "#f87171" : "#4ade80",
          lineHeight: 1.5,
        }}>
          {msg}
        </div>
      )}

      {state === "loading" && (
        <div style={{ marginTop: 20, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
          Analyzing your rides, computing training load, and building a personalized plan…
        </div>
      )}
    </div>
  );
}
