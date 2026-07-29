"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "coach";
  text: string;
  ts: number;
  toolAction?: string;
}

const QUICK_ACTIONS = [
  { label: "😓  Feeling tired today", message: "I'm feeling quite tired and fatigued today. Should I train or rest?" },
  { label: "💪  Ready to push harder", message: "I'm feeling great and energized today. Can I increase the intensity?" },
  { label: "🔄  Change tomorrow's workout", message: "Can you change tomorrow's workout to an easier session? I need more recovery." },
  { label: "🤔  Why this workout?", message: "Can you explain the purpose of today's workout and the physiological benefits?" },
  { label: "📅  Taper for next week's race", message: "I have a race next week. Can you adjust the plan to taper properly?" },
  { label: "📈  Raise my FTP", message: "What's the best strategy to increase my FTP over the next 8 weeks?" },
];

export default function CoachChat({ firstName }: { firstName?: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Load persisted history on mount + re-sync when tab becomes visible (cross-device)
  useEffect(() => {
    let active = true;
    const fetchHistory = (resetLoading?: boolean) => {
      if (resetLoading) setHistoryLoading(true);
      fetch("/api/m/chat/history", { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          if (!active) return;
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages(data.messages);
          }
        })
        .catch(() => {})
        .finally(() => { if (active) setHistoryLoading(false); });
    };

    fetchHistory(true);

    // Re-fetch when user switches back to this tab (iPad ↔ iPhone cross-device sync)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchHistory();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", text: trimmed, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/m/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();

      const coachMsg: Message = {
        role: "coach",
        text: data.reply ?? "Sorry, I couldn't get a response. Please try again.",
        ts: Date.now(),
        toolAction: data.toolAction,
      };
      setMessages(prev => [...prev, coachMsg]);

      // If the plan was modified, refresh the page so the week view updates
      if (data.planUpdated) {
        setTimeout(() => router.refresh(), 800);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "coach",
        text: "Network error — please check your connection and try again.",
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const isEmpty = !historyLoading && messages.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div style={{ padding: "16px 20px 12px", flexShrink: 0, borderBottom: "1px solid var(--m-border)", background: "var(--m-card)" }}>
        <div style={{ fontSize: 12, color: "var(--m-muted)", fontWeight: 500, letterSpacing: ".3px", textTransform: "uppercase", marginBottom: 4 }}>
          AI Coach
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-.6px" }}>
          {firstName ?? "Athlete"}
        </div>
        <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 2 }}>
          Ask me anything — I can also modify your training plan directly
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "0 16px" }}>

        {/* Loading history */}
        {historyLoading && (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "var(--m-muted)" }}>Loading conversation…</div>
          </div>
        )}

        {/* Empty state: quick actions */}
        {isEmpty && (
          <div style={{ padding: "8px 0" }}>
            <div style={{ fontSize: 11, color: "var(--m-muted)", marginBottom: 14, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>
              Ask your coach
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {QUICK_ACTIONS.map(({ label, message }) => (
                <button
                  key={label}
                  onClick={() => sendMessage(message)}
                  style={{
                    textAlign: "left", padding: "15px 18px",
                    background: "var(--m-card)", border: "1px solid var(--m-border)",
                    borderRadius: 4, color: "var(--m-text)", fontSize: 15,
                    fontWeight: 600, cursor: "pointer",
                    WebkitTapHighlightColor: "transparent", lineHeight: 1.4,
                    // iOS Safari: prevent button from clipping wrapped text
                    WebkitAppearance: "none" as const,
                    height: "auto", minHeight: 0,
                    whiteSpace: "normal", wordBreak: "break-word",
                    display: "block", width: "100%",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{
              display: "flex",
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
              gap: 8, alignItems: "flex-end",
            }}>
              {msg.role === "coach" && (
                <div style={{
                  width: 32, height: 32, borderRadius: 4,
                  background: "var(--m-card-inner)", border: "1px solid #FF5A1F",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, flexShrink: 0,
                }}>
                  ⚡
                </div>
              )}
              <div style={{
                maxWidth: "78%", padding: "12px 16px", borderRadius: 4,
                background: msg.role === "user" ? "#FF5A1F" : "var(--m-card)",
                border: msg.role === "user" ? "none" : "1px solid var(--m-border)",
                fontSize: 14, color: msg.role === "user" ? "#fff" : "var(--m-text)",
                lineHeight: 1.6, whiteSpace: "pre-wrap",
              }}>
                {msg.text}
              </div>
            </div>

            {/* Tool action badge — shown when coach modified something */}
            {msg.toolAction && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                marginTop: 6, marginLeft: 40,
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)",
                  borderRadius: 6, padding: "4px 10px",
                }}>
                  <span style={{ fontSize: 13 }}>✅</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#22c55e" }}>
                    {msg.toolAction}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 4,
              background: "var(--m-card-inner)", border: "1px solid #FF5A1F",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, flexShrink: 0,
            }}>
              ⚡
            </div>
            <div style={{ padding: "14px 18px", background: "var(--m-card)", border: "1px solid var(--m-border)", borderRadius: 4 }}>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: "50%", background: "#FF5A1F",
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        flexShrink: 0, padding: "10px 16px 12px",
        borderTop: "1px solid var(--m-border)", background: "var(--m-bg)",
        display: "flex", gap: 10, alignItems: "flex-end",
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your coach — or say 'change Tuesday to endurance 45min'…"
          rows={1}
          className="m-input"
          style={{
            flex: 1, padding: "12px 16px",
            background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
            borderRadius: 4, color: "var(--m-text)", caretColor: "#FF5A1F",
            fontSize: 16, outline: "none", resize: "none", lineHeight: 1.5,
            maxHeight: 120, overflowY: "auto", fontFamily: "inherit",
            WebkitAppearance: "none" as const,
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 44, height: 44, borderRadius: 4, flexShrink: 0,
            background: input.trim() && !loading ? "#FF5A1F" : "var(--m-card-inner)",
            border: `1px solid ${input.trim() && !loading ? "#FF5A1F" : "var(--m-border)"}`,
            cursor: input.trim() && !loading ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background .15s",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
              stroke={input.trim() && !loading ? "#fff" : "var(--m-muted)"}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1);   }
        }
      `}</style>
    </div>
  );
}
