/**
 * Parse pitch (in mm) from a product name string like "C2.5-MIP 2.5mm Indoor (Alt)"
 * Returns null if no pitch pattern found.
 */
function parsePitchFromProductName(name: string | null | undefined): number | null {
  if (!name) return null;
  const m = name.match(/(\d+\.?\d*)\s*mm/i);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Full Scoping Workbook Generator
 *
 * Produces a multi-sheet Excel workbook matching the Toyota Center template format.
 * Sheets generated (up to 20+) based on available data:
 *
 * 1. Margin Analysis — Master cost/selling/margin summary per zone
 * 2. LED Cost Sheet — Product specs, vendor, pitch, pixel count, cost
 * 3. Per-Zone Install sheets — One per display location (structural, labor, electrical)
 * 4. P&L — Revenue vs budgeted cost vs margin tracking
 * 5. Cash Flow — Monthly projection template with payment terms
 * 6. PO's — Purchase order tracking template
 * 7. Processor Count — Pixel math for processor port requirements
 * 8. Resp Matrix — ANC vs Purchaser responsibility (auto-selected template)
 * 9. Travel — Hotel/airfare/car/per diem breakdown
 * 10. CMS — Content management system hardware template
 *
 * Uses real data from RFP extraction + pricing engine + reverse-engineered ANC budget logic.
 */

import ExcelJS from "exceljs";
import type { ExtractedLEDSpec, ExtractedProjectInfo, ExtractedRequirement } from "@/services/rfp/unified/types";
import type { PricedDisplay } from "./generateRateCardExcel";
import {
  MARGIN_PRESETS,
  BOND_RATE,
  LED_COST_PER_SQFT_BY_PITCH,
  STEEL_FABRICATION_PER_LB,
  LED_INSTALL_PER_SQFT,
  ELECTRICAL_MATERIALS_PER_SQFT,
  HEAVY_EQUIPMENT_PER_LB,
  PM_BASE_FEE,
  ENG_BASE_FEE,
  getAllProducts,
  getProduct,
  calculateHardwareCost,
  HARDWARE_COST_PER_SQM,
  type ZoneClass,
  type InstallComplexity,
} from "@/services/rfp/productCatalog";
import { ProductMatcher, type MatchedSolution } from "@/services/catalog/productMatcher";
import { preloadRateCard, getRateSync } from "@/services/rfp/rateCardLoader";
import {
  computeDisplays,
  round2,
  rc,
  getSmartBundles,
  getBudgetRates,
  getDisplayClassificationText,
  extractLcdSizeInches,
  resolveRateByPitch,
  STANDARD_LCD_SIZES,
  OUTDOOR_PITCH_MAP,
  PERIMETER_PITCH_MAP,
  TV_UNIT_COST,
  DEFAULT_MARGINS,
  type ComputedDisplay,
  type FinancialOverrides,
  type ProductResolver,
} from "./computeDisplayCosts";

// ─── Colors ─────────────────────────────────────────────────────────────────

/** Strip characters illegal in Excel sheet names: * ? : \ / [ ] */
function sanitizeSheetName(name: string): string {
  return name.replace(/[*?:\\/[\]]/g, "-").slice(0, 31);
}

const C = {
  ANC_BLUE: "FF0A52EF",
  DARK_HEADER: "FF1F2937",
  WHITE: "FFFFFFFF",
  LIGHT_GRAY: "FFF8F9FA",
  MEDIUM_GRAY: "FFDEE2E6",
  GREEN_BG: "FFD4EDDA",
  GREEN_TAB: "FF28A745",
  AMBER_TAB: "FFFFC107",
  RED_BG: "FFFCE4E4",
  EMERALD: "FF059669",
  AMBER_BG: "FFFFF8E1",
};

import { excelCurrencyFmt } from "@/services/pricing/currencyService";
import { buildProjectSummary, type ProjectSummaryInfo } from "@/services/proposal/server/exportMirrorUglySheetExcel";

let FMT_USD = '"$"#,##0';
const FMT_PCT = "0.0%";
const FMT_INT = "#,##0";

// ─── ANC Budget Logic ────────────────────────────────────────────────────────
// Core budget helpers (rc, getSmartBundles, getBudgetRates) imported from computeDisplayCosts.ts

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScopingWorkbookOptions {
  project: ExtractedProjectInfo;
  specs: ExtractedLEDSpec[];
  requirements?: ExtractedRequirement[];
  pricedDisplays?: PricedDisplay[];
  includeAlternatesInBase?: boolean;
  zoneClass?: ZoneClass;
  installComplexity?: InstallComplexity;
  includeBond?: boolean;
  currency?: string;
  paymentTerms?: string;
  contractDate?: string;
  completionDate?: string;
  /** Financial overrides — when set, these take priority over defaults/heuristics */
  overrides?: FinancialOverrides;
}

// FinancialOverrides and ComputedDisplay interfaces imported from computeDisplayCosts.ts
// Re-export for downstream consumers
export type { FinancialOverrides, ComputedDisplay } from "./computeDisplayCosts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function hdr(cell: ExcelJS.Cell, bg: string = C.DARK_HEADER): void {
  cell.font = { bold: true, color: { argb: C.WHITE }, size: 11, name: "Calibri" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
}

function sectionHdr(cell: ExcelJS.Cell, bg: string = C.ANC_BLUE): void {
  cell.font = { bold: true, color: { argb: C.WHITE }, size: 11, name: "Calibri" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { horizontal: "left", vertical: "middle" };
}

function stripe(row: ExcelJS.Row, cols: number, even: boolean): void {
  if (even) {
    for (let i = 1; i <= cols; i++) {
      row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.LIGHT_GRAY } };
    }
  }
}

function totalStyle(row: ExcelJS.Row, cols: number, bg: string = C.GREEN_BG): void {
  for (let i = 1; i <= cols; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, size: 11, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    cell.border = {
      top: { style: "medium", color: { argb: C.DARK_HEADER } },
      bottom: { style: "medium", color: { argb: C.DARK_HEADER } },
    };
  }
}

function getBundleEquipmentSubtotalRows(displays: ComputedDisplay[]): number[] {
  const subtotalRows: number[] = [];
  let row = 7; // Header at row 6, first zone starts at row 7

  displays.forEach((d) => {
    row++; // Zone header row
    const itemCount = [
      d.sendingCardCost,
      d.signalCableCost,
      d.upsCost,
      d.backupProcessorCost,
      d.weatherproofCost,
    ].filter((cost) => cost > 0).length;

    row += Math.max(itemCount, 1);
    subtotalRows.push(row);
    row++; // subtotal row
    row++; // separator row
  });

  return subtotalRows;
}

interface CostCenterSheetRefs {
  totalRow: number;
  subtotalCell: string;
  sellCell?: string;
  marginCell?: string;
}

interface AdditionalItemsSheetRefs {
  totalRow: number;
  rows: Record<string, number>;
}

function isClockLikeDisplay(d: ComputedDisplay): boolean {
  const haystack = [
    d.spec.name,
    d.spec.location,
    d.spec.selectedProductName,
  ].filter(Boolean).join(" ").toLowerCase();

  return /shot.?clock|play.?clock|time.?of.?day|tod.?clock|pitch.?clock|\bclock\b/.test(haystack);
}

function subtotalBorder(row: ExcelJS.Row, cols: number): void {
  for (let i = 1; i <= cols; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, name: "Calibri" };
    cell.border = { top: { style: "thin", color: { argb: "FF999999" } } };
  }
}

function setTitle(sheet: ExcelJS.Worksheet, lastCol: string, title: string): void {
  sheet.mergeCells(`A1:${lastCol}1`);
  const c = sheet.getCell("A1");
  c.value = title;
  c.font = { size: 16, bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.ANC_BLUE } };
  c.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 36;
}

function setMeta(sheet: ExcelJS.Worksheet, lastCol: string, text: string): void {
  sheet.mergeCells(`A2:${lastCol}2`);
  const c = sheet.getCell("A2");
  c.value = text;
  c.font = { size: 10, color: { argb: "FF666666" }, name: "Calibri" };
  c.alignment = { horizontal: "center" };
}

function inputCell(cell: ExcelJS.Cell): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.AMBER_BG } };
  cell.border = {
    top: { style: "thin", color: { argb: "FFCCCCCC" } },
    bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    left: { style: "thin", color: { argb: "FFCCCCCC" } },
    right: { style: "thin", color: { argb: "FFCCCCCC" } },
  };
}

// Display classification, LCD sizes, pitch maps, computeDisplays, and ProductResolver
// all imported from computeDisplayCosts.ts

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateScopingWorkbook(
  options: ScopingWorkbookOptions,
): Promise<{ buffer: Buffer; displays: ComputedDisplay[]; workbook: ExcelJS.Workbook }> {
  const {
    project,
    specs: allSpecs,
    requirements = [],
    pricedDisplays: allPricedDisplays,
    includeAlternatesInBase = false,
    zoneClass = "standard",
    installComplexity = "standard",
    includeBond = false,
    currency = "USD",
    paymentTerms = "50/20/20/10",
    contractDate,
    completionDate,
    overrides: ov,
  } = options;

  FMT_USD = excelCurrencyFmt(currency);

  await preloadRateCard();

  // Pre-load DB products for user-selected product IDs (cuid keys)
  // getProduct() only searches the hardcoded catalog — DB products need a separate lookup
  const selectedProductIds = allSpecs
    .map((s) => s.selectedProductId)
    .filter((id): id is string => !!id && !getProduct(id)); // only IDs not in hardcoded catalog
  let dbProductMap = new Map<string, { manufacturer: string; name: string; pitch: number; nits: number; weightDensityLbm2: number; powerDensityWm2: number }>();
  if (selectedProductIds.length > 0) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const dbProducts = await prisma.manufacturerProduct.findMany({
        where: { id: { in: selectedProductIds } },
      });
      for (const p of dbProducts) {
        dbProductMap.set(p.id, {
          manufacturer: p.manufacturer,
          name: p.displayName,
          pitch: p.pixelPitch,
          nits: p.maxNits,
          weightDensityLbm2: (p.weightKgPerCabinet * 2.205) / ((p.cabinetWidthMm * p.cabinetHeightMm) / 1e6),
          powerDensityWm2: p.maxPowerWattsPerCab / ((p.cabinetWidthMm * p.cabinetHeightMm) / 1e6),
        });
      }
      console.log(`[ScopingWorkbook] Loaded ${dbProductMap.size} user-selected DB products`);
    } catch (err) {
      console.warn("[ScopingWorkbook] DB product lookup failed:", err);
    }
  }

  // Helper: resolve product by ID from hardcoded catalog OR DB
  const resolveProduct = (id: string | undefined | null) => {
    if (!id) return null;
    const catalogProduct = getProduct(id);
    if (catalogProduct) return catalogProduct;
    const dbP = dbProductMap.get(id);
    if (dbP) return dbP;
    return null;
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "ANC Proposal Engine";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const projectName = project.projectName || project.venue || "Untitled Project";
  const clientName = project.clientName || "Client";
  const today = new Date().toISOString().split("T")[0];
  const supplyOnlyProject = ov?.servicesMarginPct === 0;
  const effectiveIncludeBond = includeBond && !supplyOnlyProject;

  // Split base bid vs alternates.
  // Analyzer export can include alternates directly in the main workbook so the
  // exported LED Cost Sheet matches the interactive analyzer view.
  const baseSpecs = includeAlternatesInBase ? allSpecs : allSpecs.filter((s) => !s.isAlternate);
  const altSpecs = includeAlternatesInBase ? [] : allSpecs.filter((s) => s.isAlternate);

  // Match pricedDisplays to base specs only
  const basePricedDisplays = allPricedDisplays
    ? (includeAlternatesInBase ? allPricedDisplays : allPricedDisplays.filter((pd) => !pd.spec.isAlternate))
    : undefined;

  // Compute base bid display data (used by all budget sheets)
  const displays = computeDisplays(baseSpecs, basePricedDisplays, installComplexity, resolveProduct, ov);

  // Compute alternate display data (for reference sheet only)
  const altPricedDisplays = allPricedDisplays
    ? (includeAlternatesInBase ? [] : allPricedDisplays.filter((pd) => pd.spec.isAlternate))
    : undefined;
  const altDisplays = altSpecs.length > 0
    ? computeDisplays(altSpecs, altPricedDisplays, installComplexity, resolveProduct)
    : [];

  // Grand totals
  const grandCost = displays.reduce((s, d) => s + d.totalCost, 0);
  const grandSelling = displays.reduce((s, d) => s + d.sellingPrice, 0);
  const grandMargin = round2(grandSelling - grandCost);
  const grandMarginPct = grandSelling > 0 ? round2(grandMargin / grandSelling) : 0;

  // ─── Sheet 0: Project Overview (first tab) ─────────────────────────────
  buildProjectOverview(wb, {
    projectName,
    clientName,
    date: today,
    currency,
    environment: project.isOutdoor ? "Outdoor" : "Indoor",
    unionLabor: project.isUnionLabor,
    bondRequired: effectiveIncludeBond,
    location: project.location || project.venue || "",
    displayCount: displays.reduce((sum, d) => sum + Math.max(d.spec.quantity || 1, 1), 0),
    grandCost,
    grandSelling,
    grandMargin,
    grandMarginPct,
    displays,
  });

  // Pre-compute Install tab names so MA can reference them in cross-sheet formulas
  const preInstallNames = new Set<string>();
  const installTabNames: string[] = displays.map((d, idx) => {
    const baseName = d.spec.name.length > 25 ? d.spec.name.substring(0, 25) + "…" : d.spec.name;
    let tn = `${baseName} - Install`;
    if (preInstallNames.has(tn)) {
      tn = `${baseName.substring(0, 22)}${idx + 1} - Install`;
    }
    preInstallNames.add(tn);
    return sanitizeSheetName(tn);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB ORDER (FINAL — Natalia, March 6 2026)
  // 1 Project Overview | 2 Margin Analysis | 3 Budget Summary | 4 LED Cost
  // 5 Tech Specs | 6 Install (per screen) | 7 Processor Count | 8 Bundle Equip
  // 9 Travel | 10 CMS | 11 Scoring | 12 Resp Matrix | 13 P&L | 14 Cash Flow
  // ═══════════════════════════════════════════════════════════════════════════

  // 4. LED Cost Sheet
  buildLedCostSheet(wb, projectName, displays, resolveProduct, ov, getBundleEquipmentSubtotalRows(displays));

  // 5. Tech Specs (no pricing — for installers/subs)
  buildTechSpecsSheet(wb, projectName, displays, resolveProduct);

  // 6. Install sheets (one per screen) — uses per-display complexity
  //    Deduplicate tab names: ExcelJS throws on duplicate worksheet names
  const usedInstallNames = new Set<string>();
  displays.forEach((d, idx) => {
    let baseName = d.spec.name.length > 25 ? d.spec.name.substring(0, 25) + "…" : d.spec.name;
    let tabName = `${baseName} - Install`;
    if (usedInstallNames.has(tabName)) {
      tabName = `${baseName.substring(0, 22)}${idx + 1} - Install`;
    }
    usedInstallNames.add(tabName);
    buildInstallSheet(wb, projectName, today, d, d.installComplexity, tabName, ov);
  });

  // 7. Processor Count
  buildProcessorCount(wb, projectName, displays);

  // 8. Bundle Equipment
  const bundleRefs = buildBundleEquipmentSheet(wb, projectName, displays);

  // 9. Travel
  buildTravel(wb, projectName);

  // 10. CMS
  const cmsRefs = buildCMS(wb, projectName, ov?.cmsAllocation ?? 0);

  // 11. Scoring
  const scoringRefs = buildScoring(wb, projectName, displays);

  // 12. Venue Services
  const venueServicesRefs = buildVenueServices(wb, projectName, ov);

  // 11b. Additional non-LED items
  const additionalItemRefs = buildAdditionalItems(wb, projectName, ov);

  // 12. Resp Matrix
  buildRespMatrix(wb, projectName, project);

  // 13. P&L
  buildPnL(wb, projectName, displays, grandCost, grandSelling, grandMargin, paymentTerms);

  // 14. Cash Flow
  buildCashFlow(wb, projectName, grandSelling, grandCost, paymentTerms, contractDate, completionDate);

  // 1. Margin Analysis — after editable source sheets exist
  const maGrandTotalRow = buildMarginAnalysis(
    wb,
    projectName,
    clientName,
    today,
    displays,
    altDisplays,
    grandCost,
    grandSelling,
    grandMargin,
    grandMarginPct,
    effectiveIncludeBond,
    ov,
    installTabNames,
    { cms: cmsRefs, scoring: scoringRefs, venueServices: venueServicesRefs, bundle: bundleRefs, additional: additionalItemRefs },
  );

  // 3. Budget Summary
  buildBudgetSummary(
    wb,
    projectName,
    clientName,
    today,
    displays,
    grandCost,
    grandSelling,
    grandMargin,
    grandMarginPct,
    ov,
    installTabNames,
    { cms: cmsRefs, scoring: scoringRefs, venueServices: venueServicesRefs, bundle: bundleRefs, additional: additionalItemRefs },
  );

  // Cross-sheet links: Project Overview → MA BASE BID GRAND TOTAL + LED display count
  // Compute document total including tax+bond (matches MA BASE BID GRAND TOTAL)
  const taxRateOv = ov?.taxRate ?? 0;
  const bondRateOv = supplyOnlyProject ? 0 : (ov?.bondRate ?? (effectiveIncludeBond ? 0.015 : 0));
  const docTotal = displays.reduce((s, d) => {
    const sell = d.sellingPrice;
    return s + sell + round2(sell * taxRateOv) + round2(sell * bondRateOv);
  }, 0);
  const docMargin = round2(docTotal - grandCost);
  const docMarginPct = docTotal > 0 ? round2(docMargin / docTotal) : 0;

  const ledDataEndPO = 3 + displays.length;
  const overviewSheet = wb.getWorksheet("Project Overview");
  if (overviewSheet) {
    overviewSheet.eachRow((row) => {
      const label = String(row.getCell(2).value || "");
      if (label === "Number of Displays") {
        row.getCell(3).value = {
          formula: `SUM('LED Cost Sheet'!I4:I${ledDataEndPO})`,
          result: displays.reduce((sum, d) => sum + Math.max(d.spec.quantity || 1, 1), 0),
        };
      }
      if (label === "DOCUMENT TOTAL") {
        row.getCell(3).value = {
          formula: `'Margin Analysis'!D${maGrandTotalRow}`,
          result: round2(docTotal),
        };
      }
      if (label === "Total Cost") {
        row.getCell(3).value = { formula: `'Margin Analysis'!C${maGrandTotalRow}`, result: grandCost };
      }
      if (label === "Total Selling Price") {
        row.getCell(3).value = { formula: `'Margin Analysis'!D${maGrandTotalRow}`, result: round2(docTotal) };
      }
      if (label === "Project Margin $") {
        row.getCell(3).value = { formula: `'Margin Analysis'!E${maGrandTotalRow}`, result: docMargin };
      }
      if (label === "Project Margin %") {
        row.getCell(3).value = { formula: `'Margin Analysis'!F${maGrandTotalRow}`, result: docMarginPct };
      }
    });
  }

  // Internal: PO's
  buildPOs(wb, projectName);

  // Alternates (reference only — not in budget)
  if (altDisplays.length > 0) {
    buildAlternatesSheet(wb, projectName, altDisplays);
  }

  // ── Tab ordering: move key sheets to the front ──
  // Desired order: Overview, MA, Budget Summary, LED, Tech Specs, Install…,
  // Processor, Bundle, Travel, CMS, Scoring, Venue Services, Additional Items,
  // Resp Matrix, P&L, Cash Flow, PO's, Alternates
  const TAB_ORDER = [
    "Project Overview",
    "Margin Analysis",
    "Budget Summary",
    "LED Cost Sheet",
    "Tech Specs (Installers)",
  ];
  // Install sheets go after Tech Specs — keep their relative creation order
  const installSheetNames = wb.worksheets
    .filter((s) => s.name.toLowerCase().includes("instal") && !TAB_ORDER.includes(s.name))
    .map((s) => s.name);
  const TAIL_ORDER = [
    "Processor Count",
    "Bundle Equipment",
    "ANC Travel",
    "CMS",
    "Scoring",
    "Venue Services",
    "Additional Items",
    "Resp Matrix",
    "P&L",
    "Cash Flow",
    "PO's",
    "Alternates",
  ];
  const desiredOrder = [...TAB_ORDER, ...installSheetNames, ...TAIL_ORDER];
  let orderNo = 0;
  for (const name of desiredOrder) {
    const ws = wb.getWorksheet(name);
    if (ws) (ws as any).orderNo = orderNo++;
  }
  // Any remaining sheets not in our list go at the end
  for (const ws of wb.worksheets) {
    if (!desiredOrder.includes(ws.name)) (ws as any).orderNo = orderNo++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer: buffer as unknown as Buffer, displays, workbook: wb };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 0. PROJECT OVERVIEW ────────────────────────────────────────────────────

interface ProjectOverviewData {
  projectName: string;
  clientName: string;
  date: string;
  currency: string;
  environment: string;
  unionLabor: boolean;
  bondRequired: boolean;
  location: string;
  displayCount: number;
  grandCost: number;
  grandSelling: number;
  grandMargin: number;
  grandMarginPct: number;
  displays: ComputedDisplay[];
}

function buildProjectOverview(wb: ExcelJS.Workbook, data: ProjectOverviewData): void {
  const ws = wb.addWorksheet("Project Overview", {
    properties: { tabColor: { argb: C.DARK_HEADER } },
  });

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 30;

  setTitle(ws, "C", `${data.projectName} — Project Overview`);
  setMeta(ws, "C", `${data.clientName} | ${data.date} | ANC Proposal Engine`);

  let row = 4;

  // ─── Section 1: Project Information ───
  const piR = ws.getRow(row);
  piR.getCell(2).value = "PROJECT INFORMATION";
  hdr(piR.getCell(2), C.ANC_BLUE);
  hdr(piR.getCell(3), C.ANC_BLUE);
  row++;

  const infoRows: [string, string | number][] = [
    ["Client", data.clientName],
    ["Project Name", data.projectName],
    ["Location", data.location || "—"],
    ["Date Created", data.date],
    ["Currency", data.currency],
    ["Environment", data.environment],
    ["Union Labor", data.unionLabor ? "Yes (+15%)" : "No"],
    ["Bond Required", data.bondRequired ? "Yes" : "No"],
    ["Number of Displays", data.displayCount],
  ];

  for (const [label, value] of infoRows) {
    const r = ws.getRow(row);
    r.getCell(2).value = label;
    r.getCell(2).font = { bold: true, name: "Calibri", size: 10 };
    r.getCell(3).value = value;
    r.getCell(3).font = { name: "Calibri", size: 10 };
    if (row % 2 === 0) {
      r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.LIGHT_GRAY } };
      r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.LIGHT_GRAY } };
    }
    row++;
  }
  row++; // separator

  // ─── Section 2: Financial Parameters ───
  const fpR = ws.getRow(row);
  fpR.getCell(2).value = "FINANCIAL PARAMETERS";
  hdr(fpR.getCell(2), C.ANC_BLUE);
  hdr(fpR.getCell(3), C.ANC_BLUE);
  row++;

  const finRows: [string, number | string][] = [
    ["LED Hardware Margin", DEFAULT_MARGINS.ledHardware],
    ["Install / Services Margin", DEFAULT_MARGINS.install],
    ["Engineering Margin", DEFAULT_MARGINS.engineering],
    ["Equipment Margin", DEFAULT_MARGINS.equipment],
    ["CMS Margin", DEFAULT_MARGINS.cms],
    ["Bond Rate", data.bondRequired ? rc("bond_tax.bond_rate", BOND_RATE) : "N/A"],
    ["Tax Rate", "Per zone (editable on MA)"],
    ["Tariff Rate", "Per zone (editable on MA)"],
  ];

  for (const [label, value] of finRows) {
    const r = ws.getRow(row);
    r.getCell(2).value = label;
    r.getCell(2).font = { bold: true, name: "Calibri", size: 10 };
    r.getCell(3).value = value;
    r.getCell(3).font = { name: "Calibri", size: 10 };
    if (typeof value === "number") r.getCell(3).numFmt = FMT_PCT;
    if (row % 2 === 0) {
      r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.LIGHT_GRAY } };
      r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.LIGHT_GRAY } };
    }
    row++;
  }
  row++; // separator

  // ─── Section 3: Summary Totals ───
  const stR = ws.getRow(row);
  stR.getCell(2).value = "SUMMARY TOTALS";
  hdr(stR.getCell(2), C.ANC_BLUE);
  hdr(stR.getCell(3), C.ANC_BLUE);
  row++;

  // Summary total rows — values here are placeholders; they get cross-sheet linked
  // to MA BASE BID GRAND TOTAL after the MA sheet is built
  const totalLabels: [string, string][] = [
    ["Total Cost", FMT_USD],
    ["Total Selling Price", FMT_USD],
    ["Project Margin $", FMT_USD],
    ["Project Margin %", FMT_PCT],
  ];
  const summaryStartRow = row;

  for (const [label, fmt] of totalLabels) {
    const r = ws.getRow(row);
    r.getCell(2).value = label;
    r.getCell(2).font = { bold: true, name: "Calibri", size: 10 };
    // Default values — overwritten by cross-sheet formula after MA is built
    r.getCell(3).value = label.includes("Cost") ? data.grandCost
      : label.includes("Selling") ? data.grandSelling
      : label.includes("$") ? data.grandMargin
      : data.grandMarginPct;
    r.getCell(3).numFmt = fmt;
    r.getCell(3).font = { name: "Calibri", size: 10 };
    row++;
  }

  // Document Total — cross-sheet formula to MA BASE BID GRAND TOTAL
  const dtR = ws.getRow(row);
  dtR.getCell(2).value = "DOCUMENT TOTAL";
  dtR.getCell(2).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  dtR.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.ANC_BLUE } };
  dtR.getCell(3).value = data.grandSelling;
  dtR.getCell(3).numFmt = FMT_USD;
  dtR.getCell(3).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  dtR.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.ANC_BLUE } };
  row++;
  row++;

  // Display Summary removed per team review (March 11 2026).
  // Project Overview shows only: project info, financial parameters, summary totals, document total.
}

