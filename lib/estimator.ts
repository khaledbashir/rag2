/**
 * ANC Estimator Logic
 * Calculates screen pricing based on dimensions, pixel pitch, and environment
 * 
 * UPDATED: Uses Decimal.js for deterministic financial calculations
 * Reference: VERIFICATION_REFINED_DESIGN.md
 */

import Decimal from "@/lib/decimal";
import { roundToCents, roundCategoryTotal } from "@/lib/decimal";
import { Venue } from "@/types";
import {
  INSTALL_COST_PER_LB, PM_BASE_FEE, ENG_BASE_FEE,
  STEEL_FABRICATION_PER_LB, LED_INSTALL_PER_SQFT,
  HEAVY_EQUIPMENT_PER_LB, PM_GC_TRAVEL_PER_LB,
  ELECTRICAL_MATERIALS_PER_SQFT,
  LED_COST_PER_SQFT_BY_PITCH,
  getAllProducts,
} from "@/services/rfp/productCatalog";

export interface ScreenPriceBreakdown {
  led: number;
  structure: number;
  install: number;
  power: number;
  total: number;
}

/**
 * calculateTotalWithBond (Natalia Math Divisor Model)
 * Sell Price = Cost / (1 - Margin%)
 * Bond = Sell Price * 0.015
 * Total = Sell Price + Bond
 */
export function calculateTotalWithBond(cost: number, marginPct: number) {
  // Natalia Math Divisor Model: P = C / (1 - M)
  const dCost = new Decimal(cost);
  const dMarginPct = new Decimal(marginPct);

  // sellPrice = cost / (1 - (marginPct / 100))
  const sellPrice = dCost.div(new Decimal(1).minus(dMarginPct.div(100)));

  // Bond is 1.5% of the Sell Price
  const bond = sellPrice.times(0.015);
  const total = sellPrice.plus(bond);

  return {
    sellPrice: roundToCents(sellPrice).toNumber(),
    bond: roundToCents(bond).toNumber(),
    total: roundToCents(total).toNumber()
  };
}

// RESERVED: Intelligence Mode Phase C — calculateScreenPrice
// Legacy screen pricing logic kept for future Intelligence Mode build-out.
// Do not delete. See: calculatePerScreenAudit for current ANC Master Logic.

export const MORGANTOWN_BO_TAX = 0.02; // 2% West Virginia B&O Tax (REQ-81)
export const STEEL_PRICE_PER_TON = 3000; // REQ-86: Thornton Tomasetti rate $3,000/ton
export const BOND_PCT = 0.015; // 1.5% Bond Fee
export const DEFAULT_SALES_TAX = 0.095; // 9.5% Sales Tax
export const DEFAULT_MARGIN = 0.30; // Validated: NBCU LED Cost Sheet V=0.3, all displays. Was 0.25.
export const DEFAULT_COST_PER_SQFT = 120;
export const DEFAULT_PITCH_MM = 10;
export const DEFAULT_SERVICE_TYPE = "Front/Rear";
// REMOVED: INSTALL_FLAT, LABOR_PCT, POWER_PCT, SHIPPING_PER_SQFT, PM_PER_SQFT
// Use INSTALL_COST_PER_LB and PM_BASE_FEE from productCatalog.ts instead
export const GENERAL_CONDITIONS_PCT = 0.02;
export const TRAVEL_PCT = 0.03;
export const SUBMITTALS_PCT = 0.01;
export const PERMITS_FIXED = 500;
export const CMS_PCT = 0.02;
export const DEMOLITION_FIXED = 5000;
export const DEFAULT_REGIONAL_LABOR_MULTIPLIER = 1.0; // Base multiplier (1.0 = 100%)

// Venue Specific Constraints (REQ-81)
export const VENUE_CONSTRAINTS = {
  [Venue.STADIUM]: {
    liquidatedDamages: "$2,500/day + $150,000 per home football game",
    weightLimitLbs: 60000,
    completionDate: "July 30, 2020",
  },
  [Venue.COLISEUM]: {
    liquidatedDamages: "$5,000/day + $150,000 per home basketball game",
    weightLimitLbs: 60000,
  },
  "Alfond Arena": {
    weightLimitLbs: 6000,
  }
};

function shouldApplyMorgantownBoTax(input?: { projectAddress?: string; venue?: string }) {
  const haystack = `${input?.projectAddress ?? ""} ${input?.venue ?? ""}`.toLowerCase();
  if (haystack.includes("morgantown")) return true;
  if (haystack.includes("wvu")) return true;
  if (haystack.includes("milan puskar")) return true;
  if (haystack.includes("puskar stadium")) return true;
  return false;
}

// RESERVED: Intelligence Mode Phase C — calculateProposalTotal
// Multi-screen aggregation logic kept for future Intelligence Mode build-out.

