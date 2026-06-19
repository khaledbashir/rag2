"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FEATURES } from "@/lib/featureFlags";

type Msg = {
    role: "user" | "assistant";
    content: string;
    thinking?: string;
    suggestions?: string[];
};

type Person = { name?: string; email?: string; role?: string; team?: string };
type Match = { name: string; team?: string; sid?: string };

const PROFILE_MARKER = "---PROFILE---";
const FINALIZE_AFTER_TURNS = 6; // mirror the server cap so progress reads true

export default function TrainingIntakePage() {
    const [sessionId, setSessionId] = useState<string>("");
    const [person, setPerson] = useState<Person>({});
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [started, setStarted] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Identity step (name-first, visual)
    const [phase, setPhase] = useState<"identity" | "chat">("identity");
    const [nameInput, setNameInput] = useState("");
    const [matches, setMatches] = useState<Match[]>([]);
    const [lookingUp, setLookingUp] = useState(false);

    useEffect(() => {
        // Personalized links carry ?sid=&name=&email=&role=&team=. When a name is
        // present we pre-fill the "Is this you?" confirm card; otherwise we ask first.
        try {
            const sp = new URLSearchParams(window.location.search);
            const sid = sp.get("sid") || "";
            setSessionId(sid || crypto.randomUUID());
            const p: Person = {
                name: sp.get("name") || undefined,
                email: sp.get("email") || undefined,
                role: sp.get("role") || undefined,
                team: sp.get("team") || undefined,
            };
            if (p.name) {
                setMatches([{ name: p.name, team: p.team, sid: sid || undefined }]);
            }
        } catch {
            setSessionId(crypto.randomUUID());
        }
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, loading]);

    if (!FEATURES.TRAINING_INTAKE) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500" style={{ colorScheme: "light" }}>
                This page isn&apos;t available right now.
            </div>
        );
    }

    const firstName = person.name ? person.name.trim().split(/\s+/)[0] : "";

    async function doLookup() {
        const q = nameInput.trim();
        if (!q || lookingUp) return;
        setLookingUp(true);
        try {
            const res = await fetch("/api/training-intake", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "lookup", name: q }),
            });
            const data = await res.json();
            const found: Match[] = Array.isArray(data.matches) ? data.matches : [];
            if (found.length > 0) {
                setMatches(found);
            } else {
                // No roster match — go ahead with what they typed.
                confirmIdentity({ name: q });
            }
        } catch {
            confirmIdentity({ name: q });
        } finally {
            setLookingUp(false);
        }
    }

    function confirmIdentity(m: Match) {
        setPerson({ name: m.name, team: m.team, role: person.role });
        if (m.sid) setSessionId(m.sid);
        setPhase("chat");
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
                body: JSON.stringify({ action: "chat", messages: next, sessionId, person }),
            });
            const data = await res.json();
            const reply: string = data.reply || data.error || "Sorry, I didn't catch that — could you try again?";
            const thinking: string = data.thinking || "";
            const suggestions: string[] = Array.isArray(data.suggestions) ? data.suggestions : [];

            const hasProfile = reply.includes(PROFILE_MARKER);
            const visible = hasProfile ? reply.split(PROFILE_MARKER)[0].trim() : reply;

            const shown: Msg[] = [
                ...next,
                { role: "assistant", content: visible, thinking, suggestions: hasProfile ? [] : suggestions },
            ];
            setMessages(shown);

            if (hasProfile) {
                setDone(true);
                const full: Msg[] = [...next, { role: "assistant", content: reply }];
                fetch("/api/training-intake", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "save", sessionId, messages: full, person }),
                }).catch(() => {});
            }
        } catch {
            setMessages((m) => [...m, { role: "assistant", content: "Something hiccuped on my end — mind sending that again?" }]);
        } finally {
            setLoading(false);
        }
    }

    const last = messages[messages.length - 1];
    const liveSuggestions = !done && !loading && last && last.role === "assistant" ? last.suggestions || [] : [];

    // Progress: how many answers given vs the wrap-up cap.
    const answered = messages.filter((m) => m.role === "user").length;
    const progressPct = Math.min(100, Math.round((answered / FINALIZE_AFTER_TURNS) * 100));
    const left = Math.max(0, FINALIZE_AFTER_TURNS - answered);
    const progressLabel = done ? "All done" : answered === 0 ? "Just a couple minutes" : left <= 1 ? "Almost done!" : `About ${left} questions left`;

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col" style={{ colorScheme: "light" }}>
            {/* Header */}
            <header className="border-b border-blue-100 bg-white/80 backdrop-blur">
                <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">A</div>
                    <div className="flex-1">
                        <div className="font-semibold text-slate-800">ANC CRM — Quick Intro</div>
                        <div className="text-xs text-slate-500">A 2-minute chat so your training fits how you work</div>
                    </div>
                </div>
                {/* Progress bar (chat only) */}
                {phase === "chat" && (
                    <div className="max-w-2xl mx-auto px-4 pb-3">
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
                            <span>{progressLabel}</span>
                            {!done && <span>{progressPct}%</span>}
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                                style={{ width: `${done ? 100 : Math.max(6, progressPct)}%` }}
                            />
                        </div>
                    </div>
                )}
            </header>

            {/* ── Identity step ── */}
            {phase === "identity" ? (
                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-md mx-auto px-4 py-10">
                        {matches.length > 0 ? (
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className="text-2xl">👋</div>
                                    <h1 className="mt-2 text-lg font-bold text-slate-800">Is this you?</h1>
                                    <p className="mt-1 text-sm text-slate-500">Tap your name to get started — that&apos;s it.</p>
                                </div>
                                <div className="space-y-2">
                                    {matches.map((m, i) => (
                                        <button
                                            key={i}
                                            onClick={() => confirmIdentity(m)}
                                            className="w-full flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-400 hover:shadow-md"
                                        >
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                                                {m.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-bold text-slate-800">{m.name}</span>
                                                {m.team && <span className="block truncate text-xs text-slate-500">{m.team} team</span>}
                                            </span>
                                            <span className="ml-auto text-sm font-semibold text-blue-600">That&apos;s me →</span>
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => { setMatches([]); setNameInput(""); }}
                                    className="w-full text-center text-xs font-medium text-slate-400 hover:text-slate-600"
                                >
                                    Not me — I&apos;ll type my name
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className="text-2xl">👋</div>
                                    <h1 className="mt-2 text-lg font-bold text-slate-800">Hi! Let&apos;s set up your training.</h1>
                                    <p className="mt-1 text-sm text-slate-500">First — what&apos;s your name?</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        autoFocus
                                        value={nameInput}
                                        onChange={(e) => setNameInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") doLookup(); }}
                                        placeholder="Type your name…"
                                        className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    />
                                    <button
                                        onClick={doLookup}
                                        disabled={lookingUp || !nameInput.trim()}
                                        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-blue-700 transition"
                                    >
                                        {lookingUp ? "…" : "Continue"}
                                    </button>
                                </div>
                                <p className="text-center text-[11px] text-slate-400">No wrong answers — this just tailors your training.</p>
                            </div>
                        )}
                    </div>
                </main>
            ) : (
                <>
                    {/* Chat */}
                    <main ref={scrollRef} className="flex-1 overflow-y-auto">
                        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                            {!started && (
                                <div className="space-y-4">
                                    <Bubble role="assistant">
                                        {firstName ? `Hi ${firstName}! 👋 ` : "Hi! 👋 "}
                                        I&apos;m here to set up your CRM training so it actually fits you — takes about two minutes, and
                                        there are no wrong answers. Want the quick version or a proper chat?
                                    </Bubble>
                                    <div className="flex flex-wrap gap-2">
                                        <StarterButton onClick={() => send("Let's do the quick version")}>⚡ Quick version</StarterButton>
                                        <StarterButton onClick={() => send("Let's have a proper chat")}>💬 Proper chat</StarterButton>
                                    </div>
                                </div>
                            )}

                            {messages.map((m, i) => (
                                <div key={i} className="space-y-1">
                                    {m.role === "assistant" && m.thinking ? <Thinking text={m.thinking} /> : null}
                                    <Bubble role={m.role}>
                                        {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}
                                    </Bubble>
                                </div>
                            ))}

                            {loading && (
                                <Bubble role="assistant">
                                    <span className="inline-flex gap-1">
                                        <Dot /> <Dot /> <Dot />
                                    </span>
                                </Bubble>
                            )}

                            {liveSuggestions.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {liveSuggestions.map((s, i) => (
                                        <StarterButton key={i} onClick={() => send(s)}>{s}</StarterButton>
                                    ))}
                                </div>
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
                                    className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                </>
            )}
        </div>
    );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
    const isUser = role === "user";
    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isUser
                        ? "bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
                }`}
            >
                {children}
            </div>
        </div>
    );
}

/** Renders assistant replies as markdown (bold, lists, links) without the typography plugin. */
function Markdown({ children }: { children: string }) {
    return (
        <div className="text-sm leading-relaxed [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_a]:text-blue-600 [&_a]:underline [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}

/** Collapsed "Thinking" accordion. */
function Thinking({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="flex justify-start">
            <div className="max-w-[85%] w-full">
                <button
                    onClick={() => setOpen((o) => !o)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition"
                >
                    <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                    💭 Thinking
                </button>
                {open && (
                    <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 whitespace-pre-wrap font-mono leading-relaxed">
                        {text}
                    </div>
                )}
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
