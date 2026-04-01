/**
 * useRfpServerPreview — Fetches Univer IWorkbookData from the server
 * for the RFP Analyzer. Uses the SAME generator as the export endpoint
 * so what you see online IS what you get in the Excel.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const DEBOUNCE_MS = 2000;

interface RfpPreviewInput {
  analysisId: string | null;
  specs: any[];
  quotes?: any[];
  clientDisplays?: any[];
  includeBond?: boolean;
}

/**
 * Creates a stable string key from specs so the effect doesn't re-fire
 * on identical-but-new-reference arrays. Only fields that affect the
 * server workbook output are included (selectedProductName, pixelPitchMm,
 * heightFt, widthFt, quantity, orientation, mountType).
 */
function specsKey(specs: any[], displays?: any[]): string {
  if (!specs?.length) return "[]";
  const sKey = specs.map(s =>
    `${s.selectedProductName ?? ""}|${s.pixelPitchMm ?? ""}|${s.heightFt ?? ""}|${s.widthFt ?? ""}|${s.quantity ?? ""}|${s.orientation ?? ""}|${s.mountType ?? ""}`
  ).join(";");
  const dKey = displays ? displays.map(d => `${d.match?.product?.name ?? ""}`).join(";") : "";
  return sKey + "###" + dKey;
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

  // Stable key — only changes when spec content actually changes
  const stableSpecsKey = useMemo(() => specsKey(input.specs, input.clientDisplays), [input.specs, input.clientDisplays]);

  useEffect(() => {
    const specNames = input.specs?.slice(0, 3).map((s: any) => s.selectedProductName || s.displayName || "?").join(", ");
    console.log("[RFP Server Preview] Effect triggered", { analysisId: input.analysisId, specCount: input.specs?.length, specNames, skip: skipRef.current, stableKey: stableSpecsKey?.slice(0, 60) });
    // Expose debug state globally so user can check in address bar: javascript:alert(window.__rfpPreviewDebug)
    try { (window as any).__rfpPreviewDebug = { analysisId: input.analysisId, specCount: input.specs?.length, specNames, stableKey: stableSpecsKey?.slice(0, 80), skip: skipRef.current }; } catch {}
    if (skipRef.current) { skipRef.current = false; return; }
    if (!input.analysisId || !input.specs?.length) { console.log("[RFP Server Preview] Skipped — no analysisId or specs", { hasId: !!input.analysisId, specCount: input.specs?.length }); setData(null); return; }

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
            clientDisplays: input.clientDisplays || [],
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
    // Stable dependencies — specs represented by serialized key, not array reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.analysisId, stableSpecsKey, input.includeBond]);

  return { data, loading, error, projectTotal, displayRowMap, skipNextRebuild };
}
