"use client";
import { useEffect, useState } from "react";
import DashboardNavTabs from "./dashboard-nav-tabs";
import ConnectionsNavChip from "./connections-nav-chip";
import LogoutButton from "./logout-button";

// Unified accent palette - one source of truth for all slides
const C = { cyan: "#00D4FF", purple: "#7C3AED", gold: "#F59E0B", pink: "#F43F5E" };

const SLIDES = [
  {
    tag: "THE AI KNOWS YOUR BODY",
    lines: ["Tired today?", "It already knows.", "You don't have to."],
    sub: "CTL, ATL, TSB — your real fitness state computed from every ride. The coach reads your readiness before writing a single interval.",
  },
  {
    tag: "NOT A PLAN. A PRESCRIPTION.",
    lines: ["Your FTP.", "Your history.", "Your exact session."],
    sub: "Every power target calculated from your actual numbers. Sweet Spot when you're ready. Recovery when you're not. The system decides — correctly.",
  },
  {
    tag: "YOUR GOALS. EVERY SESSION.",
    lines: ["Lose fat.", "Build power.", "Or both."],
    sub: "Set your goals once. The AI structures every week around them — then syncs the plan to Zwift, Intervals.icu and TrainingPeaks automatically.",
  },
];

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// ─── Circular arc gauge ──────────────────────────────────────────────────────
function ArcGauge({
  value, max, label, unit, color,
}: { value: number; max: number; label: string; unit: string; color: string }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const filled = (value / max) * arcLen;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: 96, height: 96 }}>
        <svg width="96" height="96" viewBox="0 0 96 96" style={{ overflow: "visible" }}>
          {/* Track */}
          <circle
            cx="48" cy="48" r={r}
            fill="none"
            stroke={`${color}1a`}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${circ}`}
            transform="rotate(135 48 48)"
          />
          {/* Value arc */}
          <circle
            cx="48" cy="48" r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circ}`}
            transform="rotate(135 48 48)"
            style={{
              filter: `drop-shadow(0 0 6px ${color}99)`,
              transition: "stroke-dasharray 0.5s ease",
            }}
          />
          {/* Tick at top of arc (135° from 3-o'clock = just past bottom-left) */}
        </svg>

        {/* Center value */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            fontSize: 20, fontWeight: 800, color: "#F8FAFC",
            fontVariantNumeric: "tabular-nums", lineHeight: 1,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}>{value}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            color, marginTop: 2,
          }}>{unit}</span>
        </div>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "rgba(248,250,252,0.4)",
      }}>{label}</span>
    </div>
  );
}

// ─── Metric row (label + value, no fill bar) ─────────────────────────────────
function MetricRow({ label, display, color }: {
  label: string; display: string; color: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 0", borderBottom: "1px solid rgba(248,250,252,0.06)",
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase", color: "rgba(248,250,252,0.42)",
        fontFamily: "'SF Mono', 'Fira Code', monospace",
      }}>{label}</span>
      <span style={{
        fontSize: 16, fontWeight: 800, color,
        fontVariantNumeric: "tabular-nums",
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        textShadow: `0 0 14px ${color}70`,
      }}>{display}</span>
    </div>
  );
}

