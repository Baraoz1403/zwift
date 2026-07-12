"use client";

/**
 * ConnectionsPanel — premium redesign:
 * brand-colored top stripes, animated status dots, richer connection info.
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M14 2L4 14h9l-3 8 10-12h-9l3-8z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "rouvy",
    label: "Rouvy",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 8.5l5.5 3.5-5.5 3.5V8.5z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "mywhoosh",
    label: "MyWhoosh",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
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

// Brand primary colors for the service tiles we actually render.
// Only TP and ICU are shown as ServiceTiles; other brands use the CSS class only.
// Hex values intentionally kept out of globals.css since they're brand-specific,
// not design tokens — but we only include brands whose tiles are rendered here.
const BRAND: Record<string, { stripe: string; tint: string }> = {
  trainingpeaks: { stripe: "#005695", tint: "rgba(0,86,149,0.04)" },
  intervals:     { stripe: "#0d9488", tint: "rgba(13,148,136,0.04)" },
};

const BRAND_FALLBACK = { stripe: "var(--accent)", tint: "rgba(47,143,224,0.04)" };

const STATUS_CFG: Record<Status, { label: string; dot: string; ring: boolean; textColor: string }> = {
  ok:      { label: "Connected",     dot: "#22c55e", ring: true,  textColor: "#16a34a" },
  warn:    { label: "Token expired", dot: "#f0ad00", ring: false, textColor: "#b45309" },
  error:   { label: "Not connected", dot: "#e4483a", ring: false, textColor: "#e4483a" },
  loading: { label: "Checking…",    dot: "#94a3b8", ring: true,  textColor: "#94a3b8" },
};

// ── StatusDot ─────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: Status }) {
  const sc = STATUS_CFG[status];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
        {sc.ring && (
          <div style={{
            position: "absolute", inset: -4,
            borderRadius: "50%",
            border: `1.5px solid ${sc.dot}`,
            animation: "statusPulse 2.5s ease-out infinite",
          }} />
        )}
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: sc.textColor, lineHeight: 1 }}>
        {sc.label}
      </span>
    </div>
  );
}

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
  const bc = BRAND[brand] ?? BRAND_FALLBACK;
  const isOk = status === "ok";
  const hasPrimaryBtn = action && action.primary !== false;

  const btnStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "7px 13px", borderRadius: 5,
    fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
    border: hasPrimaryBtn ? "1.5px solid #dc2626" : "1.5px solid var(--border)",
    background: hasPrimaryBtn ? "#dc2626" : "transparent",
    color: hasPrimaryBtn ? "#fff" : "var(--muted)",
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "15px 16px",
      borderRadius: 12,
      border: "1px solid var(--border)",
      background: isOk ? bc.tint : "var(--panel, #fff)",
    }}>

      {/* Brand icon */}
      <div
        className={`brand-icon ${brand}`}
        style={{
          width: 46, height: 46, borderRadius: 11, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 3px 10px ${bc.stripe}2a`,
        }}
      >
        {icon}
      </div>

      {/* Name + status + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)", marginBottom: 5 }}>
          {name}
        </div>
        <StatusDot status={status} />
        <div style={{
          fontSize: isOk ? 12.5 : 11.5,
          fontWeight: isOk ? 600 : 400,
          color: isOk ? "var(--text)" : "var(--muted)",
          lineHeight: 1.4, marginTop: 4,
        }}>
          {description}
        </div>
      </div>

      {/* Action button — right side */}
      {action && (
        <div style={{ flexShrink: 0 }}>
          {action.href ? (
            <a href={action.href} target="_blank" rel="noopener noreferrer"
              style={{ ...btnStyle, textDecoration: "none" }}
            >
              {action.label}
            </a>
          ) : (
            <button type="button" onClick={action.onClick}
              style={{ ...btnStyle, cursor: "pointer", fontFamily: "inherit" }}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── PlatformChip ──────────────────────────────────────────────────────────────

function PlatformChip({
  label, icon, active, onToggle,
}: { label: string; icon: React.ReactNode; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "9px 10px", borderRadius: 5,
        border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
        background: active
          ? "color-mix(in srgb, var(--accent) 8%, var(--panel, #fff))"
          : "transparent",
        color: active ? "var(--accent)" : "var(--text)",
        fontSize: 12.5, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
        transition: "border-color 0.15s, background 0.15s, color 0.15s",
        flex: "1 1 0",
      }}
    >
      <span style={{ color: active ? "var(--accent)" : "var(--muted)", display: "flex" }}>
        {icon}
      </span>
      {label}
      {active && (
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 4.5L3.8 7.5 10 1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ConnectionsPanelProps {
  onOpenTPModal?:  () => void; // TP_DISABLED: optional until TP UI is re-enabled
  onConnectStrava: () => void;
  /** Called when the user clicks the HIDE button — lets the parent collapse the panel. */
  onHide?: () => void;
}

export default function ConnectionsPanel({ onOpenTPModal, onConnectStrava, onHide }: ConnectionsPanelProps) {
  const [health,      setHealth]      = useState<HealthData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const [showIntervalsModal,  setShowIntervalsModal]  = useState(false);
  const [intervalsStep,       setIntervalsStep]       = useState<0|1>(0);
  const [intervalsKeyInput,   setIntervalsKeyInput]   = useState("");
  const [intervalsConnecting, setIntervalsConnecting] = useState(false);
  const [intervalsError,      setIntervalsError]      = useState<string | null>(null);
  const [clipboardSupported,  setClipboardSupported]  = useState(true);

  const [cleanupRunning,  setCleanupRunning]  = useState(false);
  const [cleanupResult,   setCleanupResult]   = useState<{ deleted: number; errors: string[] } | null>(null);


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
      try { localStorage.setItem(VIRTUAL_PLATFORMS_KEY, JSON.stringify(next)); } catch {}
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

  function openIntervalsModal() {
    setShowIntervalsModal(true);
    setIntervalsStep(0);
    setIntervalsKeyInput("");
    setIntervalsError(null);
  }

  async function handleDisconnectIntervals() {
    try { await fetch("/api/intervals/connect", { method: "DELETE" }); } catch {}
    openIntervalsModal();
    await refresh();
  }

  async function handleCleanupCalendar() {
    setCleanupRunning(true);
    setCleanupResult(null);
    try {
      const r = await fetch("/api/intervals/cleanup", { method: "POST" });
      const d = await r.json() as { ok: boolean; deleted?: number; errors?: string[]; error?: string };
      if (d.ok) {
        setCleanupResult({ deleted: d.deleted ?? 0, errors: d.errors ?? [] });
      } else {
        setCleanupResult({ deleted: 0, errors: [d.error ?? "Unknown error"] });
      }
    } catch (e) {
      setCleanupResult({ deleted: 0, errors: [e instanceof Error ? e.message : "Network error"] });
    } finally {
      setCleanupRunning(false);
    }
  }

  function handleOpenICUSettings() {
    window.open("https://intervals.icu/settings#developer", "_blank", "noopener");
    setIntervalsStep(1);
  }

  async function handlePasteAndConnect() {
    setIntervalsError(null);
    let key = intervalsKeyInput.trim();
    if (!key) {
      try {
        key = (await navigator.clipboard.readText()).trim();
        if (key) setIntervalsKeyInput(key);
      } catch {
        setClipboardSupported(false);
      }
    }
    if (!key) {
      setIntervalsError("No key found in clipboard — paste it manually below.");
      return;
    }
    await doConnect(key);
  }

  async function doConnect(key: string) {
    if (!key.trim()) return;
    setIntervalsConnecting(true);
    setIntervalsError(null);
    try {
      const r = await fetch("/api/intervals/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim() }),
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

  const tpAction: ServiceTileProps["action"] =
    tpStatus !== "ok" && onOpenTPModal
      ? { label: "Connect", onClick: onOpenTPModal }
      : undefined;

  const intervalsStatus: Status = !health ? "loading" :
    health.intervals.connected ? "ok" : "error";

  // Strava kept for when SHOW_STRAVA is re-enabled
  void SHOW_STRAVA; void onConnectStrava;

  return (
    <>
      {/* Keyframe animations for status dots and refresh spinner */}
      <style>{`
        @keyframes statusPulse {
          0%   { transform: scale(0.8); opacity: 0.8; }
          60%  { transform: scale(2.0); opacity: 0; }
          100% { transform: scale(2.0); opacity: 0; }
        }
        @keyframes connSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div className="stat-card" style={{ padding: "20px 22px" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", marginBottom: 18,
        }}>
          <div>
            <div className="section-title" style={{ margin: 0 }}>Connections</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5, lineHeight: 1.3 }}>
              {lastChecked
                ? intervalsStatus === "ok"
                  ? "Plans push to Intervals.icu automatically · TrainingPeaks is manual (outdoor/Garmin)"
                  : `Last checked ${lastChecked.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
                : "Sync plans to Intervals.icu automatically · TrainingPeaks for outdoor/Garmin rides"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              title="Re-check connections"
              style={{
                background: "none",
                border: "1.5px solid var(--border)",
                borderRadius: 8,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.4 : 1,
                color: "var(--muted)",
                fontSize: 16, lineHeight: 1,
                padding: "5px 7px",
                display: "flex", alignItems: "center",
                transition: "opacity 0.15s",
              }}
            >
              <span style={{
                display: "inline-block",
                animation: loading ? "connSpin 1s linear infinite" : "none",
              }}>
                ↻
              </span>
            </button>
            {onHide && (
              <button
                type="button"
                onClick={onHide}
                title="Hide connections panel"
                style={{
                  background: "none",
                  border: "1.5px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "var(--muted)",
                  fontSize: 11, fontWeight: 600, lineHeight: 1,
                  padding: "5px 9px",
                  display: "flex", alignItems: "center",
                  transition: "opacity 0.15s",
                  letterSpacing: "0.03em",
                }}
              >
                Hide
              </button>
            )}
          </div>
        </div>

        {/* ── Service tiles — 2-column grid ──────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* TP_DISABLED: tile hidden — restore by removing the `false &&` wrapper */}
          {false /* TP_DISABLED */ && (
          <ServiceTile
            icon={<IconMountain size={20} />}
            brand="trainingpeaks"
            name="TrainingPeaks"
            status={tpStatus}
            description={
              tpStatus === "loading" ? "Checking…" :
              tpStatus === "ok"      ? "Garmin · outdoor calendar" :
              tpStatus === "warn"    ? "Token expired — reconnect to resume Garmin sync" :
              "Garmin · outdoor calendar"
            }
            action={tpAction}
          />
          )}

          <ServiceTile
            icon={<IconTrend size={20} />}
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
                ? { label: "Connect",    onClick: openIntervalsModal }
                : { label: "Change key", primary: false, onClick: handleDisconnectIntervals }
            }
          />

        </div>

        {/* ── Virtual platforms (shown only when ICU is connected) ────────── */}
        {intervalsStatus === "ok" && (
          <>
            {/* Divider with label */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              margin: "20px 0 14px",
            }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <div style={{
                fontSize: 10, fontWeight: 700, color: "var(--muted)",
                letterSpacing: "0.08em", textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}>
                Sync to virtual platforms
              </div>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            <div style={{
              fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55,
              marginBottom: 12, textAlign: "center",
            }}>
              Select platforms connected in your Intervals.icu account
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {VIRTUAL_PLATFORMS.map(({ id, label, icon }) => (
                <PlatformChip
                  key={id}
                  label={label}
                  icon={icon}
                  active={virtualPlatforms.includes(id)}
                  onToggle={() => togglePlatform(id)}
                />
              ))}
            </div>

            {virtualPlatforms.length === 0 && (
              <div style={{
                marginTop: 10, fontSize: 11.5, color: "#e4483a",
                lineHeight: 1.5, textAlign: "center",
              }}>
                No platforms selected — workouts will push to Intervals.icu only
              </div>
            )}

            {/* Duplicate cleanup — shown as a quiet utility row */}
            <div style={{
              marginTop: 16,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--bg, #f8f9fa)",
              border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
                Seeing duplicate workouts in Zwift?
              </div>
              <button
                type="button"
                onClick={handleCleanupCalendar}
                disabled={cleanupRunning}
                style={{
                  fontSize: 12, fontWeight: 600,
                  padding: "5px 12px", borderRadius: 5,
                  border: "1.5px solid var(--border)",
                  background: "transparent", color: "var(--text)",
                  cursor: cleanupRunning ? "wait" : "pointer",
                  opacity: cleanupRunning ? 0.5 : 1,
                  fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0, marginLeft: 12,
                }}
              >
                {cleanupRunning ? "Cleaning…" : "Fix calendar"}
              </button>
            </div>
            {cleanupResult && (
              <div style={{
                marginTop: 6, fontSize: 11.5, lineHeight: 1.45,
                color: cleanupResult.errors.length > 0 ? "#e4483a" : "#16a34a",
                padding: "0 2px",
              }}>
                {cleanupResult.errors.length > 0
                  ? `Error: ${cleanupResult.errors.join("; ")}`
                  : cleanupResult.deleted > 0
                    ? `Removed ${cleanupResult.deleted} duplicate${cleanupResult.deleted !== 1 ? "s" : ""} — restart Zwift to sync`
                    : "No duplicates found in your calendar"}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Intervals.icu connect wizard ─────────────────────────────────── */}
      {showIntervalsModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div className="stat-card" style={{ maxWidth: 420, width: "100%", padding: "24px 26px" }}>

            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 20,
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                Connect Intervals.icu
              </div>
              <button
                type="button"
                onClick={() => { setShowIntervalsModal(false); setIntervalsError(null); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: "2px 4px",
                }}
              >×</button>
            </div>

            {/* Step indicators */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
              {[0, 1].map(s => (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: intervalsStep >= s ? "var(--accent)" : "var(--border, #e0e0e0)",
                    color: intervalsStep >= s ? "#fff" : "var(--muted)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>{s + 1}</div>
                  <span style={{
                    fontSize: 11.5,
                    color: intervalsStep >= s ? "var(--text)" : "var(--muted)",
                    fontWeight: intervalsStep === s ? 600 : 400,
                  }}>
                    {s === 0 ? "Open settings" : "Paste & connect"}
                  </span>
                  {s === 0 && <div style={{ width: 20, height: 1, background: "var(--border, #e0e0e0)" }} />}
                </div>
              ))}
            </div>

            {/* Step 0: Open ICU settings */}
            {intervalsStep === 0 && (
              <>
                <div style={{
                  background: "var(--bg, #f8f9fa)", borderRadius: 10, padding: "14px 16px",
                  marginBottom: 18, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7,
                }}>
                  Intervals.icu is <strong style={{ color: "var(--text)" }}>free</strong> and requires no approval.
                  You&apos;ll generate a personal API key in their settings — takes about 30 seconds.
                </div>
                <button
                  type="button"
                  onClick={handleOpenICUSettings}
                  className="btn"
                  style={{ width: "100%", padding: "12px", fontSize: 13.5, fontWeight: 700, boxShadow: "none" }}
                >
                  Open Intervals.icu Settings →
                </button>
                <div style={{
                  fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 10, lineHeight: 1.5,
                }}>
                  Scroll to <strong>Developer Settings</strong> and click <strong>Generate API Key</strong>
                </div>
              </>
            )}

            {/* Step 1: Paste & connect */}
            {intervalsStep === 1 && (
              <>
                <div style={{
                  background: "color-mix(in srgb, var(--accent) 8%, var(--panel, #fff))",
                  border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                  borderRadius: 10, padding: "12px 14px",
                  marginBottom: 18, fontSize: 12.5, color: "var(--text)", lineHeight: 1.65,
                }}>
                  <strong>Copy the API key</strong> from the Developer Settings section on Intervals.icu,
                  then click the button below — we&apos;ll read it automatically.
                </div>

                {clipboardSupported && (
                  <button
                    type="button"
                    onClick={handlePasteAndConnect}
                    disabled={intervalsConnecting}
                    className="btn"
                    style={{
                      width: "100%", padding: "13px", fontSize: 14, fontWeight: 700,
                      boxShadow: "none", marginBottom: 14,
                      opacity: intervalsConnecting ? 0.6 : 1,
                    }}
                  >
                    {intervalsConnecting ? "Connecting…" : "📋  Paste & Connect"}
                  </button>
                )}

                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
                  {clipboardSupported ? "Or paste manually:" : "Paste your API key:"}
                </div>
                <input
                  type="text"
                  value={intervalsKeyInput}
                  onChange={e => setIntervalsKeyInput(e.target.value)}
                  placeholder="API key"
                  autoFocus={!clipboardSupported}
                  style={{
                    width: "100%", padding: "9px 12px", fontSize: 13, borderRadius: 8,
                    border: "1px solid var(--border, #d8dce0)", marginBottom: 8,
                    boxSizing: "border-box", fontFamily: "monospace",
                  }}
                  onKeyDown={e => { if (e.key === "Enter") doConnect(intervalsKeyInput); }}
                />
                {!clipboardSupported && (
                  <button
                    type="button"
                    onClick={() => doConnect(intervalsKeyInput)}
                    disabled={intervalsConnecting || !intervalsKeyInput.trim()}
                    className="btn"
                    style={{
                      width: "100%", padding: "10px", fontSize: 13,
                      boxShadow: "none", opacity: intervalsConnecting ? 0.6 : 1,
                    }}
                  >
                    {intervalsConnecting ? "Connecting…" : "Connect"}
                  </button>
                )}

                {intervalsError && (
                  <div style={{ fontSize: 12, color: "#e4483a", marginTop: 8, lineHeight: 1.5 }}>
                    {intervalsError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIntervalsStep(0)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", fontSize: 11.5, marginTop: 12,
                    padding: 0, display: "block",
                  }}
                >
                  ← Back
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