// ─── 1b. BUDGET SUMMARY (per-category view) ─────────────────────────────────

function buildBudgetSummary(
  wb: ExcelJS.Workbook,
  projectName: string,
  clientName: string,
  date: string,
  displays: ComputedDisplay[],
  grandCost: number,
  grandSelling: number,
  grandMargin: number,
  grandMarginPct: number,
  ov?: FinancialOverrides,
  installTabNames: string[] = [],
  costCenterRefs?: {
    cms?: CostCenterSheetRefs;
    scoring?: CostCenterSheetRefs;
    venueServices?: CostCenterSheetRefs;
    bundle?: CostCenterSheetRefs;
    additional?: AdditionalItemsSheetRefs;
  },
): void {
  const ws = wb.addWorksheet("Budget Summary", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 40, 16, 16, 16, 12, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "G", `${projectName} — Budget Summary`);
  setMeta(ws, "G", `${clientName} | ${date} | By Category`);

  let row = 4;
  const headers = ["", "Category", "Cost", "Selling Price", "Margin $", "Margin %", "Price / SqFt"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.GREEN_TAB);
  });
  ws.getRow(row).height = 28;
  row++;

  // Guarded formulas: IFERROR prevents #VALUE! / #DIV/0! on zero-cost or empty rows
  const sellFormula = (r: number) => `IFERROR(C${r}/(1-F${r}),0)`;
  const marginFormula = (r: number) => `IFERROR(D${r}-C${r},0)`;

  const hwMargin = ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware;
  // Flat margin across all categories (Natalia confirmed March 2026)
  const svcMargin = ov?.servicesMarginPct ?? hwMargin;

  const ledDataEnd = 3 + displays.length; // LED Cost Sheet rows: 4..4+len-1
  const installCostSum = (builder: (tab: string) => string) => installTabNames.length > 0
    ? installTabNames.map((tab) => builder(tab)).join("+")
    : "0";

  const totalDisplaySqFt = displays.reduce((sum, d) => sum + d.areaSqFt, 0);
  const categories: Array<{ label: string; marginPct: number; costFormula?: string; sellFormulaRef?: string; result: number; showPricePerSqFt?: boolean }> = [
    {
      label: "LED Hardware (all displays)",
      marginPct: hwMargin,
      costFormula: `SUM('LED Cost Sheet'!Q4:Q${ledDataEnd})`,
      sellFormulaRef: `SUM('LED Cost Sheet'!S4:S${ledDataEnd})`,
      result: displays.reduce((s, d) => s + d.ledHardwareCost + d.sparePartsCost + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost + d.shippingCost, 0),
      showPricePerSqFt: true,
    },
    { label: "Structural Materials", marginPct: svcMargin, costFormula: installCostSum((tab) => `SUM('${tab}'!I26:I26)`), sellFormulaRef: installCostSum((tab) => `SUM('${tab}'!K26:K26)`), result: displays.reduce((s, d) => s + d.structuralMaterialsCost, 0), showPricePerSqFt: true },
    { label: "Structural Labor & LED Installation", marginPct: svcMargin, costFormula: installCostSum((tab) => `(SUM('${tab}'!I35:I35)-SUM('${tab}'!I34:I34))`), sellFormulaRef: installCostSum((tab) => `(SUM('${tab}'!K35:K35)-SUM('${tab}'!K34:K34))`), result: displays.reduce((s, d) => s + d.structuralLaborCost, 0), showPricePerSqFt: true },
    { label: "Electrical & Data", marginPct: svcMargin, costFormula: installCostSum((tab) => `SUM('${tab}'!I44:I44)`), sellFormulaRef: installCostSum((tab) => `SUM('${tab}'!K44:K44)`), result: displays.reduce((s, d) => s + d.electricalCost, 0), showPricePerSqFt: true },
    { label: "PM / General Conditions / Travel", marginPct: svcMargin, costFormula: installCostSum((tab) => `SUM('${tab}'!I34:I34)`), sellFormulaRef: installCostSum((tab) => `SUM('${tab}'!K34:K34)`), result: displays.reduce((s, d) => s + d.pmCost + d.travelCost, 0) },
    { label: "Engineering & Permits", marginPct: svcMargin, costFormula: installCostSum((tab) => `SUM('${tab}'!I52:I52)`), sellFormulaRef: installCostSum((tab) => `SUM('${tab}'!K52:K52)`), result: displays.reduce((s, d) => s + d.engCost, 0) },
  ];
  if (costCenterRefs?.cms) {
    categories.push({
      label: "CMS (Content Management System)",
      marginPct: DEFAULT_MARGINS.cms,
      costFormula: `SUM(CMS!${costCenterRefs.cms.subtotalCell}:${costCenterRefs.cms.subtotalCell})`,
      sellFormulaRef: costCenterRefs.cms.sellCell ? `SUM(CMS!${costCenterRefs.cms.sellCell}:${costCenterRefs.cms.sellCell})` : undefined,
      result: ov?.cmsAllocation ?? 0,
    });
  }
  if (costCenterRefs?.scoring) {
    categories.push({
      label: "Scoring System",
      marginPct: DEFAULT_MARGINS.scoring,
      costFormula: `SUM(Scoring!${costCenterRefs.scoring.subtotalCell}:${costCenterRefs.scoring.subtotalCell})`,
      sellFormulaRef: costCenterRefs.scoring.sellCell ? `SUM(Scoring!${costCenterRefs.scoring.sellCell}:${costCenterRefs.scoring.sellCell})` : undefined,
      result: ov?.scoringAllocation ?? 0,
    });
  }
  if (costCenterRefs?.venueServices) {
    categories.push({
      label: "Venue Services",
      marginPct: ov?.venueServiceMarginPct ?? DEFAULT_MARGINS.install,
      costFormula: `SUM('Venue Services'!${costCenterRefs.venueServices.subtotalCell}:${costCenterRefs.venueServices.subtotalCell})`,
      sellFormulaRef: costCenterRefs.venueServices.sellCell ? `SUM('Venue Services'!${costCenterRefs.venueServices.sellCell}:${costCenterRefs.venueServices.sellCell})` : undefined,
      result: 0,
    });
  }
  if (costCenterRefs?.additional) {
    const addRows = costCenterRefs.additional.rows;
    [
      ["Game Clock", DEFAULT_MARGINS.equipment, addRows.gameClock],
      ["Pitch Clocks", DEFAULT_MARGINS.equipment, addRows.pitchClocks],
      ["OES / MIS / Timing", DEFAULT_MARGINS.equipment, addRows.oesMis],
      ["DMX / Misc Equipment", DEFAULT_MARGINS.equipment, addRows.miscEquipment],
    ].forEach(([label, marginPct, sheetRow]) => {
      categories.push({
        label: label as string,
        marginPct: marginPct as number,
        costFormula: `SUM('Additional Items'!F${sheetRow}:F${sheetRow})`,
        sellFormulaRef: `SUM('Additional Items'!H${sheetRow}:H${sheetRow})`,
        result: 0,
      });
    });
  }

  const catStartRow = row;
  for (const { label, result, marginPct, costFormula, sellFormulaRef, showPricePerSqFt } of categories) {
    const r = ws.getRow(row);
    r.getCell(2).value = label;
    r.getCell(2).font = { name: "Calibri", size: 10 };
    if (costFormula) {
      r.getCell(3).value = { formula: costFormula, result };
    } else {
      r.getCell(3).value = result;
    }
    r.getCell(3).numFmt = FMT_USD;
    r.getCell(4).value = sellFormulaRef
      ? { formula: sellFormulaRef, result: result > 0 ? round2(result / (1 - marginPct)) : 0 }
      : { formula: sellFormula(row), result: result > 0 ? round2(result / (1 - marginPct)) : 0 };
    r.getCell(4).numFmt = FMT_USD;
    r.getCell(5).value = { formula: marginFormula(row), result: result > 0 ? round2(result / (1 - marginPct) - result) : 0 };
    r.getCell(5).numFmt = FMT_USD;
    r.getCell(6).value = marginPct; r.getCell(6).numFmt = FMT_PCT;
    r.getCell(7).value = showPricePerSqFt && totalDisplaySqFt > 0 ? { formula: `IFERROR(C${row}/${totalDisplaySqFt},0)`, result: round2(result / totalDisplaySqFt) } : "";
    r.getCell(7).numFmt = FMT_USD;
    stripe(r, 7, row % 2 === 0);
    row++;
  }
  const catEndRow = row - 1;

  // Subtotal
  row++;
  const stR = ws.getRow(row);
  stR.getCell(2).value = "SUBTOTAL";
  stR.getCell(3).value = { formula: `SUM(C${catStartRow}:C${catEndRow})`, result: grandCost };
  stR.getCell(3).numFmt = FMT_USD;
  stR.getCell(4).value = { formula: `SUM(D${catStartRow}:D${catEndRow})`, result: grandSelling };
  stR.getCell(4).numFmt = FMT_USD;
  stR.getCell(5).value = { formula: `IFERROR(D${row}-C${row},0)`, result: grandMargin };
  stR.getCell(5).numFmt = FMT_USD;
  stR.getCell(6).value = { formula: `IFERROR(1-C${row}/D${row},0)`, result: grandMarginPct };
  stR.getCell(6).numFmt = FMT_PCT;
  stR.getCell(7).value = totalDisplaySqFt > 0 ? { formula: `IFERROR(C${row}/${totalDisplaySqFt},0)`, result: round2(grandCost / totalDisplaySqFt) } : "";
  stR.getCell(7).numFmt = FMT_USD;
  totalStyle(stR, 7, C.MEDIUM_GRAY);
  const subtotalRow = row;
  row++;

  const taxRateVal = ov?.taxRate ?? 0;
  const budgetBondRateVal = ov?.servicesMarginPct === 0 ? 0 : (ov?.bondRate ?? 0);

  // Tax — pass-through: same amount in cost AND sell columns (zero margin impact)
  const taxR = ws.getRow(row);
  taxR.getCell(2).value = "TAX";
  taxR.getCell(3).value = taxRateVal > 0
    ? { formula: `D${subtotalRow}*${taxRateVal}`, result: round2(grandSelling * taxRateVal) }
    : 0;
  taxR.getCell(3).numFmt = FMT_USD;
  taxR.getCell(4).value = taxRateVal > 0
    ? { formula: `D${subtotalRow}*${taxRateVal}`, result: round2(grandSelling * taxRateVal) }
    : 0;
  taxR.getCell(4).numFmt = FMT_USD;
  taxR.getCell(5).value = 0; // No margin on tax (pass-through)
  taxR.getCell(5).numFmt = FMT_USD;
  taxR.getCell(6).value = 0; // 0% margin on tax
  taxR.getCell(6).numFmt = FMT_PCT;
  stripe(taxR, 7, row % 2 === 0);
  const taxRow = row;
  row++;

  // Bond — pass-through: same amount in cost AND sell columns (zero margin impact)
  const bondR = ws.getRow(row);
  bondR.getCell(2).value = "BOND";
  bondR.getCell(3).value = budgetBondRateVal > 0
    ? { formula: `D${subtotalRow}*${budgetBondRateVal}`, result: round2(grandSelling * budgetBondRateVal) }
    : 0;
  bondR.getCell(3).numFmt = FMT_USD;
  bondR.getCell(4).value = budgetBondRateVal > 0
    ? { formula: `D${subtotalRow}*${budgetBondRateVal}`, result: round2(grandSelling * budgetBondRateVal) }
    : 0;
  bondR.getCell(4).numFmt = FMT_USD;
  bondR.getCell(5).value = 0; // No margin on bond (pass-through)
  bondR.getCell(5).numFmt = FMT_USD;
  bondR.getCell(6).value = 0; // 0% margin on bond
  bondR.getCell(6).numFmt = FMT_PCT;
  stripe(bondR, 7, row % 2 === 0);
  const bondRow = row;
  row++;

  // Grand total — must match the authoritative Margin Analysis / Project Overview bottom line exactly
  // Includes subtotal + tax + bond so it matches MA's BASE BID GRAND TOTAL
  const gtR = ws.getRow(row);
  gtR.getCell(2).value = "GRAND TOTAL";
  const taxAmt = round2(grandSelling * taxRateVal);
  const bondAmt = round2(grandSelling * budgetBondRateVal);
  const documentTotal = round2(grandSelling + taxAmt + bondAmt);
  const documentMargin = round2(documentTotal - grandCost);
  const documentMarginPct = documentTotal > 0 ? round2(documentMargin / documentTotal) : 0;
  // Tax/bond pass-through: add to BOTH cost and sell so margin isn't inflated
  const grandCostWithPassthrough = round2(grandCost + taxAmt + bondAmt);
  const documentMarginFixed = round2(documentTotal - grandCostWithPassthrough);
  const documentMarginPctFixed = documentTotal > 0 ? round2(documentMarginFixed / documentTotal) : 0;
  gtR.getCell(3).value = { formula: `C${subtotalRow}+C${taxRow}+C${bondRow}`, result: grandCostWithPassthrough }; gtR.getCell(3).numFmt = FMT_USD;
  gtR.getCell(4).value = { formula: `D${subtotalRow}+D${taxRow}+D${bondRow}`, result: documentTotal }; gtR.getCell(4).numFmt = FMT_USD;
  gtR.getCell(5).value = { formula: `IFERROR(D${row}-C${row},0)`, result: documentMarginFixed }; gtR.getCell(5).numFmt = FMT_USD;
  gtR.getCell(6).value = { formula: `IFERROR(1-C${row}/D${row},0)`, result: documentMarginPctFixed }; gtR.getCell(6).numFmt = FMT_PCT;
  gtR.getCell(7).value = totalDisplaySqFt > 0 ? { formula: `IFERROR(C${row}/${totalDisplaySqFt},0)`, result: round2(grandCost / totalDisplaySqFt) } : "";
  gtR.getCell(7).numFmt = FMT_USD;
  totalStyle(gtR, 7, C.ANC_BLUE);
  for (let c = 2; c <= 7; c++) {
    gtR.getCell(c).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  }

  // Note: grand totals match between MA and Budget Summary since both
  // use the same per-display ComputedDisplay data and margin rates.
}

