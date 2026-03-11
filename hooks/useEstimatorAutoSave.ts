"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { EstimatorAnswers } from "@/app/components/estimator/questions";
import type { SheetTab, RateCard } from "@/app/components/estimator/EstimatorBridge";

interface UseEstimatorAutoSaveOptions {
    projectId: string | undefined;
    answers: EstimatorAnswers;
    cellOverrides: Record<string, string | number>;
    customSheets: SheetTab[];
    rates: RateCard | null;
    debounceMs?: number;
    totalAmount?: number;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Auto-saves estimator state to /api/projects/[id] with debounce.
 * Only active when projectId is provided (persisted project mode).
 */
export function useEstimatorAutoSave({
    projectId,
    answers,
    cellOverrides,
    customSheets,
    rates,
    debounceMs = 2000,
    totalAmount,
}: UseEstimatorAutoSaveOptions) {
    const [status, setStatus] = useState<SaveStatus>("idle");
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const lastSavedRef = useRef<string>("");

    const save = useCallback(async () => {
        if (!projectId) return;

        const payload = {
            estimatorAnswers: answers,
            estimatorCellOverrides: cellOverrides,
            estimatorCustomSheets: customSheets,
            clientName: answers.clientName || "Untitled Estimate",
            // Snapshot rate card on save so estimates are reproducible
            ...(rates ? { estimatorRateSnapshot: rates } : {}),
            // Persist computed total for list page display
            ...(totalAmount != null && totalAmount > 0 ? { totalSellingPrice: totalAmount } : {}),
        };

        const serialized = JSON.stringify(payload);
        if (serialized === lastSavedRef.current) return; // No changes

        // Abort any in-flight save
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setStatus("saving");

        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: serialized,
                signal: controller.signal,
            });

            if (!res.ok) {
                const err = await res.text();
                console.error("[EstimatorAutoSave] Save failed:", err);
                setStatus("error");
                return;
            }

            lastSavedRef.current = serialized;
            setStatus("saved");
        } catch (err: any) {
            if (err?.name === "AbortError") return; // Superseded by newer save
            console.error("[EstimatorAutoSave] Save error:", err);
            setStatus("error");
        }
    }, [projectId, answers, cellOverrides, customSheets, rates, totalAmount]);

    // Debounced trigger on state changes
    useEffect(() => {
        if (!projectId) return;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(save, debounceMs);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [projectId, answers, cellOverrides, customSheets, debounceMs, save]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return { status };
}
