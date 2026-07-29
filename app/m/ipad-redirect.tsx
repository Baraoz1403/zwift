"use client";
import { useEffect } from "react";

const TABLET_MAP: Record<string, string> = {
  "/m/today":    "/tablet/today",
  "/m/week":     "/tablet/week",
  "/m/coach":    "/tablet/coach",
  "/m/profile":  "/tablet/profile",
  "/m/settings": "/tablet/settings",
};

/**
 * Client-side iPad detection + immediate redirect.
 *
 * WHY THIS EXISTS:
 * Middleware sets the device_hint cookie at login (via mobile-login.tsx).
 * But athletes who were already logged in before this fix deployed don't
 * have the cookie yet — the middleware never fires for them, so they see
 * the mobile layout on every iPad visit until they log out and back in.
 *
 * This component runs in useEffect (client-only, after hydration) on
 * every /m/* page load. If the device is an iPad it sets the cookie and
 * immediately redirects — no logout required. The cookie then persists
 * for 1 year so the middleware handles all future requests on its own.
 *
 * Safe for iPhones: maxTouchPoints check is fine on iPhone too — but
 * iPhone UA contains "iPhone", not "Macintosh", so the condition is only
 * true for iPads using the Macintosh UA (iPadOS 13+) or older iPads with
 * the explicit "iPad" UA.
 */
export default function IpadRedirect() {
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIPad =
      /iPad/i.test(ua) ||
      (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

    if (!isIPad) return;

    // Persist so middleware handles future requests without JS execution
    document.cookie = "device_hint=tablet; path=/; max-age=31536000; SameSite=Lax";

    const path = window.location.pathname;
    const base = Object.keys(TABLET_MAP).find(
      k => path === k || path.startsWith(k + "/"),
    );
    const dest = base ? TABLET_MAP[base] : "/tablet/today";
    window.location.replace(dest);
  }, []);

  return null;
}
