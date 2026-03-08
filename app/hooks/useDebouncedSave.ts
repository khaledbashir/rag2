import { useCallback, useRef } from 'react';
import { useFormContext } from 'react-hook-form';

export const useDebouncedSave = (enabled: boolean = true) => {
    const { getValues } = useFormContext();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const saveToDb = useCallback(async () => {
        if (!enabled) return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(async () => {
            const data = getValues();
            const proposalId = data.details?.proposalId;

            if (!proposalId || proposalId === 'new') return;

            // Abort any in-flight save to prevent stale overwrites
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                await fetch(`/api/proposals/${proposalId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                    signal: controller.signal,
                });
            } catch (e: unknown) {
                if (e instanceof Error && e.name === 'AbortError') return;
                console.error("Auto-save failed", e);
            }
        }, 1000);
    }, [enabled, getValues]);

    return { saveToDb };
};