// ─── 1. MARGIN ANALYSIS ─────────────────────────────────────────────────────

// DEFAULT_MARGINS imported from computeDisplayCosts.ts

function buildMarginAnalysis(
  wb: ExcelJS.Workbook,
  projectName: string,
  clientName: string,
  date: string,
  displays: ComputedDisplay[],
  altDisplays: ComputedDisplay[],
  grandCost: number,
  grandSelling: number,
  grandMargin: number,
  grandMarginPct: number,
  includeBond: boolean,
  ov?: FinancialOverrides,
  installTabNames?: string[],
  costCenterRefs?: {
    cms?: CostCenterSheetRefs;
    scoring?: CostCenterSheetRefs;
    venueServices?: CostCenterSheetRefs;
    bundle?: CostCenterSheetRefs;
    additional?: AdditionalItemsSheetRefs;
  },
): number {
  const ws = wb.addWorksheet("Margin Analysis", {
    properties: { tabColor: { argb: C.ANC_BLUE } },
  });

  //   A     B                      C      D              E         F          G
  //   [sp]  Zone / Category        Cost   Selling Price  Margin $  Margin %   Rate
  const colWidths = [4, 44, 16, 16, 16, 12, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(7).hidden = true; // Col G: editable rates (tax/bond/tariff) — hidden

  setTitle(ws, "F", `${projectName} — Margin Analysis`);
  setMeta(ws, "F", `${clientName} | ${date} | ANC Proposal Engine`);

  // Column headers
  let row = 4;
  const headers = ["", "Zone / Category", "Cost", "Selling Price", "Margin $", "Margin %"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.ANC_BLUE);
  });
  ws.getRow(row).height = 28;
  row++;

  // Helpers for sub-line rows
  const subFont = { name: "Calibri", color: { argb: "FF666666" }, size: 10 };
  const subFontBold = { name: "Calibri", bold: true, size: 10 };
  // Guarded formulas: IFERROR prevents #VALUE! / #DIV/0! on zero-cost or empty rows
  const sellFormula = (r: number) => `IFERROR(C${r}/(1-F${r}),0)`;
  const marginDollarFormula = (r: number) => `IFERROR(D${r}-C${r},0)`;
  const blendedMarginFormula = (r: number) => `IFERROR(1-C${r}/D${r},0)`;

  function writeCategory(label: string, cost: number, marginPct: number, costFormula?: string): void {
    const r = ws.getRow(row);
    r.getCell(2).value = `    ${label}`; r.getCell(2).font = subFont;
    if (cost === 0) {
      r.getCell(3).value = 0;
    } else if (costFormula) {
      r.getCell(3).value = { formula: costFormula, result: cost };
    } else {
      r.getCell(3).value = cost;
    }
    r.getCell(3).numFmt = FMT_USD; r.getCell(3).font = subFont;
    r.getCell(4).value = cost > 0
      ? { formula: sellFormula(row), result: round2(cost / (1 - marginPct)) }
      : 0;
    r.getCell(4).numFmt = FMT_USD; r.getCell(4).font = subFont;
    r.getCell(5).value = cost > 0
      ? { formula: marginDollarFormula(row), result: round2(cost / (1 - marginPct) - cost) }
      : 0;
    r.getCell(5).numFmt = FMT_USD; r.getCell(5).font = subFont;
    r.getCell(6).value = marginPct; r.getCell(6).numFmt = FMT_PCT; r.getCell(6).font = subFont;
    row++;
  }

  // Track per-screen grand total rows for BASE BID GRAND TOTAL
  const screenGrandTotalRows: number[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // PER-SCREEN SECTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  displays.forEach((d, idx) => {
    // ─── Screen header ───
    const headerR = ws.getRow(row);
    const screenLabel = d.spec.name + (d.spec.location ? ` — ${d.spec.location}` : "");
    headerR.getCell(2).value = screenLabel;
    headerR.font = { bold: true, color: { argb: C.WHITE }, size: 11, name: "Calibri" };
    headerR.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.DARK_HEADER } };
    headerR.getCell(4).value = "Selling Price";
    headerR.getCell(4).font = { bold: true, color: { argb: C.WHITE }, size: 11, name: "Calibri" };
    headerR.getCell(4).alignment = { horizontal: "center" };
    row++;

    // ─── Category rows — each with Cost | Selling | Margin$ | Margin% ───
    // Margin priority: financial override > size-based > default
    const catStartRow = row;
    const ledHardwareWithSpares = d.ledHardwareCost + d.sparePartsCost;
    const hwMargin = ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware;
    // Flat margin across all categories (Natalia confirmed March 2026)
    const svcMargin = ov?.servicesMarginPct ?? hwMargin;

    // Cross-sheet formula refs: LED Cost Sheet data row = 4 + display index
    const ledSheetRow = 4 + idx;
    // Install sheet cross-sheet refs (fixed structure — row numbers are deterministic)
    // Struct subtotal=26, Labor subtotal=35, PM item=34, Elec subtotal=44, Eng subtotal=52
    const instTab = installTabNames?.[idx];
    const instRef = instTab ? `'${instTab}'` : null;

    const ledCostResult = ledHardwareWithSpares + d.shippingCost + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost;
    const ledSellResult = hwMargin < 1 ? round2(ledCostResult / (1 - hwMargin)) : ledCostResult;
    const ledRow = row;
    // LED Hardware: hard values — previous formula refs were wrong (Q=LED+spares only, S=shipping)
    // Correct source is T (Total Cost) and V (Selling Price), but hard values prevent any drift
    writeCategory("LED Hardware", ledCostResult, hwMargin, `'LED Cost Sheet'!T${ledSheetRow}`);
    ws.getCell(ledRow, 4).value = { formula: `'LED Cost Sheet'!V${ledSheetRow}`, result: ledSellResult };
    ws.getCell(ledRow, 4).numFmt = FMT_USD; ws.getCell(ledRow, 4).font = subFont;
    ws.getCell(ledRow, 5).value = { formula: marginDollarFormula(ledRow), result: round2(ledSellResult - ledCostResult) };
    ws.getCell(ledRow, 5).numFmt = FMT_USD; ws.getCell(ledRow, 5).font = subFont;
    ws.getCell(ledRow, 6).value = hwMargin;
    ws.getCell(ledRow, 6).numFmt = FMT_PCT; ws.getCell(ledRow, 6).font = subFont;
    writeCategory("Structural Materials", d.structuralMaterialsCost, svcMargin, instRef ? `${instRef}!I26` : undefined);
    writeCategory("Structural Labor & LED Installation", d.structuralLaborCost, svcMargin, instRef ? `${instRef}!I35-${instRef}!I34` : undefined);
    writeCategory("Electrical & Data", d.electricalCost, svcMargin, instRef ? `${instRef}!I44` : undefined);
    writeCategory("PM / General Conditions / Travel", d.pmCost + d.travelCost, svcMargin, instRef ? `${instRef}!I34` : undefined);
    writeCategory("Engineering & Permits", d.engCost, svcMargin, instRef ? `${instRef}!I52` : undefined);
    const catEndRow = row - 1;

    // ─── SUBTOTAL — SUM of category rows ───
    const subtotalRow = row;
    const stR = ws.getRow(row);
    stR.getCell(2).value = "    SUBTOTAL"; stR.getCell(2).font = subFontBold;
    stR.getCell(3).value = { formula: `SUM(C${catStartRow}:C${catEndRow})`, result: d.totalCost };
    stR.getCell(3).numFmt = FMT_USD; stR.getCell(3).font = subFontBold;
    stR.getCell(4).value = { formula: `SUM(D${catStartRow}:D${catEndRow})`, result: d.sellingPrice };
    stR.getCell(4).numFmt = FMT_USD; stR.getCell(4).font = subFontBold;
    stR.getCell(5).value = { formula: marginDollarFormula(row), result: d.marginDollars };
    stR.getCell(5).numFmt = FMT_USD; stR.getCell(5).font = subFontBold;
    stR.getCell(6).value = { formula: blendedMarginFormula(row), result: d.marginPct };
    stR.getCell(6).numFmt = FMT_PCT; stR.getCell(6).font = subFontBold;
    row++;

    // ─── TAX — formula: =D{subtotal} * rate ───
    const taxRow = row;
    // ─── TAX — pass-through: same amount in cost AND sell (zero margin impact) ───
    const txR = ws.getRow(row);
    txR.getCell(2).value = "    TAX"; txR.getCell(2).font = subFont;
    const taxRateVal = ov?.taxRate ?? 0;
    txR.getCell(3).value = taxRateVal > 0
      ? { formula: `D${subtotalRow}*G${row}`, result: round2(d.sellingPrice * taxRateVal) }
      : 0;
    txR.getCell(3).numFmt = FMT_USD;
    txR.getCell(4).value = taxRateVal > 0
      ? { formula: `D${subtotalRow}*G${row}`, result: round2(d.sellingPrice * taxRateVal) }
      : 0;
    txR.getCell(4).numFmt = FMT_USD;
    txR.getCell(5).value = 0; // No margin on tax
    txR.getCell(5).numFmt = FMT_USD;
    txR.getCell(7).value = taxRateVal; txR.getCell(7).numFmt = FMT_PCT; inputCell(txR.getCell(7));
    row++;

    // ─── BOND — pass-through: same amount in cost AND sell (zero margin impact) ───
    const bondRow = row;
    const bdR = ws.getRow(row);
    bdR.getCell(2).value = "    BOND"; bdR.getCell(2).font = subFont;
    const bondRateVal = ov?.servicesMarginPct === 0 ? 0 : (ov?.bondRate ?? (includeBond ? rc("bond_tax.bond_rate", BOND_RATE) : 0));
    bdR.getCell(3).value = bondRateVal > 0
      ? { formula: `D${subtotalRow}*G${row}`, result: round2(d.sellingPrice * bondRateVal) }
      : 0;
    bdR.getCell(3).numFmt = FMT_USD;
    bdR.getCell(4).value = bondRateVal > 0
      ? { formula: `D${subtotalRow}*G${row}`, result: round2(d.sellingPrice * bondRateVal) }
      : 0;
    bdR.getCell(4).numFmt = FMT_USD;
    bdR.getCell(5).value = 0; // No margin on bond
    bdR.getCell(5).numFmt = FMT_USD;
    bdR.getCell(7).value = bondRateVal; bdR.getCell(7).numFmt = FMT_PCT; inputCell(bdR.getCell(7));
    row++;

    // ─── TARIFF — formula: =D{subtotal} * rate ───
    const tariffRow = row;
    const trR = ws.getRow(row);
    trR.getCell(2).value = "    TARIFF"; trR.getCell(2).font = subFont;
    trR.getCell(3).value = 0;
    trR.getCell(3).numFmt = FMT_USD;
    trR.getCell(4).value = 0;
    trR.getCell(4).numFmt = FMT_USD;
    trR.getCell(5).value = 0;
    trR.getCell(5).numFmt = FMT_USD;
    trR.getCell(7).value = 0; trR.getCell(7).numFmt = FMT_PCT; inputCell(trR.getCell(7));
    row++;

    // ─── GRAND TOTAL — Subtotal + Tax + Bond + Tariff ───
    const grandRow = row;
    const grR = ws.getRow(row);
    grR.getCell(2).value = "    GRAND TOTAL"; grR.getCell(2).font = { bold: true, name: "Calibri", size: 11 };
    // Cost includes tax/bond pass-through so margin isn't inflated
    const grandCostPerScreen = d.totalCost + round2(d.sellingPrice * taxRateVal) + round2(d.sellingPrice * bondRateVal);
    grR.getCell(3).value = { formula: `C${subtotalRow}+C${taxRow}+C${bondRow}+C${tariffRow}`, result: grandCostPerScreen };
    grR.getCell(3).numFmt = FMT_USD; grR.getCell(3).font = { bold: true, name: "Calibri" };
    const grandSell = d.sellingPrice + round2(d.sellingPrice * taxRateVal) + round2(d.sellingPrice * bondRateVal) + 0;
    grR.getCell(4).value = { formula: `D${subtotalRow}+D${taxRow}+D${bondRow}+D${tariffRow}`, result: grandSell };
    grR.getCell(4).numFmt = FMT_USD; grR.getCell(4).font = { bold: true, name: "Calibri" };
    grR.getCell(5).value = { formula: `IFERROR(D${grandRow}-C${grandRow},0)`, result: grandSell - d.totalCost };
    grR.getCell(5).numFmt = FMT_USD; grR.getCell(5).font = { bold: true, name: "Calibri" };
    grR.getCell(6).value = { formula: `IFERROR(1-C${grandRow}/D${grandRow},0)`, result: grandSell > 0 ? 1 - (d.totalCost / grandSell) : 0 };
    grR.getCell(6).numFmt = FMT_PCT; grR.getCell(6).font = { bold: true, name: "Calibri" };
    // Light bottom border to separate from next section
    for (let c = 2; c <= 6; c++) {
      grR.getCell(c).border = { bottom: { style: "medium", color: { argb: C.ANC_BLUE } } };
    }
    screenGrandTotalRows.push(grandRow);

    // Row grouping: collapse detail rows (categories through tariff) for large projects
    // Only the header + grand total remain visible when collapsed in Excel
    for (let r = catStartRow; r <= grandRow - 1; r++) {
      ws.getRow(r).outlineLevel = 1;
    }
    row++;

    // ─── ALT ADD/DEDUCT lines — show delta from base ───
    const baseName = d.spec.name.toLowerCase().trim();
    const matchingAlts = altDisplays.filter((alt) => {
      const altName = alt.spec.name.toLowerCase().trim();
      // Match: alt name contains base name, or shares a prefix before " — Alt"
      return altName.includes(baseName) || baseName.includes(altName.replace(/\s*—\s*alt.*$/i, "").trim());
    });

    if (matchingAlts.length > 0) {
      const altHeaderR = ws.getRow(row);
      altHeaderR.getCell(2).value = "    Alternates — Add/Deduct from Above";
      altHeaderR.getCell(2).font = { bold: true, italic: true, name: "Calibri", size: 10, color: { argb: "FF6C757D" } };
      row++;

      for (const alt of matchingAlts) {
        const deltaCost = round2(alt.totalCost - d.totalCost);
        const deltaSell = round2(alt.sellingPrice - d.sellingPrice);
        const altR = ws.getRow(row);
        altR.getCell(2).value = `      ${alt.spec.alternateDescription || alt.spec.name}`;
        altR.getCell(2).font = { italic: true, name: "Calibri", size: 10, color: { argb: "FF6C757D" } };
        altR.getCell(3).value = deltaCost;
        altR.getCell(3).numFmt = "+$#,##0;-$#,##0;$0";
        altR.getCell(3).font = { italic: true, name: "Calibri", size: 10, color: { argb: deltaCost >= 0 ? "FFDC3545" : "FF28A745" } };
        altR.getCell(4).value = deltaSell;
        altR.getCell(4).numFmt = "+$#,##0;-$#,##0;$0";
        altR.getCell(4).font = { italic: true, name: "Calibri", size: 10, color: { argb: deltaSell >= 0 ? "FFDC3545" : "FF28A745" } };
        row++;
      }
    }

    row++; // blank separator between screens
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL SECTIONS (CMS, Scoring) — single-line placeholders
  // ═══════════════════════════════════════════════════════════════════════════

  // Section header for CMS / Scoring
  row++; // separator
  const addlHdrR = ws.getRow(row);
  addlHdrR.getCell(2).value = "ADDITIONAL COST CENTERS";
  for (let c = 2; c <= 6; c++) { hdr(addlHdrR.getCell(c), C.DARK_HEADER); }
  addlHdrR.height = 24;
  row++;

  // CMS — linked to CMS sheet total
  const cmsCost = ov?.cmsAllocation ?? 0;
  const cmsRow = row;
  const cmsR = ws.getRow(row);
  cmsR.getCell(2).value = "CMS (Content Management System)";
  cmsR.getCell(2).font = { bold: true, name: "Calibri" };
  cmsR.getCell(3).value = costCenterRefs?.cms
    ? { formula: `SUM(CMS!${costCenterRefs.cms.subtotalCell}:${costCenterRefs.cms.subtotalCell})`, result: cmsCost }
    : cmsCost;
  cmsR.getCell(3).numFmt = FMT_USD;
  cmsR.getCell(6).value = DEFAULT_MARGINS.cms; cmsR.getCell(6).numFmt = FMT_PCT; inputCell(cmsR.getCell(6));
  cmsR.getCell(4).value = costCenterRefs?.cms?.sellCell
    ? { formula: `SUM(CMS!${costCenterRefs.cms.sellCell}:${costCenterRefs.cms.sellCell})`, result: round2(cmsCost / (1 - DEFAULT_MARGINS.cms)) }
    : cmsCost > 0
    ? { formula: sellFormula(row), result: round2(cmsCost / (1 - DEFAULT_MARGINS.cms)) }
    : 0;
  cmsR.getCell(4).numFmt = FMT_USD;
  cmsR.getCell(5).value = costCenterRefs?.cms?.marginCell
    ? { formula: `SUM(CMS!${costCenterRefs.cms.marginCell}:${costCenterRefs.cms.marginCell})`, result: round2(cmsCost / (1 - DEFAULT_MARGINS.cms) - cmsCost) }
    : cmsCost > 0
    ? { formula: marginDollarFormula(row), result: round2(cmsCost / (1 - DEFAULT_MARGINS.cms) - cmsCost) }
    : 0;
  cmsR.getCell(5).numFmt = FMT_USD;
  screenGrandTotalRows.push(cmsRow);
  row++;

  // Scoring — use override allocation if set, otherwise editable $0 placeholder
  const scoringCost = ov?.scoringAllocation ?? 0;
  const scoringRow = row;
  const scR = ws.getRow(row);
  scR.getCell(2).value = "Scoring System";
  scR.getCell(2).font = { bold: true, name: "Calibri" };
  scR.getCell(3).value = costCenterRefs?.scoring
    ? { formula: `SUM(Scoring!${costCenterRefs.scoring.subtotalCell}:${costCenterRefs.scoring.subtotalCell})`, result: scoringCost }
    : scoringCost;
  scR.getCell(3).numFmt = FMT_USD;
  scR.getCell(6).value = DEFAULT_MARGINS.scoring; scR.getCell(6).numFmt = FMT_PCT; inputCell(scR.getCell(6));
  scR.getCell(4).value = costCenterRefs?.scoring?.sellCell
    ? { formula: `SUM(Scoring!${costCenterRefs.scoring.sellCell}:${costCenterRefs.scoring.sellCell})`, result: round2(scoringCost / (1 - DEFAULT_MARGINS.scoring)) }
    : scoringCost > 0
    ? { formula: sellFormula(row), result: round2(scoringCost / (1 - DEFAULT_MARGINS.scoring)) }
    : 0;
  scR.getCell(4).numFmt = FMT_USD;
  scR.getCell(5).value = costCenterRefs?.scoring?.marginCell
    ? { formula: `SUM(Scoring!${costCenterRefs.scoring.marginCell}:${costCenterRefs.scoring.marginCell})`, result: round2(scoringCost / (1 - DEFAULT_MARGINS.scoring) - scoringCost) }
    : scoringCost > 0
    ? { formula: marginDollarFormula(row), result: round2(scoringCost / (1 - DEFAULT_MARGINS.scoring) - scoringCost) }
    : 0;
  scR.getCell(5).numFmt = FMT_USD;
  screenGrandTotalRows.push(scoringRow);
  row++;
  if (costCenterRefs?.venueServices) {
    const venueR = ws.getRow(row);
    venueR.getCell(2).value = "Venue Services";
    venueR.getCell(2).font = { bold: true, name: "Calibri" };
    venueR.getCell(3).value = { formula: `SUM('Venue Services'!${costCenterRefs.venueServices.subtotalCell}:${costCenterRefs.venueServices.subtotalCell})`, result: 0 };
    venueR.getCell(3).numFmt = FMT_USD;
    venueR.getCell(6).value = ov?.venueServiceMarginPct ?? DEFAULT_MARGINS.install;
    venueR.getCell(6).numFmt = FMT_PCT;
    venueR.getCell(4).value = costCenterRefs.venueServices.sellCell
      ? { formula: `SUM('Venue Services'!${costCenterRefs.venueServices.sellCell}:${costCenterRefs.venueServices.sellCell})`, result: 0 }
      : 0;
    venueR.getCell(4).numFmt = FMT_USD;
    venueR.getCell(5).value = costCenterRefs.venueServices.marginCell
      ? { formula: `SUM('Venue Services'!${costCenterRefs.venueServices.marginCell}:${costCenterRefs.venueServices.marginCell})`, result: 0 }
      : 0;
    venueR.getCell(5).numFmt = FMT_USD;
    screenGrandTotalRows.push(row);
    row++;
  }
  if (costCenterRefs?.additional) {
    const additionalRows: Array<[string, number]> = [
      ["Game Clock", costCenterRefs.additional.rows.gameClock],
      ["Pitch Clocks", costCenterRefs.additional.rows.pitchClocks],
      ["OES / MIS / Timing", costCenterRefs.additional.rows.oesMis],
      ["DMX / Misc Equipment", costCenterRefs.additional.rows.miscEquipment],
    ];
    additionalRows.forEach(([label, sourceRow]) => {
      const addR = ws.getRow(row);
      addR.getCell(2).value = label;
      addR.getCell(2).font = { bold: true, name: "Calibri" };
      addR.getCell(3).value = { formula: `SUM('Additional Items'!F${sourceRow}:F${sourceRow})`, result: 0 };
      addR.getCell(3).numFmt = FMT_USD;
      addR.getCell(4).value = { formula: `SUM('Additional Items'!H${sourceRow}:H${sourceRow})`, result: 0 };
      addR.getCell(4).numFmt = FMT_USD;
      addR.getCell(5).value = { formula: `SUM('Additional Items'!I${sourceRow}:I${sourceRow})`, result: 0 };
      addR.getCell(5).numFmt = FMT_USD;
      addR.getCell(6).value = { formula: `SUM('Additional Items'!G${sourceRow}:G${sourceRow})`, result: DEFAULT_MARGINS.equipment };
      addR.getCell(6).numFmt = FMT_PCT;
      screenGrandTotalRows.push(row);
      row++;
    });
  }
  row++; // separator

  // ═══════════════════════════════════════════════════════════════════════════
  // BASE BID GRAND TOTAL — sums all screen grand totals + CMS + Scoring
  // ═══════════════════════════════════════════════════════════════════════════
  const costGtRefs = screenGrandTotalRows.map((r) => `C${r}`).join(",");
  const sellGtRefs = screenGrandTotalRows.map((r) => `D${r}`).join(",");

  const baseBidRow = row;
  const bbR = ws.getRow(row);
  bbR.getCell(2).value = "BASE BID GRAND TOTAL";
  // Result must include tax+bond to match the per-screen grand total formulas
  const bbTaxRate = ov?.taxRate ?? 0;
  const bbBondRate = ov?.servicesMarginPct === 0 ? 0 : (ov?.bondRate ?? (includeBond ? 0.015 : 0));
  const baseBidCost = displays.reduce((s, d) => {
    const sell = d.sellingPrice;
    return s + d.totalCost + round2(sell * bbTaxRate) + round2(sell * bbBondRate);
  }, 0);
  const baseBidSelling = displays.reduce((s, d) => {
    const sell = d.sellingPrice;
    return s + sell + round2(sell * bbTaxRate) + round2(sell * bbBondRate);
  }, 0);
  const baseBidMargin = round2(baseBidSelling - baseBidCost);
  const baseBidMarginPct = baseBidSelling > 0 ? round2(baseBidMargin / baseBidSelling) : 0;
  bbR.getCell(3).value = { formula: `SUM(${costGtRefs})`, result: round2(baseBidCost) };
  bbR.getCell(3).numFmt = FMT_USD;
  bbR.getCell(4).value = { formula: `SUM(${sellGtRefs})`, result: round2(baseBidSelling) };
  bbR.getCell(4).numFmt = FMT_USD;
  bbR.getCell(5).value = { formula: `IFERROR(D${baseBidRow}-C${baseBidRow},0)`, result: baseBidMargin };
  bbR.getCell(5).numFmt = FMT_USD;
  bbR.getCell(6).value = { formula: `IFERROR(1-C${baseBidRow}/D${baseBidRow},0)`, result: baseBidMarginPct };
  bbR.getCell(6).numFmt = FMT_PCT;
  totalStyle(bbR, 6, C.ANC_BLUE);
  for (let c = 2; c <= 6; c++) {
    bbR.getCell(c).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  }
  // Toggleable: row grouping so user can collapse/expand the grand total
  bbR.outlineLevel = 1;

  return baseBidRow; // Return row number for cross-sheet formula references
}

