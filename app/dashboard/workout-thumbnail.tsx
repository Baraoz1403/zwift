import type { WorkoutStructureBlock } from "@/lib/zwo";

const ZONE_COLORS: Record<string, string> = {
  warmup:      "#94a3b8",
  steadystate: "#3b82f6",
  intervals:   "#10b981",
  cooldown:    "#94a3b8",
  free:        "#64748b",
};

function getBarColor(powerFtp: number): string {
  if (powerFtp < 0.6)  return "#94a3b8"; // Z1
  if (powerFtp < 0.76) return "#3b82f6"; // Z2
  if (powerFtp < 0.88) return "#06b6d4"; // Z3 Tempo
  if (powerFtp < 0.95) return "#10b981"; // Z4 Sweet Spot
  if (powerFtp < 1.05) return "#f59e0b"; // Z5 Threshold
  if (powerFtp < 1.20) return "#f97316"; // Z6 VO2max
  return "#ef4444";                       // Z7 Sprint
}

interface Props {
  structure?: WorkoutStructureBlock[];
  durationMin?: number;
  type?: string;
}

export default function WorkoutThumbnail({ structure, durationMin = 60, type }: Props) {
  // Build segments from structure
  const segments: { widthPct: number; color: string; height: number }[] = [];

  if (structure && structure.length > 0) {
    const totalMin = structure.reduce((acc, b) => {
      if (b.type === "intervals" && b.repeats && b.onSec && b.offSec) {
        return acc + (b.repeats * (b.onSec + b.offSec)) / 60;
      }
      return acc + (b.durationMin || 5);
    }, 0);

    for (const block of structure) {
      if (block.type === "intervals" && block.repeats && block.onSec && b.offSec) {
        for (let i = 0; i < block.repeats; i++) {
          const onMin = (block.onSec || 60) / 60;
          const offMin = (block.offSec || 60) / 60;
          segments.push({ widthPct: (onMin / totalMin) * 100, color: getBarColor(block.powerFtp || 0.9), height: 80 + (block.powerFtp || 0.9) * 20 });
          segments.push({ widthPct: (offMin / totalMin) * 100, color: getBarColor(block.recoveryPowerFtp || 0.5), height: 30 });
        }
      } else {
        const dur = block.durationMin || 5;
        const h = 20 + (block.powerFtp || 0.65) * 80;
        segments.push({ widthPct: (dur / totalMin) * 100, color: getBarColor(block.powerFtp || 0.65), height: h });
      }
    }
  } else {
    // Fallback: simple shape based on type
    const shapes: Record<string, { widthPct: number; color: string; height: number }[]> = {
      "Sweet Spot": [
        {widthPct:15,color:"#94a3b8",height:30},{widthPct:25,color:"#10b981",height:85},
        {widthPct:10,color:"#3b82f6",height:30},{widthPct:25,color:"#10b981",height:85},
        {widthPct:10,color:"#3b82f6",height:30},{widthPct:15,color:"#94a3b8",height:25},
      ],
      "Threshold": [
        {widthPct:15,color:"#94a3b8",height:30},{widthPct:20,color:"#f59e0b",height:90},
        {widthPct:8,color:"#3b82f6",height:30},{widthPct:20,color:"#f59e0b",height:90},
        {widthPct:8,color:"#3b82f6",height:30},{widthPct:20,color:"#f59e0b",height:90},
        {widthPct:9,color:"#94a3b8",height:25},
      ],
      "Sprint": [
        {widthPct:20,color:"#94a3b8",height:30},
        ...[...Array(8)].flatMap(()=>[{widthPct:6,color:"#ef4444",height:100},{widthPct:5,color:"#3b82f6",height:20}]),
        {widthPct:10,color:"#94a3b8",height:25},
      ],
      "Zone 2": [
        {widthPct:12,color:"#94a3b8",height:25},
        {widthPct:76,color:"#3b82f6",height:55},
        {widthPct:12,color:"#94a3b8",height:25},
      ],
    };
    const key = Object.keys(shapes).find(k => (type || "").includes(k)) || "Zone 2";
    segments.push(...shapes[key]);
  }

  const total = segments.reduce((a, s) => a + s.widthPct, 0);

  return (
    <div style={{
      width: "100%", height: 120,
      background: "#f8fafc",
      display: "flex", alignItems: "flex-end",
      padding: "12px 16px 0",
      gap: 2,
      borderRadius: "12px 12px 0 0",
    }}>
      {segments.map((seg, i) => (
        <div key={i} style={{
          flex: seg.widthPct / total,
          height: `${seg.height}%`,
          background: seg.color,
          borderRadius: "3px 3px 0 0",
          transition: "height 0.4s ease",
          minWidth: 2,
        }} />
      ))}
    </div>
  );
}