"use client";

import { useEffect, useState } from "react";
import type { HRAlertLevel, HRAlertResponse } from "@/app/api/zwift/hr-alert/route";

const DISMISS_KEY = "hrAlertDismissed";

const LEVEL_STYLES: Record<
  HRAlertLevel,
  {
    bg: string;
    border: string;
    headlineColor: string;
    textColor: string;
    iconSvg: React.ReactNode;
    pill: { bg: string; color: string; label: string };
  }
> = {
  orange: {
    bg: "rgba(195, 110, 0, 0.07)",
    border: "rgba(195, 110, 0, 0.35)",
    headlineColor: "#b56a00",
    textColor: "var(--text)",
    iconSvg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b56a00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    pill: { bg: "rgba(195,110,0,0.12)", color: "#b56a00", label: "HR Watch" },
  },
  red: {
    bg: "rgba(196, 30, 30, 0.07)",
    border: "rgba(196, 30, 30, 0.35)",
    headlineColor: "#c41e1e",
    textColor: "var(--text)",
    iconSvg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c41e1e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    pill: { bg: "rgba(196,30,30,0.12)", color: "#c41e1e", label: "Action Required" },
  },
  black: {
    bg: "rgba(10, 10, 15, 0.88)",
    border: "rgba(0, 0, 0, 0.75)",
    headlineColor: "#ffffff",
    textColor: "rgba(255,255,255,0.85)",
    iconSvg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    pill: { bg: "rgba(255,60,60,0.25)", color: "#ff6666", label: "Critical" },
  },
};

export default function HRAlertBanner() {
  const [alert, setAlert] = useState<HRAlertResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    if (typeof sessionStorage !== "undefined") {
      const dismissedUntil = sessionStorage.getItem(DISMISS_KEY);
      if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
        setDismissed(true);
        return;
      }
    }

    fetch("/api/zwift/hr-alert")
      .then((r) => r.json())
      .then((data: HRAlertResponse) => {
        if (data.ok && data.level) {
          setAlert(data);
          // Auto-expand red and black alerts
          if (data.level === "red" || data.level === "black") {
            setExpanded(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  function handleDismiss() {
    setDismissed(true);
    // Dismiss for 6 hours (so it reappears next day if still an issue)
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(DISMISS_KEY, String(Date.now() + 6 * 60 * 60 * 1000));
    }
  }

  if (!alert || !alert.level || dismissed) return null;

  const s = LEVEL_STYLES[alert.level];

  return (
    <div
      role="alert"
      style={{
        background: s.bg,
        border: `1.5px solid ${s.border}`,
        borderRadius: 10,
        padding: "14px 18px",
        marginBottom: 16,
        position: "relative",
        animation: "fadeInDown 0.3s ease",
      }}
    >
      {/* Top row: icon + pill + headline + dismiss */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flexShrink: 0, marginTop: 2 }}>{s.iconSvg}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "2px 9px", borderRadius: 99,
              background: s.pill.bg, color: s.pill.color,
            }}>
              {s.pill.label}
            </span>
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: s.headlineColor, lineHeight: 1.3, marginBottom: expanded ? 10 : 0 }}>
            {alert.headline}
          </div>

          {expanded && alert.detail && (
            <div style={{ fontSize: 13, color: s.textColor, lineHeight: 1.6 }}>
              {alert.detail}
            </div>
          )}

          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{
                background: "none", border: "none", padding: 0,
                fontSize: 12, color: s.headlineColor, opacity: 0.8,
                cursor: "pointer", marginTop: 4, textDecoration: "underline",
                fontFamily: "inherit",
              }}
            >
              Show details
            </button>
          )}
        </div>

        {/* Dismiss (×) */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss alert"
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "2px 4px", flexShrink: 0,
            color: s.headlineColor, opacity: 0.55, lineHeight: 1,
            fontSize: 18, fontWeight: 300, fontFamily: "inherit",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
