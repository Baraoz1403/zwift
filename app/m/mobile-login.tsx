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
      padding: "0 22px env(safe-area-inset-bottom, 28px)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* Background glow */}
      <div style={{
        position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)",
        width: 500, height: 500, borderRadius: "50%",
        background: "radial-gradient(circle, #1d4ed825 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        paddingTop: 56, paddingBottom: 12,
        textAlign: "center",
      }}>
        {/* Icon */}
        <div style={{
          width: 88, height: 88, borderRadius: 26,
          background: "linear-gradient(135deg, #1e3a6e 0%, #2563eb 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 22,
          boxShadow: "0 12px 48px #3b82f635, 0 0 0 1px #3b82f625",
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#60a5fa" opacity=".9" />
          </svg>
        </div>

        <div style={{
          fontSize: 14, fontWeight: 700, color: "#3b82f6",
          letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: 10,
        }}>
          AI Training Coach
        </div>
        <div style={{
          fontSize: 40, fontWeight: 800, color: "#f8fafc",
          letterSpacing: "-.8px", lineHeight: 1.05, marginBottom: 12,
        }}>
          Zwift AI
        </div>
        <div style={{ fontSize: 18, color: "#64748b", lineHeight: 1.55, maxWidth: 300 }}>
          Personalized weekly training plans, synced directly to your Zwift calendar.
        </div>

        {/* Stats row */}
        <div style={{
          display: "flex", gap: 32, marginTop: 28,
          borderTop: "1px solid #1e293b", paddingTop: 22,
          width: "100%", maxWidth: 340, justifyContent: "center",
        }}>
          {[
            { value: "30+", label: "Rides analyzed" },
            { value: "7-day", label: "Rolling plan" },
            { value: "ICU", label: "Auto-sync" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#3b82f6" }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#475569", fontWeight: 600, letterSpacing: ".3px", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Login form ─────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} style={{ paddingBottom: 28 }}>

        {/* Steps indicator */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 0, marginBottom: 20,
        }}>
          {[
            { n: "1", label: "Sign in to Zwift" },
            { n: "→", label: "" },
            { n: "2", label: "Connect Intervals.icu" },
            { n: "→", label: "" },
            { n: "3", label: "Start training" },
          ].map((s, i) => s.n === "→" ? (
            <div key={i} style={{ fontSize: 16, color: "#334155", margin: "0 8px" }}>→</div>
          ) : (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", margin: "0 auto 5px",
                background: s.n === "1" ? "#2563eb" : "#1e293b",
                border: s.n === "1" ? "none" : "1px solid #334155",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, color: s.n === "1" ? "#fff" : "#475569",
              }}>{s.n}</div>
              <div style={{ fontSize: 11, color: s.n === "1" ? "#93c5fd" : "#334155", fontWeight: 600, whiteSpace: "nowrap" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Form card */}
        <div style={{
          background: "rgba(17,24,39,0.9)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          border: "1px solid #1e293b",
          padding: "24px 20px",
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 18 }}>
            Step 1 — Sign in with Zwift
          </div>

          <div style={{ marginBottom: 14 }}>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="Zwift email"
              style={{
                width: "100%", padding: "16px 18px",
                background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 14, color: "#f1f5f9", fontSize: 18,
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
                width: "100%", padding: "16px 18px",
                background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 14, color: "#f1f5f9", fontSize: 18,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: "14px 16px",
              background: "#7f1d1d22", border: "1px solid #ef444440",
              borderRadius: 12, fontSize: 16, color: "#fca5a5", lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "18px",
              background: loading ? "#1d4ed8aa" : "linear-gradient(135deg, #1d4ed8, #2563eb)",
              border: "none", borderRadius: 16,
              color: "#fff", fontSize: 20, fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              letterSpacing: "-.2px", transition: "opacity .15s",
              fontFamily: "inherit",
              boxShadow: loading ? "none" : "0 4px 24px #2563eb45",
            }}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </div>

        {/* What's next */}
        <div style={{
          background: "rgba(17,24,39,0.75)", borderRadius: 18,
          border: "1px solid #1e293b", padding: "18px 20px",
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#94a3b8", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".5px" }}>
            What happens next
          </div>

          {[
            { icon: "⚡", title: "Sign in with Zwift", desc: "Your email + password — never stored by us.", active: true },
            { icon: "📈", title: "Connect Intervals.icu", desc: "Free account. Takes 2 minutes. This is how plans sync to Zwift.", active: false },
            { icon: "🚴", title: "Start training", desc: "Weekly plan built for your FTP and goals — ready to ride.", active: false },
          ].map((step, i) => (
            <div key={i} style={{
              display: "flex", gap: 14, alignItems: "flex-start",
              marginBottom: i < 2 ? 14 : 0,
              opacity: step.active ? 1 : 0.55,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: step.active ? "rgba(37,99,235,0.15)" : "#0f172a",
                border: step.active ? "1px solid rgba(37,99,235,0.35)" : "1px solid #1e293b",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>{step.icon}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: step.active ? "#f1f5f9" : "#64748b", marginBottom: 3 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 15, color: "#475569", lineHeight: 1.5 }}>
                  {step.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p style={{
          margin: 0, fontSize: 13, color: "#334155",
          lineHeight: 1.6, textAlign: "center",
        }}>
          Your password goes directly to Zwift&apos;s servers and is never stored here.
        </p>
      </form>
    </div>
  );
}
