"use client";

/**
 * ConnectionsPanel
 *
 * Shows live status for every integration:
 *   Zwift · TrainingPeaks · Strava · Garmin
 *
 * Fetches /api/health once on mount and exposes a manual "Re-check" button.
 * Each icon badge uses that service's own real brand color (so the row is
 * instantly recognizable at a glance, the same way it would be on their own
 * sites) - live status is a small corner dot instead, so brand identity and
 * connection health are two separate, simple signals rather than one
 * overloaded color.
 */

import { useEffect, useState } from "react";
import { IconBolt, IconMountain, IconClock, IconTrend } from "./icons";

/** Strava is currently out of scope for the push pipeline (it's a read-only,
 *  post-hoc activity log, not part of plan delivery) - hidden from this
 *  panel for now without removing the underlying integration/code, so it's
 *  a one-line flip to bring back if that changes. */
const SHOW_STRAVA = false;

interface HealthData {
  zwift:     { connected: boolean; athleteId?: string | null };
  tp:        { connected: boolean; tokenExpired?: boolean; hasRefreshToken?: boolean; athleteId?: string | null };
  strava:    { configured: boolean; connected: boolean; athleteName?: string | null };
  garmin:    { viaTp: boolean; note: string };
  intervals: { connected: boolean; athleteName?: string | null };
}

type Status = "ok" | "warn" | "error" | "loading";

const STATUS_DOT_COLOR: Record<Status, string> = {
  ok: "#22c55e",
  warn: "#f0ad00",
  error: "#e4483a",
  loading: "#b7bcc2",
};

/** Each service's own real brand color - defined once in globals.css
 *  (.brand-icon.<name>) and referenced here by class name, the same
 *  documented exception to "never hard-code a color" that the c-* icon
 *  badges use. */
type BrandName = "zwift" | "trainingpeaks" | "strava" | "garmin" | "intervals";

interface ServiceCardProps {
  icon: React.ReactNode;
  brand: BrandName;
  name: string;
  status: Status;
  line1: string;
  action?: { label: string; onClick: () => void; href?: never } | { label: string; href: string; onClick?: never };
}

