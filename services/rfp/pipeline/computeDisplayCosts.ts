/**
 * Shared display cost computation module.
 *
 * Extracted from generateScopingWorkbook.ts so that both the full workbook
 * generator and the lightweight pricing-preview API can reuse the same logic
 * without importing ExcelJS or any sheet-building code.
 */

import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";
import type { PricedDisplay } from "./generateRateCardExcel";
import {
  LED_COST_PER_SQFT_BY_PITCH,
  PM_BASE_FEE,
  ENG_BASE_FEE,
  calculateHardwareCost,
  getProduct,
  type InstallComplexity,
} from "@/services/rfp/productCatalog";
import { getRateSync } from "@/services/rfp/rateCardLoader";

// ─── Helpers ────────────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function rc(key: string, fallback: number): number {
  try { return getRateSync(key); } catch { return fallback; }
}

// ─── Budget Rates & Smart Bundles ───────────────────────────────────────────

export function getSmartBundles() {
  return {
    sendingCard: 450,                                          // no rate card key
    sparePartsPct: rc("spare_parts.led_pct", 0.05),            // rate card: 5%
    signalCablePerSqFt25: 15,                                  // no rate card key
    upsBattery: 2500,                                          // no rate card key
    backupProcessor: 12000,                                    // no rate card key
    weatherproofPerSqFt: 12,                                   // no rate card key
  };
}

