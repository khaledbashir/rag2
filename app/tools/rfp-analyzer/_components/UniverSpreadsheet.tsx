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

// NOTE: Univer CSS is loaded via a <link> tag at runtime (see init() below).
// We CANNOT use `import "@univerjs/preset-sheets-core/lib/index.css"` anywhere —
// even inside useEffect — because Next.js/webpack hoists CSS imports into the SSR
// bundle, causing React hydration error #418. The CSS lives at /univer-sheets.css.

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface UniverSpreadsheetProps {
  screens: ExtractedLEDSpec[];
  pricingDisplays: PricingDisplay[];
  pricingSummary: PricingSummary | null;
  // Mirror Mode pricing data from Excel uploads
  pricingDocument?: {
    tables: Array<{
      name: string;
      items: Array<{
        description: string;
        cost: number | null;
        sellingPrice: number;
        isHidden?: boolean;
      }>;
      subtotal?: number;
      tax?: { label: string; amount: number };
      bond?: number;
      grandTotal?: number;
      isAlternateSection?: boolean;
      alternates?: Array<{ description: string; priceDifference: number }>;
    }>;
    documentTotal?: number;
    projectName?: string;
  };
  // Project info for Project Summary sheet
  projectInfo?: {
    projectName?: string;
    clientName?: string;
    venue?: string;
    location?: string;
    documentMode?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  // Internal audit data for Tech Specs
  internalAudit?: {
    perScreen?: Array<{
      quantity?: number;
      pixelMatrix?: string;
      pixelResolution?: string;
      brightnessNits?: number;
      estimatedWeightLbs?: number;
      totalMaxPowerW?: number;
    }>;
    totals?: any;
  };
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
// Build IWorkbookData from props — matches exportMirrorUglySheetExcel.ts layout
// ---------------------------------------------------------------------------

function buildWorkbookData(props: UniverSpreadsheetProps) {
  const { screens, pricingDisplays, pricingSummary, pricingDocument, projectInfo, internalAudit } = props;
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
    sectionHeader: { bg: { rgb: NAVY }, cl: { rgb: WHITE }, bl: 1, ht: 2 },
    italic: { it: 1, cl: { rgb: "#6C757D" } },
  };

  const freeze = { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 };
  const sheets: Record<string, any> = {};
  const sheetOrder: string[] = [];

  // === SHEET 0: Project Summary ===
  sheetOrder.push("project-summary");
  const psCellData: Record<number, Record<number, any>> = {};
  const projectName = projectInfo?.projectName || projectInfo?.clientName || "Untitled Project";
  
  psCellData[0] = { 0: { v: projectName, s: { bl: 1, fs: 16 } } };
  psCellData[1] = { 0: { v: "ANC LED Display Proposal", s: { it: 1, cl: { rgb: "#6C757D" } } } };
  
  const summaryFields: [string, any][] = [
    ["Project Name", projectName],
    ["Client", projectInfo?.clientName || "—"],
    ["Venue", projectInfo?.venue || "—"],
    ["Location", projectInfo?.location || "—"],
    ["Document Type", (projectInfo?.documentMode || "BUDGET").replace(/_/g, " ")],
    ["Number of Displays", screens.length],
    ["Created", projectInfo?.createdAt || new Date().toLocaleDateString()],
    ["Revision Date", projectInfo?.updatedAt || new Date().toLocaleDateString()],
    ["Revised By", "ANC Studio"],
  ];
  
  let psRow = 3;
  for (const [label, value] of summaryFields) {
    psCellData[psRow] = {
      0: { v: label, s: { bl: 1, cl: { rgb: "#374151" } } },
      1: { v: value },
    };
    psRow++;
  }
  
  // Document Total with cross-sheet formula
  psRow++;
  psCellData[psRow] = {
    0: { v: "Document Total", s: { bl: 1, fs: 12 } },
    1: { f: "='Margin Analysis'!C" + (getMarginAnalysisTotalRow(pricingDocument, pricingDisplays) + 1), s: { bl: 1, fs: 12, ...CURRENCY_FMT } },
  };
  
  const psColWidths: Record<number, { w: number }> = {
    0: { w: 180 }, 1: { w: 450 }, 2: { w: 120 }, 3: { w: 120 },
  };

  sheets["project-summary"] = {
    id: "project-summary",
    name: "Project Summary",
    tabColor: "#217346",
    rowCount: 20,
    columnCount: 10,
    defaultColumnWidth: 120,
    defaultRowHeight: 28,
    cellData: psCellData,
    columnData: psColWidths,
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 1: LED Cost Sheet — full 20 columns ===
  sheetOrder.push("led-cost-sheet");
  const ledCols = [
    "Display", "Vendor", "Product", "Pitch (mm)",
    "H (ft)", "W (ft)", "H (px)", "W (px)",
    "SqFt/Screen", "Qty", "Total SqFt",
    "NITs", "Service", "$/SqFt", "Display Cost", "Processor", "Shipping", "Total Cost",
    "Margin %", "Selling Price", "Weight (lbs)", "Power (W)", "BTU/hr",
  ];

  const ledColWidths: Record<number, { w: number }> = {
    0: { w: 200 }, 1: { w: 90 }, 2: { w: 140 }, 3: { w: 75 },
    4: { w: 65 }, 5: { w: 65 }, 6: { w: 65 }, 7: { w: 65 },
    8: { w: 90 }, 9: { w: 50 }, 10: { w: 85 }, 11: { w: 60 },
    12: { w: 70 }, 13: { w: 75 }, 14: { w: 100 }, 15: { w: 85 },
    16: { w: 80 }, 17: { w: 100 }, 18: { w: 75 }, 19: { w: 100 },
    20: { w: 90 }, 21: { w: 90 }, 22: { w: 80 },
  };

  const ledCellData: Record<number, Record<number, any>> = {};
  ledCellData[0] = {};
  ledCols.forEach((label, ci) => {
    ledCellData[0][ci] = { v: label, s: "header" };
  });

  // Build lookup from pricingDocument for Mirror Mode (when pricingDisplays is empty)
  const pricingDocLookup: Record<string, { sellingPrice: number; cost: number | null }> = {};
  if (pricingDocument?.tables) {
    for (const table of pricingDocument.tables) {
      for (const item of (table.items || [])) {
        if (item.description && !item.isHidden) {
          pricingDocLookup[item.description.toLowerCase()] = {
            sellingPrice: item.sellingPrice || 0,
            cost: item.cost ?? null,
          };
        }
      }
    }
  }

  screens.forEach((spec, si) => {
    const row = si + 1;
    const pd = pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    const audit = internalAudit?.perScreen?.[si];
    
    // For Mirror Mode: look up pricing from pricingDocument
    const docPricing = pricingDocLookup[spec.name?.toLowerCase() || ""];

    const hasOverride = mp?.activeWidthFt && mp?.activeHeightFt;
    const h = hasOverride ? mp.activeHeightFt! : (spec.heightFt ?? 0);
    const w = hasOverride ? mp.activeWidthFt! : (spec.widthFt ?? 0);
    const pitch = (hasOverride && mp.pitch) ? mp.pitch : (spec.pixelPitchMm ?? 0);
    const hPx = hasOverride && mp.resolutionY ? mp.resolutionY : (spec.heightPx ?? (pitch > 0 ? Math.round(h * 304.8 / pitch) : 0));
    const wPx = hasOverride && mp.resolutionX ? mp.resolutionX : (spec.widthPx ?? (pitch > 0 ? Math.round(w * 304.8 / pitch) : 0));
    const qty = audit?.quantity || spec.quantity || 1;

    const pricingSqFt = pd?.areaSqFt ?? (h * w);
    const pricingTotalSqFt = pricingSqFt * qty;
    const ratePerSqFt = pricingTotalSqFt > 0 ? (pd?.hardwareCost ?? 0) / pricingTotalSqFt : 0;
    const weight = audit?.estimatedWeightLbs ?? mp?.totalWeightLbs ?? 0;
    const power = audit?.totalMaxPowerW ?? mp?.totalMaxPowerW ?? 0;
    
    // Back-calculate margin from known selling price so formula =Cost/(1-Margin) is accurate
    const sellingPrice = docPricing?.sellingPrice ?? pd?.totalSellingPrice ?? 0;
    const totalCostKnown = (pd?.hardwareCost ?? 0) + (pd?.processorCost ?? 0) + (pd?.shippingCost ?? 0);
    const marginPct = (sellingPrice > 0 && totalCostKnown > 0)
      ? 1 - totalCostKnown / sellingPrice
      : (pd?.blendedMarginPct ?? 0.30);
    
    // Debug: log Mirror Mode pricing resolution
    if (si === 0) {
      console.log("[UniverSpreadsheet] LED Cost Sheet row 0 pricing:", {
        specName: spec.name,
        docPricing,
        pdTotalSellingPrice: pd?.totalSellingPrice,
        resolvedSellingPrice: sellingPrice,
        marginPct,
      });
    }

    const hCell = `E${row + 1}`;
    const wCell = `F${row + 1}`;
    const qtyCell = `J${row + 1}`;

    ledCellData[row] = {
      0: { v: spec.name, s: "bold" },
      1: { v: mp?.manufacturer ?? "" },
      2: { v: mp?.model ?? "" },
      3: { v: pitch > 0 ? pitch : "", s: "number2" },
      4: { v: h > 0 ? Math.round(h * 100) / 100 : "", s: "number2" },
      5: { v: w > 0 ? Math.round(w * 100) / 100 : "", s: "number2" },
      6: { v: hPx > 0 ? hPx : "" },
      7: { v: wPx > 0 ? wPx : "" },
      8: { f: `=${hCell}*${wCell}`, s: "number2" },
      9: { v: qty },
      10: { f: `=I${row + 1}*${qtyCell}`, s: "number2" },
      11: { v: mp?.nits ?? spec.brightnessNits ?? "" },
      12: { v: spec.serviceType ?? "" },
      13: { v: ratePerSqFt > 0 ? ratePerSqFt : 0, s: "currency2" },
      14: { f: `=N${row + 1}*K${row + 1}`, s: "currency" },
      15: { v: pd?.processorCost ?? 0, s: "currency" },
      16: { v: pd?.shippingCost ?? 0, s: "currency" },
      17: { f: `=O${row + 1}+P${row + 1}+Q${row + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT, ht: 3 } },
      18: { v: marginPct, s: getMarginStyle(marginPct) },
      19: { f: `=IF(S${row + 1}>0,R${row + 1}/(1-S${row + 1}),R${row + 1})`, s: { ...BOLD_STYLE, ...CURRENCY_FMT, ht: 3 } },
      20: { v: weight, s: "number" },
      21: { v: power, s: "number" },
      22: { f: power > 0 ? `=V${row + 1}*3.412` : "", s: "number" },
    };
  });

  const totalRowIdx = screens.length + 1;
  const firstDataRow = 2;
  const lastDataRow = screens.length + 1;

  ledCellData[totalRowIdx] = {
    0: { v: `TOTAL (${screens.length} displays)`, s: "total" },
    1: { v: "", s: "total" }, 2: { v: "", s: "total" }, 3: { v: "", s: "total" },
    4: { v: "", s: "total" }, 5: { v: "", s: "total" }, 6: { v: "", s: "total" }, 7: { v: "", s: "total" },
    8: { v: "", s: "total" }, 9: { v: "", s: "total" }, 10: { f: screens.length > 0 ? `=SUM(K${firstDataRow}:K${lastDataRow})` : "=0", s: "totalNumber" },
    11: { v: "", s: "total" }, 12: { v: "", s: "total" },
    13: { v: "", s: "total" },
    14: { f: screens.length > 0 ? `=SUM(O${firstDataRow}:O${lastDataRow})` : "=0", s: "totalCurrency" },
    15: { f: screens.length > 0 ? `=SUM(P${firstDataRow}:P${lastDataRow})` : "=0", s: "totalCurrency" },
    16: { f: screens.length > 0 ? `=SUM(Q${firstDataRow}:Q${lastDataRow})` : "=0", s: "totalCurrency" },
    17: { f: screens.length > 0 ? `=SUM(R${firstDataRow}:R${lastDataRow})` : "=0", s: "totalCurrency" },
    18: { f: screens.length > 0 ? `=IF(T${totalRowIdx + 1}>0,(T${totalRowIdx + 1}-R${totalRowIdx + 1})/T${totalRowIdx + 1},0)` : "=0", s: "totalPercent" },
    19: { f: screens.length > 0 ? `=SUM(T${firstDataRow}:T${lastDataRow})` : "=0", s: "totalCurrency" },
    20: { f: screens.length > 0 ? `=SUM(U${firstDataRow}:U${lastDataRow})` : "=0", s: "totalNumber" },
    21: { f: screens.length > 0 ? `=SUM(V${firstDataRow}:V${lastDataRow})` : "=0", s: "totalNumber" },
    22: { f: screens.length > 0 ? `=SUM(W${firstDataRow}:W${lastDataRow})` : "=0", s: "totalNumber" },
  };

  sheets["led-cost-sheet"] = {
    id: "led-cost-sheet",
    name: "LED Cost Sheet",
    tabColor: "#0A52EF",
    rowCount: Math.max(totalRowIdx + 5, 50),
    columnCount: 26,
    defaultColumnWidth: 80,
    defaultRowHeight: 28,
    freeze,
    cellData: ledCellData,
    columnData: ledColWidths,
    mergeData: [],
    showGridlines: 1,
  };

  // === SHEET 2: Margin Analysis — per-section layout matching exportMirrorUglySheetExcel.ts ===
  sheetOrder.push("margin-analysis");
  const maCellData: Record<number, Record<number, any>> = {};
  const maColWidths: Record<number, { w: number }> = {
    0: { w: 320 }, 1: { w: 130 }, 2: { w: 130 }, 3: { w: 130 }, 4: { w: 100 }, 5: { w: 130 },
  };

  let maRow = 0;
  // Title rows
  maCellData[maRow++] = { 0: { v: `Project Name: ${projectName}`, s: { bl: 1 } } };
  maCellData[maRow++] = { 0: { v: `Revision Date: ${new Date().toLocaleDateString()}` } };
  maCellData[maRow++] = { 0: { v: "Revised By: ANC Studio" } };
  maCellData[maRow++] = { 0: { v: `${projectName} Margin Analysis`, s: { bl: 1, fs: 12 } } };
  maRow++; // blank row

  // Use pricingDocument if available (Mirror Mode), otherwise build from pricingDisplays
  const pricingTables = pricingDocument?.tables || [];
  const hasPricingTables = pricingTables.length > 0 && pricingTables.some((t: any) => t.items?.length > 0);

  let marginDocTotalRow = 0;
  const subtotalCostRows: number[] = [];
  const grandTotalSellRows: number[] = [];

  if (hasPricingTables) {
    // Per-section layout from pricingDocument
    for (const table of pricingTables) {
      const items = (table.items || []).filter((item: any) => !item.isHidden);
      if (items.length === 0) continue;

      // Section header
      maCellData[maRow] = {
        0: { v: table.name || "Section", s: "sectionHeader" },
        1: { v: "Selling Price", s: "sectionHeader" },
      };
      maRow++;

      const firstItemRow = maRow;
      let sectionCostSum = 0;
      let sectionSellSum = 0;
      let hasCostData = false;

      for (const item of items) {
        const sell = item.sellingPrice || 0;
        const cost = item.cost ?? null;
        if (cost != null) { sectionCostSum += cost; hasCostData = true; }

        maCellData[maRow] = {
          0: { v: item.description || "" },
          1: { v: sell, s: "currency" },
          5: cost != null ? { v: cost, s: "currency" } : undefined,
        };
        sectionSellSum += sell;
        maRow++;
      }
      const lastItemRow = maRow - 1;

      // Subtotal row — track explicit indices for formula references
      const isAlternateSection = table.isAlternateSection === true || /\balternate/i.test(table.name || "");
      const subtotalIdx = maRow;
      if (!isAlternateSection) {
        if (hasCostData) subtotalCostRows.push(subtotalIdx);
        grandTotalSellRows.push(subtotalIdx + 3); // grand total is 3 rows after subtotal (sub, tax, bond, gt)
      }

      maCellData[subtotalIdx] = {
        0: { v: "SUBTOTAL", s: "bold" },
        1: hasCostData ? { f: `=SUM(F${firstItemRow + 1}:F${lastItemRow + 1})`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } } : undefined,
        2: { f: `=SUM(B${firstItemRow + 1}:B${lastItemRow + 1})`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
        3: hasCostData ? { f: `=C${subtotalIdx + 1}-B${subtotalIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } } : undefined,
        4: hasCostData ? { f: `=IF(C${subtotalIdx + 1}=0,0,D${subtotalIdx + 1}/C${subtotalIdx + 1})`, s: { ...BOLD_STYLE, ...PERCENT_FMT } } : undefined,
      };
      maRow++;

      // Tax row — live formula: =SUBTOTAL_SELL * TaxRate (rate stored in hidden col F)
      const taxAmount = table.tax?.amount || 0;
      const taxIdx = maRow;
      const taxRate = (sectionSellSum > 0 && taxAmount > 0) ? taxAmount / sectionSellSum : 0;
      maCellData[taxIdx] = {
        0: { v: table.tax?.label || "TAX" },
        2: taxRate > 0
          ? { f: `=C${subtotalIdx + 1}*F${taxIdx + 1}`, s: "currency" }
          : { v: taxAmount, s: "currency" },
        5: taxRate > 0 ? { v: taxRate } : undefined,
      };
      maRow++;

      // Bond row — live formula: =SUBTOTAL_SELL * BondRate (rate stored in hidden col F)
      const bondAmount = table.bond || 0;
      const bondIdx = maRow;
      const bondRate = (sectionSellSum > 0 && bondAmount > 0) ? bondAmount / sectionSellSum : 0;
      maCellData[bondIdx] = {
        0: { v: "BOND" },
        2: bondRate > 0
          ? { f: `=C${subtotalIdx + 1}*F${bondIdx + 1}`, s: "currency" }
          : { v: bondAmount, s: "currency" },
        5: bondRate > 0 ? { v: bondRate } : undefined,
      };
      maRow++;

      // Grand Total row — =SUBTOTAL+TAX+BOND with live cascading
      const grandTotalIdx = maRow;
      maCellData[grandTotalIdx] = {
        0: { v: "SUB TOTAL (BID FORM)", s: "bold" },
        1: hasCostData ? { f: `=B${subtotalIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } } : undefined,
        2: { f: `=C${subtotalIdx + 1}+C${taxIdx + 1}+C${bondIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
        3: hasCostData ? { f: `=C${grandTotalIdx + 1}-B${grandTotalIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } } : undefined,
        4: hasCostData ? { f: `=IF(C${grandTotalIdx + 1}=0,0,D${grandTotalIdx + 1}/C${grandTotalIdx + 1})`, s: { ...BOLD_STYLE, ...PERCENT_FMT } } : undefined,
      };
      maRow++;

      // Alternates
      const alternates = table.alternates || [];
      if (alternates.length > 0) {
        maCellData[maRow] = {
          0: { v: "Alternates - Add to Cost Above", s: { bl: 1, it: 1 } },
          1: { v: "Selling Price", s: { bl: 1, it: 1 } },
        };
        maRow++;
        for (const alt of alternates) {
          maCellData[maRow] = {
            0: { v: alt.description || "" },
            1: { v: alt.priceDifference || 0, s: "currency" },
          };
          maRow++;
        }
      }

      maRow++; // blank separator
    }

    // Document Total
    marginDocTotalRow = maRow;
    if (grandTotalSellRows.length > 0) {
      const sellFormula = grandTotalSellRows.map(r => `C${r + 1}`).join("+");
      maCellData[maRow] = {
        0: { v: "DOCUMENT TOTAL", s: { bl: 1, fs: 12 } },
        1: subtotalCostRows.length > 0 ? { f: "=" + subtotalCostRows.map(r => `B${r + 1}`).join("+"), s: { bl: 1, ...CURRENCY_FMT } } : undefined,
        2: { f: "=" + sellFormula, s: { bl: 1, ...CURRENCY_FMT } },
        3: { f: `=C${maRow + 1}-B${maRow + 1}`, s: { bl: 1, ...CURRENCY_FMT } },
        4: { f: `=IF(C${maRow + 1}=0,0,D${maRow + 1}/C${maRow + 1})`, s: { bl: 1, ...PERCENT_FMT } },
      };
    }
  } else {
    // Fallback: flat layout from pricingDisplays
    maCellData[maRow] = {
      0: { v: "Item Name / Category", s: "header" },
      1: { v: "Cost", s: "header" },
      2: { v: "Selling Price", s: "header" },
      3: { v: "Margin $", s: "header" },
      4: { v: "Margin %", s: "header" },
    };
    maRow++;

    const displayStartRow = maRow;
    for (const d of pricingDisplays) {
      const cost = d.hardwareCost + (d.installCost ?? 0) + (d.pmCost ?? 0) + (d.engCost ?? 0);
      const sell = d.totalSellingPrice || 0;
      const margin = sell - cost;

      maCellData[maRow] = {
        0: { v: d.name, s: "bold" },
        1: { v: cost, s: "currency" },
        2: { v: sell, s: "currency" },
        3: { f: `=C${maRow + 1}-B${maRow + 1}`, s: "currency" },
        4: { f: `=IF(C${maRow + 1}=0,0,D${maRow + 1}/C${maRow + 1})`, s: getMarginStyle(sell > 0 ? margin / sell : 0) },
      };
      maRow++;
    }

    const lastDataRow = maRow - 1;
    maCellData[maRow] = {
      0: { v: "", s: "total" },
      1: { f: `=SUM(B${displayStartRow + 1}:B${lastDataRow + 1})`, s: "totalCurrency" },
      2: { f: `=SUM(C${displayStartRow + 1}:C${lastDataRow + 1})`, s: "totalCurrency" },
      3: { f: `=SUM(D${displayStartRow + 1}:D${lastDataRow + 1})`, s: "totalCurrency" },
      4: { f: `=IF(C${maRow + 1}=0,0,D${maRow + 1}/C${maRow + 1})`, s: "totalPercent" },
    };
    maRow++;

    // Tax, Bond, Subtotal — use explicit indices for correct formula references
    const fbTotalsIdx = maRow - 1; // 0-indexed totals row (SUM row just written above)
    maCellData[maRow] = { 0: { v: "TAX" }, 2: { v: 0, s: "currency" } };
    maRow++;
    maCellData[maRow] = { 0: { v: "BOND" }, 2: { v: 0, s: "currency" } };
    maRow++;

    marginDocTotalRow = maRow;
    maCellData[maRow] = {
      0: { v: "SUB TOTAL (BID FORM)", s: "bold" },
      2: { f: `=C${fbTotalsIdx + 1}+C${fbTotalsIdx + 2}+C${fbTotalsIdx + 3}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
      3: { f: `=D${fbTotalsIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
      4: { f: `=IF(C${maRow + 1}=0,0,D${maRow + 1}/C${maRow + 1})`, s: { ...BOLD_STYLE, ...PERCENT_FMT } },
    };
  }

  sheets["margin-analysis"] = {
    id: "margin-analysis",
    name: "Margin Analysis",
    tabColor: "#217346",
    rowCount: Math.max(maRow + 5, 50),
    columnCount: 10,
    defaultColumnWidth: 100,
    defaultRowHeight: 28,
    freeze,
    cellData: maCellData,
    columnData: maColWidths,
    mergeData: [],
    showGridlines: 1,
  };

  // === SHEET 3: Tech Specs (Installers) — no pricing ===
  sheetOrder.push("tech-specs");
  const tsCols = [
    "Display Name", "Qty", "Pixel Pitch (mm)", "Height (ft)", "Width (ft)",
    "Pixels H", "Pixels W", "Sq Ft", "Brightness (nits)", "Service", "Environment",
    "Weight (lbs)", "Total Power (W)", "BTU/hr",
  ];
  const tsColWidths: Record<number, { w: number }> = {
    0: { w: 200 }, 1: { w: 55 }, 2: { w: 120 }, 3: { w: 85 }, 4: { w: 85 },
    5: { w: 85 }, 6: { w: 85 }, 7: { w: 75 }, 8: { w: 110 }, 9: { w: 85 }, 10: { w: 85 },
    11: { w: 100 }, 12: { w: 110 }, 13: { w: 85 },
  };

  const tsCellData: Record<number, Record<number, any>> = {};
  tsCellData[0] = {};
  tsCols.forEach((label, ci) => {
    tsCellData[0][ci] = { v: label, s: "header" };
  });

  screens.forEach((spec, si) => {
    const row = si + 1;
    const audit = internalAudit?.perScreen?.[si];
    const pd = pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;

    const h = spec.heightFt ?? 0;
    const w = spec.widthFt ?? 0;
    const pitch = spec.pixelPitchMm ?? 0;
    const qty = audit?.quantity || spec.quantity || 1;
    const hPx = spec.heightPx ?? (pitch > 0 ? Math.round(h * 304.8 / pitch) : 0);
    const wPx = spec.widthPx ?? (pitch > 0 ? Math.round(w * 304.8 / pitch) : 0);
    const weight = audit?.estimatedWeightLbs ?? mp?.totalWeightLbs ?? 0;
    const power = audit?.totalMaxPowerW ?? mp?.totalMaxPowerW ?? 0;

    tsCellData[row] = {
      0: { v: spec.name, s: "bold" },
      1: { v: qty },
      2: { v: pitch > 0 ? pitch : "", s: "number2" },
      3: { v: h > 0 ? h : "", s: "number2" },
      4: { v: w > 0 ? w : "", s: "number2" },
      5: { v: hPx > 0 ? hPx : "" },
      6: { v: wPx > 0 ? wPx : "" },
      7: { f: `=D${row + 1}*E${row + 1}`, s: "number2" },
      8: { v: mp?.nits ?? spec.brightnessNits ?? "" },
      9: { v: spec.serviceType ?? "" },
      10: { v: spec.environment ?? "" },
      11: { v: weight, s: "number" },
      12: { v: power, s: "number" },
      13: { f: power > 0 ? `=M${row + 1}*3.412` : "", s: "number" },
    };
  });

  sheets["tech-specs"] = {
    id: "tech-specs",
    name: "Tech Specs (Installers)",
    tabColor: "#6C757D",
    rowCount: Math.max(screens.length + 5, 30),
    columnCount: 14,
    defaultColumnWidth: 80,
    defaultRowHeight: 28,
    freeze,
    cellData: tsCellData,
    columnData: tsColWidths,
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 4: Install (Base) — per-zone structural/labor/electrical ===
  sheetOrder.push("install-base");
  const installCellData: Record<number, Record<number, any>> = {};
  const installColWidths: Record<number, { w: number }> = {
    0: { w: 4 }, 1: { w: 280 }, 2: { w: 110 }, 3: { w: 110 }, 4: { w: 110 },
    5: { w: 110 }, 6: { w: 110 }, 7: { w: 110 }, 8: { w: 110 }, 9: { w: 110 }, 10: { w: 120 },
  };

  let installRow = 0;
  // Title
  installCellData[installRow++] = { 1: { v: `${projectName} — Install (Base)`, s: { bl: 1, fs: 14 } } };
  installRow++; // blank

  // Per-display install sections
  screens.forEach((spec, si) => {
    const pd = pricingDisplays.find((d) => d.name === spec.name);
    const displayCost = pd?.hardwareCost ?? 0;
    const installCost = pd?.installCost ?? 0;
    const structCost = pd?.structuralCost ?? 0;
    const elecCost = pd?.electricalCost ?? 0;
    const engCost = pd?.engCost ?? 0;
    const pmCost = pd?.pmCost ?? 0;
    const margin = pd?.blendedMarginPct ?? 0.20;
    const totalCost = displayCost + installCost + structCost + elecCost + engCost + pmCost;
    const sellingPrice = margin > 0 && margin < 1 ? totalCost / (1 - margin) : totalCost;

    // Display header
    installCellData[installRow++] = {
      1: { v: spec.name, s: { bl: 1, fs: 12, cl: { rgb: NAVY } } },
    };

    // Margin settings row
    installCellData[installRow++] = {
      1: { v: "Install Margin:" },
      2: { v: margin, s: "percent" },
      4: { v: "Electrical Margin:" },
      5: { v: margin, s: "percent" },
      7: { v: "ANC Margin:" },
      8: { v: margin, s: "percent" },
    };

    // Column headers
    installCellData[installRow++] = {
      1: { v: "Item", s: "header" },
      2: { v: "Sub 1", s: "header" },
      3: { v: "Sub 2", s: "header" },
      4: { v: "Sub 3", s: "header" },
      5: { v: "Add'l Contingency", s: "header" },
      6: { v: "Total Cost", s: "header" },
      7: { v: "Margin %", s: "header" },
      8: { v: "Selling Price", s: "header" },
    };

    const sectionStartRow = installRow;

    // Structural Materials section
    installCellData[installRow++] = { 1: { v: "STRUCTURAL MATERIALS", s: { bl: 1, bg: { rgb: LIGHT_GRAY } } } };
    const structItems = ["Steel Fabrication", "Steel Finish", "Mounting Hardware", "Misc Materials"];
    structItems.forEach((item, i) => {
      const cost = i === 0 ? structCost * 0.6 : 0;
      installCellData[installRow] = {
        1: { v: item },
        2: { v: 0, s: "currency" },
        3: { v: 0, s: "currency" },
        4: { v: 0, s: "currency" },
        5: { v: 0, s: "currency" },
        6: { f: `=SUM(C${installRow + 1}:F${installRow + 1})`, s: "currency" },
        7: { v: margin, s: "percent" },
        8: { f: `=IF(G${installRow + 1}>=1,F${installRow + 1},F${installRow + 1}/(1-G${installRow + 1}))`, s: "currency" },
      };
      installRow++;
    });

    // Structural Labor section
    installCellData[installRow++] = { 1: { v: "STRUCTURAL LABOR & LED INSTALL", s: { bl: 1, bg: { rgb: LIGHT_GRAY } } } };
    const laborItems = ["Structural Labor", "LED Installation", "Rigging", "Equipment Rental"];
    laborItems.forEach((item, i) => {
      const cost = i === 0 ? installCost * 0.5 : i === 1 ? installCost * 0.5 : 0;
      installCellData[installRow] = {
        1: { v: item },
        2: { v: 0, s: "currency" },
        3: { v: 0, s: "currency" },
        4: { v: 0, s: "currency" },
        5: { v: 0, s: "currency" },
        6: { f: `=SUM(C${installRow + 1}:F${installRow + 1})`, s: "currency" },
        7: { v: margin, s: "percent" },
        8: { f: `=IF(G${installRow + 1}>=1,F${installRow + 1},F${installRow + 1}/(1-G${installRow + 1}))`, s: "currency" },
      };
      installRow++;
    });

    // Electrical section
    installCellData[installRow++] = { 1: { v: "ELECTRICAL & DATA", s: { bl: 1, bg: { rgb: LIGHT_GRAY } } } };
    const elecItems = ["Electrical Materials", "Data Materials", "Electrical Labor", "Data Labor", "Sub Panel", "Misc"];
    elecItems.forEach((item, i) => {
      const cost = i === 0 ? elecCost : 0;
      installCellData[installRow] = {
        1: { v: item },
        2: { v: 0, s: "currency" },
        3: { v: 0, s: "currency" },
        4: { v: 0, s: "currency" },
        5: { v: 0, s: "currency" },
        6: { f: `=SUM(C${installRow + 1}:F${installRow + 1})`, s: "currency" },
        7: { v: margin, s: "percent" },
        8: { f: `=IF(G${installRow + 1}>=1,F${installRow + 1},F${installRow + 1}/(1-G${installRow + 1}))`, s: "currency" },
      };
      installRow++;
    });

    // Engineering section
    installCellData[installRow++] = { 1: { v: "SUBMITTALS, ENGINEERING & PERMITS", s: { bl: 1, bg: { rgb: LIGHT_GRAY } } } };
    const engItems = ["Structural Engineering", "Structural Certification", "Electrical Engineering", "Electrical Certification", "Permits"];
    engItems.forEach((item, i) => {
      const cost = i === 0 ? engCost : 0;
      installCellData[installRow] = {
        1: { v: item },
        2: { v: 0, s: "currency" },
        3: { v: 0, s: "currency" },
        4: { v: 0, s: "currency" },
        5: { v: 0, s: "currency" },
        6: { f: `=SUM(C${installRow + 1}:F${installRow + 1})`, s: "currency" },
        7: { v: margin, s: "percent" },
        8: { f: `=IF(G${installRow + 1}>=1,F${installRow + 1},F${installRow + 1}/(1-G${installRow + 1}))`, s: "currency" },
      };
      installRow++;
    });

    // Zone Grand Total
    installCellData[installRow++] = {
      1: { v: "ZONE GRAND TOTAL", s: { bl: 1, cl: { rgb: WHITE }, bg: { rgb: NAVY } } },
      6: { v: totalCost, s: { bl: 1, cl: { rgb: WHITE }, ...CURRENCY_FMT } },
      8: { v: sellingPrice, s: { bl: 1, cl: { rgb: WHITE }, ...CURRENCY_FMT } },
    };

    installRow++; // separator
  });

  sheets["install-base"] = {
    id: "install-base",
    name: "Install (Base)",
    tabColor: "#D97706",
    rowCount: Math.max(installRow + 5, 50),
    columnCount: 11,
    defaultColumnWidth: 80,
    defaultRowHeight: 28,
    cellData: installCellData,
    columnData: installColWidths,
    mergeData: [],
    showGridlines: 1,
  };

  // === SHEET 5: LED Display Request ===
  sheetOrder.push("led-display-request");
  const ldrCellData: Record<number, Record<number, any>> = {};
  const ldrColWidths: Record<number, { w: number }> = {
    0: { w: 200 }, 1: { w: 100 }, 2: { w: 100 }, 3: { w: 100 }, 4: { w: 100 },
    5: { w: 100 }, 6: { w: 100 }, 7: { w: 100 }, 8: { w: 120 },
  };

  ldrCellData[0] = { 0: { v: "LED Display Request Form", s: { bl: 1, fs: 14 } } };
  ldrCellData[2] = {
    0: { v: "Display Name", s: "header" },
    1: { v: "Location", s: "header" },
    2: { v: "Width (ft)", s: "header" },
    3: { v: "Height (ft)", s: "header" },
    4: { v: "Pitch (mm)", s: "header" },
    5: { v: "Service", s: "header" },
    6: { v: "Environment", s: "header" },
    7: { v: "Quantity", s: "header" },
    8: { v: "Notes", s: "header" },
  };

  screens.forEach((spec, si) => {
    const row = si + 3;
    ldrCellData[row] = {
      0: { v: spec.name },
      1: { v: spec.location ?? "" },
      2: { v: spec.widthFt ?? 0, s: "number2" },
      3: { v: spec.heightFt ?? 0, s: "number2" },
      4: { v: spec.pixelPitchMm ?? 0, s: "number2" },
      5: { v: spec.serviceType ?? "" },
      6: { v: spec.environment ?? "" },
      7: { v: spec.quantity ?? 1 },
      8: { v: "" },
    };
  });

  sheets["led-display-request"] = {
    id: "led-display-request",
    name: "LED Display Request",
    tabColor: "#6C757D",
    rowCount: Math.max(screens.length + 5, 20),
    columnCount: 9,
    defaultColumnWidth: 80,
    defaultRowHeight: 28,
    cellData: ldrCellData,
    columnData: ldrColWidths,
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 6: Form ===
  sheetOrder.push("form");
  const formCellData: Record<number, Record<number, any>> = {};
  formCellData[0] = { 0: { v: "Project Form Data", s: { bl: 1, fs: 14 } } };
  formCellData[2] = { 0: { v: "Field", s: "header" }, 1: { v: "Value", s: "header" } };
  const formFields = [
    ["Project Name", projectName],
    ["Client", projectInfo?.clientName ?? ""],
    ["Venue", projectInfo?.venue ?? ""],
    ["Location", projectInfo?.location ?? ""],
    ["Document Type", projectInfo?.documentMode ?? "BUDGET"],
    ["Number of Displays", screens.length.toString()],
    ["Bond Required", "No"],
    ["Union Labor", "No"],
    ["Tax Rate", "0%"],
    ["Payment Terms", "30/30/30/10"],
  ];
  formFields.forEach(([label, value], i) => {
    formCellData[i + 3] = { 0: { v: label }, 1: { v: value } };
  });

  sheets["form"] = {
    id: "form",
    name: "Form",
    tabColor: "#6C757D",
    rowCount: 20,
    columnCount: 3,
    defaultColumnWidth: 140,
    defaultRowHeight: 28,
    cellData: formCellData,
    columnData: { 0: { w: 140 }, 1: { w: 200 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 7: Config ===
  sheetOrder.push("config");
  const configCellData: Record<number, Record<number, any>> = {};
  configCellData[0] = { 0: { v: "Configuration Settings", s: { bl: 1, fs: 14 } } };
  configCellData[2] = {
    0: { v: "Setting", s: "header" },
    1: { v: "Value", s: "header" },
    2: { v: "Description", s: "header" },
  };
  const configRows = [
    ["LED Margin", "30%", "Default margin for LED hardware"],
    ["Services Margin", "20%", "Default margin for installation services"],
    ["CMS Margin", "35%", "Default margin for CMS/software"],
    ["Bond Rate", "1.5%", "Bond as percentage of selling price"],
    ["Tax Rate", "8.875%", "Sales tax rate (location-specific)"],
    ["Steel Rate ($/lb)", "$55", "Steel fabrication rate"],
    ["LED Install Rate ($/sqft)", "$105", "LED installation rate"],
  ];
  configRows.forEach(([setting, value, desc], i) => {
    configCellData[i + 3] = { 0: { v: setting }, 1: { v: value }, 2: { v: desc } };
  });

  sheets["config"] = {
    id: "config",
    name: "Config",
    tabColor: "#6C757D",
    rowCount: 15,
    columnCount: 3,
    defaultColumnWidth: 140,
    defaultRowHeight: 28,
    cellData: configCellData,
    columnData: { 0: { w: 140 }, 1: { w: 100 }, 2: { w: 250 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 8: Pricing ===
  sheetOrder.push("pricing");
  const pricingCellData: Record<number, Record<number, any>> = {};
  pricingCellData[0] = { 0: { v: "Pricing Summary", s: { bl: 1, fs: 14 } } };
  pricingCellData[2] = {
    0: { v: "Category", s: "header" },
    1: { v: "Cost", s: "header" },
    2: { v: "Selling Price", s: "header" },
    3: { v: "Margin %", s: "header" },
  };

  const totalLedCost = pricingDisplays.reduce((s, d) => s + d.hardwareCost, 0);
  const totalInstallCost = pricingDisplays.reduce((s, d) => s + (d.installCost ?? 0), 0);
  const totalStructCost = pricingDisplays.reduce((s, d) => s + (d.structuralCost ?? 0), 0);
  const totalElecCost = pricingDisplays.reduce((s, d) => s + (d.electricalCost ?? 0), 0);
  const totalEngCost = pricingDisplays.reduce((s, d) => s + (d.engCost ?? 0), 0);
  const totalPmCost = pricingDisplays.reduce((s, d) => s + (d.pmCost ?? 0), 0);
  const grandCost = totalLedCost + totalInstallCost + totalStructCost + totalElecCost + totalEngCost + totalPmCost;
  const grandSell = pricingDisplays.reduce((s, d) => s + (d.totalSellingPrice ?? 0), 0);

  const pricingRows = [
    ["LED Hardware", totalLedCost, totalLedCost * 1.43, 0.30],
    ["Structural Materials", totalStructCost, totalStructCost * 1.25, 0.20],
    ["Installation Labor", totalInstallCost, totalInstallCost * 1.25, 0.20],
    ["Electrical", totalElecCost, totalElecCost * 1.25, 0.20],
    ["Engineering/Permits", totalEngCost, totalEngCost * 1.25, 0.20],
    ["PM/Gen Conditions", totalPmCost, totalPmCost * 1.25, 0.20],
    ["TOTAL", grandCost, grandSell, grandSell > 0 ? (grandSell - grandCost) / grandSell : 0],
  ];

  pricingRows.forEach(([cat, cost, sell, margin], i) => {
    const isTotal = cat === "TOTAL";
    pricingCellData[i + 3] = {
      0: { v: cat, s: isTotal ? "total" : undefined },
      1: { v: cost, s: isTotal ? "totalCurrency" : "currency" },
      2: { v: sell, s: isTotal ? "totalCurrency" : "currency" },
      3: { v: margin, s: isTotal ? "totalPercent" : "percent" },
    };
  });

  sheets["pricing"] = {
    id: "pricing",
    name: "Pricing",
    tabColor: "#6C757D",
    rowCount: 15,
    columnCount: 4,
    defaultColumnWidth: 120,
    defaultRowHeight: 28,
    cellData: pricingCellData,
    columnData: { 0: { w: 150 }, 1: { w: 120 }, 2: { w: 120 }, 3: { w: 100 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 9: Extended Warranty (ANC) ===
  sheetOrder.push("extended-warranty");
  const warrantyCellData: Record<number, Record<number, any>> = {};
  warrantyCellData[0] = { 0: { v: "Extended Warranty (ANC)", s: { bl: 1, fs: 14 } } };
  warrantyCellData[2] = {
    0: { v: "Year", s: "header" },
    1: { v: "Base Cost", s: "header" },
    2: { v: "Escalation", s: "header" },
    3: { v: "Annual Cost", s: "header" },
    4: { v: "Selling Price", s: "header" },
  };

  const warrantyBaseCost = grandCost * 0.02; // 2% of hardware cost as base
  for (let year = 1; year <= 10; year++) {
    const escalation = year <= 3 ? 1 : Math.pow(1.10, year - 3); // 10% annual escalation after year 3
    const annualCost = warrantyBaseCost * escalation;
    const sellPrice = annualCost * 1.25; // 20% margin
    warrantyCellData[year + 2] = {
      0: { v: `Year ${year}` },
      1: { v: warrantyBaseCost, s: "currency" },
      2: { v: escalation, s: "number2" },
      3: { v: annualCost, s: "currency" },
      4: { v: sellPrice, s: "currency" },
    };
  }

  sheets["extended-warranty"] = {
    id: "extended-warranty",
    name: "Extended Warranty (ANC)",
    tabColor: "#6C757D",
    rowCount: 15,
    columnCount: 5,
    defaultColumnWidth: 100,
    defaultRowHeight: 28,
    cellData: warrantyCellData,
    columnData: { 0: { w: 80 }, 1: { w: 100 }, 2: { w: 100 }, 3: { w: 100 }, 4: { w: 100 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 10: Resp Matrix ===
  sheetOrder.push("resp-matrix");
  const respCellData: Record<number, Record<number, any>> = {};
  respCellData[0] = { 0: { v: `Project: ${projectName}`, s: { bl: 1, fs: 12 } } };
  respCellData[1] = { 0: { v: `Date: ${new Date().toLocaleDateString()}` } };

  let respRow = 3;
  const respSections = [
    {
      title: "Administrative",
      items: [
        ["Provide accurate architectural, structural engineering, and AV drawings.", "", "X"],
        ["Provide Payment and Performance Bond.", "NA", ""],
        ["All required zoning, building, street or sidewalk permits.", "NA", ""],
        ["Shipping of all equipment to site.", "X", ""],
      ],
    },
    {
      title: "Engineering & Submittals",
      items: [
        ["Customer responsible to ensure existing structure supports new equipment.", "", "X"],
        ["Provide mechanical drawings, electrical drawings, and load calculations.", "X", ""],
        ["Engineering and certification for new equipment attachments.", "X", ""],
      ],
    },
    {
      title: "Physical Installation",
      items: [
        ["Fabricate, deliver, and install support structure.", "X", ""],
        ["Provide & Install LED components.", "X", ""],
        ["Provide all required Floor/Site Protection.", "", "X"],
      ],
    },
    {
      title: "Electrical & Data Installation",
      items: [
        ["Submit electrical engineering drawings.", "X", ""],
        ["Provide primary power feed to each display location.", "", "X"],
        ["Furnish signal cables as specified by ANC.", "X", ""],
        ["Labor to pull signal cable.", "X", ""],
      ],
    },
    {
      title: "Control System",
      items: [
        ["Provide climate controlled control room.", "", "X"],
        ["Supply static IP address five (5) days prior to installation.", "", "X"],
      ],
    },
    {
      title: "Training",
      items: [
        ["Provide appropriate on-site operation and maintenance training.", "X", ""],
        ["Perform final systems testing and commissioning.", "X", ""],
      ],
    },
  ];

  respSections.forEach((section) => {
    // Section header
    respCellData[respRow] = {
      0: { v: section.title, s: { bl: 1, bg: { rgb: NAVY }, cl: { rgb: WHITE } } },
      1: { v: "ANC", s: { bl: 1, bg: { rgb: NAVY }, cl: { rgb: WHITE }, ht: 2 } },
      2: { v: "Purchaser", s: { bl: 1, bg: { rgb: NAVY }, cl: { rgb: WHITE }, ht: 2 } },
    };
    respRow++;

    section.items.forEach(([desc, anc, purchaser]) => {
      respCellData[respRow] = {
        0: { v: desc },
        1: { v: anc, ht: 2 },
        2: { v: purchaser, ht: 2 },
      };
      respRow++;
    });

    respRow++; // gap
  });

  sheets["resp-matrix"] = {
    id: "resp-matrix",
    name: "Resp Matrix",
    tabColor: "#6C757D",
    rowCount: respRow + 5,
    columnCount: 3,
    defaultColumnWidth: 300,
    defaultRowHeight: 28,
    cellData: respCellData,
    columnData: { 0: { w: 350 }, 1: { w: 80 }, 2: { w: 80 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 11: Margin Analysis (CMS Only) ===
  sheetOrder.push("margin-analysis-cms");
  const cmsCellData: Record<number, Record<number, any>> = {};
  cmsCellData[0] = { 0: { v: "Margin Analysis (CMS Only)", s: { bl: 1, fs: 14 } } };
  cmsCellData[2] = {
    0: { v: "Item", s: "header" },
    1: { v: "Cost", s: "header" },
    2: { v: "Selling Price", s: "header" },
    3: { v: "Margin $", s: "header" },
    4: { v: "Margin %", s: "header" },
  };

  const cmsItems = [
    ["Design & Control Software", 0, 0, 0, 0.35],
    ["Graphics Playback Engine", 0, 0, 0, 0.35],
    ["Image Processing", 0, 0, 0, 0.35],
    ["Dedicated LED Router/Switch", 0, 0, 0, 0.35],
    ["Commissioning", 0, 0, 0, 0.20],
    ["Event Support", 0, 0, 0, 0.20],
    ["Project Management", 0, 0, 0, 0.20],
    ["Integration Hardware", 0, 0, 0, 0.20],
    ["Integration Labor", 0, 0, 0, 0.20],
    ["Shipping", 0, 0, 0, 0.20],
    ["Travel", 0, 0, 0, 0.20],
  ];

  cmsItems.forEach(([item, cost, sell, margin$, margin], i) => {
    cmsCellData[i + 3] = {
      0: { v: item },
      1: { v: cost, s: "currency" },
      2: { v: sell, s: "currency" },
      3: { v: margin$, s: "currency" },
      4: { v: margin, s: "percent" },
    };
  });

  // CMS Total
  const cmsTotalRow = cmsItems.length + 3;
  cmsCellData[cmsTotalRow] = {
    0: { v: "CMS TOTAL", s: "total" },
    1: { f: `=SUM(B3:B${cmsTotalRow})`, s: "totalCurrency" },
    2: { f: `=SUM(C3:C${cmsTotalRow})`, s: "totalCurrency" },
    3: { f: `=C${cmsTotalRow + 1}-B${cmsTotalRow + 1}`, s: "totalCurrency" },
    4: { f: `=IF(C${cmsTotalRow + 1}=0,0,D${cmsTotalRow + 1}/C${cmsTotalRow + 1})`, s: "totalPercent" },
  };

  sheets["margin-analysis-cms"] = {
    id: "margin-analysis-cms",
    name: "Margin Analysis (CMS Only)",
    tabColor: "#217346",
    rowCount: 20,
    columnCount: 5,
    defaultColumnWidth: 120,
    defaultRowHeight: 28,
    cellData: cmsCellData,
    columnData: { 0: { w: 200 }, 1: { w: 100 }, 2: { w: 100 }, 3: { w: 100 }, 4: { w: 80 } },
    mergeData: [],
    showGridlines: 1,
  };

  // === SHEET 12: Travel (ANC) ===
  sheetOrder.push("travel-anc");
  const travelCellData: Record<number, Record<number, any>> = {};
  travelCellData[0] = { 0: { v: `${projectName} — ANC Travel`, s: { bl: 1, fs: 14 } } };

  let travelRow = 3;
  const travelSections = [
    { name: "Travel - Installation", items: [["Hotel", 300], ["Airfare", 1000], ["Car", 125], ["Per Diem", 100], ["Bundled", 10000]] },
    { name: "Travel - Commissioning", items: [["Hotel", 300], ["Airfare", 1000], ["Car", 125], ["Per Diem", 100], ["Bundled", 10000]] },
    { name: "Game Support", items: [["Hotel", 300], ["Airfare", 1000], ["Car", 125], ["Per Diem", 100], ["Bundled", 10000], ["Game Day Support", 1500]] },
  ];

  travelSections.forEach((section) => {
    // Section header
    travelCellData[travelRow] = {
      0: { v: "", s: "header" },
      1: { v: section.name, s: "header" },
      2: { v: "Cost", s: "header" },
      3: { v: "Quantity", s: "header" },
      4: { v: "Total Cost", s: "header" },
    };
    travelRow++;

    const sectionStartRow = travelRow;
    section.items.forEach(([item, unitCost], i) => {
      travelCellData[travelRow] = {
        1: { v: item },
        2: { v: unitCost, s: "currency" },
        3: { v: 0 },
        4: { f: `=C${travelRow + 1}*D${travelRow + 1}`, s: "currency" },
      };
      travelRow++;
    });

    // Section total
    travelCellData[travelRow] = {
      1: { v: "Total", s: "bold" },
      4: { f: `=SUM(E${sectionStartRow + 1}:E${travelRow})`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
    };
    travelRow += 2;
  });

  sheets["travel-anc"] = {
    id: "travel-anc",
    name: "Travel (ANC)",
    tabColor: "#D97706",
    rowCount: travelRow + 5,
    columnCount: 5,
    defaultColumnWidth: 100,
    defaultRowHeight: 28,
    cellData: travelCellData,
    columnData: { 0: { w: 30 }, 1: { w: 150 }, 2: { w: 80 }, 3: { w: 80 }, 4: { w: 100 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 13: P&L ===
  sheetOrder.push("pnl");
  const pnlCellData: Record<number, Record<number, any>> = {};
  pnlCellData[0] = { 0: { v: `${projectName} — P&L`, s: { bl: 1, fs: 14 } } };
  pnlCellData[2] = { 0: { v: "Project #:" }, 3: { v: "30/30/30/10" } };

  pnlCellData[4] = {
    0: { v: "PROJECTS BUDGET", s: { bl: 1, fs: 12 } },
  };

  pnlCellData[5] = {
    0: { v: "", s: "header" },
    1: { v: "Revenue", s: "header" },
    2: { v: "Budgeted Cost", s: "header" },
    3: { v: "Margin", s: "header" },
  };

  const pnlMargin = grandSell - grandCost;
  pnlCellData[6] = {
    0: { v: "Base Contract" },
    1: { v: grandSell, s: "currency" },
    2: { v: grandCost, s: "currency" },
    3: { v: pnlMargin, s: "currency" },
  };

  pnlCellData[7] = {
    0: { v: "TOTAL BASE CONTRACT", s: "total" },
    1: { v: grandSell, s: "totalCurrency" },
    2: { v: grandCost, s: "totalCurrency" },
    3: { v: pnlMargin, s: "totalCurrency" },
  };

  pnlCellData[9] = { 0: { v: "Change Orders", s: { cl: { rgb: "#666666" } } } };
  pnlCellData[10] = {
    0: { v: "Total Change Order(s) Amount" },
    1: { v: 0, s: "currency" },
    2: { v: 0, s: "currency" },
    3: { v: 0, s: "currency" },
  };

  pnlCellData[12] = {
    0: { v: "Grand Total", s: { bl: 1 } },
    1: { v: grandSell, s: { bl: 1, ...CURRENCY_FMT, bg: { rgb: "#D1FAE5" } } },
    2: { v: grandCost, s: { bl: 1, ...CURRENCY_FMT, bg: { rgb: "#D1FAE5" } } },
    3: { v: pnlMargin, s: { bl: 1, ...CURRENCY_FMT, bg: { rgb: "#D1FAE5" } } },
  };

  sheets["pnl"] = {
    id: "pnl",
    name: "P&L",
    tabColor: "#D97706",
    rowCount: 20,
    columnCount: 4,
    defaultColumnWidth: 120,
    defaultRowHeight: 28,
    cellData: pnlCellData,
    columnData: { 0: { w: 180 }, 1: { w: 120 }, 2: { w: 120 }, 3: { w: 120 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 14: PO's ===
  sheetOrder.push("pos");
  const poCellData: Record<number, Record<number, any>> = {};
  poCellData[0] = { 0: { v: `${projectName} — Purchase Orders`, s: { bl: 1, fs: 14 } } };

  poCellData[2] = {
    0: { v: "PO Number", s: "header" },
    1: { v: "Vendor", s: "header" },
    2: { v: "Title / Description", s: "header" },
    3: { v: "Original Contract Amount", s: "header" },
    4: { v: "Category", s: "header" },
  };

  // 30 empty PO slots
  for (let i = 0; i < 30; i++) {
    poCellData[i + 3] = {
      0: { v: "" },
      1: { v: "" },
      2: { v: "" },
      3: { v: 0, s: "currency" },
      4: { v: "" },
    };
  }

  sheets["pos"] = {
    id: "pos",
    name: "PO's",
    tabColor: "#D97706",
    rowCount: 35,
    columnCount: 5,
    defaultColumnWidth: 120,
    defaultRowHeight: 28,
    cellData: poCellData,
    columnData: { 0: { w: 100 }, 1: { w: 150 }, 2: { w: 200 }, 3: { w: 150 }, 4: { w: 100 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 15: Cash Flow ===
  sheetOrder.push("cash-flow");
  const cfCellData: Record<number, Record<number, any>> = {};
  cfCellData[0] = { 0: { v: `${projectName} — Cash Flow`, s: { bl: 1, fs: 14 } } };
  cfCellData[2] = { 3: { v: "Payment Terms: 30/30/30/10", s: { bl: 1 } } };

  cfCellData[3] = {
    3: { v: "Payment Phases" },
    4: { v: "Contract Signed" },
    5: { v: "Product Shipping" },
    6: { v: "Substantial Completion" },
    7: { v: "Sign Off" },
  };

  cfCellData[4] = {
    3: { v: "Percentages" },
    4: { v: 0.30, s: "percent" },
    5: { v: 0.30, s: "percent" },
    6: { v: 0.30, s: "percent" },
    7: { v: 0.10, s: "percent" },
  };

  cfCellData[6] = { 1: { v: "Contract Award Date" }, 2: { v: "TBD" } };
  cfCellData[7] = { 1: { v: "Scheduled Completion" }, 2: { v: "TBD" } };

  cfCellData[9] = {
    0: { v: "", s: "header" },
    1: { v: "Revenue", s: "header" },
    2: { v: "Expenses", s: "header" },
    3: { v: "Gross Profit", s: "header" },
    4: { v: "Gross Profit %", s: "header" },
    5: { v: "Budget Tracking (+/-)", s: "header" },
  };

  cfCellData[10] = {
    1: { v: grandSell, s: "currency" },
    2: { v: grandCost, s: "currency" },
    3: { v: grandSell - grandCost, s: "currency" },
    4: { v: grandSell > 0 ? (grandSell - grandCost) / grandSell : 0, s: "percent" },
    5: { v: 0, s: "currency" },
  };

  sheets["cash-flow"] = {
    id: "cash-flow",
    name: "Cash Flow",
    tabColor: "#D97706",
    rowCount: 25,
    columnCount: 8,
    defaultColumnWidth: 100,
    defaultRowHeight: 28,
    cellData: cfCellData,
    columnData: { 0: { w: 30 }, 1: { w: 120 }, 2: { w: 120 }, 3: { w: 120 }, 4: { w: 100 }, 5: { w: 120 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  // === SHEET 16: BID FORM ===
  sheetOrder.push("bid-form");
  const bidCellData: Record<number, Record<number, any>> = {};
  bidCellData[0] = { 0: { v: "BID FORM", s: { bl: 1, fs: 16 } } };
  bidCellData[1] = { 0: { v: projectName, s: { bl: 1, fs: 12 } } };

  bidCellData[3] = {
    0: { v: "Item #", s: "header" },
    1: { v: "Description", s: "header" },
    2: { v: "Quantity", s: "header" },
    3: { v: "Unit Price", s: "header" },
    4: { v: "Total Price", s: "header" },
  };

  // Display line items
  screens.forEach((spec, si) => {
    const pd = pricingDisplays.find((d) => d.name === spec.name);
    const row = si + 4;
    bidCellData[row] = {
      0: { v: si + 1 },
      1: { v: spec.name },
      2: { v: spec.quantity ?? 1 },
      3: { v: pd?.totalSellingPrice ?? 0, s: "currency" },
      4: { f: `=D${row + 1}*C${row + 1}`, s: "currency" },
    };
  });

  const bidTotalRow = screens.length + 4;
  bidCellData[bidTotalRow] = {
    1: { v: "SUBTOTAL", s: "bold" },
    4: { f: screens.length > 0 ? `=SUM(E4:E${bidTotalRow})` : "=0", s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
  };

  bidCellData[bidTotalRow + 1] = { 1: { v: "TAX" }, 4: { v: 0, s: "currency" } };
  bidCellData[bidTotalRow + 2] = { 1: { v: "BOND" }, 4: { v: 0, s: "currency" } };

  bidCellData[bidTotalRow + 3] = {
    1: { v: "GRAND TOTAL", s: { bl: 1, fs: 12 } },
    4: { f: `=E${bidTotalRow + 1}+E${bidTotalRow + 2}+E${bidTotalRow + 3}`, s: { bl: 1, ...CURRENCY_FMT } },
  };

  sheets["bid-form"] = {
    id: "bid-form",
    name: "BID FORM",
    tabColor: "#6C757D",
    rowCount: bidTotalRow + 10,
    columnCount: 5,
    defaultColumnWidth: 120,
    defaultRowHeight: 28,
    cellData: bidCellData,
    columnData: { 0: { w: 60 }, 1: { w: 200 }, 2: { w: 80 }, 3: { w: 100 }, 4: { w: 120 } },
    mergeData: [],
    showGridlines: 1,
    protection: { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, formatColumns: false, formatRows: false, insertColumns: false, insertRows: false, insertHyperlinks: false, deleteColumns: false, deleteRows: false, sort: false, autoFilter: false, pivotTable: false },
  };

  return {
    id: "rfp-workbook",
    name: "RFP Scoping Workbook",
    appVersion: "1.0.0",
    locale: "EN_US" as any,
    styles,
    sheetOrder,
    sheets,
  };
}

// Helper to get Margin Analysis total row for cross-sheet reference
function getMarginAnalysisTotalRow(pricingDocument: any, pricingDisplays: PricingDisplay[]): number {
  const pricingTables = pricingDocument?.tables || [];
  const hasPricingTables = pricingTables.length > 0 && pricingTables.some((t: any) => t.items?.length > 0);
  
  if (hasPricingTables) {
    // Count rows: 4 header rows + for each table: header + items + subtotal + tax + bond + grand total + alternates + separator
    let row = 5;
    for (const table of pricingTables) {
      const items = (table.items || []).filter((item: any) => !item.isHidden);
      row += 1 + items.length + 4; // header + items + subtotal + tax + bond + grand total
      row += (table.alternates?.length || 0) > 0 ? 1 + table.alternates.length : 0;
      row++; // separator
    }
    return row; // DOCUMENT TOTAL row
  } else {
    // Fallback: 4 header rows + header + displays + total + tax + bond + subtotal
    return 4 + 1 + pricingDisplays.length + 4;
  }
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
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build workbook data from current props
  const workbookDataRef = useRef(buildWorkbookData(props));

  // Ref for rebuild deduplication
  const lastBuiltRef = useRef("");

  // Hydration safety: don't render until client-side mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize Univer — runs once after mounted
  useEffect(() => {
    if (!mounted) return;

    let disposed = false;

    async function init() {
      const el = containerRef.current;
      if (!el || disposed) return;

      try {
        // Load Univer CSS via <link> tag — NOT via import (which webpack hoists into SSR)
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

        // Univer needs a container with non-zero dimensions.
        // Force a layout pass so the container has real pixel size.
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

        // Create workbook with pre-built data
        univerAPI.createWorkbook(workbookDataRef.current);

        // Listen for cell value changes
        univerAPI.addEvent(univerAPI.Event.SheetValueChanged, (params: any) => {
          handleValueChanged(params, propsRef);
        });

        // Give Univer's DI container time to fully resolve before marking ready.
        // Without this delay, accessing getActiveWorkbook() in subsequent effects
        // triggers cyclic dependency errors in redi.
        await new Promise((r) => setTimeout(r, 500));
        if (disposed) { univerAPI.dispose(); return; }

        // Mark the initial build key so rebuild effect doesn't double-build
        lastBuiltRef.current = JSON.stringify({
          screens: propsRef.current.screens.map(s => ({ n: s.name, q: s.quantity, p: s.pixelPitchMm })),
          displays: propsRef.current.pricingDisplays.map(d => ({ n: d.name, c: d.hardwareCost, s: d.totalSellingPrice, m: d.blendedMarginPct })),
          docTables: propsRef.current.pricingDocument?.tables?.length ?? 0,
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
  }, [mounted]);

  // Rebuild workbook when props change (screens/pricing data arriving after mount)
  useEffect(() => {
    if (!ready || !apiRef.current) return;

    // Serialize current props to detect changes
    const currentKey = JSON.stringify({
      screens: props.screens.map(s => ({ n: s.name, q: s.quantity, p: s.pixelPitchMm })),
      displays: props.pricingDisplays.map(d => ({ n: d.name, c: d.hardwareCost, s: d.totalSellingPrice, m: d.blendedMarginPct })),
      docTables: props.pricingDocument?.tables?.length ?? 0,
    });

    // Skip if already built this exact data
    if (currentKey === lastBuiltRef.current) return;
    lastBuiltRef.current = currentKey;

    console.log("[UniverSpreadsheet] Rebuilding workbook with", props.screens.length, "screens");

    const api = apiRef.current;
    try {
      const newData = buildWorkbookData(props);
      workbookDataRef.current = newData;
      const oldWb = api.getActiveWorkbook?.();
      if (oldWb) {
        try { oldWb.dispose?.(); } catch { /* ignore */ }
      }
      api.createWorkbook(newData);
    } catch (err) {
      console.warn("[UniverSpreadsheet] Rebuild failed:", err);
    }
  });

  // Don't render anything during SSR — prevents hydration error #418
  if (!mounted) return null;

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
      style={{ width: "100%", height: "100%", minWidth: 800, minHeight: 300, position: "relative" }}
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
