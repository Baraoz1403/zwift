"use client";

/**
 * MobileWorkoutChart — rich SVG power-profile visualization for the mobile app.
 *
 * Replaces the generic WorkoutThumbnail with a proportional, zone-aware chart:
 *  • Each block drawn to its ACTUAL duration width (warmup takes 10min → 10min of x-axis)
 *  • Intervals expanded into individual on/off reps
 *  • Warmup/cooldown drawn as ramp polygons, not flat rectangles
 *  • Per-zone gradient fills: dark at base, full color at top, glow at peak
 *  • FTP reference line + power% labels on intervals
 *  • Zone distribution strip below the chart
 */

import type { WorkoutStructureBlock } from "@/lib/zwo";

// ── Zone system ─────────────────────────────────────────────────────────────

// Zone colors — standard cycling zone palette (matches Zwift / intervals.icu)
// Z1/Z2 are data-viz colors (not UI chrome), so meaningful zone colors apply here.
const ZONES = [
  { maxPct: 0.55, color: "#6b7280",   glow: "#9ca3af",   label: "Z1 Recovery"  },
  { maxPct: 0.75, color: "#3b82f6",   glow: "#60a5fa",   label: "Z2 Endurance" },
  { maxPct: 0.88, color: "#22c55e",   glow: "#4ade80",   label: "Z3 Tempo"     },
  { maxPct: 0.94, color: "#eab308",   glow: "#facc15",   label: "Z4 Sweet Spot"},
  { maxPct: 1.05, color: "#f97316",   glow: "#fb923c",   label: "Z5 Threshold" },
  { maxPct: 1.20, color: "#ef4444",   glow: "#f87171",   label: "Z6 VO2 Max"   },
  { maxPct: Infinity, color: "#9333ea", glow: "#a855f7", label: "Z7 Sprint"    },
];

function zoneFor(frac: number) {
  return ZONES.find(z => frac <= z.maxPct) ?? ZONES[ZONES.length - 1];
}

// ── Segment expansion ────────────────────────────────────────────────────────

type Seg =
  | { kind: "ramp"; startMin: number; durMin: number; powerFrom: number; powerTo: number }
  | { kind: "flat"; startMin: number; durMin: number; power: number };

function expandSegments(blocks: WorkoutStructureBlock[]): Seg[] {
  const segs: Seg[] = [];
  let cursor = 0;

  for (const b of blocks) {
    const d = b.durationMin;

    if (b.type === "warmup") {
      segs.push({ kind: "ramp", startMin: cursor, durMin: d, powerFrom: 0.45, powerTo: b.powerFtp });
      cursor += d;
    } else if (b.type === "cooldown") {
      segs.push({ kind: "ramp", startMin: cursor, durMin: d, powerFrom: b.powerFtp, powerTo: 0.40 });
      cursor += d;
    } else if (b.type === "intervals" && b.repeats && b.onSec && b.offSec) {
      const onMin = b.onSec / 60;
      const offMin = b.offSec / 60;
      const recPower = b.recoveryPowerFtp ?? 0.50;
      for (let r = 0; r < b.repeats; r++) {
        segs.push({ kind: "flat", startMin: cursor, durMin: onMin, power: b.powerFtp });
        cursor += onMin;
        segs.push({ kind: "flat", startMin: cursor, durMin: offMin, power: recPower });
        cursor += offMin;
      }
    } else {
      segs.push({ kind: "flat", startMin: cursor, durMin: d, power: b.powerFtp });
      cursor += d;
    }
  }
  return segs;
}

// ── SVG chart dimensions ─────────────────────────────────────────────────────

const VW = 1000;
const CHART_H = 220;    // bar chart area
const STRIP_Y = 234;    // zone distribution strip y
const STRIP_H = 10;     // zone strip height
const LABEL_Y = 262;    // time label baseline
const VH = 278;
const GAP = 4;          // gap between bars (in viewBox units)

// ── Main component ───────────────────────────────────────────────────────────

