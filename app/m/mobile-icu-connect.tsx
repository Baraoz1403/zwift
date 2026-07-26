/**
 * MobileIcuConnect
 *
 * Full-screen ICU onboarding screen shown after Zwift login when Intervals.icu
 * is not yet connected. Mandatory — mirrors the desktop IntervalsOnboarding gate
 * but built for mobile-first with the same visual language as the dashboard header.
 */

export default function MobileIcuConnect() {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#050c18",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
      overscrollBehavior: "none",
    }}>
      {/* iOS notch */}
      <div style={{ height: "env(safe-area-inset-top, 0px)", flexShrink: 0 }} />

      {/* Hero — mirrors dashboard header aesthetic */}
      <div style={{
        padding: "28px 24px 20px",
        background: "linear-gradient(180deg, rgba(37,99,235,0.14) 0%, transparent 100%)",
        flexShrink: 0,
      }}>
        {/* Brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 24px rgba(37,99,235,0.4)",
          }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z" />
            </svg>
          </div>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: ".15em",
              textTransform: "uppercase", color: "#3b82f6", marginBottom: 3,
            }}>
              AI Training Coach
            </div>
            <div style={{
              fontSize: 24, fontWeight: 900, color: "#f8fafc",
              letterSpacing: "-.5px", lineHeight: 1.1,
            }}>
              Almost there
            </div>
          </div>
        </div>

        {/* Step tracker */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Step 1 — done */}
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "#2563eb",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="3" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6" }}>Zwift</div>

          <div style={{ flex: 1, height: 2, background: "rgba(59,130,246,0.35)", borderRadius: 1, margin: "0 4px" }} />

          {/* Step 2 — active */}
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "rgba(37,99,235,0.2)",
            border: "1.5px solid #2563eb",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563eb" }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>Intervals.icu</div>
        </div>
      </div>

      {/* Connection card */}
      <div style={{
        flex: 1,
        padding: "0 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 14,
      }}>
        <div style={{
          background: "rgba(15,23,42,0.85)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: 26,
          padding: "26px 22px 28px",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}>
          {/* ICU identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {/* Intervals.icu heartbeat / activity icon */}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#22c55e"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#f1f5f9" }}>Intervals.icu</div>
              <div style={{ fontSize: 12, color: "#475569" }}>Your training sync layer</div>
            </div>
          </div>

          {/* Copy */}
          <div style={{
            fontSize: 14, color: "#64748b", lineHeight: 1.65, marginBottom: 22,
          }}>
            Connect once and your AI workouts land on your bike automatically — Garmin, Wahoo, Zwift, wherever you train.
          </div>

          {/* Benefits */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
            <Benefit color="#22c55e" text="AI workouts pushed to your calendar every week" />
            <Benefit color="#3b82f6" text="Syncs to Garmin Connect, Wahoo SYSTM & Zwift" />
            <Benefit color="#f59e0b" text="Tracks CTL, ATL & TSB — fatigue made visible" />
          </div>

          {/* Primary CTA */}
          <a
            href="/api/intervals/oauth-start?from=m"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              width: "100%", padding: "18px 24px", boxSizing: "border-box",
              background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              borderRadius: 18, textDecoration: "none",
              fontSize: 17, fontWeight: 700, color: "#fff",
              boxShadow: "0 6px 24px rgba(37,99,235,0.45)",
              letterSpacing: "-.1px",
            }}
          >
            Connect Intervals.icu
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        {/* Help text */}
        <div style={{
          textAlign: "center",
          fontSize: 12, color: "#334155",
          lineHeight: 1.6,
          padding: "4px 8px",
        }}>
          Free at{" "}
          <span style={{ color: "#3b82f6", fontWeight: 500 }}>intervals.icu</span>
          {" "}→ create account → it takes 30 seconds
        </div>
      </div>

      {/* Safe area bottom */}
      <div style={{ height: "env(safe-area-inset-bottom, 0px)", flexShrink: 0 }} />
    </div>
  );
}

function Benefit({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{
        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
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
      <span style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.55 }}>{text}</span>
    </div>
  );
}
