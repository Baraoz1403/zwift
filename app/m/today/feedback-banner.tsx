"use client";

/**
 * FeedbackBanner — post-workout feedback collector.
 *
 * Flow:
 *   1. "Did you follow today's plan?" → Yes / Mostly / Different
 *   2. If Different → deviation form (what + why)
 *   3. RPE 1–5 + free-text note
 *   4. Submit → stores to fingerprint + coaching note
 *
 * Deviation data is structured so the AI can detect patterns
 * (athlete keeps skipping structured work → plan needs more variety).
 */

import { useState } from "react";

const ZO = "#F2541B";

const RPE_ITEMS = [
  { score: 1, label: "Easy",     sub: "Could go much harder",   color: "#10b981", emoji: "😌" },
  { score: 2, label: "Light",    sub: "Comfortable effort",      color: "#22c55e", emoji: "🙂" },
  { score: 3, label: "Moderate", sub: "Challenging, controlled", color: "#eab308", emoji: "😤" },
  { score: 4, label: "Hard",     sub: "Pushed to complete",      color: "#f97316", emoji: "😓" },
  { score: 5, label: "Max",      sub: "Nothing left",            color: "#ef4444", emoji: "🔥" },
];

const DEVIATION_REASONS = [
  { id: "too_hard",   label: "Too hard for today" },
  { id: "too_easy",   label: "Too easy / boring"  },
  { id: "no_time",    label: "Not enough time"    },
  { id: "preferred",  label: "Preferred something else" },
  { id: "outside",    label: "Went outside instead" },
  { id: "other",      label: "Other reason"        },
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

type Step = "plan-check" | "deviation" | "rate" | "done";

interface Props {
  workoutTitle: string;
  workoutCategory: string;
  date: string;
  avgHr?: number | null;
  completed?: boolean;
  plannedDurationMin?: number;
  /** From Intervals.icu — the actual activity logged today */
  actualActivityName?: string | null;
  actualDurationMin?: number | null;
}

export default function FeedbackBanner({
  workoutTitle, workoutCategory, date, avgHr,
  plannedDurationMin, actualActivityName, actualDurationMin,
}: Props) {
  const [step, setStep] = useState<Step>("plan-check");
  const [followed, setFollowed] = useState<"yes" | "mostly" | "different" | null>(null);

  // Deviation fields
  const [actualDesc, setActualDesc] = useState(actualActivityName ?? "");
  const [deviationReason, setDeviationReason] = useState<string | null>(null);

  // Feedback fields
  const [rpe, setRpe]     = useState<number | null>(null);
  const [note, setNote]   = useState("");
  const [state, setState] = useState<"idle" | "sending">("idle");

  async function submit() {
    if (state !== "idle") return;
    setState("sending");
    const category = toCategory(workoutCategory);

    try {
      // RPE to fingerprint
      if (rpe !== null) {
        await fetch("/api/ai/session-feedback", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, workoutTitle, category, feelingScore: rpe, note: note.trim() || undefined }),
        });
      }

      // Build coaching note — richer when a deviation occurred
      let coachNote = "";
      if (followed === "different") {
        const reasonLabel = DEVIATION_REASONS.find(r => r.id === deviationReason)?.label ?? deviationReason ?? "";
        const plannedStr  = `${workoutTitle}${plannedDurationMin ? ` (${plannedDurationMin} min)` : ""}`;
        const actualStr   = `${actualDesc || "different session"}${actualDurationMin ? ` (${actualDurationMin} min)` : ""}`;
        coachNote = `[PLAN DEVIATION]\nPlanned: ${plannedStr}\nActual: ${actualStr}\nReason: ${reasonLabel}${rpe ? `\nRPE: ${rpe}/5` : ""}${note.trim() ? `\nNote: ${note.trim()}` : ""}`;
      } else if (followed === "mostly") {
        coachNote = `[PARTIAL — mostly followed plan]\n${workoutTitle}${rpe ? ` — RPE ${rpe}/5` : ""}${note.trim() ? `\n${note.trim()}` : ""}`;
      } else if (note.trim()) {
        coachNote = `[${workoutTitle}] ${note.trim()}`;
      }

      if (coachNote) {
        await fetch("/api/ai/coaching-note", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: coachNote, date }),
        });
      }

      setStep("done");
    } catch {
      setState("idle");
    }
  }

  const chosenItem = RPE_ITEMS.find(r => r.score === rpe);

  // ── DONE ─────────────────────────────────────────────────────────────────
  if (step === "done") {
    const isDeviation = followed === "different";
    const accent = isDeviation ? "#f59e0b" : (chosenItem?.color ?? "#22c55e");
    return (
      <div style={{
        margin: "0 16px 16px",
        padding: "20px",
        background: `${accent}10`,
        border: `1px solid ${accent}28`,
        borderRadius: 16,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ fontSize: 32 }}>{isDeviation ? "📝" : (chosenItem?.emoji ?? "✓")}</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: accent }}>
            {isDeviation ? "Deviation noted" : rpe ? `RPE ${rpe}/5 — ${chosenItem?.label}` : "Feedback saved"}
          </div>
          <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 3, lineHeight: 1.5 }}>
            {isDeviation
              ? "Your coach will factor this into the plan — more variety coming."
              : "Your coach reads this before building next week's plan."}
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 1: Did you follow the plan? ─────────────────────────────────────
  if (step === "plan-check") {
    return (
      <div style={{
        margin: "0 16px 16px",
        padding: "22px 20px 20px",
        background: "var(--m-card)",
        border: "1px solid var(--m-border)",
        borderRadius: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "var(--m-text)", marginBottom: 4, letterSpacing: "-0.3px" }}>
          ✓ Activity logged!
        </div>
        <div style={{ fontSize: 14, color: "var(--m-muted)", marginBottom: 18, lineHeight: 1.4 }}>
          Did you follow today&apos;s plan?
          <span style={{ display: "block", fontSize: 13, fontStyle: "italic", marginTop: 2, color: "var(--m-muted)" }}>
            {workoutTitle.length > 40 ? workoutTitle.slice(0, 38) + "…" : workoutTitle}
            {plannedDurationMin ? ` · ${plannedDurationMin} min` : ""}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { id: "yes",       label: "Yes, I followed it",           sub: "",               color: "#22c55e" },
            { id: "mostly",    label: "Mostly — with some adjustments", sub: "",               color: "#f59e0b" },
            { id: "different", label: "I did something different",     sub: actualActivityName ? `Logged: "${actualActivityName}"` : "", color: "#f97316" },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => {
                setFollowed(opt.id as "yes" | "mostly" | "different");
                if (opt.id === "different") setStep("deviation");
                else setStep("rate");
              }}
              style={{
                padding: "14px 16px", borderRadius: 10,
                background: "var(--m-card-inner)",
                border: `1.5px solid var(--m-border)`,
                cursor: "pointer", textAlign: "left",
                fontFamily: "inherit",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: opt.color }}>{opt.label}</div>
              {opt.sub && (
                <div style={{ fontSize: 12, color: "var(--m-muted)", marginTop: 2 }}>{opt.sub}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── STEP 2: Deviation detail ──────────────────────────────────────────────
  if (step === "deviation") {
    return (
      <div style={{
        margin: "0 16px 16px",
        padding: "22px 20px 20px",
        background: "var(--m-card)",
        border: "1px solid var(--m-border)",
        borderRadius: 16,
      }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: "var(--m-text)", marginBottom: 4 }}>
          What did you do instead?
        </div>
        <div style={{ fontSize: 13, color: "var(--m-muted)", marginBottom: 14 }}>
          Your coach adapts next week when you ride your own way.
        </div>

        <input
          type="text"
          value={actualDesc}
          onChange={e => setActualDesc(e.target.value)}
          placeholder="e.g. 2h outdoor ride, group ride, Zwift race…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "12px 14px", borderRadius: 10,
            background: "var(--m-card-inner)",
            border: "1px solid var(--m-border)",
            color: "var(--m-text)", fontSize: 15, fontFamily: "inherit",
            outline: "none", marginBottom: 16,
          }}
        />

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
          Why did you change it?
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 20 }}>
          {DEVIATION_REASONS.map(r => {
            const active = deviationReason === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setDeviationReason(active ? null : r.id)}
                style={{
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  background: active ? "rgba(249,115,22,0.12)" : "var(--m-card-inner)",
                  border: `1.5px solid ${active ? "#f97316" : "var(--m-border)"}`,
                  color: active ? "#f97316" : "var(--m-muted)",
                  WebkitTapHighlightColor: "transparent",
                }}
              >{r.label}</button>
            );
          })}
        </div>

        <button
          onClick={() => setStep("rate")}
          disabled={!actualDesc.trim()}
          style={{
            width: "100%", padding: "15px", borderRadius: 12, border: "none",
            background: actualDesc.trim() ? ZO : "var(--m-card-inner)",
            color: actualDesc.trim() ? "#fff" : "var(--m-muted)",
            fontSize: 15, fontWeight: 700, cursor: actualDesc.trim() ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          Continue →
        </button>
      </div>
    );
  }

  // ── STEP 3: RPE + note ───────────────────────────────────────────────────
  return (
    <div style={{
      margin: "0 16px 16px",
      padding: "22px 20px 20px",
      background: "var(--m-card)",
      border: "1px solid var(--m-border)",
      borderRadius: 16,
    }}>
      {/* Context reminder */}
      {followed === "different" && (
        <div style={{
          fontSize: 13, color: "#f97316", background: "rgba(249,115,22,0.08)",
          border: "1px solid rgba(249,115,22,0.2)",
          borderRadius: 8, padding: "8px 12px", marginBottom: 16,
          fontWeight: 600,
        }}>
          Rating: {actualDesc || "your session"}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--m-text)", letterSpacing: "-0.3px" }}>
          How hard was it?
        </div>
        {avgHr && avgHr > 0 && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10, padding: "6px 12px", textAlign: "center", flexShrink: 0,
          }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#ef4444", lineHeight: 1 }}>{Math.round(avgHr)}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(239,68,68,0.5)", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 1 }}>bpm</div>
          </div>
        )}
      </div>

      {/* RPE scale */}
      <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
        {RPE_ITEMS.map(item => {
          const active = rpe === item.score;
          return (
            <button
              key={item.score}
              onClick={() => setRpe(rpe === item.score ? null : item.score)}
              disabled={state !== "idle"}
              style={{
                flex: 1, padding: "13px 4px 10px",
                background: active ? `${item.color}18` : "var(--m-card-inner)",
                border: `2px solid ${active ? item.color : "var(--m-border)"}`,
                borderRadius: 12, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>{item.emoji}</span>
              <span style={{ fontSize: 17, fontWeight: 900, color: active ? item.color : "var(--m-text)", lineHeight: 1 }}>{item.score}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: active ? item.color : "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "center", lineHeight: 1.2 }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {rpe && chosenItem && (
        <div style={{
          fontSize: 13, color: chosenItem.color, fontWeight: 600,
          background: `${chosenItem.color}10`, border: `1px solid ${chosenItem.color}22`,
          borderRadius: 8, padding: "7px 12px", marginBottom: 14, textAlign: "center",
        }}>
          {chosenItem.sub}
        </div>
      )}

      {/* Note */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>
        Message to your coach (optional)
      </div>
      <textarea
        rows={2}
        placeholder='e.g. "Legs were heavy. Knee slightly off. Loved the pace."'
        value={note}
        onChange={e => setNote(e.target.value)}
        disabled={state !== "idle"}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "11px 13px",
          background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
          borderRadius: 10, color: "var(--m-text)",
          fontSize: 14, fontFamily: "inherit", lineHeight: 1.5,
          resize: "none", outline: "none",
        }}
      />

      <button
        type="button"
        onClick={submit}
        disabled={state !== "idle" || (rpe === null && !note.trim() && !followed)}
        style={{
          width: "100%", marginTop: 12, padding: "15px",
          background: (rpe !== null || note.trim() || followed) && state === "idle"
            ? `linear-gradient(135deg, ${ZO} 0%, #d94a14 100%)`
            : "var(--m-card-inner)",
          border: "none", borderRadius: 12,
          color: (rpe !== null || note.trim() || followed) && state === "idle" ? "#fff" : "var(--m-muted)",
          fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {state === "sending" ? "Saving…" : "Send to coach"}
      </button>

      <div style={{ fontSize: 12, color: "var(--m-muted)", textAlign: "center", marginTop: 8, lineHeight: 1.4 }}>
        Your coach reads this before building next week&apos;s plan
      </div>
    </div>
  );
}