// ─── 2. LED COST SHEET ──────────────────────────────────────────────────────

function buildLedCostSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
  resolveProduct: ProductResolver,
  ov?: FinancialOverrides,
  bundleSubtotalRows: number[] = [],
): void {
  const ws = wb.addWorksheet("LED Cost Sheet", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  // Full format matching the online version — includes electrical, pricing, margins
  const COLS = 26;
  const colWidths = [36, 8, 8, 8, 18, 14, 10, 10, 10, 10, 10, 8, 12, 10, 10, 12, 12, 14, 14, 14, 14, 12, 16, 12, 14, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "W", `${projectName} — LED Cost Sheet`);

  // Build product data sheet for dropdown + VLOOKUP formulas on LED Cost Sheet
  // Columns: A=Name, B=Vendor, C=Pitch(mm), D=$/SqFt, E=NITs, F=Weight(lbs/m²), G=Power(W/m²)
  const allProducts = getAllProducts();
  const sortedProducts = [...allProducts]
    .filter((p) => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  const productNames = sortedProducts.map((p) => p.name);
  let productSheet = wb.getWorksheet("_Products");
  if (!productSheet) {
    productSheet = wb.addWorksheet("_Products", { state: "veryHidden" });
    sortedProducts.forEach((p, i) => {
      const r = i + 1;
      productSheet!.getCell(r, 1).value = p.name;                       // A: Name
      productSheet!.getCell(r, 2).value = p.manufacturer || "";          // B: Vendor
      productSheet!.getCell(r, 3).value = p.pitchMm;                    // C: Pitch (mm)
      // D: $/SqFt — from product-specific cost table or pitch-based rate card
      const costPerSqm = HARDWARE_COST_PER_SQM[p.id];
      const costPerSqFt = costPerSqm
        ? round2(costPerSqm / 10.7639)
        : (LED_COST_PER_SQFT_BY_PITCH[String(p.pitchMm)] ?? 0);
      productSheet!.getCell(r, 4).value = costPerSqFt;                  // D: $/SqFt
      productSheet!.getCell(r, 5).value = p.brightnessNits;             // E: NITs
      productSheet!.getCell(r, 6).value = round2(p.weightDensityLbm2);  // F: Weight (lbs/m²)
      productSheet!.getCell(r, 7).value = round2(p.powerDensityWm2);    // G: Power (W/m²)
    });
  }
  const productListRef = `'_Products'!$A$1:$A$${productNames.length}`;
  const prodRange = `'_Products'!$A$1:$G$${productNames.length}`;

  // Master LED Margin Override (yellow cell) — changing this overrides all display margins
  const masterMarginRow = 2;
  const masterMarginLabel = ws.getCell(masterMarginRow, 21); // column U
  masterMarginLabel.value = "LED Margin Override →";
  masterMarginLabel.font = { bold: true, name: "Calibri", size: 11 };
  masterMarginLabel.alignment = { horizontal: "right", vertical: "middle" };
  const masterMarginCell = ws.getCell(masterMarginRow, 22); // column V
  masterMarginCell.value = Number(ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware);
  masterMarginCell.numFmt = FMT_PCT;
  masterMarginCell.font = { bold: true, name: "Calibri", size: 12 };
  masterMarginCell.alignment = { horizontal: "center", vertical: "middle" };
  masterMarginCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  masterMarginCell.border = {
    top: { style: "thin", color: { argb: "FFD9D9D9" } },
    bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
    left: { style: "thin", color: { argb: "FFD9D9D9" } },
    right: { style: "thin", color: { argb: "FFD9D9D9" } },
  };

  let row = 3;

  // Header row — matches online format (with RFP reference columns)
  const hdrLabels = [
    "Display", "RFP H (ft)", "RFP W (ft)", "RFP NITs",
    "Vendor", "Product", "Pitch",
    "H (ft)", "W (ft)", "H (px)", "W (px)",
    "Qty", "Total SqFt",
    "Product NITs", "Service",
    "$/SqFt", "Display Cost", "Processor", "Shipping", "Total Cost",
    "Margin %", "Selling Price", "ANC Margin",
    "Weight (lbs)", "Total Power (W)", "BTU/hr",
  ];
  hdrLabels.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.DARK_HEADER);
  });
  ws.getRow(row).height = 28;
  row++;

  const dataStartRow = row;

  // Data rows — one per display
  // Column layout (1-indexed): A=Display, B=RFP H, C=RFP W, D=RFP NITs,
  // E=Vendor, F=Product, G=Pitch, H=H(ft), I=W(ft), J=H(px), K=W(px),
  // L=Qty, M=TotalSqFt, N=ProductNITs, O=Service,
  // P=$/SqFt, Q=DisplayCost, R=Processor, S=Shipping, T=TotalCost,
  // U=Margin%, V=SellingPrice, W=ANCMargin, X=Weight, Y=Power, Z=BTU
  displays.forEach((d, idx) => {
    const dr = ws.getRow(row);
    const isClockLike = isClockLikeDisplay(d);
    // A: Display name
    dr.getCell(1).value = d.spec.name + (d.spec.location ? ` — ${d.spec.location}` : "");
    dr.getCell(1).font = { bold: true, name: "Calibri" };
    // B-D: RFP reference dimensions (original extraction, never overwritten)
    const rfpH = Number(d.spec.heightFt) || 0;
    const rfpW = Number(d.spec.widthFt) || 0;
    const rfpNits = Number(d.spec.brightnessNits) || 0;
    dr.getCell(2).value = rfpH > 0 ? rfpH : ""; dr.getCell(2).numFmt = "0.00";
    dr.getCell(3).value = rfpW > 0 ? rfpW : ""; dr.getCell(3).numFmt = "0.00";
    dr.getCell(4).value = rfpNits > 0 ? rfpNits : "";
    // ═══════ All data cells use VLOOKUP formulas tied to product dropdown (F) ═══════
    // When user changes F (product), all dependent cells auto-recalculate.
    const selectedProduct = d.spec.selectedProductId ? resolveProduct(d.spec.selectedProductId) : null;
    const selectedPitch = (selectedProduct as any)?.pitchMm ?? (selectedProduct as any)?.pitch;
    const effectivePitch = selectedPitch ?? parsePitchFromProductName(d.spec.selectedProductName) ?? d.match?.module?.pitch ?? d.spec.pixelPitchMm;

    // E: Vendor — VLOOKUP from _Products col 2
    const vendorResult = selectedProduct?.manufacturer
      || d.match?.module?.manufacturer
      || (d.spec.environment === "outdoor" ? "Yaham" : "LG/Yaham");
    dr.getCell(5).value = { formula: `IFERROR(VLOOKUP(F${row},${prodRange},2,FALSE),"")`, result: vendorResult };
    // F: Product — must match a name in _Products for VLOOKUPs to work.
    // Priority: catalog name > matched module name > pitch-based best match > extracted name
    let productNameForF: string = "—";
    if (isClockLike) {
      productNameForF = selectedProduct?.name || d.spec.selectedProductName || "—";
    } else if (selectedProduct?.name && productNames.includes(selectedProduct.name)) {
      productNameForF = selectedProduct.name;
    } else if (d.match?.module?.name && productNames.includes(d.match.module.name)) {
      productNameForF = d.match.module.name;
    } else if (d.spec.selectedProductName && productNames.includes(d.spec.selectedProductName)) {
      productNameForF = d.spec.selectedProductName;
    } else {
      // No exact name match — find closest product by pitch + environment
      const pitch = effectivePitch || d.spec.pixelPitchMm || 0;
      const env = d.spec.environment || "indoor";
      if (pitch > 0) {
        const envProducts = sortedProducts.filter((p) =>
          p.environment === "Both" || p.environment.toLowerCase() === env.toLowerCase()
        );
        const bestMatch = envProducts.reduce((best, p) =>
          Math.abs(p.pitchMm - pitch) < Math.abs((best?.pitchMm ?? 999) - pitch) ? p : best
        , envProducts[0]);
        if (bestMatch) productNameForF = bestMatch.name;
      }
    }
    dr.getCell(6).value = productNameForF;
    // F: Product dropdown — allow user to change product in Excel
    dr.getCell(6).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [productListRef],
      showErrorMessage: true,
      errorTitle: "Invalid Product",
      error: "Select a product from the dropdown list",
    };
    // G: Pitch — VLOOKUP from _Products col 3 (numeric, formatted with "mm" suffix)
    const pitchResult = effectivePitch || 0;
    dr.getCell(7).value = { formula: `IFERROR(VLOOKUP(F${row},${prodRange},3,FALSE),0)`, result: pitchResult };
    dr.getCell(7).numFmt = '0.0##"mm"';
    dr.getCell(7).alignment = { horizontal: "center" };
    // H-I: H(ft), W(ft) — user-adjustable dimensions (hardcoded, not product-driven)
    const cellH = Number(d.heightFt) || 0;
    const cellW = Number(d.widthFt) || 0;
    dr.getCell(8).value = cellH; dr.getCell(8).numFmt = "0.00";
    dr.getCell(9).value = cellW; dr.getCell(9).numFmt = "0.00";
    // J-K: H(px), W(px) — formula from dimensions ÷ pitch
    const hPx = effectivePitch && d.heightFt ? Math.round(d.heightFt * 304.8 / effectivePitch) : (d.spec.heightPx || 0);
    const wPx = effectivePitch && d.widthFt ? Math.round(d.widthFt * 304.8 / effectivePitch) : (d.spec.widthPx || 0);
    dr.getCell(10).value = { formula: `IFERROR(ROUND(H${row}*304.8/G${row},0),0)`, result: hPx };
    dr.getCell(11).value = { formula: `IFERROR(ROUND(I${row}*304.8/G${row},0),0)`, result: wPx };
    // L: Qty
    const qty = Number(d.spec.quantity) || 1;
    dr.getCell(12).value = qty; dr.getCell(12).alignment = { horizontal: "center" };
    // M: Total SqFt = H(ft)*W(ft)*Qty
    const sqFtResult = Number(d.areaSqFt) || 0;
    dr.getCell(13).value = { formula: `H${row}*I${row}*L${row}`, result: isFinite(sqFtResult) ? sqFtResult : 0 };
    dr.getCell(13).numFmt = "#,##0";
    // N: Product NITs — VLOOKUP from _Products col 5
    const nitsResult = isClockLike ? 0 : (d.match?.module?.nits ?? d.spec.brightnessNits ?? 0);
    dr.getCell(14).value = isClockLike
      ? ""
      : { formula: `IFERROR(VLOOKUP(F${row},${prodRange},5,FALSE),0)`, result: nitsResult };
    dr.getCell(14).alignment = { horizontal: "center" };
    // O: Service
    dr.getCell(15).value = d.spec.serviceType || "Front";
    dr.getCell(15).alignment = { horizontal: "center" };
    // P: $/SqFt — VLOOKUP from _Products col 4
    const ledWithSpares = d.ledHardwareCost + d.sparePartsCost;
    const costPerSqFtResult = d.areaSqFt > 0 ? round2(ledWithSpares / d.areaSqFt) : 0;
    if (d.isTV) {
      const tvQty = Number(d.spec.quantity) || 1;
      const unitCost = tvQty > 0 ? round2(ledWithSpares / tvQty) : 0;
      dr.getCell(16).value = unitCost;
    } else {
      dr.getCell(16).value = { formula: `IFERROR(VLOOKUP(F${row},${prodRange},4,FALSE),0)`, result: costPerSqFtResult };
    }
    dr.getCell(16).numFmt = FMT_USD;
    // Q: Display Cost = $/SqFt × Total SqFt (formula, flows from P × M)
    dr.getCell(17).value = { formula: `P${row}*M${row}`, result: round2(ledWithSpares) };
    dr.getCell(17).numFmt = FMT_USD;
    const bundleSubtotalRow = bundleSubtotalRows[idx];
    // R: Processor — cross-sheet formula to Bundle Equipment
    const bundleEquipmentCost = d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost;
    dr.getCell(18).value = bundleSubtotalRow
      ? { formula: `SUM('Bundle Equipment'!E${bundleSubtotalRow}:E${bundleSubtotalRow})`, result: bundleEquipmentCost || 0 }
      : (bundleEquipmentCost || 0);
    dr.getCell(18).numFmt = FMT_USD;
    // S: Shipping — formula: $10/sqft, $500 minimum
    dr.getCell(19).value = { formula: `MAX(M${row}*10,500)`, result: d.shippingCost };
    dr.getCell(19).numFmt = FMT_USD;
    // T: Total Cost = Display Cost + Processor + Shipping
    const totalLedCost = round2(ledWithSpares + bundleEquipmentCost + d.shippingCost);
    dr.getCell(20).value = { formula: `Q${row}+R${row}+S${row}`, result: totalLedCost };
    dr.getCell(20).numFmt = FMT_USD;
    dr.getCell(20).font = { bold: true, name: "Calibri" };
    // U: Margin % — references master override cell V2
    const ledMarginPct = Number(ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware);
    dr.getCell(21).value = { formula: `V$${masterMarginRow}`, result: ledMarginPct }; dr.getCell(21).numFmt = FMT_PCT;
    // V: Selling Price = Cost / (1 - Margin%)
    const rowNum = dr.number;
    const ledOnlySellingPrice = ledMarginPct < 1 ? round2(totalLedCost / (1 - ledMarginPct)) : totalLedCost;
    dr.getCell(22).value = { formula: `IFERROR(T${rowNum}/(1-U${rowNum}),0)`, result: ledOnlySellingPrice };
    dr.getCell(22).numFmt = FMT_USD;
    dr.getCell(22).font = { bold: true, name: "Calibri" };
    // W: ANC Margin = Selling - Cost
    dr.getCell(23).value = { formula: `V${rowNum}-T${rowNum}`, result: round2(ledOnlySellingPrice - totalLedCost) };
    dr.getCell(23).numFmt = FMT_USD;

    // X: Weight — formula: area(m²) × weight density from _Products col 6
    const areaM2 = d.areaSqFt * 0.092903;
    const catalogMatch = selectedProduct
      ?? (effectivePitch ? getAllProducts().find((p) => Math.abs(p.pitchMm - effectivePitch) < 0.5) : null);
    const weightResult = catalogMatch
      ? Math.round(areaM2 * catalogMatch.weightDensityLbm2)
      : Math.round(d.areaSqFt * 5);
    const powerResult = catalogMatch
      ? Math.round(areaM2 * catalogMatch.powerDensityWm2)
      : 0;
    dr.getCell(24).value = { formula: `IFERROR(ROUND(M${row}*0.092903*VLOOKUP(F${row},${prodRange},6,FALSE),0),0)`, result: weightResult };
    dr.getCell(24).numFmt = "#,##0";
    // Y: Power — formula: area(m²) × power density from _Products col 7
    dr.getCell(25).value = { formula: `IFERROR(ROUND(M${row}*0.092903*VLOOKUP(F${row},${prodRange},7,FALSE),0),0)`, result: powerResult };
    dr.getCell(25).numFmt = "#,##0";
    // Z: BTU = Power × 3.412
    dr.getCell(26).value = { formula: `Y${row}*3.412`, result: Math.round(powerResult * 3.412) };
    dr.getCell(26).numFmt = "#,##0";

    stripe(dr, COLS, idx % 2 === 0);

    // Re-apply number formats AFTER stripe
    dr.getCell(2).numFmt = "0.00";   // RFP H (ft)
    dr.getCell(3).numFmt = "0.00";   // RFP W (ft)
    dr.getCell(8).numFmt = "0.00";   // H (ft)
    dr.getCell(9).numFmt = "0.00";   // W (ft)
    dr.getCell(10).numFmt = "0";     // H (px)
    dr.getCell(11).numFmt = "0";     // W (px)
    dr.getCell(12).numFmt = "0";     // Qty

    row++;
  });

  // Total row — include all displays in the workbook.
  // When includeAlternatesInBase is true (RFP analyzer export), alternates are
  // real displays that should be counted. Use simple SUM over all data rows.
  const baseDisplays = displays;
  const lastDataRow = dataStartRow + displays.length - 1;
  const baseSumFormula = (col: string) => `SUM(${col}${dataStartRow}:${col}${lastDataRow})`;

  row++;
  const gtR = ws.getRow(row);
  gtR.getCell(1).value = `TOTAL (${baseDisplays.length} displays)`;
  gtR.getCell(1).font = { bold: true, name: "Calibri" };
  // M: Total SqFt
  gtR.getCell(13).value = { formula: baseSumFormula("M"), result: baseDisplays.reduce((s, d) => s + d.areaSqFt, 0) };
  gtR.getCell(13).numFmt = "#,##0";
  // Q: Display Cost
  gtR.getCell(17).value = { formula: baseSumFormula("Q"), result: baseDisplays.reduce((s, d) => s + d.ledHardwareCost + d.sparePartsCost, 0) };
  gtR.getCell(17).numFmt = FMT_USD;
  // R: Processor
  gtR.getCell(18).value = { formula: baseSumFormula("R"), result: baseDisplays.reduce((s, d) => s + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost, 0) };
  gtR.getCell(18).numFmt = FMT_USD;
  // S: Shipping
  gtR.getCell(19).value = { formula: baseSumFormula("S"), result: baseDisplays.reduce((s, d) => s + d.shippingCost, 0) };
  gtR.getCell(19).numFmt = FMT_USD;
  // T: Total Cost
  gtR.getCell(20).value = { formula: baseSumFormula("T"), result: baseDisplays.reduce((s, d) => s + d.ledHardwareCost + d.sparePartsCost + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost + d.shippingCost, 0) };
  gtR.getCell(20).numFmt = FMT_USD;
  // U: Blended Margin %
  const totalCostResult = baseDisplays.reduce((s, d) => s + d.ledHardwareCost + d.sparePartsCost + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost + d.shippingCost, 0);
  const totalSellingResult = baseDisplays.reduce((s, d) => {
    const tc = d.ledHardwareCost + d.sparePartsCost + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost + d.shippingCost;
    const m = ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware;
    return s + (m < 1 ? round2(tc / (1 - m)) : tc);
  }, 0);
  const blendedMarginResult = totalSellingResult > 0 ? round2(1 - totalCostResult / totalSellingResult) : 0;
  gtR.getCell(21).value = { formula: `IFERROR(1-T${row}/V${row},0)`, result: blendedMarginResult };
  gtR.getCell(21).numFmt = FMT_PCT;
  // V: Total Selling Price
  gtR.getCell(22).value = { formula: baseSumFormula("V"), result: baseDisplays.reduce((s, d) => {
    const totalLedCost = d.ledHardwareCost + d.sparePartsCost + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost + d.shippingCost;
    const ledMargin = ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware;
    return s + (ledMargin < 1 ? round2(totalLedCost / (1 - ledMargin)) : totalLedCost);
  }, 0) };
  gtR.getCell(22).numFmt = FMT_USD;
  // W: ANC Margin
  gtR.getCell(23).value = { formula: baseSumFormula("W"), result: baseDisplays.reduce((s, d) => {
    const totalLedCost = d.ledHardwareCost + d.sparePartsCost + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost + d.shippingCost;
    const ledMargin = ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware;
    const selling = ledMargin < 1 ? round2(totalLedCost / (1 - ledMargin)) : totalLedCost;
    return s + (selling - totalLedCost);
  }, 0) };
  gtR.getCell(23).numFmt = FMT_USD;
  // X-Z: Weight, Power, BTU
  const baseWeightTotal = baseDisplays.reduce((s, d) => {
    const matchWeight = d.match ? Math.round(d.match.module.weightKg * 2.205 * d.match.totalModules) : 0;
    const w = d.spec.weightLbs || matchWeight || 0;
    return s + (Number(w) || 0);
  }, 0);
  const basePowerTotal = baseDisplays.reduce((s, d) => {
    const matchPower = d.match ? Math.round(d.match.module.maxPowerWatts * d.match.totalModules) : 0;
    const p = d.spec.maxPowerW || matchPower || 0;
    return s + (Number(p) || 0);
  }, 0);
  const baseBtuTotal = basePowerTotal > 0 ? Math.round(basePowerTotal * 3.412) : 0;
  gtR.getCell(24).value = { formula: baseSumFormula("X"), result: baseWeightTotal };
  gtR.getCell(24).numFmt = "#,##0";
  gtR.getCell(25).value = { formula: baseSumFormula("Y"), result: basePowerTotal };
  gtR.getCell(25).numFmt = "#,##0";
  gtR.getCell(26).value = { formula: baseSumFormula("Z"), result: baseBtuTotal };
  gtR.getCell(26).numFmt = "#,##0";
  totalStyle(gtR, COLS, C.GREEN_BG);
}

