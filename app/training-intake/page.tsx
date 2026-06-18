"use client";

import { useEffect, useRef, useState } from "react";
import { FEATURES } from "@/lib/featureFlags";

type Msg = { role: "user" | "assistant"; content: string };

const PROFILE_MARKER = "---PROFILE---";

export default function TrainingIntakePage() {
    const [sessionId, setSessionId] = useState<string>("");
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [started, setStarted] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSessionId(crypto.randomUUID());
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, loading]);

    if (!FEATURES.TRAINING_INTAKE) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
                This page isn&apos;t available right now.
            </div>
        );
    }

    async function send(text: string) {
        const trimmed = text.trim();
        if (!trimmed || loading || done) return;
        setStarted(true);
        setInput("");
        const next: Msg[] = [...messages, { role: "user", content: trimmed }];
        setMessages(next);
        setLoading(true);
        try {
            const res = await fetch("/api/training-intake", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "chat", messages: next, sessionId }),
            });
            const data = await res.json();
            const reply: string = data.reply || data.error || "Sorry, I didn't catch that — could you try again?";

            const hasProfile = reply.includes(PROFILE_MARKER);
            const visible = hasProfile ? reply.split(PROFILE_MARKER)[0].trim() : reply;
            const full: Msg[] = [...next, { role: "assistant", content: reply }];
            setMessages(hasProfile ? [...next, { role: "assistant", content: visible }] : full);

            if (hasProfile) {
                setDone(true);
                fetch("/api/training-intake", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "save", sessionId, messages: full }),
                }).catch(() => {});
            }
        } catch {
            setMessages((m) => [...m, { role: "assistant", content: "Something hiccuped on my end — mind sending that again?" }]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
            {/* Header */}
            <header className="border-b border-blue-100 bg-white/80 backdrop-blur">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">A</div>
                    <div>
                        <div className="font-semibold text-slate-800">ANC CRM — Quick Intro</div>
                        <div className="text-xs text-slate-500">A 2-minute chat so your training fits how you work</div>
                    </div>
                </div>
            </header>

            {/* Chat */}
            <main ref={scrollRef} className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                    {!started && (
                        <div className="space-y-4">
                            <Bubble role="assistant">
                                Hi! 👋 I&apos;m here to set up your CRM training so it actually fits you — takes about two
                                minutes, and there are no wrong answers. Want the quick version or a proper chat?
                            </Bubble>
                            <div className="flex flex-wrap gap-2">
                                <StarterButton onClick={() => send("Let's do the quick version")}>⚡ Quick version</StarterButton>
                                <StarterButton onClick={() => send("Let's have a proper chat")}>💬 Proper chat</StarterButton>
                            </div>
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <Bubble key={i} role={m.role}>{m.content}</Bubble>
                    ))}

                    {loading && (
                        <Bubble role="assistant">
                            <span className="inline-flex gap-1">
                                <Dot /> <Dot /> <Dot />
                            </span>
                        </Bubble>
                    )}

                    {done && (
                        <div className="text-center text-sm text-slate-500 pt-2">
                            All set — thanks. Your training will be tailored to what you shared. You can close this tab.
                        </div>
                    )}
                </div>
            </main>

            {/* Input */}
            {!done && (
                <footer className="border-t border-blue-100 bg-white">
                    <div className="max-w-2xl mx-auto px-4 py-3 flex items-end gap-2">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    send(input);
                                }
                            }}
                            rows={1}
                            placeholder="Type your answer…"
                            className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        <button
                            onClick={() => send(input)}
                            disabled={loading || !input.trim()}
                            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-blue-700 transition"
                        >
                            Send
                        </button>
                    </div>
                </footer>
            )}
        </div>
    );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
    const isUser = role === "user";
    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isUser ? "bg-blue-600 text-white rounded-br-sm" : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                }`}
            >
                {children}
            </div>
        </div>
    );
}

function StarterButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 transition"
        >
            {children}
        </button>
    );
}

function Dot() {
    return <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce inline-block" />;
}
