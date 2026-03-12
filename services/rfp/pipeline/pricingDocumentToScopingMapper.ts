/**
 * Maps Mirror Mode data (PricingDocument + screens) → ScopingWorkbookOptions
 * so Mirror Mode export can call the canonical generateScopingWorkbook().
 *
 * This is the Phase 2 unification bridge: Mirror Mode gets the same
 * 14-tab canonical workbook as the RFP and Estimator paths.
 */

import type { PricingDocument, PricingTable, PricingLineItem } from "@/types/pricing";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import type { ScopingWorkbookOptions, FinancialOverrides } from "./generateScopingWorkbook";
import type { PricedDisplay } from "./generateRateCardExcel";
import type { MatchedSolution } from "@/services/catalog/productMatcher";

// ─── Item classification regex patterns ──────────────────────────────────────
// Maps PricingDocument line items into cost categories for the canonical workbook.

const LED_HARDWARE = /\b(LED|Display|Hardware|Panel|Module|Screen|Video\s*Board|Cabinet)\b/i;
const STRUCTURAL = /\b(Structural|Steel|Fabricat|Clad|Trim|Plywood|Second.*Steel|Primary.*Steel)\b/i;
const INSTALL_LABOR = /\b(Install|Labor|Removal|Disposal|Heavy\s*Equip|Rigging|Hoist|Crane)\b/i;
const ELECTRICAL = /\b(Electr|Data|Cable|Wiring|Panel|Conduit|Power\s*Dist|Fiber)\b/i;
const PM_TRAVEL = /\b(PM|Project\s*Manag|General\s*Cond|Travel|Hotel|Airfare|Per\s*Diem|Mobiliz)\b/i;
const ENGINEERING = /\b(Engineer|Permit|Submittal|Certific|Stamp|Design|Drawing)\b/i;
const EQUIPMENT = /\b(Processor|Sending\s*Card|Media\s*Player|Signal\s*Cable|Video\s*Proc|Receiver|Mount|Bracket|UPS|Backup|Weatherproof|Enclosure)\b/i;
const SPARE_PARTS = /\b(Spare\s*Parts?)\b/i;
const CMS = /\b(CMS|Content\s*Manag|Control\s*System|Software)\b/i;
const SCORING = /\b(Scoring|Scoreboard\s*System|Timing)\b/i;

type CostCategory = "ledHardware" | "structural" | "installLabor" | "electrical" | "pmTravel" | "engineering" | "equipment" | "cms" | "scoring" | "other";

function classifyItem(description: string): CostCategory {
  const d = description.trim();
  if (SPARE_PARTS.test(d)) return "ledHardware"; // spare parts roll into LED
  if (LED_HARDWARE.test(d)) return "ledHardware";
  if (CMS.test(d)) return "cms";
  if (SCORING.test(d)) return "scoring";
  if (ENGINEERING.test(d)) return "engineering";
  if (EQUIPMENT.test(d)) return "equipment";
  if (PM_TRAVEL.test(d)) return "pmTravel";
  if (ELECTRICAL.test(d)) return "electrical";
  if (INSTALL_LABOR.test(d)) return "installLabor";
  if (STRUCTURAL.test(d)) return "structural";
  return "other";
}

// ─── Screen shape from the audit export route ────────────────────────────────

interface MirrorScreen {
  name: string;
  pixelPitch: number;
  width: number;
  height: number;
  [key: string]: any;
}

// ─── Main mapper ─────────────────────────────────────────────────────────────

export interface MapMirrorArgs {
  pricingDocument: PricingDocument;
  screens: MirrorScreen[];
  internalAudit?: any;
  currency?: string;
  clientName?: string | null;
  projectName?: string | null;
  location?: string | null;
}

export function mapMirrorToScoping(args: MapMirrorArgs): ScopingWorkbookOptions {
  const { pricingDocument, screens, internalAudit, currency = "USD" } = args;

  // Base bid tables (exclude standalone alternate sections)
  const baseTables = pricingDocument.tables.filter((t) => !t.isAlternateSection);

  // Build one ExtractedLEDSpec + one PricedDisplay per base table
  const specs: ExtractedLEDSpec[] = [];
  const pricedDisplays: PricedDisplay[] = [];

  for (let i = 0; i < baseTables.length; i++) {
    const table = baseTables[i];
    // Match table to screen by index (tables and screens are parallel)
    const screen = screens[i] ?? null;

    const spec = buildSpec(table, screen, i);
    specs.push(spec);

    const priced = buildPricedDisplay(table, spec, screen, internalAudit?.perScreen?.[i]);
    pricedDisplays.push(priced);
  }

  // Derive financial overrides from the PricingDocument
  const overrides = deriveOverrides(baseTables, internalAudit);

  const project: ExtractedProjectInfo = {
    clientName: args.clientName || null,
    projectName: args.projectName || null,
    venue: null,
    location: args.location || null,
    isOutdoor: false, // Unknown from Mirror — default indoor
    isUnionLabor: false,
    bondRequired: baseTables.some((t) => t.bond > 0),
    specialRequirements: [],
    schedulePhases: [],
  };

  return {
    project,
    specs,
    pricedDisplays,
    currency: pricingDocument.currency || currency,
    includeBond: baseTables.some((t) => t.bond > 0),
    overrides,
  };
}

// ─── Spec builder ────────────────────────────────────────────────────────────