// ─── ECG waveform ────────────────────────────────────────────────────────────
function EcgStrip({ phase }: { phase: number }) {
  // Encode one ECG beat cycle as relative deltas; repeat it to fill the strip
  const beat = [
    [0, 0], [8, 0], [10, -2], [12, 0],   // P wave
    [14, 0], [15, 5], [16, -14], [17, 8], // QRS
    [19, 0], [22, 0], [25, -4], [28, 0],  // T wave
    [37, 0],                               // next beat start
  ] as [number, number][];

  const W = 240;
  const MID = 16;
  const pts: string[] = [];

  for (let rep = -1; rep <= 2; rep++) {
    for (const [dx, dy] of beat) {
      const x = (rep * 37 + dx + phase * 4) % (W + 40) - 20;
      pts.push(`${x.toFixed(1)},${(MID + dy).toFixed(1)}`);
    }
  }

  return (
    <div style={{ borderTop: "1px solid rgba(248,250,252,0.05)", paddingTop: 10, overflow: "hidden" }}>
      <div style={{
        fontSize: 11, color: "rgba(248,250,252,0.32)", marginBottom: 4,
        fontFamily: "'SF Mono', 'Fira Code', monospace", letterSpacing: "0.12em",
      }}>ECG · REAL-TIME</div>
      <svg width="100%" height="32" viewBox="0 0 240 32" preserveAspectRatio="none" style={{ overflow: "hidden" }}>
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={C.cyan}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${C.cyan}aa)` }}
        />
      </svg>
    </div>
  );
}

// ─── Live telemetry panel ────────────────────────────────────────────────────
function TelemetryPanel() {
  const [power, setPower]     = useState(215);
  const [hr, setHr]           = useState(148);
  const [cadence, setCadence] = useState(88);
  const [speed, setSpeed]     = useState(31.4);
  const [ecgPhase, setPhase]  = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPower(p   => Math.round(clamp(p + (Math.random() * 22 - 10), 175, 275)));
      setHr(h      => Math.round(clamp(h + (Math.random() * 6 - 3), 136, 164)));
      setCadence(c => Math.round(clamp(c + (Math.random() * 5 - 2.5), 80, 98)));
      setSpeed(s   => +clamp(s + (Math.random() * 1.8 - 0.8), 26, 36).toFixed(1));
      setPhase(p   => (p + 1) % 37);
    }, 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      background: "rgba(4, 9, 26, 0.72)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      border: `1px solid ${C.cyan}28`,
      borderRadius: 16,
      padding: "18px 20px 16px",
      position: "relative",
      overflow: "hidden",
      boxShadow: `0 0 0 1px rgba(0,212,255,0.06), 0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(0,212,255,0.12)`,
    }}>
      {/* Corner glow */}
      <div style={{
        position: "absolute", top: 0, right: 0, width: 120, height: 120,
        background: `radial-gradient(circle at 100% 0%, ${C.purple}20, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Panel header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", background: C.cyan,
            boxShadow: `0 0 10px ${C.cyan}`,
            animation: "hbLivePulse 1.4s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.18em",
            color: C.cyan, fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}>LIVE · NEURAL ANALYSIS</span>
        </div>
        <span style={{
          fontSize: 10, color: "rgba(248,250,252,0.3)",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}>AI v3.1</span>
      </div>

      {/* Circular gauges */}
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 16 }}>
        <ArcGauge value={power} max={350} label="Power" unit="W"   color={C.cyan} />
        <ArcGauge value={hr}    max={200} label="Heart Rate" unit="bpm" color={C.pink} />
      </div>

      {/* Metric rows */}
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 14 }}>
        <MetricRow label="Cadence" display={`${cadence} rpm`} color={C.purple} />
        <MetricRow label="Speed"   display={`${speed} km/h`} color={C.gold} />
      </div>

      <EcgStrip phase={ecgPhase} />
    </div>
  );
}

