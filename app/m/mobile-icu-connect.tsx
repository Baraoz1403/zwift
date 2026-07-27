/**
 * MobileIcuConnect
 * Step 2 of onboarding — shown after Zwift login when Intervals.icu is not yet connected.
 * Redesigned to match Volt AI light theme (white, sharp corners, orange accent).
 */

export default function MobileIcuConnect() {
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
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e4e9f0",
        padding: "36px 24px 28px",
      }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 22 }}>
          {/* Step 1 — done */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 4, background: "#22c55e",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>Zwift</span>
          </div>

          <div style={{ flex: 1, height: 2, background: "#22c55e", margin: "0 6px", marginBottom: 14 }} />

          {/* Step 2 — active */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 4, background: "#FF5A1F",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "#fff",
            }}>2</div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FF5A1F" }}>ICU</span>
          </div>

          <div style={{ flex: 1, height: 2, background: "#e4e9f0", margin: "0 6px", marginBottom: 14 }} />

          {/* Step 3 — pending */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 4, background: "#f1f5f9", border: "1px solid #e4e9f0",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: "#94a3b8",
            }}>3</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Train</span>
          </div>
        </div>

        <div style={{ fontSize: 26, fontWeight: 900, color: "#0d1626", letterSpacing: "-.5px", lineHeight: 1.1, marginBottom: 8 }}>
          Connect Intervals.icu
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
          One tap. Your workouts will appear automatically on your calendar — Zwift, Garmin, Wahoo.
        </div>
      </div>

      {/* ── WHAT YOU GET ───────────────────────────────────────────────── */}
      <div style={{ background: "#fff", margin: "12px 16px 0", borderRadius: 4, border: "1px solid #e4e9f0" }}>
        <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: ".12em", textTransform: "uppercase" }}>
            What Intervals.icu unlocks
          </div>
        </div>
        {[
          { icon: "📅", title: "AI plans on your calendar", desc: "Every Monday a new week appears — Zwift, Garmin, Wahoo — automatically." },
          { icon: "📊", title: "CTL / ATL / TSB tracking", desc: "Your fatigue and fitness in numbers. The AI reads these before building each plan." },
          { icon: "💬", title: "WhatsApp feedback loop", desc: "After each ride you get a summary. Tap to rate — the AI learns your response." },
        ].map((item, i, arr) => (
          <div key={i} style={{
            display: "flex", gap: 14, padding: "14px 16px",
            borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none",
            alignItems: "flex-start",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 4, background: "#fff7f0",
              border: "1px solid #ffe4d6", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0d1626", marginBottom: 3 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 16px 32px" }}>
        <a
          href="/api/intervals/oauth-start?from=m"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "18px 24px", boxSizing: "border-box",
            background: "#FF5A1F",
            borderRadius: 4, textDecoration: "none",
            fontSize: 17, fontWeight: 800, color: "#fff",
          }}
        >
          Connect Intervals.icu
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
          You&apos;ll be taken to intervals.icu to approve the connection.<br/>
          Free account · takes 30 seconds.
        </div>
      </div>

      <div style={{ height: "env(safe-area-inset-bottom, 0px)", flexShrink: 0 }} />
    </div>
  );
}
