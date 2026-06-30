"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm your learning assistant. Ask me anything about your courses." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      setMessages([
        ...next,
        { role: "assistant", content: json.reply ?? json.error ?? "Something went wrong." },
      ]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand-700"
          aria-label="Open learning assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      ) : (
        <div className="fixed bottom-5 right-5 z-40 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-app bg-card shadow-xl">
          <div className="flex items-center justify-between bg-brand px-4 py-3 text-white">
            <span className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4" /> Learning Assistant
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "ml-auto bg-brand text-white" : "bg-brand-50 text-foreground"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 border-t border-app p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask a question…"
              className="h-10 flex-1 rounded-lg border border-app bg-card px-3 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={send}
              disabled={loading}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-white disabled:opacity-60"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
