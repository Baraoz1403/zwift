"use client";

/**
 * ConnectionsPanel
 *
 * Shows live status for every integration:
 *   Zwift · TrainingPeaks · Strava · Garmin
 *
 * Fetches /api/health once on mount and exposes a manual "Re-check" button.
 * Each service card shows:
 *   🟢 Connected | 🟡 Action needed | 🔴 Not connected / broken
 */

import { useEffect, useState } from "react";

interface HealthData {
  zwift:  { connected: boolean; athleteId?: string | null };
  tp:     { connected: boolean; tokenExpired?: boolean; hasRefreshToken?: boolean; athleteId?: string | null };
  strava: { configured: boolean; connected: boolean; athleteName?: string | null };
  garmin: { viaTp: boolean; note: string };
}

type Status = "ok" | "warn" | "error" | "loading";

function dot(s: Status) {
  const color = s === "ok" ? "#22c55e" : s === "warn" ? "#f59e0b" : s === "error" ? "#ef4444" : "#94a3b8";
  return (
    <span style={{
      display: "inline-block", width: 9, height: 9, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: s === "ok" ? `0 0 6px ${color}88` : "none",
    }} />
  );
}

interface ServiceCardProps {
  icon: string;
  name: string;
  status: Status;
  line1: string;
  line2?: string;
  action?: { label: string; onClick: () => void; href?: never } | { label: string; href: string; onClick?: never };
}

function ServiceCard({ icon, name, status, line1, line2, action }: ServiceCardProps) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "14px 16px", borderRadius: 10,
      background: "rgba(20,23,26,0.03)",
      border: "1px solid var(--border)",
    }}>
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: status === "ok" ? "rgba(34,197,94,0.12)" : status === "warn" ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {dot(status)}
          <span style={{ fontWeight: 700, fontSize: 13 }}>{name}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>{line1}</div>
        {line2 && <div style={{ fontSize: 11, color: "var(--muted)", opacity: 0.7, marginTop: 2 }}>{line2}</div>}
        {action && (
          <div style={{ marginTop: 8 }}>
            {action.href ? (
              <a
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block", padding: "4px 10px", borderRadius: 6,
                  background: "var(--accent)", color: "#fff",
                  fontSize: 11, fontWeight: 700, textDecoration: "none",
                }}
              >
                {action.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                style={{
                  padding: "4px 10px", borderRadius: 6,
                  background: "var(--accent)", color: "#fff", border: "none",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
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

  return (
    <div className="stat-card" style={{ padding: "20px 20px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="section-title" style={{ margin: 0, fontSize: 13 }}>Connections</div>
          {lastChecked && (
            <div style={{ fontSize: 10, color: "var(--muted)", opacity: 0.55, marginTop: 1 }}>
              Checked {lastChecked.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{
            padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)",
            background: "transparent", color: "var(--muted)", fontSize: 11,
            cursor: loading ? "wait" : "pointer", opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Checking…" : "🔄 Re-check"}
        </button>
      </div>

      {/* Service cards */}
      <div style={{ display: "grid", gap: 8 }}>

        {/* Zwift */}
        <ServiceCard
          icon="⚡"
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
          icon="🏔️"
          name="TrainingPeaks"
          status={tpStatus}
          line1={
            tpStatus === "loading" ? "Checking…" :
            tpStatus === "ok"      ? `Connected · plans sync automatically to Zwift and Garmin` :
            tpStatus === "warn" && health?.tp.hasRefreshToken
              ? "Token expired — trying to auto-refresh…" :
            tpStatus === "warn"    ? "Token expired — please reconnect (takes a minute)" :
            "Not connected"
          }
          line2={
            tpStatus !== "ok" && !health?.tp.hasRefreshToken
              ? "Click to connect via the bookmarklet"
              : tpStatus === "ok"
              ? `Athlete ID: ${health?.tp.athleteId ?? "—"}${health?.tp.hasRefreshToken ? " · auto-refresh active" : ""}`
              : undefined
          }
          action={
            tpStatus !== "ok" && !health?.tp.hasRefreshToken
              ? { label: "Connect TrainingPeaks", onClick: onOpenTPModal }
              : undefined
          }
        />

        {/* Strava */}
        <ServiceCard
          icon="🟠"
          name="Strava"
          status={stravaStatus}
          line1={
            stravaStatus === "loading"   ? "Checking…" :
            !health?.strava.configured   ? "Requires STRAVA_CLIENT_ID set up on Vercel" :
            stravaStatus === "ok"        ? `Connected${health?.strava.athleteName ? ` · ${health.strava.athleteName}` : ""} · auto-refreshing` :
            "Configured — click to connect"
          }
          line2={!health?.strava.configured ? "See setup instructions on this panel" : undefined}
          action={
            health?.strava.configured && stravaStatus !== "ok"
              ? { label: "Connect Strava", onClick: onConnectStrava }
              : !health?.strava.configured
              ? { label: "Setup instructions ↗", href: "https://www.strava.com/settings/api" }
              : undefined
          }
        />

        {/* Garmin */}
        <ServiceCard
          icon="⌚"
          name="Garmin"
          status={garminStatus}
          line1={
            garminStatus === "loading" ? "Checking…" :
            health?.tp.connected
              ? "Syncs via TrainingPeaks → check that TP↔Garmin is linked in TP settings"
              : "Requires TrainingPeaks connected first"
          }
          line2={health?.tp.connected ? "Settings → Connected Apps → Garmin on the TP site" : undefined}
          action={health?.tp.connected ? { label: "Open TP settings ↗", href: "https://app.trainingpeaks.com/athlete/settings/apps" } : undefined}
        />
      </div>

      {/* Strava setup instructions when not configured */}
      {health && !health.strava.configured && (
        <div style={{
          marginTop: 14, padding: "12px 14px", borderRadius: 8,
          background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: "#f59e0b" }}>
            Strava setup — 5 minutes, one time
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.8, color: "var(--muted)" }}>
            <li>Go to <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>strava.com/settings/api</a> and create an application</li>
            <li>In the "Authorization Callback Domain" field, enter: <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>zwift-delta.vercel.app</code></li>
            <li>Copy the Client ID and Client Secret</li>
            <li>Go to <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Vercel → Project → Settings → Environment Variables</a></li>
            <li>Add: <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>STRAVA_CLIENT_ID</code> and <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>STRAVA_CLIENT_SECRET</code></li>
            <li>Redeploy on Vercel — then come back and click "Connect Strava"</li>
          </ol>
        </div>
      )}
    </div>
  );
}