// ─── 3. PER-ZONE INSTALL SHEET ─────────────────────────────────────────────

interface InstallSheetInfo {
  tabName: string;
  structSubtotalRow: number;
  laborSubtotalRow: number;
  pmRow: number;
  elecSubtotalRow: number;
  engSubtotalRow: number;
}

function buildInstallSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  date: string,
  d: ComputedDisplay,
  complexity: InstallComplexity,
  tabName?: string,
  ov?: FinancialOverrides,
): InstallSheetInfo {
  const shortName = d.spec.name.length > 25 ? d.spec.name.substring(0, 25) + "…" : d.spec.name;
  const ws = wb.addWorksheet(sanitizeSheetName(tabName || `${shortName} - Install`), {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 32, 14, 14, 14, 14, 14, 4, 14, 12, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Header info
  let row = 3;
  ws.getCell(row, 1).value = `Project Name: ${projectName}`;
  ws.getCell(row, 1).font = { bold: true, name: "Calibri", size: 11 };
  row++;
  ws.getCell(row, 1).value = date;
  ws.getCell(row, 1).font = { name: "Calibri", size: 10, color: { argb: "FF666666" } };
  row++;
  ws.getCell(row, 1).value = "Revised By: ANC Proposal Engine";
  ws.getCell(row, 1).font = { name: "Calibri", size: 10, color: { argb: "FF666666" } };

  // Flat margin across all categories (Natalia confirmed March 2026)
  // Respect user override (ov?.servicesMarginPct) to stay consistent with MA tab.
  const hwMarginForInstall = ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware;
  const svcMargin = ov?.servicesMarginPct ?? hwMarginForInstall;

  // Margin assignment — track row numbers so data rows can reference them
  row += 2;
  ws.getCell(row, 3).value = "Linked Margin Assignment";
  ws.getCell(row, 3).font = { bold: true, name: "Calibri" };
  row++;
  const marginRows = { install: row, electrical: row + 1, anc: row + 2, engineering: row + 3 };
  const margins = [
    ["Install Margin", svcMargin],
    ["Electrical Margin", svcMargin],
    ["ANC Margin", svcMargin],
    ["Engineering and Permits", svcMargin],
  ];
  margins.forEach(([label, val]) => {
    ws.getCell(row, 3).value = label as string;
    ws.getCell(row, 4).value = val as number;
    ws.getCell(row, 4).numFmt = FMT_PCT;
    inputCell(ws.getCell(row, 4));
    row++;
  });

  // Display info
  row += 3;
  const dispRow = ws.getRow(row);
  dispRow.getCell(2).value = d.spec.name;
  dispRow.getCell(2).font = { bold: true, size: 12, name: "Calibri" };
  row++;
  const dimsR = ws.getRow(row);
  dimsR.getCell(2).value = "Height";
  dimsR.getCell(3).value = "Width";
  dimsR.getCell(4).value = "Total Sq. Ft";
  dimsR.getCell(5).value = "QTY";
  [2, 3, 4, 5].forEach(c => { dimsR.getCell(c).font = { bold: true, name: "Calibri", size: 10 }; });
  row++;
  const valR = ws.getRow(row);
  valR.getCell(2).value = d.heightFt; valR.getCell(2).numFmt = "0.00";
  valR.getCell(3).value = d.widthFt; valR.getCell(3).numFmt = "0.00";
  valR.getCell(4).value = d.areaSqFt; valR.getCell(4).numFmt = "#,##0.00";
  valR.getCell(5).value = d.spec.quantity || 1;

  // ─── Structural Materials Section ───
  row += 2;
  const structHeaders = ["", "Structural Materials:", "Subcontractor 1", "Subcontractor 2", "Subcontractor 3", "Selected", "Additional Contingency", "", "Total Cost", "Install Margin", "Selling Price"];
  structHeaders.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.DARK_HEADER);
  });
  ws.getRow(row).height = 24;
  row++;

  const structItems = [
    "FABRICATE PRIMARY STEEL",
    "SUPPLY AND INSTALL PRIMARY PLYWOOD",
    "FABRICATE SECONDARY STEEL SUBSTRUCTURE",
    "FABRICATE CLADDING AND TRIM",
    "OTHER SCOPE ITEM",
    "OTHER SCOPE ITEM",
  ];

  structItems.forEach((item, i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = item;
    // Pre-fill the first structural item with our rate
    const cost = i === 2 ? d.structuralMaterialsCost : 0;
    r.getCell(3).value = cost; r.getCell(3).numFmt = FMT_USD; inputCell(r.getCell(3));
    r.getCell(4).value = 0; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = 0; r.getCell(5).numFmt = FMT_USD; inputCell(r.getCell(5));
    r.getCell(6).value = 0; r.getCell(6).numFmt = FMT_USD;
    r.getCell(7).value = 0; r.getCell(7).numFmt = FMT_USD; inputCell(r.getCell(7));
    // Column I: SUM of columns C through G
    r.getCell(9).value = { formula: `SUM(C${row}:G${row})`, result: cost };
    r.getCell(9).numFmt = FMT_USD;
    // Column J: linked to Install Margin assignment at top
    r.getCell(10).value = { formula: `$D$${marginRows.install}`, result: svcMargin };
    r.getCell(10).numFmt = FMT_PCT;
    r.getCell(11).value = { formula: `I${row}/(1-J${row})`, result: cost > 0 ? round2(cost / (1 - svcMargin)) : 0 };
    r.getCell(11).numFmt = FMT_USD;
    stripe(r, 11, i % 2 === 0);
    row++;
  });

  // Subtotal with SUM formulas
  const structSubtotalRow = row;
  const stSubR = ws.getRow(row);
  stSubR.getCell(2).value = "SUBTOTAL";
  stSubR.getCell(9).value = { formula: `SUM(I${row - structItems.length}:I${row - 1})`, result: d.structuralMaterialsCost };
  stSubR.getCell(9).numFmt = FMT_USD;
  stSubR.getCell(11).value = { formula: `SUM(K${row - structItems.length}:K${row - 1})`, result: round2(d.structuralMaterialsCost / (1 - svcMargin)) };
  stSubR.getCell(11).numFmt = FMT_USD;
  subtotalBorder(stSubR, 11);
  row += 2;

  // ─── Structural Labor & LED Installation Section ───
  const laborHeaders = [...structHeaders];
  laborHeaders[1] = "Structural Labor and LED Installation";
  laborHeaders.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.DARK_HEADER);
  });
  ws.getRow(row).height = 24;
  row++;

  const laborItems = [
    "REMOVAL AND DISPOSAL",
    "INSTALL SECONDARY STEEL SUBSTRUCTURE",
    "INSTALL LED DISPLAYS",
    "INSTALL CLADDING AND TRIM",
    "HEAVY EQUIPMENT",
    "PM/GENERAL CONDITIONS/TRAVEL",
  ];

  const laborStartRow = row;
  let pmItemRow = row; // will be set when we hit PM item (index 5)
  laborItems.forEach((item, i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = item;
    let cost = 0;
    if (i === 2) cost = d.structuralLaborCost; // INSTALL LED DISPLAYS
    if (i === 5) { cost = d.pmCost + d.travelCost; pmItemRow = row; } // PM/GC/TRAVEL
    r.getCell(3).value = cost; r.getCell(3).numFmt = FMT_USD; inputCell(r.getCell(3));
    r.getCell(4).value = 0; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = 0; r.getCell(5).numFmt = FMT_USD; inputCell(r.getCell(5));
    r.getCell(6).value = 0; r.getCell(6).numFmt = FMT_USD;
    r.getCell(7).value = 0; r.getCell(7).numFmt = FMT_USD; inputCell(r.getCell(7));
    // Column I: SUM of columns C through G
    r.getCell(9).value = { formula: `SUM(C${row}:G${row})`, result: cost };
    r.getCell(9).numFmt = FMT_USD;
    // Column J: linked to Install Margin assignment at top
    r.getCell(10).value = { formula: `$D$${marginRows.install}`, result: svcMargin };
    r.getCell(10).numFmt = FMT_PCT;
    r.getCell(11).value = { formula: `I${row}/(1-J${row})`, result: cost > 0 ? round2(cost / (1 - svcMargin)) : 0 };
    r.getCell(11).numFmt = FMT_USD;
    stripe(r, 11, i % 2 === 0);
    row++;
  });

  const laborSubtotalRow = row;
  const lSubR = ws.getRow(row);
  lSubR.getCell(2).value = "SUBTOTAL";
  lSubR.getCell(9).value = { formula: `SUM(I${laborStartRow}:I${row - 1})`, result: d.structuralLaborCost + d.pmCost + d.travelCost };
  lSubR.getCell(9).numFmt = FMT_USD;
  lSubR.getCell(11).value = { formula: `SUM(K${laborStartRow}:K${row - 1})`, result: round2((d.structuralLaborCost + d.pmCost + d.travelCost) / (1 - svcMargin)) };
  lSubR.getCell(11).numFmt = FMT_USD;
  subtotalBorder(lSubR, 11);
  row += 2;

  // ─── Electrical & Data Section ───
  const elecHeaders = [...structHeaders];
  elecHeaders[1] = "Electrical and Data - Materials and Subcontracting";
  elecHeaders.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.DARK_HEADER);
  });
  ws.getRow(row).height = 24;
  row++;

  const elecItems = [
    "ELECTRICAL MATERIALS",
    "DATA MATERIALS",
    "ELECTRICAL LABOR",
    "DATA LABOR",
    "SUB PANEL",
    "MISC",
  ];

  elecItems.forEach((item, i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = item;
    const cost = i === 0 ? d.electricalCost : 0; // Pre-fill electrical materials
    r.getCell(3).value = cost; r.getCell(3).numFmt = FMT_USD; inputCell(r.getCell(3));
    r.getCell(4).value = 0; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = 0; r.getCell(5).numFmt = FMT_USD; inputCell(r.getCell(5));
    r.getCell(6).value = 0; r.getCell(6).numFmt = FMT_USD;
    r.getCell(7).value = 0; r.getCell(7).numFmt = FMT_USD; inputCell(r.getCell(7));
    // Column I: SUM of columns C through G
    r.getCell(9).value = { formula: `SUM(C${row}:G${row})`, result: cost };
    r.getCell(9).numFmt = FMT_USD;
    // Column J: linked to Electrical Margin assignment at top
    r.getCell(10).value = { formula: `$D$${marginRows.electrical}`, result: svcMargin };
    r.getCell(10).numFmt = FMT_PCT;
    r.getCell(11).value = { formula: `I${row}/(1-J${row})`, result: cost > 0 ? round2(cost / (1 - svcMargin)) : 0 };
    r.getCell(11).numFmt = FMT_USD;
    stripe(r, 11, i % 2 === 0);
    row++;
  });

  const elecStartRow = row - elecItems.length;
  const elecSubtotalRow = row;
  const eSubR = ws.getRow(row);
  eSubR.getCell(2).value = "SUBTOTAL";
  eSubR.getCell(9).value = { formula: `SUM(I${elecStartRow}:I${row - 1})`, result: d.electricalCost };
  eSubR.getCell(9).numFmt = FMT_USD;
  eSubR.getCell(11).value = { formula: `SUM(K${elecStartRow}:K${row - 1})`, result: round2(d.electricalCost / (1 - svcMargin)) };
  eSubR.getCell(11).numFmt = FMT_USD;
  subtotalBorder(eSubR, 11);
  row += 2;

  // ─── Engineering Section ───
  const engHeaders = [...structHeaders];
  engHeaders[1] = "Submittals, Engineering, and Permits";
  engHeaders.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.DARK_HEADER);
  });
  ws.getRow(row).height = 24;
  row++;

  const engItems = [
    "STRUCTURAL ENGINEERING",
    "STRUCTURAL CERTIFICATION",
    "ELECTRICAL ENGINEERING",
    "ELECTRICAL CERTIFICATION",
    "PERMITS",
  ];

  const engStartRow = row;
  engItems.forEach((item, i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = item;
    const cost = i === 0 ? d.engCost : 0;
    r.getCell(3).value = cost; r.getCell(3).numFmt = FMT_USD; inputCell(r.getCell(3));
    r.getCell(4).value = 0; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = 0; r.getCell(5).numFmt = FMT_USD; inputCell(r.getCell(5));
    r.getCell(6).value = 0; r.getCell(6).numFmt = FMT_USD;
    r.getCell(7).value = 0; r.getCell(7).numFmt = FMT_USD; inputCell(r.getCell(7));
    // Column I: SUM of columns C through G
    r.getCell(9).value = { formula: `SUM(C${row}:G${row})`, result: cost };
    r.getCell(9).numFmt = FMT_USD;
    // Column J: linked to Engineering and Permits margin assignment at top
    r.getCell(10).value = { formula: `$D$${marginRows.engineering}`, result: svcMargin };
    r.getCell(10).numFmt = FMT_PCT;
    r.getCell(11).value = { formula: `I${row}/(1-J${row})`, result: cost > 0 ? round2(cost / (1 - svcMargin)) : 0 };
    r.getCell(11).numFmt = FMT_USD;
    stripe(r, 11, i % 2 === 0);
    row++;
  });

  const engSubtotalRow = row;
  const engSubR = ws.getRow(row);
  engSubR.getCell(2).value = "SUBTOTAL";
  engSubR.getCell(9).value = { formula: `SUM(I${engStartRow}:I${row - 1})`, result: d.engCost };
  engSubR.getCell(9).numFmt = FMT_USD;
  engSubR.getCell(11).value = { formula: `SUM(K${engStartRow}:K${row - 1})`, result: round2(d.engCost / (1 - svcMargin)) };
  engSubR.getCell(11).numFmt = FMT_USD;
  subtotalBorder(engSubR, 11);
  row += 2;

  // ─── Grand Total ───
  const gtR = ws.getRow(row);
  gtR.getCell(2).value = "ZONE GRAND TOTAL";
  gtR.getCell(9).value = { formula: `I${structSubtotalRow}+I${laborSubtotalRow}+I${elecSubtotalRow}+I${engSubtotalRow}`, result: d.totalCost };
  gtR.getCell(9).numFmt = FMT_USD;
  gtR.getCell(11).value = { formula: `K${structSubtotalRow}+K${laborSubtotalRow}+K${elecSubtotalRow}+K${engSubtotalRow}`, result: d.sellingPrice };
  gtR.getCell(11).numFmt = FMT_USD;
  totalStyle(gtR, 11, C.ANC_BLUE);
  gtR.getCell(2).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  gtR.getCell(9).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  gtR.getCell(11).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };

  const finalTabName = sanitizeSheetName(tabName || `${shortName} - Install`);
  return {
    tabName: finalTabName,
    structSubtotalRow,
    laborSubtotalRow,
    pmRow: pmItemRow,
    elecSubtotalRow,
    engSubtotalRow,
  };
}

