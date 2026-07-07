"use client";

/**
 * TrainingProfileNavChip — scrolls to the training-profile card and opens
 * the edit form by dispatching an event that TrainingProfileCard listens for.
 */
export default function TrainingProfileNavChip() {
  function open() {
    const el = document.getElementById("training-profile");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent("zwift:open-training-profile"));
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
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      Training Profile
    </button>
  );
}
