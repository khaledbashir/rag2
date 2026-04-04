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
  venueServices?: {
    enabled: boolean;
    years: number;
    annualFee: number;
    escalationPct: number;
    marginPct: number;
    rows: Array<{ year: number; cost: number; sellingPrice: number; margin: number }>;
    totalCost: number;
    totalSellingPrice: number;
    totalMargin: number;
  };
  manualAdditions?: Array<{
    key: string;
    label: string;
    cost: number;
    marginPct: number;
    sellingPrice: number;
  }>;
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
      tax?: { label: string; amount: number; rate?: number };
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
  onSpecEdit?: (screenIdx: number, field: string, value: number | string) => void;
  onPricingEdit?: (displayIdx: number, field: string, value: number) => void;
  onMarginAnalysisEdit?: (itemIdx: number, field: string, value: number) => void;
  onVenueServicesEdit?: (field: string, value: number) => void;
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

// Standard LCD/TV dimensions (16:9) — fallback when extraction misses physical sizes
const STANDARD_LCD_SIZES: Record<number, { widthFt: number; heightFt: number }> = {
  22: { widthFt: 1.59, heightFt: 0.90 }, 32: { widthFt: 2.33, heightFt: 1.31 },
  43: { widthFt: 3.13, heightFt: 1.76 }, 46: { widthFt: 3.35, heightFt: 1.88 },
  49: { widthFt: 3.56, heightFt: 2.00 }, 55: { widthFt: 3.99, heightFt: 2.25 },
  65: { widthFt: 4.72, heightFt: 2.66 }, 75: { widthFt: 5.45, heightFt: 3.07 },
  85: { widthFt: 6.18, heightFt: 3.47 }, 98: { widthFt: 7.12, heightFt: 4.00 },
};

