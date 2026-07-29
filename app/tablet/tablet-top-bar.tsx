/**
 * TabletTopBar — full-width fixed header for all tablet pages.
 *
 * Shows (top-to-bottom):
 *   Row 1: greeting · date                             [theme toggle]
 *   Row 2: Athlete name (big)   [Zwift ✓] [ICU ✓]  [FTP] [Phase] [Sessions]
 *
 * Connection chips (Zwift, ICU) now match the metric chip style — same height,
 * same card look, green text + "Connected" label. TP removed: the app
 * integrates with Zwift and Intervals.icu only.
 *
 * Position: fixed top:0 left:0 right:0 z-index:70
 * Height:   94px inner + env(safe-area-inset-top)  → CSS var(--tablet-bar-h)
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
  greeting: string;
  dateLabel: string;
}

export function TabletTopBar({
  firstName, ftp, currentPhase, weekDisplayNum, weekWorkoutCount,
  icuConnected, greeting, dateLabel,
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

        {/* Row 2: name on left, connection + fitness chips on right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>

          {/* Left: athlete name only */}
          <div style={{
            fontSize: 34, fontWeight: 900, color: "var(--m-text)",
            letterSpacing: "-1px", lineHeight: 1,
          }}>
            {firstName ?? "Athlete"}
          </div>

          {/* Right: connection chips + metric chips */}
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>

            {/* ── Connection chips ── */}
            {/* Zwift: always connected (required to use the app) */}
            <div style={{
              background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.30)",
              borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 64,
            }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#22c55e", lineHeight: 1 }}>Zwift</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(34,197,94,0.75)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>Connected</div>
            </div>

            {/* ICU: shown in green when connected, muted grey otherwise */}
            <div style={{
              background: icuConnected ? "rgba(34,197,94,0.10)" : "rgba(100,116,139,0.08)",
              border: `1px solid ${icuConnected ? "rgba(34,197,94,0.30)" : "rgba(100,116,139,0.20)"}`,
              borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 64,
            }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: icuConnected ? "#22c55e" : "#64748b", lineHeight: 1 }}>ICU</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: icuConnected ? "rgba(34,197,94,0.75)" : "rgba(100,116,139,0.55)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>
                {icuConnected ? "Connected" : "Not set up"}
              </div>
            </div>

            {/* Visual separator */}
            <div style={{ width: 1, height: 34, background: "var(--m-border)", margin: "0 2px" }} />

            {/* ── Metric chips — colors match mobile profile metric cards exactly ── */}
            {ftp && (
              <div style={{
                background: "rgba(0,194,255,0.07)", border: "1px solid rgba(0,194,255,0.25)",
                borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 58,
              }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: "#00C2FF", lineHeight: 1, letterSpacing: "-.5px" }}>{ftp}W</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,194,255,0.65)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>FTP</div>
              </div>
            )}
            {currentPhase && (() => {
              // Same color logic as mobile profile metric cards
              const phaseColor =
                currentPhase === "Recovery" ? "#f59e0b" :
                currentPhase === "Build"    ? "#ef4444" :
                                              "#818cf8"; // Base
              const phaseAlpha =
                currentPhase === "Recovery" ? "rgba(245,158,11," :
                currentPhase === "Build"    ? "rgba(239,68,68,"  :
                                              "rgba(129,140,248,";
              return (
                <div style={{
                  background: `${phaseAlpha}0.07)`, border: `1px solid ${phaseAlpha}0.25)`,
                  borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 60,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: phaseColor, lineHeight: 1 }}>{currentPhase}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: `${phaseAlpha}0.65)`, textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>
                    {weekDisplayNum != null ? `Week ${weekDisplayNum}` : "Phase"}
                  </div>
                </div>
              );
            })()}
            {weekWorkoutCount > 0 && (
              <div style={{
                background: "rgba(255,90,31,0.07)", border: "1px solid rgba(255,90,31,0.25)",
                borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 48,
              }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: ZO, lineHeight: 1 }}>{weekWorkoutCount}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,90,31,0.65)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>Sessions</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