/* ======================================================
   ANC Project estimator (from Master Excel Logic) - Hardened Audit Engine
   - Inputs in feet and mm where applicable
   - Returns per-screen and aggregated line-item breakdown
   - Exposes a dual-layer API: clientSummary (clean) and internalAudit (full math)
   ====================================================== */

export interface ScreenInput {
  name: string;
  productType?: string;
  widthFt?: number;
  heightFt?: number;
  quantity?: number;
  pitchMm?: number;
  costPerSqFt?: number;
  desiredMargin?: number;
  /** Per-category margins (override desiredMargin for each cost bucket) */
  categoryMargins?: {
    led?: number;       // Hardware margin (default 0.30)
    services?: number;  // Services margin (default 0.20)
    cms?: number;       // CMS/Software margin (default 0.35)
  };
  serviceType?: string;
  formFactor?: string; // "Straight" or "Curved"
  outletDistance?: number;
  isReplacement?: boolean;
  useExistingStructure?: boolean;
  includeSpareParts?: boolean;
  sparePartsPercentage?: number; // 0.02 for 2%, 0.05 for 5% (default: 0.05 if includeSpareParts is true)
  isManualLineItem?: boolean;
  manualCost?: number;
  aiSource?: any;
}

export type LineItemBreakdown = {
  name: string;
  productType: string;
  quantity: number;
  areaSqFt: number;
  pixelResolution: number;
  hardware: number; // Display cost
  shipping: number;
  labor: number;
  pm: number;
  bond: number;
  marginAmount: number;
  totalCost: number; // cost before margin
  totalPrice: number; // after margin + bond
};

export type ANCProjectResult = {
  items: LineItemBreakdown[];
  totals: {
    hardware: number;
    shipping: number;
    labor: number;
    pm: number;
    demolition?: number;
    bond: number;
    margin: number;
    totalCost: number;
    totalPrice: number;
  };
};

/**
 * Screen Audit type (updated for ANC Master Logic)
 * - Includes pixelMatrix and serviceType at screen level
 * - Breakdown includes new margin-on-sell fields
 */
export type ScreenAudit = {
  name: string;
  productType: string;
  quantity: number;
  areaSqFt: number;
  pixelResolution: number;
  pixelMatrix?: string; // e.g., "1920 x 1080 @ 4mm"
  serviceType?: string; // "Top" or "Front/Rear"
  breakdown: {
    hardware: number; // Display cost / LED
    structure: number;
    install: number;
    labor: number;
    demolition: number;
    power: number;
    shipping: number;
    pm: number;
    generalConditions: number;
    travel: number;
    submittals: number;
    engineering: number;
    permits: number;
    cms: number;
    ancMargin: number; // Sell Price - Total Cost
    sellPrice: number; // Total Cost / (1 - margin)
    bondCost: number; // Sell Price * 1.5%
    marginAmount: number; // Alias for ancMargin (backwards compatibility)
    totalCost: number; // Sum of all costs EXCLUDING bond
    finalClientTotal: number; // Sell Price + Bond Cost + boTax + salesTax
    sellingPricePerSqFt: number; // Final Client Total / Sq Ft
    boTaxCost: number; // REQ-48
    salesTaxCost: number; // REQ-125: Sales tax amount
    salesTaxRate: number; // REQ-125: Sales tax rate used
    regionalLaborMultiplier?: number; // Applied regional labor cost multiplier
  };
};

export type InternalAudit = {
  perScreen: ScreenAudit[];
  softCostItems?: Array<{ name: string; cost: number; sell: number }>; // REQ-UserFeedback: Non-LED items from Excel
  totals: {
    hardware: number;
    structure: number;
    install: number;
    labor: number;
    power: number;
    shipping: number;
    pm: number;
    demolition: number;
    generalConditions: number;
    travel: number;
    submittals: number;
    engineering: number;
    permits: number;
    cms: number;
    ancMargin: number; // ANC profit from screen audits
    sellPrice: number; // Sell price before bond
    bondCost: number; // Sell Price * 1.5%
    margin: number;   // Alias for ancMargin
    totalCost: number; // Sum of screen costs
    boTaxCost: number; // Total B&O Tax
    finalClientTotal: number; // Total with Bond and B&O
    sellingPricePerSqFt: number; // Weighted average
  };
};

export type ClientSummary = {
  subtotal: number; // pre-tax price shown to client
  total: number; // final selling price (includes margin, bond)
  breakdown: {
    hardware: number;
    structure: number;
    install: number;
    others: number; // aggregated small items
  };
};

/**
 * calculatePerScreenAudit
 * Deterministic formula based on ANC Excel guidance.
 * Using Decimal.js for correct financial math.
 */
