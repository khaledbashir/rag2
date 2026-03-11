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
  getServiceMargin,
  getAllProducts,
  getProduct,
  calculateHardwareCost,
  type ZoneClass,
  type InstallComplexity,
} from "@/services/rfp/productCatalog";
import { ProductMatcher, type MatchedSolution } from "@/services/catalog/productMatcher";
import { preloadRateCard, getRateSync } from "@/services/rfp/rateCardLoader";

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
// Values resolved from DB rate card when available, hardcoded fallback otherwise.
// Call preloadRateCard() before using these helpers.

function rc(key: string, fallback: number): number {
  try { return getRateSync(key); } catch { return fallback; }
}

function getSmartBundles() {
  return {
    sendingCard: 450,                                          // no rate card key
    sparePartsPct: rc("spare_parts.led_pct", 0.05),            // rate card: 5%
    signalCablePerSqFt25: 15,                                  // no rate card key
    upsBattery: 2500,                                          // no rate card key
    backupProcessor: 12000,                                    // no rate card key
    weatherproofPerSqFt: 12,                                   // no rate card key
  };
}

function getBudgetRates() {
  return {
    // Per-display-type install rates (validated against Jeremy's Denver Cost Analysis 03/04/2026)
    installScoreboardPerSqFt: 375,                               // scoreboard/center-hung: Jeremy $374.93/sqft
    installFasciaPerSqFt: 432,                                   // fascia/ribbon-board: Jeremy ~$432/sqft
    installWallPerSqFt: 251,                                     // wall-mounted/perimeter: Jeremy $251.32/sqft
    installPerSqFt: 289,                                         // fallback composite budget rate
    electricalPerSqFt: rc("electrical.materials_per_sqft", 125), // rate card: electrical materials
    structuralWallPerSqFt: 30,                                   // no rate card key (budget heuristic)
    structuralCeilingPerSqFt: 55,                                // validated: Jeremy $54.63/sqft (was 60)
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScopingWorkbookOptions {
  project: ExtractedProjectInfo;
  specs: ExtractedLEDSpec[];
  requirements?: ExtractedRequirement[];
  pricedDisplays?: PricedDisplay[];
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

export interface FinancialOverrides {
  ledMarginPct?: number;          // 0-1, e.g. 0.38 for 38%
  servicesMarginPct?: number;     // 0-1, e.g. 0.20 for 20%
  taxRate?: number;               // 0-1, e.g. 0.095 for 9.5%
  bondRate?: number;              // 0-1, e.g. 0.015 for 1.5%. 0 = no bond.
  costPerSqFtOverride?: number;   // $/sqft override for LED hardware. 0 = use catalog.
  pmComplexity?: "standard" | "complex" | "major";
  cmsAllocation?: number;         // CMS cost in dollars
  scoringAllocation?: number;     // Scoring cost in dollars
  isUnionLabor?: boolean;         // 15% uplift on labor costs
  perDisplayComplexity?: InstallComplexity[];  // parallel to specs array
  /** Per-display cost overrides from direct cell edits — parallel to specs array */
  perDisplayCostOverrides?: Array<Record<string, number> | undefined>;
}

interface ComputedDisplay {
  spec: ExtractedLEDSpec;
  priced: PricedDisplay | null;
  match: MatchedSolution | null;
  areaSqFt: number;
  widthFt: number;
  heightFt: number;
  // Per-display settings
  installComplexity: InstallComplexity;
  // Cost breakdown
  ledHardwareCost: number;
  structuralMaterialsCost: number;
  structuralLaborCost: number;
  electricalCost: number;
  pmCost: number;
  engCost: number;
  travelCost: number;
  // Smart bundles
  sendingCardCost: number;
  sparePartsCost: number;
  signalCableCost: number;
  upsCost: number;
  backupProcessorCost: number;
  weatherproofCost: number;
  // LED Cost Sheet line items
  shippingCost: number;
  // Totals
  totalCost: number;
  sellingPrice: number;
  marginDollars: number;
  marginPct: number;
  // Processor
  totalPixels: number;
  portsNeeded: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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

// ─── Compute Display Data ───────────────────────────────────────────────────

function computeDisplays(
  specs: ExtractedLEDSpec[],
  pricedDisplays: PricedDisplay[] | undefined,
  installComplexity: InstallComplexity,
  ov?: FinancialOverrides,
): ComputedDisplay[] {
  return specs.map((spec, idx) => {
    const priced = pricedDisplays?.[idx] ?? null;
    const widthFt = spec.widthFt || 0;
    const heightFt = spec.heightFt || 0;
    const areaSqFt = round2(widthFt * heightFt * (spec.quantity || 1));

    // Per-display install complexity: override > per-display array > global
    const displayComplexity = ov?.perDisplayComplexity?.[idx] ?? installComplexity;

    // Resolve rates from DB rate card (preloaded), hardcoded fallbacks
    const RATES = getBudgetRates();
    const BUNDLES = getSmartBundles();

    // LED hardware cost priority:
    //   1. priced display (from RFP pricing engine)
    //   2. user cost/sqft override
    //   3. explicit product selection → product-specific cost/sqm
    //   4. explicit product selection → use product's pitch for rate card lookup
    //   5. rate card pitch lookup
    //   6. catalog constant pitch lookup
    let ledHardwareCost = priced?.hardwareCost ?? 0;
    const selectedProduct = spec.selectedProductId ? getProduct(spec.selectedProductId) : null;
    if (!ledHardwareCost) {
      const overrideCostSqFt = (ov?.costPerSqFtOverride ?? 0) > 0 ? ov!.costPerSqFtOverride! : 0;
      if (overrideCostSqFt > 0) {
        ledHardwareCost = round2(areaSqFt * overrideCostSqFt);
      } else if (spec.selectedProductId) {
        // Try product-specific cost/sqm from HARDWARE_COST_PER_SQM
        const areaM2 = areaSqFt * 0.092903;
        const productCost = calculateHardwareCost(areaM2, spec.selectedProductId);
        if (productCost != null && productCost > 0) {
          ledHardwareCost = round2(productCost);
        } else {
          // Product exists but no cost/sqm entry — use its pitch for rate lookup
          const effectivePitch = selectedProduct?.pitchMm ?? spec.pixelPitchMm;
          if (effectivePitch) {
            const pitchKey = `led_cost.${String(effectivePitch).replace(".", "_")}mm`;
            const rcRate = rc(pitchKey, 0);
            const catalogRate = LED_COST_PER_SQFT_BY_PITCH[String(effectivePitch)];
            const rate = rcRate > 0 ? rcRate : catalogRate;
            if (rate) ledHardwareCost = round2(areaSqFt * rate);
          }
        }
      } else if (spec.pixelPitchMm) {
        // No explicit product — pitch-based lookup with outdoor/indoor awareness
        // Round pitches (6, 10) map to outdoor variants for outdoor/perimeter displays
        const isOutdoor = spec.environment === "outdoor"
          || /outdoor|perimeter|field.?pitch|fascia|exterior/i.test(spec.name + " " + (spec.mountingType || ""));
        const OUTDOOR_PITCH_MAP: Record<string, string> = {
          '6': '5.95',     // 6mm outdoor → Yaham R6 ($260.14) not C6 ($136.51)
          '8': '8.33',     // 8mm outdoor → Yaham R8 ($194.07) not C8 ($148)
          '10': '10.417',  // 10mm outdoor → Yaham R10 ($154.79) not C10 ($112.22)
        };
        // Perimeter/ribbon boards at 10mm → Yaham A10 ($206.59) which is the actual field pitch product
        const isPerimeter = /perimeter|field.?pitch|ribbon/i.test(spec.name + " " + (spec.mountingType || ""));
        const PERIMETER_PITCH_MAP: Record<string, number> = {
          '10': 206.59,    // Yaham A10 outdoor perimeter. Denver Cost Analysis 03/04/2026.
        };

        let effectivePitch = String(spec.pixelPitchMm);
        let directRate: number | undefined;

        // Check perimeter-specific override first
        if (isPerimeter && PERIMETER_PITCH_MAP[effectivePitch] != null) {
          directRate = PERIMETER_PITCH_MAP[effectivePitch];
        }
        // Then outdoor pitch remapping
        else if (isOutdoor && OUTDOOR_PITCH_MAP[effectivePitch]) {
          effectivePitch = OUTDOOR_PITCH_MAP[effectivePitch];
        }

        if (directRate != null) {
          ledHardwareCost = round2(areaSqFt * directRate);
        } else {
          const pitchKey = `led_cost.${effectivePitch.replace(".", "_")}mm`;
          const rcRate = rc(pitchKey, 0);
          const catalogRate = LED_COST_PER_SQFT_BY_PITCH[effectivePitch];
          const rate = rcRate > 0 ? rcRate : catalogRate;
          if (rate) ledHardwareCost = round2(areaSqFt * rate);
        }
      }
    }

    // Structural / Labor / Electrical: use priced data when available (Mirror path),
    // otherwise compute from budget rates (Estimator/RFP path).
    const isCeiling = /center.?hung|scoreboard|hanging|ribbon|fascia/i.test(spec.name + " " + (spec.mountingType || ""));
    const isScoreboardType = /scoreboard|center.?hung|hanging|jumbotron/i.test(spec.name + " " + (spec.mountingType || ""));
    const isFasciaType = /fascia|ribbon|perimeter.*board|banner/i.test(spec.name + " " + (spec.mountingType || ""));
    let structuralMaterialsCost: number;
    let structuralLaborCost: number;
    let electricalCost: number;

    // Select install rate based on display type (validated against Denver Cost Analysis)
    const installRate = isScoreboardType ? RATES.installScoreboardPerSqFt
      : isFasciaType ? RATES.installFasciaPerSqFt
      : isCeiling ? RATES.installScoreboardPerSqFt  // default ceiling to scoreboard rate
      : RATES.installWallPerSqFt;

    if (priced && priced.installCost > 0) {
      // Priced data available (Mirror/RFP) — distribute combined installCost
      // across structural/labor/electrical proportionally using budget rate ratios
      const structRate = isCeiling ? RATES.structuralCeilingPerSqFt : RATES.structuralWallPerSqFt;
      const totalRate = structRate + installRate + RATES.electricalPerSqFt;
      structuralMaterialsCost = round2(priced.installCost * (structRate / totalRate));
      structuralLaborCost = round2(priced.installCost * (installRate / totalRate));
      electricalCost = round2(priced.installCost * (RATES.electricalPerSqFt / totalRate));
    } else {
      // No priced data — compute from budget rates
      const structRate = isCeiling ? RATES.structuralCeilingPerSqFt : RATES.structuralWallPerSqFt;
      structuralMaterialsCost = round2(areaSqFt * structRate);
      structuralLaborCost = round2(areaSqFt * installRate);
      electricalCost = round2(areaSqFt * RATES.electricalPerSqFt);
    }

    // PM & Engineering — rate card backed, with complexity multiplier
    const pmMult = ov?.pmComplexity === "complex" ? 2 : ov?.pmComplexity === "major" ? 3 : 1;
    const pmBase = rc("other.pm_base_fee", PM_BASE_FEE);
    const engBase = rc("other.eng_base_fee", ENG_BASE_FEE);
    const pmCost = priced?.pmCost ?? round2(pmBase * pmMult);
    const engCost = priced?.engCost ?? round2(engBase * pmMult);

    // Union labor: 15% uplift on labor-related costs
    const unionMult = ov?.isUnionLabor ? 1.15 : 1.0;

    // Skip fixed costs if display has no dimensions (can't scope it)
    const hasDimensions = areaSqFt > 0;

    // Per-display cost overrides from cell edits
    const co = ov?.perDisplayCostOverrides?.[idx];

    // Travel (estimate)
    const travelCost = hasDimensions ? 15000 : 0;

    // LED hardware cost override from cell edit (must be before sparePartsCost)
    if (co?.displayCost != null) ledHardwareCost = co.displayCost;

    // Smart bundles — spare parts from rate card
    const sendingCardCost = co?.processor != null ? co.processor : (hasDimensions ? BUNDLES.sendingCard : 0);
    const sparePartsCost = round2(ledHardwareCost * BUNDLES.sparePartsPct);
    const signalCableCost = round2(BUNDLES.signalCablePerSqFt25 * (areaSqFt / 25));
    const isScoreboard = isCeiling;
    const upsCost = isScoreboard ? BUNDLES.upsBattery : 0;
    const backupProcessorCost = areaSqFt > 300 ? BUNDLES.backupProcessor : 0;
    const weatherproofCost = spec.environment === "outdoor" ? round2(areaSqFt * BUNDLES.weatherproofPerSqFt) : 0;

    // Shipping — override from cell edit or default $10/sqft
    const shippingCost = co?.shipping != null ? co.shipping : (hasDimensions ? round2(areaSqFt * 10) : 0);

    // Apply union multiplier to labor-related costs
    const totalCost = round2(
      ledHardwareCost
      + round2(structuralMaterialsCost * unionMult)
      + round2(structuralLaborCost * unionMult)
      + round2(electricalCost * unionMult)
      + pmCost + engCost + travelCost
      + sendingCardCost + sparePartsCost + signalCableCost
      + upsCost + backupProcessorCost + weatherproofCost
    );

    // Margin: per-category approach (override > priced > default)
    // Hardware and services get separate margins, then sum for blended selling price
    const hwMarginPct = co?.marginPct != null ? co.marginPct : (ov?.ledMarginPct ?? priced?.blendedMarginPct ?? DEFAULT_MARGINS.ledHardware);
    const svcMarginPct = ov?.servicesMarginPct ?? DEFAULT_MARGINS.install;
    const hwCosts = ledHardwareCost + sparePartsCost;
    const svcCosts = round2(structuralMaterialsCost * unionMult)
      + round2(structuralLaborCost * unionMult)
      + round2(electricalCost * unionMult)
      + pmCost + engCost + travelCost;
    const equipCosts = sendingCardCost + signalCableCost + upsCost + backupProcessorCost + weatherproofCost;
    const hwSell = hwCosts > 0 ? round2(hwCosts / (1 - hwMarginPct)) : 0;
    const svcSell = svcCosts > 0 ? round2(svcCosts / (1 - svcMarginPct)) : 0;
    const equipSell = equipCosts > 0 ? round2(equipCosts / (1 - hwMarginPct)) : 0;
    const sellingPrice = round2(hwSell + svcSell + equipSell);
    const marginDollars = round2(sellingPrice - totalCost);
    const marginPct = sellingPrice > 0 ? round2((1 - totalCost / sellingPrice) * 10000) / 10000 : 0;

    // Processor math
    const widthPx = spec.widthPx || (spec.pixelPitchMm && widthFt ? Math.round(widthFt * 304.8 / spec.pixelPitchMm) : 0);
    const heightPx = spec.heightPx || (spec.pixelPitchMm && heightFt ? Math.round(heightFt * 304.8 / spec.pixelPitchMm) : 0);
    const totalPixels = widthPx * heightPx * (spec.quantity || 1);
    // NovaStar 660 Pro: 650K pixels per port at 8-bit, 8 ports = 5.2M pixels
    const pixelsPerPort = 650000;
    const portsNeeded = totalPixels > 0 ? Math.ceil(totalPixels / pixelsPerPort) : 0;

    return {
      spec,
      priced,
      match: priced?.match ?? null,
      areaSqFt,
      widthFt,
      heightFt,
      installComplexity: displayComplexity,
      ledHardwareCost,
      structuralMaterialsCost,
      structuralLaborCost,
      electricalCost,
      pmCost,
      engCost,
      travelCost,
      sendingCardCost,
      sparePartsCost,
      signalCableCost,
      upsCost,
      backupProcessorCost,
      weatherproofCost,
      shippingCost,
      totalCost,
      sellingPrice,
      marginDollars,
      marginPct,
      totalPixels,
      portsNeeded,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateScopingWorkbook(
  options: ScopingWorkbookOptions,
): Promise<{ buffer: Buffer; displays: ComputedDisplay[] }> {
  const {
    project,
    specs: allSpecs,
    requirements = [],
    pricedDisplays: allPricedDisplays,
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "ANC Proposal Engine";
  wb.created = new Date();

  const projectName = project.projectName || project.venue || "Untitled Project";
  const clientName = project.clientName || "Client";
  const today = new Date().toISOString().split("T")[0];

  // Split base bid vs alternates — budget sheets only see base bid
  const baseSpecs = allSpecs.filter((s) => !s.isAlternate);
  const altSpecs = allSpecs.filter((s) => s.isAlternate);

  // Match pricedDisplays to base specs only
  const basePricedDisplays = allPricedDisplays
    ? allPricedDisplays.filter((pd) => !pd.spec.isAlternate)
    : undefined;

  // Compute base bid display data (used by all budget sheets)
  const displays = computeDisplays(baseSpecs, basePricedDisplays, installComplexity, ov);

  // Compute alternate display data (for reference sheet only)
  const altPricedDisplays = allPricedDisplays
    ? allPricedDisplays.filter((pd) => pd.spec.isAlternate)
    : undefined;
  const altDisplays = altSpecs.length > 0
    ? computeDisplays(altSpecs, altPricedDisplays, installComplexity)
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
    bondRequired: includeBond,
    location: project.location || project.venue || "",
    displayCount: displays.length,
    grandCost,
    grandSelling,
    grandMargin,
    grandMarginPct,
    displays,
  });

  // ─── Sheet 1: Margin Analysis ───────────────────────────────────────────
  const maGrandTotalRow = buildMarginAnalysis(wb, projectName, clientName, today, displays, altDisplays, grandCost, grandSelling, grandMargin, grandMarginPct, includeBond, ov);

  // Cross-sheet link: Project Overview document total → MA BASE BID GRAND TOTAL selling price
  const overviewSheet = wb.getWorksheet("Project Overview");
  if (overviewSheet) {
    overviewSheet.eachRow((row) => {
      if (row.getCell(2).value === "DOCUMENT TOTAL") {
        row.getCell(3).value = {
          formula: `'Margin Analysis'!D${maGrandTotalRow}`,
          result: grandSelling,
        };
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB ORDER (FINAL — Natalia, March 6 2026)
  // 1 Project Overview | 2 Margin Analysis | 3 Budget Summary | 4 LED Cost
  // 5 Tech Specs | 6 Install (per screen) | 7 Processor Count | 8 Bundle Equip
  // 9 Travel | 10 CMS | 11 Scoring | 12 Resp Matrix | 13 P&L | 14 Cash Flow
  // ═══════════════════════════════════════════════════════════════════════════

  // 3. Budget Summary
  buildBudgetSummary(wb, projectName, clientName, today, displays, grandCost, grandSelling, grandMargin, grandMarginPct, ov);

  // 4. LED Cost Sheet
  buildLedCostSheet(wb, projectName, displays);

  // 5. Tech Specs (no pricing — for installers/subs)
  buildTechSpecsSheet(wb, projectName, displays);

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
    buildInstallSheet(wb, projectName, today, d, d.installComplexity, tabName);
  });

  // 7. Processor Count
  buildProcessorCount(wb, projectName, displays);

  // 8. Bundle Equipment
  buildBundleEquipmentSheet(wb, projectName, displays);

  // 9. Travel
  buildTravel(wb, projectName);

  // 10. CMS
  buildCMS(wb, projectName);

  // 11. Scoring
  buildScoring(wb, projectName, displays);

  // 12. Resp Matrix
  buildRespMatrix(wb, projectName, project);

  // 13. P&L
  buildPnL(wb, projectName, displays, grandCost, grandSelling, grandMargin, paymentTerms);

  // 14. Cash Flow
  buildCashFlow(wb, projectName, grandSelling, grandCost, paymentTerms, contractDate, completionDate);

  // Internal: PO's
  buildPOs(wb, projectName);

  // Alternates (reference only — not in budget)
  if (altDisplays.length > 0) {
    buildAlternatesSheet(wb, projectName, altDisplays);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer: buffer as unknown as Buffer, displays };
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

  const finRows: [string, string][] = [
    ["LED Hardware Margin", `${(DEFAULT_MARGINS.ledHardware * 100).toFixed(0)}%`],
    ["Install / Services Margin", `${(DEFAULT_MARGINS.install * 100).toFixed(0)}%`],
    ["Engineering Margin", `${(DEFAULT_MARGINS.engineering * 100).toFixed(0)}%`],
    ["Equipment Margin", `${(DEFAULT_MARGINS.equipment * 100).toFixed(0)}%`],
    ["CMS Margin", `${(DEFAULT_MARGINS.cms * 100).toFixed(0)}%`],
    ["Bond Rate", data.bondRequired ? `${(rc("bond_tax.bond_rate", BOND_RATE) * 100).toFixed(1)}%` : "N/A"],
    ["Tax Rate", "Per zone (editable on MA)"],
    ["Tariff Rate", "Per zone (editable on MA)"],
  ];

  for (const [label, value] of finRows) {
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

  // ─── Section 3: Summary Totals ───
  const stR = ws.getRow(row);
  stR.getCell(2).value = "SUMMARY TOTALS";
  hdr(stR.getCell(2), C.ANC_BLUE);
  hdr(stR.getCell(3), C.ANC_BLUE);
  row++;

  const totalRows: [string, number, string][] = [
    ["Total Cost", data.grandCost, FMT_USD],
    ["Total Selling Price", data.grandSelling, FMT_USD],
    ["Blended Margin $", data.grandMargin, FMT_USD],
    ["Blended Margin %", data.grandMarginPct, FMT_PCT],
  ];

  for (const [label, value, fmt] of totalRows) {
    const r = ws.getRow(row);
    r.getCell(2).value = label;
    r.getCell(2).font = { bold: true, name: "Calibri", size: 10 };
    r.getCell(3).value = value;
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

  // ─── Section 4: Display Summary Table ───
  const dsR = ws.getRow(row);
  dsR.getCell(2).value = "DISPLAY SUMMARY";
  hdr(dsR.getCell(2), C.DARK_HEADER);
  hdr(dsR.getCell(3), C.DARK_HEADER);
  row++;

  // Mini table — Display Name | Selling Price
  for (const d of data.displays) {
    const r = ws.getRow(row);
    r.getCell(2).value = d.spec.name;
    r.getCell(2).font = { name: "Calibri", size: 10 };
    r.getCell(3).value = d.sellingPrice;
    r.getCell(3).numFmt = FMT_USD;
    r.getCell(3).font = { name: "Calibri", size: 10 };
    row++;
  }
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
): void {
  const ws = wb.addWorksheet("Budget Summary", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 44, 16, 16, 16, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "F", `${projectName} — Budget Summary`);
  setMeta(ws, "F", `${clientName} | ${date} | By Category`);

  let row = 4;
  const headers = ["", "Category", "Cost", "Selling Price", "Margin $", "Margin %"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.GREEN_TAB);
  });
  ws.getRow(row).height = 28;
  row++;

  // Aggregate costs across all displays by category
  let totalLedHw = 0, totalStructMat = 0, totalInstall = 0;
  let totalElectrical = 0, totalPm = 0, totalEng = 0, totalEquip = 0;

  for (const d of displays) {
    totalLedHw += d.ledHardwareCost + d.sparePartsCost;
    totalStructMat += d.structuralMaterialsCost;
    totalInstall += d.structuralLaborCost;
    totalElectrical += d.electricalCost;
    totalPm += d.pmCost + d.travelCost;
    totalEng += d.engCost;
    totalEquip += d.sendingCardCost + d.signalCableCost + d.upsCost
      + d.backupProcessorCost + d.weatherproofCost;
  }

  const sellFormula = (r: number) => `C${r}/(1-F${r})`;
  const marginFormula = (r: number) => `D${r}-C${r}`;

  // Margin priority: financial override > weighted average from displays > default
  const avgMargin = displays.length > 0
    ? displays.reduce((s, d) => s + d.marginPct, 0) / displays.length
    : 0.25;
  const hwMargin = ov?.ledMarginPct ?? (avgMargin > 0 ? avgMargin : DEFAULT_MARGINS.ledHardware);
  const svcMargin = ov?.servicesMarginPct ?? (avgMargin > 0 ? Math.max(avgMargin * 0.67, 0.15) : DEFAULT_MARGINS.install);

  // Category rows — each with cost, selling (formula), margin$, margin%
  const categories: [string, number, number][] = [
    ["LED Hardware (all displays)", totalLedHw, hwMargin],
    ["Structural Materials", totalStructMat, svcMargin],
    ["Structural Labor & LED Installation", totalInstall, svcMargin],
    ["Electrical & Data", totalElectrical, svcMargin],
    ["PM / General Conditions / Travel", totalPm, svcMargin],
    ["Engineering & Permits", totalEng, svcMargin],
  ];
  if (totalEquip > 0) {
    categories.push(["Processor & Equipment", totalEquip, hwMargin]);
  }

  const catStartRow = row;
  for (const [label, cost, marginPct] of categories) {
    const r = ws.getRow(row);
    r.getCell(2).value = label;
    r.getCell(2).font = { name: "Calibri", size: 10 };
    r.getCell(3).value = cost; r.getCell(3).numFmt = FMT_USD;
    r.getCell(4).value = { formula: sellFormula(row), result: cost > 0 ? round2(cost / (1 - marginPct)) : 0 };
    r.getCell(4).numFmt = FMT_USD;
    r.getCell(5).value = { formula: marginFormula(row), result: cost > 0 ? round2(cost / (1 - marginPct) - cost) : 0 };
    r.getCell(5).numFmt = FMT_USD;
    r.getCell(6).value = marginPct; r.getCell(6).numFmt = FMT_PCT;
    stripe(r, 6, row % 2 === 0);
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
  stR.getCell(5).value = { formula: `D${row}-C${row}`, result: grandMargin };
  stR.getCell(5).numFmt = FMT_USD;
  stR.getCell(6).value = { formula: `1-C${row}/D${row}`, result: grandMarginPct };
  stR.getCell(6).numFmt = FMT_PCT;
  totalStyle(stR, 6, C.MEDIUM_GRAY);
  row++;

  // Grand total — same as MA grand total (cross-validates)
  row++;
  const gtR = ws.getRow(row);
  gtR.getCell(2).value = "GRAND TOTAL";
  gtR.getCell(3).value = grandCost; gtR.getCell(3).numFmt = FMT_USD;
  gtR.getCell(4).value = grandSelling; gtR.getCell(4).numFmt = FMT_USD;
  gtR.getCell(5).value = grandMargin; gtR.getCell(5).numFmt = FMT_USD;
  gtR.getCell(6).value = grandMarginPct; gtR.getCell(6).numFmt = FMT_PCT;
  totalStyle(gtR, 6, C.ANC_BLUE);
  for (let c = 2; c <= 6; c++) {
    gtR.getCell(c).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  }

  // Note: grand totals match between MA and Budget Summary since both
  // use the same per-display ComputedDisplay data and margin rates.
}

// ─── 1. MARGIN ANALYSIS ─────────────────────────────────────────────────────

// Default margin rates — used ONLY when display has no priced margin data.
// When a display has marginPct from the pricing engine, that takes priority.
const DEFAULT_MARGINS: Record<string, number> = {
  ledHardware: 0.30,
  structural: 0.20,
  install: 0.20,
  electrical: 0.20,
  pm: 0.20,
  engineering: 0.20,
  equipment: 0.30,
  cms: 0.35,
  scoring: 0.10,
};

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
  const sellFormula = (r: number) => `C${r}/(1-F${r})`;
  const marginDollarFormula = (r: number) => `D${r}-C${r}`;
  const blendedMarginFormula = (r: number) => `1-C${r}/D${r}`;

  function writeCategory(label: string, cost: number, marginPct: number): void {
    const r = ws.getRow(row);
    r.getCell(2).value = `    ${label}`; r.getCell(2).font = subFont;
    r.getCell(3).value = cost; r.getCell(3).numFmt = ";;;";
    r.getCell(4).value = { formula: sellFormula(row), result: cost > 0 ? round2(cost / (1 - marginPct)) : 0 };
    r.getCell(4).numFmt = FMT_USD; r.getCell(4).font = subFont;
    r.getCell(6).value = marginPct; r.getCell(6).numFmt = ";;;";
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
    // Margin priority: financial override > display priced > default
    const catStartRow = row;
    const ledHardwareWithSpares = d.ledHardwareCost + d.sparePartsCost;
    const hwMargin = ov?.ledMarginPct ?? (d.marginPct > 0 ? d.marginPct : DEFAULT_MARGINS.ledHardware);
    const svcMargin = ov?.servicesMarginPct ?? (d.marginPct > 0 ? Math.max(d.marginPct * 0.67, 0.15) : DEFAULT_MARGINS.install);

    writeCategory("LED Hardware", ledHardwareWithSpares, hwMargin);
    writeCategory("Structural Materials", d.structuralMaterialsCost, svcMargin);
    writeCategory("Structural Labor & LED Installation", d.structuralLaborCost, svcMargin);
    writeCategory("Electrical & Data", d.electricalCost, svcMargin);
    writeCategory("PM / General Conditions / Travel", d.pmCost + d.travelCost, svcMargin);
    writeCategory("Engineering & Permits", d.engCost, svcMargin);

    // Equipment bundle (group non-zero items into one line)
    const equipCost = d.sendingCardCost + d.signalCableCost + d.upsCost
      + d.backupProcessorCost + d.weatherproofCost;
    if (equipCost > 0) {
      writeCategory("Processor & Equipment", equipCost, hwMargin);
    }
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
    const txR = ws.getRow(row);
    txR.getCell(2).value = "    TAX"; txR.getCell(2).font = subFont;
    const taxRateVal = ov?.taxRate ?? 0;
    txR.getCell(4).value = { formula: `D${subtotalRow}*G${row}`, result: round2(d.sellingPrice * taxRateVal) };
    txR.getCell(4).numFmt = FMT_USD;
    txR.getCell(7).value = taxRateVal; txR.getCell(7).numFmt = FMT_PCT; inputCell(txR.getCell(7));
    row++;

    // ─── BOND — formula: =D{subtotal} * rate ───
    const bondRow = row;
    const bdR = ws.getRow(row);
    bdR.getCell(2).value = "    BOND"; bdR.getCell(2).font = subFont;
    const bondRateVal = ov?.bondRate ?? (includeBond ? rc("bond_tax.bond_rate", BOND_RATE) : 0);
    bdR.getCell(4).value = { formula: `D${subtotalRow}*G${row}`, result: round2(d.sellingPrice * bondRateVal) };
    bdR.getCell(4).numFmt = FMT_USD;
    bdR.getCell(7).value = bondRateVal; bdR.getCell(7).numFmt = FMT_PCT; inputCell(bdR.getCell(7));
    row++;

    // ─── TARIFF — formula: =D{subtotal} * rate ───
    const tariffRow = row;
    const trR = ws.getRow(row);
    trR.getCell(2).value = "    TARIFF"; trR.getCell(2).font = subFont;
    trR.getCell(4).value = { formula: `D${subtotalRow}*G${row}`, result: 0 };
    trR.getCell(4).numFmt = FMT_USD;
    trR.getCell(7).value = 0; trR.getCell(7).numFmt = FMT_PCT; inputCell(trR.getCell(7));
    row++;

    // ─── GRAND TOTAL — Subtotal + Tax + Bond + Tariff ───
    const grandRow = row;
    const grR = ws.getRow(row);
    grR.getCell(2).value = "    GRAND TOTAL"; grR.getCell(2).font = { bold: true, name: "Calibri", size: 11 };
    grR.getCell(3).value = { formula: `C${subtotalRow}`, result: d.totalCost };
    grR.getCell(3).numFmt = FMT_USD; grR.getCell(3).font = { bold: true, name: "Calibri" };
    grR.getCell(4).value = { formula: `D${subtotalRow}+D${taxRow}+D${bondRow}+D${tariffRow}`, result: d.sellingPrice };
    grR.getCell(4).numFmt = FMT_USD; grR.getCell(4).font = { bold: true, name: "Calibri" };
    grR.getCell(5).value = { formula: `D${grandRow}-C${grandRow}`, result: d.marginDollars };
    grR.getCell(5).numFmt = FMT_USD; grR.getCell(5).font = { bold: true, name: "Calibri" };
    grR.getCell(6).value = { formula: `1-C${grandRow}/D${grandRow}`, result: d.marginPct };
    grR.getCell(6).numFmt = FMT_PCT; grR.getCell(6).font = { bold: true, name: "Calibri" };
    // Light bottom border to separate from next section
    for (let c = 2; c <= 6; c++) {
      grR.getCell(c).border = { bottom: { style: "medium", color: { argb: C.ANC_BLUE } } };
    }
    screenGrandTotalRows.push(grandRow);
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

  // CMS — use override allocation if set, otherwise editable $0 placeholder
  const cmsCost = ov?.cmsAllocation ?? 0;
  const cmsRow = row;
  const cmsR = ws.getRow(row);
  cmsR.getCell(2).value = "CMS (Content Management System)";
  cmsR.getCell(2).font = { bold: true, name: "Calibri" };
  cmsR.getCell(3).value = cmsCost; cmsR.getCell(3).numFmt = FMT_USD; inputCell(cmsR.getCell(3));
  cmsR.getCell(6).value = DEFAULT_MARGINS.cms; cmsR.getCell(6).numFmt = FMT_PCT; inputCell(cmsR.getCell(6));
  cmsR.getCell(4).value = { formula: sellFormula(row), result: cmsCost > 0 ? round2(cmsCost / (1 - DEFAULT_MARGINS.cms)) : 0 }; cmsR.getCell(4).numFmt = FMT_USD;
  cmsR.getCell(5).value = { formula: marginDollarFormula(row), result: cmsCost > 0 ? round2(cmsCost / (1 - DEFAULT_MARGINS.cms) - cmsCost) : 0 }; cmsR.getCell(5).numFmt = FMT_USD;
  screenGrandTotalRows.push(cmsRow);
  row++;

  // Scoring — use override allocation if set, otherwise editable $0 placeholder
  const scoringCost = ov?.scoringAllocation ?? 0;
  const scoringRow = row;
  const scR = ws.getRow(row);
  scR.getCell(2).value = "Scoring System";
  scR.getCell(2).font = { bold: true, name: "Calibri" };
  scR.getCell(3).value = scoringCost; scR.getCell(3).numFmt = FMT_USD; inputCell(scR.getCell(3));
  scR.getCell(6).value = DEFAULT_MARGINS.scoring; scR.getCell(6).numFmt = FMT_PCT; inputCell(scR.getCell(6));
  scR.getCell(4).value = { formula: sellFormula(row), result: scoringCost > 0 ? round2(scoringCost / (1 - DEFAULT_MARGINS.scoring)) : 0 }; scR.getCell(4).numFmt = FMT_USD;
  scR.getCell(5).value = { formula: marginDollarFormula(row), result: scoringCost > 0 ? round2(scoringCost / (1 - DEFAULT_MARGINS.scoring) - scoringCost) : 0 }; scR.getCell(5).numFmt = FMT_USD;
  screenGrandTotalRows.push(scoringRow);
  row++;
  row++; // separator

  // ═══════════════════════════════════════════════════════════════════════════
  // BASE BID GRAND TOTAL — sums all screen grand totals + CMS + Scoring
  // ═══════════════════════════════════════════════════════════════════════════
  const costGtRefs = screenGrandTotalRows.map((r) => `C${r}`).join(",");
  const sellGtRefs = screenGrandTotalRows.map((r) => `D${r}`).join(",");

  const baseBidRow = row;
  const bbR = ws.getRow(row);
  bbR.getCell(2).value = "BASE BID GRAND TOTAL";
  bbR.getCell(3).value = { formula: `SUM(${costGtRefs})`, result: grandCost };
  bbR.getCell(3).numFmt = FMT_USD;
  bbR.getCell(4).value = { formula: `SUM(${sellGtRefs})`, result: grandSelling };
  bbR.getCell(4).numFmt = FMT_USD;
  bbR.getCell(5).value = { formula: `D${baseBidRow}-C${baseBidRow}`, result: grandMargin };
  bbR.getCell(5).numFmt = FMT_USD;
  bbR.getCell(6).value = { formula: `1-C${baseBidRow}/D${baseBidRow}`, result: grandMarginPct };
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
): void {
  const ws = wb.addWorksheet("LED Cost Sheet", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  // Full format matching the online version — includes electrical, pricing, margins
  const COLS = 23;
  const colWidths = [36, 18, 14, 10, 10, 10, 10, 10, 8, 12, 10, 10, 12, 12, 14, 14, 14, 14, 12, 16, 12, 14, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "T", `${projectName} — LED Cost Sheet`);

  let row = 3;

  // Header row — matches online format
  const hdrLabels = [
    "Display", "Vendor", "Product", "Pitch",
    "H (ft)", "W (ft)", "H (px)", "W (px)",
    "Qty", "Total SqFt",
    "NITs", "Service",
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
  displays.forEach((d, idx) => {
    const dr = ws.getRow(row);
    dr.getCell(1).value = d.spec.name + (d.spec.location ? ` — ${d.spec.location}` : "");
    dr.getCell(1).font = { bold: true, name: "Calibri" };
    // Vendor — honor explicit product selection > priced match > fallback
    const selectedProduct = d.spec.selectedProductId ? getProduct(d.spec.selectedProductId) : null;
    dr.getCell(2).value = selectedProduct
      ? `${selectedProduct.manufacturer} ${selectedProduct.displayName || ""}`.trim()
      : d.match?.module?.manufacturer
        ? `${d.match.module.manufacturer} ${d.match.module.name || ""}`.trim()
        : (d.spec.environment === "outdoor" ? "Yaham" : "LG/Yaham");
    // Product
    dr.getCell(3).value = selectedProduct?.displayName
      || d.spec.selectedProductName
      || d.match?.module?.name
      || "—";
    // Pitch
    dr.getCell(4).value = d.spec.pixelPitchMm ? `${d.spec.pixelPitchMm}mm` : "—";
    dr.getCell(4).alignment = { horizontal: "center" };
    // H (ft), W (ft)
    dr.getCell(5).value = d.heightFt || 0; dr.getCell(5).numFmt = "0.00";
    dr.getCell(6).value = d.widthFt || 0; dr.getCell(6).numFmt = "0.00";
    // H (px), W (px) — plain integers, NOT currency
    const hPx = d.spec.heightPx || (d.spec.pixelPitchMm && d.heightFt ? Math.round(d.heightFt * 304.8 / d.spec.pixelPitchMm) : 0);
    const wPx = d.spec.widthPx || (d.spec.pixelPitchMm && d.widthFt ? Math.round(d.widthFt * 304.8 / d.spec.pixelPitchMm) : 0);
    dr.getCell(7).value = hPx;
    dr.getCell(8).value = wPx;
    // Qty
    const qty = d.spec.quantity || 1;
    dr.getCell(9).value = qty; dr.getCell(9).alignment = { horizontal: "center" };
    // Total SqFt formula: =E{row}*F{row}*I{row}
    dr.getCell(10).value = { formula: `E${row}*F${row}*I${row}`, result: d.areaSqFt };
    dr.getCell(10).numFmt = "#,##0";
    // NITs
    dr.getCell(11).value = d.match?.module?.nits ?? d.spec.brightnessNits ?? "";
    dr.getCell(11).alignment = { horizontal: "center" };
    // Service
    dr.getCell(12).value = d.spec.serviceType || "Front";
    dr.getCell(12).alignment = { horizontal: "center" };
    // $/SqFt = Display Cost / Total SqFt
    const ledWithSpares = d.ledHardwareCost + d.sparePartsCost;
    const costPerSqFt = d.areaSqFt > 0 ? round2(ledWithSpares / d.areaSqFt) : 0;
    dr.getCell(13).value = { formula: `N${row}/J${row}`, result: costPerSqFt };
    dr.getCell(13).numFmt = FMT_USD;
    // Display Cost (LED hardware + spare parts rolled in)
    dr.getCell(14).value = d.ledHardwareCost + d.sparePartsCost; dr.getCell(14).numFmt = FMT_USD;
    // Processor
    dr.getCell(15).value = d.sendingCardCost || 0; dr.getCell(15).numFmt = FMT_USD;
    // Shipping
    dr.getCell(16).value = d.shippingCost; dr.getCell(16).numFmt = FMT_USD;
    // Total Cost = Display + Processor + Shipping
    dr.getCell(17).value = { formula: `N${row}+O${row}+P${row}`, result: ledWithSpares + (d.sendingCardCost || 0) + d.shippingCost };
    dr.getCell(17).numFmt = FMT_USD;
    dr.getCell(17).font = { bold: true, name: "Calibri" };
    // Margin %
    dr.getCell(18).value = d.marginPct; dr.getCell(18).numFmt = FMT_PCT;
    // Selling Price = Total Cost / (1 - Margin%)
    dr.getCell(19).value = { formula: `Q${row}/(1-R${row})`, result: d.sellingPrice };
    dr.getCell(19).numFmt = FMT_USD;
    dr.getCell(19).font = { bold: true, name: "Calibri" };
    // ANC Margin = Selling - Cost
    dr.getCell(20).value = { formula: `S${row}-Q${row}`, result: d.marginDollars };
    dr.getCell(20).numFmt = FMT_USD;

    // Weight & Power — honor selected product > pitch-based catalog lookup
    const areaM2 = d.areaSqFt * 0.092903;
    const pitch = d.spec.pixelPitchMm ?? 0;
    const catalogMatch = selectedProduct
      ?? (pitch > 0 ? getAllProducts().find((p) => Math.abs(p.pitchMm - pitch) < 0.5) : null);
    const weight = catalogMatch
      ? Math.round(areaM2 * catalogMatch.weightDensityLbm2)
      : Math.round(d.areaSqFt * 5); // fallback ~5 lbs/sqft
    const power = catalogMatch
      ? Math.round(areaM2 * catalogMatch.powerDensityWm2)
      : 0;
    if (weight > 0) { dr.getCell(21).value = weight; dr.getCell(21).numFmt = "#,##0"; }
    if (power > 0) { dr.getCell(22).value = power; dr.getCell(22).numFmt = "#,##0"; }
    if (power > 0) { dr.getCell(23).value = { formula: `V${row}*3.412`, result: Math.round(power * 3.412) }; dr.getCell(23).numFmt = "#,##0"; }

    stripe(dr, COLS, idx % 2 === 0);

    // Re-apply number formats AFTER stripe — ExcelJS fill setter can reset numFmt
    dr.getCell(5).numFmt = "0.00";   // H (ft)
    dr.getCell(6).numFmt = "0.00";   // W (ft)
    dr.getCell(7).numFmt = "0";      // H (px) — plain integer
    dr.getCell(8).numFmt = "0";      // W (px) — plain integer
    dr.getCell(10).numFmt = "#,##0"; // Total SqFt

    row++;
  });

  // Total row with SUM formulas
  row++;
  const gtR = ws.getRow(row);
  gtR.getCell(1).value = `TOTAL (${displays.length} displays)`;
  gtR.getCell(1).font = { bold: true, name: "Calibri" };
  gtR.getCell(10).value = { formula: `SUM(J${dataStartRow}:J${row - 2})`, result: displays.reduce((s, d) => s + d.areaSqFt, 0) };
  gtR.getCell(10).numFmt = "#,##0";
  gtR.getCell(14).value = { formula: `SUM(N${dataStartRow}:N${row - 2})`, result: displays.reduce((s, d) => s + d.ledHardwareCost, 0) };
  gtR.getCell(14).numFmt = FMT_USD;
  gtR.getCell(15).value = { formula: `SUM(O${dataStartRow}:O${row - 2})`, result: displays.reduce((s, d) => s + (d.sendingCardCost || 0), 0) };
  gtR.getCell(15).numFmt = FMT_USD;
  gtR.getCell(16).value = { formula: `SUM(P${dataStartRow}:P${row - 2})`, result: 0 };
  gtR.getCell(16).numFmt = FMT_USD;
  gtR.getCell(17).value = { formula: `SUM(Q${dataStartRow}:Q${row - 2})`, result: displays.reduce((s, d) => s + d.totalCost, 0) };
  gtR.getCell(17).numFmt = FMT_USD;
  gtR.getCell(19).value = { formula: `SUM(S${dataStartRow}:S${row - 2})`, result: displays.reduce((s, d) => s + d.sellingPrice, 0) };
  gtR.getCell(19).numFmt = FMT_USD;
  gtR.getCell(20).value = { formula: `SUM(T${dataStartRow}:T${row - 2})`, result: displays.reduce((s, d) => s + d.marginDollars, 0) };
  gtR.getCell(20).numFmt = FMT_USD;
  gtR.getCell(21).value = { formula: `SUM(U${dataStartRow}:U${row - 2})`, result: 0 };
  gtR.getCell(21).numFmt = "#,##0";
  gtR.getCell(22).value = { formula: `SUM(V${dataStartRow}:V${row - 2})`, result: 0 };
  gtR.getCell(22).numFmt = "#,##0";
  gtR.getCell(23).value = { formula: `SUM(W${dataStartRow}:W${row - 2})`, result: 0 };
  gtR.getCell(23).numFmt = "#,##0";
  totalStyle(gtR, COLS, C.GREEN_BG);
}

// ─── 3. PER-ZONE INSTALL SHEET ─────────────────────────────────────────────

function buildInstallSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  date: string,
  d: ComputedDisplay,
  complexity: InstallComplexity,
  tabName?: string,
): void {
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

  // Margin assignment — track row numbers so data rows can reference them
  row += 2;
  ws.getCell(row, 3).value = "Linked Margin Assignment";
  ws.getCell(row, 3).font = { bold: true, name: "Calibri" };
  row++;
  const marginRows = { install: row, electrical: row + 1, anc: row + 2, engineering: row + 3 };
  const margins = [
    ["Install Margin", MARGIN_PRESETS.servicesDefault],
    ["Electrical Margin", MARGIN_PRESETS.servicesDefault],
    ["ANC Margin", MARGIN_PRESETS.servicesDefault],
    ["Engineering and Permits", MARGIN_PRESETS.servicesDefault],
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
  const svcMargin = getServiceMargin(d.areaSqFt);

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
  laborItems.forEach((item, i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = item;
    let cost = 0;
    if (i === 2) cost = d.structuralLaborCost; // INSTALL LED DISPLAYS
    if (i === 5) cost = d.pmCost; // PM/GC/TRAVEL
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

  const lSubR = ws.getRow(row);
  lSubR.getCell(2).value = "SUBTOTAL";
  lSubR.getCell(9).value = { formula: `SUM(I${laborStartRow}:I${row - 1})`, result: d.structuralLaborCost + d.pmCost };
  lSubR.getCell(9).numFmt = FMT_USD;
  lSubR.getCell(11).value = { formula: `SUM(K${laborStartRow}:K${row - 1})`, result: round2((d.structuralLaborCost + d.pmCost) / (1 - svcMargin)) };
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
  gtR.getCell(9).value = d.totalCost; gtR.getCell(9).numFmt = FMT_USD;
  gtR.getCell(11).value = d.sellingPrice; gtR.getCell(11).numFmt = FMT_USD;
  totalStyle(gtR, 11, C.ANC_BLUE);
  gtR.getCell(2).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  gtR.getCell(9).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  gtR.getCell(11).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
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

  const dHeaders = ["", "Display", "Width (px)", "Height (px)", "Total Pixels", "Ports Needed (660 Pro)", "Processors Needed"];
  dHeaders.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.ANC_BLUE);
  });
  ws.getRow(row).height = 28;
  row++;

  let totalPorts = 0;
  displays.forEach((d, i) => {
    const wPx = d.spec.widthPx || (d.spec.pixelPitchMm && d.widthFt ? Math.round(d.widthFt * 304.8 / d.spec.pixelPitchMm) : 0);
    const hPx = d.spec.heightPx || (d.spec.pixelPitchMm && d.heightFt ? Math.round(d.heightFt * 304.8 / d.spec.pixelPitchMm) : 0);
    const r = ws.getRow(row);
    r.getCell(2).value = d.spec.name;
    r.getCell(3).value = wPx; r.getCell(3).numFmt = FMT_INT;
    r.getCell(4).value = hPx; r.getCell(4).numFmt = FMT_INT;
    r.getCell(5).value = d.totalPixels; r.getCell(5).numFmt = FMT_INT;
    r.getCell(6).value = d.portsNeeded;
    r.getCell(7).value = Math.ceil(d.portsNeeded / 8); // 660 Pro has 8 ports
    totalPorts += d.portsNeeded;
    stripe(r, 7, i % 2 === 0);
    row++;
  });

  const pTotalR = ws.getRow(row);
  pTotalR.getCell(2).value = "TOTAL";
  pTotalR.getCell(6).value = totalPorts;
  pTotalR.getCell(7).value = Math.ceil(totalPorts / 8);
  totalStyle(pTotalR, 7, C.GREEN_BG);
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
): void {
  const ws = wb.addWorksheet("CMS", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 14, 36, 14, 10, 14, 12, 4];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "G", `${projectName} — Content Management System`);

  let row = 4;

  ws.getCell(row, 2).value = "CMS Platform";
  ws.getCell(row, 2).font = { bold: true, size: 12, name: "Calibri" };
  row++;
  ws.getCell(row, 2).value = "All costs require project-specific pricing — update items below based on RFP requirements";
  ws.getCell(row, 2).font = { italic: true, color: { argb: "FFCC0000" }, name: "Calibri", size: 10 };
  row++;

  const cmsHeaders = ["", "Category", "Item", "Cost", "Quantity", "Total Cost", "Margin"];
  cmsHeaders.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
    hdr(ws.getCell(row, i + 1), C.DARK_HEADER);
  });
  ws.getRow(row).height = 24;
  row++;

  const cmsItems = [
    ["PRIMARY", "DESIGN & CONTROL SOFTWARE", 0],
    ["PRIMARY", "GRAPHICS PLAYBACK ENGINE", 0],
    ["PRIMARY", "IMAGE PROCESSING", 0],
    ["PRIMARY", "DEDICATED LED ROUTER / SWITCH", 0],
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

  cmsItems.forEach(([cat, item, cost], i) => {
    const r = ws.getRow(row);
    r.getCell(2).value = cat;
    r.getCell(2).font = { name: "Calibri", size: 10, bold: !!cat };
    r.getCell(3).value = item;
    r.getCell(4).value = cost; r.getCell(4).numFmt = FMT_USD; inputCell(r.getCell(4));
    r.getCell(5).value = 0; inputCell(r.getCell(5));
    r.getCell(6).value = 0; r.getCell(6).numFmt = FMT_USD;
    r.getCell(7).value = 0.10; r.getCell(7).numFmt = FMT_PCT;
    stripe(r, 7, i % 2 === 0);
    row++;
  });

  row++;
  const totR = ws.getRow(row);
  totR.getCell(3).value = "CMS TOTAL";
  totR.getCell(6).value = 0; totR.getCell(6).numFmt = FMT_USD;
  totalStyle(totR, 7, C.GREEN_BG);

  row += 2;
  ws.getCell(row, 2).value = "TAX";
  ws.getCell(row, 6).value = 0; ws.getCell(row, 6).numFmt = FMT_USD; inputCell(ws.getCell(row, 6));
  row++;
  ws.getCell(row, 2).value = "BOND";
  ws.getCell(row, 6).value = 0; ws.getCell(row, 6).numFmt = FMT_USD; inputCell(ws.getCell(row, 6));
  row++;
  const subR = ws.getRow(row);
  subR.getCell(2).value = "SUB TOTAL";
  subR.getCell(3).value = "USD:";
  subR.getCell(6).value = 0; subR.getCell(6).numFmt = FMT_USD;
  totalStyle(subR, 7, C.ANC_BLUE);
  subR.getCell(2).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(3).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(6).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
}

// ─── 11. SCORING ─────────────────────────────────────────────────────────

function buildScoring(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
): void {
  const ws = wb.addWorksheet("Scoring", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [4, 14, 36, 14, 10, 14, 12, 4];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "G", `${projectName} — Scoring System`);

  let row = 4;

  ws.getCell(row, 2).value = "Scoring Platform";
  ws.getCell(row, 2).font = { bold: true, size: 12, name: "Calibri" };
  row++;
  ws.getCell(row, 2).value = "All costs require project-specific pricing — update items below based on RFP requirements";
  ws.getCell(row, 2).font = { italic: true, color: { argb: "FFCC0000" }, name: "Calibri", size: 10 };
  row++;

  const headers = ["", "Category", "Item", "Cost", "Quantity", "Total Cost", "Margin"];
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
    stripe(r, 7, i % 2 === 0);
    row++;
  });

  row++;
  const totR = ws.getRow(row);
  totR.getCell(3).value = "SCORING TOTAL";
  totR.getCell(6).value = { formula: `SUM(F${startRow}:F${row - 2})`, result: 0 };
  totR.getCell(6).numFmt = FMT_USD;
  totalStyle(totR, 7, C.GREEN_BG);

  row += 2;
  ws.getCell(row, 2).value = "TAX";
  ws.getCell(row, 6).value = 0; ws.getCell(row, 6).numFmt = FMT_USD; inputCell(ws.getCell(row, 6));
  row++;
  ws.getCell(row, 2).value = "BOND";
  ws.getCell(row, 6).value = 0; ws.getCell(row, 6).numFmt = FMT_USD; inputCell(ws.getCell(row, 6));
  row++;
  const subR = ws.getRow(row);
  subR.getCell(2).value = "SUB TOTAL";
  subR.getCell(3).value = "USD:";
  subR.getCell(6).value = 0; subR.getCell(6).numFmt = FMT_USD;
  totalStyle(subR, 7, C.ANC_BLUE);
  subR.getCell(2).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(3).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
  subR.getCell(6).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
}

// ─── BUNDLE EQUIPMENT (Processor & Equipment breakdown) ──────────────────

function buildBundleEquipmentSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
): void {
  const ws = wb.addWorksheet("Bundle Equipment", {
    properties: { tabColor: { argb: C.GREEN_TAB } },
  });

  const colWidths = [36, 30, 14, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "D", `${projectName} — Processor & Equipment Breakdown`);
  setMeta(ws, "D", "Editable — adjust component costs per display zone. Totals roll into Margin Analysis.");

  let row = 4;
  const headers = ["Display Zone", "Component", "Qty", "Cost"];
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

    if (items.length === 0) {
      const emptyR = ws.getRow(row);
      emptyR.getCell(2).value = "(no equipment for this zone)";
      emptyR.getCell(2).font = { italic: true, color: { argb: "FF999999" }, name: "Calibri", size: 10 };
      row++;
    } else {
      const firstItemRow = row;
      items.forEach(([label, cost]) => {
        const ir = ws.getRow(row);
        ir.getCell(2).value = label;
        ir.getCell(3).value = 1;
        ir.getCell(3).alignment = { horizontal: "center" };
        ir.getCell(4).value = cost;
        ir.getCell(4).numFmt = FMT_USD;
        inputCell(ir.getCell(4)); // yellow — editable
        stripe(ir, 4, row % 2 === 0);
        row++;
      });

      // Zone subtotal
      const subR = ws.getRow(row);
      subR.getCell(2).value = "Zone Subtotal";
      subR.getCell(2).font = { bold: true, name: "Calibri" };
      subR.getCell(4).value = { formula: `SUM(D${firstItemRow}:D${row - 1})`, result: items.reduce((s, [, c]) => s + c, 0) };
      subR.getCell(4).numFmt = FMT_USD;
      subR.getCell(4).font = { bold: true, name: "Calibri" };
      zoneTotalRows.push(row);
      row++;
    }

    row++; // separator
  });

  // Grand total
  if (zoneTotalRows.length > 0) {
    const grandR = ws.getRow(row);
    grandR.getCell(1).value = "EQUIPMENT GRAND TOTAL";
    grandR.getCell(1).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
    const formula = zoneTotalRows.map((r) => `D${r}`).join("+");
    const result = zoneTotalRows.reduce((s) => s, 0); // formula will compute
    grandR.getCell(4).value = { formula, result: displays.reduce((s, d) => s + d.sendingCardCost + d.signalCableCost + d.upsCost + d.backupProcessorCost + d.weatherproofCost, 0) };
    grandR.getCell(4).numFmt = FMT_USD;
    grandR.getCell(4).font = { bold: true, color: { argb: C.WHITE }, name: "Calibri" };
    totalStyle(grandR, 4, C.ANC_BLUE);
  }
}

// ─── TECH SPECS (INSTALLERS) — no pricing, cross-sheet refs ──────────────

function buildTechSpecsSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  displays: ComputedDisplay[],
): void {
  const ws = wb.addWorksheet("Tech Specs (Installers)", {
    properties: { tabColor: { argb: C.MEDIUM_GRAY } },
  });

  const colWidths = [36, 8, 12, 12, 12, 12, 12, 10, 12, 10, 10, 12, 14, 12];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "N", `${projectName} — LED Technical Specifications (No Pricing)`);
  setMeta(ws, "N", "Technical specifications only — no pricing data. Safe for installer/subcontractor distribution.");

  let row = 4;
  const headers = [
    "Display Name", "Qty", "Pixel Pitch", "Height (ft)", "Width (ft)",
    "Pixels H", "Pixels W", "Sq Ft", "Brightness (nits)", "Service", "Environment",
    "Weight (lbs)", "Total Power (W)", "BTU/hr",
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

    // All values via cross-sheet formulas to LED Cost Sheet
    r.getCell(1).value = { formula: `'LED Cost Sheet'!A${ledRow}` };
    r.getCell(2).value = { formula: `'LED Cost Sheet'!I${ledRow}` };
    r.getCell(3).value = { formula: `'LED Cost Sheet'!D${ledRow}` };
    r.getCell(4).value = { formula: `'LED Cost Sheet'!E${ledRow}` };
    r.getCell(5).value = { formula: `'LED Cost Sheet'!F${ledRow}` };
    r.getCell(6).value = { formula: `'LED Cost Sheet'!G${ledRow}` };
    r.getCell(7).value = { formula: `'LED Cost Sheet'!H${ledRow}` };
    // Sq Ft: =D*E*B (height × width × qty)
    r.getCell(8).value = { formula: `D${row}*E${row}*B${row}`, result: d.areaSqFt };
    r.getCell(8).numFmt = "#,##0";
    r.getCell(9).value = { formula: `'LED Cost Sheet'!K${ledRow}` };
    r.getCell(10).value = { formula: `'LED Cost Sheet'!L${ledRow}` };
    r.getCell(11).value = d.spec.environment || "indoor";

    // Weight & Power & BTU — cross-sheet refs to LED Cost Sheet (cols U, V, W)
    r.getCell(12).value = { formula: `'LED Cost Sheet'!U${ledRow}` };
    r.getCell(12).numFmt = "#,##0";
    r.getCell(13).value = { formula: `'LED Cost Sheet'!V${ledRow}` };
    r.getCell(13).numFmt = "#,##0";
    r.getCell(14).value = { formula: `'LED Cost Sheet'!W${ledRow}` };
    r.getCell(14).numFmt = "#,##0";

    stripe(r, 14, idx % 2 === 0);
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
    r.getCell(6).value = d.spec.pixelPitchMm != null ? `${d.spec.pixelPitchMm}mm` : "TBD";
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
