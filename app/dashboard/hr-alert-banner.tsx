"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { HRAlertLevel, HRAlertResponse } from "@/app/api/zwift/hr-alert/route";

const PREVIEW_DATA: Record<string, HRAlertResponse> = {
  orange: { ok: true, level: "orange", headline: "HR Watch — Early Suppression Signal", detail: "Your HR over recent rides is running 8% lower than your baseline alongside a 6% drop in power. This may indicate accumulated fatigue. Consider an easier week, extra sleep, and check for other signs of illness." },
  red:    { ok: true, level: "red",    headline: "Rest Required — HR Suppression Detected", detail: "Over your last 8 rides, your average HR is 14% below your baseline while power has also dropped 9%. This pattern is a classic sign of overreaching or early illness. Cut training intensity significantly this week." },
  black:  { ok: true, level: "black",  headline: "Stop Training — Critical HR Suppression", detail: "Your heart rate is 22% below your baseline across 9 recent rides, and power has dropped 15%. This is a severe, sustained blunted cardiac response. Rest completely for at least a week. If you feel unwell, experience chest tightness, or this pattern continues, consult your doctor." },
};

const DISMISS_KEY = "hrAlertDismissed";

const LEVEL_STYLES: Record<
  HRAlertLevel,
  {
    bg: string;
    border: string;
    headlineColor: string;
    textColor: string;
    disclaimerColor: string;
    iconSvg: React.ReactNode;
    pill: { bg: string; color: string; label: string };
    actionLabel: string;
    actionPrompt: string;
  }
> = {
  orange: {
    bg: "rgba(186,117,23,0.08)",
    border: "rgba(186,117,23,0.35)",
    headlineColor: "#854F0B",
    textColor: "var(--text)",
    disclaimerColor: "rgba(133,79,11,0.7)",
    iconSvg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    pill: { bg: "rgba(186,117,23,0.14)", color: "#854F0B", label: "HR Watch" },
    actionLabel: "Update training plan",
    actionPrompt: "זוהתה עייפות מצטברת בדופק. בנה לי שבוע אימון קל יותר להתאוששות.",
  },
  red: {
    bg: "rgba(162,45,45,0.07)",
    border: "rgba(162,45,45,0.35)",
    headlineColor: "#A32D2D",
    textColor: "var(--text)",
    disclaimerColor: "rgba(163,45,45,0.65)",
    iconSvg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A32D2D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    pill: { bg: "rgba(162,45,45,0.12)", color: "#A32D2D", label: "Action Required" },
    actionLabel: "Build recovery week",
    actionPrompt: "זוהתה ירידת דופק משמעותית — סימן לעומס יתר. בנה לי שבוע התאוששות מלא.",
  },
  black: {
    bg: "rgba(10,10,15,0.88)",
    border: "rgba(0,0,0,0.7)",
    headlineColor: "#ffffff",
    textColor: "rgba(255,255,255,0.82)",
    disclaimerColor: "rgba(255,255,255,0.45)",
    iconSvg: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    pill: { bg: "rgba(255,60,60,0.22)", color: "#ff8080", label: "Critical" },
    actionLabel: "Pause training plan",
    actionPrompt: "זוהתה ירידת דופק קריטית. עצור את תכנית האימון שלי ובנה תכנית התאוששות לשבוע.",
  },
};

export default function HRAlertBanner() {
  const searchParams = useSearchParams();
  const [alert, setAlert] = useState<HRAlertResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Preview mode: ?hr=orange / red / black — shows mock alert without real data
    const preview = searchParams?.get("hr");
    if (preview && PREVIEW_DATA[preview]) {
      setAlert(PREVIEW_DATA[preview]);
      if (preview === "red" || preview === "black") setExpanded(true);
      return;
    }

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
  }, [searchParams]);

  function handleDismiss() {
    setDismissed(true);
    // Dismiss for 6 hours (so it reappears next day if still an issue)
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(DISMISS_KEY, String(Date.now() + 6 * 60 * 60 * 1000));
    }
  }

  if (!alert || !alert.level || dismissed) return null;

  const s = LEVEL_STYLES[alert.level];

  const btnBase: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, padding: "5px 13px",
    borderRadius: 6, border: `1px solid ${s.border}`,
    cursor: "pointer", background: "transparent",
    color: s.headlineColor, fontFamily: "inherit",
  };

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
      }}
    >
      {/* Dismiss × */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss alert"
        style={{
          position: "absolute", top: 12, right: 14,
          background: "none", border: "none", cursor: "pointer",
          color: s.headlineColor, opacity: 0.45, lineHeight: 1,
          fontSize: 18, fontWeight: 300, fontFamily: "inherit", padding: "2px 4px",
        }}
      >×</button>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flexShrink: 0, marginTop: 2 }}>{s.iconSvg}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Pill */}
          <span style={{
            display: "inline-block", fontSize: 10.5, fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "2px 9px", borderRadius: 99,
            background: s.pill.bg, color: s.pill.color, marginBottom: 5,
          }}>
            {s.pill.label}
          </span>

          {/* Headline */}
          <div style={{ fontSize: 14.5, fontWeight: 700, color: s.headlineColor, lineHeight: 1.3, marginBottom: expanded ? 8 : 0 }}>
            {alert.headline}
          </div>

          {/* Detail (expand/collapse) */}
          {!expanded && (
            <button type="button" onClick={() => setExpanded(true)} style={{
              background: "none", border: "none", padding: 0,
              fontSize: 12, color: s.headlineColor, opacity: 0.75,
              cursor: "pointer", marginTop: 4, textDecoration: "underline", fontFamily: "inherit",
            }}>
              Show details
            </button>
          )}

          {expanded && alert.detail && (
            <>
              <div style={{ fontSize: 13, color: s.textColor, lineHeight: 1.6 }}>
                {alert.detail}
              </div>

              {/* Medical disclaimer */}
              <div style={{ fontSize: 11.5, color: s.disclaimerColor, marginTop: 8, fontStyle: "italic" }}>
                AI-based analysis only — not medical advice. Consult a doctor if you feel unwell.
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <a
                  href="#todays-note"
                  onClick={() => {
                    const el = document.getElementById("todays-note");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  style={{ ...btnBase, textDecoration: "none", display: "inline-block" }}
                >
                  {s.actionLabel} →
                </a>
                <button type="button" onClick={handleDismiss} style={{ ...btnBase, opacity: 0.6 }}>
                  Dismiss for 6h
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