function ServiceCard({ icon, brand, name, status, line1, action }: ServiceCardProps) {
  return (
    <div className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div className={`brand-icon ${brand}`} style={{
          width: 40, height: 40, borderRadius: 10, fontSize: 17,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        {/* Live status - a small corner dot, separate from the brand color above */}
        <span style={{
          position: "absolute", bottom: -2, right: -2,
          width: 11, height: 11, borderRadius: "50%",
          background: STATUS_DOT_COLOR[status],
          border: "2px solid var(--panel)",
        }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, lineHeight: 1.45 }}>{line1}</div>
      </div>

      {action && (
        action.href ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ width: "auto", flexShrink: 0, padding: "7px 16px", fontSize: 12, boxShadow: "none", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="btn"
            style={{ width: "auto", flexShrink: 0, padding: "7px 16px", fontSize: 12, boxShadow: "none" }}
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

interface ConnectionsPanelProps {
  /** Called when user clicks "Connect TrainingPeaks" — opens the TP modal */
  onOpenTPModal: () => void;
  /** Called when user clicks "Connect Strava" — triggers Strava OAuth */
  onConnectStrava: () => void;
}

export default function ConnectionsPanel({ onOpenTPModal, onConnectStrava }: ConnectionsPanelProps) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Intervals.icu connect modal - much simpler than TP's bookmarklet flow:
  // it's a personal API key the rider generates once at intervals.icu/settings
  // and pastes in, no cross-origin dance or expiring tokens involved.
  const [showIntervalsModal, setShowIntervalsModal] = useState(false);
  const [intervalsKeyInput, setIntervalsKeyInput] = useState("");
  const [intervalsConnecting, setIntervalsConnecting] = useState(false);
  const [intervalsError, setIntervalsError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/health");
      const d = await r.json() as HealthData;
      setHealth(d);
      setLastChecked(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleDisconnectIntervals() {
    try {
      await fetch("/api/intervals/connect", { method: "DELETE" });
    } catch { /* ignore */ }
    setShowIntervalsModal(true);
    setIntervalsKeyInput("");
    setIntervalsError(null);
    await refresh();
  }

  async function handleConnectIntervals() {
    if (!intervalsKeyInput.trim()) return;
    setIntervalsConnecting(true);
    setIntervalsError(null);
    try {
      const r = await fetch("/api/intervals/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: intervalsKeyInput.trim() }),
      });
      const d = await r.json() as { ok: boolean; error?: string };
      if (d.ok) {
        setShowIntervalsModal(false);
        setIntervalsKeyInput("");
        await refresh();
      } else {
        setIntervalsError(d.error ?? "Connection failed — check the key and try again.");
      }
    } catch (e) {
      setIntervalsError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setIntervalsConnecting(false);
    }
  }

  // ── Derive service statuses ───────────────────────────────────────────────

  const zwiftStatus: Status = !health ? "loading" :
    health.zwift.connected ? "ok" : "error";

  const tpStatus: Status = !health ? "loading" :
    health.tp.tokenExpired ? "warn" :
    health.tp.connected     ? "ok"  : "error";

  const stravaStatus: Status = !health ? "loading" :
    !health.strava.configured ? "error" :
    health.strava.connected   ? "ok"   : "warn";

  // Garmin is "ok" if TP is connected (user still needs one-time TP↔Garmin link)
  const garminStatus: Status = !health ? "loading" :
    health.tp.connected ? "warn" : "error";

  const intervalsStatus: Status = !health ? "loading" :
    health.intervals.connected ? "ok" : "error";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Connections
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="btn-secondary"
          style={{
            width: "auto", padding: "5px 12px", fontSize: 11, fontWeight: 600,
            cursor: loading ? "wait" : "pointer", opacity: loading ? 0.5 : 1,
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          {loading ? "Checking…" : "↻ Re-check"}
        </button>
      </div>
      {lastChecked && (
        <div style={{ fontSize: 10.5, color: "var(--muted)", opacity: 0.55, marginTop: -10, marginBottom: 14 }}>
          Checked {lastChecked.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {/* Service cards */}
      <div className="stat-grid workout-grid" style={{ gap: 12 }}>

        {/* Zwift */}
        <ServiceCard
          icon={<IconBolt size={17} />}
          brand="zwift"
          name="Zwift"
          status={zwiftStatus}
          line1={
            zwiftStatus === "loading" ? "Checking…" :
            zwiftStatus === "ok"      ? `Connected${health?.zwift.athleteId ? ` · ID ${health.zwift.athleteId}` : ""}` :
            "Not connected — please log in to the dashboard"
          }
        />

        {/* TrainingPeaks */}
        <ServiceCard
          icon={<IconMountain size={17} />}
          brand="trainingpeaks"
          name="TrainingPeaks"
          status={tpStatus}
          line1={
            tpStatus === "loading" ? "Checking…" :
            tpStatus === "ok"      ? "Connected · plans sync to Zwift and Garmin" :
            tpStatus === "warn" && health?.tp.hasRefreshToken
              ? "Token expired — trying to auto-refresh…" :
            tpStatus === "warn"    ? "Token expired — please reconnect (takes a minute)" :
            "Not connected — click to connect via the bookmarklet"
          }
          action={
            tpStatus !== "ok" && !health?.tp.hasRefreshToken
              ? { label: "Connect", onClick: onOpenTPModal }
              : undefined
          }
        />

        {/* Strava — hidden for now, see SHOW_STRAVA above */}
        {SHOW_STRAVA && (
          <ServiceCard
            icon={<span style={{ fontSize: 17, lineHeight: 1 }}>🟠</span>}
            brand="strava"
            name="Strava"
            status={stravaStatus}
            line1={
              stravaStatus === "loading"   ? "Checking…" :
              !health?.strava.configured   ? "Setup required — see instructions below" :
              stravaStatus === "ok"        ? `Connected${health?.strava.athleteName ? ` · ${health.strava.athleteName}` : ""}` :
              "Configured — click to connect"
            }
            action={
              health?.strava.configured && stravaStatus !== "ok"
                ? { label: "Connect", onClick: onConnectStrava }
                : !health?.strava.configured
                ? { label: "Setup ↗", href: "https://www.strava.com/settings/api" }
                : undefined
            }
          />
        )}

        {/* Garmin */}
        <ServiceCard
          icon={<IconClock size={17} />}
          brand="garmin"
          name="Garmin"
          status={garminStatus}
          line1={
            garminStatus === "loading" ? "Checking…" :
            health?.tp.connected
              ? "Syncs via TrainingPeaks — check TP↔Garmin is linked there"
              : "Requires TrainingPeaks connected first"
          }
          action={health?.tp.connected ? { label: "Open TP settings ↗", href: "https://app.trainingpeaks.com/athlete/settings/apps" } : undefined}
        />

        {/* Intervals.icu — free, self-service alternative/backup to TrainingPeaks.
            No approval process, no bookmarklet: a personal API key generated
            once at intervals.icu/settings works immediately. */}
        <ServiceCard
          icon={<IconTrend size={17} />}
          brand="intervals"
          name="Intervals.icu"
          status={intervalsStatus}
          line1={
            intervalsStatus === "loading" ? "Checking…" :
            intervalsStatus === "ok"      ? `Connected${health?.intervals.athleteName ? ` · ${health.intervals.athleteName}` : ""} · syncs to Zwift and Garmin` :
            "Not connected — free, no approval needed"
          }
          action={
            intervalsStatus !== "ok"
              ? { label: "Connect", onClick: () => setShowIntervalsModal(true) }
              : { label: "Change key", onClick: handleDisconnectIntervals, variant: "ghost" }
          }
        />
      </div>

      {/* Strava setup instructions when not configured — hidden with the card above */}
      {SHOW_STRAVA && health && !health.strava.configured && (
        <div className="stat-card" style={{
          marginTop: 14, padding: "16px 18px",
        }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8, color: "var(--text)" }}>
            Strava setup — 5 minutes, one time
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.85, color: "var(--muted)" }}>
            <li>Go to <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>strava.com/settings/api</a> and create an application</li>
            <li>In the &ldquo;Authorization Callback Domain&rdquo; field, enter: <code style={{ background: "rgba(20,23,26,0.06)", padding: "1px 5px", borderRadius: 4 }}>zwift-delta.vercel.app</code></li>
            <li>Copy the Client ID and Client Secret</li>
            <li>Go to <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Vercel → Project → Settings → Environment Variables</a></li>
            <li>Add: <code style={{ background: "rgba(20,23,26,0.06)", padding: "1px 5px", borderRadius: 4 }}>STRAVA_CLIENT_ID</code> and <code style={{ background: "rgba(20,23,26,0.06)", padding: "1px 5px", borderRadius: 4 }}>STRAVA_CLIENT_SECRET</code></li>
            <li>Redeploy on Vercel — then come back and click &ldquo;Connect&rdquo;</li>
          </ol>
        </div>
      )}

      {/* Intervals.icu connect modal — one text field, no bookmarklet needed */}
      {showIntervalsModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div className="stat-card" style={{ maxWidth: 440, width: "100%", padding: "22px 24px" }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 6, color: "var(--text)" }}>
              Connect Intervals.icu
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
              Free, no approval process. Generate a personal API key at{" "}
              <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                intervals.icu/settings
              </a>{" "}
              — look for &ldquo;Developer Settings&rdquo; near the bottom — then paste it below.
            </div>
            <input
              type="text"
              value={intervalsKeyInput}
              onChange={e => setIntervalsKeyInput(e.target.value)}
              placeholder="Paste your Intervals.icu API key"
              autoFocus
              style={{
                width: "100%", padding: "9px 12px", fontSize: 13, borderRadius: 8,
                border: "1px solid var(--border, #d8dce0)", marginBottom: 10, boxSizing: "border-box",
              }}
              onKeyDown={e => { if (e.key === "Enter") handleConnectIntervals(); }}
            />
            {intervalsError && (
              <div style={{ fontSize: 12, color: "#e4483a", marginBottom: 10, lineHeight: 1.5 }}>
                {intervalsError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setShowIntervalsModal(false); setIntervalsError(null); }}
                className="btn-secondary"
                style={{ width: "auto", padding: "8px 16px", fontSize: 12.5 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConnectIntervals}
                disabled={intervalsConnecting || !intervalsKeyInput.trim()}
                className="btn"
                style={{ width: "auto", padding: "8px 18px", fontSize: 12.5, opacity: intervalsConnecting ? 0.6 : 1 }}
              >
                {intervalsConnecting ? "Connecting…" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
