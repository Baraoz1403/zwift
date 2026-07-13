"use client";

import { useState } from "react";

/**
 * Mandatory Intervals.icu connect screen - the ONLY thing a brand-new
 * athlete sees until they connect (see app/dashboard/layout.tsx, which
 * renders this instead of the normal dashboard chrome/children whenever
 * getIntervalsCredentials(athleteId) comes back null).
 *
 * Deliberately a single flat form, not the multi-step wizard in
 * ConnectionsPanel (open-settings-in-a-new-tab, come back, paste) - for a
 * rider who has never done this before, one banner + three numbered steps +
 * one input + one button is the whole interaction. ConnectionsPanel's wizard
 * still exists as-is for reconnecting/changing keys later from the normal
 * Connections nav chip, where a bit more hand-holding (auto-reading the
 * clipboard, step indicators) earns its complexity for a returning user.
 */
export default function IntervalsOnboarding() {
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const key = apiKey.trim();
    if (!key || connecting) return;

    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/intervals/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        // Re-run the server-side layout check - now that KV has a real
        // icu_key, it'll render the actual dashboard instead of this screen.
        window.location.reload();
      } else {
        setError(data.error ?? "Connection failed — check the key and try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error — try again.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "32px auto 0" }}>
      {/* Prominent banner */}
      <div style={{
        background: "var(--accent)", color: "#fff",
        borderRadius: 12, padding: "18px 22px",
        fontSize: 16, fontWeight: 800, textAlign: "center",
        marginBottom: 24,
        boxShadow: "0 4px 14px rgba(47,143,224,0.3)",
      }}>
        Connect Intervals.icu to sync workouts to Zwift
      </div>

      <div className="stat-card" style={{ padding: 28 }}>
        {/* Clear step-by-step */}
        <ol style={{ margin: "0 0 22px", padding: 0, listStyle: "none" }}>
          <li style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
            <span style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
              background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>1</span>
            <span style={{ fontSize: 14, color: "var(--text)", paddingTop: 2 }}>
              Go to{" "}
              <a
                href="https://intervals.icu/settings#developer"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", fontWeight: 700 }}
              >
                intervals.icu/settings
              </a>
              {" "}→ Developer Settings
            </span>
          </li>
          <li style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
            <span style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
              background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>2</span>
            <span style={{ fontSize: 14, color: "var(--text)", paddingTop: 2 }}>
              Click <strong>Generate API Key</strong> and copy it
            </span>
          </li>
          <li style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: "50%",
              background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>3</span>
            <span style={{ fontSize: 14, color: "var(--text)", paddingTop: 2 }}>
              Paste it below
            </span>
          </li>
        </ol>

        {/* One input, one button */}
        <form onSubmit={handleConnect} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your Intervals.icu API key"
            autoFocus
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 8,
              border: "1.5px solid var(--border)", fontSize: 14,
              color: "var(--text)", fontFamily: "inherit",
              outline: "none", boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={!apiKey.trim() || connecting}
            style={{
              width: "100%", padding: "12px", borderRadius: 8, border: "none",
              background: !apiKey.trim() || connecting ? "var(--muted)" : "var(--accent)",
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: !apiKey.trim() || connecting ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </form>

        {error && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--danger)", textAlign: "center" }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, fontSize: 11.5, color: "var(--muted)", textAlign: "center" }}>
          Free, no approval needed — takes about 30 seconds.
        </div>
      </div>
    </div>
  );
}
