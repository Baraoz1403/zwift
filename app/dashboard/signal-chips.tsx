"use client";

const SIGNALS = [
  {
    label: "Ride history",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <polyline points="2,15 7,9 11,12 15,6 18,8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "Training load",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M10 10V6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
        <path d="M10 10L13.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: "Training phase",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
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
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/>
        <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="10" cy="10" r="1.3" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: "Adherence",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <path d="M4 10.5L8.5 15L16.5 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: "HR analysis",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <path d="M10 17s-7-4.35-7-9a5 5 0 0 1 7-4.58A5 5 0 0 1 17 8c0 4.65-7 9-7 9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M4 10h2.5l1.5-2 2 4 1.5-2H16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function SignalChips() {
  return (
    <>
      {SIGNALS.map(({ label, icon }) => (
        <div key={label} className="stat-card">
          <div className="stat-card-head">
            <div className="stat-card-icon c-blue">
              {icon}
            </div>
            <div className="label" style={{ margin: 0, fontSize: 10, letterSpacing: "0.06em", color: "var(--accent)", fontWeight: 700 }}>
              AI signal
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginTop: 4 }}>
            {label}
          </div>
        </div>
      ))}
    </>
  );
}
