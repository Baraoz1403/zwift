"use client";

import { useEffect, useRef, useState } from "react";
import { IconBolt } from "./icons";

// Rotation of the app's existing colorful icon-badge classes (see
// .stat-card-icon.c-* in globals.css - the same palette used on the header
// stat cards and record grid) for the numbered insight markers below. Blue
// is deliberately skipped - the rider asked for these markers to read as
// their own distinct thing, not another blue accent dot like the rest of
// the dashboard uses.
const INSIGHT_MARKER_COLORS = ["c-teal", "c-purple", "c-amber", "c-pink", "c-green"];

// Reusable toggle pill — same visual language as the AI signal cards
function TogglePill({ open, onToggle, label }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 14px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "rgba(47,143,224,0.05)",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--accent)",
        cursor: "pointer",
        letterSpacing: "0.01em",
        transition: "background 0.15s",
      }}
    >
      {label ?? (open ? "Hide" : "Show")}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
      >
        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function AiInsights() {
  const [visible, setVisible]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Text panel closed by default — opens automatically when user triggers analysis
  const [textOpen, setTextOpen] = useState(false);

  const loadingRef = useRef(loading);
  const textRef = useRef(text);
  useEffect(() => {
    loadingRef.current = loading;
    textRef.current = text;
  }, [loading, text]);

  // Header button event: open the text panel and fetch if needed
  useEffect(() => {
    const handler = () => {
      setVisible(true);
      setTextOpen(true);
      if (!loadingRef.current && !textRef.current) {
        handleClick(true);
      }
    };
    window.addEventListener("open-ai-insights", handler);
    return () => window.removeEventListener("open-ai-insights", handler);
  }, []);

  // Background pre-fetch on mount — does NOT auto-open the panel
  useEffect(() => {
    if (!loadingRef.current && !textRef.current) {
      handleClick(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClick(openPanel = true) {
    if (openPanel) setTextOpen(true);
    setLoading(true);
    setError(null);
    setText(null);
    try {
      const res = await fetch("/api/ai/insights", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setText(data.insight);
      } else {
        setError(data.error ?? "Could not generate insights.");
      }
    } catch {
      setError("Network error reaching the server.");
    } finally {
      setLoading(false);
    }
  }

  const hasContent = !!(text || error || loading);

  if (!visible) return null;

  return (
    <div style={{ marginTop: 24 }}>
      {/* Section header — always visible */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>
          <IconBolt size={14} /> AI Insights
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="btn"
            style={{ width: "auto", padding: "7px 18px", fontSize: 13 }}
            onClick={() => handleClick(true)}
            disabled={loading}
          >
            {loading ? "Analyzing…" : text ? "Re-analyze" : "Get AI insights"}
          </button>
          {hasContent && (
            <TogglePill open={textOpen} onToggle={() => setTextOpen(v => !v)} />
          )}
        </div>
      </div>

      {/* Collapsible content */}
      {textOpen && (
        <>
          {error && (
            <div className="notice" style={{ marginTop: 4 }}>
              {error}
            </div>
          )}
          {loading && (
            <div className="notice" style={{ marginTop: 4, color: "var(--muted)", fontStyle: "italic" }}>
              Analyzing your recent training…
            </div>
          )}
          {text && !loading && (
            <ul
              className="notice"
              style={{
                marginTop: 4,
                marginBottom: 0,
                // Rider asked for the markers moved further right - more
                // breathing room off the box's own left edge than the
                // earlier 6px indent gave it.
                paddingLeft: 16,
                listStyle: "none",
                color: "var(--text)",
                lineHeight: 1.55,
              }}
            >
              {text
                .split("\n")
                .map(line => line.trim())
                // Strip a leading bullet/dash/number if the model added one
                // anyway despite the prompt asking it not to - keeps the
                // rendered marker consistent either way.
                .map(line => line.replace(/^[-•*]\s+|^\d+[.)]\s+/, ""))
                .filter(Boolean)
                .slice(0, 5)
                .map((line, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: i === 0 ? 0 : "9px 0 0",
                    }}
                  >
                    {/* Bold numbered marker cycling through the app's own
                        colorful icon-badge palette (same .stat-card-icon
                        c-* gradient classes as the header stat cards and
                        record grid) - reads as a deliberate, modern design
                        element instead of a plain grey bullet, with no new
                        hardcoded color added to this component. */}
                    <span
                      className={`stat-card-icon ${INSIGHT_MARKER_COLORS[i % INSIGHT_MARKER_COLORS.length]}`}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