export function calculatePerScreenAudit(
  s: ScreenInput,
  options?: {
    defaultCostPerSqFt?: number;
    defaultPitchMm?: number;
    defaultDesiredMargin?: number;
    installFlatFee?: number;
    structurePct?: number;
    laborPct?: number;
    powerPct?: number;
    shippingPerSqFt?: number;
    pmPerSqFt?: number;
    generalConditionsPct?: number;
    travelPct?: number;
    submittalsPct?: number;
    engineeringPct?: number;
    permitsFixed?: number;
    cmsPct?: number;
    bondPct?: number;
    taxRate?: number; // REQ-125: Sales tax rate override (default 0.095)
    structuralTonnage?: number; // REQ-46
    reinforcingTonnage?: number; // REQ-46
    projectAddress?: string; // REQ-81
    venue?: string; // REQ-81
    regionalLaborMultiplier?: number; // Regional labor cost multiplier (e.g., 1.5 for Manhattan, 0.9 for rural)
  }
): ScreenAudit {
  // Load catalog for VLOOKUP
  const { loadCatalogSync } = require('./catalog');
  const catalog = loadCatalogSync();

  // Defaults with options overrides
  const costPerSqFtVal = options?.defaultCostPerSqFt ?? DEFAULT_COST_PER_SQFT;
  const pitchMmVal = options?.defaultPitchMm ?? DEFAULT_PITCH_MM;
  const marginVal = options?.defaultDesiredMargin ?? DEFAULT_MARGIN;
  const bondPctVal = options?.bondPct ?? BOND_PCT;
  const salesTaxVal = options?.taxRate ?? DEFAULT_SALES_TAX;
  const serviceTypeVal = DEFAULT_SERVICE_TYPE;

  const regionalLaborMultiplier = options?.regionalLaborMultiplier ?? DEFAULT_REGIONAL_LABOR_MULTIPLIER;
  const gcPctVal = options?.generalConditionsPct ?? GENERAL_CONDITIONS_PCT;
  const travelPctVal = options?.travelPct ?? TRAVEL_PCT;
  const submittalsPctVal = options?.submittalsPct ?? SUBMITTALS_PCT;
  const permitsVal = options?.permitsFixed ?? PERMITS_FIXED;
  const cmsPctVal = options?.cmsPct ?? CMS_PCT;

  const qty = new Decimal(s.quantity ?? 1);
  const pitch = s.pitchMm ?? pitchMmVal;
  const serviceType = s.serviceType ?? serviceTypeVal;
  const formFactor = s.formFactor ?? "Straight";
  const outletDistance = s.outletDistance ?? 0;
  const desiredMargin = new Decimal(s.desiredMargin ?? marginVal);

  // VLOOKUP: Find matching product by pixel pitch in catalog
  const catalogEntry = catalog?.find(
    (entry: any) => Math.abs(entry.pixel_pitch - pitch) < 0.1
  ) ?? { cost_per_sqft: DEFAULT_COST_PER_SQFT, service_type: DEFAULT_SERVICE_TYPE };

  const costPerSqFt = new Decimal(s.costPerSqFt ?? catalogEntry.cost_per_sqft ?? DEFAULT_COST_PER_SQFT);

  // Pixel Matrix Math: (H_mm / Pitch) × (W_mm / Pitch)
  const resolveModuleKey = (productType: string | undefined, pitchMm: number) => {
    if (!productType) return null;
    const t = productType.toLowerCase();
    if (t.includes("lg") && Math.abs(pitchMm - 4) < 0.25) return "LG-GSQA-4MM";
    if (t.includes("yaham") && Math.abs(pitchMm - 10) < 0.5) return "YAHAM-10MM-INDOOR";
    return null;
  };

  const moduleKey = s.aiSource?.moduleKey ?? resolveModuleKey(s.productType, pitch);
  const targetHeightFt = s.heightFt ?? 0;
  const targetWidthFt = s.widthFt ?? 0;
  const { matchModules } = require("../services/module-matching");
  const matched = moduleKey && targetHeightFt > 0 && targetWidthFt > 0
    ? matchModules(targetWidthFt, targetHeightFt, moduleKey)
    : null;

  const heightMm = (matched?.actualHeightFt ?? targetHeightFt) * 304.8;
  const widthMm = (matched?.actualWidthFt ?? targetWidthFt) * 304.8;
  const pixelsH = Math.round(heightMm / pitch);
  const pixelsW = Math.round(widthMm / pitch);
  const pixelResolution = pixelsH * pixelsW;
  const pixelMatrix = `${pixelsH} x ${pixelsW} @ ${pitch}mm`;

  // Service Type Branch: Top = 10%, Front/Rear = 20%
  let STRUCTURE_PCT = serviceType.toLowerCase().includes("top") ? 0.10 : 0.20;
  let ENGINEERING_PCT = options?.engineeringPct ?? 0.02;

  // Note: Infrastructure Credit removed per Master Truth PRD alignment.

  const height = new Decimal(s.heightFt ?? 0);
  const width = new Decimal(s.widthFt ?? 0);
  const area = roundToCents(height.times(width));
  const totalArea = roundToCents(area.times(qty)); // Total project area

  const hardwareBase = s.isManualLineItem && s.manualCost !== undefined
    ? new Decimal(s.manualCost)
    : roundToCents(area.times(costPerSqFt));

  // Ferrari Logic 1: Spare Parts (RFP Exhibit A, Page 11) - Dynamic percentage based on risk detection
  // Use detected percentage (2% or 5%) or default to 5% if includeSpareParts is true but no percentage specified
  const sparePercent = s.sparePartsPercentage ? new Decimal(s.sparePartsPercentage) : new Decimal(0.05);
  // Manual items usually don't have spare parts unless explicitly asked
  const sparePartsCost = (s.includeSpareParts && !s.isManualLineItem) ? roundToCents(hardwareBase.times(sparePercent)) : new Decimal(0);
  const hardwareUnit = roundToCents(hardwareBase.plus(sparePartsCost));
  const hardware = roundToCents(hardwareUnit.times(qty));

  // Curved Screen Multipliers
  const isCurved = formFactor.toLowerCase() === "curved";
  const structureMultiplier = isCurved ? 1.25 : 1.0;
  const curvedLaborMultiplier = isCurved ? 1.15 : 1.0;

  // Combine curved multiplier with regional labor multiplier
  // e.g., curved (1.15) × Manhattan (1.5) = 1.725
  const totalLaborMultiplier = curvedLaborMultiplier * regionalLaborMultiplier;

  const baseStructure = hardware.times(STRUCTURE_PCT);
  const structure = roundToCents(baseStructure.times(structureMultiplier));

  // --- Weight-based cost calculations using product catalog density constants ---
  // Find matching product by pitch to get weight/power density
  const allProducts = getAllProducts();
  const matchedProduct = allProducts.find(p => Math.abs(p.pitchMm - pitch) < 0.5);

  // Weight estimate: area (m²) × weightDensityLbm2 (lbs/m²)
  const areaM2 = totalArea.toNumber() * 0.0929; // sqft → m²
  const estimatedWeightLbs = matchedProduct
    ? areaM2 * matchedProduct.weightDensityLbm2
    : totalArea.toNumber() * 5; // fallback: ~5 lbs/sqft for unknown products

  // Install: Steel fabrication cost based on estimated weight
  const steelRate = options?.installFlatFee ?? STEEL_FABRICATION_PER_LB.standard; // $35/lb default
  const install = roundToCents(new Decimal(estimatedWeightLbs * steelRate).times(totalLaborMultiplier));

  // Labor: LED panel install labor per sqft
  const ledInstallRate = options?.laborPct ?? LED_INSTALL_PER_SQFT.standard; // $105/sqft default
  const labor = roundToCents(totalArea.times(ledInstallRate).times(totalLaborMultiplier));

  // Power/Electrical: Materials cost per sqft
  const electricalRate = options?.powerPct ?? ELECTRICAL_MATERIALS_PER_SQFT; // $125/sqft default
  const power = roundToCents(totalArea.times(electricalRate));

  // Shipping: Weight-based — ~$0.50/lb for ocean + ground freight
  const shippingRate = options?.shippingPerSqFt ?? 0.50; // $/lb
  const shipping = roundToCents(new Decimal(estimatedWeightLbs * shippingRate));

  // PM: Base fee per screen (zone-multiplied in scoping workbook, flat per screen here)
  const pmRate = options?.pmPerSqFt ?? PM_BASE_FEE; // $5,882.35 per screen
  const pm = roundToCents(new Decimal(pmRate).times(qty));
  const generalConditions = roundToCents(hardware.times(GENERAL_CONDITIONS_PCT));
  const travel = roundToCents(hardware.times(TRAVEL_PCT));
  const submittals = roundToCents(hardware.times(SUBMITTALS_PCT));
  const engineering = roundToCents(hardware.times(ENGINEERING_PCT));
  const permits = roundToCents(PERMITS_FIXED);
  const cms = roundToCents(hardware.times(CMS_PCT));

  const demolition = s.isReplacement ? roundToCents(DEMOLITION_FIXED) : new Decimal(0);

  // Outlet Distance Surcharge: If > 50ft, add $2,500 to Power
  const outletSurcharge = outletDistance > 50 ? 2500 : 0;
  const adjustedPower = roundToCents(power.plus(outletSurcharge));

  // Total Cost (C): Sum of all line items EXCLUDING Bond
  const totalCost = roundToCents(
    hardware.plus(structure).plus(install).plus(labor).plus(adjustedPower)
      .plus(shipping).plus(pm).plus(generalConditions).plus(travel)
      .plus(submittals).plus(engineering).plus(permits).plus(cms)
      .plus(demolition)
  );

  // REQ-110: Margin Validation - Prevent division by zero
  if (desiredMargin.gte(1.0)) {
    throw new Error(`Invalid margin: ${desiredMargin.times(100)}%. Margin must be less than 100% for Divisor Margin model.`);
  }

  // Natalia Math Divisor Model: P = C / (1 - M)
  // Per-category margins: LED hardware gets ledMargin, services get servicesMargin, CMS gets cmsMargin
  const catMargins = s.categoryMargins;
  let sellPrice: Decimal;

  if (catMargins && (catMargins.led !== undefined || catMargins.services !== undefined || catMargins.cms !== undefined)) {
    // Per-category margin mode — bucket costs by category and apply different margins
    const ledMargin = new Decimal(catMargins.led ?? 0.30);
    const servicesMargin = new Decimal(catMargins.services ?? 0.20);
    const cmsMargin = new Decimal(catMargins.cms ?? 0.35);

    // LED bucket: hardware + shipping (product-related)
    const ledCost = hardware.plus(shipping);
    // Services bucket: structure, install, labor, power, PM, GC, travel, submittals, engineering, permits, demolition
    const servicesCost = structure.plus(install).plus(labor).plus(adjustedPower)
      .plus(pm).plus(generalConditions).plus(travel)
      .plus(submittals).plus(engineering).plus(permits).plus(demolition);
    // CMS bucket: CMS/software
    const cmsCost = cms;

    // Validate all category margins
    for (const [name, m] of [["LED", ledMargin], ["Services", servicesMargin], ["CMS", cmsMargin]] as const) {
      if ((m as Decimal).gte(1.0)) {
        throw new Error(`Invalid ${name} margin: ${(m as Decimal).times(100)}%. Must be less than 100%.`);
      }
    }

    const ledSell = ledCost.gt(0) ? roundToCents(ledCost.div(new Decimal(1).minus(ledMargin))) : new Decimal(0);
    const servicesSell = servicesCost.gt(0) ? roundToCents(servicesCost.div(new Decimal(1).minus(servicesMargin))) : new Decimal(0);
    const cmsSell = cmsCost.gt(0) ? roundToCents(cmsCost.div(new Decimal(1).minus(cmsMargin))) : new Decimal(0);

    sellPrice = roundToCents(ledSell.plus(servicesSell).plus(cmsSell));
  } else {
    // Legacy single-margin mode
    sellPrice = roundToCents(totalCost.div(new Decimal(1).minus(desiredMargin)));
  }

  // Bond Fee: 1.5% applied ON TOP of the Sell Price (calculated against Sell Price)
  const bondCost = roundToCents(sellPrice.times(BOND_PCT));

  // REQ-81: Morgantown/WVU B&O Tax (2% of Sell Price + Bond)
  const boTaxRate = shouldApplyMorgantownBoTax({
    projectAddress: options?.projectAddress,
    venue: options?.venue,
  })
    ? MORGANTOWN_BO_TAX
    : 0;
  const boTaxCost = roundToCents(sellPrice.plus(bondCost).times(boTaxRate));

  // REQ-125: Sales Tax included in finalClientTotal per Master Truth mandate
  // Financial Sequence: Selling Price + Bond + B&O Tax + Sales Tax = Final Total
  const salesTaxRate = new Decimal(DEFAULT_SALES_TAX);
  const taxableAmount = sellPrice.plus(bondCost).plus(boTaxCost);
  const salesTaxCost = roundToCents(taxableAmount.times(salesTaxRate));
  const finalClientTotal = roundToCents(taxableAmount.plus(salesTaxCost));

  // ANC Margin (Profit): Sell Price - Total Cost
  const ancMargin = roundToCents(sellPrice.minus(totalCost));

  // Selling SqFt: Final Client Total / Total Sq Ft
  const sellingPricePerSqFt = totalArea.gt(0) ? roundToCents(finalClientTotal.div(totalArea)) : new Decimal(0);

  return {
    name: s.name,
    productType: s.productType ?? "",
    quantity: qty.toNumber(),
    areaSqFt: roundToCents(totalArea).toNumber(),
    pixelResolution,
    pixelMatrix,
    serviceType,
    breakdown: {
      hardware: hardware.toNumber(),
      structure: structure.toNumber(),
      install: install.toNumber(),
      labor: labor.toNumber(),
      demolition: demolition.toNumber(),
      power: adjustedPower.toNumber(),
      shipping: shipping.toNumber(),
      pm: pm.toNumber(),
      generalConditions: generalConditions.toNumber(),
      travel: travel.toNumber(),
      submittals: submittals.toNumber(),
      engineering: engineering.toNumber(),
      permits: permits.toNumber(),
      cms: cms.toNumber(),
      ancMargin: ancMargin.toNumber(),
      sellPrice: sellPrice.toNumber(),
      bondCost: bondCost.toNumber(),
      marginAmount: ancMargin.toNumber(),
      totalCost: totalCost.toNumber(),
      finalClientTotal: finalClientTotal.toNumber(),
      sellingPricePerSqFt: sellingPricePerSqFt.toNumber(),
      boTaxCost: boTaxCost.toNumber(),
      salesTaxCost: salesTaxCost.toNumber(),
      salesTaxRate: salesTaxRate.toNumber(),
      regionalLaborMultiplier: totalLaborMultiplier, // Include applied multiplier for transparency
    },
  };
}

