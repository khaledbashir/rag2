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

import React, { useRef, useEffect, useState } from "react";
import { Loader2, AlertCircle, ChevronDown } from "lucide-react";

interface ProductOption {
  id: string;
  label: string;
  name: string;
  pitch: number;
}

interface DisplayInfo {
  name: string;
  productId?: string;
  productName?: string;
}

interface UniverPreviewProps {
  workbookData: any;
  loading?: boolean;
  error?: string | null;
  /** Called when user edits a cell: (sheetName, row0based, col0based, newValue) */
  onCellEdit?: (sheetName: string, row: number, col: number, value: number | string) => void;
  /** Product list for dropdown on LED Cost Sheet column F */
  products?: ProductOption[];
  /** Display names + current product for the product selector bar */
  displays?: DisplayInfo[];
}

export default function UniverPreview({ workbookData, loading, error, onCellEdit, products, displays }: UniverPreviewProps) {
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
  /** Product dropdown state: which display index is open */
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Track mount for SSR safety
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (openDropdown === null) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-product-selector]")) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

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

        // Listen for cell edits via SheetValueChanged event
        try {
          univerAPI.addEvent(univerAPI.Event.SheetValueChanged, (params: any) => {
            if (!onCellEditRef.current || !params?.effectedRanges) return;
            const wb = univerAPI.getActiveWorkbook?.();

            for (const fRange of params.effectedRanges) {
              const row = fRange.getRow?.();
              const col = fRange.getColumn?.();
              if (row == null || col == null) continue;

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

  // Show product selector bar when products and displays are available
  const showProductBar = products && products.length > 0 && displays && displays.length > 0;

  // Filter products for dropdown
  const filteredProducts = products?.filter((p) =>
    !searchTerm || p.label.toLowerCase().includes(searchTerm.toLowerCase()) || String(p.pitch).includes(searchTerm),
  ) || [];

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-0">
      {/* Product selector bar — one dropdown per display */}
      {showProductBar && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-zinc-900 border border-border rounded-t-lg overflow-x-auto shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">Product</span>
          {displays!.map((d, idx) => {
            const currentProduct = products!.find((p) => p.id === d.productId || p.name === d.productName);
            const isOpen = openDropdown === idx;
            return (
              <div key={idx} className="relative shrink-0" data-product-selector>
                <button
                  onClick={() => { setOpenDropdown(isOpen ? null : idx); setSearchTerm(""); }}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded border transition-colors ${
                    isOpen
                      ? "border-[#0A52EF] bg-blue-50 dark:bg-blue-900/20"
                      : "border-border hover:border-zinc-400 dark:hover:border-zinc-600"
                  }`}
                >
                  <span className="font-medium truncate max-w-[100px]">{d.name}</span>
                  <span className="text-muted-foreground truncate max-w-[120px]">
                    {currentProduct ? currentProduct.label : "No product"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                </button>
                {isOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 border border-border rounded-lg shadow-xl w-[280px]">
                    <div className="p-2 border-b border-border">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search products..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-[#0A52EF]"
                      />
                    </div>
                    <div className="overflow-y-auto max-h-[240px]">
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between ${
                            currentProduct?.id === p.id ? "bg-blue-50 dark:bg-blue-900/30 font-medium" : ""
                          }`}
                          onClick={() => {
                            // col 5 = Product column (F) in LED Cost Sheet, row = 3 + display index (0-based)
                            onCellEdit?.("LED Cost Sheet", 3 + idx, 5, p.name);
                            setOpenDropdown(null);
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Univer spreadsheet */}
      <div
        ref={containerRef}
        className="flex-1 w-full min-h-0 rounded-b-lg border border-t-0 border-border bg-white"
      />
    </div>
  );
}
