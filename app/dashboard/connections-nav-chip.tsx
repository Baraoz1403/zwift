"use client";

/**
 * ConnectionsNavChip — header button that toggles the ConnectionsPanel.
 * Dispatches a custom event consumed by WeeklyPlan's event listener,
 * keeping the header (server component) decoupled from the panel state.
 */
export default function ConnectionsNavChip() {
  function toggle() {
    window.dispatchEvent(new CustomEvent("zwift:toggle-connections"));
  }

  return (
    <button
      type="button"
      className="header-nav-chip"
      onClick={toggle}
    >
      {/* Plug/link icon */}
      <svg
        width="13" height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--accent)", opacity: 0.8 }}
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      Connections
    </button>
  );
}
