"use client";

/**
 * /connect-tp — same-origin landing page for the TrainingPeaks bookmarklet.
 *
 * WHY THIS EXISTS:
 * The bookmarklet runs on app.trainingpeaks.com and exchanges the user's
 * HttpOnly TP session cookie for a bearer token (same-origin call to TP's
 * own API — always works). The old flow then POSTed that token cross-origin
 * straight from app.trainingpeaks.com to this dashboard's API. That
 * cross-origin POST reliably failed ("Failed to fetch") even though CORS
 * headers were correctly configured server-side — most likely an edge/WAF
 * layer treating a script-initiated cross-origin credentialed POST as
 * suspicious, regardless of how it was triggered.
 *
 * THE FIX: instead of a cross-origin fetch, the bookmarklet does a plain
 * top-level navigation to this page, passing the token via a URL fragment
 * (#t=...&rt=...&exp=...). Fragments are never sent to any server — they
 * only exist client-side — so the token never touches the network in
 * transit here. Once this page loads on OUR OWN origin, it reads the
 * fragment and does a normal same-origin fetch POST to /api/trainingpeaks/connect.
 * Same-origin requests aren't subject to CORS at all, which removes the
 * whole failure class in one step.
 */

import { useEffect, useState } from "react";

type State = "working" | "ok" | "error" | "missing";

export default function ConnectTPPage() {
  const [state, setState] = useState<State>("working");
  const [message, setMessage] = useState("Connecting to TrainingPeaks…");

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const t = params.get("t");
    const rt = params.get("rt");
    const exp = params.get("exp");
    const aid = params.get("aid"); // athlete ID fetched client-side by the bookmarklet

    // Clear the fragment from the address bar immediately so the token
    // never lingers in browser history/autocomplete.
    window.history.replaceState(null, "", window.location.pathname);

    if (!t) {
      setState("missing");
      setMessage("No token found in the link. Please try the bookmarklet again.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/trainingpeaks/connect", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tpToken: t,
            refreshToken: rt || null,
            expiresIn: exp ? Number(exp) : null,
            athleteId: aid || null,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          setState("ok");
          setMessage(`Connected as ${data.athleteName ?? "TrainingPeaks user"}. Redirecting…`);
          setTimeout(() => { window.location.href = "/dashboard"; }, 1400);
        } else {
          setState("error");
          setMessage(data.error || "TrainingPeaks rejected the connection. Please try again.");
        }
      } catch (e) {
        setState("error");
        setMessage(e instanceof Error ? e.message : "Network error while connecting.");
      }
    })();
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", color: "var(--text)", fontFamily: "inherit", padding: 24,
    }}>
      <div className="stat-card" style={{ maxWidth: 420, width: "100%", padding: "28px 26px", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>
          {state === "working" && "⏳"}
          {state === "ok" && "✅"}
          {(state === "error" || state === "missing") && "⚠️"}
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
          {state === "ok" ? "TrainingPeaks connected" : "Connecting TrainingPeaks"}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          {message}
        </div>
        {(state === "error" || state === "missing") && (
          <a href="/dashboard" className="btn" style={{ marginTop: 16, display: "inline-flex", width: "auto", padding: "8px 18px", fontSize: 12.5, textDecoration: "none" }}>
            Back to dashboard
          </a>
        )}
      </div>
    </div>
  );
}
