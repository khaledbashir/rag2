"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
    Send,
    Sparkles,
    X,
    Minimize2,
    Brain,
    Loader2,
    Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

interface Message {
    role: "user" | "assistant";
    content: string;
    sources?: any[];
    thinking?: string;
    timestamp?: number;
}

export interface DashboardChatPipelineStats {
    projectCount: number;
    mirrorCount: number;
    intelligenceCount: number;
    formattedPipeline: string;
    staleCount: number;
    recentProjectName?: string;
}

interface DashboardChatProps {
    pipelineStats?: DashboardChatPipelineStats;
}

const GENERIC_CHIPS = [
    { label: "Pipeline overview", prompt: "Give me a quick summary of the entire pipeline." },
    { label: "What needs attention?", prompt: "Which projects need attention right now?" },
    { label: "Recent activity", prompt: "What changed in the pipeline recently?" },
    { label: "Project breakdown", prompt: "Break down the pipeline by status — drafts, approved, signed." },
    { label: "Top 5 by value", prompt: "What are the top 5 projects by total value?" },
    { label: "Web search", prompt: "@agent search for LED display industry trends 2026" },
    { label: "Find venue address", prompt: "Find address for TIAA Bank Field" },
];

function buildDynamicChips(stats?: DashboardChatPipelineStats): Array<{ label: string; prompt: string }> {
    const chips: Array<{ label: string; prompt: string; priority: number }> = [];

    if (stats) {
        if (stats.staleCount > 0) {
            chips.push({
                label: `${stats.staleCount} stale drafts`,
                prompt: `Show me the ${stats.staleCount} stale draft projects that haven't been updated in over a week.`,
                priority: 3,
            });
        }
        if (stats.intelligenceCount > 10) {
            chips.push({
                label: `${stats.intelligenceCount} Intelligence projects`,
                prompt: `Summarize the ${stats.intelligenceCount} Intelligence Mode projects in the pipeline.`,
                priority: 2,
            });
        }
        if (stats.mirrorCount > 0) {
            chips.push({
                label: `${stats.mirrorCount} Mirror projects`,
                prompt: `How many Mirror Mode projects are there and what's their total value?`,
                priority: 1,
            });
        }
        if (stats.recentProjectName) {
            chips.push({
                label: `Latest: ${stats.recentProjectName.slice(0, 20)}`,
                prompt: `What do we know about the ${stats.recentProjectName} project?`,
                priority: 3,
            });
        }
        chips.push({
            label: stats.formattedPipeline,
            prompt: "What's the total pipeline value and how is it distributed?",
            priority: 2,
        });
    }

    chips.sort((a, b) => b.priority - a.priority);
    const dynamic = chips.slice(0, 2);
    const shuffled = [...GENERIC_CHIPS].sort(() => Math.random() - 0.5);
    const generic = shuffled.slice(0, 1);

    return [...dynamic, ...generic].slice(0, 3);
}

