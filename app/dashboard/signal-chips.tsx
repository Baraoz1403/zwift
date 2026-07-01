"use client";

const SIGNALS = [
  {
    label: "Ride history",
    icon: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <polyline points="2,15 7,9 11,12 15,6 18,8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Training load",
    icon: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M10 10V6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
        <path d="M10 10L13.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Training phase",
    icon: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M2 9h16" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <circle cx="7" cy="13" r="1.1" fill="currentColor"/>
        <circle cx="10" cy="13" r="1.1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Goals & schedule",
    icon: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/>
        <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="10" cy="10" r="1.3" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Last week's adherence",
    icon: (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        <path d="M4 10.5L8.5 15L16.5 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function SignalChips() {
  return (
    <div className="stat-card" style={{
      padding: "14px 22px",
      display: "flex",
      alignItems: "center",
      gap: 18,
      marginBottom: 24,
    }}>
      {/* Left label */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        color: "var(--accent)",
        whiteSpace: "nowrap",
      }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 1L7.3 4.4H11L8.3 6.5L9.3 10L6 8.1L2.7 10L3.7 6.5L1 4.4H4.7L6 1Z"/>
        </svg>
        AI reads 5 signals
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 24, background: "var(--border)", flexShrink: 0 }} />

      {/* 5 signal chips */}
      <div style={{ display: "flex", gap: 8, flex: 1 }}>
        {SIGNALS.map(({ label, icon }) => (
          <div
            key={label}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "rgba(47,143,224,0.03)",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            <span style={{ color: "var(--accent)", flexShrink: 0, display: "flex" }}>
              {icon}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
