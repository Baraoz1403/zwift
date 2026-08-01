"use client";

export type RideSummary = {
  name: string;
  date: string;       // YYYY-MM-DD
  durationMin: number;
  avgWatts: number | null;
  normalizedPower: number | null;
  avgHr: number | null;
  maxHr: number | null;
  tss: number | null;
  distanceKm: number | null;
};

function formatDuration(min: number): string {
  if (min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
    });
  } catch { return dateStr; }
}

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

function StatCard({ label, value, color = "var(--m-text)" }: StatCardProps) {
  return (
    <div style={{
      background: "var(--m-card-inner)",
      border: "1px solid var(--m-border)",
      borderRadius: 10, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 4,
      minWidth: 100,
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-0.5px" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
        {label}
      </div>
    </div>
  );
}

interface RideDetailPanelProps {
  ride: RideSummary | null;
  onClose: () => void;
}

export function RideDetailPanel({ ride, onClose }: RideDetailPanelProps) {
  if (!ride) return null;

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Modal card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--m-card)",
          border: "1px solid var(--m-border)",
          borderRadius: 16,
          padding: "28px 28px 24px",
          width: "100%", maxWidth: 480,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--m-text)", lineHeight: 1.2, letterSpacing: "-0.5px" }}>
              {ride.name}
            </div>
            <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 5, fontWeight: 500 }}>
              {formatDate(ride.date)}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
              color: "var(--m-muted)", fontSize: 18, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--m-border)", margin: "18px 0" }} />

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <StatCard
            label="Duration"
            value={formatDuration(ride.durationMin)}
            color="var(--m-text)"
          />
          {ride.avgWatts != null && ride.avgWatts > 0 && (
            <StatCard
              label="Avg Power"
              value={`${Math.round(ride.avgWatts)}W`}
              color="#22d3ee"
            />
          )}
          {ride.normalizedPower != null && ride.normalizedPower > 0 && (
            <StatCard
              label="NP"
              value={`${Math.round(ride.normalizedPower)}W`}
              color="#60a5fa"
            />
          )}
          {ride.avgHr != null && ride.avgHr > 0 && (
            <StatCard
              label="Avg HR"
              value={`${Math.round(ride.avgHr)} bpm`}
              color="#ef4444"
            />
          )}
          {ride.maxHr != null && ride.maxHr > 0 && (
            <StatCard
              label="Max HR"
              value={`${Math.round(ride.maxHr)} bpm`}
              color="#f97316"
            />
          )}
          {ride.tss != null && ride.tss > 0 && (
            <StatCard
              label="TSS"
              value={Math.round(ride.tss).toString()}
              color="#a78bfa"
            />
          )}
          {ride.distanceKm != null && ride.distanceKm > 0 && (
            <StatCard
              label="Distance"
              value={`${ride.distanceKm.toFixed(1)} km`}
              color="#34d399"
            />
          )}
        </div>

        {/* Footer hint */}
        <div style={{ marginTop: 20, fontSize: 12, color: "var(--m-muted)", textAlign: "center" }}>
          Tap outside to close
        </div>
      </div>
    </div>
  );
}
