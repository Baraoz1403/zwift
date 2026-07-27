"use client";

/**
 * FeedbackBanner
 *
 * Shown when today's planned workout is detected as completed (ICU activity sync).
 * The rider rates their session on an RPE 1–10 scale (Borg CR10 adapted):
 *   1–2  = very easy / easy
 *   3–4  = moderate
 *   5–6  = somewhat hard / hard
 *   7–8  = very hard
 *   9–10 = maximal
 *
 * The score is stored via /api/ai/session-feedback → rider fingerprint in KV.
 * Future plans are personalised based on this accumulated history.
 *
 * FIX (was sending to /api/ai/coaching-note as raw text — fingerprint never updated):
 * Now calls /api/ai/session-feedback with { date, workoutTitle, category, feelingScore }
 * where feelingScore maps RPE 1–10 → internal 1–5 scale.
 */

import { useState } from "react";

const ZO = "#F2541B";
const ZB = "#009CDF";

// RPE 1–10 (Borg CR10): label + mapped 1–5 feeling score for fingerprint
const RPE_ITEMS = [
  { rpe: 1,  label: "Very easy",    feel: 5, color: "#10b981" },
  { rpe: 2,  label: "Easy",         feel: 5, color: "#22c55e" },
  { rpe: 3,  label: "Moderate",     feel: 4, color: "#84cc16" },
  { rpe: 4,  label: "Moderate+",    feel: 4, color: "#a3e635" },
  { rpe: 5,  label: "Somewhat hard",feel: 3, color: "#eab308" },
  { rpe: 6,  label: "Hard",         feel: 3, color: "#f59e0b" },
  { rpe: 7,  label: "Very hard",    feel: 2, color: "#f97316" },
  { rpe: 8,  label: "Very hard+",   feel: 2, color: "#ef4444" },
  { rpe: 9,  label: "Extreme",      feel: 1, color: "#dc2626" },
  { rpe: 10, label: "Max effort",   feel: 1, color: "#991b1b" },
];

// Map workout type to canonical category (matches fingerprint categories)
function toCategory(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("sweet") || t.includes("sweetspot")) return "Sweet Spot";
  if (t.includes("threshold") || t.includes("ftp"))   return "Threshold";
  if (t.includes("vo2") || t.includes("norwegian"))   return "VO2max";
  if (t.includes("tempo"))                             return "Tempo";
  if (t.includes("sprint") || t.includes("neuro"))    return "Neuromuscular";
  if (t.includes("endurance") || t.includes("z2"))    return "Endurance";
  if (t.includes("recovery"))                         return "Recovery";
  return type || "Structured";
}

interface Props {
  workoutTitle: string;
  workoutCategory: string;
  date: string;
  avgHr?: number | null;
}

export default function FeedbackBanner({ workoutTitle, workoutCategory, date, avgHr }: Props) {
  const [state, setState]   = useState<"idle" | "sending" | "done">("idle");
  const [chosen, setChosen] = useState<number | null>(null);   // chosen RPE

  async function submit(rpe: number) {
    if (state !== "idle") return;
    setChosen(rpe);
    setState("sending");

    const item = RPE_ITEMS.find(r => r.rpe === rpe)!;
    const category = toCategory(workoutCategory);

    try {
      const res = await fetch("/api/ai/session-feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          workoutTitle,
          category,
          feelingScore: item.feel,   // 1–5 internal scale
          note: `RPE ${rpe}/10 — ${item.label}`,
        }),
      });

      if (!res.ok) throw new Error("save failed");
      setState("done");
    } catch {
      setState("idle");
      setChosen(null);
    }
  }

  const chosenItem = RPE_ITEMS.find(r => r.rpe === chosen);

  if (state === "done") {
    return (
      <div style={{
        margin: "0 16px 14px",
        padding: "18px 20px",
        background: `${chosenItem?.color ?? "#22c55e"}12`,
        border: `1px solid ${chosenItem?.color ?? "#22c55e"}30`,
        borderRadius: 20,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: `${chosenItem?.color ?? "#22c55e"}20`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 900, color: chosenItem?.color ?? "#22c55e",
        }}>{chosen}</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: chosenItem?.color ?? "#22c55e" }}>
            RPE {chosen}/10 — {chosenItem?.label}
          </div>
          <div style={{ fontSize: 14, color: "var(--m-muted)", marginTop: 3 }}>
            Logged. Your coach will factor this in for next week.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: "0 16px 16px",
      padding: "20px 18px 18px",
      background: "var(--m-card)",
      border: "1px solid var(--m-border)",
      borderRadius: 20,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--m-text)", marginBottom: 3 }}>
            ✓ Workout complete!
          </div>
          <div style={{ fontSize: 13, color: "var(--m-muted)" }}>
            {workoutTitle.length > 32 ? workoutTitle.slice(0, 30) + "…" : workoutTitle}
          </div>
        </div>
        {avgHr && avgHr > 0 && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.22)",
            borderRadius: 10, padding: "6px 12px", textAlign: "center", flexShrink: 0,
          }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ef4444", lineHeight: 1 }}>
              {Math.round(avgHr)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(239,68,68,0.55)", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 2 }}>
              avg bpm
            </div>
          </div>
        )}
      </div>

      {/* RPE label */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
        How hard was it? (RPE 1–10)
      </div>

      {/* RPE grid — 2 rows × 5 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {RPE_ITEMS.map(item => {
          const isChosen = chosen === item.rpe;
          return (
            <button
              key={item.rpe}
              onClick={() => submit(item.rpe)}
              disabled={state !== "idle"}
              title={item.label}
              style={{
                padding: "10px 4px",
                background: isChosen ? `${item.color}20` : "var(--m-card-inner)",
                border: `1.5px solid ${isChosen ? item.color : "var(--m-border)"}`,
                borderRadius: 12,
                cursor: state === "idle" ? "pointer" : "default",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                transition: "all .12s",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{
                fontSize: 18, fontWeight: 900,
                color: isChosen ? item.color : "var(--m-text)",
                lineHeight: 1,
              }}>
                {item.rpe}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: isChosen ? item.color : "var(--m-muted)",
                textAlign: "center", lineHeight: 1.2,
                textTransform: "uppercase", letterSpacing: ".04em",
              }}>
                {item.label.split(" ").slice(0, 2).join(" ")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Zone legend */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--m-border)" }}>
        {[
          { label: "Easy", color: "#22c55e" },
          { label: "Moderate", color: "#eab308" },
          { label: "Hard", color: "#f97316" },
          { label: "Max", color: "#991b1b" },
        ].map(z => (
          <div key={z.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: z.color }} />
            <span style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 500 }}>{z.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