// ─── 4. P&L ─────────────────────────────────────────────────────────────────

function buildPnL(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
  grandCost: number,
  grandSelling: number,
  grandMargin: number,
  paymentTerms: string,
): void {
  const ws = wb.addWorksheet("P&L", {
    properties: { tabColor: { argb: C.AMBER_TAB } },
  });

  const colWidths = [4, 36, 16, 16, 16, 16, 4, 4, 36, 16, 16];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "K", `${projectName} — P&L`);

  let row = 3;
  ws.getCell(row, 1).value = "Project #:";
  ws.getCell(row, 1).font = { bold: true, name: "Calibri" };
  ws.getCell(row, 4).value = paymentTerms;
  ws.getCell(row, 4).font = { name: "Calibri", color: { argb: "FF666666" } };
  row += 2;

  // Projects Budget section
  ws.getCell(row, 2).value = "PROJECTS BUDGET";
  ws.getCell(row, 2).font = { bold: true, size: 12, name: "Calibri" };
  ws.getCell(row, 9).value = "CONTRACT BUDGET";
  ws.getCell(row, 9).font = { bold: true, size: 12, name: "Calibri" };
  row++;

  // Headers
  ["", "Revenue", "Budgeted Cost", "Margin"].forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.DARK_HEADER);
  });
  ["", "", "", "", "", "", "", "", "Revenue", "Budgeted Cost"].forEach((h, i) => {
    if (h) {
      const cell = ws.getCell(row, i + 1);
      cell.value = h;
      hdr(cell, C.DARK_HEADER);
    }
  });
  ws.getCell(row, 9).value = "Revenue"; hdr(ws.getCell(row, 9));
  ws.getCell(row, 10).value = "Budgeted Cost"; hdr(ws.getCell(row, 10));
  row++;

  // Base Contract
  const bcR = ws.getRow(row);
  bcR.getCell(1).value = "Base Contract";
  bcR.getCell(2).value = grandSelling; bcR.getCell(2).numFmt = FMT_USD;
  bcR.getCell(3).value = grandCost; bcR.getCell(3).numFmt = FMT_USD;
  bcR.getCell(4).value = grandMargin; bcR.getCell(4).numFmt = FMT_USD;
  bcR.getCell(8).value = "TOTAL BASE CONTRACT";
  bcR.getCell(8).font = { bold: true, name: "Calibri" };
  bcR.getCell(9).value = grandSelling; bcR.getCell(9).numFmt = FMT_USD;
  bcR.getCell(10).value = grandCost; bcR.getCell(10).numFmt = FMT_USD;
  row++;

  const tbcR = ws.getRow(row);
  tbcR.getCell(1).value = "TOTAL BASE CONTRACT";
  tbcR.getCell(1).font = { bold: true, name: "Calibri" };
  tbcR.getCell(2).value = grandSelling; tbcR.getCell(2).numFmt = FMT_USD;
  tbcR.getCell(3).value = grandCost; tbcR.getCell(3).numFmt = FMT_USD;
  tbcR.getCell(4).value = grandMargin; tbcR.getCell(4).numFmt = FMT_USD;
  totalStyle(tbcR, 6, C.MEDIUM_GRAY);
  row += 2;

  // Change Orders placeholder
  ws.getCell(row, 1).value = "Change Orders";
  ws.getCell(row, 1).font = { bold: true, name: "Calibri", color: { argb: "FF666666" } };
  row++;
  ws.getCell(row, 1).value = "Total Change Order(s) Amount";
  ws.getCell(row, 2).value = 0; ws.getCell(row, 2).numFmt = FMT_USD;
  ws.getCell(row, 3).value = 0; ws.getCell(row, 3).numFmt = FMT_USD;
  ws.getCell(row, 4).value = 0; ws.getCell(row, 4).numFmt = FMT_USD;
  row += 2;

  // Grand total
  const gtR = ws.getRow(row);
  gtR.getCell(1).value = "Grand Total";
  gtR.getCell(1).font = { bold: true, name: "Calibri" };
  gtR.getCell(2).value = grandSelling; gtR.getCell(2).numFmt = FMT_USD;
  gtR.getCell(3).value = grandCost; gtR.getCell(3).numFmt = FMT_USD;
  gtR.getCell(4).value = grandMargin; gtR.getCell(4).numFmt = FMT_USD;
  totalStyle(gtR, 6, C.GREEN_BG);
  row += 3;

  // Cost Category breakdown
  ws.getCell(row, 1).value = "Cost Category";
  ws.getCell(row, 1).font = { bold: true, name: "Calibri" };
  ws.getCell(row, 2).value = "Revenue";
  ws.getCell(row, 3).value = "Budget";
  ws.getCell(row, 4).value = "Committed POs";
  ws.getCell(row, 5).value = "Budget Remaining";
  [1, 2, 3, 4, 5].forEach(c => hdr(ws.getCell(row, c), C.DARK_HEADER));
  row++;

  const categories = [
    ["LED", displays.reduce((s, d) => s + d.ledHardwareCost, 0)],
    ["Install", displays.reduce((s, d) => s + d.structuralLaborCost + d.structuralMaterialsCost, 0)],
    ["Electrical", displays.reduce((s, d) => s + d.electricalCost, 0)],
    ["ANC Travel", displays.reduce((s, d) => s + d.travelCost, 0)],
    ["Structural Engineering", displays.reduce((s, d) => s + d.engCost, 0)],
    ["Electrical Engineering", 0],
    ["CMS", 0],
    ["Parts/Labor", 0],
    ["Tax", 0],
    ["Bond", 0],
  ] as [string, number][];

  categories.forEach(([cat, budget], i) => {
    const r = ws.getRow(row);
    r.getCell(1).value = cat;
    r.getCell(2).value = 0; r.getCell(2).numFmt = FMT_USD;
    r.getCell(3).value = budget; r.getCell(3).numFmt = FMT_USD;
    r.getCell(4).value = 0; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = budget; r.getCell(5).numFmt = FMT_USD;
    stripe(r, 5, i % 2 === 0);
    row++;
  });

  const catTotal = ws.getRow(row);
  catTotal.getCell(1).value = "BASE CONTRACT TOTAL";
  catTotal.getCell(3).value = grandCost; catTotal.getCell(3).numFmt = FMT_USD;
  catTotal.getCell(4).value = 0; catTotal.getCell(4).numFmt = FMT_USD;
  catTotal.getCell(5).value = grandCost; catTotal.getCell(5).numFmt = FMT_USD;
  totalStyle(catTotal, 5, C.GREEN_BG);
}

// ─── 5. CASH FLOW ──────────────────────────────────────────────────────────

function buildCashFlow(
  wb: ExcelJS.Workbook,
  projectName: string,
  grandSelling: number,
  grandCost: number,
  paymentTerms: string,
  contractDate?: string,
  completionDate?: string,
): void {
  const ws = wb.addWorksheet("Cash Flow", {
    properties: { tabColor: { argb: C.AMBER_TAB } },
  });

  const colWidths = [4, 14, 14, 16, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "O", `${projectName} — Cash Flow`);

  let row = 3;
  ws.getCell(row, 4).value = `Payment Terms: ${paymentTerms}`;
  ws.getCell(row, 4).font = { bold: true, name: "Calibri" };
  row++;

  // Payment phases — "40/30/20/10" format, or fallback to equal split
  const rawPhases = paymentTerms.split("/").map(Number).filter(n => !isNaN(n) && n > 0);
  const phases = rawPhases.length > 0 ? rawPhases : [25, 25, 25, 25];
  ws.getCell(row, 4).value = "Payment Phases";
  ws.getCell(row, 5).value = "Contract Signed";
  ws.getCell(row, 6).value = "Product Shipping";
  ws.getCell(row, 7).value = "Substantial Completion";
  ws.getCell(row, 8).value = "Sign Off";
  [4, 5, 6, 7, 8].forEach(c => { ws.getCell(row, c).font = { bold: true, name: "Calibri", size: 10 }; });
  row++;
  ws.getCell(row, 4).value = "Percentages";
  phases.forEach((pct, i) => {
    ws.getCell(row, 5 + i).value = (pct || 0) / 100;
    ws.getCell(row, 5 + i).numFmt = FMT_PCT;
  });
  row++;

  ws.getCell(row, 2).value = "Contract Award Date";
  ws.getCell(row, 3).value = contractDate || "TBD";
  inputCell(ws.getCell(row, 3));
  row++;
  ws.getCell(row, 2).value = "Scheduled Completion";
  ws.getCell(row, 3).value = completionDate || "TBD";
  inputCell(ws.getCell(row, 3));
  row += 2;

  // Summary
  const sumHeaders = ["", "Revenue", "Expenses", "Gross Profit", "Gross Profit %", "Budget Tracking (+/-)"];
  sumHeaders.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.DARK_HEADER);
  });
  row++;
  const sumR = ws.getRow(row);
  sumR.getCell(2).value = grandSelling; sumR.getCell(2).numFmt = FMT_USD;
  sumR.getCell(3).value = grandCost; sumR.getCell(3).numFmt = FMT_USD;
  sumR.getCell(4).value = grandSelling - grandCost; sumR.getCell(4).numFmt = FMT_USD;
  sumR.getCell(5).value = grandSelling > 0 ? (grandSelling - grandCost) / grandSelling : 0;
  sumR.getCell(5).numFmt = FMT_PCT;
  sumR.getCell(6).value = 0; sumR.getCell(6).numFmt = FMT_USD;
  totalStyle(sumR, 6, C.GREEN_BG);
  row += 2;

  // Monthly grid header
  ws.getCell(row, 1).value = "Month";
  ws.getCell(row, 1).font = { bold: true, name: "Calibri" };
  const months = ["Month 1", "Month 2", "Month 3", "Month 4", "Month 5", "Month 6", "Month 7", "Month 8", "Month 9", "Month 10"];
  months.forEach((m, i) => {
    ws.getCell(row, 5 + i).value = m;
    ws.getCell(row, 5 + i).font = { bold: true, name: "Calibri", size: 9 };
  });
  row++;

  // Revenue rows (10 milestone slots)
  ws.getCell(row, 1).value = "Revenue";
  ws.getCell(row, 1).font = { bold: true, name: "Calibri" };
  ws.getCell(row, 3).value = "Amount";
  ws.getCell(row, 4).value = "Date Submitted";
  hdr(ws.getCell(row, 1), C.ANC_BLUE);
  hdr(ws.getCell(row, 3), C.ANC_BLUE);
  hdr(ws.getCell(row, 4), C.ANC_BLUE);
  row++;

  for (let i = 0; i < 10; i++) {
    const r = ws.getRow(row);
    r.getCell(1).value = i + 1;
    r.getCell(3).value = 0; r.getCell(3).numFmt = FMT_USD; inputCell(r.getCell(3));
    r.getCell(4).value = ""; inputCell(r.getCell(4));
    months.forEach((_, mi) => {
      r.getCell(5 + mi).value = 0; r.getCell(5 + mi).numFmt = FMT_USD;
    });
    stripe(r, 14, i % 2 === 0);
    row++;
  }

  const revTotalR = ws.getRow(row);
  revTotalR.getCell(1).value = "Total Revenue";
  revTotalR.getCell(1).font = { bold: true, name: "Calibri" };
  revTotalR.getCell(3).value = 0; revTotalR.getCell(3).numFmt = FMT_USD;
  subtotalBorder(revTotalR, 14);
}

// ─── 6. PO's ────────────────────────────────────────────────────────────────

function buildPOs(
  wb: ExcelJS.Workbook,
  projectName: string,
): void {
  const ws = wb.addWorksheet("PO's", {
    properties: { tabColor: { argb: C.AMBER_TAB } },
  });

  const colWidths = [16, 30, 30, 18, 18];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "E", `${projectName} — Purchase Orders`);

  let row = 3;
  const headers = ["PO Number", "Vendor", "Title / Description", "Original Contract Amount", "Category"];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.DARK_HEADER);
  });
  row++;

  // 30 empty PO slots
  for (let i = 0; i < 30; i++) {
    const r = ws.getRow(row);
    r.getCell(1).value = ""; inputCell(r.getCell(1));
    r.getCell(2).value = ""; inputCell(r.getCell(2));
    r.getCell(3).value = ""; inputCell(r.getCell(3));
    r.getCell(4).value = 0; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = ""; inputCell(r.getCell(5));
    stripe(r, 5, i % 2 === 0);
    row++;
  }
}

// ─── 7. PROCESSOR COUNT ─────────────────────────────────────────────────────

function buildProcessorCount(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
): void {
  const ws = wb.addWorksheet("Processor Count", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 36, 12, 12, 10, 12, 14, 14, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "I", `${projectName} — Processor Count`);

  let row = 4;
  const headers = ["", "Display", "Width (px)", "Height (px)", "Ports", "Ports (80%)", "8-bit Video", "8-bit (80%)", "10/12/HDR bit"];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.DARK_HEADER);
  });
  ws.getRow(row).height = 28;
  row++;

  // Reference specs for NovaStar processors
  const processorSpecs = [
    { name: "660 Pro", maxW: 1920, maxH: 1080, ports: 8, pixels8: 650000, pixels80: 455000, pixelsHDR: 320000 },
    { name: "MCTRL4K", maxW: 3840, maxH: 2160, ports: 16, pixels8: 650000, pixels80: 455000, pixelsHDR: 320000 },
    { name: "H9 Enhanced", maxW: 7680, maxH: 4320, ports: 20, pixels8: 1200000, pixels80: 960000, pixelsHDR: 650000 },
  ];

  // Processor reference
  processorSpecs.forEach((p, i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = p.name;
    r.getCell(2).font = { bold: true, name: "Calibri" };
    r.getCell(3).value = p.maxW; r.getCell(3).numFmt = FMT_INT;
    r.getCell(4).value = p.maxH; r.getCell(4).numFmt = FMT_INT;
    r.getCell(5).value = p.ports;
    r.getCell(7).value = p.pixels8; r.getCell(7).numFmt = FMT_INT;
    r.getCell(8).value = p.pixels80; r.getCell(8).numFmt = FMT_INT;
    r.getCell(9).value = p.pixelsHDR; r.getCell(9).numFmt = FMT_INT;
    stripe(r, 9, i % 2 === 0);
    row++;
  });

  row += 2;

  // Per-display processor requirements
  ws.getCell(row, 2).value = "DISPLAY PROCESSOR REQUIREMENTS";
  ws.getCell(row, 2).font = { bold: true, size: 12, name: "Calibri" };
  row++;

  const dHeaders = ["", "Display", "Width (px)", "Height (px)", "Qty", "Total Pixels", "Ports Needed", "Processor Type", "Processors Needed"];
  dHeaders.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.ANC_BLUE);
  });
  ws.getRow(row).height = 28;
  row++;

  const dataStartRowProc = row;
  let totalProcessors = 0;
  displays.forEach((d, i) => {
    const ledRow = 4 + i; // LED Cost Sheet data row
    const qty = d.spec.quantity || 1;
    const r = ws.getRow(row);
    // Cross-sheet linked to LED Cost Sheet
    // LED Cost Sheet columns: A=Display, J=H(px), K=W(px), L=Qty
    r.getCell(2).value = { formula: `'LED Cost Sheet'!A${ledRow}`, result: d.spec.name };
    r.getCell(3).value = { formula: `'LED Cost Sheet'!K${ledRow}`, result: d.spec.widthPx || 0 }; r.getCell(3).numFmt = FMT_INT;
    r.getCell(4).value = { formula: `'LED Cost Sheet'!J${ledRow}`, result: d.spec.heightPx || 0 }; r.getCell(4).numFmt = FMT_INT;
    r.getCell(5).value = { formula: `'LED Cost Sheet'!L${ledRow}`, result: qty };
    // Total Pixels = W × H × Qty (cross-sheet formula)
    r.getCell(6).value = { formula: `C${row}*D${row}*E${row}`, result: d.totalPixels }; r.getCell(6).numFmt = FMT_INT;
    // Ports Needed = CEILING(TotalPixels / 650000, 1)
    r.getCell(7).value = { formula: `IFERROR(CEILING(F${row}/650000,1),0)`, result: d.portsNeeded };
    // Processor Type: >8 ports = MCTRL4K (16-port), otherwise 660 Pro (8-port) (BUG-12)
    const portsPerUnit = d.portsNeeded > 8 ? 16 : 8;
    const procType = d.portsNeeded > 8 ? "MCTRL4K" : "660 Pro";
    const procsNeeded = d.portsNeeded > 0 ? Math.ceil(d.portsNeeded / portsPerUnit) : 0;
    r.getCell(8).value = { formula: `IF(G${row}>8,"MCTRL4K","660 Pro")`, result: procType };
    // Processors Needed = CEILING(Ports / IF(>8, 16, 8))
    r.getCell(9).value = { formula: `IFERROR(CEILING(G${row}/IF(G${row}>8,16,8),1),0)`, result: procsNeeded };
    totalProcessors += procsNeeded;
    stripe(r, 9, i % 2 === 0);
    row++;
  });

  const pTotalR = ws.getRow(row);
  pTotalR.getCell(2).value = "TOTAL";
  pTotalR.getCell(6).value = { formula: `SUM(F${dataStartRowProc}:F${row - 1})`, result: displays.reduce((s, d) => s + d.totalPixels, 0) };
  pTotalR.getCell(6).numFmt = FMT_INT;
  pTotalR.getCell(7).value = { formula: `SUM(G${dataStartRowProc}:G${row - 1})`, result: displays.reduce((s, d) => s + d.portsNeeded, 0) };
  pTotalR.getCell(9).value = { formula: `SUM(I${dataStartRowProc}:I${row - 1})`, result: totalProcessors };
  totalStyle(pTotalR, 9, C.GREEN_BG);
}

// ─── 8. RESPONSIBILITY MATRIX ───────────────────────────────────────────────

