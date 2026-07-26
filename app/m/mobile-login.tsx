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
      window.location.href = "/m";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #020817 0%, #0a1628 40%, #0f1e38 100%)",
      display: "flex",
      flexDirection: "column",
      padding: "0 20px env(safe-area-inset-bottom, 24px)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Background glow */}
      <div style={{
        position: "absolute", top: -120, left: "50%", transform: "translateX(-50%)",
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, #1d4ed820 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Hero section */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        paddingTop: 60, paddingBottom: 20,
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 88, height: 88, borderRadius: 26,
          background: "linear-gradient(135deg, #1e3a6e 0%, #2563eb 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24,
          boxShadow: "0 12px 48px #3b82f630, 0 0 0 1px #3b82f625",
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
              fill="#60a5fa" opacity=".9" />
          </svg>
        </div>

        {/* Title */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: "#3b82f6",
          letterSpacing: "2px", textTransform: "uppercase", marginBottom: 10,
        }}>
          AI Training Coach
        </div>
        <div style={{
          fontSize: 32, fontWeight: 800, color: "#f8fafc",
          letterSpacing: "-.6px", lineHeight: 1.1, marginBottom: 10,
        }}>
          Zwift AI
        </div>
        <div style={{ fontSize: 15, color: "#64748b", lineHeight: 1.5, maxWidth: 280 }}>
          Personalized training plans that sync directly to your Zwift calendar.
        </div>

        {/* Stats row */}
        <div style={{
          display: "flex", gap: 24, marginTop: 28,
          borderTop: "1px solid #1e293b", paddingTop: 20, width: "100%", maxWidth: 320,
          justifyContent: "center",
        }}>
          {[
            { value: "30", label: "Rides analyzed" },
            { value: "7-day", label: "Rolling plan" },
            { value: "ICU", label: "Auto-sync" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#3b82f6" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: ".3px", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Login form */}
      <form onSubmit={handleSubmit} style={{ paddingBottom: 32 }}>
        <div style={{
          background: "rgba(17,24,39,0.85)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          border: "1px solid #1e293b",
          padding: "24px 20px",
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 20 }}>
            Sign in with Zwift
          </div>

          <div style={{ marginBottom: 12 }}>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="Zwift email"
              style={{
                width: "100%", padding: "15px 16px",
                background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 14, color: "#f1f5f9", fontSize: 16,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Password"
              style={{
                width: "100%", padding: "15px 16px",
                background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 14, color: "#f1f5f9", fontSize: 16,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: "12px 14px",
              background: "#7f1d1d22", border: "1px solid #ef444440",
              borderRadius: 12, fontSize: 14, color: "#fca5a5", lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "17px",
              background: loading ? "#1d4ed8aa" : "linear-gradient(135deg, #1d4ed8, #2563eb)",
              border: "none", borderRadius: 16,
              color: "#fff", fontSize: 17, fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              letterSpacing: "-.1px", transition: "opacity .15s",
              fontFamily: "inherit",
              boxShadow: loading ? "none" : "0 4px 20px #2563eb40",
            }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </div>

        <p style={{
          margin: 0, fontSize: 11, color: "#334155",
          lineHeight: 1.5, textAlign: "center",
        }}>
          Your password goes directly to Zwift&apos;s servers and is never stored.
        </p>
      </form>
    </div>
  );
}
