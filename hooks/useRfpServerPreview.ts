/**
 * useRfpServerPreview — Fetches Univer IWorkbookData from the server
 * for the RFP Analyzer. Uses the SAME generator as the export endpoint
 * so what you see online IS what you get in the Excel.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const DEBOUNCE_TYPING_MS = 1200;

interface RfpPreviewInput {
  analysisId: string | null;
  specs: any[];
  includeBond?: boolean;
}

/** Stable key so effect doesn't re-fire on same-content re-renders */
function specsFingerprint(specs: any[]): string {
  if (!specs?.length) return "";
  return specs.map(s =>
    `${s.name ?? ""}|${s.selectedProductId ?? ""}|${s.selectedProductName ?? ""}|${s.pixelPitchMm ?? ""}|${s.heightFt ?? ""}|${s.widthFt ?? ""}|${s.activeHeightFt ?? ""}|${s.activeWidthFt ?? ""}|${s.quantity ?? ""}`
  ).join(";");
}

/** Extract just the product IDs to detect discrete product changes */
function productFingerprint(specs: any[]): string {
  if (!specs?.length) return "";
  return specs.map(s => s.selectedProductId ?? "").join("|");
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
  const prevProductFpRef = useRef<string>("");
  const skipNextRebuild = useCallback(() => { skipRef.current = true; }, []);

  const fingerprint = useMemo(() => specsFingerprint(input.specs), [input.specs]);
  const productFp = useMemo(() => productFingerprint(input.specs), [input.specs]);

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    if (!input.analysisId || !fingerprint) {
      setData(null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    // Discrete changes (product selection, qty) fire immediately.
    // Continuous edits (H/W typing) use a short debounce.
    const productChanged = prevProductFpRef.current !== "" && prevProductFpRef.current !== productFp;
    prevProductFpRef.current = productFp;
    const delay = productChanged ? 0 : DEBOUNCE_TYPING_MS;

    const doFetch = async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Debug: log the first spec's key fields to trace cabinet snap flow
      const s0 = input.specs[0] as any;
      if (s0) console.error(`[SERVER_PREVIEW] sending spec0: product=${s0.selectedProductId?.substring(0,8)||'none'}, activeW=${s0.activeWidthFt||'null'}, activeH=${s0.activeHeightFt||'null'}, pitch=${s0.pixelPitchMm||'null'}`);

      setLoading(true);
      setError(null);

      try {
        const fetchTimeout = setTimeout(() => controller.abort(), 45_000);
        const res = await fetch("/api/rfp/preview-univer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisId: input.analysisId,
            clientSpecs: input.specs,
            includeBond: input.includeBond || false,
          }),
          signal: controller.signal,
        });
        clearTimeout(fetchTimeout);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }));
          throw new Error(err.error || `Server error ${res.status}`);
        }

        const workbookData = await res.json();
        if (workbookData.projectTotal != null) setProjectTotal(workbookData.projectTotal);
        if (workbookData.displayRowMap) setDisplayRowMap(workbookData.displayRowMap);
        setData(workbookData);
      } catch (err: any) {
        if (err.name === "AbortError") { setLoading(false); return; }
        console.error("[RFP Preview] Error:", err.message);
        setError(err.message || "Preview generation failed");
      } finally {
        setLoading(false);
      }
    };

    if (delay === 0) {
      doFetch();
    } else {
      timerRef.current = setTimeout(doFetch, delay);
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [input.analysisId, fingerprint, input.includeBond, productFp]);

  return { data, loading, error, projectTotal, displayRowMap, skipNextRebuild };
}
