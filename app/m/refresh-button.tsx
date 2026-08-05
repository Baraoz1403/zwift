"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function MobileRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function handleRefresh() {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
    });
    // Reset spin after 1.2s regardless
    setTimeout(() => setSpinning(false), 1200);
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={isPending}
      style={{
        background: "none", border: "none", cursor: "pointer",
        // 44×44 min touch target (iOS HIG)
        minWidth: 44, minHeight: 44,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 8,
        color: spinning ? "#FF5A1F" : "var(--m-muted)",
        WebkitTapHighlightColor: "transparent",
        fontSize: 24,
        lineHeight: 1,
        transition: "color 0.15s",
        // Prevent double-tap zoom
        touchAction: "manipulation",
      }}
      aria-label="Refresh"
    >
      <span
        style={{
          display: "inline-block",
          animation: spinning ? "spin 0.8s linear infinite" : "none",
        }}
      >
        ↻
      </span>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </button>
  );
}
