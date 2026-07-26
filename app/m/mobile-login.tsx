"use client";

import { useState, FormEvent } from "react";

export default function MobileLoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Login failed. Check your credentials.");
        setLoading(false);
        return;
      }
      // Full reload so layout re-checks session
      window.location.href = "/m";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0f1a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 24px env(safe-area-inset-bottom, 0px)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>

      {/* Logo area */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
          boxShadow: "0 8px 32px #3b82f633",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
              stroke="#fff" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc", letterSpacing: "-.4px" }}>
          Zwift AI Coach
        </div>
        <div style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>
          Your personal training assistant
        </div>
      </div>

      {/* Login card */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#111827",
          borderRadius: 24,
          border: "1px solid #1e293b",
          padding: "28px 24px",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 20 }}>
          Sign in with Zwift
        </div>

        {/* Email */}
        <div style={{ marginBottom: 14 }}>
          <label style={{
            display: "block", fontSize: 12, fontWeight: 600,
            color: "#64748b", marginBottom: 6,
            letterSpacing: ".3px", textTransform: "uppercase",
          }}>
            Zwift email
          </label>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 14,
              color: "#f1f5f9",
              fontSize: 16,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: "block", fontSize: 12, fontWeight: 600,
            color: "#64748b", marginBottom: 6,
            letterSpacing: ".3px", textTransform: "uppercase",
          }}>
            Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 14,
              color: "#f1f5f9",
              fontSize: 16,
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 16,
            padding: "12px 14px",
            background: "#7f1d1d22",
            border: "1px solid #ef444444",
            borderRadius: 12,
            fontSize: 13,
            color: "#fca5a5",
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "16px",
            background: loading ? "#1d4ed8aa" : "#2563eb",
            border: "none",
            borderRadius: 16,
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
            letterSpacing: "-.1px",
            transition: "background .15s",
            fontFamily: "inherit",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        {/* Note */}
        <p style={{
          marginTop: 16, marginBottom: 0,
          fontSize: 11, color: "#334155",
          lineHeight: 1.5, textAlign: "center",
        }}>
          Your password goes directly to Zwift&apos;s servers.
          It is never stored by this app.
        </p>
      </form>
    </div>
  );
}
