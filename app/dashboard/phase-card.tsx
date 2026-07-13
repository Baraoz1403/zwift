"use client";

import { type RiderTrainingProfile, GOAL_LABELS, DAYS_RANGE_LABELS } from "@/lib/rider-profile";

export interface PhaseCardCycleInfo {
  phase: "Base" | "Build" | "Recovery" | "Taper" | "RaceWeek";
  weekInMesocycle: number;
}

const ACCENT = "#3b82f6";

function initialsFor(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Single compact profile strip - combines what used to be two visually
 * inconsistent pieces (a white TrainingProfileStrip, then a taller
 * dark PhaseCard) into one 90px dark strip matching hero-banner.tsx's own
 * gradient/border/glow language: avatar+name+goal on the left, FTP/W-kg/
 * days-per-week as pills in the center, phase+week progress + an edit
 * shortcut on the right. Everything visible at a glance, no scrolling to a
 * separate section needed to see the rider's own numbers.
 *
 * Read-only, same as its predecessors: the edit icon reuses the exact same
 * scroll-to-#training-profile + "zwift:open-training-profile" event
 * training-profile-nav-chip.tsx already dispatches, so TrainingProfileCard
 * remains the single real edit UI in the app.
 */
export default function PhaseCard({
  firstName,
  ftp,
  weightKg,
  riderProfile,
  cycleInfo,
}: {
  firstName: string | null;
  ftp: number | null;
  weightKg: number | null;
  riderProfile: RiderTrainingProfile | null;
  cycleInfo: PhaseCardCycleInfo | null;
}) {
  const phase = cycleInfo?.phase ?? "Base";
  const weekInMesocycle = cycleInfo?.weekInMesocycle ?? 1;
  const wPerKg = ftp && weightKg && weightKg > 0 ? ftp / weightKg : null;
  const goalLabel = riderProfile?.goals?.length
    ? riderProfile.goals.map((g) => GOAL_LABELS[g]).join(" · ")
    : "Building fitness";
  const daysLabel = riderProfile?.daysRange ? DAYS_RANGE_LABELS[riderProfile.daysRange] : null;

  const r = 15;
  const circumference = 2 * Math.PI * r;
  const arcPct = Math.min(1, Math.max(0, weekInMesocycle / 4));

  function openEditor() {
    document.getElementById("training-profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent("zwift:open-training-profile"));
  }

  const pill = (icon: string, value: string, label: string) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10, padding: "6px 14px",
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.1 }}>{label}</div>
      </div>
    </div>
  );

  return (
    <div
      style={{
        width: "100%", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box",
        background: "linear-gradient(135deg,#0a0e1a,#0d1f3c)",
        borderRadius: 16,
        border: "1px solid rgba(59,130,246,0.2)",
        boxShadow: `0 0 50px ${ACCENT}12`,
        position: "relative",
        overflow: "hidden",
        marginBottom: 40,
        height: 90,
        fontFamily: "system-ui, sans-serif",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
      }}
    >
      <div style={{
        position: "absolute", inset: 0, opacity: 0.035,
        backgroundImage: `linear-gradient(${ACCENT} 1px,transparent 1px),linear-gradient(90deg,${ACCENT} 1px,transparent 1px)`,
        backgroundSize: "36px 36px",
      }} />
      <div style={{
        position: "absolute", top: -60, right: "15%", width: 220, height: 220, borderRadius: "50%",
        background: `radial-gradient(circle,${ACCENT}18,transparent 70%)`, pointerEvents: "none",
      }} />

      {/* Left: avatar + name + goal */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: `${ACCENT}22`, border: `1px solid ${ACCENT}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700, color: ACCENT, flexShrink: 0,
        }}>
          {initialsFor(firstName)}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
            {firstName ?? "Rider"}
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.2 }}>
            {goalLabel}
          </div>
        </div>
      </div>

      {/* Center: metric pills */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {ftp != null && pill("⚡", `${ftp}W`, "FTP")}
        {wPerKg != null && pill("🔥", wPerKg.toFixed(1), "W/kg")}
        {daysLabel && pill("📅", daysLabel, "days/week")}
      </div>

      {/* Right: phase badge + mini progress arc + edit */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: `${ACCENT}15`, border: `1px solid ${ACCENT}35`,
          borderRadius: 20, padding: "6px 12px",
        }}>
          <svg width={34} height={34} viewBox="0 0 34 34">
            <circle cx={17} cy={17} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={4} />
            <circle
              cx={17} cy={17} r={r} fill="none"
              stroke={ACCENT} strokeWidth={4} strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - arcPct)}
              transform="rotate(-90 17 17)"
            />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 700, color: ACCENT, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
            {phase.toUpperCase()} · WEEK {weekInMesocycle}/4
          </span>
        </div>

        <button
          type="button"
          onClick={openEditor}
          title="Edit training profile"
          aria-label="Edit training profile"
          style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
