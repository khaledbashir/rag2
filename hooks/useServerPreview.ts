/**
 * useServerPreview — Fetches Univer IWorkbookData from the server.
 *
 * Calls /api/estimator/preview-univer which generates the canonical ExcelJS
 * workbook and converts it to Univer format with formulas, styles, and merges.
 *
 * Returns the raw IWorkbookData JSON for UniverPreview to render.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import type { EstimatorAnswers } from "@/app/components/estimator/questions";

const DEBOUNCE_TYPING_MS = 1200;

function answersFingerprint(answers: EstimatorAnswers): string {
  if (!answers.displays?.length) return "";
  return answers.displays.map((d) =>
    [
      d.displayName ?? "",
      d.productId ?? "",
      d.productName ?? "",
      d.pixelPitch ?? "",
      d.heightFt ?? "",
      d.widthFt ?? "",
      d.quantity ?? "",
      d.fixedHeightPx ?? "",
      d.fixedWidthPx ?? "",
    ].join("|")
  ).join(";");
}

function productFingerprint(answers: EstimatorAnswers): string {
  if (!answers.displays?.length) return "";
  return answers.displays.map((d) => d.productId ?? "").join("|");
}

export function useServerPreview(answers: EstimatorAnswers): {
  data: any | null;
  loading: boolean;
  error: string | null;
  projectTotal: number;
  /** Maps 0-based row index → answers.displays index (LED Cost Sheet only) */
  displayRowMap: Record<number, number>;
} {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectTotal, setProjectTotal] = useState(0);
  const [displayRowMap, setDisplayRowMap] = useState<Record<number, number>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevProductFpRef = useRef("");
  const fingerprint = useMemo(() => answersFingerprint(answers), [answers]);
  const productFp = useMemo(() => productFingerprint(answers), [answers]);

  useEffect(() => {
    // Don't generate if no displays
    if (!answers.displays?.length) {
      setData(null);
      return;
    }

    // Don't generate if no display has dimensions yet — avoids infinite spinner
    const hasDims = answers.displays.some(
      (d: any) => (Number(d.widthFt) || Number(d.activeWidthFt)) > 0 &&
                   (Number(d.heightFt) || Number(d.activeHeightFt)) > 0,
    );
    if (!hasDims) {
      setData(null);
      setLoading(false);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    const productChanged = prevProductFpRef.current !== "" && prevProductFpRef.current !== productFp;
    prevProductFpRef.current = productFp;
    const delay = productChanged ? 0 : DEBOUNCE_TYPING_MS;

    const doFetch = async () => {
      // Abort previous request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        // 30s timeout — prevents infinite spinner if server hangs
        const timeout = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch("/api/estimator/preview-univer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }));
          throw new Error(err.error || `Server error ${res.status}`);
        }

        const workbookData = await res.json();
        if (workbookData.projectTotal != null) {
          setProjectTotal(workbookData.projectTotal);
        }
        if (workbookData.displayRowMap) {
          setDisplayRowMap(workbookData.displayRowMap);
        }
        setData(workbookData);
      } catch (err: any) {
        if (err.name === "AbortError") {
          // Timed out or cancelled — clear loading so it doesn't hang
          setLoading(false);
          if (controller.signal.reason === "timeout") {
            setError("Workbook generation timed out — try again");
          }
          return;
        }
        setError(err.message || "Preview generation failed");
      } finally {
        setLoading(false);
      }
    };

    if (delay === 0) {
      void doFetch();
    } else {
      timerRef.current = setTimeout(() => {
        void doFetch();
      }, delay);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [answers, fingerprint, productFp]);

  return { data, loading, error, projectTotal, displayRowMap };
}
