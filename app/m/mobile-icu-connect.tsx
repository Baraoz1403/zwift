"use client";

/**
 * MobileIcuConnect — Step 2 of onboarding.
 * One tap → intervals.icu consent → back → done.
 */

import { useEffect, useState } from "react";

export default function MobileIcuConnect() {
  const [icuError, setIcuError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("icu_error");
    if (err) setIcuError(err); // URLSearchParams already decodes
  }, []);

  return (
    <div style={{
      minHeight: "100dvh", background: "#f5f7fa", display: "flex", flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      <div style={{ height: "env(safe-area-inset-top, 0px)", flexShrink: 0 }} />

      {/* HEADER */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e4e9f0", padding: "36px 24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 4, background: "#FF5A1F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="white"><path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/></svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#0d1626", letterSpacing: "-.2px" }}>Volt AI</span>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
          {/* Step 1: Zwift — done ✓ */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{ position: "relative" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "#FF5A1F", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Zwift logo — lightning bolt */}
                <svg width="17" height="17" viewBox="0 0 20 20" fill="white">
                  <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
                </svg>
              </div>
              {/* Done badge */}
              <div style={{ position: "absolute", bottom: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#22c55e", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>Zwift</span>
          </div>
          <div style={{ flex: 1, height: 2, background: "#22c55e", margin: "0 8px", marginBottom: 14 }} />
          {/* Step 2: ICU — current */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(13,148,136,0.12)", border: "2px solid #0d9488", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* intervals.icu logo — ECG/activity line in ICU brand teal */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#0d9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#0d9488" }}>ICU</span>
          </div>
          <div style={{ flex: 1, height: 2, background: "#e4e9f0", margin: "0 8px", marginBottom: 14 }} />
          {/* Step 3: Train — upcoming */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "#f1f5f9", border: "1px solid #e4e9f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>3</div>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Train</span>
          </div>
        </div>

        <div style={{ fontSize: 26, fontWeight: 900, color: "#0d1626", letterSpacing: "-.5px", lineHeight: 1.1, marginBottom: 8 }}>Connect Intervals.icu</div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>One tap. Your workouts will appear automatically on your calendar — Zwift, Garmin, Wahoo.</div>
      </div>

      {/* ERROR BANNER — shown when OAuth callback returns ?icu_error */}
      {icuError && (
        <div style={{ margin: "12px 16px 0", padding: "14px 16px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 4, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>Connection failed</div>
            <div style={{ fontSize: 12, color: "#b91c1c", lineHeight: 1.5 }}>
              {icuError === "access_denied" ? "You cancelled. Tap below to try again." : icuError}
            </div>
          </div>
        </div>
      )}

      {/* WHAT YOU GET */}
      <div style={{ background: "#fff", margin: "12px 16px 0", borderRadius: 4, border: "1px solid #e4e9f0" }}>
        <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: ".12em", textTransform: "uppercase" }}>What Intervals.icu unlocks</div>
        </div>
        {[
          { icon: "📅", title: "AI plans on your calendar", desc: "Every Monday a new week appears — Zwift, Garmin, Wahoo — automatically." },
          { icon: "📊", title: "CTL / ATL / TSB tracking", desc: "Your fatigue and fitness. The AI reads these before building each plan." },
          { icon: "💬", title: "WhatsApp feedback loop", desc: "After each ride you get a summary. Tap to rate — the AI learns." },
        ].map((item, i, arr) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none", alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 4, background: "#fff7f0", border: "1px solid #ffe4d6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0d1626", marginBottom: 3 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ padding: "16px 16px 0" }}>
        <a
          href="/api/intervals/oauth-start?from=m"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "18px 24px", boxSizing: "border-box",
            background: "#FF5A1F", borderRadius: 4, textDecoration: "none",
            fontSize: 17, fontWeight: 800, color: "#fff",
          }}
        >
          Connect Intervals.icu
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
          You&apos;ll approve access on intervals.icu — takes 10 seconds.
        </div>
      </div>

      {/* SWITCH ACCOUNT */}
      <div style={{ textAlign: "center", padding: "20px 16px 0" }}>
        <a href="/api/auth/logout?next=/m" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>
          Not you? Switch account →
        </a>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ height: "env(safe-area-inset-bottom, 0px)", flexShrink: 0, minHeight: 24 }} />
    </div>
  );
}
