"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "coach";
  text: string;
  ts: number;
}

const QUICK_ACTIONS = [
  { label: "😓  Feeling tired", message: "I'm feeling quite tired and fatigued today. Should I train or rest?" },
  { label: "💪  Ready to push", message: "I'm feeling great and energized today. Can I increase the intensity?" },
  { label: "🤔  Why this workout?", message: "Can you explain the purpose of today's workout and the physiological benefits?" },
  { label: "📅  Next race advice", message: "How should I adjust my training in the last week before an important race?" },
  { label: "🏔️  Improve climbing", message: "What specific workouts will help me climb hills faster?" },
  { label: "📈  Raise my FTP", message: "What's the best strategy to increase my FTP over the next 8 weeks?" },
];

export default function CoachChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      };
      setMessages(prev => [...prev, coachMsg]);
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

  const isEmpty = messages.length === 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100dvh - 64px - env(safe-area-inset-bottom, 0px) - env(safe-area-inset-top, 0px))",
    }}>

      {/* Header */}
      <div style={{ padding: "16px 20px 12px", flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, letterSpacing: ".4px", textTransform: "uppercase" }}>
          AI Assistant
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", letterSpacing: "-.4px", marginTop: 2 }}>
          Coach Chat
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>

        {/* Empty state: quick actions */}
        {isEmpty && (
          <div>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 12, fontWeight: 500 }}>
              Quick questions:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {QUICK_ACTIONS.map(({ label, message }) => (
                <button
                  key={label}
                  onClick={() => sendMessage(message)}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "13px 16px",
                    background: "#111827", border: "1px solid #1e293b",
                    borderRadius: 14, color: "#c4d0e3",
                    fontSize: 14, fontWeight: 500, cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
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
          <div key={i} style={{
            display: "flex",
            flexDirection: msg.role === "user" ? "row-reverse" : "row",
            marginBottom: 12,
            gap: 8,
            alignItems: "flex-end",
          }}>
            {msg.role === "coach" && (
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "#1e3a5f",
                border: "1px solid #3b82f6",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, flexShrink: 0,
              }}>
                🤖
              </div>
            )}
            <div style={{
              maxWidth: "78%",
              padding: "12px 16px",
              borderRadius: msg.role === "user"
                ? "20px 20px 6px 20px"
                : "20px 20px 20px 6px",
              background: msg.role === "user" ? "#1d4ed8" : "#111827",
              border: msg.role === "user" ? "none" : "1px solid #1e293b",
              fontSize: 14,
              color: "#f1f5f9",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "#1e3a5f", border: "1px solid #3b82f6",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, flexShrink: 0,
            }}>
              🤖
            </div>
            <div style={{
              padding: "14px 18px", background: "#111827",
              border: "1px solid #1e293b", borderRadius: "20px 20px 20px 6px",
            }}>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "#3b82f6",
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
        flexShrink: 0,
        padding: "10px 16px 12px",
        borderTop: "1px solid #1e293b",
        background: "#0a0f1a",
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your coach anything…"
          rows={1}
          style={{
            flex: 1,
            padding: "12px 16px",
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 20,
            color: "#f1f5f9",
            fontSize: 15,
            outline: "none",
            resize: "none",
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: "auto",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: input.trim() && !loading ? "#2563eb" : "#1e293b",
            border: "none",
            cursor: input.trim() && !loading ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            transition: "background .15s",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
              stroke={input.trim() && !loading ? "#fff" : "#4b5563"}
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
