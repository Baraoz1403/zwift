"use client";
import { useEffect, useState } from "react";
import DashboardNavTabs from "./dashboard-nav-tabs";
import ConnectionsNavChip from "./connections-nav-chip";
import LogoutButton from "./logout-button";

// A different rich, saturated background per slide (blue / emerald / red) -
// a single unified background read as flat, and pale pastel versions of
// the green/red slides read as washed out. All three use the same
// dark-to-vivid-to-dark diagonal gradient treatment so they carry equal
// visual weight. Blue is the default/first slide. The nav row has its own
// dark glass backing (see .banner-nav in globals.css) so it stays legible
// regardless of which slide is showing, without needing its own per-slide
// variants.
const SLIDES = [
  {
    dark: true,
    bg: "linear-gradient(135deg, #0b2f6b 0%, #123f8f 55%, #0d1f4d 100%)",
    accent: "#5EC8FF",
    tag: "POWERED BY AI",
    lines: ["Your Rides.", "Your Data.", "Your Coach."],
    sub: "Real-time training plans built from your Zwift performance — not templates.",
  },
  {
    // Was a pale mint pastel - read as washed-out/weak. Same deep-to-mid
    // diagonal gradient treatment as the blue slide, just in a rich emerald
    // hue, so it carries the same visual weight instead of looking faded.
    dark: true,
    bg: "linear-gradient(135deg, #064e3b 0%, #059669 55%, #033a2c 100%)",
    accent: "#4ADE9E",
    tag: "STRUCTURED TRAINING",
    lines: ["Sweet Spot.", "Threshold.", "VO2max."],
    sub: "Progressive 8-week cycles. Every session has a purpose and a target.",
  },
  {
    // Orange didn't land - back to red, vivid and saturated (not the pale
    // pastel from earlier), same dark-to-vivid-to-dark treatment as the
    // other two slides.
    dark: true,
    bg: "linear-gradient(135deg, #7f1d2e 0%, #dc2626 55%, #450a12 100%)",
    accent: "#FF8FA3",
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

  // Solid white panel regardless of the slide's own background - it's the
  // one element on the banner meant to pop rather than blend, so it reads
  // the same (and stays maximally legible) whether it's sitting on the dark
  // blue slide or a light green/red one. Ticks quickly (900ms, was 1400ms)
  // so the numbers visibly feel "live" rather than idling.
  useEffect(() => {
    const id = setInterval(() => {
      setPower((p) => Math.round(clamp(p + (Math.random() * 22 - 10), 175, 275)));
      setCadence((c) => Math.round(clamp(c + (Math.random() * 5 - 2.5), 80, 98)));
      setSpeed((s) => Math.round(clamp(s + (Math.random() * 1.8 - 0.8), 26, 36) * 10) / 10);
      setHr((h) => Math.round(clamp(h + (Math.random() * 6 - 3), 136, 164)));
    }, 900);
    return () => clearInterval(id);
  }, []);

  const stat = (icon: React.ReactNode, value: string, unit: string, label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: accent, display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", boxShadow: `0 3px 10px ${accent}55`,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</span>
          <span style={{ fontSize: 11.5, color: "#64748b", fontWeight: 700 }}>{unit}</span>
        </div>
        <div style={{ fontSize: 10.5, color: "#94a3b8", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );

  return (
    <div style={{
      width: "100%", borderRadius: 8,
      background: "#fff",
      border: `1px solid rgba(15,23,42,0.06)`,
      padding: "18px 22px", position: "relative", overflow: "hidden",
      boxShadow: `0 14px 36px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.4)`,
    }}>
      {/* Live badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, position: "relative" }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", background: accent,
          boxShadow: `0 0 8px ${accent}`, animation: "heroLivePulse 1s ease-in-out infinite",
        }} />
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", color: accent }}>LIVE SESSION</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, position: "relative" }}>
        {stat(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
          String(power), "W", "Power",
        )}
        {stat(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>,
          String(cadence), "rpm", "Cadence",
        )}
        {stat(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 13l3-3"/><path d="M9 3h6"/></svg>,
          speed.toFixed(1), "km/h", "Speed",
        )}
        {stat(
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.7-10-9.3C.4 8.2 2.3 5 5.6 5c1.9 0 3.4 1 4.4 2.4C11 6 12.5 5 14.4 5c3.3 0 5.2 3.2 3.6 6.7C19.5 16.3 12 21 12 21z"/></svg>,
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
 * HeroBanner — the site's persistent header (rendered once from
 * app/dashboard/layout.tsx, shared by Coach + Stats). Full-bleed width
 * (edge-to-edge). Blue always shows first on load - no auto-advance timer
 * and no randomness, since a message that keeps changing while it's being
 * read was more distracting than useful. The dots below still let the
 * rider switch to the emerald/red messages manually at any time.
 */
export default function HeroBanner({ firstName }: { firstName?: string | null }) {
  // Blue (index 0) always shows first on load - no auto-advance timer and
  // no random pick. The dots below still let the rider switch manually.
  const [idx, setIdx] = useState(0);
  const s = SLIDES[idx];

  const headlineColor = s.dark ? "white" : "var(--text)";
  const subColor = s.dark ? "rgba(255,255,255,0.65)" : "var(--muted)";

  return (
    <div className="hero-banner-fullbleed" style={{
      background: s.bg,
      overflow: "hidden",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      minHeight: 260,
      marginBottom: 32,
      borderBottom: `1px solid ${s.accent}30`,
      boxShadow: `0 16px 40px rgba(0,0,0,0.18)`,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      transition: "background 0.5s ease, border-color 0.4s ease",
    }}>
      {/* Grid - white lines, like the original banners. Instead of one flat
          opacity everywhere, the intensity is masked so it visibly brightens
          near the glow (top-right) and fades elsewhere - a single flat
          value read as static/cheap; this gives it depth and a sense of
          light actually falling across the panel. */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)`,
        backgroundSize: "40px 40px",
        opacity: 0.22,
        WebkitMaskImage: `radial-gradient(ellipse 750px 520px at 80% 10%, black 0%, rgba(0,0,0,0.4) 45%, transparent 88%)`,
        maskImage: `radial-gradient(ellipse 750px 520px at 80% 10%, black 0%, rgba(0,0,0,0.4) 45%, transparent 88%)`,
        transition: "opacity 0.4s ease",
      }} />
      {/* Glow - same focal point as the grid brightening above, so the two
          read as one light source rather than two unrelated effects. */}
      <div style={{position:"absolute",top:-60,right:"20%",width:340,height:340,borderRadius:"50%",
        background:`radial-gradient(circle,${s.accent}2e 0%,transparent 70%)`,pointerEvents:"none",transition:"background 0.4s ease"}} />

      {/* ── Nav row: brand + persistent nav actions ─────────────────────── */}
      <div className="banner-nav" style={{
        position: "relative", zIndex: 2, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        margin: "18px 0 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            background: s.accent, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 2px 10px ${s.accent}55`, transition: "background 0.4s ease",
          }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="#0b1f4d">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
            </svg>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.9)" }}>
            AI TRAINING COACH
          </span>
          {firstName && (
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>
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
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", flexWrap: "wrap", maxWidth: 1100, width: "100%", margin: "0 auto" }}>
        {/* Left: text */}
        <div style={{flex:"1 1 320px",padding:"24px 0 28px",position:"relative",zIndex:1,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,
              background:`${s.accent}22`,border:`1.5px solid ${s.accent}60`,
              borderRadius:20,padding:"5px 16px",marginBottom:22,
              boxShadow:`0 0 16px ${s.accent}30`,
              transition:"background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:s.accent,
                boxShadow:`0 0 10px ${s.accent}, 0 0 4px #fff`}} />
              <span style={{fontSize:11.5,fontWeight:800,letterSpacing:"2.5px",color:s.accent,textTransform:"uppercase"}}>{s.tag}</span>
            </div>
            {s.lines.map((line, i) => (
              <div key={i} style={{
                fontSize: i === s.lines.length - 1 ? 46 : 40,
                fontWeight: 900, lineHeight: 1.05,
                letterSpacing: "-1px",
                color: i === s.lines.length - 1 ? s.accent : headlineColor,
                textShadow: i === s.lines.length - 1 && s.dark
                  ? `0 0 32px ${s.accent}80, 0 2px 8px rgba(0,0,0,0.3)`
                  : s.dark ? "0 2px 6px rgba(0,0,0,0.25)" : "none",
                transition: "color 0.3s ease",
              }}>{line}</div>
            ))}
            <p style={{fontSize:15.5,color:subColor,lineHeight:1.65,margin:"16px 0 0",fontWeight:400,maxWidth:420}}>{s.sub}</p>
          </div>
          <div style={{display:"flex",gap:10,marginTop:24}}>
            {SLIDES.map((_,i)=>(
              <button key={i} type="button" aria-label={`Show message ${i + 1}`} onClick={()=>setIdx(i)} style={{border:"none",cursor:"pointer",padding:0,background:"transparent"}}>
                <div style={{width:i===idx?40:8,height:7,borderRadius:4,
                  background:i===idx?s.accent:(s.dark ? "rgba(255,255,255,0.25)" : "rgba(15,23,42,0.15)"),transition:"width .3s, background .3s"}} />
              </button>
            ))}
          </div>
        </div>

        {/* Right: live metrics panel */}
        <div style={{width:300,padding:"20px 0",display:"flex",alignItems:"center",position:"relative",zIndex:1,flex:"0 1 300px"}}>
          <LiveMetricsHUD accent={s.accent} />
        </div>
      </div>
    </div>
  );
}
