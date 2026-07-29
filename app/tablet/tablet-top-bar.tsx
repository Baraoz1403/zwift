/**
 * TabletTopBar — full-width fixed header for all tablet pages.
 *
 * Shows (top-to-bottom):
 *   Row 1: greeting · date                    [theme toggle]
 *   Row 2: Athlete name (big)  [ICU●] [TP●]  [FTP chip] [Phase chip] [Sessions chip]
 *
 * Position: fixed top:0 left:0 right:0 z-index:70
 * Height:   94px inner + env(safe-area-inset-top)  → CSS var(--tablet-bar-h)
 *
 * The sidebar and main content are offset by var(--tablet-bar-h) so they
 * appear directly below this bar.
 */
import { ThemeToggleButton } from "@/app/m/theme-toggle-button";

const ZO = "#FF5A1F";

interface TabletTopBarProps {
  firstName: string | null;
  ftp: number | null;
  currentPhase: string | null;
  weekDisplayNum: number | null;
  weekWorkoutCount: number;
  icuConnected: boolean;
  tpConnected: boolean;
  greeting: string;
  dateLabel: string;
}

export function TabletTopBar({
  firstName, ftp, currentPhase, weekDisplayNum, weekWorkoutCount,
  icuConnected, tpConnected, greeting, dateLabel,
}: TabletTopBarProps) {
  return (
    <div
      className="tablet-topbar"
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 70,
        background: "var(--m-card)",
        borderBottom: "1px solid var(--m-border)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div style={{ padding: "12px 32px 14px" }}>
        {/* Row 1: greeting + date on left, theme toggle on right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: "var(--m-muted)",
            textTransform: "uppercase", letterSpacing: ".4px",
          }}>
            {greeting} · {dateLabel}
          </div>
          <ThemeToggleButton compact />
        </div>

        {/* Row 2: name + connection chips on left, fitness chips on right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>

          {/* Left: name + ICU + TP */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              fontSize: 34, fontWeight: 900, color: "var(--m-text)",
              letterSpacing: "-1px", lineHeight: 1,
            }}>
              {firstName ?? "Athlete"}
            </div>
            <div style={{ display: "flex", gap: 5, paddingTop: 2 }}>
              {/* ICU chip */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 9px", borderRadius: 6,
                background: icuConnected ? "rgba(34,211,238,0.08)" : "rgba(100,116,139,0.08)",
                border: `1px solid ${icuConnected ? "rgba(34,211,238,0.3)" : "rgba(100,116,139,0.2)"}`,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: icuConnected ? "#22d3ee" : "#64748b", flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: icuConnected ? "#22d3ee" : "#64748b", letterSpacing: ".06em" }}>ICU</span>
              </div>
              {/* TP chip */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 9px", borderRadius: 6,
                background: tpConnected ? "rgba(59,130,246,0.08)" : "rgba(100,116,139,0.08)",
                border: `1px solid ${tpConnected ? "rgba(59,130,246,0.3)" : "rgba(100,116,139,0.2)"}`,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: tpConnected ? "#3b82f6" : "#64748b", flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: tpConnected ? "#3b82f6" : "#64748b", letterSpacing: ".06em" }}>TP</span>
              </div>
            </div>
          </div>

          {/* Right: fitness metric chips */}
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            {ftp && (
              <div style={{
                background: "rgba(34,211,238,0.07)", border: "1px solid rgba(34,211,238,0.22)",
                borderRadius: 8, padding: "6px 11px", textAlign: "center", minWidth: 58,
              }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: "#22d3ee", lineHeight: 1, letterSpacing: "-.5px" }}>{ftp}W</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(34,211,238,0.55)", textTransform: "uppercase", letterSpacing: ".1em", marginTop: 2 }}>FTP</div>
              </div>
            )}
            {currentPhase && (
              <div style={{
                background: "rgba(255,90,31,0.07)", border: "1px solid rgba(255,90,31,0.22)",
                borderRadius: 8, padding: "6px 11px", textAlign: "center", minWidth: 58,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: ZO, lineHeight: 1 }}>{currentPhase}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,90,31,0.55)", textTransform: "uppercase", letterSpacing: ".1em", marginTop: 2 }}>
                  {weekDisplayNum != null ? `Week ${weekDisplayNum}` : "Phase"}
                </div>
              </div>
            )}
            {weekWorkoutCount > 0 && (
              <div style={{
                background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.22)",
                borderRadius: 8, padding: "6px 11px", textAlign: "center", minWidth: 48,
              }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: "#8b5cf6", lineHeight: 1 }}>{weekWorkoutCount}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(139,92,246,0.55)", textTransform: "uppercase", letterSpacing: ".1em", marginTop: 2 }}>Sessions</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
