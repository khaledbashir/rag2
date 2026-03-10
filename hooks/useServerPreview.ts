/**
 * useServerPreview — WYSIWYG preview from the canonical workbook generator.
 *
 * Calls /api/estimator/export-unified (the same server-side generator that
 * produces the exported .xlsx), parses the result with SheetJS, and converts
 * it to SheetTab[] for the ExcelPreview renderer.
 *
 * What you see in the preview IS what you get when you export.
 */

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import type { SheetTab, SheetRow, SheetCell } from "@/app/components/reusables/workbookTypes";
import type { WorkbookData } from "@/app/components/reusables/workbookTypes";
import type { EstimatorAnswers } from "@/app/components/estimator/questions";

const DEBOUNCE_MS = 1500; // Wait 1.5s after last change before regenerating

// Tab colors matching the canonical generator
const TAB_COLORS: Record<string, string> = {
  "Project Overview": "#1F2937",
  "Margin Analysis": "#0A52EF",
  "Budget Summary": "#28A745",
  "LED Cost Sheet": "#28A745",
  "Tech Specs": "#6C757D",
  "Processor Count": "#17A2B8",
  "Bundle Equipment": "#17A2B8",
  "ANC Travel": "#FFC107",
  "CMS": "#6610F2",
  "Scoring": "#059669",
  "Resp Matrix": "#6C757D",
  "P&L": "#FFC107",
  "Cash Flow": "#FFC107",
  "PO's": "#FFC107",
};

function getTabColor(name: string): string {
  if (TAB_COLORS[name]) return TAB_COLORS[name];
  if (name.includes("Install")) return "#28A745";
  return "#6366F1";
}

export function useServerPreview(answers: EstimatorAnswers, debugLog?: (msg: string) => void): {
  data: WorkbookData | null;
  loading: boolean;
  error: string | null;
} {
  const log = debugLog || (() => {});
  const [data, setData] = useState<WorkbookData | null>(null);
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

    log(`useEffect triggered, scheduling fetch in ${DEBOUNCE_MS}ms`);

    // Debounce
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      // Abort previous request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      const costOverridesDebug = answers.displays?.map((d: any) => d.costOverrides);
      log(`Fetching... costOverrides: ${JSON.stringify(costOverridesDebug)}`);

      try {
        const res = await fetch("/api/estimator/export-unified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
          signal: controller.signal,
        });

        log(`Response: ${res.status}`);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `${res.status}` }));
          throw new Error(err.error || `Server error ${res.status}`);
        }

        const buffer = await res.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellStyles: true });

        // Convert XLSX workbook → SheetTab[] for ExcelPreview
        const sheets: SheetTab[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
          const colCount = Math.min(range.e.c + 1, 20); // cap at 20 cols
          const rowCount = Math.min(range.e.r + 1, 200); // cap at 200 rows

          const columns: string[] = [];
          for (let c = 0; c < colCount; c++) {
            // Use first row as column headers if they look like headers
            const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
            const cell = ws[cellAddr];
            columns.push(cell?.v != null ? String(cell.v) : String.fromCharCode(65 + c));
          }

          const rows: SheetRow[] = [];
          for (let r = 0; r <= rowCount; r++) {
            const cells: SheetCell[] = [];
            let hasContent = false;

            for (let c = 0; c < colCount; c++) {
              const cellAddr = XLSX.utils.encode_cell({ r, c });
              const cell = ws[cellAddr];

              if (!cell || cell.v == null) {
                cells.push({ value: "" });
                continue;
              }

              hasContent = true;
              const isCurrency = cell.z && (cell.z.includes("$") || cell.z.includes("#,##0"));
              const isPercent = cell.z && cell.z.includes("%");
              const isBold = cell.s?.bold || false;

              cells.push({
                value: cell.v,
                currency: isCurrency && typeof cell.v === "number",
                percent: isPercent && typeof cell.v === "number",
                bold: isBold,
                align: isCurrency || isPercent ? "right" : undefined,
              });
            }

            // Skip completely empty rows at the end
            if (!hasContent && r > rowCount - 10) continue;

            rows.push({ cells });
          }

          return {
            name,
            color: getTabColor(name),
            columns,
            rows,
          };
        });

        const clientName = answers.clientName || "Client";
        const fileName = `ANC_${clientName.replace(/\s+/g, "_")}_Cost_Analysis.xlsx`;

        if (sheets.length > 0) sheets[0].active = true;
        log(`Done: ${sheets.length} sheets, ${sheets.reduce((s, sh) => s + sh.rows.length, 0)} rows`);
        setData({ fileName, sheets });
      } catch (err: any) {
        if (err.name === "AbortError") { log("Request aborted"); return; }
        log(`ERROR: ${err.message}`);
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
