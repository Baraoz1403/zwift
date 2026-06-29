"use client";

import { useEffect, useRef, useState } from "react";

export default function AiInsights() {
  // Open by default (the user wants this visible without an extra click),
  // with a close button to collapse it - and a small "AI Insights" bar left
  // behind when collapsed so it's still easy to reopen.
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mirrors of loading/text for the event handler below to read without
  // needing them in its effect's dependency array (a changing-length deps
  // array on the same useEffect call across renders is what React was
  // warning about - this keeps that array permanently empty).
  const loadingRef = useRef(loading);
  const textRef = useRef(text);
  useEffect(() => {
    loadingRef.current = loading;
    textRef.current = text;
  }, [loading, text]);

  // The header's AI Insights button (ai-insights-link.tsx) dispatches this
  // event on every click. Landing here should show the actual analysis text
  // already readable, not just an open panel with a "Get insights" button
  // still waiting to be pressed - so this also kicks off the fetch
  // automatically (once; it won't re-fetch on every click if we already
  // have a result, only retries if there was no result yet or it errored).
  useEffect(() => {
    const handler = () => {
      setOpen(true);
      if (!loadingRef.current && !textRef.current) {
        handleClick();
      }
    };
    window.addEventListener("open-ai-insights", handler);
    return () => window.removeEventListener("open-ai-insights", handler);
  }, []);

  // Kick the analysis off as soon as the dashboard itself loads, instead of
  // waiting for the header button to be clicked - clicking "AI Insights"
  // used to be the moment the request started, so it always felt like a
  // dead pause ("the system starts thinking"). Starting it in the
  // background on mount means it's usually already done (or close to it) by
  // the time anyone actually looks at the panel.
  useEffect(() => {
    if (!loadingRef.current && !textRef.current) {
      handleClick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClick() {
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

  if (!open) {
    return (
      <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>AI Insights</h2>
        <button
          type="button"
          className="btn-secondary btn"
          style={{ width: "auto", padding: "6px 14px" }}
          onClick={() => setOpen(true)}
        >
          Show
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>AI Insights</h2>
        <button
          type="button"
          className="btn-secondary btn"
          style={{ width: "auto", padding: "6px 14px" }}
          onClick={() => setOpen(false)}
          aria-label="Close AI Insights"
        >
          ✕ Close
        </button>
      </div>

      <button
        className="btn"
        style={{ width: "auto", padding: "10px 20px" }}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? "Analyzing..." : "Get AI insights on my recent training"}
      </button>

      {error && (
        <div className="notice" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {text && (
        <div
          className="notice"
          style={{
            marginTop: 12,
            color: "var(--text)",
            whiteSpace: "pre-wrap",
            textAlign: "justify",
            lineHeight: 1.6,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
