"use client";

/**
 * ConnectionsPanel — unified card with side-by-side service tiles + platform selector.
 */

import { useEffect, useState } from "react";
import { IconMountain, IconTrend } from "./icons";

// ── Virtual platforms ─────────────────────────────────────────────────────────

type VirtualPlatform = "zwift" | "rouvy" | "mywhoosh";

const VIRTUAL_PLATFORMS: { id: VirtualPlatform; label: string; icon: React.ReactNode }[] = [
  {
    id: "zwift",
    label: "Zwift",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M14 2L4 14h9l-3 8 10-12h-9l3-8z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "rouvy",
    label: "Rouvy",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 8.5l5.5 3.5-5.5 3.5V8.5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "mywhoosh",
    label: "MyWhoosh",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 10l4 5.5 5-6.5 5 6.5 4-5.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const VIRTUAL_PLATFORMS_KEY = "zwiftVirtualPlatforms";
const SHOW_STRAVA = false;

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthData {
  zwift:     { connected: boolean; athleteId?: string | null };
  tp:        { connected: boolean; tokenExpired?: boolean; hasRefreshToken?: boolean; athleteId?: string | null };
  strava:    { configured: boolean; connected: boolean; athleteName?: string | null };
  garmin:    { viaTp: boolean; note: string };
  intervals: { connected: boolean; athleteName?: string | null };
}

type Status = "ok" | "warn" | "error" | "loading";
type BrandName = "zwift" | "trainingpeaks" | "strava" | "intervals";

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  ok:      { label: "Connected",     color: "#22c55e", bg: "rgba(34,197,94,0.10)" },
  warn:    { label: "Token expired", color: "#f0ad00", bg: "rgba(240,173,0,0.10)" },
  error:   { label: "Not connected", color: "#e4483a", bg: "rgba(228,72,58,0.10)" },
  loading: { label: "Checking…",    color: "#b7bcc2", bg: "rgba(183,188,194,0.12)" },
};

// ── ServiceTile ───────────────────────────────────────────────────────────────

interface ServiceTileProps {
  icon:        React.ReactNode;
  brand:       BrandName;
  name:        string;
  status:      Status;
  description: string;
  action?: { label: string; primary?: boolean; onClick: () => void; href?: never }
         | { label: string; primary?: boolean; href: string; onClick?: never };
}

function ServiceTile({ icon, brand, name, status, description, action }: ServiceTileProps) {
  const sc = STATUS_CONFIG[status];
  const isPrimary = action?.primary !== false && status !== "ok";

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "16px 16px 14px",
      borderRadius: 12,
      border: "1px solid var(--border, #e8eaed)",
      background: "var(--bg, #f8f9fa)",
    }}>
      {/* Top row: brand icon + status badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div
          className={`brand-icon ${brand}`}
          style={{
            width: 38, height: 38, borderRadius: 10, fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
          color: sc.color, background: sc.bg,
          letterSpacing: "0.01em", whiteSpace: "nowrap",
        }}>
          {sc.label}
        </span>
      </div>

      {/* Name + description */}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)", marginBottom: 4 }}>{name}</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45 }}>{description}</div>
      </div>

      {/* Action button — always full-width so both tiles match */}
      {action && (
        action.href ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className={isPrimary ? "btn" : "btn-secondary"}
            style={{
              width: "100%", padding: "8px", fontSize: 12,
              boxShadow: "none", textDecoration: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className={isPrimary ? "btn" : "btn-secondary"}
            style={{ width: "100%", padding: "8px", fontSize: 12, boxShadow: "none" }}
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

// ── PlatformCard ──────────────────────────────────────────────────────────────

function PlatformCard({
  label, icon, active, onToggle,
}: { label: string; icon: React.ReactNode; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 10, padding: "18px 10px 15px",
        borderRadius: 12,
        border: active ? "2px solid var(--accent)" : "1.5px solid var(--border, #d8dce0)",
        background: active
          ? "color-mix(in srgb, var(--accent) 6%, var(--panel, #fff))"
          : "transparent",
        cursor: "pointer", fontFamily: "inherit",
        transition: "border-color 0.15s, background 0.15s",
        outline: "none", minWidth: 0,
      }}
    >
      {active && (
        <div style={{
          position: "absolute", top: -1, right: -1,
          width: 22, height: 22, borderRadius: "0 12px 0 12px",
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1.5 4.5L4 7 9.5 1.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: active
          ? "color-mix(in srgb, var(--accent) 12%, var(--panel, #fff))"
          : "var(--bg, #f4f6f8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: active ? "var(--accent)" : "var(--muted)",
        transition: "background 0.15s, color 0.15s",
      }}>
        {icon}
      </div>
      <div style={{
        fontSize: 12.5, fontWeight: 700,
        color: active ? "var(--accent)" : "var(--text)",
        lineHeight: 1.2, textAlign: "center",
        transition: "color 0.15s",
      }}>
        {label}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ConnectionsPanelProps {
  onOpenTPModal:   () => void;
  onConnectStrava: () => void;
}

export default function ConnectionsPanel({ onOpenTPModal, onConnectStrava }: ConnectionsPanelProps) {
  const [health,      setHealth]      = useState<HealthData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const [showIntervalsModal,  setShowIntervalsModal]  = useState(false);
  const [intervalsKeyInput,   setIntervalsKeyInput]   = useState("");
  const [intervalsConnecting, setIntervalsConnecting] = useState(false);
  const [intervalsError,      setIntervalsError]      = useState<string | null>(null);

  const [virtualPlatforms, setVirtualPlatforms] = useState<VirtualPlatform[]>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIRTUAL_PLATFORMS_KEY);
      if (stored) setVirtualPlatforms(JSON.parse(stored) as VirtualPlatform[]);
      else        setVirtualPlatforms(["zwift", "rouvy", "mywhoosh"]);
    } catch { setVirtualPlatforms(["zwift", "rouvy", "mywhoosh"]); }
  }, []);

  function togglePlatform(id: VirtualPlatform) {
    setVirtualPlatforms(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      try { localStorage.setItem(VIRTUAL_PLATFORMS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/health");
      const d = await r.json() as HealthData;
      setHealth(d);
      setLastChecked(new Date());
    } catch { /* silent */ } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  async function handleDisconnectIntervals() {
    try { await fetch("/api/intervals/connect", { method: "DELETE" }); } catch { /* ignore */ }
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
    } finally { setIntervalsConnecting(false); }
  }

  const tpStatus: Status = !health ? "loading" :
    health.tp.tokenExpired ? "warn" :
    health.tp.connected    ? "ok"   : "error";

  const intervalsStatus: Status = !health ? "loading" :
    health.intervals.connected ? "ok" : "error";

  // Strava kept for when SHOW_STRAVA is re-enabled
  void SHOW_STRAVA; void onConnectStrava;

  return (
    <>
      <div className="stat-card" style={{ padding: "20px 22px" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 16,
        }}>
          <div className="section-title" style={{ margin: 0 }}>Connections</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastChecked && (
              <span style={{ fontSize: 10.5, color: "var(--muted)", opacity: 0.5 }}>
                {lastChecked.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
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
        </div>

        {/* ── Service tiles — 2-column side by side ──────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

          <ServiceTile
            icon={<IconMountain size={16} />}
            brand="trainingpeaks"
            name="TrainingPeaks"
            status={tpStatus}
            description={
              tpStatus === "loading" ? "Checking…" :
              tpStatus === "ok"      ? "Outdoor & Garmin sync" :
              tpStatus === "warn" && health?.tp.hasRefreshToken ? "Trying to auto-refresh…" :
              tpStatus === "warn"    ? "Reconnect via bookmarklet" :
              "Outdoor & Garmin sync"
            }
            action={
              tpStatus !== "ok" && !health?.tp.hasRefreshToken
                ? { label: "Connect", onClick: onOpenTPModal }
                : undefined
            }
          />

          <ServiceTile
            icon={<IconTrend size={16} />}
            brand="intervals"
            name="Intervals.icu"
            status={intervalsStatus}
            description={
              intervalsStatus === "loading" ? "Checking…" :
              intervalsStatus === "ok"
                ? health?.intervals.athleteName ?? "Virtual platform hub"
                : "Free · no approval needed"
            }
            action={
              intervalsStatus !== "ok"
                ? { label: "Connect",    onClick: () => setShowIntervalsModal(true) }
                : { label: "Change key", primary: false, onClick: handleDisconnectIntervals }
            }
          />
        </div>

        {/* ── Virtual platforms ───────────────────────────────────────────── */}
        {intervalsStatus === "ok" && (
          <>
            <div style={{
              borderTop: "1px solid var(--border, #e8eaed)",
              margin: "18px 0 16px",
            }} />

            <div style={{
              fontSize: 10.5, fontWeight: 700, color: "var(--muted)",
              letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6,
            }}>
              Virtual platforms via Intervals.icu
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55, marginBottom: 14 }}>
              Select the platforms connected in your Intervals.icu account.
              Workouts sync automatically when a new plan is generated.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {VIRTUAL_PLATFORMS.map(({ id, label, icon }) => (
                <PlatformCard
                  key={id}
                  label={label}
                  icon={icon}
                  active={virtualPlatforms.includes(id)}
                  onToggle={() => togglePlatform(id)}
                />
              ))}
            </div>

            {virtualPlatforms.length === 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#e4483a", lineHeight: 1.5 }}>
                No platforms selected — workouts will push to ICU only.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Intervals.icu connect modal ──────────────────────────────────── */}
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
              — look for &ldquo;Developer Settings&rdquo; — then paste it below.
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
    </>
  );
}
