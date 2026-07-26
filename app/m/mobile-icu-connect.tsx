/**
 * MobileIcuConnect
 *
 * Full-screen ICU onboarding screen shown after Zwift login when Intervals.icu
 * is not yet connected. Styled to match the dashboard header aesthetic.
 */

export default function MobileIcuConnect() {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#020817",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
      overscrollBehavior: "none",
    }}>
      {/* iOS notch */}
      <div style={{ height: "env(safe-area-inset-top, 0px)", flexShrink: 0 }} />

      {/* Hero header — dashboard-style gradient */}
      <div style={{
        position: "relative",
        padding: "32px 24px 28px",
        background: "linear-gradient(160deg, #020817 0%, #0a1628 50%, #0f2040 100%)",
        flexShrink: 0,
        overflow: "hidden",
      }}>
        {/* Background glow */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(37,99,235,0.22) 0%, transparent 70%)",
        }} />

        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26, position: "relative" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, flexShrink: 0,
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 28px rgba(37,99,235,0.45)",
          }}>
            <svg width="26" height="26" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z" />
            </svg>
          </div>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: ".18em",
              textTransform: "uppercase", color: "#3b82f6", marginBottom: 4,
            }}>
              AI Training Coach
            </div>
            <div style={{
              fontSize: 28, fontWeight: 900, color: "#f8fafc",
              letterSpacing: "-.5px", lineHeight: 1.05,
            }}>
              One more step
            </div>
          </div>
        </div>

        {/* Step tracker */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(15,23,42,0.6)", borderRadius: 16,
          padding: "12px 16px",
          border: "1px solid rgba(37,99,235,0.2)",
          position: "relative",
        }}>
          {/* Step 1 — done */}
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: "#2563eb",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="3" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#60a5fa" }}>Zwift</div>

          <div style={{ flex: 1, height: 2, background: "rgba(59,130,246,0.3)", borderRadius: 1, margin: "0 4px" }} />

          {/* Step 2 — active */}
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: "rgba(37,99,235,0.2)",
            border: "2px solid #2563eb",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>Intervals.icu</div>
        </div>

        {/* Stat cards row — what Intervals.icu unlocks */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16, position: "relative" }}>
          <StatCard icon="📈" value="CTL/ATL" label="Fitness load" color="#818cf8" />
          <StatCard icon="🎯" value="Garmin" label="Auto sync" color="#22c55e" />
          <StatCard icon="⚡" value="ZWO" label="Structured" color="#f59e0b" />
        </div>
      </div>

      {/* Connection card */}
      <div style={{
        flex: 1,
        padding: "16px 16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}>
        <div style={{
          background: "rgba(15,23,42,0.9)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: 26,
          padding: "24px 22px 26px",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}>
          {/* ICU identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, flexShrink: 0,
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#22c55e"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, color: "#f1f5f9" }}>Intervals.icu</div>
              <div style={{ fontSize: 14, color: "#475569" }}>Your training sync layer</div>
            </div>
          </div>

          {/* Copy */}
          <div style={{
            fontSize: 16, color: "#64748b", lineHeight: 1.65, marginBottom: 20,
          }}>
            Connect once and your AI workouts land on your bike automatically — Garmin, Wahoo, Zwift, wherever you train.
          </div>

          {/* Benefits */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}>
            <Benefit color="#22c55e" text="AI workouts pushed to your calendar every week" />
            <Benefit color="#3b82f6" text="Syncs to Garmin Connect, Wahoo SYSTM & Zwift" />
            <Benefit color="#f59e0b" text="Tracks CTL, ATL & TSB — fatigue made visible" />
          </div>

          {/* Primary CTA */}
          <a
            href="/api/intervals/oauth-start?from=m"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              width: "100%", padding: "20px 24px", boxSizing: "border-box",
              background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              borderRadius: 18, textDecoration: "none",
              fontSize: 18, fontWeight: 700, color: "#fff",
              boxShadow: "0 8px 28px rgba(37,99,235,0.45)",
              letterSpacing: "-.1px",
            }}
          >
            Connect Intervals.icu
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        {/* Help text */}
        <div style={{
          textAlign: "center",
          fontSize: 14, color: "#334155",
          lineHeight: 1.6,
          padding: "4px 8px",
        }}>
          Free at{" "}
          <span style={{ color: "#3b82f6", fontWeight: 600 }}>intervals.icu</span>
          {" "}→ create account → 30 seconds
        </div>
      </div>

      {/* Safe area bottom */}
      <div style={{ height: "env(safe-area-inset-bottom, 0px)", flexShrink: 0 }} />
    </div>
  );
}

function StatCard({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <div style={{
      background: "rgba(15,23,42,0.7)",
      border: `1px solid ${color}22`,
      borderRadius: 14,
      padding: "10px 12px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Benefit({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
        background: `${color}1a`,
        border: `1px solid ${color}33`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: 1,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <span style={{ fontSize: 15, color: "#94a3b8", lineHeight: 1.55 }}>{text}</span>
    </div>
  );
}