// ─── Hero Banner ─────────────────────────────────────────────────────────────
export default function HeroBanner({ firstName }: { firstName?: string | null }) {
  const [idx, setIdx] = useState(0);
  const s = SLIDES[idx];

  return (
    <div
      className="hero-banner-fullbleed"
      style={{
        background: `linear-gradient(140deg, #030c1e 0%, #09162e 55%, #04091a 100%)`,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minHeight: 308,
        marginBottom: 32,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      }}
    >
      {/* ── Aurora blobs ────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: -100, right: "8%",
        width: 480, height: 480, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.purple}28 0%, transparent 62%)`,
        filter: "blur(50px)", pointerEvents: "none",
        animation: "hbAurora 9s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: -80, left: "2%",
        width: 360, height: 360, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.cyan}14 0%, transparent 60%)`,
        filter: "blur(40px)", pointerEvents: "none",
        animation: "hbAurora 12s ease-in-out infinite reverse",
      }} />
      <div style={{
        position: "absolute", top: "30%", left: "38%",
        width: 220, height: 220, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.gold}0e 0%, transparent 70%)`,
        filter: "blur(30px)", pointerEvents: "none",
        animation: "hbAurora 15s ease-in-out infinite 2s",
      }} />

      {/* ── Neural grid ─────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.055) 1px, transparent 1px)
        `,
        backgroundSize: "42px 42px",
        WebkitMaskImage: `radial-gradient(ellipse 95% 85% at 68% 25%, black 0%, transparent 78%)`,
        maskImage: `radial-gradient(ellipse 95% 85% at 68% 25%, black 0%, transparent 78%)`,
      }} />

      {/* ── Bottom glow edge ────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${C.cyan}35, ${C.purple}35, transparent)`,
        pointerEvents: "none",
      }} />

      {/* ── Full-bleed container — content reaches page edges */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        width: "100%", padding: "0 24px",
        position: "relative", zIndex: 3,
      }}>

      {/* ── Nav row ─────────────────────────────────────────────────────── */}
      <div className="banner-nav" style={{
        display: "flex", alignItems: "center",
        gap: 8, margin: "16px 0 0",
      }}>
        {/* Left: Brand chip + greeting */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 9,
            background: `linear-gradient(135deg, ${C.purple}30, ${C.cyan}18)`,
            border: `1px solid ${C.cyan}38`,
            borderRadius: 10, padding: "6px 14px",
            boxShadow: `0 0 22px ${C.cyan}12, inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: `linear-gradient(135deg, ${C.purple}, ${C.cyan})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 14px ${C.cyan}40`,
            }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="white">
                <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
              </svg>
            </div>
            <span style={{
              fontSize: 11.5, fontWeight: 800, letterSpacing: "0.15em",
              color: "rgba(248,250,252,0.92)", whiteSpace: "nowrap",
            }}>AI TRAINING COACH</span>
          </div>
          {firstName && (
            <span style={{ fontSize: 12.5, color: "rgba(248,250,252,0.42)", letterSpacing: "0.02em" }}>
              Hi, {firstName}
            </span>
          )}
        </div>

        {/* Right: Nav */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <DashboardNavTabs />
          <ConnectionsNavChip />
          <LogoutButton />
        </div>
      </div>

      {/* ── Main content row ────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "stretch", flexWrap: "wrap", gap: 28,
      }}>
        {/* Left — copy block */}
        <div style={{
          flex: "0 0 58%", padding: "26px 0 28px",
          position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <div>
            {/* Tag pill */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: `linear-gradient(90deg, ${C.cyan}16, ${C.purple}16)`,
              border: `1px solid ${C.cyan}48`,
              borderRadius: 20, padding: "5px 16px", marginBottom: 20,
              boxShadow: `0 0 24px ${C.cyan}18`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: C.cyan, boxShadow: `0 0 10px ${C.cyan}`,
                animation: "hbLivePulse 1.6s ease-in-out infinite",
              }} />
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: "0.24em",
                color: C.cyan, textTransform: "uppercase",
              }}>{s.tag}</span>
            </div>

            {/* Headline lines */}
            {s.lines.map((line, i) => {
              const isLast = i === s.lines.length - 1;
              return (
                <div
                  key={i}
                  style={{
                    fontSize: isLast ? 56 : 44,
                    fontWeight: 900,
                    lineHeight: 1.0,
                    letterSpacing: isLast ? "-2px" : "-1.5px",
                    // Last line: gradient text (cyan → ice blue)
                    ...(isLast
                      ? {
                          background: `linear-gradient(100deg, ${C.cyan} 0%, #B8F0FF 60%, ${C.cyan} 100%)`,
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                          filter: `drop-shadow(0 0 28px ${C.cyan}55)`,
                          backgroundSize: "200% 100%",
                          animation: "hbGradShift 4s ease-in-out infinite",
                        }
                      : {
                          color: "#F8FAFC",
                          textShadow: "0 2px 14px rgba(0,0,0,0.5)",
                        }),
                    transition: "color 0.3s",
                  }}
                >{line}</div>
              );
            })}

            <p style={{
              fontSize: 15.5, color: "rgba(248,250,252,0.58)",
              lineHeight: 1.65, margin: "20px 0 0",
              fontWeight: 400, maxWidth: 560,
            }}>{s.sub}</p>
          </div>

          {/* Slide navigation */}
          <div style={{ display: "flex", gap: 8, marginTop: 26 }}>
            {SLIDES.map((_, i) => (
              <button
                key={i} type="button" aria-label={`Show message ${i + 1}`}
                onClick={() => setIdx(i)}
                style={{ border: "none", cursor: "pointer", padding: 0, background: "transparent" }}
              >
                <div style={{
                  width: i === idx ? 38 : 7, height: 7, borderRadius: 4,
                  background: i === idx
                    ? `linear-gradient(90deg, ${C.cyan}, ${C.purple})`
                    : "rgba(248,250,252,0.18)",
                  transition: "width 0.35s ease, background 0.35s ease",
                  boxShadow: i === idx ? `0 0 12px ${C.cyan}55` : undefined,
                }} />
              </button>
            ))}
          </div>
        </div>

        {/* Right — telemetry card */}
        <div style={{
          flex: "0 0 calc(42% - 28px)", padding: "20px 0",
          display: "flex", alignItems: "center",
          position: "relative", zIndex: 1,
        }}>
          <div style={{ width: "100%" }}>
            <TelemetryPanel />
          </div>
        </div>
      </div>
      </div>{/* end inner constrained container */}

      {/* ── AI status ticker ─────────────────────────────────────────────── */}
      <div style={{
        position: "relative", zIndex: 3,
        borderTop: `1px solid ${C.cyan}18`,
        background: `linear-gradient(90deg, rgba(0,212,255,0.04) 0%, rgba(124,58,237,0.04) 100%)`,
        overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "center",
          animation: "hbTicker 40s linear infinite",
          whiteSpace: "nowrap", padding: "10px 0",
          gap: 0,
        }}>
          {/* Repeat twice so the scroll loops seamlessly */}
          {[0, 1].map(rep => (
            <span key={rep} style={{ display: "inline-flex", alignItems: "center", gap: 0 }}>
              {[
                { dot: C.cyan,   text: "NEURAL NET ACTIVE" },
                { dot: C.purple, text: "ADAPTIVE TRAINING ENGINE v3.1" },
                { dot: C.cyan,   text: "REAL-TIME POWER ANALYSIS" },
                { dot: C.gold,   text: "COGGAN 7-ZONE MODEL" },
                { dot: C.purple, text: "TSB · CTL · ATL TRACKING" },
                { dot: C.cyan,   text: "INTERVALS.ICU SYNC READY" },
                { dot: C.pink,   text: "PHYSIOLOGICAL LOAD MONITORING" },
                { dot: C.purple, text: "PROGRESSIVE OVERLOAD ALGORITHM" },
                { dot: C.cyan,   text: "PLAN PERSONALISATION ACTIVE" },
              ].map((item, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    padding: "0 36px",
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.14em",
                    color: "rgba(248,250,252,0.55)",
                    fontFamily: "'SF Mono','Fira Code',monospace",
                    textTransform: "uppercase",
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: item.dot, boxShadow: `0 0 8px ${item.dot}`,
                    }} />
                    {item.text}
                  </span>
                  <span style={{ color: "rgba(248,250,252,0.15)", fontSize: 14 }}>·</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── Keyframes ───────────────────────────────────────────────────── */}
      <style>{`
        @keyframes hbLivePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.25; transform: scale(0.7); }
        }
        @keyframes hbAurora {
          0%, 100% { transform: scale(1) rotate(0deg);   opacity: 0.7; }
          50%       { transform: scale(1.18) rotate(9deg); opacity: 1; }
        }
        @keyframes hbGradShift {
          0%, 100% { background-position: 0% 50%; }
          50%       { background-position: 100% 50%; }
        }
        @keyframes hbTicker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
