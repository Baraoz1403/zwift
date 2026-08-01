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

            {/* ── Connection chips — logo + name + status ── */}
            {/* Zwift: always connected */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,90,31,0.10)", border: "1px solid rgba(255,90,31,0.25)",
              borderRadius: 10, padding: "7px 12px",
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,90,31,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="#FF5A1F">
                  <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-text)", lineHeight: 1 }}>Zwift</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#22c55e", marginTop: 2 }}>Connected</div>
              </div>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }}/>
            </div>

            {/* ICU: shown in teal when connected, muted grey otherwise */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: icuConnected ? "rgba(13,148,136,0.10)" : "rgba(100,116,139,0.08)",
              border: `1px solid ${icuConnected ? "rgba(13,148,136,0.30)" : "rgba(100,116,139,0.20)"}`,
              borderRadius: 10, padding: "7px 12px",
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: icuConnected ? "rgba(13,148,136,0.15)" : "rgba(100,116,139,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={icuConnected ? "#0d9488" : "#64748b"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-text)", lineHeight: 1 }}>ICU</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: icuConnected ? "#22c55e" : "#64748b", marginTop: 2 }}>
                  {icuConnected ? "Connected" : "Not set up"}
                </div>
              </div>
              {icuConnected && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }}/>}
            </div>

            {/* Visual separator */}
            <div style={{ width: 1, height: 34, background: "var(--m-border)", margin: "0 2px" }} />

            {/* ── Metric cards — MetricCard style: var(--m-card) bg, neutral border, colored value, muted label.
                Matches the Profile page metric cards exactly (same composition, slightly smaller). ── */}
            {ftp && (
              <div style={{
                background: "var(--m-card)", border: "1px solid var(--m-border)",
                borderRadius: 10, padding: "6px 14px", textAlign: "center", minWidth: 58,
              }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: "#00C2FF", lineHeight: 1, letterSpacing: "-.5px" }}>{ftp}W</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>FTP</div>
              </div>
            )}
            {currentPhase && (() => {
              const phaseColor =
                currentPhase === "Recovery" ? "#f59e0b" :
                currentPhase === "Build"    ? "#ef4444" :
                                              "#818cf8";
              return (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderRadius: 10, padding: "6px 14px", textAlign: "center", minWidth: 60,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: phaseColor, lineHeight: 1 }}>{currentPhase}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>
                    {weekDisplayNum != null ? `Wk ${weekDisplayNum}` : "Phase"}
                  </div>
                </div>
              );
            })()}
            {weekWorkoutCount > 0 && (
              <div style={{
                background: "var(--m-card)", border: "1px solid var(--m-border)",
                borderRadius: 10, padding: "6px 14px", textAlign: "center", minWidth: 48,
              }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: ZO, lineHeight: 1 }}>{weekWorkoutCount}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>Sessions</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
