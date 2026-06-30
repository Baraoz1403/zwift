"use client";

import { IconBolt } from "./icons";

/**
 * The header's "AI Insights" button needs to do two things: scroll down to
 * the section (plain #ai-insights anchor handles that) AND make sure the
 * panel is actually open when it gets there. The panel (ai-insights.tsx) is
 * a separate client component with its own "open" state that the user can
 * collapse - if they'd previously closed it, just scrolling to it would
 * land on the collapsed bar instead of the insights button/text. A custom
 * window event is the simplest way for this anchor to reach into that
 * other component's state without lifting it up through the server-component
 * page.tsx.
 */
export default function AiInsightsLink() {
  return (
    <a
      href="#ai-insights"
      className="btn"
      style={{
        width: "auto",
        padding: "7px 16px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "var(--accent)",
        color: "#fff",
        fontWeight: 400,
        fontSize: 13,
      }}
      onClick={() => window.dispatchEvent(new Event("open-ai-insights"))}
    >
      <IconBolt size={13} />
      AI Insights
    </a>
  );
}
