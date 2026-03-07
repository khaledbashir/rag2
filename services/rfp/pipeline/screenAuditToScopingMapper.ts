/**
 * Maps Intelligence/Manual Mode data (screens + internalAudit) → ScopingWorkbookOptions
 * so Intelligence Mode export can call the canonical generateScopingWorkbook().
 *
 * This is the Phase 3 unification bridge: Intelligence Mode gets the same
 * 14-tab canonical workbook as the RFP, Estimator, and Mirror paths.
 */

import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import type { ScopingWorkbookOptions, FinancialOverrides } from "./generateScopingWorkbook";
import type { PricedDisplay } from "./generateRateCardExcel";

// ─── Input types (match what the audit export route provides) ────────────────

interface IntelligenceScreen {
  name: string;
  pixelPitch: number;
  width: number;
  height: number;
  widthFt?: number;
  heightFt?: number;
  pitchMm?: number;
  quantity?: number;
  productType?: string;
  desiredMargin?: number;
  costPerSqFt?: number;
  serviceType?: string;
  internalAudit?: ScreenAuditBreakdown | null;
  [key: string]: any;
}

interface ScreenAuditBreakdown {
  name?: string;
  areaSqFt?: number;
  quantity?: number;
  pixelMatrix?: string;
  serviceType?: string;
  estimatedWeightLbs?: number;
  totalMaxPowerW?: number;
  brightnessNits?: number;
  breakdown?: {
    hardware?: number;
    structure?: number;
    install?: number;
    labor?: number;
    power?: number;
    shipping?: number;
    pm?: number;
    generalConditions?: number;
    travel?: number;
    submittals?: number;
    engineering?: number;
    permits?: number;
    cms?: number;
    demolition?: number;
    ancMargin?: number;
    sellPrice?: number;
    bondCost?: number;
    totalCost?: number;
    finalClientTotal?: number;
    salesTaxRate?: number;
    salesTaxCost?: number;
    boTaxCost?: number;
  };
}

export interface MapIntelligenceArgs {
  screens: IntelligenceScreen[];
  currency?: string;
  proposalName?: string;
  clientName?: string;
  location?: string;
  bondRateOverride?: number;
  taxRateOverride?: number;
}

// ─── Main mapper ─────────────────────────────────────────────────────────────

export function mapIntelligenceToScoping(args: MapIntelligenceArgs): ScopingWorkbookOptions {
  const { screens, currency = "USD" } = args;

  const specs: ExtractedLEDSpec[] = [];
  const pricedDisplays: PricedDisplay[] = [];

  for (let i = 0; i < screens.length; i++) {
    const s = screens[i];
    const audit = s.internalAudit;
    const b = audit?.breakdown;

    const spec = buildSpec(s, audit, i);
    specs.push(spec);

    const priced = buildPricedDisplay(s, spec, audit);
    pricedDisplays.push(priced);
  }

  const overrides = deriveOverrides(screens, args);

  const project: ExtractedProjectInfo = {
    clientName: args.clientName || null,
    projectName: args.proposalName || null,
    venue: null,
    location: args.location || null,
    isOutdoor: false,
    isUnionLabor: false,
    bondRequired: screens.some((s) => (s.internalAudit?.breakdown?.bondCost ?? 0) > 0),
    specialRequirements: [],
    schedulePhases: [],
  };

  return {
    project,
    specs,
    pricedDisplays,
    currency,
    includeBond: project.bondRequired,
    overrides,
  };
}

// ─── Spec builder ────────────────────────────────────────────────────────────

function buildSpec(s: IntelligenceScreen, audit: ScreenAuditBreakdown | null | undefined, idx: number): ExtractedLEDSpec {
  const widthFt = s.widthFt ?? s.width ?? null;
  const heightFt = s.heightFt ?? s.height ?? null;
  const pitch = s.pixelPitch ?? s.pitchMm ?? null;

  const widthPx = pitch && widthFt ? Math.round((widthFt * 304.8) / pitch) : null;
  const heightPx = pitch && heightFt ? Math.round((heightFt * 304.8) / pitch) : null;

  return {
    name: s.name || `Display ${idx + 1}`,
    location: "",
    widthFt: widthFt ? Number(widthFt) : null,
    heightFt: heightFt ? Number(heightFt) : null,
    widthPx,
    heightPx,
    pixelPitchMm: pitch ? Number(pitch) : null,
    brightnessNits: audit?.brightnessNits ?? null,
    environment: "indoor",
    quantity: s.quantity ?? audit?.quantity ?? 1,
    serviceType: (s.serviceType as "front" | "rear" | "top") || null,
    mountingType: null,
    maxPowerW: audit?.totalMaxPowerW ?? null,
    weightLbs: audit?.estimatedWeightLbs ?? null,
    specialRequirements: [],
    confidence: 1.0,
    sourcePages: [],
    sourceType: "text",
    citation: "Intelligence Mode",
    notes: null,
    isAlternate: false,
  };
}

