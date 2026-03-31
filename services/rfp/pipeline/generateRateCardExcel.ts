/**
 * Step 6: Rate Card Excel Assembly
 *
 * Combines extracted LED specs + subcontractor quotes + ANC rate card
 * into a final pricing Excel ready for proposal integration.
 *
 * Architecture:
 * - Sheet 1: "Pricing Summary" — one row per display with cost, margin, selling price
 * - Sheet 2: "Cost Breakdown" — detailed line items per display
 * - Sheet 3: "Rate Card" — all rates used for audit trail
 *
 * Uses: ProductMatcher for product matching, rateCardLoader for margins/install rates,
 * productCatalog for hardware cost calculation.
 */

import ExcelJS from "exceljs";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import type { QuotedSpec } from "./quoteImporter";
import { ProductMatcher, type MatchedSolution } from "@/services/catalog/productMatcher";
import { getFullRateCard, preloadRateCard } from "@/services/rfp/rateCardLoader";
import {
  getProduct,
  getProductByPitch,
  calculateExhibitG,
  calculateHardwareCost,
  estimatePricing,
  MARGIN_PRESETS,
  BOND_RATE,
  LED_COST_PER_SQFT_BY_PITCH,
  type ZoneClass,
} from "@/services/rfp/productCatalog";

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  ANC_BLUE: "FF0A52EF",
  DARK_HEADER: "FF1F2937",
  WHITE: "FFFFFFFF",
  LIGHT_GRAY: "FFF8F9FA",
  MEDIUM_GRAY: "FFDEE2E6",
  GREEN_BG: "FFD4EDDA",
  RED_BG: "FFFCE4E4",
  GREEN: "FF28A745",
  AMBER: "FFFFC107",
  AMBER_BG: "FFFFF8E1",
  AMBER_HEADER: "FFCC8800",
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PricedDisplay {
  spec: ExtractedLEDSpec;
  quote: QuotedSpec | null;
  match: MatchedSolution | null;
  /** Area in sqft */
  areaSqFt: number;
  /** Hardware cost (from quote or rate card) */
  hardwareCost: number;
  /** Processor / bundle equipment cost */
  processorCost: number;
  /** Shipping / logistics cost */
  shippingCost: number;
  /** Installation cost */
  installCost: number;
  /** PM cost */
  pmCost: number;
  /** Engineering cost */
  engCost: number;
  /** Total cost before margin */
  totalCost: number;
  /** LED hardware margin % */
  ledMarginPct: number;
  /** Services margin % */
  svcMarginPct: number;
  /** Selling price (hardware) */
  hardwareSellingPrice: number;
  /** Selling price (services) */
  servicesSellingPrice: number;
  /** Total selling price */
  totalSellingPrice: number;
  /** Margin dollars */
  marginDollars: number;
  /** Project margin % */
  blendedMarginPct: number;
  /** Subcontractor lead time */
  leadTimeWeeks: number | null;
  /** Cost source */
  costSource: "subcontractor_quote" | "rate_card" | "product_match" | "no_match";
  /** Rate card estimate (always computed, even when quote is used — for delta comparison) */
  rateCardEstimate: number | null;
}

export interface RateCardExcelOptions {
  project: ExtractedProjectInfo;
  specs: ExtractedLEDSpec[];
  quotes: QuotedSpec[];
  /** Override zone classification (default: "standard") */
  zoneClass?: ZoneClass;
  /** Override install complexity */
  installComplexity?: "simple" | "standard" | "complex" | "heavy";
  /** Include bond? */
  includeBond?: boolean;
  /** Currency */
  currency?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function styleHeaderCell(cell: ExcelJS.Cell, bgColor: string = COLORS.DARK_HEADER): void {
  cell.font = { bold: true, color: { argb: COLORS.WHITE }, size: 11, name: "Calibri" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
}

function addStripeRow(row: ExcelJS.Row, colCount: number, isEven: boolean): void {
  if (isEven) {
    for (let i = 1; i <= colCount; i++) {
      row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.LIGHT_GRAY } };
    }
  }
}