export default function DashboardChat({ pipelineStats }: DashboardChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loadedHistory, setLoadedHistory] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const persistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const suggestionChips = useMemo(() => buildDynamicChips(pipelineStats), [pipelineStats]);

    useEffect(() => {
        if (loadedHistory) return;
        setLoadedHistory(true);
        (async () => {
            try {
                const res = await fetch("/api/dashboard/chat/history");
                if (!res.ok) return;
                const data = await res.json();
                if (data.chat?.messages && Array.isArray(data.chat.messages) && data.chat.messages.length > 0) {
                    setMessages(data.chat.messages);
                    setSessionId(data.chat.id);
                }
            } catch (err) {
                console.error("[DashboardChat] Failed to load history:", err);
            }
        })();
    }, [loadedHistory]);

    const persistMessages = useCallback((msgs: Message[], title?: string) => {
        if (persistTimeout.current) clearTimeout(persistTimeout.current);
        persistTimeout.current = setTimeout(async () => {
            try {
                const res = await fetch("/api/dashboard/chat/history", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ messages: msgs, title, sessionId }),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.sessionId) setSessionId(data.sessionId);
                }
            } catch (err) {
                console.error("[DashboardChat] Failed to persist:", err);
            }
        }, 1000);
    }, [sessionId]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen(true);
                setIsMinimized(false);
            }
            if (e.key === "Escape") {
                if (!isMinimized) setIsMinimized(true);
                else setIsOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isMinimized]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async (overrideText?: string) => {
        const text = overrideText || input;
        if (!text.trim() || isLoading) return;

        const userMessage = text.trim();
        const useAgent = userMessage.startsWith("@agent");
        setInput("");
        const userMsg: Message = { role: "user", content: userMessage, timestamp: Date.now() };
        const nextMsgs = [...messages, userMsg];
        setMessages(nextMsgs);
        setIsLoading(true);

        try {
            const response = await fetch("/api/dashboard/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage, workspace: "dashboard-vault", useAgent }),
            });

            const data = await response.json();
            let content = data.response || "No response received.";
            let thinking = data.thinking || null;

            if (!thinking && content.includes("<think>")) {
                const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
                if (thinkMatch) {
                    thinking = thinkMatch[1].trim();
                    content = content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
                }
            }

            const assistantMsg: Message = {
                role: "assistant", content,
                sources: data.sources || [],
                thinking: thinking || undefined,
                timestamp: Date.now(),
            };
            const afterReply = [...nextMsgs, assistantMsg];
            setMessages(afterReply);

            const title = userMessage.length > 40 ? `${userMessage.slice(0, 40)}...` : userMessage;
            persistMessages(afterReply, title);
        } catch (error) {
            console.error("Chat error:", error);
            const errMsg: Message = { role: "assistant", content: "I encountered an error. Please try again.", timestamp: Date.now() };
            const afterErr = [...nextMsgs, errMsg];
            setMessages(afterErr);
            persistMessages(afterErr);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = useCallback(() => {
        setMessages([]);
        setSessionId(null);
        persistMessages([]);
    }, [persistMessages]);

    return (
        <div className="relative w-full">
            <AnimatePresence>
                {isOpen && !isMinimized && <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 20 }}
                    className="absolute bottom-20 left-0 right-0 max-h-[calc(100vh-7rem)] min-h-[320px] mb-4 bg-background/95 backdrop-blur-xl border border-border/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 pointer-events-auto"
                >
                    <div className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-border/40">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[#0A52EF]/10 rounded-lg flex items-center justify-center">
                                <Brain className="w-4 h-4 text-[#0A52EF]" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Intelligence Core</h3>
                                <p className="text-[10px] text-muted-foreground">Connected to dashboard-vault • @agent enabled</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {messages.length > 0 && (
                                <button onClick={handleClear} title="Clear conversation" className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-accent">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                            <button onClick={() => setIsMinimized(true)} className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent">
                                <Minimize2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setIsOpen(false)} className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                                <Sparkles className="w-8 h-8 text-[#0A52EF]" />
                                <div className="max-w-sm space-y-2">
                                    <p className="text-sm font-bold text-foreground">Strategic Intelligence Ready</p>
                                    <p className="text-xs text-muted-foreground">
                                        Ask me anything about proposals, budgets, or project history.
                                        I can search the web and your RFP documents.
                                    </p>
                                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                                        {suggestionChips.map((chip, i) => (
                                            <button
                                                key={i}
                                                onClick={() => handleSend(chip.prompt)}
                                                className="px-3 py-1.5 bg-muted/50 hover:bg-muted rounded-full text-[10px] text-muted-foreground transition-colors"
                                            >
                                                {chip.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {messages.map((msg, i) => (
                                    <div key={i} className={cn("flex flex-col space-y-2", msg.role === "user" ? "items-end" : "items-start")}>
                                        {msg.role === "user" ? (
                                            <div className="max-w-[85%] px-4 py-2 bg-[#0A52EF] text-white rounded-2xl text-sm leading-relaxed">{msg.content}</div>
                                        ) : (
                                            <div className="max-w-full space-y-3">
                                                {msg.thinking && (
                                                    <Accordion type="single" collapsible className="w-full">
                                                        <AccordionItem value="thinking" className="border border-border/40 rounded-lg bg-muted/50 px-4">
                                                            <AccordionTrigger className="py-3 hover:no-underline">
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <Brain className="w-3.5 h-3.5 text-muted-foreground" />
                                                                    <span className="font-medium text-muted-foreground">Thinking Process</span>
                                                                </div>
                                                            </AccordionTrigger>
                                                            <AccordionContent className="pb-4 pt-2">
                                                                <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
                                                                    {msg.thinking.split('\n').map((line, idx) => (
                                                                        <p key={idx}>{line}</p>
                                                                    ))}
                                                                </div>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    </Accordion>
                                                )}
                                                <div className="px-4 py-3 bg-card border border-border/40 rounded-2xl text-sm text-foreground leading-relaxed prose prose-sm max-w-none">
                                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                </div>
                                                {msg.sources && msg.sources.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {msg.sources.slice(0, 3).map((source: any, idx: number) => (
                                                            <div key={idx} className="px-2 py-1 bg-muted/50 border border-border/40 rounded text-[10px] text-muted-foreground">
                                                                📄 {source.title || `Source ${idx + 1}`}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Thinking...</span>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </div>
                </motion.div>
                }
            </AnimatePresence>

            <div className={cn(
                "w-full h-14 bg-background/80 backdrop-blur-xl border border-border/40 rounded-xl flex items-center px-4 transition-all duration-300 pointer-events-auto shadow-sm",
                isOpen && !isMinimized ? "ring-2 ring-[#0A52EF]/20 border-[#0A52EF]/50" : "hover:border-border"
            )}>
                <div className="flex items-center gap-3 mr-4">
                    <Brain className="w-4 h-4 text-[#0A52EF]" />
                    <div className="w-px h-6 bg-border" />
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    placeholder={isOpen ? "Ask anything... (prefix with @agent for web search)" : "Ask the Intelligence Core anything..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => { setIsOpen(true); setIsMinimized(false); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    disabled={isLoading}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder-muted-foreground disabled:opacity-50"
                />

                <div className="flex items-center gap-2 ml-4">
                    {!input && !isOpen && (
                        <div className="flex gap-2 mr-2">
                            <div className="px-1.5 py-0.5 border border-border rounded text-[9px] font-bold text-muted-foreground">⌘</div>
                            <div className="px-1.5 py-0.5 border border-border rounded text-[9px] font-bold text-muted-foreground">K</div>
                        </div>
                    )}
                    {input.startsWith("@agent") && (
                        <span className="text-[10px] text-[#0A52EF] bg-[#0A52EF]/10 px-2 py-0.5 rounded">Web+Docs</span>
                    )}
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isLoading}
                        className={cn(
                            "p-2 rounded-lg transition-all",
                            input && !isLoading ? "text-[#0A52EF] hover:bg-[#0A52EF]/10" : "text-muted-foreground pointer-events-none"
                        )}
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
