"use client";

import React, { useState, useCallback, useRef } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormContext } from "react-hook-form";
import useToasts from "@/hooks/useToasts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AgentSearchPhase } from "./AgentSearchAnimation";

type AiWandProps = {
    fieldName: string;
    searchQuery?: string;
    targetFields: string[]; // Fields to fill (e.g., ["receiver.address", "receiver.city"])
    proposalId?: string; // Project workspace to use for context
    onSearchStateChange?: (phase: AgentSearchPhase) => void;
    showIdlePulse?: boolean;
};

type EnrichCandidate = {
    label: string;
    confidence: number;
    notes: string;
    results: Record<string, string>;
};

export default function AiWand({ fieldName, searchQuery, targetFields, proposalId, onSearchStateChange, showIdlePulse }: AiWandProps) {
    const [loading, setLoading] = useState(false);
    const [wandBounce, setWandBounce] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [candidates, setCandidates] = useState<EnrichCandidate[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<string>("");
    const [lastQuery, setLastQuery] = useState<string>("");
    const [correctedQuery, setCorrectedQuery] = useState<string>("");
    const { getValues, setValue } = useFormContext();
    const { success: showSuccess, error: showError } = useToasts();
    const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setPhase = useCallback((phase: AgentSearchPhase) => {
        onSearchStateChange?.(phase);
    }, [onSearchStateChange]);

    const scheduleIdle = useCallback((delayMs: number) => {
        if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
        phaseTimerRef.current = setTimeout(() => setPhase("idle"), delayMs);
    }, [setPhase]);

    const applyResults = (results: Record<string, string>, originalQuery: string, corrected: string) => {
        // 1. Update the main field with corrected name if it changed significantly
        if (corrected && corrected.trim().length > 0 && typeof fieldName === "string") {
            const q = originalQuery.toString().trim();
            const cq = corrected.toString().trim();
            if (q.length > 0 && cq.length > 0 && q.toLowerCase() !== cq.toLowerCase()) {
                setValue(fieldName, cq, { shouldDirty: true });
            }
        }

        // 2. Map results to target fields with staggered timing for visual effect
        setPhase("filling");
        targetFields.forEach((field, i) => {
            setTimeout(() => {
                const value = results[field];
                setValue(field, value || "", { shouldDirty: true });
            }, i * 150);
        });

        // Transition to complete after all fields filled
        const fillDuration = targetFields.length * 150 + 300;
        setTimeout(() => {
            setPhase("complete");
            scheduleIdle(2500);
        }, fillDuration);
    };

    const handleEnrich = async () => {
        const baseValue = getValues(fieldName);
        const query = searchQuery || baseValue;

        if (!query || query.length < 3) {
            showError("Please enter a name or company first.");
            return;
        }

        setLoading(true);
        setPhase("searching");
        setLastQuery(String(query));
        const controller = new AbortController();
        let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => controller.abort(), 45000);
        try {
            const res = await fetch("/api/agent/enrich", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, targetFields, proposalId }),
                signal: controller.signal,
            });
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = null;

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                showError(data?.error || "AI enrichment failed.");
                setPhase("error");
                setWandBounce(true);
                setTimeout(() => setWandBounce(false), 600);
                scheduleIdle(2000);
                return;
            }

            const corrected = typeof data?.correctedQuery === "string" ? data.correctedQuery : String(query);
            setCorrectedQuery(corrected);

            const incomingCandidates: EnrichCandidate[] = Array.isArray(data?.candidates)
                ? data.candidates
                : data?.results
                    ? [{ label: corrected, confidence: 1, notes: "", results: data.results }]
                    : [];

            if (incomingCandidates.length === 0) {
                showError("Could not find detailed information for this client.");
                setPhase("error");
                setWandBounce(true);
                setTimeout(() => setWandBounce(false), 600);
                scheduleIdle(2000);
                return;
            }

            if (incomingCandidates.length === 1) {
                const c = incomingCandidates[0];
                applyResults(c.results, String(query), corrected);
                showSuccess(`AI filled details for ${corrected}!`);
                return;
            }

            // Multiple candidates — pause animation, let picker handle it
            setPhase("idle");
            setCandidates(incomingCandidates);
            setSelectedCandidate(incomingCandidates[0]?.label ?? "");
            setPickerOpen(true);
        } catch (e) {
            console.error("Enrichment error:", e);
            setPhase("error");
            setWandBounce(true);
            setTimeout(() => setWandBounce(false), 600);
            scheduleIdle(2000);
            if ((e as Error)?.name === "AbortError") {
                showError("Lookup timed out. Check your connection or try again.");
            } else {
                showError("AI Enrichment failed.");
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
            setLoading(false);
        }
    };

    return (
        <>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={loading}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleEnrich();
                }}
                className={cn(
                    "h-8 w-8 text-[#0A52EF] hover:text-[#0A52EF]/70 hover:bg-[#0A52EF]/10 active:scale-95 transition-all",
                    wandBounce && "animate-[agent-wand-bounce_0.6s_ease-in-out]",
                )}
                title="Auto-fill details via AI Search"
            >
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                    <Wand2
                        className={cn(
                            "h-4 w-4",
                            showIdlePulse && !loading && "animate-[agent-wand-idle_2s_ease-in-out_infinite]",
                        )}
                    />
                )}
            </Button>

            <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                <DialogContent className="max-w-xl bg-card/90 backdrop-blur-2xl border border-border">
                    <DialogHeader>
                        <DialogTitle>Select the correct match</DialogTitle>
                        <DialogDescription>
                            We found multiple possible matches for "{lastQuery}". Pick the right one.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="text-xs text-muted-foreground">
                            Corrected query: <span className="text-foreground font-semibold">{correctedQuery || lastQuery}</span>
                        </div>

                        <div className="flex flex-col gap-2">
                            {candidates.map((c) => {
                                const city = c.results["receiver.city"] || "";
                                const venue = c.results["details.venue"] || "";
                                const address = c.results["receiver.address"] || "";
                                const zip = c.results["receiver.zipCode"] || "";
                                const meta = [venue, city, zip].filter(Boolean).join(" · ");
                                const hint = [address, meta].filter(Boolean).join(" — ");
                                const conf = Number.isFinite(c.confidence) ? Math.round(c.confidence * 100) : 0;
                                const isSelected = selectedCandidate === c.label;

                                return (
                                    <button
                                        key={c.label}
                                        type="button"
                                        onClick={() => setSelectedCandidate(c.label)}
                                        className={cn(
                                            "w-full text-left rounded-xl border-2 px-4 py-4 transition-all duration-200",
                                            isSelected
                                                ? "border-primary bg-primary/10 ring-2 ring-primary/20 shadow-[0_0_15px_rgba(10,82,239,0.1)]"
                                                : "border-border bg-card/30 hover:border-border/80 hover:bg-card/50"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className={cn(
                                                        "font-bold text-sm",
                                                        isSelected ? "text-primary-foreground bg-primary px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider" : "text-white"
                                                    )}>
                                                        {isSelected ? "Selected" : c.label}
                                                    </div>
                                                    {isSelected && <div className="font-bold text-sm text-white">{c.label}</div>}
                                                </div>
                                                {hint ? <div className="text-xs text-foreground/70 leading-relaxed break-words">{hint}</div> : null}
                                                {c.notes ? <div className="text-xs text-muted-foreground mt-2 italic">{c.notes}</div> : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <div className={cn(
                                                    "shrink-0 text-[11px] font-bold uppercase tracking-widest",
                                                    isSelected ? "text-primary" : "text-muted-foreground"
                                                )}>
                                                    {conf}% Match
                                                </div>
                                                {isSelected && (
                                                    <div className="h-5 w-5 bg-primary rounded-full flex items-center justify-center text-white">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setPickerOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                const chosen = candidates.find((c) => c.label === selectedCandidate) || candidates[0];
                                if (!chosen) return;
                                setPickerOpen(false);
                                applyResults(chosen.results, lastQuery, correctedQuery || lastQuery);
                                showSuccess(`AI filled details for ${chosen.label}!`);
                            }}
                            className="shadow-[0_0_20px_rgba(10,82,239,0.15)]"
                        >
                            Apply
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
