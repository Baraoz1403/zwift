"use client";

/**
 * MobileIcuConnect — Step 2 of onboarding.
 *
 * Single connection method: personal API key from intervals.icu.
 * No OAuth, no redirects, no token expiry. The athlete copies their key
 * once and that's it — works forever.
 */

import { useState, FormEvent } from "react";

export default function MobileIcuConnect() {
  const [apiKey, setApiKey]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch("/api/intervals/connect-apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Connection failed. Check your API key.");
        setLoading(false);
        return;
      }
      // Cookie is now set — reload to pass the ICU gate
      window.location.href = "/m/today";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#f5f7fa",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      <div style={{ height: "env(safe-area-inset-top, 0px)", flexShrink: 0 }} />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e4e9f0", padding: "36px 24px 28px" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 4, background: "#FF5A1F",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#0d1626", letterSpacing: "-.2px" }}>Volt AI</span>
        </div>

        {/* Progress stepper */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>Zwift</span>
          </div>
          <div style={{ flex: 1, height: 2, background: "#22c55e", margin: "0 6px", marginBottom: 14 }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: "#FF5A1F", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>2</div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FF5A1F" }}>ICU</span>
          </div>
          <div style={{ flex: 1, height: 2, background: "#e4e9f0", margin: "0 6px", marginBottom: 14 }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: "#f1f5f9", border: "1px solid #e4e9f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>3</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Train</span>
          </div>
        </div>

        <div style={{ fontSize: 26, fontWeight: 900, color: "#0d1626", letterSpacing: "-.5px", lineHeight: 1.1, marginBottom: 8 }}>
          Connect Intervals.icu
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
          Paste your personal API key — your workouts will sync automatically to Zwift, Garmin, and Wahoo.
        </div>
      </div>

      {/* ── HOW TO GET THE KEY ─────────────────────────────────────────── */}
      <div style={{ background: "#fff", margin: "12px 16px 0", borderRadius: 4, border: "1px solid #e4e9f0" }}>
        <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: ".12em", textTransform: "uppercase" }}>
            Where to find your API key
          </div>
        </div>
        {[
          { step: "1", text: "Open intervals.icu in your browser" },
          { step: "2", text: 'Go to Settings → Developer Settings' },
          { step: "3", text: "Copy your API Key and paste it below" },
        ].map((item, i, arr) => (
          <div key={i} style={{
            display: "flex", gap: 14, padding: "13px 16px",
            borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none",
            alignItems: "center",
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: 4, background: "#fff7f0",
              border: "1px solid #ffe4d6", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "#FF5A1F",
            }}>{item.step}</div>
            <div style={{ fontSize: 14, color: "#0d1626", lineHeight: 1.5 }}>{item.text}</div>
          </div>
        ))}
      </div>

      {/* ── API KEY INPUT ─────────────────────────────────────────────── */}
      <div style={{ padding: "16px 16px 0" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="text"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Paste your Intervals.icu API key"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={{
              width: "100%", padding: "16px 18px", boxSizing: "border-box",
              background: "#fff", border: "1.5px solid #e4e9f0", borderRadius: 4,
              color: "#0d1626", fontSize: 15, outline: "none",
              fontFamily: "monospace",
              WebkitAppearance: "none",
            }}
          />

          {error && (
            <div style={{
              padding: "12px 14px",
              background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)",
              borderRadius: 4, fontSize: 13, color: "#dc2626", lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              width: "100%", padding: "18px 24px",
              background: loading || !apiKey.trim() ? "#e4e9f0" : "#FF5A1F",
              border: "none", borderRadius: 4,
              fontSize: 17, fontWeight: 800,
              color: loading || !apiKey.trim() ? "#94a3b8" : "#fff",
              cursor: loading || !apiKey.trim() ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Connecting…" : "Connect →"}
          </button>
        </form>
      </div>

      {/* ── SWITCH ACCOUNT ────────────────────────────────────────────── */}
      <div style={{ textAlign: "center", padding: "20px 16px 0", fontSize: 13, color: "#94a3b8" }}>
        <a href="/api/auth/logout?next=/m" style={{ color: "#94a3b8", textDecoration: "none" }}>
          Not you? Switch account →
        </a>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ height: "env(safe-area-inset-bottom, 0px)", flexShrink: 0, minHeight: 24 }} />
    </div>
  );
}
