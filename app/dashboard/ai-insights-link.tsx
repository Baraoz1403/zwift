"use client";

import { IconBolt } from "./icons";

export default function AiInsightsLink() {
  return (
    <a
      href="#ai-insights"
      className="trend-tab active"
      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
      onClick={() => window.dispatchEvent(new Event("open-ai-insights"))}
    >
      <IconBolt size={13} />
      AI Insights
    </a>
  );
}
