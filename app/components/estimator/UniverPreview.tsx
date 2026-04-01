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

interface UniverPreviewProps {
  workbookData: any;
  loading?: boolean;
  error?: string | null;
  /** Called when user edits a cell: (sheetName, row0based, col0based, newValue) */
  onCellEdit?: (sheetName: string, row: number, col: number, value: number | string) => void;
}

export default function UniverPreview({ workbookData, loading, error, onCellEdit }: UniverPreviewProps) {
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

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full min-h-0 rounded-lg border border-border bg-white"
    />
  );
}
