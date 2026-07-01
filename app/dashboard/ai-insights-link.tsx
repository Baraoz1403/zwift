"use client";

import { IconBolt } from "./icons";

export default function AiInsightsLink() {
  return (
    <a
      href="#ai-insights"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        borderRadius: 10,
        border: "1px solid rgba(47,143,224,0.35)",
        background: "var(--accent)",
        fontSize: 13,
        fontWeight: 600,
        color: "#fff",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
      onClick={() => window.dispatchEvent(new Event("open-ai-insights"))}
    >
      <IconBolt size={13} />
      AI Insights
    </a>
  );
}
