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
  type ZoneClass,
  type InstallComplexity,
} from "@/services/rfp/productCatalog";
import { ProductMatcher, type MatchedSolution } from "@/services/catalog/productMatcher";
import { preloadRateCard } from "@/services/rfp/rateCardLoader";

// ─── Colors ─────────────────────────────────────────────────────────────────

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

let FMT_USD = '"$"#,##0';
const FMT_PCT = "0.0%";
const FMT_INT = "#,##0";

// ─── ANC Budget Logic (reverse-engineered from agent) ──────────────────────

const SMART_BUNDLES = {
  sendingCard: 450,
  sparePartsPct: 0.02,
  signalCablePerSqFt25: 15, // $15 × (sqft / 25)
  upsBattery: 2500,          // for scoreboards/center hung
  backupProcessor: 12000,    // for displays > 300 sqft
  weatherproofPerSqFt: 12,   // outdoor surcharge
};

const BUDGET_RATES = {
  installPerSqFt: 289,
  electricalPerSqFt: 145,
  structuralWallPerSqFt: 30,
  structuralCeilingPerSqFt: 60,
};

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
}

interface ComputedDisplay {
  spec: ExtractedLEDSpec;
  priced: PricedDisplay | null;
  match: MatchedSolution | null;
  areaSqFt: number;
  widthFt: number;
  heightFt: number;
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
): ComputedDisplay[] {
  return specs.map((spec, idx) => {
    const priced = pricedDisplays?.[idx] ?? null;
    const widthFt = spec.widthFt || 0;
    const heightFt = spec.heightFt || 0;
    const areaSqFt = round2(widthFt * heightFt * (spec.quantity || 1));

    // LED hardware cost
    let ledHardwareCost = priced?.hardwareCost ?? 0;
    if (!ledHardwareCost && spec.pixelPitchMm) {
      const key = String(spec.pixelPitchMm);
      const rate = LED_COST_PER_SQFT_BY_PITCH[key];
      if (rate) ledHardwareCost = round2(areaSqFt * rate);
    }

    // Structural — use type heuristic
    const isCeiling = /center.?hung|scoreboard|hanging|ribbon|fascia/i.test(spec.name + " " + (spec.mountingType || ""));
    const structRate = isCeiling ? BUDGET_RATES.structuralCeilingPerSqFt : BUDGET_RATES.structuralWallPerSqFt;
    const structuralMaterialsCost = round2(areaSqFt * structRate);

    // Labor
    const structuralLaborCost = round2(areaSqFt * BUDGET_RATES.installPerSqFt);

    // Electrical
    const electricalCost = round2(areaSqFt * BUDGET_RATES.electricalPerSqFt);

    // PM & Engineering
    const pmCost = priced?.pmCost ?? round2(PM_BASE_FEE);
    const engCost = priced?.engCost ?? round2(ENG_BASE_FEE);

    // Skip fixed costs if display has no dimensions (can't scope it)
    const hasDimensions = areaSqFt > 0;

    // Travel (estimate)
    const travelCost = hasDimensions ? 15000 : 0;

    // Smart bundles
    const sendingCardCost = hasDimensions ? SMART_BUNDLES.sendingCard : 0;
    const sparePartsCost = round2(ledHardwareCost * SMART_BUNDLES.sparePartsPct);
    const signalCableCost = round2(SMART_BUNDLES.signalCablePerSqFt25 * (areaSqFt / 25));
    const isScoreboard = isCeiling;
    const upsCost = isScoreboard ? SMART_BUNDLES.upsBattery : 0;
    const backupProcessorCost = areaSqFt > 300 ? SMART_BUNDLES.backupProcessor : 0;
    const weatherproofCost = spec.environment === "outdoor" ? round2(areaSqFt * SMART_BUNDLES.weatherproofPerSqFt) : 0;

    const totalCost = round2(
      ledHardwareCost + structuralMaterialsCost + structuralLaborCost +
      electricalCost + pmCost + engCost + travelCost +
      sendingCardCost + sparePartsCost + signalCableCost +
      upsCost + backupProcessorCost + weatherproofCost
    );

    const marginPct = priced?.blendedMarginPct ?? 0.15;
    const sellingPrice = totalCost > 0 ? round2(totalCost / (1 - marginPct)) : 0;
    const marginDollars = round2(sellingPrice - totalCost);

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
  const displays = computeDisplays(baseSpecs, basePricedDisplays, installComplexity);

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

  // ─── Sheet 1: Margin Analysis ───────────────────────────────────────────
  buildMarginAnalysis(wb, projectName, clientName, today, displays, grandCost, grandSelling, grandMargin, grandMarginPct, includeBond);

  // ─── Sheet 2: LED Cost Sheet ────────────────────────────────────────────
  buildLedCostSheet(wb, projectName, displays);

  // ─── Sheet 3: Processor Count (right after LED Cost Sheet) ─────────────
  buildProcessorCount(wb, projectName, displays);

  // ─── Sheet 4-N: Per-Zone Install Sheets ─────────────────────────────────
  displays.forEach((d) => {
    buildInstallSheet(wb, projectName, today, d, installComplexity);
  });

  // ─── P&L ────────────────────────────────────────────────────────────────
  buildPnL(wb, projectName, displays, grandCost, grandSelling, grandMargin, paymentTerms);

  // ─── Cash Flow ──────────────────────────────────────────────────────────
  buildCashFlow(wb, projectName, grandSelling, grandCost, paymentTerms, contractDate, completionDate);

  // ─── PO's ───────────────────────────────────────────────────────────────
  buildPOs(wb, projectName);

  // ─── Resp Matrix ────────────────────────────────────────────────────────
  buildRespMatrix(wb, projectName, project);

  // ─── Travel ─────────────────────────────────────────────────────────────
  buildTravel(wb, projectName);

  // ─── CMS ────────────────────────────────────────────────────────────────
  buildCMS(wb, projectName);

  // ─── Scoring ────────────────────────────────────────────────────────────
  buildScoring(wb, projectName, displays);

  // ─── Alternates (reference only — not in budget) ──────────────────────
  if (altDisplays.length > 0) {
    buildAlternatesSheet(wb, projectName, altDisplays);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer: buffer as unknown as Buffer, displays };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. MARGIN ANALYSIS ─────────────────────────────────────────────────────

function buildMarginAnalysis(
  wb: ExcelJS.Workbook,
  projectName: string,
  clientName: string,
  date: string,
  displays: ComputedDisplay[],
  grandCost: number,
  grandSelling: number,
  grandMargin: number,
  grandMarginPct: number,
  includeBond: boolean,
): void {
  const ws = wb.addWorksheet("Margin Analysis", {
    properties: { tabColor: { argb: C.ANC_BLUE } },
  });

  const colWidths = [4, 44, 16, 16, 16, 12, 4, 4];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  setTitle(ws, "F", `${projectName} — Margin Analysis`);
  setMeta(ws, "F", `${clientName} | ${date} | ANC Proposal Engine`);

  // Headers
  let row = 4;
  const headers = ["", "Zone / Line Item", "Cost", "Selling Price", "Margin $", "Margin %"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    hdr(cell, C.ANC_BLUE);
  });
  ws.getRow(row).height = 28;
  row++;

  // Track zone summary row numbers for SUM formulas
  const zoneSummaryRows: number[] = [];

  // Per-zone summary
  displays.forEach((d, idx) => {
    zoneSummaryRows.push(row);
    const r = ws.getRow(row);
    r.getCell(1).value = "";
    r.getCell(2).value = d.spec.name + (d.spec.location ? ` — ${d.spec.location}` : "");
    r.getCell(2).font = { bold: true, name: "Calibri" };
    r.getCell(3).value = d.totalCost; r.getCell(3).numFmt = FMT_USD;
    // Margin % is the input driver — keep as hard value
    r.getCell(6).value = d.marginPct; r.getCell(6).numFmt = FMT_PCT;
    // Selling Price formula: =C{row}/(1-F{row})
    r.getCell(4).value = { formula: `IF(F${row}>=1,C${row},C${row}/(1-F${row}))`, result: d.sellingPrice };
    r.getCell(4).numFmt = FMT_USD;
    // Margin $ formula: =D{row}-C{row}
    r.getCell(5).value = { formula: `D${row}-C${row}`, result: d.marginDollars };
    r.getCell(5).numFmt = FMT_USD;
    stripe(r, 6, idx % 2 === 0);
    row++;

    // Sub-lines
    const subLines: [string, number][] = [
      ["LED Hardware", d.ledHardwareCost],
      ["Structural Materials", d.structuralMaterialsCost],
      ["Structural Labor & LED Installation", d.structuralLaborCost],
      ["Electrical & Data", d.electricalCost],
      ["PM / General Conditions / Travel", d.pmCost + d.travelCost],
      ["Engineering & Permits", d.engCost],
    ];

    // Smart bundles (only show non-zero)
    if (d.sendingCardCost > 0) subLines.push(["Sending Card", d.sendingCardCost]);
    if (d.sparePartsCost > 0) subLines.push(["Spare Parts Package (2%)", d.sparePartsCost]);
    if (d.signalCableCost > 0) subLines.push(["Signal Cable Kit", d.signalCableCost]);
    if (d.upsCost > 0) subLines.push(["UPS Battery Backup", d.upsCost]);
    if (d.backupProcessorCost > 0) subLines.push(["Backup Video Processor", d.backupProcessorCost]);
    if (d.weatherproofCost > 0) subLines.push(["Weatherproof Enclosure Surcharge", d.weatherproofCost]);

    // Track sub-line rows for zone cost SUM
    const subStartRow = row;
    subLines.forEach(([label, cost]) => {
      const sr = ws.getRow(row);
      sr.getCell(2).value = `    ${label}`;
      sr.getCell(2).font = { name: "Calibri", color: { argb: "FF666666" }, size: 10 };
      sr.getCell(3).value = cost; sr.getCell(3).numFmt = FMT_USD;
      sr.getCell(3).font = { name: "Calibri", color: { argb: "FF666666" }, size: 10 };
      row++;
    });

    // Zone cost cell = SUM of sub-lines (live formula)
    const zoneRow = zoneSummaryRows[zoneSummaryRows.length - 1];
    ws.getCell(zoneRow, 3).value = { formula: `SUM(C${subStartRow}:C${row - 1})`, result: d.totalCost };
    ws.getCell(zoneRow, 3).numFmt = FMT_USD;

    row++; // separator
  });

  // ─── CMS Section (placeholder — links to CMS tab) ───
  const cmsMargin = 0.10;
  zoneSummaryRows.push(row);
  const cmsR = ws.getRow(row);
  cmsR.getCell(2).value = "CMS (Content Management System)";
  cmsR.getCell(2).font = { bold: true, name: "Calibri" };
  cmsR.getCell(3).value = 0; cmsR.getCell(3).numFmt = FMT_USD; inputCell(cmsR.getCell(3));
  cmsR.getCell(6).value = cmsMargin; cmsR.getCell(6).numFmt = FMT_PCT; inputCell(cmsR.getCell(6));
  cmsR.getCell(4).value = { formula: `IF(F${row}>=1,C${row},C${row}/(1-F${row}))`, result: 0 };
  cmsR.getCell(4).numFmt = FMT_USD;
  cmsR.getCell(5).value = { formula: `D${row}-C${row}`, result: 0 };
  cmsR.getCell(5).numFmt = FMT_USD;
  stripe(cmsR, 6, true);
  row++;
  row++; // separator

  // ─── Scoring Section (placeholder — links to Scoring tab) ───
  const scoringMargin = 0.10;
  zoneSummaryRows.push(row);
  const scoreR = ws.getRow(row);
  scoreR.getCell(2).value = "Scoring System";
  scoreR.getCell(2).font = { bold: true, name: "Calibri" };
  scoreR.getCell(3).value = 0; scoreR.getCell(3).numFmt = FMT_USD; inputCell(scoreR.getCell(3));
  scoreR.getCell(6).value = scoringMargin; scoreR.getCell(6).numFmt = FMT_PCT; inputCell(scoreR.getCell(6));
  scoreR.getCell(4).value = { formula: `IF(F${row}>=1,C${row},C${row}/(1-F${row}))`, result: 0 };
  scoreR.getCell(4).numFmt = FMT_USD;
  scoreR.getCell(5).value = { formula: `D${row}-C${row}`, result: 0 };
  scoreR.getCell(5).numFmt = FMT_USD;
  stripe(scoreR, 6, false);
  row++;
  row++; // separator

  // Subtotal — SUM formulas referencing zone summary rows
  const costRefs = zoneSummaryRows.map((r) => `C${r}`).join(",");
  const sellRefs = zoneSummaryRows.map((r) => `D${r}`).join(",");
  const marginDollarRefs = zoneSummaryRows.map((r) => `E${r}`).join(",");

  const subR = ws.getRow(row);
  subR.getCell(2).value = "SUBTOTAL";
  subR.getCell(3).value = { formula: `SUM(${costRefs})`, result: grandCost };
  subR.getCell(3).numFmt = FMT_USD;
  subR.getCell(4).value = { formula: `SUM(${sellRefs})`, result: grandSelling };
  subR.getCell(4).numFmt = FMT_USD;
  subR.getCell(5).value = { formula: `SUM(${marginDollarRefs})`, result: grandMargin };
  subR.getCell(5).numFmt = FMT_USD;
  // Blended margin % = 1 - (Cost / Selling)
  subR.getCell(6).value = { formula: `IF(D${row}=0,0,1-C${row}/D${row})`, result: grandMarginPct };
  subR.getCell(6).numFmt = FMT_PCT;
  totalStyle(subR, 6, C.MEDIUM_GRAY);
  const subtotalRow = row;
  row++;

  // Tax row
  const taxR = ws.getRow(row);
  taxR.getCell(2).value = "TAX";
  taxR.getCell(3).value = 0; taxR.getCell(3).numFmt = FMT_USD;
  taxR.getCell(4).value = 0; taxR.getCell(4).numFmt = FMT_USD;
  inputCell(taxR.getCell(3)); inputCell(taxR.getCell(4));
  const taxRow = row;
  row++;

  // Bond row
  let bondRow = 0;
  if (includeBond) {
    const bondR = ws.getRow(row);
    bondR.getCell(2).value = "BOND";
    const bondAmt = round2(grandSelling * BOND_RATE);
    bondR.getCell(3).value = bondAmt; bondR.getCell(3).numFmt = FMT_USD;
    bondR.getCell(4).value = bondAmt; bondR.getCell(4).numFmt = FMT_USD;
    bondRow = row;
    row++;
  }

  // Grand total — formulas summing subtotal + tax + bond
  row++;
  const gtR = ws.getRow(row);
  gtR.getCell(2).value = "GRAND TOTAL";
  const costSumParts = bondRow > 0 ? `C${subtotalRow}+C${taxRow}+C${bondRow}` : `C${subtotalRow}+C${taxRow}`;
  const sellSumParts = bondRow > 0 ? `D${subtotalRow}+D${taxRow}+D${bondRow}` : `D${subtotalRow}+D${taxRow}`;
  gtR.getCell(3).value = { formula: costSumParts, result: grandCost };
  gtR.getCell(3).numFmt = FMT_USD;
  gtR.getCell(4).value = { formula: sellSumParts, result: grandSelling };
  gtR.getCell(4).numFmt = FMT_USD;
  gtR.getCell(5).value = { formula: `D${row}-C${row}`, result: grandMargin };
  gtR.getCell(5).numFmt = FMT_USD;
  gtR.getCell(6).value = { formula: `IF(D${row}=0,0,1-C${row}/D${row})`, result: grandMarginPct };
  gtR.getCell(6).numFmt = FMT_PCT;
  totalStyle(gtR, 6, C.ANC_BLUE);
  gtR.getCell(2).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  gtR.getCell(3).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  gtR.getCell(4).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  gtR.getCell(5).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
  gtR.getCell(6).font = { bold: true, size: 12, color: { argb: C.WHITE }, name: "Calibri" };
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
  const COLS = 20;
  const colWidths = [36, 18, 14, 10, 10, 10, 10, 10, 8, 12, 10, 10, 12, 12, 14, 14, 14, 14, 12, 16];
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
    // Vendor
    dr.getCell(2).value = d.match?.module?.manufacturer
      ? `${d.match.module.manufacturer} ${d.match.module.model || ""}`.trim()
      : (d.spec.environment === "outdoor" ? "Yaham" : "LG/Yaham");
    // Product
    dr.getCell(3).value = d.match?.module?.model || "—";
    // Pitch
    dr.getCell(4).value = d.spec.pixelPitchMm ? `${d.spec.pixelPitchMm}mm` : "—";
    dr.getCell(4).alignment = { horizontal: "center" };
    // H (ft), W (ft)
    dr.getCell(5).value = d.heightFt || 0; dr.getCell(5).numFmt = "0.00";
    dr.getCell(6).value = d.widthFt || 0; dr.getCell(6).numFmt = "0.00";
    // H (px), W (px)
    const hPx = d.spec.heightPx || (d.spec.pixelPitchMm && d.heightFt ? Math.round(d.heightFt * 304.8 / d.spec.pixelPitchMm) : 0);
    const wPx = d.spec.widthPx || (d.spec.pixelPitchMm && d.widthFt ? Math.round(d.widthFt * 304.8 / d.spec.pixelPitchMm) : 0);
    dr.getCell(7).value = hPx; dr.getCell(7).numFmt = FMT_INT;
    dr.getCell(8).value = wPx; dr.getCell(8).numFmt = FMT_INT;
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
    const costPerSqFt = d.areaSqFt > 0 ? round2(d.ledHardwareCost / d.areaSqFt) : 0;
    dr.getCell(13).value = { formula: `IF(J${row}=0,0,N${row}/J${row})`, result: costPerSqFt };
    dr.getCell(13).numFmt = FMT_USD;
    // Display Cost (LED hardware)
    dr.getCell(14).value = d.ledHardwareCost; dr.getCell(14).numFmt = FMT_USD;
    // Processor
    dr.getCell(15).value = d.sendingCardCost || 0; dr.getCell(15).numFmt = FMT_USD;
    // Shipping
    dr.getCell(16).value = d.spec.quantity ? round2(d.areaSqFt * 10) : 0; dr.getCell(16).numFmt = FMT_USD;
    // Total Cost = Display + Processor + Shipping
    dr.getCell(17).value = { formula: `N${row}+O${row}+P${row}`, result: d.ledHardwareCost + (d.sendingCardCost || 0) + round2(d.areaSqFt * 10) };
    dr.getCell(17).numFmt = FMT_USD;
    dr.getCell(17).font = { bold: true, name: "Calibri" };
    // Margin %
    dr.getCell(18).value = d.marginPct; dr.getCell(18).numFmt = FMT_PCT;
    // Selling Price = Total Cost / (1 - Margin%)
    dr.getCell(19).value = { formula: `IF(R${row}>=1,Q${row},Q${row}/(1-R${row}))`, result: d.sellingPrice };
    dr.getCell(19).numFmt = FMT_USD;
    dr.getCell(19).font = { bold: true, name: "Calibri" };
    // ANC Margin = Selling - Cost
    dr.getCell(20).value = { formula: `S${row}-Q${row}`, result: d.marginDollars };
    dr.getCell(20).numFmt = FMT_USD;

    stripe(dr, COLS, idx % 2 === 0);
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
  totalStyle(gtR, COLS, C.GREEN_BG);
}

// ─── 3. PER-ZONE INSTALL SHEET ─────────────────────────────────────────────

function buildInstallSheet(
  wb: ExcelJS.Workbook,
  projectName: string,
  date: string,
  d: ComputedDisplay,
  complexity: InstallComplexity,
): void {
  const shortName = d.spec.name.length > 25 ? d.spec.name.substring(0, 25) + "…" : d.spec.name;
  const ws = wb.addWorksheet(`${shortName} - Install`, {
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
    r.getCell(11).value = { formula: `IF(J${row}>=1,I${row},I${row}/(1-J${row}))`, result: cost > 0 ? round2(cost / (1 - svcMargin)) : 0 };
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
    r.getCell(11).value = { formula: `IF(J${row}>=1,I${row},I${row}/(1-J${row}))`, result: cost > 0 ? round2(cost / (1 - svcMargin)) : 0 };
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
    r.getCell(11).value = { formula: `IF(J${row}>=1,I${row},I${row}/(1-J${row}))`, result: cost > 0 ? round2(cost / (1 - svcMargin)) : 0 };
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
    r.getCell(11).value = { formula: `IF(J${row}>=1,I${row},I${row}/(1-J${row}))`, result: cost > 0 ? round2(cost / (1 - svcMargin)) : 0 };
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

  // Payment phases
  const phases = paymentTerms.split("/").map(Number);
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
