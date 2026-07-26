"use client";

/**
 * TodaysNoteNavChip — scrolls to the Today's Note card and opens the note
 * panel by dispatching an event that WeeklyPlan listens for.
 */
export default function TodaysNoteNavChip() {
  function open() {
    const el = document.getElementById("todays-note");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent("zwift:open-todays-note"));
  }

  return (
    <button type="button" className="header-nav-chip" onClick={open}>
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
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
      Today&apos;s Note
    </button>
  );
}
