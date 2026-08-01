"use client";

import { useEffect } from "react";

/**
 * Detects iPad client-side (maxTouchPoints covers modern iPadOS 13+ which
 * sends a Mac UA). Sets device_hint=tablet cookie so middleware routes
 * future visits directly to /tablet/today without this redirect hop.
 */
export default function IpadRedirect() {
  useEffect(() => {
    const isIpad =
      /iPad/.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

    if (isIpad) {
      document.cookie =
        "device_hint=tablet; path=/; max-age=31536000; SameSite=Lax";
      window.location.replace("/tablet/today");
    }
  }, []);

  return null;
}
