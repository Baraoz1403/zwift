"use client";

import { useEffect, useRef, useState } from "react";
import { IconBolt } from "./icons";

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
            <div
              className="notice"
              style={{
                marginTop: 4,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
                textAlign: "justify",
                lineHeight: 1.6,
              }}
            >
              {text}
            </div>
          )}
        </>
      )}
    </div>
  );
}
