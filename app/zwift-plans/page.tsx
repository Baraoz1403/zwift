"use client";
import { useState } from "react";

interface ProbeResult {
  path: string;
  status: number;
  ok: boolean;
  body: unknown;
}

export default function ZwiftPlansPage() {
  const [results, setResults] = useState<ProbeResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runProbe() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/zwift-plans");
      const data = await r.json();
      if (!r.ok || !Array.isArray(data)) {
        setError((data as { error?: string }).error ?? `HTTP ${r.status}`);
      } else {
        setResults(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 24px", fontFamily: "inherit" }}>
      <h1 style={{ fontSize: 20, marginBottom: 20 }}>Zwift API — Workout / Plan Endpoints</h1>
      <p style={{ fontSize: 13, color: "#5b6168", marginBottom: 16 }}>
        You must be <a href="/login" style={{ color: "#ff6600" }}>logged in</a> first. Then click below to probe Zwift&apos;s API for training plan endpoints.
      </p>
      <button
        onClick={runProbe}
        disabled={loading}
        style={{ padding: "10px 24px", background: "#ff6600", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", marginBottom: 24 }}
      >
        {loading ? "Probing..." : "Probe Zwift API"}
      </button>

      {error && (
        <div style={{ padding: 14, borderRadius: 10, background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", marginBottom: 16, fontSize: 13 }}>
          {error === "Not logged in" ? (
            <>Not logged in — <a href="/login" style={{ color: "#dc2626", fontWeight: 700 }}>log in here</a> first, then come back.</>
          ) : error}
        </div>
      )}

      {results && results.map(r => (
        <div key={r.path} style={{ marginBottom: 16, padding: 16, borderRadius: 10, border: "1px solid #e2e5e9", background: r.ok ? "#f0fdf4" : "#fafafa" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{r.path}</span>
            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: r.ok ? "#16a34a" : "#6b7280", color: "#fff" }}>
              {r.status}
            </span>
          </div>
          <pre style={{ margin: 0, fontSize: 11.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#334155" }}>
            {JSON.stringify(r.body, null, 2).slice(0, 2000)}
          </pre>
        </div>
      ))}
    </div>
  );
}
