"use client";

import { IconBolt } from "./icons";

export default function AiInsightsLink() {
  return (
    <a
      href="#ai-insights"
      className="header-nav-chip"
      onClick={() => window.dispatchEvent(new Event("open-ai-insights"))}
    >
      <IconBolt size={13} />
      AI Insights
    </a>
  );
}
