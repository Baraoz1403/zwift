"use client";

import { useState, useEffect } from "react";

const ICU_API_SETTINGS_URL = "https://intervals.icu/settings#developer";

/** Animated step indicator inside the browser mockup */
function MockupStep({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: active || done ? 1 : 0.35, transition: "opacity 0.4s" }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
        background: done ? "#22c55e" : active ? "#3b82f6" : "rgba(15,23,42,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.4s",
      }}>
        {done ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#fff" : "rgba(15,23,42,0.3)" }} />
        )}
      </div>
      <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "#0f172a" : "#64748b" }}>{label}</span>
    </div>
  );
}

/** Animated browser mockup showing where to click on intervals.icu */
function ICUMockup({ step }: { step: number }) {
  const [arrowBounce, setArrowBounce] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setArrowBounce(v => !v), 800);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      borderRadius: 10, overflow: "hidden",
      border: "1px solid rgba(15,23,42,0.12)",
      boxShadow: "0 8px 28px rgba(0,0,0,0.10)",
      fontFamily: "system-ui, sans-serif",
      fontSize: 12,
    }}>
      {/* Browser chrome */}
      <div style={{
        background: "#f1f5f9", padding: "8px 12px",
        display: "flex", alignItems: "center", gap: 8,
        borderBottom: "1px solid rgba(15,23,42,0.10)",
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["#ef4444","#f59e0b","#22c55e"].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <div style={{
          flex: 1, background: "#fff", borderRadius: 5,
          border: "1px solid rgba(15,23,42,0.10)",
          padding: "3px 10px", fontSize: 11, color: "#64748b",
        }}>
          intervals.icu/settings#developer
        </div>
      </div>

      {/* Page content */}
      <div style={{ background: "#fff", padding: "16px 18px" }}>
        {/* Sidebar + content layout */}
        <div style={{ display: "flex", gap: 14 }}>
          {/* Sidebar */}
          <div style={{ width: 110, flexShrink: 0 }}>
            {["Profile", "Notifications", "Integrations", "Developer"].map((item, i) => (
              <div key={item} style={{
                padding: "6px 10px", borderRadius: 5, marginBottom: 2, fontSize: 11.5,
                background: item === "Developer" ? "rgba(59,130,246,0.10)" : "transparent",
                color: item === "Developer" ? "#3b82f6" : "#64748b",
                fontWeight: item === "Developer" ? 700 : 400,
                borderLeft: item === "Developer" ? "2px solid #3b82f6" : "2px solid transparent",
              }}>
                {item}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 12 }}>
              Developer Settings
            </div>

            {/* API Key section */}
            <div style={{
              background: "#f8fafc", borderRadius: 8,
              border: "1px solid rgba(15,23,42,0.08)",
              padding: "12px 14px",
              position: "relative",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
                API KEY
              </div>

              {step < 2 ? (
                /* Step 1: show the Generate button with animated arrow */
                <div style={{ position: "relative", display: "inline-block" }}>
                  <button type="button" style={{
                    padding: "7px 16px", borderRadius: 6, border: "none",
                    background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                    color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    boxShadow: step === 1 ? "0 0 0 3px rgba(59,130,246,0.3), 0 4px 12px rgba(59,130,246,0.4)" : "none",
                    transition: "box-shadow 0.4s",
                  }}>
                    Generate API Key
                  </button>
                  {/* Animated arrow */}
                  {step === 1 && (
                    <div style={{
                      position: "absolute", top: -36, left: "50%",
                      transform: `translateX(-50%) translateY(${arrowBounce ? -3 : 0}px)`,
                      transition: "transform 0.4s ease",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    }}>
                      <div style={{
                        background: "#3b82f6", color: "#fff",
                        borderRadius: 4, padding: "2px 7px",
                        fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                      }}>Click here!</div>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="#3b82f6">
                        <polygon points="5,10 0,0 10,0" />
                      </svg>
                    </div>
                  )}
                </div>
              ) : (
                /* Step 2/3: show the generated key */
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    fontFamily: "monospace", fontSize: 11, background: "#f0f9ff",
                    border: "1px solid rgba(59,130,246,0.2)", borderRadius: 4,
                    padding: "5px 10px", color: "#1d4ed8", letterSpacing: "0.05em",
                  }}>
                    ic0_••••••••••••••••••••••••••••••••
                  </div>
                  <div style={{
                    padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                    background: step === 3 ? "#dcfce7" : "rgba(59,130,246,0.1)",
                    border: `1px solid ${step === 3 ? "#86efac" : "rgba(59,130,246,0.2)"}`,
                    color: step === 3 ? "#16a34a" : "#3b82f6",
                    display: "flex", alignItems: "center", gap: 4, transition: "all 0.4s",
                  }}>
                    {step === 3 ? (
                      <>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Copied!
                      </>
                    ) : "Copy"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntervalsOnboarding() {
  const [started, setStarted] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animStep, setAnimStep] = useState(1);

  // Auto-advance the mockup animation loop
  useEffect(() => {
    const sequence = [1, 1, 1, 2, 2, 3, 3, 3, 1];
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % sequence.length;
      setAnimStep(sequence[i]);
    }, 1400);
    return () => clearInterval(t);
  }, []);

  function handleStart() {
    setStarted(true);
    try {
      window.open(ICU_API_SETTINGS_URL, "_blank", "noopener,noreferrer");
    } catch { /* popup blocker fallback below */ }
  }

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
    <div style={{ maxWidth: 520, margin: "32px auto 0", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Hero banner ── */}
      <div style={{
        borderRadius: 14, overflow: "hidden",
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%)",
        padding: "28px 28px 22px",
        marginBottom: 20,
        position: "relative",
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute", top: -40, right: -40, width: 200, height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 65%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative" }}>
          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px rgba(59,130,246,0.5)",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: "-0.3px" }}>
                Connect Intervals.icu
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>
                Sync AI workouts directly to your training calendar
              </div>
            </div>
          </div>

          {/* Step progress */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <MockupStep
              active={!started}
              done={started}
              label="Open intervals.icu API settings"
            />
            <MockupStep
              active={started && !apiKey}
              done={!!apiKey}
              label="Click Generate API Key and copy it"
            />
            <MockupStep
              active={!!apiKey}
              done={false}
              label="Paste the key below and connect"
            />
          </div>
        </div>
      </div>

      {/* ── Animated mockup ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          What you&apos;ll see on intervals.icu:
        </div>
        <ICUMockup step={animStep} />
      </div>

      {/* ── Action card ── */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.10)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        padding: 24,
      }}>
        {!started ? (
          <>
            <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 600, marginBottom: 6 }}>
              Ready? This takes about 30 seconds.
            </div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 18, lineHeight: 1.6 }}>
              Clicking Connect opens the intervals.icu API settings page in a new tab. No account approval needed — just generate a key and paste it back here.
            </div>
            <button
              type="button"
              onClick={handleStart}
              style={{
                width: "100%", padding: "13px", borderRadius: 9, border: "none",
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                color: "#fff", fontSize: 14.5, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 18px rgba(59,130,246,0.40)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Connect → Open intervals.icu
            </button>
          </>
        ) : (
          <form onSubmit={handleConnect} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>
              Paste your API key here
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, lineHeight: 1.5 }}>
              Go to intervals.icu → Settings → Developer → click <strong>Generate API Key</strong> → copy it → paste below.
            </div>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="ic0_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              autoFocus
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 8,
                border: `1.5px solid ${apiKey ? "rgba(59,130,246,0.5)" : "rgba(15,23,42,0.15)"}`,
                fontSize: 13.5, fontFamily: "monospace",
                color: "#0f172a", background: "#fff",
                outline: "none", boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
            />
            <button
              type="submit"
              disabled={!apiKey.trim() || connecting}
              style={{
                width: "100%", padding: "12px", borderRadius: 9, border: "none",
                background: !apiKey.trim() || connecting
                  ? "#e2e8f0"
                  : "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                color: !apiKey.trim() || connecting ? "#94a3b8" : "#fff",
                fontSize: 14, fontWeight: 700, cursor: !apiKey.trim() || connecting ? "default" : "pointer",
                fontFamily: "inherit",
                boxShadow: apiKey.trim() && !connecting ? "0 4px 14px rgba(59,130,246,0.35)" : "none",
                transition: "all 0.2s",
              }}
            >
              {connecting ? "Connecting…" : "✓ Finish connecting"}
            </button>
            <button
              type="button"
              onClick={handleStart}
              style={{
                background: "none", border: "none", color: "#3b82f6",
                fontSize: 12, cursor: "pointer", textDecoration: "underline",
                textAlign: "center", fontFamily: "inherit",
              }}
            >
              Didn&apos;t open? Click to reopen intervals.icu settings
            </button>
          </form>
        )}

        {error && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "#ef4444", textAlign: "center", fontWeight: 500 }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 11 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Free · No approval needed · Key stored encrypted
        </div>
      </div>
    </div>
  );
}
