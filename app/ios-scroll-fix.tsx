"use client";

/**
 * IOSScrollFix
 *
 * iOS Safari ignores `overscroll-behavior: none` on the viewport.
 * It rubber-bands (bounces) the entire page even when html/body are
 * position:fixed + overflow:hidden — because the effect happens at the
 * compositor layer, not in the DOM.
 *
 * This component attaches a `touchmove` listener with `passive: false`
 * so it can call `preventDefault()` — which is the only reliable way
 * to stop the bounce on iOS.
 *
 * Logic:
 *   - Walk up from the touch target to find the nearest scrollable ancestor.
 *   - If none found → prevent (nothing should scroll → no bounce).
 *   - If found → prevent only when at the scroll boundary in the direction
 *     of the gesture (prevents rubber-band past top/bottom of that container).
 */
import { useEffect } from "react";

export default function IOSScrollFix() {
  useEffect(() => {
    let startY = 0;

    const onStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
    };

    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      const deltaY = touch.clientY - startY;

      // Walk up DOM to find the nearest scrollable ancestor
      let el: HTMLElement | null = e.target as HTMLElement;
      while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const canScroll = (overflowY === "auto" || overflowY === "scroll") &&
                          el.scrollHeight > el.clientHeight;

        if (canScroll) {
          const atTop    = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

          // Prevent if gesture pushes past the boundary
          if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
            e.preventDefault();
          }
          return; // found a scrollable ancestor — let it handle the scroll
        }
        el = el.parentElement;
      }

      // No scrollable ancestor → prevent default to stop viewport bounce
      e.preventDefault();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove",  onMove,  { passive: false });

    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove",  onMove);
    };
  }, []);

  return null;
}
