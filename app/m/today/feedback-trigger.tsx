"use client";

/**
 * FeedbackTrigger
 *
 * Invisible client component that fires once when the Today page mounts.
 * Calls /api/m/feedback-check, which:
 *   - Fetches the athlete's recent Zwift activities
 *   - If there's a completed ride today and we haven't sent feedback yet,
 *     sends a WhatsApp message asking for RPE + comments
 *
 * This replaces the ICU webhook approach — athletes no longer need to
 * configure anything in Intervals.icu. Feedback just works.
 */
import { useEffect } from "react";

export default function FeedbackTrigger() {
  useEffect(() => {
    // Fire-and-forget: we don't need the result to render the page
    fetch("/api/m/feedback-check", {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      // Silently ignore — if this fails, the ICU webhook fallback still works
    });
  }, []); // runs once on mount, empty dep array

  return null;
}
