/**
 * useRfpServerPreview — Fetches Univer IWorkbookData from the server
 * for the RFP Analyzer. Uses the SAME generator as the export endpoint
 * so what you see online IS what you get in the Excel.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const DEBOUNCE_MS = 2000;

interface RfpPreviewInput {
  analysisId: string | null;
  specs: any[];
  quotes?: any[];
  includeBond?: boolean;
}

export function useRfpServerPreview(input: RfpPreviewInput) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectTotal, setProjectTotal] = useState(0);
  const [displayRowMap, setDisplayRowMap] = useState<Record<number, number>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipRef = useRef(false);
  const skipNextRebuild = useCallback(() => { skipRef.current = true; }, []);

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    if (!input.analysisId || !input.specs?.length) { setData(null); return; }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        console.log("[RFP Server Preview] Fetching...", { analysisId: input.analysisId, specCount: input.specs?.length });
        const timeout = setTimeout(() => controller.abort(), 45_000);
        const res = await fetch("/api/rfp/preview-univer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: input.analysisId,
            clientSpecs: input.specs,
            quotes: input.quotes || [],
            includeBond: input.includeBond || false,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }));
          throw new Error(err.error || `Server error ${res.status}`);
        }

        const workbookData = await res.json();
        console.log("[RFP Server Preview] Received workbook:", { sheets: Object.keys(workbookData.sheets || {}), sheetOrder: workbookData.sheetOrder });
        if (workbookData.projectTotal != null) setProjectTotal(workbookData.projectTotal);
        if (workbookData.displayRowMap) setDisplayRowMap(workbookData.displayRowMap);
        setData(workbookData);
      } catch (err: any) {
        if (err.name === "AbortError") { setLoading(false); return; }
        console.error("[RFP Server Preview] Error:", err.message);
        setError(err.message || "Preview generation failed");
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [input.analysisId, input.specs, input.quotes, input.includeBond]);

  return { data, loading, error, projectTotal, displayRowMap, skipNextRebuild };
}
