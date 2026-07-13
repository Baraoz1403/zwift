"use client";

import { type RiderTrainingProfile, GOAL_LABELS } from "@/lib/rider-profile";

export interface PhaseCardCycleInfo {
  phase: "Base" | "Build" | "Recovery" | "Taper" | "RaceWeek";
  weekInMesocycle: number;
}

const ACCENT = "#3b82f6";

/**
 * Single card combining phase/week status + athlete profile summary,
 * styled to match hero-banner.tsx exactly (same dark blue gradient, grid
 * overlay, glow, tag pill) rather than sitting next to it as a visually
 * unrelated light card. Replaces the separate rotating-message banner
 * variant and the plain white TrainingProfileStrip that preceded this -
 * both read as inconsistent with the banner's own design language.
 *
 * Read-only summary, same as the strip it replaces: it doesn't reuse
 * TrainingProfileCard's edit form, it just displays a subset of the same
 * underlying data (fetched once in weekly-plan.tsx, passed down as props).
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
    : "Building fitness, one week at a time";

  const r = 42;
  const circumference = 2 * Math.PI * r;
  const arcPct = Math.min(1, Math.max(0, weekInMesocycle / 4));

  return (
    <div
      style={{
        width: "100%", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box",
        background: "linear-gradient(135deg,#0a0e1a,#0d1f3c)",
        borderRadius: 16,
        border: `1px solid ${ACCENT}33`,
        boxShadow: `0 0 50px ${ACCENT}12`,
        position: "relative",
        overflow: "hidden",
        marginBottom: 40,
        minHeight: 160,
        fontFamily: "system-ui, sans-serif",
        padding: "28px 36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 28,
        flexWrap: "wrap",
      }}
    >
      {/* Grid overlay + glow - same treatment as hero-banner.tsx */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.035,
        backgroundImage: `linear-gradient(${ACCENT} 1px,transparent 1px),linear-gradient(90deg,${ACCENT} 1px,transparent 1px)`,
        backgroundSize: "36px 36px",
      }} />
      <div style={{
        position: "absolute", top: -60, right: "8%", width: 260, height: 260, borderRadius: "50%",
        background: `radial-gradient(circle,${ACCENT}18,transparent 70%)`, pointerEvents: "none",
      }} />

      {/* Left: phase tag + name + goal + numbers */}
      <div style={{ position: "relative", zIndex: 1, flex: "1 1 320px", minWidth: 260 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ACCENT}15`, border: `1px solid ${ACCENT}35`,
          borderRadius: 20, padding: "4px 14px", marginBottom: 14,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2px", color: ACCENT }}>
            {phase.toUpperCase()} PHASE · WEEK {weekInMesocycle} OF 4
          </span>
        </div>

        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.15 }}>
          {firstName ?? "Rider"}
        </div>
        <div style={{ fontSize: 16, color: "#94a3b8", marginTop: 4 }}>
          {goalLabel}
        </div>

        <div style={{ display: "flex", gap: 28, marginTop: 14 }}>
          {ftp != null && (
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>
                {ftp}<span style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8" }}> W</span>
              </div>
              <div style={{ fontSize: 14, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>FTP</div>
            </div>
          )}
          {wPerKg != null && (
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{wPerKg.toFixed(1)}</div>
              <div style={{ fontSize: 14, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>W/kg</div>
            </div>
          )}
        </div>
      </div>

      {/* Right: circular week-progress arc */}
      <div style={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
        <svg width={104} height={104} viewBox="0 0 104 104">
          <circle cx={52} cy={52} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={9} />
          <circle
            cx={52} cy={52} r={r} fill="none"
            stroke={ACCENT} strokeWidth={9} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - arcPct)}
            transform="rotate(-90 52 52)"
            style={{ transition: "stroke-dashoffset 0.4s ease", filter: `drop-shadow(0 0 6px ${ACCENT}88)` }}
          />
          <text x={52} y={50} textAnchor="middle" fontSize={26} fontWeight={800} fill="#fff">
            {weekInMesocycle}
          </text>
          <text x={52} y={68} textAnchor="middle" fontSize={10} fontWeight={700} fill="#94a3b8" letterSpacing="0.06em">
            OF 4
          </text>
        </svg>
      </div>
    </div>
  );
}
