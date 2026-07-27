"use client";

import { useState, FormEvent } from "react";

export default function MobileLoginScreen() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Login failed. Check your Zwift credentials.");
        setLoading(false);
        return;
      }
      window.location.href = "/m";
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

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e4e9f0",
        padding: "48px 24px 32px",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 4, background: "#FF5A1F",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#0d1626", letterSpacing: "-.3px" }}>Volt AI</div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>Personal cycling coach</div>
          </div>
        </div>

        <div style={{ fontSize: 28, fontWeight: 900, color: "#0d1626", letterSpacing: "-.6px", lineHeight: 1.1, marginBottom: 10 }}>
          Your AI coach,<br/>ready to train.
        </div>
        <div style={{ fontSize: 15, color: "#64748b", lineHeight: 1.6 }}>
          Structured weekly plans based on your FTP — synced directly to Zwift and Intervals.icu.
        </div>
      </div>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <div style={{ background: "#fff", margin: "12px 16px 0", borderRadius: 4, border: "1px solid #e4e9f0" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: ".12em", textTransform: "uppercase" }}>
            3 steps to get started
          </div>
        </div>
        {[
          {
            n: "1",
            color: "#FF5A1F",
            title: "Sign in with Zwift",
            desc: "Your email & password go directly to Zwift. We never store your password.",
            icon: "⚡",
          },
          {
            n: "2",
            color: "#0ea5e9",
            title: "Connect Intervals.icu",
            desc: "Free account. One API key. This is how workouts appear on your Zwift calendar automatically.",
            icon: "🔗",
          },
          {
            n: "3",
            color: "#22c55e",
            title: "Add WhatsApp (optional)",
            desc: "Get a workout summary after each ride — straight to your WhatsApp. Set it in your profile.",
            icon: "💬",
          },
        ].map((step, i, arr) => (
          <div key={step.n} style={{
            display: "flex", gap: 14, alignItems: "flex-start",
            padding: "14px 16px",
            borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 4, flexShrink: 0,
              background: `${step.color}14`,
              border: `1px solid ${step.color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16,
            }}>{step.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: step.color,
                  background: `${step.color}14`, padding: "2px 7px", borderRadius: 3,
                  letterSpacing: ".06em",
                }}>STEP {step.n}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0d1626" }}>{step.title}</span>
              </div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── FORM ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 16px 32px" }}>
        <div style={{ background: "#fff", border: "1px solid #e4e9f0", borderRadius: 4, padding: "20px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 4 }}>
            Step 1 of 3
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0d1626", letterSpacing: "-.3px", marginBottom: 16 }}>
            Sign in with Zwift
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="Zwift email"
              className="m-input"
              style={{
                width: "100%", padding: "15px 16px",
                background: "#f8fafc",
                border: "1px solid #e4e9f0",
                borderRadius: 4,
                color: "#0d1626",
                fontSize: 16,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                WebkitAppearance: "none" as const,
              }}
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Password"
              className="m-input"
              style={{
                width: "100%", padding: "15px 16px",
                background: "#f8fafc",
                border: "1px solid #e4e9f0",
                borderRadius: 4,
                color: "#0d1626",
                fontSize: 16,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                WebkitAppearance: "none" as const,
              }}
            />

            {error && (
              <div style={{
                padding: "12px 14px",
                background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)",
                borderRadius: 4, fontSize: 14, color: "#dc2626", lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "16px",
                background: loading ? "#e4e9f0" : "#FF5A1F",
                border: "none", borderRadius: 4,
                color: loading ? "#94a3b8" : "#fff",
                fontSize: 16, fontWeight: 800,
                cursor: loading ? "default" : "pointer",
                fontFamily: "inherit",
                marginTop: 4,
              }}
            >
              {loading ? "Signing in…" : "Sign in with Zwift →"}
            </button>
          </form>

          <div style={{ marginTop: 14, fontSize: 12, color: "#94a3b8", lineHeight: 1.5, textAlign: "center" }}>
            After sign-in, you&apos;ll connect Intervals.icu<br/>to enable calendar sync.
          </div>
        </div>
      </div>

    </div>
  );
}