export function getBudgetRates() {
  return {
    // Per-display-type install rates (validated against Jeremy's Denver Cost Analysis 03/04/2026)
    installScoreboardPerSqFt: 375,                               // scoreboard/center-hung: Jeremy $374.93/sqft
    installFasciaPerSqFt: 150,                                   // fascia/ribbon-board: Jeremy update 03/11/2026 (was $432)
    installWallPerSqFt: 125,                                     // wall-mounted/perimeter: Jeremy update 03/11/2026 (was $251)
    installPerSqFt: 150,                                         // fallback composite budget rate (updated to match fascia default)
    electricalPerSqFt: rc("electrical.materials_per_sqft", 125), // rate card: electrical materials
    structuralWallPerSqFt: 30,                                   // no rate card key (budget heuristic)
    structuralCeilingPerSqFt: 55,                                // validated: Jeremy $54.63/sqft (was 60)
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FinancialOverrides {
  ledMarginPct?: number;          // 0-1, e.g. 0.38 for 38%
  servicesMarginPct?: number;     // 0-1, e.g. 0.20 for 20%
  taxRate?: number;               // 0-1, e.g. 0.095 for 9.5%
  bondRate?: number;              // 0-1, e.g. 0.015 for 1.5%. 0 = no bond.
  sponsorshipPct?: number;        // 0-1, e.g. 0.05 for 5%. Applied to Display Cost per display. 0 = none.
  costPerSqFtOverride?: number;   // $/sqft override for LED hardware. 0 = use catalog.
  pmComplexity?: "standard" | "complex" | "major";
  cmsAllocation?: number;         // CMS cost in dollars
  scoringAllocation?: number;     // Scoring cost in dollars
  venueServiceYears?: number;
  venueServiceAnnualFee?: number;
  venueServiceEscalationPct?: number;
  venueServiceMarginPct?: number;
  gameClockAllocation?: number;   // Additional Items sheet
  pitchClocksAllocation?: number; // Additional Items sheet
  oesAllocation?: number;         // Additional Items sheet
  miscEquipmentAllocation?: number; // Additional Items sheet
  isUnionLabor?: boolean;         // 15% uplift on labor costs
  perDisplayComplexity?: InstallComplexity[];  // parallel to specs array
  /** Per-display cost overrides from direct cell edits — parallel to specs array */
  perDisplayCostOverrides?: Array<Record<string, number> | undefined>;
}

export interface ComputedDisplay {
  spec: ExtractedLEDSpec;
  priced: PricedDisplay | null;
  match: import("@/services/catalog/productMatcher").MatchedSolution | null;
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
  // TV/LCD flag — priced per unit, not per sqft
  isTV: boolean;
}

export type ProductResolver = (id: string | undefined | null) => { manufacturer: string; name: string; pitch: number; nits: number; weightDensityLbm2: number; powerDensityWm2: number } | ReturnType<typeof getProduct> | null;

// ─── Display Classification Helpers ─────────────────────────────────────────

export function getDisplayClassificationText(spec: ExtractedLEDSpec): string {
  return [
    spec.name,
    spec.location,
    spec.mountingType,
    spec.selectedProductName,
    spec.notes,
  ].filter(Boolean).join(" ").toLowerCase();
}

// ─── Standard LCD/TV Dimensions (16:9) ──────────────────────────────────────
// Physical dimensions for standard commercial LCD panels. These are universal
// across manufacturers (LG, Samsung, NEC, etc.) — 16:9 aspect ratio.
// Used as fallback when AI extraction doesn't capture physical dimensions.
export const STANDARD_LCD_SIZES: Record<number, { widthFt: number; heightFt: number }> = {
  22:  { widthFt: 1.59, heightFt: 0.90 },
  32:  { widthFt: 2.33, heightFt: 1.31 },
  43:  { widthFt: 3.13, heightFt: 1.76 },
  46:  { widthFt: 3.35, heightFt: 1.88 },
  49:  { widthFt: 3.56, heightFt: 2.00 },
  55:  { widthFt: 3.99, heightFt: 2.25 },
  65:  { widthFt: 4.72, heightFt: 2.66 },
  75:  { widthFt: 5.45, heightFt: 3.07 },
  85:  { widthFt: 6.18, heightFt: 3.47 },
  86:  { widthFt: 6.35, heightFt: 3.65 },  // LG 86UH5J-H: 1935×1114mm
  98:  { widthFt: 7.12, heightFt: 4.00 },
  110: { widthFt: 8.09, heightFt: 4.65 },  // LG 110UM5K-B: 2467×1418mm
};

/** Extract LCD screen size (inches) from display name, e.g. '55" LCD Display' → 55 */
export function extractLcdSizeInches(spec: ExtractedLEDSpec): number | null {
  const text = [spec.name, spec.location, spec.selectedProductName]
    .filter(Boolean).join(" ");
  // Match patterns like: 55", 55-inch, 55 inch, 55in, 55 LCD, 55" LCD
  const m = text.match(/\b(\d{2,3})\s*(?:"|''|‟|″|inch|in\b|-inch)/i)
    || text.match(/\b(\d{2,3})\s*(?:lcd|tv|monitor|display)\b/i);
  if (!m) return null;
  const size = parseInt(m[1], 10);
  return STANDARD_LCD_SIZES[size] ? size : null;
}

// ─── Environment-Aware Pitch Rate Lookup ────────────────────────────────────

export const OUTDOOR_PITCH_MAP: Record<string, string> = {
  '6': '5.95',     // 6mm outdoor → Yaham R6 ($260.14) not C6 ($136.51)
  '8': '8.33',     // 8mm outdoor → Yaham R8 ($194.07) not C8 ($148)
  '10': '10.417',  // 10mm outdoor → Yaham R10 ($154.79) not C10 ($112.22)
};

export const PERIMETER_PITCH_MAP: Record<string, number> = {
  '10': 206.59,    // Yaham A10 outdoor perimeter. Denver Cost Analysis 03/04/2026.
};

export function resolveRateByPitch(pitchMm: number, areaSqFt: number, spec: ExtractedLEDSpec): number {
  const displayText = getDisplayClassificationText(spec);
  const isOutdoor = spec.environment === "outdoor"
    || /outdoor|perimeter|field.?pitch|fascia|exterior/i.test(displayText);
  const isPerimeter = /perimeter|field.?pitch|ribbon/i.test(displayText);

  let effectivePitch = String(pitchMm);
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
    return round2(areaSqFt * directRate);
  }
  const pitchKey = `led_cost.${effectivePitch.replace(".", "_")}mm`;
  const rcRate = rc(pitchKey, 0);
  const catalogRate = LED_COST_PER_SQFT_BY_PITCH[effectivePitch];
  let rate = rcRate > 0 ? rcRate : catalogRate;

  // Nearest-pitch fallback: user-entered pitch (e.g. 3.9) may not match catalog
  // pitch exactly (3.91). Find closest match within 5% tolerance.
  if (!rate) {
    const knownPitches = Object.keys(LED_COST_PER_SQFT_BY_PITCH).map(Number).filter(Number.isFinite);
    let bestDelta = Infinity;
    let bestKey = "";
    for (const kp of knownPitches) {
      const delta = Math.abs(kp - pitchMm);
      if (delta < bestDelta && delta / pitchMm < 0.05) {
        bestDelta = delta;
        bestKey = String(kp);
      }
    }
    if (bestKey) rate = LED_COST_PER_SQFT_BY_PITCH[bestKey];
  }

  return rate ? round2(areaSqFt * rate) : 0;
}

// ─── TV Unit Cost Lookup ────────────────────────────────────────────────────

export const TV_UNIT_COST: Record<number, number> = {
  32: 390, 43: 600, 49: 638, 55: 875, 65: 1100,
  75: 1990, 86: 2990, 98: 4300, 110: 10000,
};

// ─── Default Margins ────────────────────────────────────────────────────────

export const DEFAULT_MARGINS: Record<string, number> = {
  ledHardware: 0.15,
  structural: 0.15,
  install: 0.15,
  electrical: 0.15,
  pm: 0.15,
  engineering: 0.15,
  equipment: 0.15,
  cms: 0.15,
  scoring: 0.15,
};

// ─── Compute Display Data ───────────────────────────────────────────────────

export function computeDisplays(
  specs: ExtractedLEDSpec[],
  pricedDisplays: PricedDisplay[] | undefined,
  installComplexity: InstallComplexity,
  resolveProduct: ProductResolver,
  ov?: FinancialOverrides,
): ComputedDisplay[] {
  const identicalBundleCosts = new Map<string, {
    sendingCardCost: number;
    signalCableCost: number;
    upsCost: number;
    backupProcessorCost: number;
    weatherproofCost: number;
  }>();

  return specs.map((spec, idx) => {
    const priced = pricedDisplays?.[idx] ?? null;
    // Standard LCD fallback: if no dimensions extracted, use known LCD panel sizes.
    // When cabinet-snapped active dimensions exist, they are the source of truth
    // for LED sizing and sqft calculations on the cost sheet.
    let widthFt = Number(spec.activeWidthFt) || Number(spec.widthFt) || 0;
    let heightFt = Number(spec.activeHeightFt) || Number(spec.heightFt) || 0;
    if (!widthFt || !heightFt) {
      const lcdSize = extractLcdSizeInches(spec);
      if (lcdSize) {
        const dims = STANDARD_LCD_SIZES[lcdSize];
        if (!widthFt) widthFt = dims.widthFt;
        if (!heightFt) heightFt = dims.heightFt;
      }
    }
    const activeWidthFt = widthFt;
    const activeHeightFt = heightFt;
    const areaSqFt = round2(widthFt * heightFt * (Number(spec.quantity) || 1));

    // Per-display install complexity: override > per-display array > global
    const displayComplexity = ov?.perDisplayComplexity?.[idx] ?? installComplexity;

    // Resolve rates from DB rate card (preloaded), hardcoded fallbacks
    const RATES = getBudgetRates();
    const BUNDLES = getSmartBundles();

    // TV/LCD unit pricing — TVs are priced per unit, not per sqft
    // Detect TV by: name/product contains TV/LCD size pattern, or pixelPitch=0
    const lcdSizeFromSpec = extractLcdSizeInches(spec);
    const displayAndProductText = [spec.name, spec.selectedProductName].filter(Boolean).join(" ");
    const tvSize = lcdSizeFromSpec
      ?? (spec.selectedProductName ? extractLcdSizeInches({ ...spec, name: spec.selectedProductName }) : null);
    const isTV = tvSize != null && (!spec.pixelPitchMm || spec.pixelPitchMm === 0
      || /\btv\b|\blcd\b/i.test(displayAndProductText));

    // LED hardware cost priority:
    //   0. TV/LCD unit pricing (per unit, not per sqft)
    //   1. priced display (from RFP pricing engine)
    //   2. user cost/sqft override
    //   3. explicit product selection → product-specific cost/sqm
    //   4. explicit product selection → use product's pitch for rate card lookup
    //   5. rate card pitch lookup
    //   6. catalog constant pitch lookup
    let ledHardwareCost = priced?.hardwareCost ?? 0;
    const selectedProduct = spec.selectedProductId ? resolveProduct(spec.selectedProductId) : null;
    if (!ledHardwareCost && isTV) {
      const tvCost = TV_UNIT_COST[tvSize!];
      if (tvCost) {
        ledHardwareCost = round2(tvCost * (Number(spec.quantity) || 1));
      }
    }
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
          // Product not in static catalog — fall through to environment-aware pitch lookup
          const effectivePitchFromProduct = (selectedProduct && 'pitchMm' in selectedProduct ? selectedProduct.pitchMm : selectedProduct?.pitch) ?? spec.pixelPitchMm;
          if (effectivePitchFromProduct) {
            ledHardwareCost = resolveRateByPitch(effectivePitchFromProduct, areaSqFt, spec);
          }
        }
      } else if (spec.pixelPitchMm) {
        ledHardwareCost = resolveRateByPitch(spec.pixelPitchMm, areaSqFt, spec);
      }
    }

    // Structural / Labor / Electrical: use priced data when available (Mirror path),
    // otherwise compute from budget rates (Estimator/RFP path).
    const displayText = getDisplayClassificationText(spec);
    const isCeiling = /center.?hung|scoreboard|hanging|ribbon|fascia/i.test(displayText);
    const isScoreboardType = /scoreboard|center.?hung|hanging|jumbotron/i.test(displayText);
    const isFasciaType = /fascia|ribbon|perimeter.*board|banner/i.test(displayText);
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

    // Supply-only mode: when services margin is explicitly 0%, zero out all non-LED costs
    const supplyOnly = ov?.servicesMarginPct === 0;

    // PM & Engineering — rate card backed, with complexity multiplier
    const pmMult = ov?.pmComplexity === "complex" ? 2 : ov?.pmComplexity === "major" ? 3 : 1;
    const pmBase = rc("other.pm_base_fee", PM_BASE_FEE);
    const engBase = rc("other.eng_base_fee", ENG_BASE_FEE);
    const pmCost = supplyOnly ? 0 : (priced?.pmCost ?? round2(pmBase * pmMult));
    const engCost = supplyOnly ? 0 : (priced?.engCost ?? round2(engBase * pmMult));

    // Supply-only: zero all non-LED costs
    if (supplyOnly) {
      structuralMaterialsCost = 0;
      structuralLaborCost = 0;
      electricalCost = 0;
    }

    // Union labor: 15% uplift on labor-related costs
    const unionMult = ov?.isUnionLabor ? 1.15 : 1.0;

    // Skip fixed costs if display has no dimensions (can't scope it)
    const hasDimensions = areaSqFt > 0 && !supplyOnly;

    // Per-display cost overrides from cell edits
    const co = ov?.perDisplayCostOverrides?.[idx];

    // Travel (estimate) — zeroed for supply-only
    const travelCost = hasDimensions ? 15000 : 0; // hasDimensions is already false when supplyOnly

    // LED hardware cost override from cell edit (must be before sparePartsCost)
    if (co?.displayCost != null) ledHardwareCost = co.displayCost;

    // Processor cost — calculated from pixel count, not a single sending card
    // NovaStar 660 Pro: 650K pixels per port, 8 ports per unit, ~$450/unit
    // MCTRL4K: 650K pixels per port, 16 ports per unit, ~$8,400/unit
    const pWidthPx = spec.widthPx || (spec.pixelPitchMm && activeWidthFt ? Math.round(activeWidthFt * 304.8 / spec.pixelPitchMm) : 0);
    const pHeightPx = spec.heightPx || (spec.pixelPitchMm && activeHeightFt ? Math.round(activeHeightFt * 304.8 / spec.pixelPitchMm) : 0);
    const pTotalPixels = pWidthPx * pHeightPx * (spec.quantity || 1);
    const pPixelsPerPort = 650000;
    const pPortsNeeded = pTotalPixels > 0 ? Math.ceil(pTotalPixels / pPixelsPerPort) : 0;
    // Use 4K processor for >8 ports (16-port unit), otherwise 660 Pro (8-port unit)
    const processorUnitCost = pPortsNeeded > 8 ? 8400 : BUNDLES.sendingCard;
    const portsPerUnit = pPortsNeeded > 8 ? 16 : 8;
    const processorsNeeded = pPortsNeeded > 0 ? Math.ceil(pPortsNeeded / portsPerUnit) : (hasDimensions ? 1 : 0);
    let sendingCardCost = co?.processor != null ? co.processor : round2(processorsNeeded * processorUnitCost);
    const sparePartsCost = round2(ledHardwareCost * BUNDLES.sparePartsPct);
    let signalCableCost = round2(BUNDLES.signalCablePerSqFt25 * (areaSqFt / 25));
    const isScoreboard = isCeiling;
    let upsCost = isScoreboard ? BUNDLES.upsBattery : 0;
    let backupProcessorCost = areaSqFt > 300 ? BUNDLES.backupProcessor : 0;
    let weatherproofCost = spec.environment === "outdoor" ? round2(areaSqFt * BUNDLES.weatherproofPerSqFt) : 0;

    // Identical screens must carry identical bundle equipment even when their
    // free-text names classify differently. Key off the actual physical/product
    // configuration instead of display labels.
    const bundleIdentity = [
      spec.selectedProductId || spec.selectedProductName || "",
      spec.environment || "",
      round2(activeWidthFt),
      round2(activeHeightFt),
      Number(spec.quantity) || 1,
      spec.pixelPitchMm || 0,
      pWidthPx,
      pHeightPx,
      pTotalPixels,
      isTV ? "tv" : "led",
      co?.processor != null ? `processor:${co.processor}` : "",
    ].join("|");
    const canonicalBundle = identicalBundleCosts.get(bundleIdentity);
    if (canonicalBundle) {
      sendingCardCost = canonicalBundle.sendingCardCost;
      signalCableCost = canonicalBundle.signalCableCost;
      upsCost = canonicalBundle.upsCost;
      backupProcessorCost = canonicalBundle.backupProcessorCost;
      weatherproofCost = canonicalBundle.weatherproofCost;
    } else {
      identicalBundleCosts.set(bundleIdentity, {
        sendingCardCost,
        signalCableCost,
        upsCost,
        backupProcessorCost,
        weatherproofCost,
      });
    }

    // Shipping — override from cell edit or default $10/sqft (minimum $500 for any real display)
    const rawShipping = hasDimensions ? round2(areaSqFt * 10) : 0;
    const shippingCost = co?.shipping != null ? co.shipping : (rawShipping > 0 ? Math.max(rawShipping, 500) : 0);

    // Apply union multiplier to labor-related costs
    const totalCost = round2(
      ledHardwareCost
      + round2(structuralMaterialsCost * unionMult)
      + round2(structuralLaborCost * unionMult)
      + round2(electricalCost * unionMult)
      + pmCost + engCost + travelCost
      + sendingCardCost + sparePartsCost + signalCableCost
      + upsCost + backupProcessorCost + weatherproofCost
      + shippingCost
    );

    // Margin: per-category approach (override > priced > default)
    // Hardware and services get separate margins, then sum for blended selling price
    const hwMarginPct = co?.marginPct != null ? co.marginPct : (ov?.ledMarginPct ?? DEFAULT_MARGINS.ledHardware);
    // Flat margin across all categories (Natalia confirmed March 2026)
    const svcMarginPct = ov?.servicesMarginPct ?? hwMarginPct;
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
    const widthPx = spec.widthPx || (spec.pixelPitchMm && activeWidthFt ? Math.round(activeWidthFt * 304.8 / spec.pixelPitchMm) : 0);
    const heightPx = spec.heightPx || (spec.pixelPitchMm && activeHeightFt ? Math.round(activeHeightFt * 304.8 / spec.pixelPitchMm) : 0);
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
      isTV,
    };
  });
}
