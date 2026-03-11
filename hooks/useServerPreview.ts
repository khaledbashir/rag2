/**
 * useServerPreview — Fetches Univer IWorkbookData from the server.
 *
 * Calls /api/estimator/preview-univer which generates the canonical ExcelJS
 * workbook and converts it to Univer format with formulas, styles, and merges.
 *
 * Returns the raw IWorkbookData JSON for UniverPreview to render.
 */

import { useState, useEffect, useRef } from "react";
import type { EstimatorAnswers } from "@/app/components/estimator/questions";

const DEBOUNCE_MS = 1500; // Wait 1.5s after last change before regenerating

export function useServerPreview(answers: EstimatorAnswers): {
  data: any | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Don't generate if no displays
    if (!answers.displays?.length) {
      setData(null);
      return;
    }

    // Debounce
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // Abort previous request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/estimator/preview-univer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }));
          throw new Error(err.error || `Server error ${res.status}`);
        }

        const workbookData = await res.json();
        setData(workbookData);
      } catch (err: any) {
        if (err.name === "AbortError") return; // Cancelled, ignore
        setError(err.message || "Preview generation failed");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [answers]);

  return { data, loading, error };
}