function extractLcdSizeInches(name: string): number | null {
  const m = name.match(/\b(\d{2,3})\s*(?:"|''|‟|″|inch|in\b|-inch)/i)
    || name.match(/\b(\d{2,3})\s*(?:lcd|tv|monitor|display)\b/i);
  if (!m) return null;
  const size = parseInt(m[1], 10);
  return STANDARD_LCD_SIZES[size] ? size : null;
}

function guardedDivisionFormula(numerator: string, denominator: string, decimals = 2): string {
  // Use IF() instead of boolean arithmetic — Univer doesn't support <>/= as number multipliers
  return `=IF(${denominator}=0,0,ROUND(${numerator}/${denominator},${decimals}))`;
}

function guardedSellingFormula(costRef: string, marginRef: string, decimals = 2): string {
  // Handle both decimal (0.15) and whole-number (15) margin inputs:
  // If margin >= 1, treat as whole-number percentage (divide by 100 first)
  return `=IF(${marginRef}>=1,ROUND(${costRef}/(1-${marginRef}/100),${decimals}),ROUND(${costRef}/(1-${marginRef}),${decimals}))`;
}

// ---------------------------------------------------------------------------
// Build IWorkbookData from props — matches exportMirrorUglySheetExcel.ts layout
// ---------------------------------------------------------------------------

function buildWorkbookData(props: UniverSpreadsheetProps) {
  const { screens, pricingDisplays, pricingDocument, projectInfo, internalAudit, manualAdditions = [], venueServices } = props;
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
    1: {
      f: "='Margin Analysis'!C" + (
        getMarginAnalysisTotalRow(
          pricingDocument,
          pricingDisplays,
          manualAdditions.length,
          venueServices?.totalCost ?? 0,
        ) + 1
      ),
      s: { bl: 1, fs: 12, ...CURRENCY_FMT },
    },
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
    "Display", "RFP H (ft)", "RFP W (ft)", "RFP NITs",
    "Vendor", "Product", "Pitch (mm)",
    "H (ft)", "W (ft)", "H (px)", "W (px)",
    "SqFt/Screen", "Qty", "Total SqFt",
    "NITs", "Service", "$/SqFt", "Display Cost", "Processor", "Shipping", "Total Cost",
    "Margin %", "Selling Price", "Weight (lbs)", "Power (W)", "BTU/hr",
  ];

  const ledColWidths: Record<number, { w: number }> = {
    0: { w: 200 }, 1: { w: 75 }, 2: { w: 75 }, 3: { w: 70 },
    4: { w: 90 }, 5: { w: 140 }, 6: { w: 75 },
    7: { w: 65 }, 8: { w: 65 }, 9: { w: 65 }, 10: { w: 65 },
    11: { w: 90 }, 12: { w: 60 }, 13: { w: 85 }, 14: { w: 60 },
    15: { w: 70 }, 16: { w: 75 }, 17: { w: 100 }, 18: { w: 85 },
    19: { w: 80 }, 20: { w: 100 }, 21: { w: 75 }, 22: { w: 100 },
    23: { w: 90 }, 24: { w: 90 }, 25: { w: 80 },
  };

  const ledCellData: Record<number, Record<number, any>> = {};
  ledCellData[0] = {};
  ledCols.forEach((label, ci) => {
    ledCellData[0][ci] = { v: label, s: "header" };
  });

  // Build lookup from pricingDocument for Mirror Mode (when pricingDisplays is empty)
  // Store all items for both exact and fuzzy matching
  const pricingDocItems: Array<{ description: string; sellingPrice: number; cost: number | null }> = [];
  const pricingDocLookup: Record<string, { sellingPrice: number; cost: number | null }> = {};
  if (pricingDocument?.tables) {
    for (const table of pricingDocument.tables) {
      for (const item of (table.items || [])) {
        if (item.description && !item.isHidden) {
          const entry = {
            description: item.description,
            sellingPrice: item.sellingPrice || 0,
            cost: item.cost ?? null,
          };
          pricingDocLookup[item.description.toLowerCase()] = entry;
          pricingDocItems.push(entry);
        }
      }
    }
  }

  // Fuzzy match: try exact, then substring containment, then word overlap
  function findDocPricing(specName: string): { sellingPrice: number; cost: number | null } | undefined {
    if (!specName) return undefined;
    const key = specName.toLowerCase().trim();
    // 1. Exact match
    if (pricingDocLookup[key]) return pricingDocLookup[key];
    // 2. Spec name contained in description or vice versa
    for (const item of pricingDocItems) {
      const desc = item.description.toLowerCase().trim();
      if (desc.includes(key) || key.includes(desc)) return item;
    }
    // 3. Word overlap (at least 2 words matching)
    const specWords = key.split(/[\s\-_/]+/).filter(w => w.length > 2);
    let bestMatch: typeof pricingDocItems[0] | undefined;
    let bestOverlap = 0;
    for (const item of pricingDocItems) {
      const descWords = item.description.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2);
      const overlap = specWords.filter(w => descWords.includes(w)).length;
      if (overlap > bestOverlap && overlap >= 2) {
        bestOverlap = overlap;
        bestMatch = item;
      }
    }
    return bestMatch;
  }

  // Debug: log available pricingDoc items vs screen names for match debugging
  if (pricingDocItems.length > 0) {
    console.log("[UniverSpreadsheet] pricingDocLookup keys:", Object.keys(pricingDocLookup));
    console.log("[UniverSpreadsheet] screen names:", screens.map(s => s.name));
  }

  screens.forEach((spec, si) => {
    const row = si + 1;
    const pd = pricingDisplays.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    const audit = internalAudit?.perScreen?.[si];

    // For Mirror Mode: look up pricing from pricingDocument (fuzzy match)
    const docPricing = findDocPricing(spec.name || "");

    // Only use product-overridden dimensions when user EXPLICITLY selected a product
    // (fitScore 100 = user selection via handleProductSelect). Auto-matched products
    // should NOT override the RFP extraction dimensions — those are the source of truth
    // until the user consciously changes the product.
    const isUserSelected = mp?.fitScore === 100 && mp?.activeWidthFt && mp?.activeHeightFt;
    // Standard LCD fallback when extraction misses physical dimensions
    const lcdSize = extractLcdSizeInches(spec.name ?? "");
    const lcdDims = lcdSize ? STANDARD_LCD_SIZES[lcdSize] : null;
    const h = isUserSelected ? mp.activeHeightFt! : ((spec.heightFt ?? 0) || lcdDims?.heightFt || 0);
    const w = isUserSelected ? mp.activeWidthFt! : ((spec.widthFt ?? 0) || lcdDims?.widthFt || 0);
    const pitch = (isUserSelected && mp.pitch) ? mp.pitch : (spec.pixelPitchMm ?? 0);
    const hPx = isUserSelected && mp.resolutionY ? mp.resolutionY : (spec.heightPx ?? (pitch > 0 ? Math.round(h * 304.8 / pitch) : 0));
    const wPx = isUserSelected && mp.resolutionX ? mp.resolutionX : (spec.widthPx ?? (pitch > 0 ? Math.round(w * 304.8 / pitch) : 0));
    const qty = audit?.quantity || spec.quantity || 1;

    // $/SqFt: pd.areaSqFt already includes *qty, pd.hardwareCost is total — divide directly
    const ratePerSqFt = (pd?.areaSqFt && pd.areaSqFt > 0) ? (pd?.hardwareCost ?? 0) / pd.areaSqFt : 0;
    const weight = audit?.estimatedWeightLbs ?? mp?.totalWeightLbs ?? 0;
    const power = audit?.totalMaxPowerW ?? mp?.totalMaxPowerW ?? 0;
    
    // Use blended margin from pricing engine (matches Excel's two-tier calculation)
    // Previously back-calculated from LED costs only, which inflated the margin %.
    const marginPct = pd?.blendedMarginPct ?? 0.15;
    
    // SqFt from server (computeDisplayCosts uses snapped dims when spec.activeWidthFt is set)
    const totalSqFt = pd?.areaSqFt ? Math.round(pd.areaSqFt * 100) / 100 : (h > 0 && w > 0 ? Math.round(h * w * qty * 100) / 100 : 0);
    const sqFtPerScreen = qty > 0 ? Math.round(totalSqFt / qty * 100) / 100 : 0;
    const processorCost = pd?.processorCost ?? 0;
    const shippingCost = pd?.shippingCost ?? 0;
    // Use API totalCost directly — derive displayCost from it to ensure columns sum correctly
    const totalLedCost = pd?.totalCost ?? 0;
    const displayCost = totalLedCost > 0
      ? Math.round((totalLedCost - processorCost - shippingCost) * 100) / 100
      : 0;
    const resolvedNits = Number(
      mp?.nits
      ?? (mp as any)?.brightnessNits
      ?? spec.brightnessNits
      ?? 0
    ) || "";

    // RFP specs (original extraction — never overwritten by product selection)
    const rfpH = spec.heightFt ?? 0;
    const rfpW = spec.widthFt ?? 0;
    const rfpNits = spec.brightnessNits ?? 0;

    ledCellData[row] = {
      0: { v: spec.name, s: "bold" },
      1: { v: rfpH > 0 ? Math.round(rfpH * 100) / 100 : "", s: "number2" },   // RFP H (ft)
      2: { v: rfpW > 0 ? Math.round(rfpW * 100) / 100 : "", s: "number2" },   // RFP W (ft)
      3: { v: rfpNits || "", s: "number" },                                     // RFP NITs
      4: { v: mp?.manufacturer ?? "" },                                          // Vendor
      5: { v: mp?.model ?? "" },                                                 // Product
      6: { v: pitch > 0 ? pitch : "", s: "number2" },                           // Pitch
      7: { v: h > 0 ? Math.round(h * 100) / 100 : "", s: "number2" },          // H (ft)
      8: { v: w > 0 ? Math.round(w * 100) / 100 : "", s: "number2" },          // W (ft)
      9: pitch > 0 ? { f: `=ROUND(H${row + 1}*304.8/G${row + 1},0)`, s: "number" } : { v: hPx > 0 ? hPx : "" },  // H (px)
      10: pitch > 0 ? { f: `=ROUND(I${row + 1}*304.8/G${row + 1},0)`, s: "number" } : { v: wPx > 0 ? wPx : "" }, // W (px)
      11: { v: sqFtPerScreen || "", s: "number2" },                              // SqFt/Screen
      12: { v: qty, s: "number" },                                                // Qty
      13: { v: totalSqFt || "", s: "number2" },                                  // Total SqFt
      14: { v: resolvedNits },                                                   // NITs (product)
      15: { v: spec.serviceType ?? "" },                                         // Service
      16: { v: ratePerSqFt > 0 ? ratePerSqFt : 0, s: "currency2" },            // $/SqFt
      17: { v: displayCost, s: "currency" },                                     // Display Cost
      18: { v: processorCost, s: "currency" },                                   // Processor
      19: { v: shippingCost, s: "currency" },                                    // Shipping
      20: { v: totalLedCost, s: { ...BOLD_STYLE, ...CURRENCY_FMT, ht: 3 } },   // Total Cost
      21: { v: marginPct, s: getMarginStyle(marginPct) },                        // Margin %
      22: { f: guardedSellingFormula(`U${row + 1}`, `V${row + 1}`), s: { ...BOLD_STYLE, ...CURRENCY_FMT, ht: 3 } }, // Selling Price
      23: { v: weight, s: "number" },                                            // Weight
      24: { v: power, s: "number" },                                             // Power
      25: { f: `=ROUND(Y${row + 1}*3.412,0)`, s: "number" },                   // BTU/hr
    };
  });

  const totalRowIdx = screens.length + 1;
  const firstDataRow = 2;
  const lastDataRow = screens.length + 1;

  ledCellData[totalRowIdx] = {
    0: { v: `TOTAL (${screens.reduce((sum: number, s: any) => sum + (s.quantity || 1), 0)} screens)`, s: "total" },
    1: { v: "", s: "total" }, 2: { v: "", s: "total" }, 3: { v: "", s: "total" },  // RFP cols
    4: { v: "", s: "total" }, 5: { v: "", s: "total" }, 6: { v: "", s: "total" },  // Vendor/Product/Pitch
    7: { v: "", s: "total" }, 8: { v: "", s: "total" }, 9: { v: "", s: "total" }, 10: { v: "", s: "total" },  // H/W/Hpx/Wpx
    11: { v: "", s: "total" }, 12: { f: `=SUM(M${firstDataRow}:M${lastDataRow})`, s: "totalNumber" },  // Qty total
    13: { f: screens.length > 0 ? `=ROUND(SUM(N${firstDataRow}:N${lastDataRow}),2)` : "=0", s: "totalNumber" },  // Total SqFt
    14: { v: "", s: "total" }, 15: { v: "", s: "total" },  // NITs, Service
    16: { v: "", s: "total" },  // $/SqFt
    17: { f: screens.length > 0 ? `=ROUND(SUM(R${firstDataRow}:R${lastDataRow}),2)` : "=0", s: "totalCurrency" },  // Display Cost
    18: { f: screens.length > 0 ? `=ROUND(SUM(S${firstDataRow}:S${lastDataRow}),2)` : "=0", s: "totalCurrency" },  // Processor
    19: { f: screens.length > 0 ? `=ROUND(SUM(T${firstDataRow}:T${lastDataRow}),2)` : "=0", s: "totalCurrency" },  // Shipping
    20: { f: screens.length > 0 ? `=ROUND(SUM(U${firstDataRow}:U${lastDataRow}),2)` : "=0", s: "totalCurrency" },  // Total Cost
    21: { f: screens.length > 0 ? guardedDivisionFormula(`W${totalRowIdx + 1}-U${totalRowIdx + 1}`, `W${totalRowIdx + 1}`, 4) : "=0", s: "totalPercent" },  // Margin %
    22: { f: screens.length > 0 ? `=ROUND(SUM(W${firstDataRow}:W${lastDataRow}),2)` : "=0", s: "totalCurrency" },  // Selling Price
    23: { f: screens.length > 0 ? `=ROUND(SUM(X${firstDataRow}:X${lastDataRow}),0)` : "=0", s: "totalNumber" },  // Weight
    24: { f: screens.length > 0 ? `=ROUND(SUM(Y${firstDataRow}:Y${lastDataRow}),0)` : "=0", s: "totalNumber" },  // Power
    25: { f: screens.length > 0 ? `=ROUND(SUM(Z${firstDataRow}:Z${lastDataRow}),0)` : "=0", s: "totalNumber" },  // BTU/hr
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
    0: { w: 320 }, 1: { w: 130 }, 2: { w: 130 }, 3: { w: 130 }, 4: { w: 100 },
    5: { w: 0 },  // Col F: hidden (cost/rate storage)
    6: { w: 0 },  // Col G: hidden (unused)
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
  // Track section name → MA grand total row (0-indexed) for cross-sheet LED → MA linking
  const sectionGrandTotalMap: Record<string, number> = {};
  // Track zone grand total rows per display for cross-sheet linking from MA fallback path
  const installZoneGtRows: Record<string, number> = {}; // display name → 1-based row of ZONE GRAND TOTAL (cost col G)
  // Track per-section item row ranges (1-based) for Budget Summary cross-sheet formulas
  const installSectionRows: {
    structural: Array<[number, number]>;  // [firstItemRow1, lastItemRow1] per display
    labor: Array<[number, number]>;
    electrical: Array<[number, number]>;
    engineering: Array<[number, number]>;
  } = { structural: [], labor: [], electrical: [], engineering: [] };

  if (hasPricingTables) {
    // ══════════════════════════════════════════════════════════════════════
    // Mirror Mode MA — column layout:
    //   Col A (0) = Description
    //   Col B (1) = Selling Price per item (static) / Cost subtotal (formula)
    //   Col C (2) = Selling totals (SUBTOTAL/TAX/BOND/GRAND TOTAL formulas)
    //   Col D (3) = Margin $ (=C-B when cost data exists)
    //   Col E (4) = Margin % (zero-safe arithmetic, no IF)
    //   Col F (5) = Hidden: per-item cost / tax rate / bond rate
    // ══════════════════════════════════════════════════════════════════════
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
      let zeroSellCount = 0;

      for (const item of items) {
        const sell = item.sellingPrice || 0;
        const cost = item.cost ?? null;
        if (cost != null) { sectionCostSum += cost; hasCostData = true; }

        if (sell === 0) zeroSellCount++;

        maCellData[maRow] = {
          0: { v: item.description || "" },
          1: { v: sell, s: "currency" },
          5: cost != null ? { v: cost, s: "currency" } : undefined,
        };
        sectionSellSum += sell;
        maRow++;
      }
      const lastItemRow = maRow - 1;

      // Diagnostic: detect $0 selling price pattern (Bon Secours bug)
      if (zeroSellCount > 0 && items.length > 0) {
        const pct = Math.round((zeroSellCount / items.length) * 100);
        if (pct >= 80 && hasCostData) {
          console.error(`[UniverSpreadsheet] BUG DETECTED: "${table.name}" — ${zeroSellCount}/${items.length} items (${pct}%) have $0 selling price but costs exist ($${sectionCostSum.toFixed(2)}). Parser likely mapped sell column incorrectly.`);
        } else if (zeroSellCount > 0) {
          console.warn(`[UniverSpreadsheet] "${table.name}" — ${zeroSellCount}/${items.length} items have $0 selling price (sectionSellSum=$${sectionSellSum.toFixed(2)}, sectionCostSum=$${sectionCostSum.toFixed(2)})`);
        }
      }

      // Subtotal row
      const isAlternateSection = table.isAlternateSection === true || /\balternate/i.test(table.name || "");
      const subtotalIdx = maRow;
      if (!isAlternateSection) {
        if (hasCostData) subtotalCostRows.push(subtotalIdx);
        grandTotalSellRows.push(subtotalIdx + 3);
      }

      const sr = subtotalIdx + 1; // 1-based row for SUBTOTAL
      maCellData[subtotalIdx] = {
        0: { v: "SUBTOTAL", s: "bold" },
        1: hasCostData ? { f: `=SUM(F${firstItemRow + 1}:F${lastItemRow + 1})`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } } : undefined,
        2: { f: `=SUM(B${firstItemRow + 1}:B${lastItemRow + 1})`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
        3: hasCostData ? { f: `=C${sr}-B${sr}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } } : undefined,
        4: hasCostData ? { f: guardedDivisionFormula(`D${sr}`, `C${sr}`, 4), s: { ...BOLD_STYLE, ...PERCENT_FMT } } : undefined,
      };
      maRow++;

      // Tax row — formula-driven: =SUBTOTAL * taxRate (rate in hidden col F)
      const taxAmount = table.tax?.amount || 0;
      // Use parser-provided rate if available; else derive from amount/subtotal.
      // NEVER divide by 1 fallback — if sectionSellSum is 0, rate is 0.
      let taxRate = table.tax?.rate ?? (taxAmount > 0 && sectionSellSum > 0 ? taxAmount / sectionSellSum : 0);
      // Sanity clamp: tax rate > 50% is clearly a misparsed dollar amount
      if (taxRate > 0.50) {
        console.warn(`[UniverSpreadsheet] Tax rate ${taxRate} exceeds 50% for "${table.name}" — clamped to 0`);
        taxRate = 0;
      }
      const taxIdx = maRow;
      maCellData[taxIdx] = {
        0: { v: table.tax?.label || "TAX" },
        // Tax is pass-through: cost = selling (0% margin). Without cost, grand total margin inflates.
        1: hasCostData ? { f: `=C${taxIdx + 1}`, s: "currency" } : undefined,
        2: { f: `=C${sr}*F${taxIdx + 1}`, s: "currency" },
        5: { v: taxRate }, // Tax rate (editable in hidden col F)
      };
      maRow++;

      // Bond row — formula-driven: =SUBTOTAL * bondRate (rate in hidden col F)
      const bondAmount = table.bond || 0;
      let bondRate = bondAmount > 0 && sectionSellSum > 0 ? bondAmount / sectionSellSum : 0;
      // Sanity clamp: bond rate should never exceed 10%
      if (bondRate > 0.10) {
        console.warn(`[UniverSpreadsheet] Bond rate ${bondRate} exceeds 10% for "${table.name}" — clamped to 1.5%`);
        bondRate = 0.015;
      }
      const bondIdx = maRow;
      maCellData[bondIdx] = {
        0: { v: "BOND" },
        // Bond is pass-through: cost = selling (0% margin)
        1: hasCostData ? { f: `=C${bondIdx + 1}`, s: "currency" } : undefined,
        2: { f: `=C${sr}*F${bondIdx + 1}`, s: "currency" },
        5: { v: bondRate }, // Bond rate (editable in hidden col F)
      };
      maRow++;

      // Grand Total row = SUBTOTAL + TAX + BOND (both cost and selling)
      const grandTotalIdx = maRow;
      const gr = grandTotalIdx + 1; // 1-based row
      maCellData[grandTotalIdx] = {
        0: { v: "SUB TOTAL (BID FORM)", s: "bold" },
        1: hasCostData ? { f: `=B${sr}+B${taxIdx + 1}+B${bondIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } } : undefined,
        2: { f: `=C${sr}+C${taxIdx + 1}+C${bondIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
        3: hasCostData ? { f: `=C${gr}-B${gr}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } } : undefined,
        4: hasCostData ? { f: guardedDivisionFormula(`D${gr}`, `C${gr}`, 4), s: { ...BOLD_STYLE, ...PERCENT_FMT } } : undefined,
      };
      // Track for cross-sheet LED → MA linking
      if (table.name) {
        sectionGrandTotalMap[table.name.toLowerCase().trim()] = grandTotalIdx;
      }
      maRow++;

      // Debug: log formula references for first section
      if (pricingTables.indexOf(table) === 0) {
        console.log("[UniverSpreadsheet] MA Section 1 formula debug:", {
          tableName: table.name,
          itemCount: items.length,
          firstItemRow: firstItemRow, firstItemRow1Based: firstItemRow + 1,
          lastItemRow: lastItemRow, lastItemRow1Based: lastItemRow + 1,
          subtotalIdx, sr,
          taxIdx, taxIdx1Based: taxIdx + 1,
          bondIdx, bondIdx1Based: bondIdx + 1,
          grandTotalIdx, gr,
          taxAmount, bondAmount,
          sectionSellSum, sectionCostSum,
          hasCostData,
          subtotalCFormula: `=SUM(B${firstItemRow + 1}:B${lastItemRow + 1})`,
          grandTotalCFormula: `=C${sr}+C${taxIdx + 1}+C${bondIdx + 1}`,
          sampleItems: items.slice(0, 3).map(i => ({ desc: i.description, sell: i.sellingPrice, cost: i.cost })),
        });
      }

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
      const dr = maRow + 1; // 1-based
      maCellData[maRow] = {
        0: { v: "DOCUMENT TOTAL", s: { bl: 1, fs: 12 } },
        1: subtotalCostRows.length > 0 ? { f: "=" + subtotalCostRows.map(r => `B${r + 1}`).join("+"), s: { bl: 1, ...CURRENCY_FMT } } : undefined,
        2: { f: `=${sellFormula}`, s: { bl: 1, ...CURRENCY_FMT } },
        3: { f: `=C${dr}-B${dr}`, s: { bl: 1, ...CURRENCY_FMT } },
        4: { f: guardedDivisionFormula(`D${dr}`, `C${dr}`, 4), s: { bl: 1, ...PERCENT_FMT } },
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

    // Build alternate lookup from screens
    const altNameSet = new Set(
      screens.filter(s => s.isAlternate).map(s => s.name.toLowerCase())
    );
    const isAlt = (name: string) =>
      altNameSet.has(name.toLowerCase()) || /\balternate\b|\balt\s*\d/i.test(name);

    // Separate base and alternate displays
    const baseDisplays = pricingDisplays.filter(d => !isAlt(d.name));
    const altDisplays = pricingDisplays.filter(d => isAlt(d.name));

    // Base displays
    const displayStartRow = maRow;
    for (const d of baseDisplays) {
      const cost = d.hardwareCost + (d.installCost ?? 0) + (d.pmCost ?? 0) + (d.engCost ?? 0);
      const r = maRow + 1; // 1-based row for formulas

      // Cross-sheet link: Cost → Install (Base) zone grand total col G
      const installGtRow = installZoneGtRows[d.name];
      const costCell: any = installGtRow
        ? { f: `='Install (Base)'!G${installGtRow}`, s: "currency" }
        : { v: cost, s: "currency" };

      maCellData[maRow] = {
        0: { v: d.name, s: "bold" },
        1: costCell,
        2: { f: guardedSellingFormula(`B${r}`, `E${r}`), s: "currency" },
        3: { f: `=C${r}-B${r}`, s: "currency" },
        4: { f: guardedDivisionFormula(`D${r}`, `C${r}`, 4), s: "percent" },
      };
      maRow++;
    }

    for (const item of manualAdditions) {
      const r = maRow + 1;
      maCellData[maRow] = {
        0: { v: item.label, s: "bold" },
        1: { v: item.cost || 0, s: "currency" },
        2: { f: guardedSellingFormula(`B${r}`, `E${r}`), s: "currency" },
        3: { f: `=C${r}-B${r}`, s: "currency" },
        4: { v: item.marginPct, s: "percent" },
      };
      maRow++;
    }

    if (venueServices && venueServices.totalCost > 0) {
      const r = maRow + 1;
      maCellData[maRow] = {
        0: { v: "Venue Services", s: "bold" },
        1: { v: venueServices.totalCost, s: "currency" },
        2: { v: venueServices.totalSellingPrice, s: "currency" },
        3: { v: venueServices.totalMargin, s: "currency" },
        4: { v: venueServices.marginPct, s: "percent" },
      };
      maRow++;
    }

    // Base bid total — excludes alternates
    const lastBaseRow = maRow - 1;
    maCellData[maRow] = {
      0: { v: "BASE BID TOTAL", s: "total" },
      1: { f: `=SUM(B${displayStartRow + 1}:B${lastBaseRow + 1})`, s: "totalCurrency" },
      2: { f: `=SUM(C${displayStartRow + 1}:C${lastBaseRow + 1})`, s: "totalCurrency" },
      3: { f: `=SUM(D${displayStartRow + 1}:D${lastBaseRow + 1})`, s: "totalCurrency" },
      4: { f: guardedDivisionFormula(`D${maRow + 1}`, `C${maRow + 1}`, 4), s: "totalPercent" },
    };
    maRow++;

    // Alternate displays — listed below base total, not included in base bid
    if (altDisplays.length > 0) {
      maRow++; // blank separator
      maCellData[maRow] = {
        0: { v: "ALTERNATES", s: "header" },
        1: { v: "Cost", s: "header" },
        2: { v: "Selling Price", s: "header" },
        3: { v: "Margin $", s: "header" },
        4: { v: "Margin %", s: "header" },
      };
      maRow++;
      for (const d of altDisplays) {
        const cost = d.hardwareCost + (d.installCost ?? 0) + (d.pmCost ?? 0) + (d.engCost ?? 0);
        const r = maRow + 1;
        const installGtRow = installZoneGtRows[d.name];
        const costCell: any = installGtRow
          ? { f: `='Install (Base)'!G${installGtRow}`, s: "currency" }
          : { v: cost, s: "currency" };
        maCellData[maRow] = {
          0: { v: d.name },
          1: costCell,
          2: { f: guardedSellingFormula(`B${r}`, `E${r}`), s: "currency" },
          3: { f: `=C${r}-B${r}`, s: "currency" },
          4: { f: guardedDivisionFormula(`D${r}`, `C${r}`, 4), s: "percent" },
        };
        maRow++;
      }
    }

    // Tax, Bond — pass-through: cost = selling (0% margin)
    const fbTotalsIdx = maRow - 1; // 0-indexed totals row (SUM row)
    const fbTaxIdx = maRow;
    maCellData[maRow] = {
      0: { v: "TAX" },
      1: { f: `=C${fbTaxIdx + 1}`, s: "currency" }, // Cost = selling (pass-through)
      2: { f: `=C${fbTotalsIdx + 1}*F${fbTaxIdx + 1}`, s: "currency" },
      5: { v: 0 }, // Tax rate (editable)
    };
    maRow++;
    const fbBondIdx = maRow;
    maCellData[maRow] = {
      0: { v: "BOND" },
      1: { f: `=C${fbBondIdx + 1}`, s: "currency" }, // Cost = selling (pass-through)
      2: { f: `=C${fbTotalsIdx + 1}*F${fbBondIdx + 1}`, s: "currency" },
      5: { v: 0 }, // Bond rate (editable)
    };
    maRow++;

    marginDocTotalRow = maRow;
    maCellData[maRow] = {
      0: { v: "SUB TOTAL (BID FORM)", s: "bold" },
      1: { f: `=B${fbTotalsIdx + 1}+B${fbTaxIdx + 1}+B${fbBondIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
      2: { f: `=C${fbTotalsIdx + 1}+C${fbTaxIdx + 1}+C${fbBondIdx + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
      3: { f: `=C${maRow + 1}-B${maRow + 1}`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
      4: { f: guardedDivisionFormula(`D${maRow + 1}`, `C${maRow + 1}`, 4), s: { ...BOLD_STYLE, ...PERCENT_FMT } },
    };
  }

  // Cross-sheet linking: LED selling price → MA section grand total
  // If a screen name matches an MA section name, link via formula instead of static value
  if (Object.keys(sectionGrandTotalMap).length > 0) {
    screens.forEach((spec, si) => {
      const ledRow = si + 1; // 0-indexed row in LED sheet
      const screenName = (spec.name || "").toLowerCase().trim();
      if (!screenName) return;

      // Fuzzy match: exact, then substring containment
      let maGrandTotalIdx: number | undefined;
      if (sectionGrandTotalMap[screenName] != null) {
        maGrandTotalIdx = sectionGrandTotalMap[screenName];
      } else {
        for (const [sectionName, rowIdx] of Object.entries(sectionGrandTotalMap)) {
          if (sectionName.includes(screenName) || screenName.includes(sectionName)) {
            maGrandTotalIdx = rowIdx;
            break;
          }
        }
      }

      if (maGrandTotalIdx != null && ledCellData[ledRow]) {
        // Col 19 = Selling Price → reference MA grand total Col C (1-based row)
        const maRow1Based = maGrandTotalIdx + 1;
        ledCellData[ledRow][19] = {
          f: `='Margin Analysis'!C${maRow1Based}`,
          s: { ...BOLD_STYLE, ...CURRENCY_FMT, ht: 3 },
        };
      }
    });
  }

  sheets["margin-analysis"] = {
    id: "margin-analysis",
    name: "Margin Analysis",
    tabColor: "#217346",
    rowCount: Math.max(maRow + 5, 50),
    columnCount: 7,
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
    // Cross-sheet formulas: reference LED Cost Sheet for all technical values
    const ledRow = row + 1; // 1-based row in LED Cost Sheet (header=1, data starts at 2)
    tsCellData[row] = {
      0: { f: `='LED Cost Sheet'!A${ledRow}`, s: "bold" },           // Display
      1: { f: `='LED Cost Sheet'!M${ledRow}` },                       // Qty
      2: { f: `='LED Cost Sheet'!G${ledRow}`, s: "number2" },         // Pitch
      3: { f: `='LED Cost Sheet'!H${ledRow}`, s: "number2" },         // H (ft)
      4: { f: `='LED Cost Sheet'!I${ledRow}`, s: "number2" },         // W (ft)
      5: { f: `='LED Cost Sheet'!J${ledRow}`, s: "number" },          // H (px)
      6: { f: `='LED Cost Sheet'!K${ledRow}`, s: "number" },          // W (px)
      7: { f: `=ROUND(D${row + 1}*E${row + 1},2)`, s: "number2" },
      8: { f: `='LED Cost Sheet'!O${ledRow}` },                       // NITs
      9: { v: spec.serviceType ?? "" },
      10: { v: spec.environment ?? "" },
      11: { f: `='LED Cost Sheet'!X${ledRow}`, s: "number" },         // Weight
      12: { f: `='LED Cost Sheet'!Y${ledRow}`, s: "number" },         // Power
      13: { f: `=ROUND(M${row + 1}*3.412,0)`, s: "number" },
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

  // === SHEET 4: Bundle Equipment — Processor & Equipment component breakdown ===
  sheetOrder.push("bundle-equipment");
  const beCellData: Record<number, Record<number, any>> = {};
  const beColWidths: Record<number, { w: number }> = {
    0: { w: 320 }, 1: { w: 70 }, 2: { w: 110 }, 3: { w: 110 },
  };

  beCellData[0] = { 0: { v: `${projectName} — Processor & Equipment Bundle`, s: { bl: 1, fs: 14, cl: { rgb: "#0A52EF" } } } };
  beCellData[1] = { 0: { v: "Individual components for Processor & Equipment line on Margin Analysis. Edit costs below.", s: "italic" } };
  beCellData[3] = {
    0: { v: "Component", s: "header" },
    1: { v: "Qty", s: "header" },
    2: { v: "Unit Cost", s: "header" },
    3: { v: "Total Cost", s: "header" },
  };

  // Default equipment items (editable by user)
  const defaultEquipment = [
    { name: "Video Processor", qty: 1, unitCost: 2500 },
    { name: "Sending Card", qty: 1, unitCost: 800 },
    { name: "Media Player", qty: 1, unitCost: 1500 },
    { name: "Signal Cable Kit", qty: 1, unitCost: 350 },
    { name: "Power Supply Unit", qty: 1, unitCost: 600 },
    { name: "Receiver Cards", qty: 1, unitCost: 0 },
    { name: "Mounting Hardware", qty: 1, unitCost: 0 },
  ];

  // Use processor costs from pricing if available
  const totalProcessorCost = pricingDisplays.reduce((s, d) => s + (d.processorCost ?? 0), 0);
  if (totalProcessorCost > 0) {
    const processorSummary = pricingDisplays
      .filter((d) => (d.processorCost ?? 0) > 0)
      .map((d) => {
        const label = d.processorLabel || "Video Processor";
        const qty = d.processorsNeeded && d.processorsNeeded > 1 ? ` x${d.processorsNeeded}` : "";
        return `${d.name}: ${label}${qty}`;
      });
    defaultEquipment[0].name = processorSummary.length > 0
      ? `Video Processor (${processorSummary.join(" | ")})`
      : "Video Processor";
    defaultEquipment[0].unitCost = totalProcessorCost; // Main processor cost
    for (let i = 1; i < defaultEquipment.length; i++) defaultEquipment[i].unitCost = 0;
  }

  const beDataStart = 4; // 0-indexed row where data starts
  defaultEquipment.forEach((item, i) => {
    const r = beDataStart + i;
    const r1 = r + 1; // 1-based for formulas
    beCellData[r] = {
      0: { v: item.name },
      1: { v: item.qty },
      2: { v: item.unitCost, s: "currency" },
      3: { f: `=ROUND(B${r1}*C${r1},2)`, s: "currency" },
    };
  });

  const beTotalRowIdx = beDataStart + defaultEquipment.length;
  const beFirstData1 = beDataStart + 1; // 1-based
  const beLastData1 = beTotalRowIdx; // 1-based (last data row + 1 = total row, so last data = total-1+1 = total)
  beCellData[beTotalRowIdx] = {
    0: { v: "TOTAL", s: "total" },
    1: { v: "", s: "total" },
    2: { v: "", s: "total" },
    3: { f: `=ROUND(SUM(D${beFirstData1}:D${beLastData1}),2)`, s: "totalCurrency" },
  };

  sheets["bundle-equipment"] = {
    id: "bundle-equipment",
    name: "Bundle Equipment",
    tabColor: "#17A2B8",
    rowCount: Math.max(beTotalRowIdx + 10, 25),
    columnCount: 4,
    defaultColumnWidth: 100,
    defaultRowHeight: 28,
    cellData: beCellData,
    columnData: beColWidths,
    mergeData: [],
    showGridlines: 1,
    // Editable: Qty(1), Unit Cost(2)
  };

  // === SHEET 5: Install (Base) — per-zone structural/labor/electrical ===
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
  screens.forEach((spec) => {
    const pd = pricingDisplays.find((d) => d.name === spec.name);
    const margin = pd?.blendedMarginPct ?? 0.15;

    // Display header
    installCellData[installRow++] = {
      1: { v: spec.name, s: { bl: 1, fs: 12, cl: { rgb: NAVY } } },
    };

    // Margin settings row — track the 1-based row so data cells can reference it
    const marginSettingsRow = installRow; // 0-based
    const msr = marginSettingsRow + 1;    // 1-based for Excel formulas
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

    // Helper: create data row with margin linked to margin settings row
    const makeItemRow = (item: string, marginCol: string) => {
      installCellData[installRow] = {
        1: { v: item },
        2: { v: 0, s: "currency" },
        3: { v: 0, s: "currency" },
        4: { v: 0, s: "currency" },
        5: { v: 0, s: "currency" },
        6: { f: `=ROUND(SUM(C${installRow + 1}:F${installRow + 1}),2)`, s: "currency" },
        7: { f: `=$${marginCol}$${msr}`, s: "percent" },
        8: { f: guardedSellingFormula(`G${installRow + 1}`, `H${installRow + 1}`), s: "currency" },
      };
      installRow++;
    };

    // Structural Materials section — linked to Install Margin (col C)
    installCellData[installRow++] = { 1: { v: "STRUCTURAL MATERIALS", s: { bl: 1, bg: { rgb: LIGHT_GRAY } } } };
    const structItems = ["Steel Fabrication", "Steel Finish", "Mounting Hardware", "Misc Materials"];
    const structStart1 = installRow + 1; // 1-based first item row
    structItems.forEach((item) => makeItemRow(item, "C"));
    installSectionRows.structural.push([structStart1, installRow]); // installRow is now past last item

    // Structural Labor section — linked to Install Margin (col C)
    installCellData[installRow++] = { 1: { v: "STRUCTURAL LABOR & LED INSTALL", s: { bl: 1, bg: { rgb: LIGHT_GRAY } } } };
    const laborItems = ["Structural Labor", "LED Installation", "Rigging", "Equipment Rental"];
    const laborStart1 = installRow + 1;
    laborItems.forEach((item) => makeItemRow(item, "C"));
    installSectionRows.labor.push([laborStart1, installRow]);

    // Electrical section — linked to Electrical Margin (col F)
    installCellData[installRow++] = { 1: { v: "ELECTRICAL & DATA", s: { bl: 1, bg: { rgb: LIGHT_GRAY } } } };
    const elecItems = ["Electrical Materials", "Data Materials", "Electrical Labor", "Data Labor", "Sub Panel", "Misc"];
    const elecStart1 = installRow + 1;
    elecItems.forEach((item) => makeItemRow(item, "F"));
    installSectionRows.electrical.push([elecStart1, installRow]);

    // Engineering section — linked to ANC Margin (col I)
    installCellData[installRow++] = { 1: { v: "SUBMITTALS, ENGINEERING & PERMITS", s: { bl: 1, bg: { rgb: LIGHT_GRAY } } } };
    const engItems = ["Structural Engineering", "Structural Certification", "Electrical Engineering", "Electrical Certification", "Permits"];
    const engStart1 = installRow + 1;
    engItems.forEach((item) => makeItemRow(item, "I"));
    installSectionRows.engineering.push([engStart1, installRow]);

    // Zone Grand Total — SUM all item rows (G column = Total Cost, I column = Selling Price)
    const zoneGtRow = installRow + 1; // 1-based
    installCellData[installRow] = {
      1: { v: "ZONE GRAND TOTAL", s: { bl: 1, cl: { rgb: WHITE }, bg: { rgb: NAVY } } },
      6: { f: `=ROUND(SUM(G${sectionStartRow + 1}:G${zoneGtRow - 1}),2)`, s: { bl: 1, cl: { rgb: WHITE }, ...CURRENCY_FMT } },
      8: { f: `=ROUND(SUM(I${sectionStartRow + 1}:I${zoneGtRow - 1}),2)`, s: { bl: 1, cl: { rgb: WHITE }, ...CURRENCY_FMT } },
    };
    // Track for MA cross-sheet linking (cost = col G, selling = col I)
    installZoneGtRows[spec.name] = zoneGtRow;
    installRow++;

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

  // Pricing rows: Cost in B, Margin% in D, Selling Price = formula =Cost/(1-Margin)
  const pricingItems: [string, number, number][] = [
    ["LED Hardware", totalLedCost, 0.30],
    ["Structural Materials", totalStructCost, 0.20],
    ["Installation Labor", totalInstallCost, 0.20],
    ["Electrical", totalElecCost, 0.20],
    ["Engineering/Permits", totalEngCost, 0.20],
    ["PM/Gen Conditions", totalPmCost, 0.20],
  ];

  pricingItems.forEach(([cat, cost, margin], i) => {
    const r1 = i + 4; // 1-based row
    pricingCellData[i + 3] = {
      0: { v: cat },
      1: { v: cost, s: "currency" },
      2: { f: guardedSellingFormula(`B${r1}`, `D${r1}`), s: "currency" },
      3: { v: margin, s: "percent" },
    };
  });

  // TOTAL row — SUM formulas
  const pTotalIdx = pricingItems.length + 3; // 0-indexed
  const pTotalR = pTotalIdx + 1; // 1-based
  pricingCellData[pTotalIdx] = {
    0: { v: "TOTAL", s: "total" },
    1: { f: `=ROUND(SUM(B4:B${pTotalR - 1}),2)`, s: "totalCurrency" },
    2: { f: `=ROUND(SUM(C4:C${pTotalR - 1}),2)`, s: "totalCurrency" },
    3: { f: guardedDivisionFormula(`C${pTotalR}-B${pTotalR}`, `C${pTotalR}`, 4), s: "totalPercent" },
  };

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
    const r = year + 2; // 0-indexed row
    const r1 = r + 1; // 1-based for formulas
    warrantyCellData[r] = {
      0: { v: `Year ${year}` },
      1: { v: warrantyBaseCost, s: "currency" },
      2: year <= 3 ? { v: 1, s: "number2" } : { f: `=C${r1 - 1}*1.1`, s: "number2" },
      3: { f: `=ROUND(B${r1}*C${r1},2)`, s: "currency" },
      4: { f: `=ROUND(D${r1}/(1-0.2),2)`, s: "currency" },
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

  cmsItems.forEach(([item, cost, , , margin], i) => {
    const r = i + 4; // 1-based row
    cmsCellData[i + 3] = {
      0: { v: item },
      1: { v: cost, s: "currency" },
      2: { f: guardedSellingFormula(`B${r}`, `E${r}`), s: "currency" },  // Selling Price = Cost/(1-Margin%)
      3: { f: `=ROUND(C${r}-B${r},2)`, s: "currency" },                           // Margin$ = Sell - Cost
      4: { v: margin, s: "percent" },
    };
  });

  // CMS Total
  const cmsTotalRow = cmsItems.length + 3;
  cmsCellData[cmsTotalRow] = {
    0: { v: "CMS TOTAL", s: "total" },
    1: { f: `=ROUND(SUM(B3:B${cmsTotalRow}),2)`, s: "totalCurrency" },
    2: { f: `=ROUND(SUM(C3:C${cmsTotalRow}),2)`, s: "totalCurrency" },
    3: { f: `=ROUND(C${cmsTotalRow + 1}-B${cmsTotalRow + 1},2)`, s: "totalCurrency" },
    4: { f: guardedDivisionFormula(`D${cmsTotalRow + 1}`, `C${cmsTotalRow + 1}`, 4), s: "totalPercent" },
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
    section.items.forEach(([item, unitCost]) => {
      travelCellData[travelRow] = {
        1: { v: item },
        2: { v: unitCost, s: "currency" },
        3: { v: 0 },
        4: { f: `=ROUND(C${travelRow + 1}*D${travelRow + 1},2)`, s: "currency" },
      };
      travelRow++;
    });

    // Section total
    travelCellData[travelRow] = {
      1: { v: "Total", s: "bold" },
      4: { f: `=ROUND(SUM(E${sectionStartRow + 1}:E${travelRow}),2)`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
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

  // Base Contract — Revenue/Cost are seed values, Margin is formula
  pnlCellData[6] = {
    0: { v: "Base Contract" },
    1: { v: grandSell, s: "currency" },
    2: { v: grandCost, s: "currency" },
    3: { f: "=ROUND(B7-C7,2)", s: "currency" },
  };

  // Total Base Contract — SUM formulas
  pnlCellData[7] = {
    0: { v: "TOTAL BASE CONTRACT", s: "total" },
    1: { f: "=ROUND(B7,2)", s: "totalCurrency" },
    2: { f: "=ROUND(C7,2)", s: "totalCurrency" },
    3: { f: "=ROUND(B8-C8,2)", s: "totalCurrency" },
  };

  pnlCellData[9] = { 0: { v: "Change Orders", s: { cl: { rgb: "#666666" } } } };
  pnlCellData[10] = {
    0: { v: "Total Change Order(s) Amount" },
    1: { v: 0, s: "currency" },
    2: { v: 0, s: "currency" },
    3: { f: "=ROUND(B11-C11,2)", s: "currency" },
  };

  // Grand Total = Total Base + Change Orders
  pnlCellData[12] = {
    0: { v: "Grand Total", s: { bl: 1 } },
    1: { f: "=ROUND(B8+B11,2)", s: { bl: 1, ...CURRENCY_FMT, bg: { rgb: "#D1FAE5" } } },
    2: { f: "=ROUND(C8+C11,2)", s: { bl: 1, ...CURRENCY_FMT, bg: { rgb: "#D1FAE5" } } },
    3: { f: "=ROUND(B13-C13,2)", s: { bl: 1, ...CURRENCY_FMT, bg: { rgb: "#D1FAE5" } } },
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
    3: { f: `=ROUND(B11-C11,2)`, s: "currency" },                     // Gross Profit = Revenue - Expenses
    4: { f: guardedDivisionFormula("D11", "B11", 4), s: "percent" },          // Gross Profit % = Profit/Revenue
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
      4: { f: `=ROUND(D${row + 1}*C${row + 1},2)`, s: "currency" },
    };
  });

  const bidTotalRow = screens.length + 4;
  bidCellData[bidTotalRow] = {
    1: { v: "SUBTOTAL", s: "bold" },
    4: { f: screens.length > 0 ? `=ROUND(SUM(E4:E${bidTotalRow}),2)` : "=0", s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
  };

  bidCellData[bidTotalRow + 1] = { 1: { v: "TAX" }, 4: { v: 0, s: "currency" } };
  bidCellData[bidTotalRow + 2] = { 1: { v: "BOND" }, 4: { v: 0, s: "currency" } };

  bidCellData[bidTotalRow + 3] = {
    1: { v: "GRAND TOTAL", s: { bl: 1, fs: 12 } },
    4: { f: `=ROUND(E${bidTotalRow + 1}+E${bidTotalRow + 2}+E${bidTotalRow + 3},2)`, s: { bl: 1, ...CURRENCY_FMT } },
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

  // === Budget Summary — per-category aggregate (matches Excel Budget Summary tab) ===
  sheetOrder.push("budget-summary");
  const bsCellData: Record<number, Record<number, any>> = {};
  const bsColWidths: Record<number, { w: number }> = {
    0: { w: 30 }, 1: { w: 260 }, 2: { w: 120 }, 3: { w: 120 }, 4: { w: 120 }, 5: { w: 90 }, 6: { w: 110 },
  };

  bsCellData[0] = { 1: { v: `${projectName} — Budget Summary`, s: { bl: 1, fs: 14, cl: { rgb: "#217346" } } } };
  bsCellData[1] = { 1: { v: "By Category | Same data as Margin Analysis, grouped differently", s: "italic" } };
  bsCellData[3] = {
    1: { v: "Category", s: "header" },
    2: { v: "Cost", s: "header" },
    3: { v: "Selling Price", s: "header" },
    4: { v: "Margin $", s: "header" },
    5: { v: "Margin %", s: "header" },
    6: { v: "Price / SqFt", s: "header" },
  };

  // Aggregate costs across all displays by category (static fallback values)
  let bsTotalLedHw = 0, bsTotalStruct = 0, bsTotalInstall = 0;
  let bsTotalElec = 0, bsTotalPm = 0, bsTotalEng = 0, bsTotalEquip = 0;
  const totalDisplaySqFt = pricingDisplays.reduce((sum, d) => sum + ((d.areaSqFt ?? 0) * (d.quantity ?? 1)), 0);

  for (const d of pricingDisplays) {
    bsTotalLedHw += d.hardwareCost || 0;
    bsTotalStruct += (d.structuralCost ?? 0);
    bsTotalInstall += (d.installCost ?? 0);
    bsTotalElec += (d.electricalCost ?? 0);
    bsTotalPm += (d.pmCost ?? 0);
    bsTotalEng += (d.engCost ?? 0);
    bsTotalEquip += (d.processorCost ?? 0);
  }

  const avgMarginPct = pricingDisplays.length > 0
    ? pricingDisplays.reduce((s, d) => s + (d.blendedMarginPct ?? 0.15), 0) / pricingDisplays.length
    : 0.15;
  const bsHwMargin = avgMarginPct > 0 ? avgMarginPct : 0.30;
  const bsSvcMargin = avgMarginPct > 0 ? Math.max(avgMarginPct * 0.67, 0.15) : 0.20;

  // ── Build cross-sheet cost formulas ──────────────────────────────────────
  // Helper: SUM across install section rows (col G = Total Cost)
  const installSumFormula = (ranges: Array<[number, number]>): string | null => {
    if (ranges.length === 0) return null;
    return ranges.map(([s, e]) => `SUM('Install (Base)'!G${s}:G${e})`).join("+");
  };
  // LED Cost Sheet: total row col R (Total Cost), data rows 2..n+1 (1-based)
  const ledTotalRow1 = screens.length + 2; // 1-based total row
  const ledFirstData1 = 2;
  const ledLastData1 = screens.length + 1;

  // Bundle Equipment total row col D (beDataStart=4, 0-indexed → +1 for 1-based, +items.length = total row)
  const beTotalRow1 = 4 + defaultEquipment.length + 1; // 0-indexed total row + 1 for 1-based

  const structFormula = installSumFormula(installSectionRows.structural);
  const laborFormula = installSumFormula(installSectionRows.labor);
  const elecFormula = installSumFormula(installSectionRows.electrical);
  const engFormula = installSumFormula(installSectionRows.engineering);

  // Categories: [label, costFormula|null, fallbackCost, margin, showPricePerSqFt]
  const bsCategories: Array<[string, string | null, number, number, boolean]> = [
    ["LED Hardware (all displays)", `SUM('LED Cost Sheet'!U${ledFirstData1}:U${ledLastData1})`, bsTotalLedHw, bsHwMargin, true],
    ["Structural Materials", structFormula, bsTotalStruct, bsSvcMargin, true],
    ["Installation Labor", laborFormula, bsTotalInstall, bsSvcMargin, true],
    ["Electrical & Data", elecFormula, bsTotalElec, bsSvcMargin, true],
    ["PM / General Conditions", null, bsTotalPm, bsSvcMargin, false],  // PM is flat fee, not on install sheet
    ["Engineering & Permits", engFormula, bsTotalEng, bsSvcMargin, false],
  ];
  if (bsTotalEquip > 0) {
    bsCategories.push(["Processor & Equipment", `'Bundle Equipment'!D${beTotalRow1}`, bsTotalEquip, bsHwMargin, false]);
  }
  const manualAdditionsCost = manualAdditions.reduce((sum, item) => sum + (item.cost || 0), 0);
  if (manualAdditionsCost > 0) {
    bsCategories.push(["Additional Items", null, manualAdditionsCost, 0.15, false]);
  }
  if (venueServices && venueServices.totalCost > 0) {
    bsCategories.push(["Venue Services", null, venueServices.totalCost, venueServices.marginPct, false]);
  }

  const bsDataStart = 4;
  bsCategories.forEach(([label, costFormula, fallbackCost, margin, showPricePerSqFt], i) => {
    const r = bsDataStart + i;
    const r1 = r + 1;
    // Cost: cross-sheet formula when available, static value as fallback
    const costCell = costFormula
      ? { f: `=ROUND(${costFormula},2)`, s: "currency" }
      : { v: fallbackCost, s: "currency" };
    bsCellData[r] = {
      1: { v: label },
      2: costCell,
      3: { f: guardedSellingFormula(`C${r1}`, `F${r1}`), s: "currency" },
      4: { f: `=ROUND(D${r1}-C${r1},2)`, s: "currency" },
      5: { v: margin, s: "percent" },
      6: showPricePerSqFt && totalDisplaySqFt > 0
        ? { f: guardedDivisionFormula(`C${r1}`, String(totalDisplaySqFt)), s: "currency2" }
        : { v: "" },
    };
  });

  const bsTotalIdx = bsDataStart + bsCategories.length + 1;
  const bsTotalR = bsTotalIdx + 1;
  const bsFirstR = bsDataStart + 1;
  const bsLastR = bsDataStart + bsCategories.length;
  bsCellData[bsTotalIdx] = {
    1: { v: "GRAND TOTAL", s: { bl: 1, fs: 12 } },
    2: { f: `=ROUND(SUM(C${bsFirstR}:C${bsLastR}),2)`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
    3: { f: `=ROUND(SUM(D${bsFirstR}:D${bsLastR}),2)`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
    4: { f: `=ROUND(D${bsTotalR}-C${bsTotalR},2)`, s: { ...BOLD_STYLE, ...CURRENCY_FMT } },
    5: { f: guardedDivisionFormula(`E${bsTotalR}`, `D${bsTotalR}`, 4), s: { ...BOLD_STYLE, ...PERCENT_FMT } },
    6: totalDisplaySqFt > 0 ? { f: `=ROUND(C${bsTotalR}/${totalDisplaySqFt},2)`, s: { ...BOLD_STYLE, ...CURRENCY_FMT_2 } } : { v: "" },
  };

  sheets["budget-summary"] = {
    id: "budget-summary",
    name: "Budget Summary",
    tabColor: "#217346",
    rowCount: bsTotalIdx + 5,
    columnCount: 7,
    defaultColumnWidth: 100,
    defaultRowHeight: 28,
    cellData: bsCellData,
    columnData: bsColWidths,
    mergeData: [],
    showGridlines: 1,
  };

  // === Processor Count ===
  sheetOrder.push("processor-count");
  const pcCellData: Record<number, Record<number, any>> = {};
  const pcColWidths: Record<number, { w: number }> = {
    0: { w: 220 }, 1: { w: 90 }, 2: { w: 90 }, 3: { w: 130 }, 4: { w: 110 }, 5: { w: 130 }, 6: { w: 110 }, 7: { w: 120 },
  };

  pcCellData[0] = { 0: { v: `${projectName} — Processor Count`, s: { bl: 1, fs: 14 } } };
  pcCellData[2] = {
    0: { v: "Display", s: "header" },
    1: { v: "W (px)", s: "header" },
    2: { v: "H (px)", s: "header" },
    3: { v: "Total Pixels", s: "header" },
    4: { v: "Ports Needed", s: "header" },
    5: { v: "Processor", s: "header" },
    6: { v: "Units Needed", s: "header" },
    7: { v: "Processor Cost", s: "header" },
  };

  screens.forEach((spec, si) => {
    const pd = pricingDisplays.find((d) => d.name === spec.name);
    const wPx = spec.widthPx ?? (spec.pixelPitchMm && spec.widthFt ? Math.round(spec.widthFt * 304.8 / spec.pixelPitchMm) : 0);
    const hPx = spec.heightPx ?? (spec.pixelPitchMm && spec.heightFt ? Math.round(spec.heightFt * 304.8 / spec.pixelPitchMm) : 0);
    const qty = spec.quantity ?? 1;
    const totalPx = wPx * hPx * qty;
    const portsNeeded = pd?.portsNeeded ?? (totalPx > 0 ? Math.ceil(totalPx / 650000) : 0);
    const processorsNeeded = pd?.processorsNeeded ?? (portsNeeded > 8 ? Math.ceil(portsNeeded / 16) : Math.ceil(portsNeeded / 8));
    const processorLabel = pd?.processorLabel ?? (portsNeeded > 8 ? "MCTRL4K" : "NovaStar 660 Pro");
    const processorCost = pd?.processorCost ?? 0;
    const r = si + 3;
    pcCellData[r] = {
      0: { v: spec.name },
      1: { v: wPx, s: "number" },
      2: { v: hPx, s: "number" },
      3: { v: totalPx, s: "number" },
      4: { v: portsNeeded },
      5: { v: processorsNeeded > 1 ? `${processorLabel} x${processorsNeeded}` : processorLabel },
      6: { v: processorsNeeded, s: "number" },
      7: { v: processorCost, s: "currency" },
    };
  });

  sheets["processor-count"] = {
    id: "processor-count",
    name: "Processor Count",
    tabColor: "#17A2B8",
    rowCount: Math.max(screens.length + 5, 15),
    columnCount: 8,
    defaultColumnWidth: 100,
    defaultRowHeight: 28,
    cellData: pcCellData,
    columnData: pcColWidths,
    mergeData: [],
    showGridlines: 1,
  };

  // === Scoring ===
  sheetOrder.push("scoring");
  const scoreCellData: Record<number, Record<number, any>> = {};
  scoreCellData[0] = { 0: { v: `${projectName} — Scoring System`, s: { bl: 1, fs: 14 } } };
  scoreCellData[2] = {
    0: { v: "Item", s: "header" },
    1: { v: "Cost", s: "header" },
    2: { v: "Selling Price", s: "header" },
    3: { v: "Margin $", s: "header" },
    4: { v: "Margin %", s: "header" },
  };

  const scoreItems = [
    "Scoring Controller", "Scoring Software License", "LED Scoring Digits",
    "Shot Clock Displays", "Game Clock Display", "Scoring Integration Labor",
    "Scoring Cable Kit", "Commissioning",
  ];

  scoreItems.forEach((item, i) => {
    const r = i + 4;
    scoreCellData[i + 3] = {
      0: { v: item },
      1: { v: 0, s: "currency" },
      2: { f: guardedSellingFormula(`B${r}`, `E${r}`), s: "currency" },
      3: { f: `=ROUND(C${r}-B${r},2)`, s: "currency" },
      4: { v: 0.10, s: "percent" },
    };
  });

  const scoreTotalIdx = scoreItems.length + 3;
  const scoreTotalR = scoreTotalIdx + 1;
  scoreCellData[scoreTotalIdx] = {
    0: { v: "SCORING TOTAL", s: "total" },
    1: { f: `=ROUND(SUM(B4:B${scoreTotalR - 1}),2)`, s: "totalCurrency" },
    2: { f: `=ROUND(SUM(C4:C${scoreTotalR - 1}),2)`, s: "totalCurrency" },
    3: { f: `=ROUND(C${scoreTotalR}-B${scoreTotalR},2)`, s: "totalCurrency" },
    4: { f: guardedDivisionFormula(`D${scoreTotalR}`, `C${scoreTotalR}`, 4), s: "totalPercent" },
  };

  sheets["scoring"] = {
    id: "scoring",
    name: "Scoring",
    tabColor: "#6C757D",
    rowCount: scoreTotalIdx + 5,
    columnCount: 5,
    defaultColumnWidth: 120,
    defaultRowHeight: 28,
    cellData: scoreCellData,
    columnData: { 0: { w: 200 }, 1: { w: 100 }, 2: { w: 100 }, 3: { w: 100 }, 4: { w: 80 } },
    mergeData: [],
    showGridlines: 1,
  };

  // === Venue Services (Phase 3 — only show when explicitly enabled) ===
  const venueServicesEnabled = venueServices && venueServices.enabled && venueServices.totalCost > 0;
  if (venueServicesEnabled) {
  sheetOrder.push("venue-services");
  const venueCellData: Record<number, Record<number, any>> = {};
  venueCellData[0] = { 0: { v: `${projectName} — Venue Services`, s: { bl: 1, fs: 14 } } };
  venueCellData[1] = { 0: { v: "Multi-year service agreement calculator", s: "italic" } };
  venueCellData[3] = {
    0: { v: "Setting", s: "header" },
    1: { v: "Value", s: "header" },
    2: { v: "Notes", s: "header" },
  };
  venueCellData[4] = {
    0: { v: "Contract Years" },
    1: { v: venueServices?.years ?? 3, s: "number" },
    2: { v: "Number of renewal years included in the contract" },
  };
  venueCellData[5] = {
    0: { v: "Year 1 Cost" },
    1: { v: venueServices?.annualFee ?? 0, s: "currency" },
    2: { v: "Base annual service contract cost before escalation" },
  };
  venueCellData[6] = {
    0: { v: "Annual Escalation %" },
    1: { v: venueServices?.escalationPct ?? 0.03, s: "percent" },
    2: { v: "Applied to each renewal year" },
  };
  venueCellData[7] = {
    0: { v: "Margin %" },
    1: { v: venueServices?.marginPct ?? 0.20, s: "percent" },
    2: { v: "Target service-contract margin" },
  };
  venueCellData[9] = {
    0: { v: "Year", s: "header" },
    1: { v: "Cost", s: "header" },
    2: { v: "Selling Price", s: "header" },
    3: { v: "Margin $", s: "header" },
  };
  const venueRows = venueServices?.rows ?? [];
  for (let i = 0; i < Math.max(5, venueRows.length); i++) {
    const rowIdx = 10 + i;
    const rowNo = rowIdx + 1;
    const year = i + 1;
    const visible = year <= (venueServices?.years ?? 3);
    venueCellData[rowIdx] = {
      0: { v: visible ? `Year ${year}` : "" },
      1: visible
        ? year === 1
          ? { f: `=B6`, s: "currency" }
          : { f: `=IF(A${rowNo}=\"\",0,B${rowNo - 1}*(1+$B$7))`, s: "currency" }
        : { v: "" },
      2: visible
        ? { f: guardedSellingFormula(`B${rowNo}`, `$B$8`), s: "currency" }
        : { v: "" },
      3: visible
        ? { f: `=ROUND(C${rowNo}-B${rowNo},2)`, s: "currency" }
        : { v: "" },
    };
  }
  venueCellData[16] = {
    0: { v: "TOTAL", s: "total" },
    1: { f: `=ROUND(SUM(B11:B15),2)`, s: "totalCurrency" },
    2: { f: `=ROUND(SUM(C11:C15),2)`, s: "totalCurrency" },
    3: { f: `=ROUND(SUM(D11:D15),2)`, s: "totalCurrency" },
  };
  sheets["venue-services"] = {
    id: "venue-services",
    name: "Venue Services",
    tabColor: "#0F766E",
    rowCount: 22,
    columnCount: 4,
    defaultColumnWidth: 140,
    defaultRowHeight: 28,
    cellData: venueCellData,
    columnData: { 0: { w: 180 }, 1: { w: 130 }, 2: { w: 160 }, 3: { w: 120 } },
    mergeData: [],
    showGridlines: 1,
  };
  } // end venueServicesEnabled gate

  // ═══════════════════════════════════════════════════════════════════════════
  // REORDER TABS — Natalia's FINAL confirmed order (March 6, 2026)
  // 1 Project Overview | 2 Margin Analysis | 3 Budget Summary | 4 LED Cost
  // 5 Tech Specs | 6 Install | 7 Processor Count | 8 Bundle Equipment
  // 9 Travel | 10 CMS | 11 Scoring | 12 Venue Services | 13 Resp Matrix | 14 P&L | 15 Cash Flow
  // Then: internal/utility tabs
  // ═══════════════════════════════════════════════════════════════════════════

  // Rename tabs to match unified format
  if (sheets["project-summary"]) sheets["project-summary"].name = "Project Overview";
  if (sheets["margin-analysis-cms"]) sheets["margin-analysis-cms"].name = "CMS";
  if (sheets["travel-anc"]) sheets["travel-anc"].name = "Travel";

  const finalOrder = [
    "project-summary",       // 1. Project Overview
    "margin-analysis",       // 2. Margin Analysis
    "budget-summary",        // 3. Budget Summary
    "led-cost-sheet",        // 4. LED Cost Sheet
    "tech-specs",            // 5. Tech Specs
    "install-base",          // 6. Install
    "processor-count",       // 7. Processor Count
    "bundle-equipment",      // 8. Bundle Equipment
    "travel-anc",            // 9. Travel
    "margin-analysis-cms",   // 10. CMS
    "scoring",               // 11. Scoring
    "venue-services",        // 12. Venue Services
    "resp-matrix",           // 13. Resp Matrix
    "pnl",                   // 14. P&L
    "cash-flow",             // 15. Cash Flow
    // Internal/utility tabs after the main ones
    "pos",
    "bid-form",
    "led-display-request",
    "form",
    "config",
    "pricing",
    "extended-warranty",
  ];

  // Only include tabs that were actually built
  const reorderedSheetOrder = finalOrder.filter((id) => sheetOrder.includes(id));
  // Append any tabs we missed (future-proofing)
  for (const id of sheetOrder) {
    if (!reorderedSheetOrder.includes(id)) reorderedSheetOrder.push(id);
  }

  return {
    id: "rfp-workbook",
    name: "RFP Scoping Workbook",
    appVersion: "1.0.0",
    locale: "EN_US" as any,
    styles,
    sheetOrder: reorderedSheetOrder,
    sheets,
  };
}

// Helper to get Margin Analysis total row for cross-sheet reference
function getMarginAnalysisTotalRow(
  pricingDocument: any,
  pricingDisplays: PricingDisplay[],
  manualAdditionCount = 0,
  venueServicesTotalCost = 0,
): number {
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
    // Fallback: 4 header rows + header + displays + manual additions + venue services row + total + tax + bond + subtotal
    const venueServiceRows = venueServicesTotalCost > 0 ? 1 : 0;
    return 4 + 1 + pricingDisplays.length + manualAdditionCount + venueServiceRows + 4;
  }
}

function getPricingDocumentFingerprint(pricingDocument: UniverSpreadsheetProps["pricingDocument"]): string {
  if (!pricingDocument?.tables?.length) return "0";

  return JSON.stringify(
    pricingDocument.tables.map((table) => ({
      n: table.name,
      a: !!table.isAlternateSection,
      i: (table.items || []).map((item) => ({
        d: item.description,
        s: item.sellingPrice,
        c: item.cost ?? null,
        h: !!item.isHidden,
      })),
      t: table.tax ? { l: table.tax.label, a: table.tax.amount, r: table.tax.rate ?? null } : null,
      b: table.bond ?? 0,
      g: table.grandTotal ?? 0,
      x: (table.alternates || []).map((alt) => ({ d: alt.description, p: alt.priceDifference })),
    }))
  );
}

function getMarginAnalysisEditTarget(
  row: number,
  column: number,
  props: UniverSpreadsheetProps
): { itemIdx: number; field: "cost" | "sellingPrice" } | null {
  const pricingTables = props.pricingDocument?.tables || [];
  const hasPricingTables = pricingTables.length > 0 && pricingTables.some((t) => t.items?.length > 0);

  if (hasPricingTables) {
    let sheetRow = 5; // title block + blank row
    let itemIdx = 0;

    for (const table of pricingTables) {
      const items = (table.items || []).filter((item) => !item.isHidden);
      if (items.length === 0) continue;

      sheetRow += 1; // section header
      for (const item of items) {
        if (row === sheetRow) {
          if (column === 1) return { itemIdx, field: "sellingPrice" };
          if (column === 5 && item.cost != null) return { itemIdx, field: "cost" };
          return null;
        }
        itemIdx++;
        sheetRow++;
      }

      sheetRow += 4; // subtotal + tax + bond + grand total
      if ((table.alternates || []).length > 0) {
        sheetRow += 1 + table.alternates!.length; // alternates header + rows
      }
      sheetRow += 1; // blank separator
    }

    return null;
  }

  const firstDataRow = 6; // 5 title/header rows + data starts after table header
  const itemIdx = row - firstDataRow;
  const totalEditableRows = props.pricingDisplays.length + (props.manualAdditions?.length || 0);
  if (itemIdx < 0 || itemIdx >= totalEditableRows) return null;
  if (column === 1) return { itemIdx, field: "cost" };
  if (column === 2) return { itemIdx, field: "sellingPrice" };
  return null;
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
  // Guard: true only after redi DI container is fully resolved (post-500ms delay)
  const diResolvedRef = useRef(false);

  // Build workbook data from current props
  const workbookDataRef = useRef(buildWorkbookData(props));

  // Ref for rebuild deduplication
  const lastBuiltRef = useRef("");
  // Guard: suppress value-change callbacks during programmatic rebuilds
  const rebuildingRef = useRef(false);

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

        // Listen for cell value changes (skip during programmatic rebuilds)
        univerAPI.addEvent(univerAPI.Event.SheetValueChanged, (params: any) => {
          if (rebuildingRef.current) return;
          handleValueChanged(params, propsRef);
        });

        // Give Univer's DI container time to fully resolve before marking ready.
        // Without this delay, accessing getActiveWorkbook() in subsequent effects
        // triggers cyclic dependency errors in redi (manifests as
        // "Cannot access 'ed' before initialization" in minified production builds).
        await new Promise((r) => setTimeout(r, 500));
        if (disposed) { univerAPI.dispose(); return; }
        diResolvedRef.current = true;

        // Mark the initial build key so rebuild effect doesn't double-build
        lastBuiltRef.current = JSON.stringify({
          screens: propsRef.current.screens.map(s => ({ n: s.name, q: s.quantity, p: s.pixelPitchMm, h: s.heightFt, w: s.widthFt })),
          displays: propsRef.current.pricingDisplays.map(d => ({ n: d.name, c: d.hardwareCost, s: d.totalSellingPrice, m: d.blendedMarginPct })),
          docTables: getPricingDocumentFingerprint(propsRef.current.pricingDocument),
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
      diResolvedRef.current = false;
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch { /* ignore */ }
        apiRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Rebuild workbook when props change (screens/pricing data arriving after mount)
  useEffect(() => {
    // Wait until redi DI is fully resolved — accessing getActiveWorkbook() before
    // this triggers cyclic dependency errors in the minified production bundle.
    if (!ready || !apiRef.current || !diResolvedRef.current) return;

    // Serialize current props to detect changes
    const currentKey = JSON.stringify({
      screens: props.screens.map(s => ({ n: s.name, q: s.quantity, p: s.pixelPitchMm, h: s.heightFt, w: s.widthFt })),
      displays: props.pricingDisplays.map(d => ({ n: d.name, c: d.hardwareCost, s: d.totalSellingPrice, m: d.blendedMarginPct })),
      projectInfo: props.projectInfo ? {
        projectName: props.projectInfo.projectName,
        clientName: props.projectInfo.clientName,
        venue: props.projectInfo.venue,
        location: props.projectInfo.location,
        documentMode: props.projectInfo.documentMode,
        createdAt: props.projectInfo.createdAt,
        updatedAt: props.projectInfo.updatedAt,
      } : null,
      manualAdditions: (props.manualAdditions || []).map(item => ({
        k: item.key,
        c: item.cost,
        s: item.sellingPrice,
        m: item.marginPct,
      })),
      venueServices: props.venueServices ? {
        enabled: props.venueServices.enabled,
        years: props.venueServices.years,
        annualFee: props.venueServices.annualFee,
        escalationPct: props.venueServices.escalationPct,
        marginPct: props.venueServices.marginPct,
        totalCost: props.venueServices.totalCost,
        totalSellingPrice: props.venueServices.totalSellingPrice,
      } : null,
      docTables: getPricingDocumentFingerprint(props.pricingDocument),
    });

    // Skip if already built this exact data
    if (currentKey === lastBuiltRef.current) return;
    lastBuiltRef.current = currentKey;

    const api = apiRef.current;
    rebuildingRef.current = true;
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
    } finally {
      // Allow value-change events again after a tick (createWorkbook fires sync events)
      requestAnimationFrame(() => { rebuildingRef.current = false; });
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
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
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
    let rawValue: unknown = "";
    let numValue = 0;
    try {
      rawValue = fRange.getValue?.();
      if (typeof rawValue === "number") {
        numValue = rawValue;
      } else if (rawValue != null) {
        numValue = parseFloat(String(rawValue)) || 0;
      }
    } catch { /* ignore */ }

    const textValue = typeof rawValue === "string"
      ? rawValue.trim()
      : rawValue == null
        ? ""
        : String(rawValue).trim();

    if (sheetId === "led-cost-sheet") {
      const screenIdx = row - 1; // row 0 is header
      if (screenIdx < 0 || screenIdx >= props.screens.length) continue;

      // LED Cost Sheet columns (with RFP H/W/NITs at 1-3):
      // 0=Display, 1=RFP H, 2=RFP W, 3=RFP NITs, 4=Vendor, 5=Product, 6=Pitch,
      // 7=H(ft), 8=W(ft), 9=H(px), 10=W(px), 11=SqFt, 12=Qty, 13=TotalSqFt,
      // 14=NITs, 15=Service, 16=$/SqFt, 17=DisplayCost, 18=Processor, 19=Shipping,
      // 20=TotalCost, 21=Margin%, 22=SellingPrice, 23=Weight, 24=Power, 25=BTU
      const specFieldMap: Record<number, string> = {
        0: "displayName",
        6: "pixelPitch",
        7: "activeHeightFt",  // H(ft) column edits product-snapped height, not RFP extraction
        8: "activeWidthFt",   // W(ft) column edits product-snapped width, not RFP extraction
        12: "quantity",
        15: "serviceType",
      };
      const pricingFieldMap: Record<number, string> = { 17: "hardwareCost", 18: "processorCost", 19: "shippingCost" };
      const numericSpecFields = new Set(["activeHeightFt", "activeWidthFt", "quantity", "pixelPitch"]);

      if (specFieldMap[column]) {
        const field = specFieldMap[column];
        props.onSpecEdit?.(screenIdx, field, numericSpecFields.has(field) ? numValue : textValue);
      } else if (pricingFieldMap[column]) {
        props.onPricingEdit?.(screenIdx, pricingFieldMap[column], numValue);
      } else if (column === 21) {
        let margin = numValue;
        if (margin > 1) margin = margin / 100;
        props.onPricingEdit?.(screenIdx, "blendedMarginPct", margin);
      }
    } else if (sheetId === "led-display-request") {
      const screenIdx = row - 3; // row 2 is header
      if (screenIdx < 0 || screenIdx >= props.screens.length) continue;

      const specFieldMap: Record<number, string> = {
        0: "displayName",
        1: "locationType",
        2: "widthFt",
        3: "heightFt",
        4: "pixelPitch",
        5: "serviceType",
        7: "quantity",
      };
      const numericSpecFields = new Set(["heightFt", "widthFt", "quantity", "pixelPitch"]);

      if (specFieldMap[column]) {
        const field = specFieldMap[column];
        props.onSpecEdit?.(screenIdx, field, numericSpecFields.has(field) ? numValue : textValue);
      }
    } else if (sheetId === "venue-services") {
      if (column !== 1) continue;
      if (row === 4) {
        props.onVenueServicesEdit?.("venueServiceYears", Math.max(1, Math.round(numValue || 1)));
      } else if (row === 5) {
        props.onVenueServicesEdit?.("venueServiceAnnualFee", Math.max(0, numValue));
      } else if (row === 6) {
        let escalation = numValue;
        if (escalation <= 1) escalation = escalation * 100;
        props.onVenueServicesEdit?.("venueServiceEscalationPct", Math.max(0, escalation));
      } else if (row === 7) {
        let margin = numValue;
        if (margin <= 1) margin = margin * 100;
        props.onVenueServicesEdit?.("venueServiceMarginPct", Math.max(0, Math.min(95, margin)));
      }
    } else if (sheetId === "margin-analysis") {
      const target = getMarginAnalysisEditTarget(row, column, props);
      if (!target) continue;
      props.onMarginAnalysisEdit?.(target.itemIdx, target.field, numValue);
    }
  }
}

// ---------------------------------------------------------------------------
// Export (the inner component is what gets dynamically imported)
// ---------------------------------------------------------------------------

export default UniverSpreadsheetInner;
