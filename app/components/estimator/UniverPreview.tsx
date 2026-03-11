"use client";

/**
 * UniverPreview — Lightweight Univer spreadsheet wrapper for the Budget Estimator.
 *
 * Renders IWorkbookData from /api/estimator/preview-univer as a live spreadsheet
 * with formula recalculation, cell editing, and sheet tabs.
 *
 * Separate from the RFP Analyzer's UniverSpreadsheet.tsx (which has RFP-specific logic).
 */

import React, { useRef, useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface UniverPreviewProps {
  workbookData: any;
  loading?: boolean;
  error?: string | null;
}

export default function UniverPreview({ workbookData, loading, error }: UniverPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const workbookDataRef = useRef(workbookData);
  workbookDataRef.current = workbookData;

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

      // Dispose previous instance
      if (apiRef.current) {
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

        // Univer needs a container with non-zero dimensions
        await new Promise((r) => requestAnimationFrame(r));
        if (disposed || !el.offsetHeight) return;

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
      className="flex-1 w-full h-full min-h-0 rounded-lg overflow-hidden border border-border bg-white"
    />
  );
}