/**
 * calculateANCProject (keeps backwards-compatible name) -> now delegates to per-screen audit
 */
export function calculateANCProject(
  screens: ScreenInput[],
  options?: { defaultCostPerSqFt?: number; defaultPitchMm?: number; defaultDesiredMargin?: number }
): ANCProjectResult {
  const perScreen = screens.map((s) => calculatePerScreenAudit(s, options));

  const items = perScreen.map((ps) => ({
    name: ps.name,
    productType: ps.productType,
    quantity: ps.quantity,
    areaSqFt: ps.areaSqFt,
    pixelResolution: ps.pixelResolution,
    hardware: ps.breakdown.hardware,
    shipping: ps.breakdown.shipping,
    labor: ps.breakdown.labor,
    pm: ps.breakdown.pm,
    bond: ps.breakdown.bondCost, // Corrected: only one bond field
    marginAmount: ps.breakdown.ancMargin,
    totalCost: ps.breakdown.totalCost,
    totalPrice: ps.breakdown.finalClientTotal, // Corrected: only one totalPrice field
  }));

  // Aggregate totals using Decimal for precision
  let hardware = new Decimal(0);
  let shipping = new Decimal(0);
  let labor = new Decimal(0);
  let pm = new Decimal(0);
  let bond = new Decimal(0);
  let margin = new Decimal(0);
  let totalCost = new Decimal(0);
  let totalPrice = new Decimal(0);

  for (const it of items) {
    hardware = hardware.plus(it.hardware);
    shipping = shipping.plus(it.shipping);
    labor = labor.plus(it.labor);
    pm = pm.plus(it.pm);
    bond = bond.plus(it.bond);
    margin = margin.plus(it.marginAmount);
    totalCost = totalCost.plus(it.totalCost);
    totalPrice = totalPrice.plus(it.totalPrice);
  }

  // Round final aggregated totals (though they should already be clean if inputs are)
  return {
    items,
    totals: {
      hardware: roundToCents(hardware).toNumber(),
      shipping: roundToCents(shipping).toNumber(),
      labor: roundToCents(labor).toNumber(),
      pm: roundToCents(pm).toNumber(),
      bond: roundToCents(bond).toNumber(),
      margin: roundToCents(margin).toNumber(),
      totalCost: roundToCents(totalCost).toNumber(),
      totalPrice: roundToCents(totalPrice).toNumber(),
    }
  };
}

