"use client";
import { useEffect, useState } from "react";
import DashboardNavTabs from "./dashboard-nav-tabs";
import ConnectionsNavChip from "./connections-nav-chip";
import LogoutButton from "./logout-button";

const SLIDES = [
  {
    accent: "#00E5FF",
    bg: "linear-gradient(135deg, #0a0e1a 0%, #0d1f3c 60%, #0a1628 100%)",
    tag: "POWERED BY AI",
    lines: ["Your Rides.", "Your Data.", "Your Coach."],
    sub: "Real-time training plans built from your Zwift performance — not templates.",
  },
  {
    accent: "#00FF9C",
    bg: "linear-gradient(135deg, #050d0a 0%, #0a1f16 60%, #071a10 100%)",
    tag: "STRUCTURED TRAINING",
    lines: ["Sweet Spot.", "Threshold.", "VO2max."],
    sub: "Progressive 8-week cycles. Every session has a purpose and a target.",
  },
  {
    // Was a muddy orange/brown (#FF6B35) — swapped for a vivid, inviting red.
    accent: "#FF3B5C",
    bg: "linear-gradient(135deg, #1a0508 0%, #2d0d16 60%, #1a0810 100%)",
    tag: "ZERO MANUAL STEPS",
    lines: ["Generate.", "Sync.", "Ride."],
    sub: "Plans push to Zwift every Sunday night automatically. Just show up.",
  },
];

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * LiveMetricsHUD — replaces the old hand-drawn bicycle illustration, which
 * read as flat and generic ("סתמי") no matter how it was styled. This is a
 * small animated telemetry panel instead — power/cadence/speed/heart-rate
 * numbers that tick and drift like a live ride feed, echoing an actual
 * Zwift/head-unit dashboard rather than a static drawing of a bike.
 */