// ─── PricedDisplay builder ───────────────────────────────────────────────────

function buildPricedDisplay(
  s: IntelligenceScreen,
  spec: ExtractedLEDSpec,
  audit: ScreenAuditBreakdown | null | undefined,
): PricedDisplay {
  const b = audit?.breakdown;
  const areaSqFt = audit?.areaSqFt ?? ((spec.widthFt ?? 0) * (spec.heightFt ?? 0));

  const hardwareCost = b?.hardware ?? 0;
  const installCost = (b?.structure ?? 0) + (b?.install ?? 0) + (b?.labor ?? 0) + (b?.power ?? 0);
  const pmCost = (b?.pm ?? 0) + (b?.generalConditions ?? 0) + (b?.travel ?? 0);
  const engCost = (b?.engineering ?? 0) + (b?.permits ?? 0) + (b?.submittals ?? 0);
  const totalCost = b?.totalCost ?? (hardwareCost + installCost + pmCost + engCost + (b?.shipping ?? 0) + (b?.cms ?? 0) + (b?.demolition ?? 0));
  const sellPrice = b?.sellPrice ?? 0;
  const marginDollars = b?.ancMargin ?? (sellPrice - totalCost);
  const blendedMarginPct = sellPrice > 0 && totalCost > 0 && totalCost < sellPrice
    ? 1 - (totalCost / sellPrice)
    : s.desiredMargin ?? 0.30;

  return {
    spec,
    quote: null,
    match: null,
    areaSqFt,
    hardwareCost,
    installCost,
    pmCost,
    engCost,
    totalCost,
    ledMarginPct: blendedMarginPct,
    svcMarginPct: Math.max(blendedMarginPct * 0.67, 0.15),
    hardwareSellingPrice: hardwareCost > 0 ? Math.round(hardwareCost / (1 - blendedMarginPct)) : 0,
    servicesSellingPrice: installCost + pmCost + engCost > 0
      ? Math.round((installCost + pmCost + engCost) / (1 - Math.max(blendedMarginPct * 0.67, 0.15)))
      : 0,
    totalSellingPrice: sellPrice || (totalCost > 0 ? Math.round(totalCost / (1 - blendedMarginPct)) : 0),
    marginDollars,
    blendedMarginPct,
    leadTimeWeeks: null,
    costSource: "rate_card",
    rateCardEstimate: null,
  };
}

// ─── Derive financial overrides ──────────────────────────────────────────────

function deriveOverrides(screens: IntelligenceScreen[], args: MapIntelligenceArgs): FinancialOverrides {
  // Derive blended margin from screens
  let totalCost = 0;
  let totalSell = 0;
  for (const s of screens) {
    const b = s.internalAudit?.breakdown;
    if (b) {
      totalCost += b.totalCost ?? 0;
      totalSell += b.sellPrice ?? 0;
    }
  }
  const ledMarginPct = totalCost > 0 && totalSell > totalCost
    ? 1 - (totalCost / totalSell)
    : undefined;

  // Tax rate: use override or derive from first screen with sales tax
  let taxRate = args.taxRateOverride != null ? args.taxRateOverride / 100 : undefined;
  if (taxRate == null) {
    for (const s of screens) {
      const rate = s.internalAudit?.breakdown?.salesTaxRate;
      if (rate != null && rate > 0) {
        taxRate = rate;
        break;
      }
    }
  }

  // Bond rate: use override or derive from first screen
  let bondRate = args.bondRateOverride != null ? args.bondRateOverride / 100 : undefined;
  if (bondRate == null) {
    for (const s of screens) {
      const b = s.internalAudit?.breakdown;
      if (b && b.bondCost && b.sellPrice && b.sellPrice > 0) {
        bondRate = b.bondCost / b.sellPrice;
        break;
      }
    }
  }

  return {
    ledMarginPct,
    servicesMarginPct: ledMarginPct != null ? Math.max(ledMarginPct * 0.67, 0.15) : undefined,
    taxRate,
    bondRate,
  };
}