/**
 * calculateProposalAudit
 * Returns both a client-facing summary and a full internal audit object.
 */
export function calculateProposalAudit(
  screens: ScreenInput[],
  options?: {
    defaultCostPerSqFt?: number;
    defaultPitchMm?: number;
    defaultDesiredMargin?: number;
    taxRate?: number; // Override default 9.5%
    bondPct?: number; // Override default 1.5%
    structuralTonnage?: number;
    reinforcingTonnage?: number;
    projectAddress?: string; // REQ-81
    venue?: string; // REQ-81
  }
): { clientSummary: ClientSummary; internalAudit: InternalAudit } {
  const perScreen = screens.map((s) => calculatePerScreenAudit(s, {
    ...options,
    bondPct: options?.bondPct,
    structuralTonnage: options?.structuralTonnage,
    reinforcingTonnage: options?.reinforcingTonnage
  }));

  const totalTonnage = new Decimal(options?.structuralTonnage ?? 0).plus(options?.reinforcingTonnage ?? 0);
  const tonnageCost = roundToCents(totalTonnage.times(STEEL_PRICE_PER_TON));

  if (tonnageCost.gt(0) && perScreen.length > 0) {
    const weights = perScreen.map((ps) => new Decimal(ps.breakdown.structure));
    const totalWeight = weights.reduce((acc, w) => acc.plus(w), new Decimal(0));

    const allocationsUnrounded =
      totalWeight.gt(0)
        ? weights.map((w) => tonnageCost.times(w.div(totalWeight)))
        : perScreen.map(() => tonnageCost.div(perScreen.length));

    const allocations = allocationsUnrounded.map((a) => roundToCents(a));
    const sumAllocations = allocations.reduce((acc, a) => acc.plus(a), new Decimal(0));
    const diff = roundToCents(tonnageCost.minus(sumAllocations));
    // Adjust last allocation with difference
    allocations[allocations.length - 1] = roundToCents(allocations[allocations.length - 1].plus(diff));

    const boTaxRate = shouldApplyMorgantownBoTax({
      projectAddress: options?.projectAddress,
      venue: options?.venue,
    })
      ? MORGANTOWN_BO_TAX
      : 0;

    for (let i = 0; i < perScreen.length; i++) {
      const ps = perScreen[i];
      const b = ps.breakdown;
      const oldStructure = new Decimal(b.structure);
      const newStructure = allocations[i] ?? new Decimal(0);
      if (oldStructure.equals(newStructure)) continue;

      const oldTotalCost = new Decimal(b.totalCost);
      const newTotalCost = roundToCents(oldTotalCost.minus(oldStructure).plus(newStructure));

      const oldSellPrice = new Decimal(b.sellPrice);
      const oldBondCost = new Decimal(b.bondCost);

      const desiredMargin = oldSellPrice.gt(0)
        ? new Decimal(1).minus(oldTotalCost.div(oldSellPrice))
        : new Decimal(options?.defaultDesiredMargin ?? 0.25);

      const bondPct = oldSellPrice.gt(0)
        ? oldBondCost.div(oldSellPrice)
        : new Decimal(options?.bondPct ?? 0.015);

      if (desiredMargin.gte(1.0)) {
        throw new Error(`Invalid margin: ${desiredMargin.times(100)}%. Margin must be less than 100% for Divisor Margin model.`);
      }

      const sellPrice = roundToCents(newTotalCost.div(new Decimal(1).minus(desiredMargin)));
      const bondCost = roundToCents(sellPrice.times(bondPct));
      const boTaxCost = roundToCents(sellPrice.plus(bondCost).times(boTaxRate));
      // REQ-125: Include Sales Tax in finalClientTotal
      const salesTaxRate = new Decimal(options?.taxRate ?? 0.095);
      const taxableAmount = sellPrice.plus(bondCost).plus(boTaxCost);
      const salesTaxCost = roundToCents(taxableAmount.times(salesTaxRate));
      const finalClientTotal = roundToCents(taxableAmount.plus(salesTaxCost));
      const ancMargin = roundToCents(sellPrice.minus(newTotalCost));
      const sellingPricePerSqFt = ps.areaSqFt > 0 ? roundToCents(finalClientTotal.div(ps.areaSqFt)) : new Decimal(0);

      b.structure = newStructure.toNumber();
      b.totalCost = newTotalCost.toNumber();
      b.sellPrice = sellPrice.toNumber();
      b.bondCost = bondCost.toNumber();
      b.boTaxCost = boTaxCost.toNumber();
      b.finalClientTotal = finalClientTotal.toNumber();
      b.ancMargin = ancMargin.toNumber();
      b.marginAmount = ancMargin.toNumber();
      b.sellingPricePerSqFt = sellingPricePerSqFt.toNumber();
    }
  }

  // Aggregate totals
  const totals = {
    hardware: new Decimal(0),
    structure: new Decimal(0),
    install: new Decimal(0),
    labor: new Decimal(0),
    power: new Decimal(0),
    shipping: new Decimal(0),
    pm: new Decimal(0),
    generalConditions: new Decimal(0),
    travel: new Decimal(0),
    submittals: new Decimal(0),
    engineering: new Decimal(0),
    permits: new Decimal(0),
    cms: new Decimal(0),
    ancMargin: new Decimal(0),
    sellPrice: new Decimal(0),
    bondCost: new Decimal(0),
    margin: new Decimal(0),
    totalCost: new Decimal(0),
    boTaxCost: new Decimal(0),
    finalClientTotal: new Decimal(0),
    sellingPricePerSqFt: new Decimal(0),
    demolition: new Decimal(0),
  };

  for (const ps of perScreen) {
    const b = ps.breakdown;
    totals.hardware = totals.hardware.plus(b.hardware);
    totals.structure = totals.structure.plus(b.structure);
    totals.install = totals.install.plus(b.install);
    totals.labor = totals.labor.plus(b.labor);
    totals.power = totals.power.plus(b.power);
    totals.shipping = totals.shipping.plus(b.shipping);
    totals.pm = totals.pm.plus(b.pm);
    totals.generalConditions = totals.generalConditions.plus(b.generalConditions);
    totals.travel = totals.travel.plus(b.travel);
    totals.submittals = totals.submittals.plus(b.submittals);
    totals.engineering = totals.engineering.plus(b.engineering);
    totals.permits = totals.permits.plus(b.permits);
    totals.cms = totals.cms.plus(b.cms);
    totals.ancMargin = totals.ancMargin.plus(b.ancMargin);
    totals.sellPrice = totals.sellPrice.plus(b.sellPrice);
    totals.bondCost = totals.bondCost.plus(b.bondCost);
    totals.boTaxCost = totals.boTaxCost.plus(b.boTaxCost || 0);
    totals.totalCost = totals.totalCost.plus(b.totalCost);
    totals.finalClientTotal = totals.finalClientTotal.plus(b.finalClientTotal);
    totals.sellingPricePerSqFt = totals.sellingPricePerSqFt.plus(new Decimal(b.sellingPricePerSqFt).times(ps.areaSqFt)); // Weighted average sum
    totals.margin = totals.margin.plus(b.ancMargin);
    totals.demolition = totals.demolition.plus(b.demolition || 0);
  }

  // Compute final weighted average for sellingPricePerSqFt
  const totalSqFt = totals.totalCost.gt(0)
    ? perScreen.reduce((sum, ps) => sum + ps.areaSqFt, 0)
    : 1;
  const weightedSellingPricePerSqFt = roundToCents(totals.sellingPricePerSqFt.div(totalSqFt));

  const internalAudit: InternalAudit = {
    perScreen,
    totals: {
      hardware: roundToCents(totals.hardware).toNumber(),
      structure: roundToCents(totals.structure).toNumber(),
      install: roundToCents(totals.install).toNumber(),
      labor: roundToCents(totals.labor).toNumber(),
      power: roundToCents(totals.power).toNumber(),
      shipping: roundToCents(totals.shipping).toNumber(),
      pm: roundToCents(totals.pm).toNumber(),
      generalConditions: roundToCents(totals.generalConditions).toNumber(),
      travel: roundToCents(totals.travel).toNumber(),
      submittals: roundToCents(totals.submittals).toNumber(),
      engineering: roundToCents(totals.engineering).toNumber(),
      permits: roundToCents(totals.permits).toNumber(),
      cms: roundToCents(totals.cms).toNumber(),
      ancMargin: roundToCents(totals.ancMargin).toNumber(),
      sellPrice: roundToCents(totals.sellPrice).toNumber(),
      bondCost: roundToCents(totals.bondCost).toNumber(),
      margin: roundToCents(totals.margin).toNumber(),
      totalCost: roundToCents(totals.totalCost).toNumber(),
      boTaxCost: roundToCents(totals.boTaxCost).toNumber(),
      finalClientTotal: roundToCents(totals.finalClientTotal).toNumber(),
      sellingPricePerSqFt: weightedSellingPricePerSqFt.toNumber(),
      demolition: roundToCents(totals.demolition).toNumber(),
    },
  };

  // Apply project tax (default 9.5% or override) to the subtotal to compute grand total
  const subtotal = roundToCents(totals.finalClientTotal);
  const activeTaxRate = new Decimal(options?.taxRate !== undefined ? options.taxRate : DEFAULT_SALES_TAX);
  const taxAmount = roundToCents(subtotal.times(activeTaxRate));
  const grandTotal = roundToCents(subtotal.plus(taxAmount));

  const clientSummary: ClientSummary = {
    subtotal: subtotal.toNumber(),
    total: grandTotal.toNumber(),
    breakdown: {
      hardware: roundToCents(totals.hardware).toNumber(),
      structure: roundToCents(totals.structure).toNumber(),
      install: roundToCents(totals.install).toNumber(),
      others: roundToCents(
        totals.shipping.plus(totals.pm).plus(totals.generalConditions).plus(totals.travel)
          .plus(totals.submittals).plus(totals.engineering).plus(totals.permits).plus(totals.cms).plus(totals.demolition)
      ).toNumber(),
    },
  };

  return { clientSummary, internalAudit };
}