function buildSpec(table: PricingTable, screen: MirrorScreen | null, idx: number): ExtractedLEDSpec {
  const widthFt = screen?.width ?? screen?.widthFt ?? null;
  const heightFt = screen?.height ?? screen?.heightFt ?? null;
  const pitch = screen?.pixelPitch ?? screen?.pitchMm ?? null;

  const widthPx = pitch && widthFt ? Math.round((widthFt * 304.8) / pitch) : null;
  const heightPx = pitch && heightFt ? Math.round((heightFt * 304.8) / pitch) : null;

  return {
    name: table.name || screen?.name || `Display ${idx + 1}`,
    location: "",
    widthFt: widthFt ? Number(widthFt) : null,
    heightFt: heightFt ? Number(heightFt) : null,
    widthPx,
    heightPx,
    pixelPitchMm: pitch ? Number(pitch) : null,
    brightnessNits: null,
    environment: "indoor",
    quantity: 1,
    serviceType: null,
    mountingType: null,
    maxPowerW: null,
    weightLbs: null,
    specialRequirements: [],
    confidence: 1.0,
    sourcePages: [],
    sourceType: "text",
    citation: "Mirror Mode Import",
    notes: null,
    isAlternate: false,
  };
}

// ─── PricedDisplay builder ───────────────────────────────────────────────────
// Classifies line items into cost buckets and builds a PricedDisplay that
// the canonical generator can consume.

function buildPricedDisplay(
  table: PricingTable,
  spec: ExtractedLEDSpec,
  screen: MirrorScreen | null,
  perScreenAudit: any,
): PricedDisplay {
  const items = (table.items || []).filter((it) => !it.isHidden);

  // Classify items into cost buckets
  let hardwareCost = 0;
  let structuralCost = 0;
  let installCost = 0;
  let electricalCost = 0;
  let pmCost = 0;
  let engCost = 0;
  let equipmentCost = 0;
  let cmsCost = 0;
  let scoringCost = 0;
  let otherCost = 0;

  for (const item of items) {
    const cost = item.cost ?? item.sellingPrice ?? 0;
    const cat = classifyItem(item.description || "");

    switch (cat) {
      case "ledHardware": hardwareCost += cost; break;
      case "structural": structuralCost += cost; break;
      case "installLabor": installCost += cost; break;
      case "electrical": electricalCost += cost; break;
      case "pmTravel": pmCost += cost; break;
      case "engineering": engCost += cost; break;
      case "equipment": equipmentCost += cost; break;
      case "cms": cmsCost += cost; break;
      case "scoring": scoringCost += cost; break;
      default: otherCost += cost; break;
    }
  }

  // If no items were classified as LED hardware but there's a subtotal,
  // the whole table might be a single-item display — treat subtotal as hardware
  const totalClassified = hardwareCost + structuralCost + installCost + electricalCost + pmCost + engCost + equipmentCost + cmsCost + scoringCost + otherCost;
  if (hardwareCost === 0 && totalClassified === 0 && table.subtotal > 0) {
    hardwareCost = table.subtotal;
  }

  // "Other" items that couldn't be classified — add to install (most common catch-all)
  if (otherCost > 0) {
    installCost += otherCost;
  }

  const totalCost = hardwareCost + structuralCost + installCost + electricalCost + pmCost + engCost + equipmentCost;

  // Derive margin from table data
  const subtotalSell = table.subtotal || 0;
  const subtotalCost = totalCost || subtotalSell;
  const blendedMarginPct = subtotalSell > 0 && subtotalCost > 0 && subtotalCost < subtotalSell
    ? 1 - (subtotalCost / subtotalSell)
    : 0.15; // fallback

  const areaSqFt = (spec.widthFt ?? 0) * (spec.heightFt ?? 0);

  return {
    spec,
    quote: null,
    match: null,
    areaSqFt,
    hardwareCost,
    installCost: structuralCost + installCost + electricalCost,
    pmCost,
    engCost,
    totalCost,
    ledMarginPct: 0.15,
    svcMarginPct: 0.20,
    hardwareSellingPrice: hardwareCost > 0 ? Math.round(hardwareCost / (1 - 0.15)) : 0,
    servicesSellingPrice: (structuralCost + installCost + electricalCost + pmCost + engCost) > 0
      ? Math.round((structuralCost + installCost + electricalCost + pmCost + engCost) / (1 - 0.20))
      : 0,
    totalSellingPrice: subtotalSell || (totalCost > 0 ? Math.round(totalCost / (1 - 0.15)) : 0),
    marginDollars: subtotalSell - totalCost,
    blendedMarginPct,
    leadTimeWeeks: null,
    costSource: "rate_card",
    rateCardEstimate: null,
  };
}

// ─── Derive financial overrides from PricingDocument ─────────────────────────

function deriveOverrides(tables: PricingTable[], internalAudit: any): FinancialOverrides {
  // Derive tax rate from first table with tax
  const tableWithTax = tables.find((t) => t.tax && t.tax.rate > 0);
  const taxRate = tableWithTax?.tax?.rate ?? undefined;

  // Derive bond rate: bond / subtotal for first table with bond
  let bondRate: number | undefined;
  for (const t of tables) {
    if (t.bond > 0 && t.subtotal > 0) {
      bondRate = t.bond / t.subtotal;
      break;
    }
  }

  // Derive blended margin from all tables
  let totalCost = 0;
  let totalSell = 0;
  for (const t of tables) {
    const items = (t.items || []).filter((it) => !it.isHidden);
    const costSum = items.reduce((s, it) => s + (it.cost ?? 0), 0);
    const sellSum = items.reduce((s, it) => s + (it.sellingPrice ?? 0), 0);
    if (costSum > 0) totalCost += costSum;
    totalSell += sellSum || t.subtotal || 0;
  }

  const ledMarginPct = totalCost > 0 && totalSell > totalCost
    ? 1 - (totalCost / totalSell)
    : undefined;

  return {
    ledMarginPct,
    servicesMarginPct: 0.20,
    taxRate,
    bondRate,
  };
}
