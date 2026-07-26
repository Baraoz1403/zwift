"use client";

/**
 * FeedbackBanner
 *
 * Shown when today's planned workout is detected as completed (ICU activity sync).
 * The rider taps one of four quick ratings → the choice is sent as a coaching note
 * that the AI will factor in when generating the next weekly plan.
 */

import { useState } from "react";

const RATINGS = [
  { emoji: "🔥", label: "Crushed it",  color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.3)"  },
  { emoji: "😊", label: "Felt good",   color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.3)"   },
  { emoji: "😓", label: "Tough day",   color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)"  },
  { emoji: "💤", label: "Too tired",   color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)"   },
];

interface Props {
  workoutTitle: string;
  date: string;
}

export default function FeedbackBanner({ workoutTitle, date }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [chosen, setChosen] = useState<string | null>(null);

  async function submit(rating: string) {
    if (state !== "idle") return;
    setChosen(rating);
    setState("sending");
    try {
      await fetch("/api/ai/coaching-note", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: `Post-workout feedback for "${workoutTitle}": ${rating}`,
          date,
        }),
      });
      setState("done");
    } catch {
      setState("idle");
      setChosen(null);
    }
  }

  if (state === "done") {
    const picked = RATINGS.find(r => r.label === chosen);
    return (
      <div style={{
        margin: "0 16px 14px",
        padding: "16px 18px",
        background: "rgba(34,197,94,0.07)",
        border: "1px solid rgba(34,197,94,0.2)",
        borderRadius: 18,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{ fontSize: 30 }}>{picked?.emoji ?? "✓"}</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>Thanks!</div>
          <div style={{ fontSize: 14, color: "#475569", marginTop: 2 }}>
            Your coach will use this when building next week&apos;s plan.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: "0 16px 14px",
      padding: "18px 18px 16px",
      background: "#111827",
      border: "1px solid rgba(34,197,94,0.2)",
      borderRadius: 18,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
        ✓ Workout complete!
      </div>
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 14 }}>
        How did{" "}
        <span style={{ color: "#94a3b8", fontWeight: 500 }}>
          {workoutTitle.length > 28 ? workoutTitle.slice(0, 26) + "…" : workoutTitle}
        </span>{" "}
        feel?
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {RATINGS.map(r => (
          <button
            key={r.label}
            onClick={() => submit(r.label)}
            disabled={state === "sending"}
            style={{
              padding: "12px 10px",
              background: chosen === r.label ? r.bg : "#0f172a",
              border: `1px solid ${chosen === r.label ? r.border : "#1e293b"}`,
              borderRadius: 14,
              cursor: state === "idle" ? "pointer" : "default",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              transition: "all .15s",
            }}
          >
            <span style={{ fontSize: 24 }}>{r.emoji}</span>
            <span style={{
              fontSize: 14, fontWeight: 600,
              color: chosen === r.label ? r.color : "#64748b",
            }}>
              {r.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