/* ======================================================
   Excel-Based Pricing Calculator (ANC Proposal Tab)
   - Follows the Westfield RFP Excel template structure
   - Calculates: LED Cost, Shipping, Labor, Bond, Margin, Total
   - Returns both display level and aggregated pricing
   ====================================================== */

export interface ExcelPricingRow {
  option: string;
  issue: string;
  vendor: string;
  product: string;
  pitch: string; // e.g., "10mm", "4mm"
  heightFeet: number;
  widthFeet: number;
  heightPixels: number;
  widthPixels: number;
  squareFeet: number;
  quantity: number;
  totalSqFt: number;
  ledNitRequirement: number;
  ledServiceRequirement: string;
  ledCostPerSqFt: number;
  displayCost: number;
  shipping: number;
  totalCost: number; // Display Cost + Shipping
  margin: number; // e.g., 0.10 for 10%
  price: number; // Total Cost / (1 - Margin) - Divisor Model
  ancMargin: number; // Price - TotalCost
  bondCost: number;
  totalWithBond: number; // Price + BondCost
  sellingSqFt: number; // TotalWithBond / TotalSqFt
  shippingSalePrice: number; // Shipping / (1 - Margin) - Divisor Model
}

export interface ExcelPricingSheet {
  rows: ExcelPricingRow[];
  totals: {
    totalDisplayCost: number;
    totalShipping: number;
    totalCost: number;
    totalPrice: number;
    totalAncMargin: number;
    totalBond: number;
    grandTotal: number;
    totalSqFt: number;
  };
}

// RESERVED: Intelligence Mode Phase C — calculateExcelPricing
// Excel-based pricing calculation logic kept for future Intelligence Mode build-out.

// RESERVED: Intelligence Mode Phase C — exportExcelPricingToCSV
// CSV export logic kept for future Intelligence Mode build-out.
