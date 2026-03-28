"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, Send, X, Minimize2, Maximize2 } from "lucide-react";

interface LuxMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface LuxWidgetProps {
  displays: any[];
  sourceText?: string;
}

export default function LuxWidget({ displays, sourceText }: LuxWidgetProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<LuxMessage[]>([
    {
      role: "assistant",
      content: `${displays.length} displays loaded. What do you need?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    const userMsg: LuxMessage = { role: "user", content: msg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/rfp/lux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          context: {
            displays: displays.slice(0, 50), // Cap at 50 to avoid token overflow
            sourceText: sourceText?.substring(0, 30000),
          },
        }),
      });

      const data = await res.json();
      const reply = data.reply || data.error || "No response";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply, timestamp: new Date() },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message}`, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-[#0A52EF] hover:bg-[#0A52EF]/90 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="Lux — AI Assistant"
      >
        <MessageSquare className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 bg-[#1a1b26] border border-gray-700 rounded-xl shadow-2xl flex flex-col transition-all ${
        expanded
          ? "inset-4"
          : "bottom-6 right-6 w-[420px] h-[520px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">💡</span>
          <span className="text-sm font-semibold text-white">Lux</span>
          <span className="text-[10px] text-gray-500 font-mono">MiniMax M2.7</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#0A52EF] text-white"
                  : "bg-gray-800 text-gray-200"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm">
              <span className="animate-pulse">thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Lux anything about this extraction..."
            rows={1}
            className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-[#0A52EF] placeholder-gray-500 max-h-24 overflow-y-auto"
            style={{ minHeight: "36px" }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="p-2 bg-[#0A52EF] hover:bg-[#0A52EF]/80 disabled:opacity-30 text-white rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