function styleTotalRow(row: ExcelJS.Row, colCount: number, bgColor: string = COLORS.GREEN_BG): void {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, size: 12, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    cell.border = {
      top: { style: "medium", color: { argb: COLORS.DARK_HEADER } },
      bottom: { style: "medium", color: { argb: COLORS.DARK_HEADER } },
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

import { excelCurrencyFmt } from "@/services/pricing/currencyService";

let FMT = '"$"#,##0';
const PCT = "0.0%";

const PROCESSOR_PIXELS_PER_PORT = 650000;
const PROCESSOR_SMALL_UNIT_COST = 450;
const PROCESSOR_LARGE_UNIT_COST = 8400;
const SIGNAL_CABLE_PER_25_SQFT = 15;
const UPS_BATTERY_COST = 2500;
const BACKUP_PROCESSOR_COST = 12000;
const WEATHERPROOF_PER_SQFT = 12;

function getDisplayClassificationText(spec: ExtractedLEDSpec): string {
  return [
    spec.name,
    spec.location,
    spec.mountingType,
    spec.notes,
    ...(spec.specialRequirements || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function computeProcessorAndShipping(spec: ExtractedLEDSpec, areaSqFt: number): {
  processorCost: number;
  shippingCost: number;
} {
  const widthFt = spec.activeWidthFt || spec.widthFt || 0;
  const heightFt = spec.activeHeightFt || spec.heightFt || 0;
  const qty = spec.quantity || 1;
  const pitch = spec.pixelPitchMm || 0;
  const widthPx = spec.widthPx || (pitch > 0 ? Math.round(widthFt * 304.8 / pitch) : 0);
  const heightPx = spec.heightPx || (pitch > 0 ? Math.round(heightFt * 304.8 / pitch) : 0);
  const totalPixels = widthPx * heightPx * qty;
  const portsNeeded = totalPixels > 0 ? Math.ceil(totalPixels / PROCESSOR_PIXELS_PER_PORT) : 0;
  const portsPerUnit = portsNeeded > 8 ? 16 : 8;
  const processorUnitCost = portsNeeded > 8 ? PROCESSOR_LARGE_UNIT_COST : PROCESSOR_SMALL_UNIT_COST;
  const processorsNeeded = portsNeeded > 0 ? Math.ceil(portsNeeded / portsPerUnit) : (areaSqFt > 0 ? 1 : 0);

  const displayText = getDisplayClassificationText(spec);
  const isScoreboardLike = /scoreboard|center.?hung|hanging|jumbotron/i.test(displayText);
  const signalCableCost = areaSqFt > 0 ? round2(SIGNAL_CABLE_PER_25_SQFT * (areaSqFt / 25)) : 0;
  const upsCost = isScoreboardLike ? UPS_BATTERY_COST : 0;
  const backupProcessorCost = areaSqFt > 300 ? BACKUP_PROCESSOR_COST : 0;
  const weatherproofCost = spec.environment === "outdoor" ? round2(areaSqFt * WEATHERPROOF_PER_SQFT) : 0;
  const processorCost = round2(processorsNeeded * processorUnitCost + signalCableCost + upsCost + backupProcessorCost + weatherproofCost);

  const rawShipping = areaSqFt > 0 ? round2(areaSqFt * 10) : 0;
  const shippingCost = rawShipping > 0 ? Math.max(rawShipping, 500) : 0;

  return { processorCost, shippingCost };
}

// ─── Core: Price Each Display ───────────────────────────────────────────────

async function priceDisplay(
  spec: ExtractedLEDSpec,
  quote: QuotedSpec | null,
  zoneClass: ZoneClass,
  installComplexity: "simple" | "standard" | "complex" | "heavy",
  projectIsOutdoor: boolean = false,
): Promise<PricedDisplay> {
  // Trust the per-display environment from the RFP extraction.
  // Mixed projects (indoor + outdoor) are common — don't override individual display environments.
  // The AI classifies each display based on its nits, location, and context.

  // Calculate area — use active (cabinet-snapped) dimensions if available, else RFP originals
  const widthFt = spec.activeWidthFt || spec.widthFt || 0;
  const heightFt = spec.activeHeightFt || spec.heightFt || 0;
  const hasDimensions = widthFt > 0 && heightFt > 0;
  const areaSqFt = hasDimensions ? round2(widthFt * heightFt) : 0;
  const areaSqM = areaSqFt / 10.7639;

  // Determine hardware cost
  let hardwareCost = 0;
  let costSource: PricedDisplay["costSource"] = "rate_card";
  let rateCardEstimate: number | null = null;

  // Always compute rate card estimate for delta comparison.
  // Exact key match first, then nearest pitch within 0.5mm tolerance.
  const pitchVal = spec.pixelPitchMm;
  let ratePerSqFt: number | null = null;
  if (pitchVal != null) {
    const exactKey = String(pitchVal);
    ratePerSqFt = LED_COST_PER_SQFT_BY_PITCH[exactKey] ?? null;
    if (!ratePerSqFt) {
      const pitchKeys = Object.keys(LED_COST_PER_SQFT_BY_PITCH).map(Number).filter((n) => !isNaN(n));
      const nearest = pitchKeys.reduce((best, k) => Math.abs(k - pitchVal) < Math.abs(best - pitchVal) ? k : best, pitchKeys[0]);
      if (nearest != null && Math.abs(nearest - pitchVal) <= 0.5) {
        ratePerSqFt = LED_COST_PER_SQFT_BY_PITCH[String(nearest)] ?? null;
      }
    }
  }
  if (ratePerSqFt && ratePerSqFt > 0) {
    rateCardEstimate = round2(ratePerSqFt * areaSqFt * spec.quantity);
  }

  if (quote?.costPerSqFt != null) {
    // Priority 1: Subcontractor quote
    hardwareCost = round2(quote.costPerSqFt * areaSqFt * spec.quantity);
    costSource = "subcontractor_quote";
  } else {
    // Priority 2: Rate card by pitch
    if (rateCardEstimate != null) {
      hardwareCost = rateCardEstimate;
      costSource = "rate_card";
    } else {
      // Priority 3: Product match
      try {
        const matchForCost = await ProductMatcher.matchProduct({
          widthFt,
          heightFt,
          pixelPitch: spec.pixelPitchMm ?? undefined,
          brightnessNits: spec.brightnessNits ?? undefined,
          isOutdoor: spec.environment === "outdoor",
        });
        const product = getProductByPitch(
          matchForCost.module.pitch,
          spec.environment === "outdoor" ? "Outdoor" : "Indoor",
        );
        if (product) {
          const hwCost = calculateHardwareCost(areaSqM, product.id);
          hardwareCost = hwCost ? round2(hwCost * spec.quantity) : 0;
          costSource = hwCost ? "product_match" : "no_match";
        } else {
          costSource = "no_match";
        }
      } catch (err: any) {
        console.error(`[priceDisplay] Cost-source product match failed for "${spec.name}":`, err?.message || err);
        costSource = "no_match";
      }
    }
  }

  let match: MatchedSolution | null = null;
  try {
    match = await ProductMatcher.matchProduct({
      widthFt,
      heightFt,
      pixelPitch: spec.pixelPitchMm ?? undefined,
      brightnessNits: spec.brightnessNits ?? undefined,
      isOutdoor: spec.environment === "outdoor",
    });
    if (match) {
      console.log(`[priceDisplay] ✓ Matched "${spec.name}" → ${match.module.name} (pitch=${match.module.pitch}mm, fit=${match.fitScore}%, conf=${match.confidence})`);
    } else {
      console.warn(`[priceDisplay] ✗ No match for "${spec.name}" (pitch=${spec.pixelPitchMm}, ${widthFt}'×${heightFt}', ${spec.environment})`);
    }
  } catch (err: any) {
    console.error(`[priceDisplay] ✗ ProductMatcher THREW for "${spec.name}" (pitch=${spec.pixelPitchMm}, ${widthFt}'×${heightFt}'):`, err?.message || err);
  }

  // Calculate install/services costs using productCatalog's estimatePricing
  const pitchMm = spec.pixelPitchMm || (match?.module?.pitch) || (spec.environment === "outdoor" ? 10 : 3.9);
  const product = getProductByPitch(pitchMm, spec.environment === "outdoor" ? "Outdoor" : "Indoor")
    || getProductByPitch(pitchMm);

  let installCost = 0;
  let pmCost = 0;
  let engCost = 0;

  if (product) {
    const wPx = spec.widthPx || (widthFt * 304.8 / pitchMm);
    const hPx = spec.heightPx || (heightFt * 304.8 / pitchMm);
    const exhibitG = calculateExhibitG(product, Math.round(wPx), Math.round(hPx));
    const pricing = estimatePricing(exhibitG, zoneClass, undefined, { installComplexity });

    installCost = round2(pricing.installCost * spec.quantity);
    pmCost = round2(pricing.pmCost);
    engCost = round2(pricing.engCost);
  } else {
    // Fallback: rough estimate based on weight
    const weightLbs = spec.weightLbs || round2(areaSqFt * 5); // ~5 lbs/sqft fallback
    installCost = round2(weightLbs * 35 * spec.quantity); // $35/lb standard
    pmCost = round2(5882);
    engCost = round2(4706);
  }

  // Margins — flat 15% across all categories (Natalia confirmed March 2026)
  const ledMarginPct = MARGIN_PRESETS.ledHardware; // 15%
  const projectMargin = ledMarginPct; // uniform margin for all line items

  const { processorCost, shippingCost } = computeProcessorAndShipping(spec, areaSqFt);
  const servicesCost = installCost + pmCost + engCost;
  const totalCost = hardwareCost + processorCost + shippingCost + servicesCost;

  // Selling prices: uniform margin applied to ALL costs (hardware + processor + shipping + services)
  // This guarantees blendedMarginPct = projectMargin exactly
  const totalSellingPrice = totalCost > 0 ? round2(totalCost / (1 - projectMargin)) : 0;
  const hardwareSellingPrice = (hardwareCost + processorCost + shippingCost) > 0
    ? round2((hardwareCost + processorCost + shippingCost) / (1 - projectMargin)) : 0;
  const servicesSellingPrice = servicesCost > 0 ? round2(servicesCost / (1 - projectMargin)) : 0;

  const marginDollars = round2(totalSellingPrice - totalCost);
  const blendedMarginPct = projectMargin;

  return {
    spec,
    quote,
    match,
    areaSqFt,
    hardwareCost,
    processorCost,
    shippingCost,
    installCost,
    pmCost,
    engCost,
    totalCost,
    ledMarginPct,
    svcMarginPct: projectMargin,
    hardwareSellingPrice,
    servicesSellingPrice,
    totalSellingPrice,
    marginDollars,
    blendedMarginPct,
    leadTimeWeeks: quote?.leadTimeWeeks ?? null,
    costSource,
    rateCardEstimate,
  };
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export async function generateRateCardExcel(
  options: RateCardExcelOptions,
): Promise<{ buffer: Buffer; pricedDisplays: PricedDisplay[] }> {
  const {
    project,
    specs,
    quotes,
    zoneClass = "standard",
    installComplexity = "standard",
    includeBond = false,
    currency = "USD",
  } = options;

  FMT = excelCurrencyFmt(currency);

  // Preload rate card cache
  await preloadRateCard();

  const projectName = project.projectName || project.venue || "Untitled Project";

  // Price all displays
  const pricedDisplays: PricedDisplay[] = [];
  for (const spec of specs) {
    const quote = quotes.find((q) => q.displayName === spec.name && q.hasQuote) || null;
    const priced = await priceDisplay(spec, quote, zoneClass, installComplexity, project.isOutdoor);
    pricedDisplays.push(priced);
  }

  // Build workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Proposal Engine";
  workbook.created = new Date();
  workbook.calcProperties = { fullCalcOnLoad: true };

  // ━━━ SHEET 1: Pricing Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const summary = workbook.addWorksheet("Pricing Summary", {
    properties: { tabColor: { argb: COLORS.ANC_BLUE } },
  });

  // Title
  summary.mergeCells("A1:L1");
  const titleCell = summary.getCell("A1");
  titleCell.value = `${projectName} — Rate Card Pricing`;
  titleCell.font = { size: 16, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ANC_BLUE } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  summary.getRow(1).height = 36;

  // Meta
  summary.mergeCells("A2:L2");
  const parts = [];
  if (project.clientName) parts.push(`Client: ${project.clientName}`);
  if (project.venue) parts.push(`Venue: ${project.venue}`);
  parts.push(`Zone: ${zoneClass}`);
  parts.push(`Date: ${new Date().toLocaleDateString()}`);
  summary.getCell("A2").value = parts.join("  |  ");
  summary.getCell("A2").font = { size: 10, italic: true, color: { argb: "FF666666" }, name: "Calibri" };
  summary.getCell("A2").alignment = { horizontal: "center" };

  // Column widths
  const sumColWidths = [28, 10, 10, 10, 14, 14, 14, 14, 14, 14, 10, 14];
  sumColWidths.forEach((w, i) => { summary.getColumn(i + 1).width = w; });

  // Headers
  const sumHeaders = [
    "Display", "Pitch", "Area (sqft)", "Qty",
    "Hardware Cost", "Install Cost", "Total Cost",
    "Hardware Sell", "Services Sell", "Total Sell",
    "Margin %", "Cost Source",
  ];

  let row = 4;
  sumHeaders.forEach((h, i) => {
    const cell = summary.getCell(row, i + 1);
    cell.value = h;
    styleHeaderCell(cell, COLORS.ANC_BLUE);
  });
  summary.getRow(row).height = 28;
  row++;

  // Split into base bid + alternates
  const basePriced = pricedDisplays.filter((pd) => !pd.spec.isAlternate);
  const altPriced = pricedDisplays.filter((pd) => pd.spec.isAlternate);

  // Helper to render a priced display row
  function renderPricedRow(pd: PricedDisplay, idx: number, isAlt: boolean) {
    const r = summary.getRow(row);
    const displayLabel = isAlt && pd.spec.alternateId
      ? `[Alt ${pd.spec.alternateId}] ${pd.spec.name}`
      : pd.spec.name;
    r.getCell(1).value = displayLabel;
    r.getCell(1).font = { bold: true, name: "Calibri" };
    r.getCell(2).value = pd.spec.pixelPitchMm != null ? `${pd.spec.pixelPitchMm}mm` : "—";
    r.getCell(2).alignment = { horizontal: "center" };
    const dimsMissing = pd.areaSqFt === 0;
    r.getCell(3).value = dimsMissing ? "TBD" : pd.areaSqFt;
    if (!dimsMissing) r.getCell(3).numFmt = "#,##0";
    r.getCell(3).alignment = { horizontal: "center" };
    if (dimsMissing) r.getCell(3).font = { color: { argb: "FFCC0000" }, italic: true, name: "Calibri" };
    r.getCell(4).value = pd.spec.quantity;
    r.getCell(4).alignment = { horizontal: "center" };
    if (dimsMissing) {
      [5, 6, 7, 8, 9, 10].forEach((c) => {
        r.getCell(c).value = "Dims Required";
        r.getCell(c).font = { color: { argb: "FFCC0000" }, italic: true, size: 9, name: "Calibri" };
        r.getCell(c).alignment = { horizontal: "center" };
      });
    } else {
      r.getCell(5).value = pd.hardwareCost;
      r.getCell(5).numFmt = FMT;
      r.getCell(6).value = pd.installCost + pd.pmCost + pd.engCost;
      r.getCell(6).numFmt = FMT;
      r.getCell(7).value = pd.totalCost;
      r.getCell(7).numFmt = FMT;
      r.getCell(8).value = pd.hardwareSellingPrice;
      r.getCell(8).numFmt = FMT;
      r.getCell(9).value = pd.servicesSellingPrice;
      r.getCell(9).numFmt = FMT;
      r.getCell(10).value = pd.totalSellingPrice;
      r.getCell(10).numFmt = FMT;
    }
    r.getCell(11).value = pd.blendedMarginPct;
    r.getCell(11).numFmt = PCT;
    r.getCell(11).alignment = { horizontal: "center" };

    const sourceLabel = pd.costSource === "subcontractor_quote" ? "Quote"
      : pd.costSource === "rate_card" ? "Rate Card"
      : pd.costSource === "no_match" ? "NO MATCH"
      : "Product Match";
    r.getCell(12).value = sourceLabel;
    r.getCell(12).alignment = { horizontal: "center" };

    if (pd.costSource === "subcontractor_quote") {
      r.getCell(12).font = { color: { argb: COLORS.GREEN }, bold: true, name: "Calibri" };
    } else if (pd.costSource === "no_match") {
      r.getCell(12).font = { color: { argb: "FFCC0000" }, bold: true, name: "Calibri" };
      r.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.RED_BG } };
      // Mark hardware cost cell as TBD instead of $0
      r.getCell(5).value = "TBD";
      r.getCell(5).font = { color: { argb: "FFCC0000" }, bold: true, italic: true, name: "Calibri" };
      r.getCell(5).numFmt = "@"; // Text format
    }

    if (isAlt) {
      for (let i = 1; i <= 12; i++) {
        r.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.AMBER_BG } };
      }
    } else {
      addStripeRow(r, 12, idx % 2 === 0);
    }
    row++;

    return dimsMissing ? 0 : 1;
  }

  // Accumulators for base bid
  let baseTotals = { hw: 0, inst: 0, cost: 0, hwSell: 0, svcSell: 0, sell: 0 };
  let altTotals = { hw: 0, inst: 0, cost: 0, hwSell: 0, svcSell: 0, sell: 0 };

  // Render base bid displays
  basePriced.forEach((pd, idx) => {
    const hasDims = renderPricedRow(pd, idx, false);
    if (hasDims) {
      baseTotals.hw += pd.hardwareCost;
      baseTotals.inst += (pd.installCost + pd.pmCost + pd.engCost);
      baseTotals.cost += pd.totalCost;
      baseTotals.hwSell += pd.hardwareSellingPrice;
      baseTotals.svcSell += pd.servicesSellingPrice;
      baseTotals.sell += pd.totalSellingPrice;
    }
  });

  // Base bid subtotal
  row++;
  const baseTotRow = summary.getRow(row);
  baseTotRow.getCell(1).value = "BASE BID SUBTOTAL";
  baseTotRow.getCell(5).value = baseTotals.hw; baseTotRow.getCell(5).numFmt = FMT;
  baseTotRow.getCell(6).value = baseTotals.inst; baseTotRow.getCell(6).numFmt = FMT;
  baseTotRow.getCell(7).value = baseTotals.cost; baseTotRow.getCell(7).numFmt = FMT;
  baseTotRow.getCell(8).value = baseTotals.hwSell; baseTotRow.getCell(8).numFmt = FMT;
  baseTotRow.getCell(9).value = baseTotals.svcSell; baseTotRow.getCell(9).numFmt = FMT;
  baseTotRow.getCell(10).value = baseTotals.sell; baseTotRow.getCell(10).numFmt = FMT;
  baseTotRow.getCell(11).value = baseTotals.sell > 0 ? round2((baseTotals.sell - baseTotals.cost) / baseTotals.sell) : 0;
  baseTotRow.getCell(11).numFmt = PCT;
  styleTotalRow(baseTotRow, 12, COLORS.MEDIUM_GRAY);
  row++;

  // Alternates section (if any)
  if (altPriced.length > 0) {
    row++;
    // Section header
    summary.mergeCells(`A${row}:L${row}`);
    const altHdr = summary.getCell(`A${row}`);
    altHdr.value = `COST ALTERNATES (${altPriced.length} — not included in base total)`;
    altHdr.font = { size: 11, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
    altHdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.AMBER_HEADER } };
    altHdr.alignment = { horizontal: "center", vertical: "middle" };
    summary.getRow(row).height = 28;
    row++;

    altPriced.forEach((pd, idx) => {
      const hasDims = renderPricedRow(pd, idx, true);
      if (hasDims) {
        altTotals.hw += pd.hardwareCost;
        altTotals.inst += (pd.installCost + pd.pmCost + pd.engCost);
        altTotals.cost += pd.totalCost;
        altTotals.hwSell += pd.hardwareSellingPrice;
        altTotals.svcSell += pd.servicesSellingPrice;
        altTotals.sell += pd.totalSellingPrice;
      }
    });

    // Alt subtotal
    row++;
    const altTotRow = summary.getRow(row);
    altTotRow.getCell(1).value = "ALTERNATES SUBTOTAL";
    altTotRow.getCell(5).value = altTotals.hw; altTotRow.getCell(5).numFmt = FMT;
    altTotRow.getCell(6).value = altTotals.inst; altTotRow.getCell(6).numFmt = FMT;
    altTotRow.getCell(7).value = altTotals.cost; altTotRow.getCell(7).numFmt = FMT;
    altTotRow.getCell(8).value = altTotals.hwSell; altTotRow.getCell(8).numFmt = FMT;
    altTotRow.getCell(9).value = altTotals.svcSell; altTotRow.getCell(9).numFmt = FMT;
    altTotRow.getCell(10).value = altTotals.sell; altTotRow.getCell(10).numFmt = FMT;
    altTotRow.getCell(11).value = altTotals.sell > 0 ? round2((altTotals.sell - altTotals.cost) / altTotals.sell) : 0;
    altTotRow.getCell(11).numFmt = PCT;
    styleTotalRow(altTotRow, 12, COLORS.AMBER_BG);
    row++;
  }

  // Bond row (optional) — applies to base bid only
  if (includeBond) {
    const bondRow = summary.getRow(row);
    bondRow.getCell(1).value = `Performance Bond (${(BOND_RATE * 100).toFixed(1)}%)`;
    bondRow.getCell(10).value = round2(baseTotals.sell * BOND_RATE);
    bondRow.getCell(10).numFmt = FMT;
    row++;
  }

  // Grand total — base bid only
  row++;
  const grandRow = summary.getRow(row);
  const grandTotal = baseTotals.sell + (includeBond ? round2(baseTotals.sell * BOND_RATE) : 0);
  grandRow.getCell(1).value = "GRAND TOTAL (Base Bid)";
  grandRow.getCell(10).value = grandTotal;
  grandRow.getCell(10).numFmt = FMT;
  grandRow.getCell(11).value = baseTotals.sell > 0 ? round2((baseTotals.sell - baseTotals.cost) / baseTotals.sell) : 0;
  grandRow.getCell(11).numFmt = PCT;
  grandRow.height = 28;
  for (let i = 1; i <= 12; i++) {
    const cell = grandRow.getCell(i);
    cell.font = { bold: true, size: 14, color: { argb: COLORS.WHITE }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ANC_BLUE } };
  }

  // ━━━ SHEET 2: Cost Breakdown ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const breakdown = workbook.addWorksheet("Cost Breakdown", {
    properties: { tabColor: { argb: COLORS.GREEN } },
  });

  breakdown.mergeCells("A1:H1");
  const bdTitle = breakdown.getCell("A1");
  bdTitle.value = `${projectName} — Detailed Cost Breakdown`;
  bdTitle.font = { size: 14, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
  bdTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ANC_BLUE } };
  bdTitle.alignment = { horizontal: "center", vertical: "middle" };
  breakdown.getRow(1).height = 32;

  const bdColWidths = [28, 14, 14, 14, 14, 14, 10, 16];
  bdColWidths.forEach((w, i) => { breakdown.getColumn(i + 1).width = w; });

  const bdHeaders = ["Display", "Hardware", "Steel/Install", "PM/GC", "Engineering", "Total Cost", "Margin", "Selling Price"];
  let bdRow = 3;
  bdHeaders.forEach((h, i) => {
    const cell = breakdown.getCell(bdRow, i + 1);
    cell.value = h;
    styleHeaderCell(cell, COLORS.DARK_HEADER);
  });
  bdRow++;

  // Render base bid first, then alternates
  const bdBase = pricedDisplays.filter((pd) => !pd.spec.isAlternate);
  const bdAlt = pricedDisplays.filter((pd) => pd.spec.isAlternate);

  function renderBdRow(pd: PricedDisplay, idx: number, isAlt: boolean) {
    const r = breakdown.getRow(bdRow);
    const label = isAlt && pd.spec.alternateId
      ? `[Alt ${pd.spec.alternateId}] ${pd.spec.name}`
      : pd.spec.name;
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true, name: "Calibri" };
    r.getCell(2).value = pd.hardwareCost; r.getCell(2).numFmt = FMT;
    r.getCell(3).value = pd.installCost; r.getCell(3).numFmt = FMT;
    r.getCell(4).value = pd.pmCost; r.getCell(4).numFmt = FMT;
    r.getCell(5).value = pd.engCost; r.getCell(5).numFmt = FMT;
    r.getCell(6).value = pd.totalCost; r.getCell(6).numFmt = FMT;
    r.getCell(7).value = pd.blendedMarginPct; r.getCell(7).numFmt = PCT;
    r.getCell(7).alignment = { horizontal: "center" };
    r.getCell(8).value = pd.totalSellingPrice; r.getCell(8).numFmt = FMT;

    if (isAlt) {
      for (let i = 1; i <= 8; i++) {
        r.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.AMBER_BG } };
      }
    } else {
      addStripeRow(r, 8, idx % 2 === 0);
    }
    bdRow++;
  }

  bdBase.forEach((pd, idx) => renderBdRow(pd, idx, false));

  if (bdAlt.length > 0) {
    bdRow++;
    breakdown.mergeCells(`A${bdRow}:H${bdRow}`);
    const altSep = breakdown.getCell(`A${bdRow}`);
    altSep.value = `COST ALTERNATES (${bdAlt.length})`;
    altSep.font = { size: 11, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
    altSep.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.AMBER_HEADER } };
    altSep.alignment = { horizontal: "center", vertical: "middle" };
    bdRow++;

    bdAlt.forEach((pd, idx) => renderBdRow(pd, idx, true));
  }

  // ━━━ SHEET 3: Rate Card Audit ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const rateSheet = workbook.addWorksheet("Rate Card", {
    properties: { tabColor: { argb: "FFFFC107" } },
  });

  rateSheet.mergeCells("A1:D1");
  const rcTitle = rateSheet.getCell("A1");
  rcTitle.value = "ANC Rate Card — Rates Used";
  rcTitle.font = { size: 14, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
  rcTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ANC_BLUE } };
  rcTitle.alignment = { horizontal: "center", vertical: "middle" };
  rateSheet.getRow(1).height = 32;

  rateSheet.getColumn(1).width = 30;
  rateSheet.getColumn(2).width = 36;
  rateSheet.getColumn(3).width = 16;
  rateSheet.getColumn(4).width = 16;

  const rcHeaders = ["Category", "Rate Key", "Value", "Unit"];
  rcHeaders.forEach((h, i) => {
    const cell = rateSheet.getCell(3, i + 1);
    cell.value = h;
    styleHeaderCell(cell, COLORS.DARK_HEADER);
  });

  const fullRateCard = await getFullRateCard();
  let rcRow = 4;

  // Group by category
  const grouped: Record<string, Array<{ key: string; value: number }>> = {};
  for (const [key, value] of Object.entries(fullRateCard)) {
    const category = key.split(".")[0];
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({ key, value });
  }

  for (const [category, rates] of Object.entries(grouped)) {
    rates.forEach((rate, idx) => {
      const r = rateSheet.getRow(rcRow);
      r.getCell(1).value = category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      r.getCell(2).value = rate.key;
      r.getCell(2).font = { name: "Consolas", size: 10 };
      r.getCell(3).value = rate.value;

      // Format based on key
      if (rate.key.includes("pct") || rate.key.includes("margin") || rate.key.includes("bond") ||
          rate.key.includes("tax") || rate.key.includes("escalation") || rate.key.includes("spare") ||
          rate.key.includes("modifier")) {
        r.getCell(3).numFmt = "0.0%";
        r.getCell(4).value = "percent";
      } else {
        r.getCell(3).numFmt = FMT;
        r.getCell(4).value = rate.key.includes("sqft") ? "$/sqft" : rate.key.includes("fee") ? "fixed $" : "$/lb";
      }

      addStripeRow(r, 4, idx % 2 === 0);
      rcRow++;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: buffer as unknown as Buffer,
    pricedDisplays,
  };
}

export type { PricedDisplay as PricedDisplayExport };
