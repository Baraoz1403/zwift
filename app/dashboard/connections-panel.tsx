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

      {/* Action button — same size/style as header-card-btn */}
      {action && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
          {action.href ? (
            <a
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              className="header-card-btn"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "6px 18px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: isPrimary ? "1.5px solid #ea580c" : "1.5px solid var(--border, #d8dce0)",
                background: isPrimary ? "#ea580c" : "transparent",
                color: isPrimary ? "#fff" : "var(--muted)",
                textDecoration: "none", boxShadow: "none",
              }}
            >
              {action.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="header-card-btn"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                padding: "6px 18px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: isPrimary ? "1.5px solid #ea580c" : "1.5px solid var(--border, #d8dce0)",
                background: isPrimary ? "#ea580c" : "transparent",
                color: isPrimary ? "#fff" : "var(--muted)",
                cursor: "pointer", fontFamily: "inherit", boxShadow: "none",
              }}
            >
              {action.label}
            </button>
          )}
        </div>
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
  const [intervalsStep,       setIntervalsStep]       = useState<0|1>(0);
  const [intervalsKeyInput,   setIntervalsKeyInput]   = useState("");
  const [intervalsConnecting, setIntervalsConnecting] = useState(false);
  const [intervalsError,      setIntervalsError]      = useState<string | null>(null);
  const [clipboardSupported,  setClipboardSupported]  = useState(true);

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

  function openIntervalsModal() {
    setShowIntervalsModal(true);
    setIntervalsStep(0);
    setIntervalsKeyInput("");
    setIntervalsError(null);
  }

  async function handleDisconnectIntervals() {
    try { await fetch("/api/intervals/connect", { method: "DELETE" }); } catch { /* ignore */ }
    openIntervalsModal();
    await refresh();
  }

  function handleOpenICUSettings() {
    window.open("https://intervals.icu/settings#developer", "_blank", "noopener");
    setIntervalsStep(1);
  }

  async function handlePasteAndConnect() {
    setIntervalsError(null);
    let key = intervalsKeyInput.trim();
    // Try reading from clipboard first
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
                ? { label: "Connect",    onClick: openIntervalsModal }
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

      {/* ── Intervals.icu connect wizard ─────────────────────────────────── */}
      {showIntervalsModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div className="stat-card" style={{ maxWidth: 420, width: "100%", padding: "24px 26px" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
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
                <div key={s} style={{
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: intervalsStep >= s ? "var(--accent)" : "var(--border, #e0e0e0)",
                    color: intervalsStep >= s ? "#fff" : "var(--muted)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>{s + 1}</div>
                  <span style={{ fontSize: 11.5, color: intervalsStep >= s ? "var(--text)" : "var(--muted)", fontWeight: intervalsStep === s ? 600 : 400 }}>
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
                <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
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

                {/* Primary: paste from clipboard */}
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

                {/* Fallback: manual input */}
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
                    style={{ width: "100%", padding: "10px", fontSize: 13, boxShadow: "none", opacity: intervalsConnecting ? 0.6 : 1 }}
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
