"use client";

/**
 * UniverSpreadsheet — Google Sheets-like spreadsheet powered by Univer.
 *
 * Replaces WorkbookShell for LED Cost Sheet + Margin Analysis with live
 * formula recalculation, proper formatting, and full spreadsheet UX.
 */

import React, { useEffect, useRef, useState } from "react";
import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";
import type { PricingDisplay, PricingSummary } from "./rfpWorkbookBuilder";

// CSS must be imported here (inside ssr:false dynamic component), not in the parent
import "@univerjs/preset-sheets-core/lib/index.css";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface UniverSpreadsheetProps {
  screens: ExtractedLEDSpec[];
  pricingDisplays: PricingDisplay[];
  pricingSummary: PricingSummary | null;
  availableProducts?: Array<{ id: string; label: string; pitch: number; name: string }>;
  onSpecEdit?: (screenIdx: number, field: string, value: number) => void;
  onPricingEdit?: (displayIdx: number, field: string, value: number) => void;
  onMarginAnalysisEdit?: (itemIdx: number, field: string, value: number) => void;
  onProductSelect?: (displayName: string, productId: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const NAVY = "#002C73";
const LIGHT_GRAY = "#F3F4F6";
const WHITE = "#FFFFFF";
const GREEN = "#059669";
const AMBER = "#D97706";
const RED = "#DC2626";

// Univer style property shortcuts
const HEADER_STYLE = {
  bg: { rgb: NAVY },
  cl: { rgb: WHITE },
  bl: 1 as const,
  fs: 11,
  ht: 2 as const, // center
};

const BOLD_STYLE = { bl: 1 as const };
const TOTAL_STYLE = {
  bl: 1 as const,
  bg: { rgb: LIGHT_GRAY },
};
const CURRENCY_FMT = { n: { pattern: '$#,##0' } };
const CURRENCY_FMT_2 = { n: { pattern: '$#,##0.00' } };
const PERCENT_FMT = { n: { pattern: '0.0%' } };
const NUMBER_FMT = { n: { pattern: '#,##0' } };
const NUMBER_FMT_2 = { n: { pattern: '#,##0.00' } };

// ---------------------------------------------------------------------------
// Build IWorkbookData from props
// ---------------------------------------------------------------------------

function buildWorkbookData(props: UniverSpreadsheetProps) {
  const { screens, pricingDisplays, pricingSummary } = props;
  const styles: Record<string, any> = {
    header: HEADER_STYLE,
    bold: BOLD_STYLE,
    total: TOTAL_STYLE,
    currency: { ...CURRENCY_FMT, ht: 3 },
    currency2: { ...CURRENCY_FMT_2, ht: 3 },
    percent: { ...PERCENT_FMT, ht: 2 },
    number: { ...NUMBER_FMT, ht: 3 },
    number2: { ...NUMBER_FMT_2, ht: 3 },
    headerCurrency: { ...HEADER_STYLE, ...CURRENCY_FMT },
    totalCurrency: { ...TOTAL_STYLE, ...CURRENCY_FMT, ht: 3 },
    totalPercent: { ...TOTAL_STYLE, ...PERCENT_FMT, ht: 2 },
    totalNumber: { ...TOTAL_STYLE, ...NUMBER_FMT, ht: 3 },
    editable: { bg: { rgb: WHITE } },
    readonly: { bg: { rgb: LIGHT_GRAY } },
    marginGreen: { ...PERCENT_FMT, ht: 2, cl: { rgb: GREEN } },
    marginAmber: { ...PERCENT_FMT, ht: 2, cl: { rgb: AMBER } },
    marginRed: { ...PERCENT_FMT, ht: 2, cl: { rgb: RED } },
  };

  // === SHEET 0: LED Cost Sheet ===
  const ledCols = [
    "Display", "Vendor", "Product", "Pitch (mm)",
    "H (ft)", "W (ft)", "H (px)", "W (px)",
    "SqFt/Screen", "Qty", "Total SqFt",
    "NITs", "Service",
    "$/SqFt", "Display Cost", "Processor", "Shipping", "Total Cost",
    "Margin %", "Selling Price",
  ];

  const ledColWidths: Record<number, { w: number }> = {
    0: { w: 140 }, // Display
    1: { w: 80 },  // Vendor
    2: { w: 130 }, // Product
    3: { w: 70 },  // Pitch
    4: { w: 60 },  // H(ft)
    5: { w: 60 },  // W(ft)
    6: { w: 60 },  // H(px)
    7: { w: 60 },  // W(px)
    8: { w: 85 },  // SqFt/Screen
    9: { w: 45 },  // Qty
    10: { w: 80 }, // Total SqFt
    11: { w: 55 }, // NITs
    12: { w: 70 }, // Service
    13: { w: 75 }, // $/SqFt
    14: { w: 100 }, // Display Cost
    15: { w: 85 },  // Processor
    16: { w: 80 },  // Shipping
    17: { w: 100 }, // Total Cost
    18: { w: 75 },  // Margin %
    19: { w: 100 }, // Selling Price
  };

  // Header row (row 0)
  const ledCellData: Record<number, Record<number, any>> = {};
  ledCellData[0] = {};
  ledCols.forEach((label, ci) => {
    ledCellData[0][ci] = { v: label, s: "header" };
  });

  // Data rows (row 1..N)
  screens.forEach((spec, si) => {
    const row = si + 1;
    const pd = pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;

    const hasOverride = mp?.activeWidthFt && mp?.activeHeightFt;
    const h = hasOverride ? mp.activeHeightFt! : (spec.heightFt ?? 0);
    const w = hasOverride ? mp.activeWidthFt! : (spec.widthFt ?? 0);
    const pitch = (hasOverride && mp.pitch) ? mp.pitch : (spec.pixelPitchMm ?? 0);
    const hPx = hasOverride && mp.resolutionY ? mp.resolutionY : (spec.heightPx ?? (pitch > 0 ? Math.round(h * 304.8 / pitch) : 0));
    const wPx = hasOverride && mp.resolutionX ? mp.resolutionX : (spec.widthPx ?? (pitch > 0 ? Math.round(w * 304.8 / pitch) : 0));
    const qty = spec.quantity || 1;

    // sqft formula references
    const hCell = `E${row + 1}`;
    const wCell = `F${row + 1}`;
    const qtyCell = `J${row + 1}`;

    const pricingSqFt = pd?.areaSqFt ?? 0;
    const pricingTotalSqFt = pricingSqFt * qty;
    const ratePerSqFt = pricingTotalSqFt > 0 ? (pd?.hardwareCost ?? 0) / pricingTotalSqFt : 0;

    const vendor = mp?.manufacturer ?? "";
    const productLabel = mp?.model ?? "";
    const nits = mp?.nits ?? spec.brightnessNits ?? null;

    ledCellData[row] = {
      0: { v: spec.name, s: "bold" },                                   // Display
      1: { v: vendor },                                                  // Vendor
      2: { v: productLabel || "" },                                      // Product
      3: { v: pitch > 0 ? pitch : "", s: "number2" },                   // Pitch
      4: { v: h > 0 ? Math.round(h * 100) / 100 : "", s: "number2" },  // H(ft) — EDITABLE
      5: { v: w > 0 ? Math.round(w * 100) / 100 : "", s: "number2" },  // W(ft) — EDITABLE
      6: { v: hPx > 0 ? hPx : "" },                                     // H(px)
      7: { v: wPx > 0 ? wPx : "" },                                     // W(px)
      8: { f: `=${hCell}*${wCell}`, s: "number2" },                      // SqFt/Screen = H * W
      9: { v: qty },                                                     // Qty — EDITABLE
      10: { f: `=I${row + 1}*${qtyCell}`, s: "number2" },               // Total SqFt = SqFt * Qty
      11: { v: nits ?? "" },                                             // NITs
      12: { v: spec.serviceType ?? "" },                                 // Service
      13: { v: ratePerSqFt > 0 ? ratePerSqFt : 0, s: "currency2" },    // $/SqFt
      14: { f: `=N${row + 1}*K${row + 1}`, s: "currency" },            // Display Cost = $/SqFt * TotalSqFt — EDITABLE
      15: { v: pd?.processorCost ?? 0, s: "currency" },                 // Processor — EDITABLE
      16: { v: pd?.shippingCost ?? 0, s: "currency" },                  // Shipping — EDITABLE
      17: { f: `=O${row + 1}+P${row + 1}+Q${row + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT, ht: 3 } }, // Total Cost
      18: { v: pd?.blendedMarginPct ?? 0, s: getMarginStyle(pd?.blendedMarginPct ?? 0) }, // Margin % — EDITABLE
      19: { f: `=IF(S${row + 1}>0,R${row + 1}/(1-S${row + 1}),R${row + 1})`, s: { ...BOLD_STYLE, ...CURRENCY_FMT, ht: 3 } }, // Selling Price
    };
  });

  // Total row
  const totalRowIdx = screens.length + 1;
  const dataRange = screens.length > 0 ? `${2}:${screens.length + 1}` : "2:2";
  const firstDataRow = 2;
  const lastDataRow = screens.length + 1;

  ledCellData[totalRowIdx] = {
    0: { v: `TOTAL (${screens.length} displays)`, s: "total" },
    1: { v: "", s: "total" },
    2: { v: "", s: "total" },
    3: { v: "", s: "total" },
    4: { v: "", s: "total" },
    5: { v: "", s: "total" },
    6: { v: "", s: "total" },
    7: { v: "", s: "total" },
    8: { v: "", s: "total" },
    9: { v: "", s: "total" },
    10: { f: screens.length > 0 ? `=SUM(K${firstDataRow}:K${lastDataRow})` : "=0", s: "totalNumber" },
    11: { v: "", s: "total" },
    12: { v: "", s: "total" },
    13: { v: "", s: "total" },
    14: { f: screens.length > 0 ? `=SUM(O${firstDataRow}:O${lastDataRow})` : "=0", s: "totalCurrency" },
    15: { f: screens.length > 0 ? `=SUM(P${firstDataRow}:P${lastDataRow})` : "=0", s: "totalCurrency" },
    16: { f: screens.length > 0 ? `=SUM(Q${firstDataRow}:Q${lastDataRow})` : "=0", s: "totalCurrency" },
    17: { f: screens.length > 0 ? `=SUM(R${firstDataRow}:R${lastDataRow})` : "=0", s: "totalCurrency" },
    18: { f: screens.length > 0 ? `=IF(T${totalRowIdx + 1}>0,(T${totalRowIdx + 1}-R${totalRowIdx + 1})/T${totalRowIdx + 1},0)` : "=0", s: "totalPercent" },
    19: { f: screens.length > 0 ? `=SUM(T${firstDataRow}:T${lastDataRow})` : "=0", s: "totalCurrency" },
  };

  // === SHEET 1: Margin Analysis ===
  const maCols = ["Line Item", "Cost", "Selling Price", "Margin $", "Margin %"];
  const maColWidths: Record<number, { w: number }> = {
    0: { w: 200 },
    1: { w: 120 },
    2: { w: 120 },
    3: { w: 120 },
    4: { w: 100 },
  };

  const maCellData: Record<number, Record<number, any>> = {};
  // Header
  maCellData[0] = {};
  maCols.forEach((label, ci) => {
    maCellData[0][ci] = { v: label, s: "header" };
  });

  let maRow = 1;
  const nonCustomDisplays = pricingDisplays.filter((d) => !d.isCustom);
  const customDisplays = pricingDisplays.filter((d) => d.isCustom);

  // LED displays
  const maDisplayStartRow = maRow;
  for (const d of nonCustomDisplays) {
    const r = maRow;
    const ledTotal = d.hardwareCost + (d.processorCost ?? 0) + (d.shippingCost ?? 0);

    // Cost cell references the LED Cost Sheet
    // Cross-sheet: ='LED Cost Sheet'!R{row} where row = display index + 2
    const ledSheetRow = screens.findIndex((s) => s.name === d.name) + 2;
    const costRef = ledSheetRow > 1 ? `='LED Cost Sheet'!R${ledSheetRow}` : "";

    maCellData[r] = {
      0: { v: d.name, s: "bold" },
      1: { v: ledTotal, s: "currency" },                                   // Cost — EDITABLE
      2: { f: `=IF(E${r + 1}>0,B${r + 1}/(1-E${r + 1}),B${r + 1})`, s: "currency" }, // Selling = Cost/(1-Margin)
      3: { f: `=C${r + 1}-B${r + 1}`, s: "currency" },                    // Margin$ = Selling - Cost
      4: { v: d.blendedMarginPct, s: getMarginStyle(d.blendedMarginPct) }, // Margin % — EDITABLE
    };
    maRow++;
  }

  // Service categories
  const serviceCategories = [
    { label: "Structural Materials", field: "structuralCost" },
    { label: "Installation Labor", field: "installCost" },
    { label: "PM / Gen. Conditions", field: "pmCost" },
    { label: "Engineering / Permits", field: "engCost" },
  ];

  const defaultServiceMargin = pricingDisplays[0]?.blendedMarginPct ?? 0.10;

  for (const cat of serviceCategories) {
    const cost = pricingDisplays.reduce((s, d) => s + ((d as any)[cat.field] ?? 0), 0);
    if (cost === 0) continue;
    const r = maRow;
    maCellData[r] = {
      0: { v: cat.label, s: "bold" },
      1: { v: cost, s: "currency" },
      2: { f: `=IF(E${r + 1}>0,B${r + 1}/(1-E${r + 1}),B${r + 1})`, s: "currency" },
      3: { f: `=C${r + 1}-B${r + 1}`, s: "currency" },
      4: { v: defaultServiceMargin, s: getMarginStyle(defaultServiceMargin) },
    };
    maRow++;
  }

  // CMS placeholder
  maCellData[maRow] = {
    0: { v: "CMS (Content Management System)", s: "bold" },
    1: { v: 0, s: "currency" },
    2: { f: `=IF(E${maRow + 1}>0,B${maRow + 1}/(1-E${maRow + 1}),B${maRow + 1})`, s: "currency" },
    3: { f: `=C${maRow + 1}-B${maRow + 1}`, s: "currency" },
    4: { v: 0.10, s: "marginAmber" },
  };
  maRow++;

  // Scoring placeholder
  maCellData[maRow] = {
    0: { v: "Scoring System", s: "bold" },
    1: { v: 0, s: "currency" },
    2: { f: `=IF(E${maRow + 1}>0,B${maRow + 1}/(1-E${maRow + 1}),B${maRow + 1})`, s: "currency" },
    3: { f: `=C${maRow + 1}-B${maRow + 1}`, s: "currency" },
    4: { v: 0.10, s: "marginAmber" },
  };
  maRow++;

  // Custom line items
  for (const d of customDisplays) {
    const r = maRow;
    const cost = d.hardwareCost + (d.installCost ?? 0) + (d.structuralCost ?? 0) + (d.pmCost ?? 0) + (d.engCost ?? 0);
    maCellData[r] = {
      0: { v: d.name, s: { bl: 1, cl: { rgb: "#2563EB" } } },
      1: { v: cost, s: "currency" },
      2: { f: `=IF(E${r + 1}>0,B${r + 1}/(1-E${r + 1}),B${r + 1})`, s: "currency" },
      3: { f: `=C${r + 1}-B${r + 1}`, s: "currency" },
      4: { v: d.blendedMarginPct, s: getMarginStyle(d.blendedMarginPct) },
    };
    maRow++;
  }

  // Total row
  const maTotalRow = maRow;
  maCellData[maTotalRow] = {
    0: { v: "TOTAL", s: "total" },
    1: { f: `=SUM(B${maDisplayStartRow + 1}:B${maTotalRow})`, s: "totalCurrency" },
    2: { f: `=SUM(C${maDisplayStartRow + 1}:C${maTotalRow})`, s: "totalCurrency" },
    3: { f: `=C${maTotalRow + 1}-B${maTotalRow + 1}`, s: "totalCurrency" },
    4: { f: `=IF(C${maTotalRow + 1}>0,(C${maTotalRow + 1}-B${maTotalRow + 1})/C${maTotalRow + 1},0)`, s: "totalPercent" },
  };

  // Freeze header row
  const freeze = { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 };

  return {
    id: "rfp-workbook",
    name: "RFP Scoping Workbook",
    appVersion: "1.0.0",
    locale: "EN_US" as any,
    styles,
    sheetOrder: ["led-cost-sheet", "margin-analysis"],
    sheets: {
      "led-cost-sheet": {
        id: "led-cost-sheet",
        name: "LED Cost Sheet",
        tabColor: "#0A52EF",
        rowCount: Math.max(totalRowIdx + 5, 50),
        columnCount: 20,
        defaultColumnWidth: 80,
        defaultRowHeight: 28,
        freeze,
        cellData: ledCellData,
        columnData: ledColWidths,
        mergeData: [],
        showGridlines: 1,
      },
      "margin-analysis": {
        id: "margin-analysis",
        name: "Margin Analysis",
        tabColor: "#217346",
        rowCount: Math.max(maTotalRow + 5, 30),
        columnCount: 5,
        defaultColumnWidth: 120,
        defaultRowHeight: 28,
        freeze,
        cellData: maCellData,
        columnData: maColWidths,
        mergeData: [],
        showGridlines: 1,
      },
    },
  };
}

function getMarginStyle(margin: number): string | Record<string, any> {
  if (margin >= 0.25) return "marginGreen";
  if (margin >= 0.15) return "marginAmber";
  return "marginRed";
}

// ---------------------------------------------------------------------------
// Component (rendered inside dynamic wrapper)
// ---------------------------------------------------------------------------

function UniverSpreadsheetInner(props: UniverSpreadsheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const propsRef = useRef(props);
  propsRef.current = props; // Always current
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build workbook data from current props
  const workbookDataRef = useRef(buildWorkbookData(props));

  // Initialize Univer — runs once on mount
  useEffect(() => {
    console.log("[UniverSpreadsheet] MOUNTED — useEffect running");
    let disposed = false;

    async function init() {
      const el = containerRef.current;
      console.log("[UniverSpreadsheet] init() called, container:", el, "dimensions:", el?.offsetWidth, "x", el?.offsetHeight);
      if (!el || disposed) {
        console.warn("[UniverSpreadsheet] init() aborted — no container or disposed");
        return;
      }

      try {
        console.log("[UniverSpreadsheet] importing @univerjs/presets...");
        const { createUniver, LocaleType, mergeLocales } = await import("@univerjs/presets");
        console.log("[UniverSpreadsheet] importing @univerjs/preset-sheets-core...");
        const { UniverSheetsCorePreset } = await import("@univerjs/preset-sheets-core");
        const localeModule = await import("@univerjs/preset-sheets-core/locales/en-US");
        const UniverPresetSheetsCoreEnUS = localeModule.default;
        console.log("[UniverSpreadsheet] all imports loaded successfully");

        if (disposed) return;

        // Univer needs a container with non-zero dimensions.
        // Force a layout pass so the container has real pixel size.
        await new Promise((r) => requestAnimationFrame(r));
        console.log("[UniverSpreadsheet] post-rAF dimensions:", el.offsetWidth, "x", el.offsetHeight);
        if (disposed || !el.offsetHeight) {
          console.warn("[UniverSpreadsheet] aborted — container has zero height:", el.offsetHeight);
          return;
        }

        console.log("[UniverSpreadsheet] calling createUniver...");
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
        console.log("[UniverSpreadsheet] createUniver succeeded, univerAPI:", !!univerAPI);

        if (disposed) {
          univerAPI.dispose();
          return;
        }

        apiRef.current = univerAPI;

        // Create workbook with pre-built data
        console.log("[UniverSpreadsheet] creating workbook with", Object.keys(workbookDataRef.current.sheets).length, "sheets");
        univerAPI.createWorkbook(workbookDataRef.current);
        console.log("[UniverSpreadsheet] workbook created successfully");

        // Listen for cell value changes
        univerAPI.addEvent(univerAPI.Event.SheetValueChanged, (params: any) => {
          handleValueChanged(params, propsRef);
        });

        setReady(true);
      } catch (err: any) {
        console.error("[UniverSpreadsheet] init error:", err);
        setError(err?.message || "Failed to initialize spreadsheet");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update cell values when props change (without re-creating the workbook)
  useEffect(() => {
    if (!ready || !apiRef.current) return;
    const api = apiRef.current;
    const wb = api.getActiveWorkbook?.();
    if (!wb) return;

    const newData = buildWorkbookData(props);

    // Update LED Cost Sheet
    const ledSheet = wb.getSheetByName("LED Cost Sheet");
    if (ledSheet && props.screens.length > 0) {
      const ledCellData = newData.sheets["led-cost-sheet"]?.cellData;
      if (ledCellData) {
        for (let si = 0; si < props.screens.length; si++) {
          const rowData = ledCellData[si + 1];
          if (!rowData) continue;
          for (const [colStr, cellObj] of Object.entries(rowData)) {
            const col = parseInt(colStr, 10);
            if (cellObj && cellObj.v !== undefined && !cellObj.f) {
              try {
                const range = ledSheet.getRange(si + 1, col, si + 1, col);
                range?.setValue(cellObj.v);
              } catch { /* cell may be formula */ }
            }
          }
        }
      }
    }

    // Update Margin Analysis
    const maSheet = wb.getSheetByName("Margin Analysis");
    if (maSheet) {
      const maCellData = newData.sheets["margin-analysis"]?.cellData;
      if (maCellData) {
        for (const [rowStr, rowData] of Object.entries(maCellData)) {
          const row = parseInt(rowStr, 10);
          if (row === 0) continue; // skip header
          for (const [colStr, cellObj] of Object.entries(rowData as Record<string, any>)) {
            const col = parseInt(colStr, 10);
            if (cellObj && cellObj.v !== undefined && !cellObj.f) {
              try {
                const range = maSheet.getRange(row, col, row, col);
                range?.setValue(cellObj.v);
              } catch { /* ignore */ }
            }
          }
        }
      }
    }
  }, [ready, props.screens, props.pricingDisplays, props.pricingSummary]);

  if (error) {
    return (
      <div className={props.className} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#DC2626", fontSize: 13 }}>
        Spreadsheet error: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
}

// ---------------------------------------------------------------------------
// Value change handler — dispatches to parent callbacks
// ---------------------------------------------------------------------------

function handleValueChanged(params: any, propsRef: React.MutableRefObject<UniverSpreadsheetProps>) {
  if (!params?.effectedRanges?.length) return;
  const props = propsRef.current;

  for (const fRange of params.effectedRanges) {
    const sheetId = fRange.getSheetId?.();
    const row = fRange.getRow?.();
    const column = fRange.getColumn?.();
    if (row == null || column == null) continue;

    // Get the raw value from the range
    let numValue = 0;
    try {
      const val = fRange.getValue?.();
      if (typeof val === "number") {
        numValue = val;
      } else if (val != null) {
        numValue = parseFloat(String(val)) || 0;
      }
    } catch { /* ignore */ }

    if (sheetId === "led-cost-sheet") {
      const screenIdx = row - 1; // row 0 is header
      if (screenIdx < 0 || screenIdx >= props.screens.length) continue;

      // LED Cost Sheet editable columns: H(ft)=4, W(ft)=5, Qty=9, DisplayCost=14, Processor=15, Shipping=16, Margin%=18
      const specFieldMap: Record<number, string> = { 4: "heightFt", 5: "widthFt", 9: "quantity" };
      const pricingFieldMap: Record<number, string> = { 14: "hardwareCost", 15: "processorCost", 16: "shippingCost" };

      if (specFieldMap[column]) {
        props.onSpecEdit?.(screenIdx, specFieldMap[column], numValue);
      } else if (pricingFieldMap[column]) {
        props.onPricingEdit?.(screenIdx, pricingFieldMap[column], numValue);
      } else if (column === 18) {
        let margin = numValue;
        if (margin > 1) margin = margin / 100;
        props.onPricingEdit?.(screenIdx, "blendedMarginPct", margin);
      }
    } else if (sheetId === "margin-analysis") {
      const itemIdx = row - 1; // row 0 is header
      if (itemIdx < 0) continue;

      if (column === 1) {
        props.onMarginAnalysisEdit?.(itemIdx, "cost", numValue);
      } else if (column === 4) {
        let margin = numValue;
        if (margin > 1) margin = margin / 100;
        props.onMarginAnalysisEdit?.(itemIdx, "marginPct", margin);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Export (the inner component is what gets dynamically imported)
// ---------------------------------------------------------------------------

export default UniverSpreadsheetInner;
