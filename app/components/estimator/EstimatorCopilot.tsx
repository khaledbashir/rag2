"use client";

/**
 * EstimatorCopilot — AI chat panel for the estimator workspace.
 *
 * Lightweight alternative to CopilotPanel, purpose-built for estimator.
 * - Parses estimator-specific intents (add display, set margins, etc.)
 * - Executes intents by updating EstimatorAnswers state
 * - Falls back to local response builder for general questions
 * - Same Lux branding as main copilot
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
    MessageSquare,
    Send,
    X,
    Zap,
    Minus,
    ArrowDown,
    Mic,
    MicOff,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { EstimatorAnswers } from "./questions";
import type { ScreenCalc } from "./EstimatorBridge";
import {
    parseEstimatorIntent,
    executeEstimatorIntent,
} from "@/services/chat/estimatorIntents";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

// ============================================================================
// TYPES
// ============================================================================

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

interface EstimatorCopilotProps {
    answers: EstimatorAnswers;
    calcs: ScreenCalc[];
    onUpdateAnswers: (next: EstimatorAnswers) => void;
    isOpen: boolean;
    onClose: () => void;
}

// ============================================================================
// SUGGESTIONS
// ============================================================================

function getSuggestions(answers: EstimatorAnswers, calcs: ScreenCalc[]): string[] {
    if (answers.displays.length === 0) {
        return [
            "Add a 20x10 scoreboard at 4mm",
            "Add a ribbon board 200x3 at 6mm",
            "What can you do?",
        ];
    }
    if (calcs.length > 0) {
        return [
            "What's the total?",
            "Add another display",
            "Explain the costs",
            "Set LED margin to 15%",
        ];
    }
    return [
        "What's the total?",
        "Set LED margin to 15%",
        "Set service margin to 20%",
    ];
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function EstimatorCopilot({
    answers,
    calcs,
    onUpdateAnswers,
    isOpen,
    onClose,
}: EstimatorCopilotProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [newMessageCount, setNewMessageCount] = useState(0);

    const viewportRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const prevCountRef = useRef(0);

    // Keep latest answers/calcs in refs for async callbacks
    const answersRef = useRef(answers);
    const calcsRef = useRef(calcs);
    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { calcsRef.current = calcs; }, [calcs]);

    const {
        start: startListening,
        stop: stopListening,
        transcript,
        interimTranscript,
        isListening,
        isSupported: isMicSupported,
        reset: resetTranscript,
    } = useSpeechRecognition();

    const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const scrollToBottom = useCallback((smooth = true) => {
        messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
    }, []);

    useEffect(() => {
        if (transcript) setInput(transcript);
    }, [transcript]);

    useEffect(() => {
        if (isListening && interimTranscript) {
            setInput(transcript ? `${transcript} ${interimTranscript}` : interimTranscript);
        }
    }, [interimTranscript, isListening, transcript]);

    useEffect(() => {
        if (!isOpen) return;
        if (isAtBottom) {
            scrollToBottom();
            setNewMessageCount(0);
        } else if (messages.length > prevCountRef.current) {
            setNewMessageCount((c) => c + 1);
        }
        prevCountRef.current = messages.length;
    }, [messages, isOpen, isAtBottom, scrollToBottom]);

    useEffect(() => {
        if (isOpen && inputRef.current) inputRef.current.focus();
    }, [isOpen]);

    const adjustInputHeight = useCallback(() => {
        if (!inputRef.current) return;
        inputRef.current.style.height = "auto";
        const next = Math.max(44, Math.min(120, inputRef.current.scrollHeight));
        inputRef.current.style.height = `${next}px`;
    }, []);

    useEffect(() => { adjustInputHeight(); }, [input, adjustInputHeight]);

    const suggestions = useMemo(
        () => getSuggestions(answers, calcs),
        [answers, calcs],
    );

    const onMessagesScroll = () => {
        if (!viewportRef.current) return;
        const el = viewportRef.current;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 36;
        setIsAtBottom(nearBottom);
        if (nearBottom) setNewMessageCount(0);
    };

    const handleSend = async (forcedText?: string) => {
        const text = (forcedText ?? input).trim();
        if (!text || isLoading) return;

        const userMsg: ChatMessage = { id: newId(), role: "user", content: text, timestamp: Date.now() };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        if (isListening) {
            stopListening();
            resetTranscript();
        }

        try {
            // 1. Try estimator-specific intent parsing
            const intent = parseEstimatorIntent(text);
            if (intent.type !== "general_question" && intent.confidence > 0.5) {
                const result = executeEstimatorIntent(intent, answersRef.current, calcsRef.current);
                if (result.success) {
                    if (result.updatedAnswers) onUpdateAnswers(result.updatedAnswers);
                    const assistantMsg: ChatMessage = {
                        id: newId(),
                        role: "assistant",
                        content: result.message,
                        timestamp: Date.now(),
                    };
                    setMessages((prev) => [...prev, assistantMsg]);
                    setIsLoading(false);
                    return;
                }
            }

            // 2. For query intents (read-only), execute directly
            if (intent.type === "query_total" || intent.type === "query_display" || intent.type === "explain_cost") {
                const result = executeEstimatorIntent(intent, answersRef.current, calcsRef.current);
                const assistantMsg: ChatMessage = {
                    id: newId(),
                    role: "assistant",
                    content: result.message || "I couldn't find that information.",
                    timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, assistantMsg]);
                setIsLoading(false);
                return;
            }

            // 3. Fall back to local response builder for general questions
            const response = buildLocalResponse(text, answersRef.current, calcsRef.current);

            const assistantMsg: ChatMessage = {
                id: newId(),
                role: "assistant",
                content: response,
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } catch (err: any) {
            const errorMsg: ChatMessage = {
                id: newId(),
                role: "assistant",
                content: `Error: ${err?.message || String(err)}`,
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="flex h-full w-full flex-col bg-white"
        >
            {/* Header bar */}
            <div className="h-1 w-full bg-gradient-to-r from-[#0055B3] to-[#2E87E5]" />
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5">
                <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-[#0055B3]/10 p-1.5">
                        <Zap className="h-3.5 w-3.5 text-[#0055B3]" />
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-zinc-900">Lux</h3>
                        <p className="text-[10px] text-zinc-500">Estimator copilot</p>
                    </div>
                </div>
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={onClose}
                        className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                        title="Close"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div
                ref={viewportRef}
                onScroll={onMessagesScroll}
                className="relative flex-1 overflow-y-auto bg-gradient-to-b from-white to-[#F8FAFC] px-3 py-3"
            >
                {messages.length === 0 ? (
                    <div className="space-y-3">
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                            <div className="mb-1.5 text-xs font-semibold text-zinc-900">Estimator Copilot</div>
                            <div className="space-y-1 text-[11px] text-zinc-600">
                                <p>I can help you build estimates quickly:</p>
                                <p>- "Add a 20x10 scoreboard at 4mm"</p>
                                <p>- "Set LED margin to 15%"</p>
                                <p>- "What's the total?"</p>
                                <p>- "Explain structural costs"</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {messages.map((msg) => {
                            const isUser = msg.role === "user";
                            return (
                                <div
                                    key={msg.id}
                                    className={cn("animate-[copilot-message-in_200ms_ease-out]", isUser ? "ml-8 flex justify-end" : "mr-8")}
                                >
                                    <div
                                        className={cn(
                                            "rounded-2xl px-3 py-2 text-[11px] leading-relaxed",
                                            isUser
                                                ? "rounded-br-md bg-[#0055B3] text-white"
                                                : "rounded-bl-md bg-[#F3F4F6] text-zinc-900"
                                        )}
                                    >
                                        {isUser ? (
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                        ) : (
                                            <div className="copilot-markdown text-[11px] leading-relaxed break-words overflow-hidden">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: ({ children }) => <p className="my-1 text-zinc-900">{children}</p>,
                                                        strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
                                                        em: ({ children }) => <em className="italic">{children}</em>,
                                                        h1: ({ children }) => <h3 className="text-xs font-bold text-zinc-900 mt-2 mb-1">{children}</h3>,
                                                        h2: ({ children }) => <h4 className="text-[11px] font-bold text-zinc-900 mt-2 mb-1">{children}</h4>,
                                                        h3: ({ children }) => <h5 className="text-[11px] font-semibold text-zinc-900 mt-1.5 mb-0.5">{children}</h5>,
                                                        ul: ({ children }) => <ul className="my-1 ml-3 list-disc space-y-0.5 text-zinc-700">{children}</ul>,
                                                        ol: ({ children }) => <ol className="my-1 ml-3 list-decimal space-y-0.5 text-zinc-700">{children}</ol>,
                                                        li: ({ children }) => <li className="text-[11px] leading-relaxed">{children}</li>,
                                                        code: ({ className, children, ...props }) => {
                                                            const isBlock = className?.includes("language-");
                                                            if (isBlock) {
                                                                return (
                                                                    <pre className="my-1.5 rounded bg-zinc-800 text-zinc-100 px-2 py-1.5 text-[10px] leading-snug overflow-x-auto">
                                                                        <code className={className} {...props}>{children}</code>
                                                                    </pre>
                                                                );
                                                            }
                                                            return <code className="rounded bg-zinc-200 px-1 py-0.5 text-[10px] font-mono text-zinc-800" {...props}>{children}</code>;
                                                        },
                                                        pre: ({ children }) => <>{children}</>,
                                                        table: ({ children }) => (
                                                            <div className="my-1.5 overflow-x-auto rounded border border-zinc-200">
                                                                <table className="w-full text-[10px] border-collapse">{children}</table>
                                                            </div>
                                                        ),
                                                        thead: ({ children }) => <thead className="bg-zinc-100">{children}</thead>,
                                                        th: ({ children }) => <th className="px-2 py-1 text-left font-semibold text-zinc-700 border-b border-zinc-200 whitespace-nowrap">{children}</th>,
                                                        td: ({ children }) => <td className="px-2 py-1 text-zinc-600 border-b border-zinc-100 whitespace-nowrap">{children}</td>,
                                                        tr: ({ children }) => <tr className="hover:bg-zinc-50">{children}</tr>,
                                                        blockquote: ({ children }) => <blockquote className="my-1 border-l-2 border-[#0055B3] pl-2 text-zinc-600 italic">{children}</blockquote>,
                                                        hr: () => <hr className="my-2 border-zinc-200" />,
                                                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#0055B3] underline hover:text-[#004494]">{children}</a>,
                                                    }}
                                                >{msg.content}</ReactMarkdown>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {isLoading && (
                            <div className="mr-8">
                                <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-[#F3F4F6] px-3 py-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-[copilot-dot-bounce_1s_infinite]" />
                                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-[copilot-dot-bounce_1s_120ms_infinite]" />
                                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-[copilot-dot-bounce_1s_240ms_infinite]" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Scroll to bottom */}
                {!isAtBottom && newMessageCount > 0 && (
                    <button
                        onClick={() => { scrollToBottom(); setNewMessageCount(0); }}
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[#0055B3] px-3 py-1 text-[10px] font-medium text-white shadow-lg"
                    >
                        <ArrowDown className="h-3 w-3" />
                        {newMessageCount} new
                    </button>
                )}
            </div>

            {/* Suggestions */}
            {messages.length === 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    {suggestions.map((s) => (
                        <button
                            key={s}
                            onClick={() => void handleSend(s)}
                            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="border-t border-zinc-200 bg-white p-2.5">
                <div className="flex items-end gap-1.5 rounded-xl border border-zinc-200 bg-[#FAFAFA] px-2.5 py-1.5">
                    {isMicSupported && (
                        <button
                            onClick={() => {
                                if (isListening) { stopListening(); resetTranscript(); }
                                else startListening();
                            }}
                            className={cn(
                                "mb-0.5 rounded-md p-1 transition-colors",
                                isListening ? "text-red-500 bg-red-50" : "text-zinc-400 hover:text-zinc-600"
                            )}
                            title={isListening ? "Stop recording" : "Voice input"}
                        >
                            {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                        </button>
                    )}
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your estimate..."
                        className="flex-1 resize-none bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                        rows={1}
                        style={{ minHeight: 28, maxHeight: 120 }}
                    />
                    <button
                        onClick={() => void handleSend()}
                        disabled={!input.trim() || isLoading}
                        className={cn(
                            "mb-0.5 rounded-lg p-1.5 transition-colors",
                            input.trim() && !isLoading
                                ? "bg-[#0055B3] text-white hover:bg-[#004494]"
                                : "bg-zinc-100 text-zinc-400"
                        )}
                    >
                        <Send className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// LOCAL RESPONSE BUILDER
// ============================================================================

function buildLocalResponse(query: string, answers: EstimatorAnswers, calcs: ScreenCalc[]): string {
    const lower = query.toLowerCase();

    if (lower.includes("what can you do") || lower.includes("help")) {
        return `I'm Lux, your estimator copilot. I can:\n\n` +
            `- **Add displays**: "Add a 20x10 scoreboard at 4mm"\n` +
            `- **Set margins**: "Set LED margin to 15%" or "Set service margin to 20%"\n` +
            `- **Adjust rates**: "Set bond rate to 1.5%" or "Set tax to 8.5%"\n` +
            `- **Change settings**: "Union labor", "Outdoor install", "Switch to CAD"\n` +
            `- **Get info**: "What's the total?", "Explain structural costs"\n` +
            `- **Quick setup**: "Set LED margin to 15% and service margin to 20%"`;
    }

    if (lower.includes("status") || lower.includes("where am i") || lower.includes("current")) {
        const parts: string[] = [];
        if (answers.clientName) parts.push(`Client: ${answers.clientName}`);
        if (answers.projectName) parts.push(`Project: ${answers.projectName}`);
        parts.push(`Displays: ${answers.displays.length}`);
        parts.push(`Depth: ${answers.estimateDepth}`);
        parts.push(`Margins: LED ${answers.ledMargin}% / Installation Services ${answers.servicesMargin}%`);
        parts.push(`Union: ${answers.isUnion ? "Yes" : "No"}`);
        parts.push(`Indoor: ${answers.isIndoor ? "Yes" : "No"}`);
        if (calcs.length > 0) {
            const total = calcs.reduce((s, c) => s + c.finalTotal, 0);
            parts.push(`Grand Total: $${total.toLocaleString()}`);
        }
        return parts.join("\n");
    }

    return `I'm not sure how to help with that. Try:\n- "Add a 20x10 display at 4mm"\n- "What's the total?"\n- "Set margin to 25%"\n- "Explain costs"`;
}