function buildRespMatrix(
  wb: ExcelJS.Workbook,
  projectName: string,
  project: ExtractedProjectInfo,
): void {
  const ws = wb.addWorksheet("Resp Matrix", {
    properties: { tabColor: { argb: C.AMBER_TAB } },
  });

  const colWidths = [4, 56, 14, 14, 4, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.getCell(1, 2).value = `Project: ${projectName}`;
  ws.getCell(1, 2).font = { bold: true, size: 14, name: "Calibri" };
  ws.getCell(2, 2).value = `Date: ${new Date().toLocaleDateString()}`;

  let row = 4;

  const sections: { title: string; items: [string, string, string][] }[] = [
    {
      title: "Administrative",
      items: [
        ["Provide accurate architectural, structural engineering, and AV drawings.", "", "X"],
        ["Provide Payment and Performance Bond.", project.bondRequired ? "X" : "NA", ""],
        ["All required zoning, building, street or sidewalk permits.", "NA", ""],
        ["Shipping of all equipment to site.", "X", ""],
        ["Receive, unload, and inspect all new equipment upon arrival.", "X", ""],
        ["Provide safe storage of video equipment and control room.", "", "X"],
        ["Unobstructed access to equipment and control room.", "", "X"],
      ],
    },
    {
      title: "Engineering & Submittals",
      items: [
        ["Customer responsible to ensure existing structure supports new equipment.", "", "X"],
        ["Provide mechanical drawings, electrical drawings, and load calculations.", "X", ""],
        ["Engineering and certification for new equipment attachments.", "X", ""],
        ["Provide approval of all mechanical/electrical drawings.", "", "X"],
        ["Responsible to ensure structural integrity of existing conditions.", "", "X"],
      ],
    },
    {
      title: "Physical Installation",
      items: [
        ["ANC assumes all base building structure is provided by others.", "Include Statement", ""],
        ["ANC has included removal and disposal of existing equipment.", "", "X"],
        ["ANC assumes reasonable access will be provided to the work area.", "Include Statement", ""],
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
        ["Provide secondary electrical panels and/or remote disconnects.", "", "X"],
        ["Furnish signal cables as specified by ANC.", "X", ""],
        ["Provide and install signal cable conduit.", "", "X"],
        ["Labor to pull signal cable.", "X", ""],
        ["Terminate signal cable at control system equipment.", "X", ""],
        ["Mount and install data patch panel.", "X", ""],
        ["Provide high speed internet connection to control room.", "", "X"],
      ],
    },
    {
      title: "Control System",
      items: [
        ["ANC has provided display processors only.", "Include Statement", ""],
        ["Provide climate controlled control room.", "", "X"],
        ["Supply static IP address five (5) days prior to installation.", "", "X"],
      ],
    },
    {
      title: "Training",
      items: [
        ["Provide appropriate on-site operation and maintenance training.", "X", ""],
        ["Provide sign off list for all training.", "X", ""],
        ["Perform one (1) day of maintenance training.", "X", ""],
        ["Perform final systems testing and commissioning.", "X", ""],
      ],
    },
    {
      title: "General Conditions",
      items: [
        ["ANC has provided a parts only warranty, excluding labor.", "Include Statement", ""],
        [project.isUnionLabor ? "ANC has included installation pricing with Union labor rates." : "ANC has included installation pricing with prevailing labor rates.", project.isUnionLabor ? "X" : "", project.isUnionLabor ? "" : "X"],
        ["ANC has not included bonding of any kind.", project.bondRequired ? "" : "Include Statement", ""],
        ["ANC has not included any tax in the proposal.", "Include Statement", ""],
        ["Shipping included in quoted pricing.", "Include Statement", ""],
      ],
    },
  ];

  sections.forEach((section) => {
    // Section header
    const shR = ws.getRow(row);
    ws.getCell(row, 2).value = section.title;
    ws.getCell(row, 3).value = "ANC";
    ws.getCell(row, 4).value = "Purchaser";
    [2, 3, 4].forEach(c => sectionHdr(ws.getCell(row, c), C.ANC_BLUE));
    ws.getCell(row, 3).alignment = { horizontal: "center" };
    ws.getCell(row, 4).alignment = { horizontal: "center" };
    ws.getRow(row).height = 24;
    row++;

    section.items.forEach(([desc, anc, purchaser], i) => {
      const r = ws.getRow(row);
      r.getCell(2).value = desc;
      r.getCell(2).font = { name: "Calibri", size: 10 };
      r.getCell(2).alignment = { wrapText: true };
      r.getCell(3).value = anc;
      r.getCell(3).alignment = { horizontal: "center" };
      r.getCell(4).value = purchaser;
      r.getCell(4).alignment = { horizontal: "center" };
      if (anc === "" && purchaser === "") {
        r.getCell(6).value = "Editable";
        r.getCell(6).font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF999999" } };
      }
      stripe(r, 4, i % 2 === 0);
      row++;
    });

    row++; // gap between sections
  });
}

// ─── 9. TRAVEL ──────────────────────────────────────────────────────────────

function buildTravel(
  wb: ExcelJS.Workbook,
  projectName: string,
): void {
  const ws = wb.addWorksheet("ANC Travel", {
    properties: { tabColor: { argb: C.AMBER_TAB } },
  });

  const colWidths = [4, 30, 14, 12, 14, 4, 24];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "G", `${projectName} — ANC Travel`);

  const travelSections = [
    { name: "Travel - Installation", items: [
      ["Hotel", 300], ["Airfare", 1000], ["Car", 125], ["Per Diem", 100], ["Bundled", 10000],
    ]},
    { name: "Travel - Commissioning", items: [
      ["Hotel", 300], ["Airfare", 1000], ["Car", 125], ["Per Diem", 100], ["Bundled", 10000],
    ]},
    { name: "Game Support", items: [
      ["Hotel", 300], ["Airfare", 1000], ["Car", 125], ["Per Diem", 100], ["Bundled", 10000], ["Game Day Support", 1500],
    ]},
  ];

  let row = 4;

  travelSections.forEach((section) => {
    const hdrHeaders = ["", section.name, "Cost", "Quantity", "Total Cost"];
    hdrHeaders.forEach((h, i) => {
      ws.getCell(row, i + 1).value = h;
      hdr(ws.getCell(row, i + 1), C.ANC_BLUE);
    });
    ws.getRow(row).height = 24;
    row++;

    section.items.forEach(([item, unitCost], i) => {
      const r = ws.getRow(row);
      r.getCell(2).value = item as string;
      r.getCell(3).value = unitCost as number; r.getCell(3).numFmt = FMT_USD;
      r.getCell(4).value = 0; inputCell(r.getCell(4));
      r.getCell(5).value = 0; r.getCell(5).numFmt = FMT_USD;
      r.getCell(7).value = item === "Bundled" ? "Account for freelancer" : "";
      r.getCell(7).font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF999999" } };
      stripe(r, 5, i % 2 === 0);
      row++;
    });

    const tR = ws.getRow(row);
    tR.getCell(2).value = "Total";
    tR.getCell(5).value = 0; tR.getCell(5).numFmt = FMT_USD;
    subtotalBorder(tR, 5);
    row++;

    const totalR = ws.getRow(row);
    totalR.getCell(2).value = "TOTAL";
    totalR.getCell(3).value = "USD:";
    totalR.getCell(5).value = 0; totalR.getCell(5).numFmt = FMT_USD;
    totalStyle(totalR, 5, C.MEDIUM_GRAY);
    row += 2;
  });
}

// ─── 10. CMS TEMPLATE ──────────────────────────────────────────────────────

function buildCMS(
  wb: ExcelJS.Workbook,
  projectName: string,
  cmsAllocation: number = 0,
): CostCenterSheetRefs {
  const ws = wb.addWorksheet("CMS", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 14, 36, 14, 10, 14, 12, 14, 14, 4];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "G", `${projectName} — Content Management System`);

  let row = 4;

  ws.getCell(row, 2).value = "CMS Platform";
  ws.getCell(row, 2).font = { bold: true, size: 12, name: "Calibri" };
  row++;
  if (cmsAllocation > 0) {
    ws.getCell(row, 2).value = `Budget Allocation: ${cmsAllocation.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} — adjust line items below to match`;
  } else {
    ws.getCell(row, 2).value = "All costs require project-specific pricing — update items below based on RFP requirements";
  }
  ws.getCell(row, 2).font = { italic: true, color: { argb: "FFCC0000" }, name: "Calibri", size: 10 };
  row++;

  const cmsHeaders = ["", "Category", "Item", "Cost", "Quantity", "Total Cost", "Margin", "Selling Price", "Margin $"];
  cmsHeaders.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.DARK_HEADER);
  });
  ws.getRow(row).height = 24;
  row++;

  // When an allocation is provided, distribute across primary items as starting point
  // User can adjust individual line items — these are input cells
  const primaryItemCount = 4; // PRIMARY category items
  const perItemAlloc = cmsAllocation > 0 ? Math.round(cmsAllocation / primaryItemCount) : 0;

  const cmsItems = [
    ["PRIMARY", "DESIGN & CONTROL SOFTWARE", perItemAlloc],
    ["PRIMARY", "GRAPHICS PLAYBACK ENGINE", perItemAlloc],
    ["PRIMARY", "IMAGE PROCESSING", perItemAlloc],
    ["PRIMARY", "DEDICATED LED ROUTER / SWITCH", cmsAllocation > 0 ? cmsAllocation - perItemAlloc * 3 : 0],
    ["REDUNDANT", "DESIGN & CONTROL SOFTWARE", 0],
    ["REDUNDANT", "GRAPHICS PLAYBACK ENGINE", 0],
    ["REDUNDANT", "IMAGE PROCESSING", 0],
    ["STANDARD SERVICES", "COMMISSIONING", 0],
    ["STANDARD SERVICES", "EVENT SUPPORT", 0],
    ["STANDARD SERVICES", "PROJECT MANAGEMENT", 0],
    ["", "Integration Hardware", 0],
    ["", "Integration Labor", 0],
    ["", "Shipping", 0],
    ["", "Travel", 0],
  ] as [string, string, number][];

  const cmsStartRow = row;
  cmsItems.forEach(([cat, item, cost], i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = cat;
    r.getCell(2).font = { name: "Calibri", size: 10, bold: !!cat };
    r.getCell(3).value = item;
    r.getCell(4).value = cost; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = cost > 0 ? 1 : 0; inputCell(r.getCell(5));
    // Total Cost = Cost * Quantity
    r.getCell(6).value = { formula: `D${row}*E${row}`, result: cost > 0 ? cost : 0 };
    r.getCell(6).numFmt = FMT_USD;
    r.getCell(7).value = 0.10; r.getCell(7).numFmt = FMT_PCT;
    r.getCell(8).value = { formula: `IFERROR(F${row}/(1-G${row}),0)`, result: 0 };
    r.getCell(8).numFmt = FMT_USD;
    r.getCell(9).value = { formula: `IFERROR(H${row}-F${row},0)`, result: 0 };
    r.getCell(9).numFmt = FMT_USD;
    stripe(r, 9, i % 2 === 0);
    row++;
  });

  row++;
  const totR = ws.getRow(row);
  totR.getCell(3).value = "CMS TOTAL";
  totR.getCell(6).value = { formula: `SUM(F${cmsStartRow}:F${row - 2})`, result: cmsAllocation };
  totR.getCell(6).numFmt = FMT_USD;
  const cmsSellResult = cmsAllocation > 0 ? round2(cmsAllocation / (1 - 0.10)) : 0;
  totR.getCell(8).value = { formula: `SUM(H${cmsStartRow}:H${row - 2})`, result: cmsSellResult };
  totR.getCell(8).numFmt = FMT_USD;
  totR.getCell(9).value = { formula: `IFERROR(H${row}-F${row},0)`, result: round2(cmsSellResult - cmsAllocation) };
  totR.getCell(9).numFmt = FMT_USD;
  totalStyle(totR, 9, C.GREEN_BG);

  row += 2;
  const cmsTaxRow = row;
  ws.getCell(row, 2).value = "TAX";
  ws.getCell(row, 6).value = 0; ws.getCell(row, 6).numFmt = FMT_USD; inputCell(ws.getCell(row, 6));
  row++;
  const cmsBondRow = row;
  ws.getCell(row, 2).value = "BOND";
  ws.getCell(row, 6).value = 0; ws.getCell(row, 6).numFmt = FMT_USD; inputCell(ws.getCell(row, 6));
  row++;
  const subR = ws.getRow(row);
  subR.getCell(2).value = "SUB TOTAL";
  subR.getCell(3).value = "USD:";
  subR.getCell(6).value = { formula: `F${totR.number}+F${cmsTaxRow}+F${cmsBondRow}`, result: cmsAllocation }; subR.getCell(6).numFmt = FMT_USD;
  subR.getCell(8).value = { formula: `H${totR.number}`, result: cmsSellResult }; subR.getCell(8).numFmt = FMT_USD;
  subR.getCell(9).value = { formula: `IFERROR(H${row}-F${row},0)`, result: round2(cmsSellResult - cmsAllocation) }; subR.getCell(9).numFmt = FMT_USD;
  totalStyle(subR, 9, C.ANC_BLUE);
  subR.getCell(2).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(3).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(6).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(8).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(9).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  return { totalRow: row, subtotalCell: `F${row}`, sellCell: `H${row}`, marginCell: `I${row}` };
}

// ─── 11. SCORING ─────────────────────────────────────────────────────────

function buildScoring(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
): CostCenterSheetRefs {
  const ws = wb.addWorksheet("Scoring", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 14, 36, 14, 10, 14, 12, 14, 14, 4];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "G", `${projectName} — Scoring System`);

  let row = 4;

  ws.getCell(row, 2).value = "Scoring Platform";
  ws.getCell(row, 2).font = { bold: true, size: 12, name: "Calibri" };
  row++;
  ws.getCell(row, 2).value = "All costs require project-specific pricing — update items below based on RFP requirements";
  ws.getCell(row, 2).font = { italic: true, color: { argb: "FFCC0000" }, name: "Calibri", size: 10 };
  row++;

  const headers = ["", "Category", "Item", "Cost", "Quantity", "Total Cost", "Margin", "Selling Price", "Margin $"];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.DARK_HEADER);
  });
  ws.getRow(row).height = 24;
  row++;

  const scoringItems = [
    ["HARDWARE", "SCORING CONTROLLER / SERVER", 0],
    ["HARDWARE", "OPERATOR WORKSTATION(S)", 0],
    ["HARDWARE", "SCOREBOARD INPUT DEVICES", 0],
    ["HARDWARE", "SHOT CLOCK / GAME CLOCK INTERFACE", 0],
    ["HARDWARE", "STATISTICS INTERFACE", 0],
    ["SOFTWARE", "SCORING SOFTWARE LICENSE", 0],
    ["SOFTWARE", "GRAPHICS / ANIMATION PACKAGE", 0],
    ["SOFTWARE", "STATISTICS INTEGRATION", 0],
    ["SERVICES", "COMMISSIONING", 0],
    ["SERVICES", "TRAINING", 0],
    ["SERVICES", "PROJECT MANAGEMENT", 0],
    ["", "Integration Hardware", 0],
    ["", "Integration Labor", 0],
    ["", "Shipping", 0],
    ["", "Travel", 0],
  ] as [string, string, number][];

  const startRow = row;
  scoringItems.forEach(([cat, item, cost], i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = cat;
    r.getCell(2).font = { name: "Calibri", size: 10, bold: !!cat };
    r.getCell(3).value = item;
    r.getCell(4).value = cost; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = 0; inputCell(r.getCell(5));
    // Total Cost = Cost * Quantity
    r.getCell(6).value = { formula: `D${row}*E${row}`, result: 0 };
    r.getCell(6).numFmt = FMT_USD;
    r.getCell(7).value = 0.10; r.getCell(7).numFmt = FMT_PCT;
    r.getCell(8).value = { formula: `IFERROR(F${row}/(1-G${row}),0)`, result: 0 };
    r.getCell(8).numFmt = FMT_USD;
    r.getCell(9).value = { formula: `IFERROR(H${row}-F${row},0)`, result: 0 };
    r.getCell(9).numFmt = FMT_USD;
    stripe(r, 9, i % 2 === 0);
    row++;
  });

  row++;
  const totR = ws.getRow(row);
  totR.getCell(3).value = "SCORING TOTAL";
  totR.getCell(6).value = { formula: `SUM(F${startRow}:F${row - 2})`, result: 0 };
  totR.getCell(6).numFmt = FMT_USD;
  totR.getCell(8).value = { formula: `SUM(H${startRow}:H${row - 2})`, result: 0 };
  totR.getCell(8).numFmt = FMT_USD;
  totR.getCell(9).value = { formula: `IFERROR(H${row}-F${row},0)`, result: 0 };
  totR.getCell(9).numFmt = FMT_USD;
  totalStyle(totR, 9, C.GREEN_BG);

  row += 2;
  const scoringTaxRow = row;
  ws.getCell(row, 2).value = "TAX";
  ws.getCell(row, 6).value = 0; ws.getCell(row, 6).numFmt = FMT_USD; inputCell(ws.getCell(row, 6));
  row++;
  const scoringBondRow = row;
  ws.getCell(row, 2).value = "BOND";
  ws.getCell(row, 6).value = 0; ws.getCell(row, 6).numFmt = FMT_USD; inputCell(ws.getCell(row, 6));
  row++;
  const subR = ws.getRow(row);
  subR.getCell(2).value = "SUB TOTAL";
  subR.getCell(3).value = "USD:";
  subR.getCell(6).value = { formula: `F${totR.number}+F${scoringTaxRow}+F${scoringBondRow}`, result: 0 }; subR.getCell(6).numFmt = FMT_USD;
  subR.getCell(8).value = { formula: `H${totR.number}`, result: 0 }; subR.getCell(8).numFmt = FMT_USD;
  subR.getCell(9).value = { formula: `IFERROR(H${row}-F${row},0)`, result: 0 }; subR.getCell(9).numFmt = FMT_USD;
  totalStyle(subR, 9, C.ANC_BLUE);
  subR.getCell(2).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(3).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(6).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(8).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(9).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  return { totalRow: row, subtotalCell: `F${row}`, sellCell: `H${row}`, marginCell: `I${row}` };
}

function buildVenueServices(
  wb: ExcelJS.Workbook,
  projectName: string,
  ov?: FinancialOverrides,
): CostCenterSheetRefs {
  const ws = wb.addWorksheet("Venue Services", {
    properties: { tabColor: { argb: "FF0F766E" } },
  });

  const colWidths = [24, 18, 16, 16, 16];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "E", `${projectName} — Venue Services`);
  setMeta(ws, "E", "Multi-year service contract calculator");

  let row = 4;
  const years = Math.max(1, ov?.venueServiceYears ?? 3);
  const annualFee = ov?.venueServiceAnnualFee ?? 0;
  const escalationPct = ov?.venueServiceEscalationPct ?? 0.03;
  const marginPct = ov?.venueServiceMarginPct ?? DEFAULT_MARGINS.install;

  const settings: Array<[string, number, string]> = [
    ["Contract Years", years, "Editable service term"],
    ["Year 1 Cost", annualFee, "Base annual contract value"],
    ["Annual Escalation %", escalationPct, "Applied to each renewal year"],
    ["Margin %", marginPct, "Target service-contract margin"],
  ];

  settings.forEach(([label, value, note], idx) => {
    const r = ws.getRow(row + idx);
    r.getCell(1).value = label;
    r.getCell(2).value = value;
    if (label.includes("%")) {
      r.getCell(2).numFmt = FMT_PCT;
    } else if (label.includes("Cost")) {
      r.getCell(2).numFmt = FMT_USD;
    }
    inputCell(r.getCell(2));
    r.getCell(3).value = note;
    r.getCell(3).font = { italic: true, color: { argb: C.MEDIUM_GRAY }, name: "Calibri", size: 10 };
  });

  row += settings.length + 2;
  const headers = ["Year", "Cost", "Selling Price", "Margin $", "Notes"];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.DARK_HEADER);
  });
  row++;

  const firstYearRow = row;
  for (let year = 1; year <= 5; year++) {
    const currentRow = row;
    const r = ws.getRow(currentRow);
    const enabledFormula = `IF($B$4>=${year},"Year ${year}","")`;
    r.getCell(1).value = { formula: enabledFormula, result: year <= years ? `Year ${year}` : "" };
    r.getCell(2).value = year === 1
      ? { formula: `$B$5`, result: annualFee }
      : { formula: `IF(A${currentRow}="",0,B${currentRow - 1}*(1+$B$6))`, result: 0 };
    r.getCell(2).numFmt = FMT_USD;
    r.getCell(3).value = { formula: `IF(A${currentRow}="",0,IFERROR(B${currentRow}/(1-$B$7),0))`, result: 0 };
    r.getCell(3).numFmt = FMT_USD;
    r.getCell(4).value = { formula: `IF(A${currentRow}="",0,IFERROR(C${currentRow}-B${currentRow},0))`, result: 0 };
    r.getCell(4).numFmt = FMT_USD;
    r.getCell(5).value = year <= years ? "Escalated annual term" : "";
    stripe(r, 5, year % 2 === 1);
    row++;
  }

  const totalRow = row + 1;
  const totalR = ws.getRow(totalRow);
  totalR.getCell(1).value = "VENUE SERVICES TOTAL";
  totalR.getCell(2).value = { formula: `SUM(B${firstYearRow}:B${row - 1})`, result: 0 };
  totalR.getCell(2).numFmt = FMT_USD;
  totalR.getCell(3).value = { formula: `SUM(C${firstYearRow}:C${row - 1})`, result: 0 };
  totalR.getCell(3).numFmt = FMT_USD;
  totalR.getCell(4).value = { formula: `IFERROR(C${totalRow}-B${totalRow},0)`, result: 0 };
  totalR.getCell(4).numFmt = FMT_USD;
  totalStyle(totalR, 5, C.GREEN_BG);

  return { totalRow, subtotalCell: `B${totalRow}`, sellCell: `C${totalRow}`, marginCell: `D${totalRow}` };
}

