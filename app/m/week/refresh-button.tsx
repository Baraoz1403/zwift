"use client";
import { useRouter } from "next/navigation";

export default function MobileRefreshButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.refresh()}
      style={{
        background: "none", border: "none", cursor: "pointer",
        padding: "6px 8px", borderRadius: 6,
        color: "var(--m-muted)",
        WebkitTapHighlightColor: "transparent",
        display: "flex", alignItems: "center",
        fontSize: 20, lineHeight: 1,
      }}
      title="Refresh"
    >
      ↻
    </button>
  );
}
