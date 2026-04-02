"use client";

/**
 * UniverPreview — Lightweight Univer spreadsheet wrapper for the Budget Estimator.
 *
 * Renders IWorkbookData from /api/estimator/preview-univer as a live spreadsheet
 * with formula recalculation, cell editing, and sheet tabs.
 *
 * Supports inline editing: when a user edits a cell, the onCellEdit callback
 * fires with (sheetName, row, col, value) so the parent can update answers.
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface ProductOption {
  id: string;
  label: string;
  name: string;
  pitch: number;
}

interface UniverPreviewProps {
  workbookData: any;
  loading?: boolean;
  error?: string | null;
  /** Called when user edits a cell: (sheetName, row0based, col0based, newValue) */
  onCellEdit?: (sheetName: string, row: number, col: number, value: number | string) => void;
  /** Product list for dropdown on LED Cost Sheet column F */
  products?: ProductOption[];
}

export default function UniverPreview({ workbookData, loading, error, onCellEdit, products }: UniverPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const workbookDataRef = useRef(workbookData);
  workbookDataRef.current = workbookData;
  /** Preserve active sheet tab across workbook re-renders */
  const lastActiveSheetRef = useRef<string | null>(null);
  const onCellEditRef = useRef(onCellEdit);
  onCellEditRef.current = onCellEdit;
  /** Product dropdown overlay state */
  const [productDropdown, setProductDropdown] = useState<{ row: number; x: number; y: number; current: string } | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const productsRef = useRef(products);
  productsRef.current = products;

  // Track mount for SSR safety
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Initialize / reinitialize Univer when workbookData changes
  useEffect(() => {
    if (!mounted || !workbookData) return;

    let disposed = false;

    async function init() {
      const el = containerRef.current;
      if (!el || disposed) return;

      // Save active sheet tab before disposing
      if (apiRef.current) {
        try {
          const wb = apiRef.current.getActiveWorkbook?.();
          const activeSheet = wb?.getActiveSheet?.();
          if (activeSheet) {
            lastActiveSheetRef.current = activeSheet.getSheetName?.() || null;
          }
        } catch { /* ignore */ }
        try { apiRef.current.dispose(); } catch { /* ignore */ }
        apiRef.current = null;
      }

      try {
        // Load Univer CSS via <link> tag (safe for SSR — no webpack import)
        if (!document.getElementById("univer-sheets-css")) {
          const link = document.createElement("link");
          link.id = "univer-sheets-css";
          link.rel = "stylesheet";
          link.href = "/univer-sheets.css";
          document.head.appendChild(link);
          await new Promise<void>((resolve) => {
            link.onload = () => resolve();
            link.onerror = () => resolve();
          });
        }

        const { createUniver, LocaleType, mergeLocales } = await import("@univerjs/presets");
        const { UniverSheetsCorePreset } = await import("@univerjs/preset-sheets-core");
        const localeModule = await import("@univerjs/preset-sheets-core/locales/en-US");
        const UniverPresetSheetsCoreEnUS = localeModule.default;

        if (disposed) return;

        // Univer needs a container with non-zero dimensions — retry a few times
        // because flex layouts may not have computed height on the first frame
        let retries = 0;
        while (!disposed && !el.offsetHeight && retries < 10) {
          await new Promise((r) => requestAnimationFrame(r));
          retries++;
        }
        if (disposed || !el.offsetHeight) {
          console.warn("[UniverPreview] Container has 0 height after retries, cannot initialize");
          return;
        }

        const { univerAPI } = createUniver({
          locale: LocaleType.EN_US,
          locales: {
            [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS),
          },
          presets: [
            UniverSheetsCorePreset({
              container: el,
            }),
          ],
        });

        if (disposed) {
          univerAPI.dispose();
          return;
        }

        apiRef.current = univerAPI;
        univerAPI.createWorkbook(workbookDataRef.current);

        // Restore previously active sheet tab (after a frame so Univer is fully rendered)
        if (lastActiveSheetRef.current) {
          const savedTab = lastActiveSheetRef.current;
          requestAnimationFrame(() => {
            if (disposed) return;
            try {
              const wb = univerAPI.getActiveWorkbook?.();
              if (wb) {
                // Try setActiveSheet with name first, fall back to iterating sheets
                try {
                  wb.setActiveSheet(savedTab);
                } catch {
                  const sheets = wb.getSheets?.() || [];
                  for (const s of sheets) {
                    if (s.getSheetName?.() === savedTab) {
                      s.activate?.();
                      break;
                    }
                  }
                }
              }
            } catch { /* ignore — will just show first tab */ }
          });
        }

        // Fix Tailwind/Univer CSS conflict — ensure sheet tab bar is fully visible
        try {
          const fixStyle = document.createElement("style");
          fixStyle.textContent = `
            .sheet-bar { min-height: 32px !important; overflow: visible !important; }
            .sheet-bar * { box-sizing: content-box !important; }
          `;
          el.appendChild(fixStyle);
        } catch { /* ignore */ }

        // Listen for cell selection to show product dropdown on LED Cost Sheet column F (col 5)
        try {
          univerAPI.addEvent(univerAPI.Event.SelectionChanged, (params: any) => {
            if (!productsRef.current?.length) return;
            const wb = univerAPI.getActiveWorkbook?.();
            const activeSheet = wb?.getActiveSheet?.();
            const sheetName = activeSheet?.getSheetName?.() || "";
            if (sheetName !== "LED Cost Sheet") {
              setProductDropdown(null);
              return;
            }
            const range = params?.range || params?.selections?.[0];
            const row = range?.getRow?.() ?? range?.startRow;
            const col = range?.getColumn?.() ?? range?.startColumn;
            if (col === 5 && row != null && row >= 3) {
              // Get cell position for dropdown placement
              const container = containerRef.current;
              if (!container) return;
              const rect = container.getBoundingClientRect();
              // Estimate cell position from column widths (col F ~= column 6)
              const currentVal = activeSheet?.getRange?.(row, col)?.getValue?.() || "";
              setProductDropdown({ row, x: rect.left + 320, y: rect.top + Math.min((row - 1) * 24, 200), current: String(currentVal) });
              setProductSearch("");
            } else {
              setProductDropdown(null);
            }
          });
        } catch (e) {
          console.warn("[UniverPreview] Could not attach selection listener:", e);
        }

        // Listen for cell edits via SheetValueChanged event
        try {
          univerAPI.addEvent(univerAPI.Event.SheetValueChanged, (params: any) => {
            if (!onCellEditRef.current || !params?.effectedRanges) return;
            const wb = univerAPI.getActiveWorkbook?.();

            for (const fRange of params.effectedRanges) {
              const row = fRange.getRow?.();
              const col = fRange.getColumn?.();
              if (row == null || col == null) continue;

              // Get sheet name from the range's sheet
              const sheetId = fRange.getSheetId?.();
              let sheetName = "";
              if (wb && sheetId) {
                const sheet = wb.getSheetBySheetId?.(sheetId);
                sheetName = sheet?.getSheetName?.() || "";
              }

              let rawValue = fRange.getValue?.();
              let value: number | string;
              if (typeof rawValue === "number") {
                value = rawValue;
              } else if (rawValue != null) {
                const parsed = parseFloat(String(rawValue));
                value = isNaN(parsed) ? String(rawValue) : parsed;
              } else {
                value = 0;
              }

              onCellEditRef.current(sheetName, row, col, value);
            }
          });
        } catch (e) {
          console.warn("[UniverPreview] Could not attach edit listener:", e);
        }

        setInitError(null);
      } catch (err: any) {
        console.error("[UniverPreview] init error:", err);
        setInitError(err?.message || "Failed to initialize spreadsheet");
      }
    }

    init();

    return () => {
      disposed = true;
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch { /* ignore */ }
        apiRef.current = null;
      }
    };
  }, [mounted, workbookData]);

  // Error state
  const displayError = error || initError;
  if (displayError && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-border">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-sm text-destructive font-medium">Preview Error</p>
          <p className="text-xs text-muted-foreground max-w-md">{displayError}</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading || !workbookData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-border">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#0A52EF]" />
          <p className="text-xs text-muted-foreground">
            {loading ? "Generating workbook..." : "Waiting for display data..."}
          </p>
        </div>
      </div>
    );
  }

  // Filter products for dropdown
  const filteredProducts = products?.filter((p) =>
    !productSearch || p.label.toLowerCase().includes(productSearch.toLowerCase()) || String(p.pitch).includes(productSearch),
  ) || [];

  return (
    <div className="relative flex-1 w-full h-full min-h-0">
      <div
        ref={containerRef}
        className="w-full h-full rounded-lg border border-border bg-white"
      />
      {/* Product dropdown overlay */}
      {productDropdown && products?.length ? (
        <div
          className="absolute z-50 bg-white dark:bg-zinc-900 border border-border rounded-lg shadow-xl"
          style={{ top: 80, right: 16, width: 280, maxHeight: 320 }}
        >
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Search products..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-[#0A52EF]"
            />
          </div>
          <div className="overflow-y-auto max-h-[240px]">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between ${
                  p.name === productDropdown.current ? "bg-blue-50 dark:bg-blue-900/30 font-medium" : ""
                }`}
                onClick={() => {
                  onCellEdit?.("LED Cost Sheet", productDropdown.row, 5, p.name);
                  setProductDropdown(null);
                }}
              >
                <span className="truncate">{p.label}</span>
                <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{p.pitch}mm</span>
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 text-center">No products match</p>
            )}
          </div>
          <div className="p-1.5 border-t border-border">
            <button
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
              onClick={() => setProductDropdown(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
