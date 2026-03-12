"use client";

/**
 * QuestionFlow — Typeform-style one-question-at-a-time questionnaire.
 *
 * Features:
 * - Smooth vertical transitions between questions
 * - Progress bar at top
 * - Keyboard navigation (Enter to advance, Shift+Enter to go back)
 * - Display loop: "Add another display?" creates repeating sections
 * - Live callback on every answer change for real-time preview
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, Plus, Check, ArrowRight, Package, Loader2, Building2, Monitor, DollarSign, Sparkles, Ruler, ArrowUpDown, Wand2, PenLine, Zap, Trophy, Music, Landmark, Brain, MapPin, Eye, ChevronRight, RotateCcw, Tv, Radio, School, Send, MessageSquare, RefreshCw } from "lucide-react";
import {
    PROJECT_QUESTIONS,
    DISPLAY_QUESTIONS,
    FINANCIAL_QUESTIONS,
    DISPLAY_TYPE_PRESETS,
    type Question,
    type EstimatorAnswers,
    type DisplayAnswers,
    getDefaultAnswers,
    getDefaultDisplayAnswers,
} from "./questions";
import { calculateCabinetLayout, type ProductSpec } from "./EstimatorBridge";
import { feetToFeetInches, formatDeltaInches, mmToFeet } from "@/lib/imperialFormat";
import ProductCatalogBrowser from "./ProductCatalogBrowser";

interface QuestionFlowProps {
    answers: EstimatorAnswers;
    onChange: (answers: EstimatorAnswers) => void;
    onComplete?: () => void;
    productSpecs?: Record<string, ProductSpec>;
}

export default function QuestionFlow({ answers, onChange, onComplete, productSpecs }: QuestionFlowProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [phase, setPhase] = useState<"project" | "display" | "financial" | "complete">("project");
    const [displayIndex, setDisplayIndex] = useState(0);
    const [aiMode, setAiMode] = useState(false);
    const [manualChosen, setManualChosen] = useState(true); // Manual-first: structured checklist is the default
    const [aiDescription, setAiDescription] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState("");
    // Streaming reasoning state
    const [aiPhase, setAiPhase] = useState<"input" | "reasoning" | "preview">("input");
    const [reasoningText, setReasoningText] = useState("");
    const [extractedData, setExtractedData] = useState<{ answers: Record<string, any>; displays: any[] } | null>(null);
    const [isFallback, setIsFallback] = useState(false);
    // Thread tracking
    const [threadSlug, setThreadSlug] = useState<string | null>(null);
    // Chat state for follow-up refinement
    const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const reasoningEndRef = useRef<HTMLDivElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll reasoning panel as text streams in
    useEffect(() => {
        if (aiPhase === "reasoning" && reasoningEndRef.current) {
            reasoningEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
    }, [reasoningText, aiPhase]);

    // AI Streaming Estimate — primary model with automatic fallback
    const handleAiReasonEstimate = useCallback(async () => {
        if (!aiDescription.trim() || aiDescription.trim().length < 10) {
            setAiError("Please describe the project in at least 10 characters.");
            return;
        }
        setAiLoading(true);
        setAiError("");
        setReasoningText("");
        setExtractedData(null);
        setIsFallback(false);
        setChatMessages([]);
        setChatOpen(false);
        setAiPhase("reasoning");

        // Build a session name from the first ~60 chars of description
        const sessionName = `Estimator: ${aiDescription.trim().slice(0, 60)}${aiDescription.trim().length > 60 ? "..." : ""}`;

        try {
            const res = await fetch("/api/estimator/ai-reason", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    description: aiDescription.trim(),
                    threadSlug: threadSlug || undefined,
                    sessionName,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "AI reasoning failed");
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("No stream body");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: ")) continue;

                    try {
                        const chunk = JSON.parse(trimmed.slice(6));

                        if (chunk.type === "thread") {
                            setThreadSlug(chunk.threadSlug);
                        } else if (chunk.type === "fallback") {
                            setIsFallback(true);
                        } else if (chunk.type === "reasoning") {
                            setReasoningText((prev) => prev + chunk.text);
                        } else if (chunk.type === "extraction") {
                            setExtractedData({ answers: chunk.answers, displays: chunk.displays });
                            setAiPhase("preview");
                        } else if (chunk.type === "error") {
                            throw new Error(chunk.message);
                        } else if (chunk.type === "done") {
                            // Stream complete
                        }
                    } catch (parseErr) {
                        // Skip malformed chunks
                        if (parseErr instanceof Error && parseErr.message !== "done") {
                            throw parseErr;
                        }
                    }
                }
            }
        } catch (err) {
            setAiError(err instanceof Error ? err.message : "AI reasoning failed");
            setAiPhase("input");
        } finally {
            setAiLoading(false);
        }
    }, [aiDescription, threadSlug]);

    // Apply extracted data to form
    const applyExtraction = useCallback(() => {
        if (!extractedData) return;
        const next = { ...answers };
        const a = extractedData.answers;
        if (a.clientName) next.clientName = a.clientName;
        if (a.projectName) next.projectName = a.projectName;
        if (a.location) next.location = a.location;
        if (a.docType) next.docType = a.docType;
        if (a.currency) next.currency = a.currency;
        if (typeof a.isIndoor === "boolean") next.isIndoor = a.isIndoor;
        if (typeof a.isNewInstall === "boolean") {
            next.isNewInstall = a.isNewInstall;
            // Supply-only: when AI detects no installation, zero services margin
            // so the workbook generator skips all non-LED costs
            if (!a.isNewInstall) {
                next.servicesMargin = 0;
            }
        }
        if (typeof a.isUnion === "boolean") next.isUnion = a.isUnion;
        if (Array.isArray(extractedData.displays) && extractedData.displays.length > 0) {
            next.displays = extractedData.displays.map((d: any) => ({
                ...getDefaultDisplayAnswers(),
                displayName: d.displayName || "",
                displayType: d.displayType || "custom",
                locationType: d.locationType || "wall",
                widthFt: d.widthFt || 0,
                heightFt: d.heightFt || 0,
                pixelPitch: String(d.pixelPitch || "4"),
                installComplexity: d.installComplexity || "standard",
                serviceType: d.serviceType || "Front/Rear",
                isReplacement: Boolean(d.isReplacement),
            }));
        }
        onChange(next);
        setAiMode(false);
        setAiPhase("input");
        setPhase("financial");
        setCurrentStep(0);
    }, [extractedData, answers, onChange]);

    // Auto-scroll chat as messages stream in
    useEffect(() => {
        if (chatOpen && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
    }, [chatMessages, chatOpen]);

    // Follow-up chat within the thread
    const handleChatSend = useCallback(async () => {
        if (!chatInput.trim() || !threadSlug || chatLoading) return;

        const userMsg = chatInput.trim();
        setChatInput("");
        setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
        setChatLoading(true);

        try {
            const res = await fetch("/api/estimator/ai-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMsg, threadSlug }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Chat failed");
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("No stream body");

            const decoder = new TextDecoder();
            let buffer = "";
            let assistantText = "";

            // Add empty assistant message that we'll stream into
            setChatMessages((prev) => [...prev, { role: "assistant", text: "" }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: ")) continue;

                    try {
                        const chunk = JSON.parse(trimmed.slice(6));

                        if (chunk.type === "text") {
                            assistantText += chunk.text;
                            setChatMessages((prev) => {
                                const updated = [...prev];
                                updated[updated.length - 1] = { role: "assistant", text: assistantText };
                                return updated;
                            });
                        } else if (chunk.type === "extraction") {
                            // AI sent an updated spec — update extractedData
                            setExtractedData({ answers: chunk.answers, displays: chunk.displays });
                        } else if (chunk.type === "error") {
                            throw new Error(chunk.message);
                        }
                    } catch (parseErr) {
                        if (parseErr instanceof Error && parseErr.message !== "done") {
                            throw parseErr;
                        }
                    }
                }
            }
        } catch (err) {
            setChatMessages((prev) => [
                ...prev.filter((m) => m.text !== ""),
                { role: "assistant", text: `Error: ${err instanceof Error ? err.message : "Chat failed"}` },
            ]);
        } finally {
            setChatLoading(false);
        }
    }, [chatInput, threadSlug, chatLoading]);

    // Build the flat question list for current state
    const questions = getQuestionList(phase, displayIndex);
    const currentQ = questions[currentStep];

    const totalSteps = PROJECT_QUESTIONS.length
        + (DISPLAY_QUESTIONS.length * Math.max(answers.displays.length, 1))
        + FINANCIAL_QUESTIONS.length;
    const globalStep = phase === "project"
        ? currentStep
        : phase === "display"
            ? PROJECT_QUESTIONS.length + (displayIndex * DISPLAY_QUESTIONS.length) + currentStep
            : PROJECT_QUESTIONS.length + (answers.displays.length * DISPLAY_QUESTIONS.length) + currentStep;
    const progress = Math.min((globalStep / totalSteps) * 100, 100);
    const activeDisplay = answers.displays[displayIndex];
    const questionInputKey = phase === "display"
        ? [
            phase,
            displayIndex,
            currentQ?.id,
            activeDisplay?.pixelPitch || "",
            activeDisplay?.productId || "",
            activeDisplay?.widthFt || 0,
            activeDisplay?.heightFt || 0,
        ].join(":")
        : `${phase}:${currentQ?.id ?? ""}:${currentStep}`;

    // Get current answer value
    const getValue = useCallback(() => {
        if (!currentQ) return "";
        if (phase === "project" || phase === "financial") {
            return (answers as any)[currentQ.id] ?? currentQ.defaultValue ?? "";
        }
        if (phase === "display") {
            const d = answers.displays[displayIndex];
            if (!d) return currentQ.defaultValue ?? "";
            if (currentQ.id === "dimensions") {
                return { widthFt: d.widthFt, heightFt: d.heightFt };
            }
            return (d as any)[currentQ.id] ?? currentQ.defaultValue ?? "";
        }
        return "";
    }, [currentQ, phase, answers, displayIndex]);

    // Set answer value
    const setValue = useCallback((val: any) => {
        const next = { ...answers };
        if (phase === "project" || phase === "financial") {
            (next as any)[currentQ.id] = val;
        } else if (phase === "display") {
            // Ensure display exists
            while (next.displays.length <= displayIndex) {
                next.displays.push(getDefaultDisplayAnswers());
            }
            const d = { ...next.displays[displayIndex] };
            if (currentQ.id === "dimensions") {
                d.widthFt = val.widthFt;
                d.heightFt = val.heightFt;
            } else {
                (d as any)[currentQ.id] = val;
            }
            next.displays[displayIndex] = d;
        }
        onChange(next);
    }, [answers, phase, currentQ, displayIndex, onChange]);

    // Set multiple display fields at once (used by display-type presets)
    const setDisplayFields = useCallback((fields: Partial<DisplayAnswers>) => {
        const next = { ...answers };
        while (next.displays.length <= displayIndex) {
            next.displays.push(getDefaultDisplayAnswers());
        }
        next.displays[displayIndex] = { ...next.displays[displayIndex], ...fields };
        onChange(next);
    }, [answers, displayIndex, onChange]);

    // Navigation
    const goNext = useCallback(() => {
        // Check if current question should be skipped forward
        if (currentStep < questions.length - 1) {
            // Special: display-loop question
            if (currentQ?.type === "display-loop") {
                return; // Handled by addDisplay / finishDisplays buttons
            }
            setCurrentStep((s) => s + 1);
        } else {
            // End of phase
            if (phase === "project") {
                // Ensure at least one display
                if (answers.displays.length === 0) {
                    const next = { ...answers, displays: [getDefaultDisplayAnswers()] };
                    onChange(next);
                }
                setPhase("display");
                setDisplayIndex(0);
                setCurrentStep(0);
            } else if (phase === "display") {
                // If more displays exist, advance to the next one
                if (displayIndex < answers.displays.length - 1) {
                    setDisplayIndex((i) => i + 1);
                    setCurrentStep(0);
                } else {
                    // Last display done — go to financial
                    setPhase("financial");
                    setCurrentStep(0);
                }
            } else if (phase === "financial") {
                setPhase("complete");
                onComplete?.();
            }
        }
    }, [currentStep, questions.length, phase, currentQ, answers, onChange, onComplete]);

    const goBack = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep((s) => s - 1);
        } else if (phase === "financial") {
            setPhase("display");
            setDisplayIndex(Math.max(answers.displays.length - 1, 0));
            setCurrentStep(DISPLAY_QUESTIONS.length - 1);
        } else if (phase === "display" && displayIndex > 0) {
            setDisplayIndex((i) => i - 1);
            setCurrentStep(DISPLAY_QUESTIONS.length - 1);
        } else if (phase === "display" && displayIndex === 0) {
            setPhase("project");
            setCurrentStep(PROJECT_QUESTIONS.length - 1);
        }
    }, [currentStep, phase, displayIndex, answers.displays.length]);

    const addDisplay = useCallback(() => {
        const next = { ...answers };
        next.displays = [...next.displays, getDefaultDisplayAnswers()];
        onChange(next);
        setDisplayIndex(next.displays.length - 1);
        setCurrentStep(0);
    }, [answers, onChange]);

    const finishDisplays = useCallback(() => {
        if (displayIndex < answers.displays.length - 1) {
            setDisplayIndex((i) => i + 1);
            setCurrentStep(0);
            return;
        }
        setPhase("financial");
        setCurrentStep(0);
    }, [answers.displays.length, displayIndex]);

    const skipToFinalPage = useCallback(() => {
        setPhase("complete");
        onComplete?.();
    }, [onComplete]);

    const skipToFirstDisplay = useCallback(() => {
        if (answers.displays.length === 0) {
            onChange({ ...answers, displays: [getDefaultDisplayAnswers()] });
        }
        setPhase("display");
        setDisplayIndex(0);
        setCurrentStep(0);
    }, [answers, onChange]);

    const jumpToPhase = useCallback((target: "project" | "display" | "financial") => {
        setPhase(target);
        setCurrentStep(0);
        if (target === "display") setDisplayIndex(0);
    }, []);

    const jumpToDisplay = useCallback((idx: number) => {
        setPhase("display");
        setDisplayIndex(idx);
        setCurrentStep(0);
    }, []);

    // Skip questions with showIf that returns false
    useEffect(() => {
        if (!currentQ) return;
        if (currentQ.showIf) {
            const displayAnswers = answers.displays[displayIndex] || getDefaultDisplayAnswers();
            if (!currentQ.showIf(displayAnswers as any, displayIndex)) {
                // Skip this question
                if (currentStep < questions.length - 1) {
                    setCurrentStep((s) => s + 1);
                }
            }
        }
    }, [currentStep, currentQ, answers, displayIndex, questions.length]);

    // Keyboard nav
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                goNext();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [goNext]);

    if (phase === "complete") {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">Estimate Complete</h2>
                <p className="text-muted-foreground text-sm mb-6 max-w-md">
                    Your cost analysis is ready. Review the Excel preview on the right,
                    then export the workbook.
                </p>
                <div className="flex flex-col gap-3 items-center">
                    <div className="flex flex-wrap gap-2 justify-center">
                        <button
                            onClick={() => jumpToPhase("project")}
                            className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
                        >
                            Edit Project
                        </button>
                        {answers.displays.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => jumpToDisplay(i)}
                                className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
                            >
                                Display {i + 1}
                            </button>
                        ))}
                        <button
                            onClick={() => jumpToPhase("financial")}
                            className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
                        >
                            Edit Financials
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!currentQ) return null;

    return (
        <div ref={containerRef} className="h-full flex flex-col">
            {/* Quick-test scenarios — one-click to fill a full project for fast testing */}
            {phase === "project" && currentStep === 0 && !aiMode && (
                <div className="shrink-0 px-4 pt-3 pb-1">
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap mr-1">Quick Test:</span>
                        {QUICK_START_SCENARIOS.map((scenario) => (
                            <button
                                key={scenario.label}
                                onClick={() => { setAiDescription(scenario.prompt); setAiMode(true); }}
                                className="px-2 py-1 rounded-md border border-border text-[10px] text-muted-foreground hover:text-foreground hover:border-[#0A52EF]/40 hover:bg-[#0A52EF]/5 transition-colors whitespace-nowrap shrink-0"
                            >
                                {scenario.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Stage indicator */}
            {!(phase === "project" && currentStep === 0 && !aiMode && !manualChosen) && (
                <div className="shrink-0 px-6 pt-4 pb-2">
                    <StageIndicator
                        phase={phase}
                        displayIndex={displayIndex}
                        displayCount={Math.max(answers.displays.length, 1)}
                        progress={progress}
                        onJumpToPhase={jumpToPhase}
                        onJumpToDisplay={jumpToDisplay}
                    />
                </div>
            )}

            {/* Question area */}
            <div className="flex-1 flex flex-col items-center justify-start px-8 py-12 overflow-y-auto">
                {/* ===== LANDING SCREEN — shown on first visit (project step 0, not in AI mode, not manual) ===== */}
                {phase === "project" && currentStep === 0 && !aiMode && !manualChosen ? (
                    <LandingScreen
                        onChooseAi={() => setAiMode(true)}
                        onChooseManual={() => setManualChosen(true)}
                        onQuickStart={(desc) => { setAiDescription(desc); setAiMode(true); }}
                    />
                ) : aiMode ? (
                    /* ===== AI MODE — three phases: input → reasoning → preview ===== */
                    <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Phase indicator */}
                        <div className="flex items-center gap-2 mb-5">
                            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold", aiPhase === "input" ? "bg-[#0A52EF] text-white" : "bg-[#0A52EF]/10 text-[#0A52EF]")}>
                                <Wand2 className="w-3 h-3" /> Describe
                            </div>
                            <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold", aiPhase === "reasoning" ? (isFallback ? "bg-amber-500 text-white" : "bg-[#0A52EF] text-white") : aiPhase === "preview" ? (isFallback ? "bg-amber-100 text-amber-700" : "bg-[#0A52EF]/10 text-[#0A52EF]") : "text-muted-foreground/40")}>
                                <Brain className="w-3 h-3" /> {isFallback ? "Extracting" : "Reasoning"}
                            </div>
                            <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold", aiPhase === "preview" ? "bg-[#0A52EF] text-white" : "text-muted-foreground/40")}>
                                <Eye className="w-3 h-3" /> Review
                            </div>
                        </div>

                        {/* ── INPUT PHASE ── */}
                        {aiPhase === "input" && (
                            <>
                                <h2 className="text-2xl font-semibold text-foreground mb-1 leading-tight">
                                    Describe your project
                                </h2>
                                <p className="text-sm text-muted-foreground mb-6">
                                    Tell us about the venue, displays, and requirements. AI will reason through the details and show you exactly what it finds.
                                </p>
                                <textarea
                                    value={aiDescription}
                                    onChange={(e) => setAiDescription(e.target.value)}
                                    placeholder="e.g., Indiana Fever at Gainbridge Fieldhouse needs a new 20x12 main scoreboard at 4mm, two 100x3 ribbon boards at 6mm around the concourse, and a 30x6 marquee at 10mm for the entrance. Indoor, new install, union labor required."
                                    rows={5}
                                    autoFocus
                                    disabled={aiLoading}
                                    className="w-full bg-transparent border-2 border-border focus:border-[#0A52EF] rounded-lg outline-none text-sm py-3 px-4 transition-colors placeholder:text-muted-foreground/40 resize-none disabled:opacity-50"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            handleAiReasonEstimate();
                                        }
                                    }}
                                />
                                {aiError && (
                                    <p className="text-xs text-destructive mt-2">{aiError}</p>
                                )}
                                <div className="mt-4 flex items-center gap-3">
                                    <button
                                        onClick={handleAiReasonEstimate}
                                        disabled={aiLoading || aiDescription.trim().length < 10}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-[#0A52EF] text-white hover:bg-[#0A52EF]/90 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Analyze with AI
                                    </button>
                                    <button
                                        onClick={() => { setAiMode(false); setAiError(""); setAiPhase("input"); setIsFallback(false); }}
                                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Back
                                    </button>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-3">
                                    <kbd className="px-1 py-0.5 bg-accent rounded text-[10px]">Ctrl+Enter</kbd> to submit
                                </p>
                            </>
                        )}

                        {/* ── REASONING PHASE ── */}
                        {aiPhase === "reasoning" && (
                            <>
                                <div className="flex items-center gap-2 mb-3">
                                    <Brain className={cn("w-4 h-4 animate-pulse", isFallback ? "text-amber-500" : "text-[#0A52EF]")} />
                                    <h2 className="text-lg font-semibold text-foreground">
                                        Analyzing your project...
                                    </h2>
                                    {isFallback && (
                                        <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                            FALLBACK MODE
                                        </span>
                                    )}
                                </div>

                                {/* User's description — collapsed */}
                                <div className="mb-4 px-3 py-2 rounded-lg bg-accent/50 border border-border">
                                    <p className="text-xs text-muted-foreground line-clamp-2">{aiDescription}</p>
                                </div>

                                {isFallback && (
                                    <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                                        Primary reasoning model unavailable — using backup extraction. Results are accurate but without detailed reasoning.
                                    </div>
                                )}

                                {/* Streaming reasoning text */}
                                <div className={cn("rounded-lg p-4 max-h-[50vh] overflow-y-auto border", isFallback ? "border-amber-200 bg-amber-50/30" : "border-[#0A52EF]/20 bg-[#0A52EF]/[0.02]")}>
                                    <div className={cn("text-[10px] font-semibold uppercase tracking-widest mb-3 flex items-center gap-1.5", isFallback ? "text-amber-500/60" : "text-[#0A52EF]/60")}>
                                        <Brain className="w-3 h-3" />
                                        {isFallback ? "Extraction Progress" : "AI Reasoning"}
                                    </div>
                                    {reasoningText ? (
                                        <div className="prose prose-sm max-w-none text-foreground/80 [&>p]:my-1 [&>ul]:my-1.5 [&>ol]:my-1.5 [&>li]:my-0.5 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:mt-3 [&>h1]:mb-1 [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mt-3 [&>h2]:mb-1 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:mt-2 [&>h3]:mb-1 [&_strong]:text-foreground [&_strong]:font-semibold [&>ul]:pl-4 [&>ol]:pl-4 [&>ul]:list-disc [&>ol]:list-decimal [&_li]:text-xs [&_p]:text-xs [&_code]:text-[10px] [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
                                            <ReactMarkdown>{reasoningText}</ReactMarkdown>
                                            {aiLoading && (
                                                <span className={cn("inline-block w-2 h-4 ml-0.5 animate-pulse rounded-sm", isFallback ? "bg-amber-500" : "bg-[#0A52EF]")} />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-muted-foreground italic">
                                            {isFallback ? "Processing..." : "Thinking..."}
                                            {aiLoading && (
                                                <span className={cn("inline-block w-2 h-4 ml-0.5 animate-pulse rounded-sm", isFallback ? "bg-amber-500" : "bg-[#0A52EF]")} />
                                            )}
                                        </div>
                                    )}
                                    <div ref={reasoningEndRef} />
                                </div>

                                {aiError && (
                                    <div className="mt-3">
                                        <p className="text-xs text-destructive">{aiError}</p>
                                        <button
                                            onClick={() => { setAiError(""); setAiPhase("input"); }}
                                            className="mt-2 text-xs text-[#0A52EF] hover:underline"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ── PREVIEW PHASE — extraction summary + apply ── */}
                        {aiPhase === "preview" && extractedData && (
                            <>
                                <div className="flex items-center gap-2 mb-1">
                                    <Check className="w-4 h-4 text-emerald-600" />
                                    <h2 className="text-lg font-semibold text-foreground">
                                        Here&apos;s what AI found
                                    </h2>
                                </div>
                                <p className="text-xs text-muted-foreground mb-4">
                                    Review the extraction below, then click Apply to fill the estimator form.
                                </p>

                                {/* Collapsible reasoning — real AI analysis */}
                                {reasoningText && (
                                    <details className="mb-4 group" open>
                                        <summary className="text-[11px] font-semibold uppercase tracking-widest text-[#0A52EF] cursor-pointer hover:text-[#0A52EF]/80 flex items-center gap-1.5 py-1">
                                            <Brain className="w-3.5 h-3.5" />
                                            AI Reasoning
                                            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                                        </summary>
                                        <div className="mt-2 rounded-lg border border-[#0A52EF]/20 bg-[#0A52EF]/[0.02] p-4 max-h-[50vh] overflow-y-auto">
                                            <div className="prose prose-sm max-w-none text-foreground/70 [&>p]:my-1 [&>ul]:my-1.5 [&>ol]:my-1.5 [&>li]:my-0.5 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:mt-3 [&>h1]:mb-1 [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mt-3 [&>h2]:mb-1 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:mt-2 [&>h3]:mb-1 [&_strong]:text-foreground/90 [&_strong]:font-semibold [&>ul]:pl-4 [&>ol]:pl-4 [&>ul]:list-disc [&>ol]:list-decimal [&_li]:text-xs [&_p]:text-xs [&_code]:text-[10px] [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
                                                <ReactMarkdown>{reasoningText}</ReactMarkdown>
                                            </div>
                                        </div>
                                    </details>
                                )}

                                {/* Project info */}
                                <div className="rounded-lg border border-border bg-white p-4 mb-3 space-y-2">
                                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                                        Project Details
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                                        {extractedData.answers.clientName && (
                                            <div>
                                                <span className="text-muted-foreground">Client:</span>{" "}
                                                <span className="font-medium">{extractedData.answers.clientName}</span>
                                            </div>
                                        )}
                                        {extractedData.answers.projectName && (
                                            <div>
                                                <span className="text-muted-foreground">Project:</span>{" "}
                                                <span className="font-medium">{extractedData.answers.projectName}</span>
                                            </div>
                                        )}
                                        {extractedData.answers.location && (
                                            <div>
                                                <span className="text-muted-foreground">Location:</span>{" "}
                                                <span className="font-medium">{extractedData.answers.location}</span>
                                            </div>
                                        )}
                                        {typeof extractedData.answers.isIndoor === "boolean" && (
                                            <div>
                                                <span className="text-muted-foreground">Environment:</span>{" "}
                                                <span className="font-medium">{extractedData.answers.isIndoor ? "Indoor" : "Outdoor"}</span>
                                            </div>
                                        )}
                                        {typeof extractedData.answers.isNewInstall === "boolean" && (
                                            <div>
                                                <span className="text-muted-foreground">Install:</span>{" "}
                                                <span className="font-medium">{extractedData.answers.isNewInstall ? "New" : "Replacement"}</span>
                                            </div>
                                        )}
                                        {typeof extractedData.answers.isUnion === "boolean" && (
                                            <div>
                                                <span className="text-muted-foreground">Labor:</span>{" "}
                                                <span className="font-medium">{extractedData.answers.isUnion ? "Union" : "Non-union"}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Displays */}
                                {extractedData.displays.length > 0 && (
                                    <div className="rounded-lg border border-border bg-white p-4 mb-4 space-y-2">
                                        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                                            {extractedData.displays.length} Display{extractedData.displays.length > 1 ? "s" : ""} Detected
                                        </div>
                                        <div className="space-y-2">
                                            {extractedData.displays.map((d: any, i: number) => (
                                                <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-md bg-accent/40">
                                                    <div className="w-6 h-6 rounded-full bg-[#0A52EF]/10 flex items-center justify-center shrink-0 mt-0.5">
                                                        <Monitor className="w-3 h-3 text-[#0A52EF]" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-semibold text-foreground">{d.displayName}</div>
                                                        <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                                            <span>{d.widthFt}×{d.heightFt} ft</span>
                                                            <span>{d.pixelPitch}mm</span>
                                                            <span>{(d.displayType || "custom").replace(/_|-/g, " ")}</span>
                                                            <span>{d.installComplexity}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                                                        {(d.widthFt * d.heightFt).toFixed(0)} sqft
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={applyExtraction}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-[#0A52EF] text-white hover:bg-[#0A52EF]/90 rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-[#0A52EF]/20"
                                    >
                                        <Check className="w-4 h-4" />
                                        Apply to Estimate
                                    </button>
                                    <button
                                        onClick={() => setChatOpen((o) => !o)}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border",
                                            chatOpen
                                                ? "border-[#0A52EF] bg-[#0A52EF]/5 text-[#0A52EF]"
                                                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                                        )}
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        Refine
                                    </button>
                                    <button
                                        onClick={() => { setAiPhase("input"); setReasoningText(""); setExtractedData(null); setIsFallback(false); setThreadSlug(null); setChatMessages([]); setChatOpen(false); }}
                                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        Start over
                                    </button>
                                </div>

                                {/* Thread badge */}
                                {threadSlug && (
                                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        Thread: {threadSlug.slice(0, 20)}{threadSlug.length > 20 ? "..." : ""}
                                    </div>
                                )}

                                {/* Follow-up chat panel */}
                                {chatOpen && threadSlug && (
                                    <div className="mt-4 rounded-lg border border-border bg-white overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                                        <div className="px-3 py-2 border-b border-border bg-accent/30 flex items-center gap-2">
                                            <MessageSquare className="w-3.5 h-3.5 text-[#0A52EF]" />
                                            <span className="text-[11px] font-semibold text-foreground">Refine your estimate</span>
                                            <span className="text-[10px] text-muted-foreground ml-auto">Ask to add, remove, or change displays</span>
                                        </div>

                                        {/* Messages */}
                                        <div className="max-h-[35vh] overflow-y-auto p-3 space-y-2.5">
                                            {chatMessages.length === 0 && (
                                                <div className="text-xs text-muted-foreground text-center py-4">
                                                    Ask follow-up questions or request changes.
                                                    <br />
                                                    <span className="text-[10px]">e.g., &ldquo;Add a 40x4ft fascia board at 4mm&rdquo; or &ldquo;Change the scoreboard to 6mm pitch&rdquo;</span>
                                                </div>
                                            )}
                                            {chatMessages.map((msg, i) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "flex",
                                                        msg.role === "user" ? "justify-end" : "justify-start"
                                                    )}
                                                >
                                                    <div
                                                        className={cn(
                                                            "max-w-[85%] rounded-lg px-3 py-2 text-xs",
                                                            msg.role === "user"
                                                                ? "bg-[#0A52EF] text-white"
                                                                : "bg-accent text-foreground"
                                                        )}
                                                    >
                                                        {msg.role === "assistant" ? (
                                                            <div className="prose prose-sm max-w-none [&_p]:my-0.5 [&_p]:text-xs [&_li]:text-xs [&_code]:text-[10px] [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded">
                                                                <ReactMarkdown>{msg.text || "..."}</ReactMarkdown>
                                                            </div>
                                                        ) : (
                                                            msg.text
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                                                <div className="flex justify-start">
                                                    <div className="bg-accent rounded-lg px-3 py-2">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                                                    </div>
                                                </div>
                                            )}
                                            <div ref={chatEndRef} />
                                        </div>

                                        {/* Input */}
                                        <div className="border-t border-border p-2 flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={chatInput}
                                                onChange={(e) => setChatInput(e.target.value)}
                                                placeholder="Ask a follow-up or request changes..."
                                                disabled={chatLoading}
                                                className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/50 disabled:opacity-50 px-2 py-1.5"
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" && !e.shiftKey) {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleChatSend();
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={handleChatSend}
                                                disabled={chatLoading || !chatInput.trim()}
                                                className="p-1.5 rounded-md bg-[#0A52EF] text-white hover:bg-[#0A52EF]/90 disabled:opacity-30 transition-colors"
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                /* ===== STRUCTURED QUESTION FLOW ===== */
                <div className="w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300" key={`${phase}-${displayIndex}-${currentStep}`}>
                    {/* Section context + Back */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#0A52EF]/70">
                                {phase === "project" ? "Project Info" : phase === "display" ? `Display ${displayIndex + 1} — ${getSectionLabel(currentQ?.id)}` : phase === "financial" ? `Financial — ${getFinancialSection(currentQ?.id)}` : "Review"}
                            </span>
                        </div>
                        <button
                            onClick={goBack}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <ChevronUp className="w-3.5 h-3.5" />
                            Back
                        </button>
                    </div>

                    {/* AI pre-fill option — small, secondary, only on first project question */}
                    {phase === "project" && currentStep === 0 && !aiMode && (
                        <button
                            onClick={() => setAiMode(true)}
                            className="mb-4 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-[#0A52EF] transition-colors"
                        >
                            <Wand2 className="w-3 h-3" />
                            Pre-fill from project description
                        </button>
                    )}

                    {/* Question label */}
                    <h2 className="text-xl font-semibold text-foreground mb-1 leading-tight">
                        {currentQ.label}
                    </h2>
                    {currentQ.subtitle && (
                        <p className="text-xs text-muted-foreground mb-5">{currentQ.subtitle}</p>
                    )}

                    {/* Input */}
                    <QuestionInput
                        key={questionInputKey}
                        question={currentQ}
                        value={getValue()}
                        onChange={setValue}
                        onNext={goNext}
                        onSkipToEnd={skipToFinalPage}
                        setDisplayFields={setDisplayFields}
                        answers={answers}
                        displayIndex={displayIndex}
                        productSpecs={productSpecs}
                        phase={phase}
                    />

                    {/* Display loop buttons */}
                    {currentQ.type === "display-loop" && (
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={addDisplay}
                                className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent/80 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Display
                            </button>
                            <button
                                onClick={finishDisplays}
                                className="flex items-center gap-2 px-5 py-2.5 bg-[#0A52EF] text-white hover:bg-[#0A52EF]/90 rounded-lg text-sm font-medium transition-colors"
                            >
                                Continue
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Next button (for non-loop questions) */}
                    {currentQ.type !== "display-loop" && (
                        <div className="mt-6 flex items-center gap-3">
                            <button
                                onClick={goNext}
                                className="flex items-center gap-2 px-5 py-2.5 bg-[#0A52EF] text-white hover:bg-[#0A52EF]/90 rounded-lg text-sm font-medium transition-colors"
                            >
                                OK
                                <Check className="w-4 h-4" />
                            </button>
                            <span className="text-[10px] text-muted-foreground">
                                press <kbd className="px-1 py-0.5 bg-accent rounded text-[10px]">Enter ↵</kbd>
                            </span>
                            {phase === "project" && (
                                <button
                                    onClick={skipToFirstDisplay}
                                    className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                    Skip to Display 1
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {(phase === "display" || phase === "financial") && (
                                <button
                                    onClick={skipToFinalPage}
                                    className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                    Skip to Final Page
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
                )}
            </div>

            {/* Bottom nav */}
            {!aiMode && (
                <div className="shrink-0 px-6 py-3 border-t border-border flex items-center justify-between">
                    <button
                        onClick={goBack}
                        disabled={phase === "project" && currentStep === 0}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                        <ChevronUp className="w-3.5 h-3.5" />
                        Back
                    </button>
                    <button
                        onClick={goNext}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Skip
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// SECTION LABEL HELPERS — Maps question IDs to human-readable section names
// ============================================================================

function getSectionLabel(questionId: string | undefined): string {
    if (!questionId) return "Setup";
    const SECTION_MAP: Record<string, string> = {
        displayType: "Basics", displayName: "Basics", locationType: "Basics",
        dimensions: "Specs", pixelPitch: "Specs", altPitches: "Specs", productId: "Specs",
        installComplexity: "Structure", serviceType: "Structure", isReplacement: "Structure",
        useExistingStructure: "Structure", steelScope: "Structure", liftType: "Structure",
        powerDistance: "Electrical & Data", dataRunDistance: "Electrical & Data",
        includeSpareParts: "Options", addAnother: "Options",
    };
    return SECTION_MAP[questionId] || "Setup";
}

function getFinancialSection(questionId: string | undefined): string {
    if (!questionId) return "Settings";
    const SECTION_MAP: Record<string, string> = {
        bondRate: "Rates", salesTaxRate: "Rates", costPerSqFtOverride: "Rates",
        pmComplexity: "Project Settings", targetPrice: "Project Settings",
        includeCms: "Add-ons", cmsAllocation: "Add-ons",
        includeScoring: "Add-ons", scoringAllocation: "Add-ons",
        includeWarranty: "Add-ons", warrantyYears: "Add-ons", warrantyAllocation: "Add-ons",
    };
    return SECTION_MAP[questionId] || "Settings";
}

// ============================================================================
// LANDING SCREEN — Secondary option (user must explicitly go back to see it)
// ============================================================================

const QUICK_START_SCENARIOS = [
    {
        icon: Trophy,
        label: "NBA Arena Package",
        description: "Main scoreboard + ribbons + fascia",
        prompt: "NBA arena needs a 20x12ft center-hung main scoreboard at 4mm, two 120x3ft ribbon boards at 6mm around the upper bowl, and two 40x4ft fascia boards at 4mm on the suite level. Indoor, new install, non-union.",
    },
    {
        icon: Trophy,
        label: "NFL Stadium",
        description: "End zone boards + ribbon + marquee",
        prompt: "NFL stadium needs two 50x30ft end zone video boards at 10mm, a 1200x3ft continuous ribbon board at 10mm around the upper deck, and a 40x8ft outdoor marquee at 16mm at the main entrance. Outdoor, new install, union labor.",
    },
    {
        icon: Music,
        label: "Concert Venue",
        description: "Stage backdrop + side screens",
        prompt: "Concert venue needs a 30x18ft main stage backdrop display at 3.9mm and two 12x20ft side IMAG screens at 3.9mm. Indoor, new install, union labor required.",
    },
    {
        icon: School,
        label: "College Stadium",
        description: "Scoreboard + end zone + ribbon",
        prompt: "College stadium needs a 25x15ft main scoreboard at 6mm, two 30x10ft end zone video boards at 10mm, and a 400x3ft ribbon board at 10mm around the upper bowl. Outdoor, new install, non-union.",
    },
    {
        icon: Landmark,
        label: "Corporate Lobby",
        description: "Fine-pitch indoor display",
        prompt: "Corporate headquarters lobby needs a 12x7ft fine-pitch LED video wall at 1.5mm, wall-mounted. Indoor, new install, non-union.",
    },
    {
        icon: Trophy,
        label: "MLS Stadium",
        description: "Main board + ribbon + concourse",
        prompt: "MLS soccer stadium needs a 40x20ft main scoreboard at 6mm, a 600x3ft ribbon board at 10mm around the perimeter, and four 8x5ft concourse displays at 2.5mm. Outdoor stadium, new install, non-union.",
    },
    {
        icon: Tv,
        label: "TV Package",
        description: "Commercial TVs for suites + concourse",
        prompt: "Sports venue needs ten 75-inch commercial TVs for luxury suites and six 86-inch TVs for concourse areas. Indoor, new install, non-union.",
    },
    {
        icon: Radio,
        label: "LiveSync CMS",
        description: "Content management system setup",
        prompt: "Venue needs a LiveSync CMS content management system for controlling and scheduling content across all LED displays and TVs. Includes control room setup and network integration. Indoor, new install, non-union.",
    },
] as const;

function LandingScreen({
    onChooseAi,
    onChooseManual,
    onQuickStart,
}: {
    onChooseAi: () => void;
    onChooseManual: () => void;
    onQuickStart: (description: string) => void;
}) {
    return (
        <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero */}
            <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0A52EF]/5 border border-[#0A52EF]/15 mb-4">
                    <Zap className="w-3.5 h-3.5 text-[#0A52EF]" />
                    <span className="text-xs font-semibold text-[#0A52EF]">ANC LED Estimator</span>
                </div>
                <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">
                    How do you want to build this estimate?
                </h1>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Let AI do the heavy lifting, or fill out the form step by step.
                </p>
            </div>

            {/* Two-path choice */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                {/* AI Path — Primary */}
                <button
                    onClick={onChooseAi}
                    className="group relative text-left p-5 rounded-xl border-2 border-[#0A52EF]/30 hover:border-[#0A52EF] bg-gradient-to-br from-[#0A52EF]/[0.03] to-[#0A52EF]/[0.08] hover:from-[#0A52EF]/[0.05] hover:to-[#0A52EF]/[0.12] transition-all duration-200 hover:shadow-lg hover:shadow-[#0A52EF]/10"
                >
                    <div className="absolute top-3 right-3">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-white bg-[#0A52EF] px-2 py-0.5 rounded-full">
                            Recommended
                        </span>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-[#0A52EF]/10 group-hover:bg-[#0A52EF]/20 flex items-center justify-center mb-3 transition-colors">
                        <Wand2 className="w-5 h-5 text-[#0A52EF]" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">AI Quick Estimate</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Describe the project in plain English. AI extracts client info, displays, dimensions, and fills the entire form in seconds.
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#0A52EF] group-hover:gap-2.5 transition-all">
                        <Sparkles className="w-3.5 h-3.5" />
                        Start with AI
                        <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                </button>

                {/* Manual Path — Secondary */}
                <button
                    onClick={onChooseManual}
                    className="group text-left p-5 rounded-xl border-2 border-border hover:border-foreground/20 transition-all duration-200 hover:shadow-md"
                >
                    <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-3 group-hover:bg-accent/80 transition-colors">
                        <PenLine className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Manual Entry</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Walk through each question one at a time. Full control over every field — client, displays, dimensions, financials.
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground group-hover:text-foreground group-hover:gap-2.5 transition-all">
                        <PenLine className="w-3.5 h-3.5" />
                        Fill form manually
                        <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                </button>
            </div>

            {/* Quick-start presets */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Quick Start — Click a scenario
                    </span>
                    <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {QUICK_START_SCENARIOS.map((scenario) => {
                        const Icon = scenario.icon;
                        return (
                            <button
                                key={scenario.label}
                                onClick={() => onQuickStart(scenario.prompt)}
                                className="group text-left px-3 py-2.5 rounded-lg border border-border hover:border-[#0A52EF]/40 hover:bg-[#0A52EF]/[0.03] transition-all duration-150"
                            >
                                <div className="flex items-start gap-2">
                                    <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-[#0A52EF] mt-0.5 shrink-0 transition-colors" />
                                    <div className="min-w-0">
                                        <div className="text-xs font-medium text-foreground truncate">{scenario.label}</div>
                                        <div className="text-[10px] text-muted-foreground leading-snug">{scenario.description}</div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
                <p className="text-center text-[10px] text-muted-foreground mt-3">
                    Clicking a scenario pre-fills the AI description — you can edit before submitting
                </p>
            </div>
        </div>
    );
}

// ============================================================================
// STAGE INDICATOR — Visual phase stepper
// ============================================================================

const STAGES = [
    { key: "project", label: "Project", icon: Building2 },
    { key: "display", label: "Displays", icon: Monitor },
    { key: "financial", label: "Financial", icon: DollarSign },
    { key: "complete", label: "Done", icon: Sparkles },
] as const;

function StageIndicator({
    phase,
    displayIndex,
    displayCount,
    progress,
    onJumpToPhase,
    onJumpToDisplay,
}: {
    phase: string;
    displayIndex: number;
    displayCount: number;
    progress: number;
    onJumpToPhase?: (phase: "project" | "display" | "financial") => void;
    onJumpToDisplay?: (idx: number) => void;
}) {
    const currentIdx = STAGES.findIndex((s) => s.key === phase);

    return (
        <div className="space-y-3">
            {/* Stage pills — clickable for navigation */}
            <div className="flex items-center gap-1">
                {STAGES.map((stage, i) => {
                    const isActive = stage.key === phase;
                    const isDone = i < currentIdx;
                    const Icon = stage.icon;
                    const canJump = isDone && onJumpToPhase && stage.key !== "complete";

                    return (
                        <React.Fragment key={stage.key}>
                            {i > 0 && (
                                <div className={cn(
                                    "flex-1 h-0.5 rounded-full transition-all duration-500",
                                    isDone ? "bg-[#0A52EF]" : isActive ? "bg-[#0A52EF]/30" : "bg-border"
                                )} />
                            )}
                            <div
                                onClick={() => canJump && onJumpToPhase(stage.key as "project" | "display" | "financial")}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all duration-300 whitespace-nowrap",
                                    isActive && "bg-[#0A52EF] text-white shadow-sm shadow-[#0A52EF]/25",
                                    isDone && "bg-[#0A52EF]/10 text-[#0A52EF]",
                                    !isActive && !isDone && "text-muted-foreground/50",
                                    canJump && "cursor-pointer hover:bg-[#0A52EF]/20"
                                )}
                            >
                                {isDone ? (
                                    <Check className="w-3 h-3" />
                                ) : (
                                    <Icon className="w-3 h-3" />
                                )}
                                <span className="hidden sm:inline">{stage.label}</span>
                                {isActive && phase === "display" && (
                                    <span className="text-[9px] opacity-80">
                                        {displayIndex + 1}/{displayCount}
                                    </span>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Display picker — click any display to jump directly */}
            {phase === "display" && displayCount > 1 && onJumpToDisplay && (
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap mr-1">Screens:</span>
                    {Array.from({ length: displayCount }, (_, i) => (
                        <button
                            key={i}
                            onClick={() => onJumpToDisplay(i)}
                            className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors whitespace-nowrap",
                                i === displayIndex
                                    ? "bg-[#0A52EF] text-white"
                                    : i < displayIndex
                                        ? "bg-[#0A52EF]/10 text-[#0A52EF] hover:bg-[#0A52EF]/20"
                                        : "border border-border text-muted-foreground hover:text-foreground hover:border-[#0A52EF]/40"
                            )}
                        >
                            Display {i + 1}
                        </button>
                    ))}
                </div>
            )}

            {/* Thin progress bar */}
            <div className="h-0.5 bg-border rounded-full overflow-hidden">
                <div
                    className="h-full bg-[#0A52EF] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}

// ============================================================================
// QUESTION INPUT RENDERER
// ============================================================================

function QuestionInput({
    question,
    value,
    onChange,
    onNext,
    onSkipToEnd,
    setDisplayFields,
    answers,
    displayIndex,
    productSpecs,
    phase,
}: {
    question: Question;
    value: any;
    onChange: (val: any) => void;
    onNext: () => void;
    onSkipToEnd?: () => void;
    setDisplayFields?: (fields: Partial<DisplayAnswers>) => void;
    answers?: EstimatorAnswers;
    displayIndex?: number;
    productSpecs?: Record<string, ProductSpec>;
    phase?: string;
}) {
    switch (question.type) {
        case "text":
            return (
                <input
                    type="text"
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={question.placeholder}
                    autoFocus
                    className="w-full bg-transparent border-b-2 border-border focus:border-[#0A52EF] outline-none text-lg py-2 transition-colors placeholder:text-muted-foreground/40"
                />
            );

        case "number":
            return (
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            value={value ?? question.defaultValue ?? ""}
                            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                            min={question.min}
                            max={question.max}
                            step={question.step}
                            autoFocus
                            className="w-32 bg-transparent border-b-2 border-border focus:border-[#0A52EF] outline-none text-lg py-2 transition-colors text-right"
                        />
                        {question.unit && (
                            <span className="text-sm text-muted-foreground font-medium">{question.unit}</span>
                        )}
                    </div>
                    {question.quickActions && question.quickActions.length > 0 && (
                        <div className="flex items-center gap-2">
                            {question.quickActions.map((action) => (
                                <button
                                    key={action.label}
                                    type="button"
                                    onClick={() => {
                                        onChange(action.value);
                                        if (action.skipToEnd && onSkipToEnd) {
                                            setTimeout(onSkipToEnd, 300);
                                        } else {
                                            setTimeout(onNext, 300);
                                        }
                                    }}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                                        value === action.value
                                            ? "border-[#0A52EF] bg-[#0A52EF]/10 text-[#0A52EF]"
                                            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                                    )}
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            );

        case "select": {
            // Filter options by environment when the question has environment-tagged options
            const filteredOptions = question.options?.filter((opt) => {
                if (!opt.environment) return true;
                const isIndoor = answers?.isIndoor ?? true;
                if (isIndoor) return opt.environment === "indoor" || opt.environment === "both";
                return opt.environment === "outdoor" || opt.environment === "both";
            }) ?? [];

            return (
                <div className="space-y-2 mt-2">
                    {filteredOptions.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => { onChange(opt.value); setTimeout(onNext, 200); }}
                            className={cn(
                                "w-full text-left px-4 py-3 rounded-lg border-2 transition-all",
                                value === opt.value
                                    ? "border-[#0A52EF] bg-[#0A52EF]/5"
                                    : "border-border hover:border-[#0A52EF]/40 hover:bg-accent/20"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                                    value === opt.value ? "border-[#0A52EF] bg-[#0A52EF]" : "border-border"
                                )}>
                                    {value === opt.value && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <div>
                                    <div className="text-sm font-medium">{opt.label}</div>
                                    {opt.description && (
                                        <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            );
        }

        case "multi-select": {
            // Filter options by environment + exclude the primary pitch
            const primaryPitch = (phase === "display" && answers?.displays)
                ? answers.displays[displayIndex ?? 0]?.pixelPitch || "4"
                : "4";
            const msFilteredOptions = question.options?.filter((opt) => {
                if (opt.value === primaryPitch) return false; // Can't pick the primary as alt
                if (!opt.environment) return true;
                const isIndoor = answers?.isIndoor ?? true;
                if (isIndoor) return opt.environment === "indoor" || opt.environment === "both";
                return opt.environment === "outdoor" || opt.environment === "both";
            }) ?? [];
            const selected: string[] = Array.isArray(value) ? value : [];

            return (
                <div className="space-y-2 mt-2">
                    <div className="text-xs text-muted-foreground mb-1">
                        Primary: <span className="font-semibold text-foreground">{primaryPitch}mm</span> — select alternates below
                    </div>
                    {msFilteredOptions.map((opt) => {
                        const isChecked = selected.includes(opt.value);
                        return (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    const next = isChecked
                                        ? selected.filter((v) => v !== opt.value)
                                        : [...selected, opt.value];
                                    onChange(next);
                                }}
                                className={cn(
                                    "w-full text-left px-4 py-3 rounded-lg border-2 transition-all",
                                    isChecked
                                        ? "border-[#0A52EF] bg-[#0A52EF]/5"
                                        : "border-border hover:border-[#0A52EF]/40 hover:bg-accent/20"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0",
                                        isChecked ? "border-[#0A52EF] bg-[#0A52EF]" : "border-border"
                                    )}>
                                        {isChecked && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium">{opt.label}</div>
                                        {opt.description && (
                                            <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    {selected.length === 0 && (
                        <div className="text-xs text-muted-foreground pt-1">
                            No alternates selected — press Next to skip
                        </div>
                    )}
                </div>
            );
        }

        case "dimensions": {
            const currentDisplay = (phase === "display" && answers?.displays) ? answers.displays[displayIndex ?? 0] : null;
            const currentProductId = currentDisplay?.productId;
            const currentProductSpec = currentProductId && productSpecs ? productSpecs[currentProductId] : null;
            const currentPitch = parseFloat(currentDisplay?.pixelPitch || "4") || 4;
            const effectiveProductSpec = currentProductSpec
                ? { ...currentProductSpec, pixelPitch: currentPitch }
                : null;
            const estimatedResolution = (value?.widthFt > 0 && value?.heightFt > 0 && currentPitch > 0)
                ? {
                    widthPx: Math.round((value.widthFt * 304.8) / currentPitch),
                    heightPx: Math.round((value.heightFt * 304.8) / currentPitch),
                }
                : null;
            const snapLayout = (value?.widthFt > 0 && value?.heightFt > 0 && effectiveProductSpec)
                ? calculateCabinetLayout(value.widthFt, value.heightFt, effectiveProductSpec, currentDisplay?.productName)
                : null;

            return (
                <div className="mt-2 space-y-3">
                    <div className="flex items-center gap-4">
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1 block">Width (ft)</label>
                            <input
                                type="number"
                                value={value?.widthFt || ""}
                                onChange={(e) => onChange({ ...value, widthFt: parseFloat(e.target.value) || 0 })}
                                min={0}
                                step={0.5}
                                autoFocus
                                className="w-28 bg-transparent border-b-2 border-border focus:border-[#0A52EF] outline-none text-lg py-2 transition-colors text-center"
                            />
                        </div>
                        <span className="text-2xl text-muted-foreground mt-5">×</span>
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1 block">Height (ft)</label>
                            <input
                                type="number"
                                value={value?.heightFt || ""}
                                onChange={(e) => onChange({ ...value, heightFt: parseFloat(e.target.value) || 0 })}
                                min={0}
                                step={0.5}
                                className="w-28 bg-transparent border-b-2 border-border focus:border-[#0A52EF] outline-none text-lg py-2 transition-colors text-center"
                            />
                        </div>
                        {value?.widthFt > 0 && value?.heightFt > 0 && (
                            <div className="ml-2 mt-5 text-sm text-muted-foreground">
                                = <span className="font-semibold text-foreground">{(value.widthFt * value.heightFt).toFixed(1)}</span> sqft
                            </div>
                        )}
                    </div>

                    {/* Metric Mirror — Snap Result Card */}
                    {snapLayout && (
                        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                                <Ruler className="w-3 h-3" />
                                Metric Mirror — Snap to {snapLayout.cabinetWidthMm}×{snapLayout.cabinetHeightMm}mm
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                                <div>
                                    <div className="text-muted-foreground">Actual Width</div>
                                    <div className="font-semibold text-foreground">
                                        {feetToFeetInches(snapLayout.actualWidthFt)}
                                        <span className="text-muted-foreground font-normal ml-1">({snapLayout.actualWidthFt.toFixed(2)} ft)</span>
                                    </div>
                                    <div className={cn(
                                        "text-[10px] font-medium",
                                        Math.abs(snapLayout.deltaWidthInches) < 0.5 ? "text-emerald-600" :
                                        Math.abs(snapLayout.deltaWidthInches) <= 2 ? "text-amber-600" : "text-red-600"
                                    )}>
                                        {formatDeltaInches(snapLayout.deltaWidthFt).text}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Actual Height</div>
                                    <div className="font-semibold text-foreground">
                                        {feetToFeetInches(snapLayout.actualHeightFt)}
                                        <span className="text-muted-foreground font-normal ml-1">({snapLayout.actualHeightFt.toFixed(2)} ft)</span>
                                    </div>
                                    <div className={cn(
                                        "text-[10px] font-medium",
                                        Math.abs(snapLayout.deltaHeightInches) < 0.5 ? "text-emerald-600" :
                                        Math.abs(snapLayout.deltaHeightInches) <= 2 ? "text-amber-600" : "text-red-600"
                                    )}>
                                        {formatDeltaInches(snapLayout.deltaHeightFt).text}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Module Grid</div>
                                    <div className="font-semibold text-foreground">
                                        {snapLayout.columnsCount} × {snapLayout.rowsCount}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {snapLayout.totalCabinets} cabinets · {snapLayout.actualAreaSqFt} sqft
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                                <span>{snapLayout.actualResolutionW} × {snapLayout.actualResolutionH} px</span>
                                <span>·</span>
                                <span>{snapLayout.totalWeightLbs.toLocaleString()} lbs</span>
                                <span>·</span>
                                <span>{snapLayout.totalMaxPowerW.toLocaleString()} W</span>
                            </div>
                        </div>
                    )}

                    {/* Live pitch-based resolution fallback even before product reselection */}
                    {!snapLayout && estimatedResolution && (
                        <div className="rounded-lg border border-border bg-muted/20 p-3">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                                <Tv className="w-3 h-3" />
                                Live Resolution Estimate
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-sm">
                                <span className="font-semibold text-foreground">
                                    {estimatedResolution.widthPx.toLocaleString()} × {estimatedResolution.heightPx.toLocaleString()} px
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    at {currentPitch}mm pitch
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Hint when no product selected */}
                    {value?.widthFt > 0 && value?.heightFt > 0 && !currentProductSpec && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <ArrowUpDown className="w-3 h-3" />
                            Select an LED product to see snap-to-grid dimensions
                        </div>
                    )}
                </div>
            );
        }

        case "yes-no":
            return (
                <div className="flex gap-3 mt-2">
                    {[
                        { val: true, label: "Yes" },
                        { val: false, label: "No" },
                    ].map((opt) => (
                        <button
                            key={String(opt.val)}
                            onClick={() => { onChange(opt.val); setTimeout(onNext, 200); }}
                            className={cn(
                                "px-6 py-3 rounded-lg border-2 text-sm font-medium transition-all",
                                value === opt.val
                                    ? "border-[#0A52EF] bg-[#0A52EF]/5"
                                    : "border-border hover:border-[#0A52EF]/40"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            );

        case "display-type":
            return (
                <div className="grid grid-cols-2 gap-2 mt-2">
                    {DISPLAY_TYPE_PRESETS.map((preset) => (
                        <button
                            key={preset.value}
                            onClick={() => {
                                if (setDisplayFields) {
                                    setDisplayFields({
                                        displayType: preset.value,
                                        displayName: preset.value === "custom" ? "" : preset.label,
                                        ...preset.defaults,
                                    });
                                } else {
                                    onChange(preset.value);
                                }
                                requestAnimationFrame(() => onNext());
                            }}
                            className={cn(
                                "text-left px-4 py-3 rounded-lg border-2 transition-all",
                                value === preset.value
                                    ? "border-[#0A52EF] bg-[#0A52EF]/5"
                                    : "border-border hover:border-[#0A52EF]/40 hover:bg-accent/20"
                            )}
                        >
                            <div className="text-sm font-medium">{preset.label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{preset.description}</div>
                        </button>
                    ))}
                </div>
            );

        case "product-select":
            return (
                <ProductSelectInput
                    value={value}
                    answers={answers}
                    displayIndex={displayIndex}
                    setDisplayFields={setDisplayFields}
                    onNext={onNext}
                />
            );

        case "display-loop":
            return null; // Buttons handled in parent

        default:
            return null;
    }
}

// ============================================================================
// PRODUCT SELECTOR — Opens full catalog browser dialog
// ============================================================================

function ProductSelectInput({
    value,
    answers,
    displayIndex,
    setDisplayFields,
    onNext,
}: {
    value: string;
    answers?: EstimatorAnswers;
    displayIndex?: number;
    setDisplayFields?: (fields: Partial<DisplayAnswers>) => void;
    onNext: () => void;
}) {
    const [browserOpen, setBrowserOpen] = React.useState(false);

    const currentDisplay = answers?.displays[(displayIndex ?? 0)] || getDefaultDisplayAnswers();
    const pitch = parseFloat(currentDisplay.pixelPitch) || 4;
    const env = answers?.isIndoor ? "indoor" : "outdoor";

    const handleSelect = React.useCallback((productId: string, productName: string) => {
        if (setDisplayFields) {
            setDisplayFields({ productId, productName });
        }
        setBrowserOpen(false);
        if (productId) {
            requestAnimationFrame(() => onNext());
        }
    }, [setDisplayFields, onNext]);

    return (
        <div className="space-y-2 mt-2">
            {/* Currently selected product */}
            {value && currentDisplay.productName && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-[#0A52EF] bg-[#0A52EF]/5">
                    <Check className="w-5 h-5 text-[#0A52EF] shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{currentDisplay.productName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Selected product</div>
                    </div>
                    <button
                        onClick={() => setBrowserOpen(true)}
                        className="text-xs text-[#0A52EF] hover:underline shrink-0"
                    >
                        Change
                    </button>
                </div>
            )}

            {/* Browse catalog button */}
            <button
                onClick={() => setBrowserOpen(true)}
                className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border-2 transition-all",
                    "border-border hover:border-[#0A52EF]/40 hover:bg-accent/20"
                )}
            >
                <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-[#0A52EF] shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Browse Product Catalog</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                            Search by manufacturer, pitch, environment — all products
                        </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
            </button>

            {/* Skip option */}
            <button
                onClick={() => {
                    if (setDisplayFields) {
                        setDisplayFields({ productId: "", productName: "" });
                    }
                    onNext();
                }}
                className="w-full text-left px-4 py-3 rounded-lg border-2 border-dashed border-border hover:border-[#0A52EF]/40 hover:bg-accent/20 transition-all"
            >
                <div className="text-sm text-muted-foreground">Skip — use rate card pricing</div>
            </button>

            {/* Catalog browser dialog */}
            <ProductCatalogBrowser
                open={browserOpen}
                onClose={() => setBrowserOpen(false)}
                onSelect={handleSelect}
                currentPitch={pitch}
                currentEnvironment={env}
                currentWidthFt={currentDisplay.widthFt}
                currentHeightFt={currentDisplay.heightFt}
                selectedProductId={value}
            />
        </div>
    );
}

// ============================================================================
// HELPERS
// ============================================================================

function getQuestionList(phase: string, displayIndex: number): Question[] {
    switch (phase) {
        case "project":
            return PROJECT_QUESTIONS;
        case "display":
            return DISPLAY_QUESTIONS;
        case "financial":
            return FINANCIAL_QUESTIONS;
        default:
            return [];
    }
}
