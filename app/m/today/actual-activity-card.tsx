"use client";

/**
 * ActualActivityCard — displays a completed actual ride in the same rich style
 * as MobileWorkoutCard (planned workout cards).
 *
 * Used for:
 *  - "bonus" status: athlete rode on a rest day
 *  - "extra" status: athlete did a different sport than planned
 *
 * Instead of MobileWorkoutChart (which needs structured intervals),
 * shows an effort-zone banner built from avg / normalized power vs FTP.
 */

interface Props {
  activityName: string | null;
  durationMin: number | null;
  avgHr?: number | null;
  avgPower?: number | null;
  normalizedPower?: number | null;
  distanceKm?: number | null;
  tss?: number | null;
  ftp?: number | null;
}

const ZONE_DATA = [
  { maxPct: 55,  color: "#64748b", label: "Recovery"  },
  { maxPct: 75,  color: "#3b82f6", label: "Endurance" },
  { maxPct: 87,  color: "#22d3ee", label: "Tempo"     },
  { maxPct: 94,  color: "#10b981", label: "Sweet Spot"},
  { maxPct: 105, color: "#f59e0b", label: "Threshold" },
  { maxPct: 119, color: "#f97316", label: "VO2 Max"   },
  { maxPct: 999, color: "#ef4444", label: "Sprint"    },
];

function getZone(pct: number | null) {
  if (!pct) return { color: "#3b82f6", label: "Endurance" };
  return ZONE_DATA.find(z => pct <= z.maxPct) ?? ZONE_DATA[ZONE_DATA.length - 1];
}

export default function ActualActivityCard({
  activityName, durationMin, avgHr, avgPower, normalizedPower,
  distanceKm, tss, ftp,
}: Props) {
  const effortWatts = normalizedPower ?? avgPower;
  const effortPct = (ftp && ftp > 0 && effortWatts)
    ? Math.min(Math.round((effortWatts / ftp) * 100), 140)
    : null;

  const zone = getZone(effortPct);
  const powerLabel = normalizedPower ? "NP" : avgPower ? "Avg" : null;

  return (
    <div style={{
      borderRadius: 4, overflow: "hidden",
      background: "var(--m-card)",
      border: "1px solid var(--m-border)",
      borderTop: `3px solid ${zone.color}`,
      marginBottom: 10,
    }}>
      {/* Zone banner (replaces MobileWorkoutChart) */}
      <div style={{
        height: 110,
        background: "var(--m-card-inner)",
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {/* Subtle gradient wash */}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(135deg, transparent 0%, ${zone.color}1a 100%)`,
        }} />

        {/* Zone label badge — same position/style as workout-card overlay */}
        <div style={{
          position: "absolute", top: 10, left: 12,
          background: "var(--m-card)", border: `1px solid ${zone.color}44`,
          borderRadius: 3, padding: "3px 9px",
          fontSize: 11, fontWeight: 700, color: zone.color,
          letterSpacing: ".3px", textTransform: "uppercase", zIndex: 1,
        }}>
          {zone.label}
        </div>

        {/* Centre: effort% + power label */}
        {effortPct ? (
          <div style={{ textAlign: "center", zIndex: 1, lineHeight: 1 }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: zone.color, letterSpacing: "-2px" }}>
              {effortPct}<span style={{ fontSize: 22, fontWeight: 700 }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--m-muted)", marginTop: 4 }}>
              FTP{powerLabel ? ` · ${powerLabel} ${effortWatts}W` : ""}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 36, zIndex: 1 }}>🚴</span>
        )}

        {/* Effort progress bar pinned to bottom of banner */}
        {effortPct != null && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 5,
            background: "var(--m-border)",
          }}>
            <div style={{
              height: "100%",
              width: `${Math.min(effortPct, 100)}%`,
              background: `linear-gradient(90deg, ${zone.color}88, ${zone.color})`,
            }} />
          </div>
        )}
      </div>

      {/* Stats section */}
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{
          fontSize: 10, fontWeight: 800, color: zone.color,
          textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 5,
        }}>
          {zone.label}
        </div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: "var(--m-text)",
          lineHeight: 1.15, letterSpacing: "-0.4px", marginBottom: 10,
        }}>
          {activityName ?? "Bonus ride"}
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {durationMin != null && durationMin > 0 && (
            <StatPill value={`${durationMin}`} unit="min" />
          )}
          {avgHr != null && avgHr > 0 && (
            <StatPill value={`${Math.round(avgHr)}`} unit="bpm" color="#ef4444" />
          )}
          {effortPct != null && (
            <StatPill value={`${effortPct}%`} unit="FTP" color={zone.color} />
          )}
          {tss != null && tss > 0 && (
            <StatPill value={`${tss}`} unit="TSS" />
          )}
          {distanceKm != null && distanceKm > 0 && (
            <StatPill value={`${distanceKm}`} unit="km" />
          )}
          {normalizedPower != null && (
            <StatPill value={`${normalizedPower}W`} unit="NP" color={zone.color} />
          )}
          {avgPower != null && (
            <StatPill value={`${avgPower}W`} unit="avg" />
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ value, unit, color }: { value: string; unit: string; color?: string }) {
  return (
    <div style={{
      background: "var(--m-card-inner)", borderRadius: 3,
      padding: "8px 12px", textAlign: "center", border: "1px solid var(--m-border)",
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: color ?? "var(--m-text)", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--m-muted)", marginTop: 2, fontWeight: 500 }}>
        {unit}
      </div>
    </div>
  );
}