function LiveMetricsHUD({ accent }: { accent: string }) {
  const [power, setPower] = useState(215);
  const [cadence, setCadence] = useState(88);
  const [speed, setSpeed] = useState(31.4);
  const [hr, setHr] = useState(148);

  useEffect(() => {
    const id = setInterval(() => {
      setPower((p) => Math.round(clamp(p + (Math.random() * 18 - 8), 175, 275)));
      setCadence((c) => Math.round(clamp(c + (Math.random() * 4 - 2), 80, 98)));
      setSpeed((s) => Math.round(clamp(s + (Math.random() * 1.4 - 0.6), 26, 36) * 10) / 10);
      setHr((h) => Math.round(clamp(h + (Math.random() * 5 - 2), 136, 164)));
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const stat = (icon: React.ReactNode, value: string, unit: string, label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `${accent}1c`, display: "flex", alignItems: "center", justifyContent: "center",
        color: accent,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 21, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</span>
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{unit}</span>
        </div>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );

  return (
    <div style={{
      width: "100%", borderRadius: 16,
      background: "rgba(255,255,255,0.035)", border: `1px solid ${accent}30`,
      padding: "18px 22px", position: "relative", overflow: "hidden",
      boxShadow: `0 0 30px ${accent}0c`,
    }}>
      <div style={{
        position: "absolute", inset: 0, opacity: 0.05, pointerEvents: "none",
        backgroundImage: `linear-gradient(${accent} 1px,transparent 1px),linear-gradient(90deg,${accent} 1px,transparent 1px)`,
        backgroundSize: "18px 18px",
      }} />

      {/* Live badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, position: "relative" }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", background: accent,
          boxShadow: `0 0 8px ${accent}`, animation: "heroLivePulse 1.4s ease-in-out infinite",
        }} />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: accent }}>LIVE SESSION</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, position: "relative" }}>
        {stat(
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
          String(power), "W", "Power",
        )}
        {stat(
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>,
          String(cadence), "rpm", "Cadence",
        )}
        {stat(
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 13l3-3"/><path d="M9 3h6"/></svg>,
          speed.toFixed(1), "km/h", "Speed",
        )}
        {stat(
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.7-10-9.3C.4 8.2 2.3 5 5.6 5c1.9 0 3.4 1 4.4 2.4C11 6 12.5 5 14.4 5c3.3 0 5.2 3.2 3.6 6.7C19.5 16.3 12 21 12 21z"/></svg>,
          String(hr), "bpm", "Heart rate",
        )}
      </div>

      <style>{`
        @keyframes heroLivePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

/**
 * HeroBanner — now doubles as the site's persistent header (rendered once
 * from app/dashboard/layout.tsx, shared by Coach + Stats). Previously this
 * lived inside weekly-plan.tsx (Coach page only) and auto-rotated through
 * its 3 messages on a 6s timer; per explicit feedback it no longer
 * auto-advances ("לא מתחלף") — the dots below are still clickable so the
 * 3 messages remain browsable, they just don't change on their own anymore.
 * The nav row (Coach/Stats tabs, Connections, Sign out) that used to live in
 * a separate plain <div className="dashboard-header"> is now built into the
 * top of this banner instead, so there's a single header element rather
 * than two stacked bars. The right-hand visual is a small animated
 * power/cadence/speed/HR "live" telemetry panel (LiveMetricsHUD) instead of
 * the earlier hand-drawn cyclist SVG, which never read as anything but flat
 * and generic no matter how it was restyled.
 */
export default function HeroBanner({ firstName }: { firstName?: string | null }) {
  const [idx, setIdx] = useState(0);
  const s = SLIDES[idx];

  return (
    <div style={{
      background: s.bg,
      borderRadius: 16,
      overflow: "hidden",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      minHeight: 260,
      marginBottom: 32,
      border: `1px solid ${s.accent}22`,
      boxShadow: `0 0 60px ${s.accent}10, 0 16px 48px rgba(0,0,0,0.4)`,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      transition: "background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease",
    }}>
      {/* Grid */}
      <div style={{ position:"absolute",inset:0,opacity:0.04,pointerEvents:"none",
        backgroundImage:`linear-gradient(${s.accent} 1px,transparent 1px),linear-gradient(90deg,${s.accent} 1px,transparent 1px)`,
        backgroundSize:"40px 40px"}} />
      {/* Glow */}
      <div style={{position:"absolute",top:-60,right:"25%",width:300,height:300,borderRadius:"50%",
        background:`radial-gradient(circle,${s.accent}18 0%,transparent 70%)`,pointerEvents:"none"}} />

      {/* ── Nav row: brand + persistent nav actions ─────────────────────── */}
      <div className="banner-nav" style={{
        position: "relative", zIndex: 2, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        padding: "18px 28px 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: s.accent, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 2px 10px ${s.accent}55`,
          }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="#0a0e1a">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
            </svg>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.85)" }}>
            AI TRAINING COACH
          </span>
          {firstName && (
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginLeft: 4 }}>
              · Hi, {firstName}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <DashboardNavTabs />
          <ConnectionsNavChip />
          <LogoutButton />
        </div>
      </div>

      {/* ── Message + live metrics panel ─────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
        {/* Left: text */}
        <div style={{flex:"1 1 320px",padding:"24px 40px 28px",position:"relative",zIndex:1,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,
              background:`${s.accent}18`,border:`1px solid ${s.accent}40`,
              borderRadius:20,padding:"4px 14px",marginBottom:20}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:s.accent,boxShadow:`0 0 8px ${s.accent}`}} />
              <span style={{fontSize:11,fontWeight:700,letterSpacing:"2px",color:s.accent}}>{s.tag}</span>
            </div>
            {s.lines.map((line, i) => (
              <div key={i} style={{
                fontSize: 36, fontWeight: 800, lineHeight: 1.1,
                color: i === s.lines.length - 1 ? s.accent : "white",
                textShadow: i === s.lines.length - 1 ? `0 0 24px ${s.accent}60` : "none",
              }}>{line}</div>
            ))}
            <p style={{fontSize:15,color:"#94a3b8",lineHeight:1.6,margin:"14px 0 0"}}>{s.sub}</p>
          </div>
          <div style={{display:"flex",gap:10,marginTop:24}}>
            {SLIDES.map((_,i)=>(
              <button key={i} type="button" aria-label={`Show message ${i + 1}`} onClick={()=>setIdx(i)} style={{border:"none",cursor:"pointer",padding:0,background:"transparent"}}>
                <div style={{width:i===idx?32:8,height:7,borderRadius:4,
                  background:i===idx?s.accent:"#334155",transition:"width .3s, background .3s"}} />
              </button>
            ))}
          </div>
        </div>

        {/* Right: live metrics panel */}
        <div style={{width:300,padding:"20px 24px 20px 0",display:"flex",alignItems:"center",position:"relative",zIndex:1,flex:"0 1 300px"}}>
          <LiveMetricsHUD accent={s.accent} />
        </div>
      </div>
    </div>
  );
}
