"use client";

/**
 * FeedbackBanner
 *
 * Shown when today's planned workout is detected as completed (ICU sync).
 * Two inputs:
 *   1. RPE 1–5 (effort score) — stored in rider fingerprint via /api/ai/session-feedback
 *   2. Free-text message to the coach — stored via /api/ai/coaching-note
 *
 * Both are submitted together. The AI reads both when generating next week's plan.
 *
 * The RPE 1–5 scale used here:
 *   1 = Very easy (could go much harder)
 *   2 = Easy / comfortable
 *   3 = Moderate — challenging but controlled
 *   4 = Hard — pushed to complete
 *   5 = Max / couldn't do more
 */

import { useState } from "react";

const ZO = "#F2541B";

const RPE_ITEMS = [
  { score: 1, label: "Very easy",  sub: "Could go much harder",   color: "#10b981", emoji: "😌" },
  { score: 2, label: "Easy",       sub: "Comfortable effort",      color: "#22c55e", emoji: "🙂" },
  { score: 3, label: "Moderate",   sub: "Challenging, controlled", color: "#eab308", emoji: "😤" },
  { score: 4, label: "Hard",       sub: "Pushed to complete",      color: "#f97316", emoji: "😓" },
  { score: 5, label: "Max effort", sub: "Nothing left",            color: "#ef4444", emoji: "🔥" },
];

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
  /** True when ICU confirms workout was completed. False = workout is planned (banner shows proactively). */
  completed?: boolean;
}

export default function FeedbackBanner({ workoutTitle, workoutCategory, date, avgHr, completed = false }: Props) {
  const [rpe, setRpe]           = useState<number | null>(null);
  const [note, setNote]         = useState("");
  const [state, setState]       = useState<"idle" | "sending" | "done">("idle");

  async function submit() {
    if (state !== "idle" || (!rpe && !note.trim())) return;
    setState("sending");

    const category = toCategory(workoutCategory);

    try {
      // Always save RPE to fingerprint if provided
      if (rpe !== null) {
        await fetch("/api/ai/session-feedback", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            workoutTitle,
            category,
            feelingScore: rpe,
            note: note.trim() || undefined,
          }),
        });
      }

      // Save free-text coaching note if provided
      if (note.trim()) {
        await fetch("/api/ai/coaching-note", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: `[${date} — ${workoutTitle}] ${note.trim()}`,
            date,
          }),
        });
      }

      setState("done");
    } catch {
      setState("idle");
    }
  }

  const chosenItem = RPE_ITEMS.find(r => r.score === rpe);

  if (state === "done") {
    return (
      <div style={{
        margin: "0 16px 16px",
        padding: "20px 20px",
        background: `${chosenItem?.color ?? "#22c55e"}10`,
        border: `1px solid ${chosenItem?.color ?? "#22c55e"}28`,
        borderRadius: 20,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ fontSize: 36 }}>{chosenItem?.emoji ?? "✓"}</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: chosenItem?.color ?? "#22c55e" }}>
            {rpe ? `RPE ${rpe}/5 — ${chosenItem?.label}` : "Feedback saved"}
          </div>
          <div style={{ fontSize: 14, color: "var(--m-muted)", marginTop: 3, lineHeight: 1.5 }}>
            Your coach will use this when building next week&apos;s plan.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: "0 16px 16px",
      padding: "22px 20px 20px",
      background: "var(--m-card)",
      border: "1px solid var(--m-border)",
      borderRadius: 22,
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "var(--m-text)", marginBottom: 4, letterSpacing: "-0.3px" }}>
            {completed ? "✓ Workout complete!" : "📝 Rate today's workout"}
          </div>
          <div style={{ fontSize: 14, color: "var(--m-muted)", lineHeight: 1.4 }}>
            {workoutTitle.length > 34 ? workoutTitle.slice(0, 32) + "…" : workoutTitle}
          </div>
        </div>
        {avgHr && avgHr > 0 && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.20)",
            borderRadius: 12, padding: "8px 14px", textAlign: "center", flexShrink: 0, marginLeft: 12,
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#ef4444", lineHeight: 1 }}>
              {Math.round(avgHr)}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(239,68,68,0.5)", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 2 }}>
              avg bpm
            </div>
          </div>
        )}
      </div>

      {/* RPE scale */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>
        How hard was it?
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {RPE_ITEMS.map(item => {
          const active = rpe === item.score;
          return (
            <button
              key={item.score}
              onClick={() => setRpe(rpe === item.score ? null : item.score)}
              disabled={state !== "idle"}
              style={{
                flex: 1,
                padding: "14px 6px 12px",
                background: active ? `${item.color}18` : "var(--m-card-inner)",
                border: `2px solid ${active ? item.color : "var(--m-border)"}`,
                borderRadius: 16,
                cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                transition: "all .14s",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ fontSize: 26, lineHeight: 1 }}>{item.emoji}</span>
              <span style={{
                fontSize: 18, fontWeight: 900,
                color: active ? item.color : "var(--m-text)",
                lineHeight: 1,
              }}>{item.score}</span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: active ? item.color : "var(--m-muted)",
                textAlign: "center", lineHeight: 1.2,
                textTransform: "uppercase", letterSpacing: ".04em",
              }}>
                {item.label.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expanded label */}
      {rpe && chosenItem && (
        <div style={{
          fontSize: 13, color: chosenItem.color, fontWeight: 600,
          background: `${chosenItem.color}10`, border: `1px solid ${chosenItem.color}22`,
          borderRadius: 10, padding: "8px 14px", marginBottom: 16,
          textAlign: "center",
        }}>
          {chosenItem.sub}
        </div>
      )}

      {/* Free-text to coach */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
        Message to your coach (optional)
      </div>
      <textarea
        rows={3}
        placeholder='e.g. "Legs were heavy from yesterday. Planning a vacation July 20–Aug 3. Knee was bothering me on the last interval."'
        value={note}
        onChange={e => setNote(e.target.value)}
        disabled={state !== "idle"}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "12px 14px",
          background: "var(--m-card-inner)",
          border: "1px solid var(--m-border)",
          borderRadius: 12,
          color: "var(--m-text)",
          fontSize: 14, fontFamily: "inherit", lineHeight: 1.55,
          resize: "none", outline: "none",
        }}
      />

      {/* Submit */}
      <button
        type="button"
        onClick={submit}
        disabled={state !== "idle" || (rpe === null && !note.trim())}
        style={{
          width: "100%", marginTop: 14,
          padding: "16px",
          background: (rpe || note.trim()) && state === "idle"
            ? `linear-gradient(135deg, ${ZO} 0%, #d94a14 100%)`
            : "var(--m-card-inner)",
          border: "none",
          borderRadius: 14,
          color: (rpe || note.trim()) && state === "idle" ? "#fff" : "var(--m-muted)",
          fontSize: 16, fontWeight: 800, cursor: (rpe || note.trim()) ? "pointer" : "default",
          fontFamily: "inherit",
          transition: "all .15s",
          letterSpacing: "-0.2px",
        }}
      >
        {state === "sending" ? "Saving…" : "Send to coach"}
      </button>

      <div style={{ fontSize: 12, color: "var(--m-muted)", textAlign: "center", marginTop: 10, lineHeight: 1.4 }}>
        Your coach reads this before building next week&apos;s plan
      </div>
    </div>
  );
}