export default function MobileWorkoutChart({
  blocks,
  durationMin,
}: {
  blocks: WorkoutStructureBlock[];
  durationMin: number;
}) {
  if (!blocks || blocks.length === 0) return null;

  const segs = expandSegments(blocks);
  const totalMin = segs.reduce((s, g) => s + g.durMin, 0) || durationMin || 60;

  // Max power across all segments (for y-scaling)
  const maxPow = Math.max(
    1.25,
    ...segs.map(s => s.kind === "ramp" ? Math.max(s.powerFrom, s.powerTo) : s.power),
  );

  // FTP reference line position (y from top of chart area)
  const ftpY = CHART_H - (1.0 / maxPow) * CHART_H;

  // Helper: convert power fraction → chart y (bars grow UP from bottom)
  function powerY(p: number) {
    return CHART_H - Math.max(4, (p / maxPow) * CHART_H);
  }

  // Helper: convert time (min) → x coordinate
  function timeX(min: number) {
    return (min / totalMin) * VW;
  }

  // Helper: duration → width (minus gap)
  function durW(durMin: number) {
    return Math.max(2, (durMin / totalMin) * VW - GAP);
  }

  // Zone distribution: sum durMin per zone
  const zoneTotals = new Map<string, number>();
  segs.forEach(s => {
    const p = s.kind === "ramp" ? (s.powerFrom + s.powerTo) / 2 : s.power;
    const z = zoneFor(p);
    zoneTotals.set(z.color, (zoneTotals.get(z.color) ?? 0) + s.durMin);
  });

  // Gradient defs needed
  const usedZones = new Set(
    segs.map(s => {
      const p = s.kind === "ramp" ? (s.powerFrom + s.powerTo) / 2 : s.power;
      return zoneFor(p).color;
    })
  );

  // Time label positions
  const timeLabels = [
    { x: 0, label: "0" },
    { x: timeX(totalMin * 0.5), label: `${Math.round(totalMin / 2)}m` },
    { x: timeX(totalMin), label: `${Math.round(totalMin)}m` },
  ];

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: "100%", display: "block" }}
      preserveAspectRatio="none"
    >
      <defs>
        {/* Per-zone vertical gradients: dark at bottom, zone-colored at top */}
        {Array.from(usedZones).map(color => {
          const z = ZONES.find(x => x.color === color)!;
          return (
            <linearGradient key={color} id={`grad-${color.slice(1)}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity="0.15" />
              <stop offset="60%" stopColor={color} stopOpacity="0.70" />
              <stop offset="88%" stopColor={color} stopOpacity="0.90" />
              <stop offset="100%" stopColor={z.glow} stopOpacity="1" />
            </linearGradient>
          );
        })}
        {/* Warmup ramp gradient */}
        <linearGradient id="grad-warmup" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.85" />
        </linearGradient>
        {/* Cooldown ramp gradient */}
        <linearGradient id="grad-cooldown" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#1e40af" stopOpacity="0.20" />
        </linearGradient>
      </defs>

      {/* ── Background ─────────────────────────────────────────────────── */}
      <rect x="0" y="0" width={VW} height={CHART_H}
        fill="url(#bg-dark)" />
      {/* dark-to-slightly-lighter background */}
      <defs>
        <linearGradient id="bg-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0D1117" />
          <stop offset="100%" stopColor="#090d12" />
        </linearGradient>
      </defs>

      {/* ── Subtle horizontal grid lines ────────────────────────────────── */}
      {[0.25, 0.5, 0.75].map(frac => {
        const y = powerY(maxPow * frac);
        return (
          <line key={frac} x1="0" y1={y} x2={VW} y2={y}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        );
      })}

      {/* ── FTP reference line ───────────────────────────────────────────── */}
      <line x1="0" y1={ftpY} x2={VW} y2={ftpY}
        stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"
        strokeDasharray="12,8" />
      <text x="6" y={ftpY - 5} fill="rgba(255,255,255,0.35)"
        fontSize="28" fontWeight="700" fontFamily="system-ui">
        FTP
      </text>

      {/* ── Bars ────────────────────────────────────────────────────────── */}
      {segs.map((seg, i) => {
        const x = timeX(seg.startMin) + GAP / 2;
        const w = durW(seg.durMin);

        if (seg.kind === "ramp") {
          const yFrom = powerY(seg.powerFrom);
          const yTo   = powerY(seg.powerTo);
          const isWarmup = yFrom > yTo; // goes UP (powerTo higher)
          // Ramp drawn as polygon: bottom-left, bottom-right, top-right, top-left
          const pts = [
            `${x},${CHART_H}`,
            `${x + w},${CHART_H}`,
            `${x + w},${yTo}`,
            `${x},${yFrom}`,
          ].join(" ");
          return (
            <polygon key={i} points={pts}
              fill={`url(#grad-${isWarmup ? "warmup" : "cooldown"})`} />
          );
        }

        // Flat bar
        const z = zoneFor(seg.power);
        const y = powerY(seg.power);
        const h = CHART_H - y;
        const gradId = `grad-${z.color.slice(1)}`;

        // Rounded top: use path with arc for the top two corners
        const r = Math.min(6, h / 3, w / 3);
        const path = [
          `M ${x + r} ${y}`,
          `H ${x + w - r}`,
          `Q ${x + w} ${y} ${x + w} ${y + r}`,
          `V ${CHART_H}`,
          `H ${x}`,
          `V ${y + r}`,
          `Q ${x} ${y} ${x + r} ${y}`,
          "Z",
        ].join(" ");

        const pct = Math.round(seg.power * 100);

        return (
          <g key={i}>
            <path d={path} fill={`url(#${gradId})`} />
            {/* Power % label inside tall bars */}
            {h > 55 && pct > 0 && (
              <text
                x={x + w / 2}
                y={y + h / 2 + 10}
                textAnchor="middle"
                fill="rgba(255,255,255,0.75)"
                fontSize="30"
                fontWeight="700"
                fontFamily="system-ui"
              >
                {pct}%
              </text>
            )}
          </g>
        );
      })}

      {/* ── Interval count badge ────────────────────────────────────────── */}
      {blocks.filter(b => b.type === "intervals" && (b.repeats ?? 0) > 1).map((b, i) => {
        // Find start position of this block's segments
        let blockStart = 0;
        for (const ob of blocks) {
          if (ob === b) break;
          blockStart += ob.durationMin;
        }
        const bx = timeX(blockStart) + timeX(b.durationMin) / 2;
        const by = powerY(b.powerFtp) - 12;
        return (
          <g key={`badge-${i}`}>
            <rect x={bx - 36} y={by - 26} width={72} height={28} rx="7"
              fill="rgba(0,0,0,0.55)" />
            <text x={bx} y={by - 5} textAnchor="middle"
              fill="rgba(255,255,255,0.9)" fontSize="22" fontWeight="700"
              fontFamily="system-ui">
              {b.repeats}×
            </text>
          </g>
        );
      })}

      {/* ── Zone distribution strip ──────────────────────────────────────── */}
      {(() => {
        let stripX = 0;
        return Array.from(zoneTotals.entries()).map(([color, dur]) => {
          const w = (dur / totalMin) * VW;
          const el = (
            <rect key={color} x={stripX} y={STRIP_Y} width={w} height={STRIP_H}
              fill={color} opacity="0.85" />
          );
          stripX += w;
          return el;
        });
      })()}

      {/* ── Time labels ─────────────────────────────────────────────────── */}
      {timeLabels.map(({ x, label }) => (
        <text
          key={label}
          x={x === 0 ? 8 : x === timeX(totalMin) ? VW - 8 : x}
          y={LABEL_Y}
          textAnchor={x === 0 ? "start" : x === timeX(totalMin) ? "end" : "middle"}
          fill="rgba(148,163,184,0.6)"
          fontSize="26"
          fontFamily="system-ui"
          fontWeight="500"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}
