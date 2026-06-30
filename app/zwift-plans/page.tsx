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
  const [loading, setLoading] = useState(false);

  async function runProbe() {
    setLoading(true);
    try {
      const r = await fetch("/api/zwift-plans");
      setResults(await r.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 24px", fontFamily: "inherit" }}>
      <h1 style={{ fontSize: 20, marginBottom: 20 }}>Zwift API — Workout / Plan Endpoints</h1>
      <button
        onClick={runProbe}
        disabled={loading}
        style={{ padding: "10px 24px", background: "#ff6600", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", marginBottom: 24 }}
      >
        {loading ? "Probing..." : "Probe Zwift API"}
      </button>

      {results && results.map(r => (
        <div key={r.path} style={{ marginBottom: 16, padding: 16, borderRadius: 10, border: "1px solid #e2e5e9", background: r.ok ? "#f0fdf4" : "#fafafa" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{r.path}</span>
            <span style={{
              padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: r.ok ? "#16a34a" : "#6b7280", color: "#fff"
            }}>{r.status}</span>
          </div>
          <pre style={{ margin: 0, fontSize: 11.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#334155" }}>
            {JSON.stringify(r.body, null, 2).slice(0, 2000)}
          </pre>
        </div>
      ))}
    </div>
  );
}
