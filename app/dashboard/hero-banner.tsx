"use client";
import { useState } from "react";
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
    // "Who rides in the dark? Make it pop" — kept the dark banner shell
    // (matches the rest of the site's premium banner language) but the
    // accent itself is now a hot, energetic red instead of brown-orange.
    accent: "#FF3B5C",
    bg: "linear-gradient(135deg, #1a0508 0%, #2d0d16 60%, #1a0810 100%)",
    tag: "ZERO MANUAL STEPS",
    lines: ["Generate.", "Sync.", "Ride."],
    sub: "Plans push to Zwift every Sunday night automatically. Just show up.",
  },
];

function CyclistSVG({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      {/* Trainer base */}
      <ellipse cx="150" cy="200" rx="100" ry="8" fill={accent} fillOpacity="0.15" />
      <rect x="80" y="185" width="140" height="8" rx="4" fill={accent} fillOpacity="0.3" />
      <rect x="100" y="165" width="8" height="30" rx="3" fill="#334155" />
      <rect x="192" y="165" width="8" height="30" rx="3" fill="#334155" />
      {/* Rear wheel */}
      <circle cx="110" cy="165" r="35" stroke="#334155" strokeWidth="4" fill="none" />
      <circle cx="110" cy="165" r="25" stroke={accent} strokeWidth="2" fill="none" strokeOpacity="0.4" />
      <circle cx="110" cy="165" r="5" fill={accent} fillOpacity="0.8" />
      {/* Front wheel */}
      <circle cx="210" cy="155" r="30" stroke="#334155" strokeWidth="4" fill="none" />
      <circle cx="210" cy="155" r="20" stroke={accent} strokeWidth="2" fill="none" strokeOpacity="0.4" />
      <circle cx="210" cy="155" r="5" fill={accent} fillOpacity="0.8" />
      {/* Frame */}
      <line x1="110" y1="165" x2="160" y2="120" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
      <line x1="160" y1="120" x2="210" y2="155" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
      <line x1="160" y1="120" x2="155" y2="90" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
      <line x1="110" y1="165" x2="155" y2="90" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
      {/* Handlebar */}
      <line x1="155" y1="90" x2="200" y2="80" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
      <line x1="195" y1="75" x2="205" y2="85" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeOpacity="0.8" />
      {/* Seat */}
      <line x1="155" y1="90" x2="140" y2="75" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
      <rect x="128" y="68" width="28" height="7" rx="3" fill="#64748b" />
      {/* Rider body */}
      <ellipse cx="168" cy="70" rx="10" ry="10" fill="#94a3b8" />
      <line x1="168" y1="80" x2="158" y2="110" stroke="#94a3b8" strokeWidth="8" strokeLinecap="round" />
      <line x1="158" y1="110" x2="145" y2="75" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
      <line x1="158" y1="110" x2="170" y2="130" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
      <line x1="168" y1="80" x2="185" y2="95" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
      <line x1="185" y1="95" x2="200" y2="82" stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" />
      <line x1="170" y1="130" x2="165" y2="150" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
      {/* Power data overlay */}
      <rect x="215" y="20" width="75" height="55" rx="8" fill={accent} fillOpacity="0.12" stroke={accent} strokeWidth="1" strokeOpacity="0.4" />
      <text x="252" y="42" textAnchor="middle" fill={accent} fontSize="18" fontWeight="800">215W</text>
      <text x="252" y="57" textAnchor="middle" fill="#64748b" fontSize="9">CURRENT POWER</text>
      <text x="252" y="70" textAnchor="middle" fill={accent} fontSize="11" fontWeight="600">90% FTP</text>
      {/* Pulse line */}
      <polyline points="10,110 25,110 35,90 45,130 55,80 65,120 75,110 90,110" stroke={accent} strokeWidth="2" fill="none" strokeOpacity="0.5" />
    </svg>
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
 * than two stacked bars.
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

      {/* ── Message + illustration ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", alignItems: "stretch" }}>
        {/* Left: text */}
        <div style={{flex:1,padding:"24px 40px 28px",position:"relative",zIndex:1,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
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

        {/* Right: cyclist illustration */}
        <div style={{width:320,padding:"20px 20px 20px 0",display:"flex",alignItems:"center",position:"relative",zIndex:1}}>
          <CyclistSVG accent={s.accent} />
        </div>
      </div>
    </div>
  );
}
