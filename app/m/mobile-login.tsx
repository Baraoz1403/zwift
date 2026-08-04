"use client";

import { useState, FormEvent } from "react";

export default function MobileLoginScreen() {
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      // All devices → mobile app
      window.location.href = "/m/today";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "16px 18px",
    background: "#111827",
    border: "1px solid #1e293b",
    borderRadius: 12,
    color: "#f8fafc",
    // iOS: autofill overrides `color` — these two overrides win
    WebkitTextFillColor: "#f8fafc",
    WebkitBoxShadow: "0 0 0px 1000px #111827 inset",
    fontSize: 17,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    WebkitAppearance: "none",
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0f1a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
      padding: "40px 24px",
    }}>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: "#FF5A1F",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
            <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#f8fafc", letterSpacing: "-.4px" }}>Volt AI</div>
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500, marginTop: 1 }}>Your AI cycling coach</div>
        </div>
      </div>

      {/* Form card */}
      <div style={{
        width: "100%", maxWidth: 400,
        background: "#111827",
        border: "1px solid #1e293b",
        borderRadius: 20,
        padding: "28px 24px",
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc", letterSpacing: "-.4px", marginBottom: 6 }}>
          Sign in with Zwift
        </div>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24, lineHeight: 1.5 }}>
          Use your Zwift email and password.
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="Zwift email"
            style={inp}
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="Password"
            style={inp}
          />

          {error && (
            <div style={{
              padding: "12px 14px",
              background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
              borderRadius: 10, fontSize: 14, color: "#f87171", lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "16px",
              background: loading ? "#1e293b" : "#FF5A1F",
              border: "none", borderRadius: 12,
              color: loading ? "#475569" : "#fff",
              fontSize: 17, fontWeight: 800,
              cursor: loading ? "default" : "pointer",
              fontFamily: "inherit",
              marginTop: 4,
            }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 12, color: "#475569", lineHeight: 1.6, textAlign: "center" }}>
          Your credentials go directly to Zwift.<br/>We never store your password.
        </div>
      </div>

      {/* Legal */}
      <div style={{ marginTop: 32, display: "flex", gap: 16, alignItems: "center" }}>
        <a href="/m/legal/terms" style={{ fontSize: 12, color: "#ffffff", textDecoration: "none" }}>Terms</a>
        <span style={{ color: "#1e293b" }}>·</span>
        <a href="/m/legal/privacy" style={{ fontSize: 12, color: "#ffffff", textDecoration: "none" }}>Privacy</a>
      </div>

    </div>
  );
}
