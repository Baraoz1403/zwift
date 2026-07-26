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
      background: "#020817",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>

      {/* ── HERO — full dramatic top section ──────────────────────────── */}
      <div style={{
        position: "relative",
        padding: "64px 24px 40px",
        background: "linear-gradient(170deg, #0a1628 0%, #0f2040 50%, #1a0a3a 100%)",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        {/* Glow orbs */}
        <div style={{
          position: "absolute", top: -60, left: "30%",
          width: 340, height: 340, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: 20, right: "-10%",
          width: 200, height: 200, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Logo mark */}
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: "linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 20,
          boxShadow: "0 0 0 1px rgba(124,58,237,0.4), 0 16px 48px rgba(37,99,235,0.5)",
        }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" />
          </svg>
        </div>

        {/* Brand */}
        <div style={{
          fontSize: 13, fontWeight: 700, color: "#818cf8",
          letterSpacing: "3px", textTransform: "uppercase", marginBottom: 10,
        }}>
          AI Training Coach
        </div>
        <div style={{
          fontSize: 46, fontWeight: 900, color: "#f8fafc",
          letterSpacing: "-1.5px", lineHeight: 1,  marginBottom: 16,
        }}>
          Zwift AI
        </div>
        <div style={{
          fontSize: 19, color: "#94a3b8", lineHeight: 1.55, maxWidth: 300,
          marginBottom: 28,
        }}>
          Your personal AI coach — structured weekly training plans, synced to Zwift automatically.
        </div>

        {/* Stat pills */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { val: "FTP-based", label: "plans" },
            { val: "Auto-sync", label: "to Zwift" },
            { val: "Ride + Run", label: "support" },
          ].map(s => (
            <div key={s.val} style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, padding: "7px 14px",
              fontSize: 14, color: "#c4d0e3",
            }}>
              <span style={{ fontWeight: 700, color: "#f8fafc" }}>{s.val}</span>{" "}{s.label}
            </div>
          ))}
        </div>

        {/* Bottom separator line */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 1, background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)",
        }} />
      </div>

      {/* ── HOW IT WORKS — 3 clear steps ─────────────────────────────── */}
      <div style={{
        display: "flex",
        background: "#0d1424",
        borderBottom: "1px solid #1e293b",
      }}>
        {[
          { n: "1", label: "Sign in with Zwift", color: "#3b82f6", active: true },
          { n: "2", label: "Connect Intervals.icu", color: "#818cf8", active: false },
          { n: "3", label: "Start training", color: "#22c55e", active: false },
        ].map((step, i) => (
          <div key={i} style={{
            flex: 1, padding: "14px 8px", textAlign: "center",
            borderRight: i < 2 ? "1px solid #1e293b" : "none",
            opacity: step.active ? 1 : 0.45,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: step.active ? step.color : "#1e293b",
              border: `1px solid ${step.active ? step.color : "#334155"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 8px",
              fontSize: 15, fontWeight: 800,
              color: step.active ? "#fff" : "#475569",
            }}>{step.n}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: step.active ? step.color : "#475569", lineHeight: 1.3 }}>
              {step.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── FORM ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: "24px 20px", background: "#0a0f1a" }}>
        <form onSubmit={handleSubmit}>

          <div style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc", marginBottom: 6 }}>
            Step 1: Sign in with Zwift
          </div>
          <div style={{ fontSize: 16, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
            Use your Zwift account. Your password goes directly to Zwift — we never store it.
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
                width: "100%", padding: "17px 18px",
                background: "#111827",
                border: "1px solid #1e293b",
                borderRadius: 16,
                color: "#f1f5f9",
                WebkitTextFillColor: "#f1f5f9",
                caretColor: "#818cf8",
                fontSize: 18,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                WebkitAppearance: "none" as const,
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
                width: "100%", padding: "17px 18px",
                background: "#111827",
                border: "1px solid #1e293b",
                borderRadius: 16,
                color: "#f1f5f9",
                WebkitTextFillColor: "#f1f5f9",
                caretColor: "#818cf8",
                fontSize: 18,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                WebkitAppearance: "none" as const,
              }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: "14px 16px",
              background: "rgba(127,29,29,0.3)", border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 12, fontSize: 16, color: "#fca5a5", lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "19px",
              background: loading
                ? "rgba(29,78,216,0.5)"
                : "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
              border: "none", borderRadius: 18,
              color: "#fff", fontSize: 20, fontWeight: 800,
              cursor: loading ? "default" : "pointer",
              letterSpacing: "-.2px",
              fontFamily: "inherit",
              boxShadow: loading ? "none" : "0 4px 32px rgba(37,99,235,0.5), 0 0 0 1px rgba(124,58,237,0.3)",
              marginBottom: 28,
            }}
          >
            {loading ? "Signing in…" : "Sign in with Zwift →"}
          </button>

          {/* What happens next */}
          <div style={{
            background: "#0d1424",
            border: "1px solid #1e2d45",
            borderRadius: 20, padding: "20px 18px",
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#475569",
              letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 16,
            }}>
              What happens after you sign in
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <FlowStep
                num="2"
                color="#818cf8"
                title="Connect Intervals.icu"
                desc="Free account. One-time setup. This is how workouts appear on your Zwift calendar automatically — no manual uploads."
              />
              <FlowStep
                num="3"
                color="#22c55e"
                title="Get your first training plan"
                desc="Tap 'Generate Plan' and your AI coach builds a structured weekly plan based on your FTP, goals, and schedule."
              />
              <FlowStep
                num="4"
                color="#f59e0b"
                title="Load workouts in Zwift"
                desc="Open Zwift → Workouts. Your plan is already there, ready to ride or run — with power targets, intervals, and coaching notes."
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function FlowStep({ num, color, title, desc }: {
  num: string; color: string; title: string; desc: string;
}) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 15, fontWeight: 800, color,
      }}>{num}</div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 15, color: "#475569", lineHeight: 1.6 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}