function buildAdditionalItems(
  wb: ExcelJS.Workbook,
  projectName: string,
  ov?: FinancialOverrides,
): AdditionalItemsSheetRefs {
  const ws = wb.addWorksheet("Additional Items", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 18, 36, 14, 10, 14, 12, 14, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "H", `${projectName} — Additional Non-LED Items`);

  let row = 4;
  const headers = ["", "Category", "Item", "Cost", "Quantity", "Total Cost", "Margin", "Selling Price", "Margin $"];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.DARK_HEADER);
  });
  row++;

  const items: Array<[string, string]> = [
    ["GAME CLOCK", "Six-Digit Game Clocks"],
    ["PITCH CLOCK", "Pitch Clocks"],
    ["OES / MIS", "OES / MIS / Timing"],
    ["MISC", "DMX / Misc Equipment"],
  ];
  const rows: Record<string, number> = {};
  items.forEach(([category, item], idx) => {
    const currentRow = row;
    const r = ws.getRow(currentRow);
    const defaultCost =
      category === "GAME CLOCK" ? (ov?.gameClockAllocation ?? 0)
      : category === "PITCH CLOCK" ? (ov?.pitchClocksAllocation ?? 0)
      : category === "OES / MIS" ? (ov?.oesAllocation ?? 0)
      : (ov?.miscEquipmentAllocation ?? 0);
    r.getCell(2).value = category;
    r.getCell(3).value = item;
    r.getCell(4).value = defaultCost; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = 1; inputCell(r.getCell(5));
    r.getCell(6).value = { formula: `D${currentRow}*E${currentRow}`, result: defaultCost }; r.getCell(6).numFmt = FMT_USD;
    r.getCell(7).value = DEFAULT_MARGINS.equipment; r.getCell(7).numFmt = FMT_PCT; inputCell(r.getCell(7));
    r.getCell(8).value = { formula: `IFERROR(F${currentRow}/(1-G${currentRow}),0)`, result: defaultCost > 0 ? round2(defaultCost / (1 - DEFAULT_MARGINS.equipment)) : 0 }; r.getCell(8).numFmt = FMT_USD;
    r.getCell(9).value = { formula: `IFERROR(H${currentRow}-F${currentRow},0)`, result: defaultCost > 0 ? round2((defaultCost / (1 - DEFAULT_MARGINS.equipment)) - defaultCost) : 0 }; r.getCell(9).numFmt = FMT_USD;
    stripe(r, 9, idx % 2 === 0);
    if (category === "GAME CLOCK") rows.gameClock = currentRow;
    if (category === "PITCH CLOCK") rows.pitchClocks = currentRow;
    if (category === "OES / MIS") rows.oesMis = currentRow;
    if (category === "MISC") rows.miscEquipment = currentRow;
    row++;
  });

  const totalRow = row + 1;
  const totalR = ws.getRow(totalRow);
  totalR.getCell(3).value = "ADDITIONAL ITEMS TOTAL";
  totalR.getCell(6).value = { formula: `SUM(F5:F${row - 1})`, result: 0 }; totalR.getCell(6).numFmt = FMT_USD;
  totalR.getCell(8).value = { formula: `SUM(H5:H${row - 1})`, result: 0 }; totalR.getCell(8).numFmt = FMT_USD;
  totalR.getCell(9).value = { formula: `IFERROR(H${totalRow}-F${totalRow},0)`, result: 0 }; totalR.getCell(9).numFmt = FMT_USD;
  totalStyle(totalR, 9, C.GREEN_BG);

  return { totalRow, rows };
}

// ─── BUNDLE EQUIPMENT (Processor & Equipment breakdown) ──────────────────

function buildBundleEquipmentSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
): CostCenterSheetRefs {
  const ws = wb.addWorksheet("Bundle Equipment", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [18, 30, 14, 12, 14, 12, 14, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "D", `${projectName} — Processor & Equipment Breakdown`);
  setMeta(ws, "D", "Editable — adjust component costs per display zone. Totals roll into Margin Analysis.");

  let row = 6;
  const headers = ["Category", "Component", "Cost", "Qty", "Total Cost", "Margin", "Selling Price", "Margin $"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.DARK_HEADER);
  });
  ws.getRow(row).height = 28;
  row++;

  const zoneTotalRows: number[] = [];

  displays.forEach((d, idx) => {
    // Zone header
    const zoneR = ws.getRow(row);
    zoneR.getCell(1).value = d.spec.name + (d.spec.location ? ` — ${d.spec.location}` : "");
    zoneR.getCell(1).font = { bold: true, name: "Calibri" };
    zoneR.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.LIGHT_GRAY } };
    row++;

    // Equipment items for this zone
    const items: [string, number][] = [];
    if (d.sendingCardCost > 0) items.push(["Sending Card", d.sendingCardCost]);
    if (d.signalCableCost > 0) items.push(["Signal Cable Kit", d.signalCableCost]);
    if (d.upsCost > 0) items.push(["UPS Battery Backup", d.upsCost]);
    if (d.backupProcessorCost > 0) items.push(["Backup Video Processor", d.backupProcessorCost]);
    if (d.weatherproofCost > 0) items.push(["Weatherproof Enclosure Surcharge", d.weatherproofCost]);

    const firstItemRow = row;
    if (items.length === 0) {
      const emptyR = ws.getRow(row);
      emptyR.getCell(2).value = "(no equipment for this zone)";
      emptyR.getCell(2).font = { italic: true, color: { argb: "FF999999" }, name: "Calibri", size: 10 };
      row++;
    } else {
      items.forEach(([label, cost]) => {
        const ir = ws.getRow(row);
        ir.getCell(1).value = "EQUIPMENT";
        ir.getCell(2).value = label;
        ir.getCell(3).value = cost;
        ir.getCell(3).numFmt = FMT_USD;
        inputCell(ir.getCell(3));
        ir.getCell(4).value = 1;
        ir.getCell(4).alignment = { horizontal: "center" };
        ir.getCell(5).value = { formula: `C${row}*D${row}`, result: cost };
        ir.getCell(5).numFmt = FMT_USD;
        ir.getCell(6).value = DEFAULT_MARGINS.equipment;
        ir.getCell(6).numFmt = FMT_PCT;
        inputCell(ir.getCell(6));
        ir.getCell(7).value = { formula: `IFERROR(E${row}/(1-F${row}),0)`, result: round2(cost / (1 - DEFAULT_MARGINS.equipment)) };
        ir.getCell(7).numFmt = FMT_USD;
        ir.getCell(8).value = { formula: `IFERROR(G${row}-E${row},0)`, result: round2(cost / (1 - DEFAULT_MARGINS.equipment) - cost) };
        ir.getCell(8).numFmt = FMT_USD;
        stripe(ir, 8, row % 2 === 0);
        row++;
      });
    }

    // Zone subtotal
    const subR = ws.getRow(row);
    subR.getCell(2).value = "Zone Subtotal";
    subR.getCell(2).font = { bold: true, name: "Calibri" };
    subR.getCell(5).value = {
      formula: items.length > 0 ? `SUM(E${firstItemRow}:E${row - 1})` : "0",
      result: items.reduce((s, [, c]) => s + c, 0),
    };
    subR.getCell(5).numFmt = FMT_USD;
    subR.getCell(5).font = { bold: true, name: "Calibri" };
    subR.getCell(7).value = {
      formula: items.length > 0 ? `SUM(G${firstItemRow}:G${row - 1})` : "0",
      result: items.reduce((s, [, c]) => s + round2(c / (1 - DEFAULT_MARGINS.equipment)), 0),
    };
    subR.getCell(7).numFmt = FMT_USD;
    subR.getCell(8).value = { formula: `IFERROR(G${row}-E${row},0)`, result: items.reduce((s, [, c]) => s + round2(c / (1 - DEFAULT_MARGINS.equipment)) - c, 0) };
    subR.getCell(8).numFmt = FMT_USD;
    zoneTotalRows.push(row);
    row++;

    row++; // separator
  });

  // Grand total
  if (zoneTotalRows.length > 0) {
    const grandR = ws.getRow(row);
    grandR.getCell(1).value = "EQUIPMENT GRAND TOTAL";
    grandR.getCell(1).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
    const costFormula = zoneTotalRows.map((r) => `E${r}`).join("+");
    const sellFormula = zoneTotalRows.map((r) => `G${r}`).join("+");
    const equipmentGrandCost = displays.reduce((s, d) => s + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost, 0);
    const equipmentGrandSell = displays.reduce((s, d) => {
      const displayCost = d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost;
      return s + round2(displayCost / (1 - DEFAULT_MARGINS.equipment));
    }, 0);
    grandR.getCell(5).value = { formula: costFormula, result: equipmentGrandCost };
    grandR.getCell(5).numFmt = FMT_USD;
    grandR.getCell(7).value = { formula: sellFormula, result: equipmentGrandSell };
    grandR.getCell(7).numFmt = FMT_USD;
    grandR.getCell(8).value = { formula: `IFERROR(G${row}-E${row},0)`, result: equipmentGrandSell - equipmentGrandCost };
    grandR.getCell(8).numFmt = FMT_USD;
    totalStyle(grandR, 8, C.ANC_BLUE);
    return { totalRow: row, subtotalCell: `E${row}`, sellCell: `G${row}`, marginCell: `H${row}` };
  }
  return { totalRow: row, subtotalCell: `E${row}` };
}

// ─── TECH SPECS (INSTALLERS) — no pricing, cross-sheet refs ──────────────

function buildTechSpecsSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
  resolveProduct: ProductResolver,
): void {
  const ws = wb.addWorksheet("Tech Specs (Installers)", {
    properties: { tabColor: { argb: C.MEDIUM_GRAY } },
  });

  const colWidths = [36, 8, 12, 12, 12, 12, 12, 10, 12, 10, 10, 12, 14, 14, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "O", `${projectName} — LED Technical Specifications (No Pricing)`);
  setMeta(ws, "O", "Technical specifications only — no pricing data. Safe for installer/subcontractor distribution.");

  let row = 4;
  const headers = [
    "Display Name", "Qty", "Pixel Pitch", "Height (ft)", "Width (ft)",
    "Pixels H", "Pixels W", "Sq Ft", "Brightness (nits)", "Service", "Environment",
    "Weight (lbs)", "Total Power (W)", "Fiber Strands", "BTU/hr",
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.MEDIUM_GRAY);
    cell.font = { bold: true, color: { argb: C.DARK_HEADER }, name: "Calibri", size: 10 };
  });
  ws.getRow(row).height = 28;
  row++;

  // LED Cost Sheet data starts at row 4 (header at row 3)
  // Columns: A=Display, D=Pitch, E=H(ft), F=W(ft), G=H(px), H=W(px), I=Qty, J=TotalSqFt, K=NITs, L=Service
  displays.forEach((d, idx) => {
    const ledRow = 4 + idx; // LED Cost Sheet data row
    const r = ws.getRow(row);
    const isClockLike = isClockLikeDisplay(d);

    // All values via cross-sheet formulas to LED Cost Sheet
    // IMPORTANT: result values required — browser preview can't resolve cross-sheet formulas
    const qty = d.spec.quantity || 1;
    const displayName = d.spec.name + (d.spec.location ? ` — ${d.spec.location}` : "");
    // Resolve product first so we can get correct pitch
    const tsSelectedProduct = d.spec.selectedProductId ? resolveProduct(d.spec.selectedProductId) : null;
    const tsPitch = (tsSelectedProduct as any)?.pitchMm ?? (tsSelectedProduct as any)?.pitch;
    const effPitch = tsPitch ?? d.match?.module?.pitch ?? parsePitchFromProductName(d.spec.selectedProductName) ?? d.spec.pixelPitchMm;
    const pitchLabel = effPitch ? `${effPitch}mm` : "—";
    const hPx = d.spec.heightPx || (effPitch && d.heightFt ? Math.round(d.heightFt * 304.8 / effPitch) : 0);
    const wPx = d.spec.widthPx || (effPitch && d.widthFt ? Math.round(d.widthFt * 304.8 / effPitch) : 0);

    r.getCell(1).value = { formula: `'LED Cost Sheet'!A${ledRow}`, result: displayName };
    r.getCell(2).value = { formula: `'LED Cost Sheet'!I${ledRow}`, result: qty };
    r.getCell(3).value = { formula: `'LED Cost Sheet'!D${ledRow}`, result: pitchLabel };
    r.getCell(4).value = { formula: `'LED Cost Sheet'!E${ledRow}`, result: d.heightFt || 0 };
    r.getCell(5).value = { formula: `'LED Cost Sheet'!F${ledRow}`, result: d.widthFt || 0 };
    r.getCell(6).value = { formula: `'LED Cost Sheet'!G${ledRow}`, result: hPx };
    r.getCell(7).value = { formula: `'LED Cost Sheet'!H${ledRow}`, result: wPx };
    // Sq Ft: =D*E*B (height × width × qty)
    r.getCell(8).value = { formula: `D${row}*E${row}*B${row}`, result: d.areaSqFt };
    r.getCell(8).numFmt = "#,##0";
    r.getCell(9).value = { formula: `'LED Cost Sheet'!K${ledRow}`, result: isClockLike ? "" : (d.spec.brightnessNits ?? "") };
    r.getCell(10).value = { formula: `'LED Cost Sheet'!L${ledRow}`, result: d.spec.serviceType || "Front" };
    r.getCell(11).value = d.spec.environment || "indoor";

    // Weight & Power & BTU — cross-sheet refs to LED Cost Sheet (cols U, V, W)
    const areaM2 = d.areaSqFt * 0.092903;
    const pitch = effPitch ?? d.spec.pixelPitchMm ?? 0;
    const catalogMatch = tsSelectedProduct
      ?? (pitch > 0 ? getAllProducts().find((p) => Math.abs(p.pitchMm - pitch) < 0.5) : null);
    const tsWeight = catalogMatch ? Math.round(areaM2 * catalogMatch.weightDensityLbm2) : Math.round(d.areaSqFt * 5);
    const tsPower = catalogMatch ? Math.round(areaM2 * catalogMatch.powerDensityWm2) : 0;
    const tsBtu = tsPower > 0 ? Math.round(tsPower * 3.412) : 0;

    r.getCell(12).value = { formula: `'LED Cost Sheet'!U${ledRow}`, result: tsWeight || 0 };
    r.getCell(12).numFmt = "#,##0";
    r.getCell(13).value = { formula: `'LED Cost Sheet'!V${ledRow}`, result: tsPower || 0 };
    r.getCell(13).numFmt = "#,##0";
    // Fiber Strands = total pixels / 400,000 (one strand per 400K pixels)
    const tsFiber = (hPx * wPx * qty) > 0 ? round2((hPx * wPx * qty) / 400000) : 0;
    r.getCell(14).value = { formula: `IFERROR((F${row}*G${row}*B${row})/400000,0)`, result: tsFiber };
    r.getCell(14).numFmt = "0.0";
    r.getCell(15).value = { formula: `'LED Cost Sheet'!W${ledRow}`, result: tsBtu || 0 };
    r.getCell(15).numFmt = "#,##0";

    stripe(r, 15, idx % 2 === 0);
    row++;
  });
}

// ─── ALTERNATES REFERENCE SHEET ───────────────────────────────────────────

function buildAlternatesSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  altDisplays: ComputedDisplay[],
): void {
  const ws = wb.addWorksheet("Alternates", {
    properties: { tabColor: { argb: C.AMBER_TAB } },
  });

  const colWidths = [10, 28, 20, 10, 10, 10, 10, 8, 14, 30];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "J", `${projectName} — Cost Alternates (Reference Only)`);
  setMeta(ws, "J", "These alternates are NOT included in the base bid budget. Shown for reference only.");

  let row = 4;
  const headers = ["Alt ID", "Display Name", "Location", "Width (ft)", "Height (ft)", "Pitch (mm)", "Env", "Qty", "Est. Cost", "Notes"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.AMBER_TAB);
  });
  ws.getRow(row).height = 28;
  row++;

  altDisplays.forEach((d, idx) => {
    const r = ws.getRow(row);
    r.getCell(1).value = d.spec.alternateId || `Alt ${idx + 1}`;
    r.getCell(1).font = { bold: true, name: "Calibri" };
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(2).value = d.spec.name;
    r.getCell(3).value = d.spec.location || "—";
    r.getCell(4).value = d.widthFt > 0 ? d.widthFt : "TBD";
    r.getCell(4).alignment = { horizontal: "center" };
    r.getCell(5).value = d.heightFt > 0 ? d.heightFt : "TBD";
    r.getCell(5).alignment = { horizontal: "center" };
    const altPitch = d.match?.module?.pitch ?? parsePitchFromProductName(d.spec.selectedProductName) ?? d.spec.pixelPitchMm;
    r.getCell(6).value = altPitch != null ? `${altPitch}mm` : "TBD";
    r.getCell(6).alignment = { horizontal: "center" };
    r.getCell(7).value = d.spec.environment;
    r.getCell(7).alignment = { horizontal: "center" };
    r.getCell(8).value = d.spec.quantity;
    r.getCell(8).alignment = { horizontal: "center" };
    r.getCell(9).value = d.totalCost > 0 ? d.totalCost : "TBD";
    if (d.totalCost > 0) r.getCell(9).numFmt = FMT_USD;
    r.getCell(10).value = d.spec.alternateDescription || d.spec.notes || "—";
    r.getCell(10).alignment = { wrapText: true };

    // Amber background for all rows
    for (let i = 1; i <= 10; i++) {
      r.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.AMBER_BG } };
    }
    row++;
  });

  // Footer note
  row += 2;
  ws.mergeCells(`A${row}:J${row}`);
  const noteCell = ws.getCell(`A${row}`);
  noteCell.value = "NOTE: These alternates are optional add-ons or substitute configurations. They are NOT included in the base bid budget totals.";
  noteCell.font = { size: 10, italic: true, color: { argb: "FF666666" }, name: "Calibri" };
  noteCell.alignment = { horizontal: "center", wrapText: true };
}
