/**
 * Maps EstimatorAnswers (Budget builder) → ScopingWorkbookOptions
 * so both Budget and RFP exports call the same generateScopingWorkbook.
 *
 * This is the unification bridge: one generator, two entry points.
 */

import type { EstimatorAnswers, DisplayAnswers } from "@/app/components/estimator/questions";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import type { ScopingWorkbookOptions, FinancialOverrides } from "./generateScopingWorkbook";
import { type InstallComplexity, getProduct } from "@/services/rfp/productCatalog";

const DISPLAY_TYPE_LABELS: Record<string, string> = {
  "main-scoreboard": "Main Scoreboard",
  "center-hung": "Center-Hung",
  "ribbon-board": "Ribbon Board",
  "fascia-board": "Fascia Board",
  "concourse-display": "Concourse Display",
  "end-zone": "End Zone Board",
  marquee: "Marquee",
  auxiliary: "Auxiliary Board",
  "pitch-clock": "Pitch Clock",
  "shot-clock": "Shot Clock",
  custom: "Custom Display",
};

const LOCATION_TYPE_LABELS: Record<string, string> = {
  scoreboard: "Scoreboard / Center-Hung",
  ribbon: "Ribbon Board",
  fascia: "Fascia Board",
  wall: "Wall Mounted",
  freestanding: "Freestanding",
  outdoor: "Outdoor",
  courtside: "Courtside",
  stanchion: "Stanchion",
};

function humanizeType(value: string | null | undefined): string | null {
  if (!value) return null;
  return DISPLAY_TYPE_LABELS[value] || LOCATION_TYPE_LABELS[value] || value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

// ---------------------------------------------------------------------------
// Display mapping: DisplayAnswers → ExtractedLEDSpec
// ---------------------------------------------------------------------------

function mapDisplay(d: DisplayAnswers, env: "indoor" | "outdoor"): ExtractedLEDSpec {
  const pitch = parseFloat(d.pixelPitch) || null;
  let widthFt = d.widthFt || null;
  let heightFt = d.heightFt || null;

  // Snap dimensions to actual cabinet sizes when a product is selected
  // LED cabinets come in fixed sizes — actual display dimensions are always
  // multiples of the cabinet (or module) size, not the user's round numbers.
  if (widthFt && heightFt && d.productId) {
    const prod = getProduct(d.productId);
    if (prod?.defaultCabinet) {
      const unitW = prod.defaultCabinet.widthMm;
      const unitH = prod.defaultCabinet.heightMm;
      const cols = Math.max(1, Math.round((widthFt * 304.8) / unitW));
      const rows = Math.max(1, Math.round((heightFt * 304.8) / unitH));
      widthFt = Math.round((cols * unitW) / 304.8 * 10000) / 10000;
      heightFt = Math.round((rows * unitH) / 304.8 * 10000) / 10000;
    }
  }

  // Compute pixel resolution from pitch + physical size
  const widthPx = pitch && widthFt ? Math.round((widthFt * 304.8) / pitch) : null;
  const heightPx = pitch && heightFt ? Math.round((heightFt * 304.8) / pitch) : null;
  const displayLabel = d.displayName?.trim() || humanizeType(d.displayType) || "Unnamed Display";
  const mountingLabel = humanizeType(d.locationType);

  return {
    name: displayLabel,
    location: d.locationType || "",
    widthFt,
    heightFt,
    widthPx,
    heightPx,
    pixelPitchMm: pitch,
    brightnessNits: d.productId ? (getProduct(d.productId)?.brightnessNits ?? null) : null,
    environment: env,
    quantity: d.quantity || 1,
    serviceType: (d.serviceType as "front" | "rear" | "top") || null,
    mountingType: mountingLabel,
    maxPowerW: null,
    weightLbs: null,
    specialRequirements: [],
    confidence: 1.0,
    sourcePages: [],
    sourceType: "text",
    citation: "Budget Estimator",
    notes: null,
    isAlternate: false,
    selectedProductId: d.productId || null,
    selectedProductName: d.productName || null,
  };
}

// ---------------------------------------------------------------------------
// Alt pitch variants: DisplayAnswers with altPitches → additional ExtractedLEDSpec[]
// ---------------------------------------------------------------------------

function mapAltPitchVariants(d: DisplayAnswers, env: "indoor" | "outdoor"): ExtractedLEDSpec[] {
  if (!d.altPitches || d.altPitches.length === 0) return [];

  return d.altPitches.map((altPitch) => {
    // Clear base product — alt pitch needs its own product resolution via pitch lookup
    const spec = mapDisplay({ ...d, pixelPitch: altPitch, productId: "", productName: "" }, env);
    spec.name = `${d.displayName?.trim() || humanizeType(d.displayType) || "Unnamed Display"} — Alt ${altPitch}mm`;
    spec.isAlternate = true;
    spec.alternateDescription = `Alternate pixel pitch: ${altPitch}mm (base: ${d.pixelPitch}mm)`;
    return spec;
  });
}

// ---------------------------------------------------------------------------
// Project mapping: EstimatorAnswers → ExtractedProjectInfo
// ---------------------------------------------------------------------------

function mapProject(answers: EstimatorAnswers): ExtractedProjectInfo {
  // Explicit boolean coercion: guard against string "false" from JSON/form state
  const isIndoor = answers.isIndoor === true || answers.isIndoor === "true" as unknown as boolean;
  return {
    clientName: answers.clientName || null,
    projectName: answers.projectName || null,
    venue: null,
    location: answers.location || null,
    isOutdoor: !isIndoor,
    isUnionLabor: answers.isUnion,
    bondRequired: (answers.bondRate ?? 1.5) > 0,
    specialRequirements: [],
    schedulePhases: [],
  };
}

// ---------------------------------------------------------------------------
// Main mapper: EstimatorAnswers → ScopingWorkbookOptions
// ---------------------------------------------------------------------------

export function mapEstimatorToScoping(answers: EstimatorAnswers): ScopingWorkbookOptions {
  // Explicit boolean coercion: guard against string "false" from JSON/form state
  const isIndoor = answers.isIndoor === true || answers.isIndoor === "true" as unknown as boolean;
  const env: "indoor" | "outdoor" = isIndoor ? "indoor" : "outdoor";

  const complexityMap: Record<string, InstallComplexity> = {
    simple: "simple",
    standard: "standard",
    complex: "complex",
    heavy: "heavy",
  };

  // Map all displays (base + alt pitch variants)
  const specs: ExtractedLEDSpec[] = [];
  const perDisplayComplexity: InstallComplexity[] = [];
  const perDisplayCostOverrides: Array<Record<string, number> | undefined> = [];
  for (const d of answers.displays) {
    specs.push(mapDisplay(d, env));
    perDisplayComplexity.push(complexityMap[d.installComplexity] || "standard");
    perDisplayCostOverrides.push(d.costOverrides && Object.keys(d.costOverrides).length > 0 ? d.costOverrides : undefined);
    // Alt pitch variants inherit parent complexity
    const alts = mapAltPitchVariants(d, env);
    specs.push(...alts);
    for (const _a of alts) {
      perDisplayComplexity.push(complexityMap[d.installComplexity] || "standard");
      perDisplayCostOverrides.push(undefined);
    }
  }

  // Default install complexity = first display (used for Install sheet section headers)
  const firstComplexity = complexityMap[answers.displays[0]?.installComplexity || "standard"] || "standard";

  // Financial overrides — carry user-configured settings into the workbook
  const overrides: FinancialOverrides = {
    ledMarginPct: answers.ledMargin != null ? answers.ledMargin / 100 : undefined,
    servicesMarginPct: answers.servicesMargin != null ? answers.servicesMargin / 100 : undefined,
    taxRate: answers.salesTaxRate != null ? answers.salesTaxRate / 100 : undefined,
    bondRate: answers.bondRate != null ? answers.bondRate / 100 : undefined,
    costPerSqFtOverride: (answers.costPerSqFtOverride ?? 0) > 0 ? answers.costPerSqFtOverride : undefined,
    pmComplexity: (answers.pmComplexity as FinancialOverrides["pmComplexity"]) || undefined,
    cmsAllocation: answers.includeCms ? (answers.cmsAllocation || 0) : undefined,
    scoringAllocation: answers.includeScoring ? (answers.scoringAllocation || 0) : undefined,
    venueServiceYears: answers.includeVenueServices ? (parseInt(answers.venueServiceYears || "1", 10) || 1) : undefined,
    venueServiceAnnualFee: answers.includeVenueServices ? (answers.venueServiceAnnualFee || 0) : undefined,
    venueServiceEscalationPct: answers.includeVenueServices ? ((answers.venueServiceEscalationPct || 0) / 100) : undefined,
    venueServiceMarginPct: answers.includeVenueServices ? ((answers.venueServiceMarginPct || 0) / 100) : undefined,
    gameClockAllocation: answers.gameClockAllocation || undefined,
    pitchClocksAllocation: answers.pitchClocksAllocation || undefined,
    oesAllocation: answers.oesAllocation || undefined,
    miscEquipmentAllocation: answers.miscEquipmentAllocation || undefined,
    isUnionLabor: answers.isUnion || undefined,
    perDisplayComplexity,
    perDisplayCostOverrides,
  };

  return {
    project: mapProject(answers),
    specs,
    requirements: [],
    pricedDisplays: undefined,
    zoneClass: undefined,
    installComplexity: firstComplexity,
    includeBond: (answers.bondRate ?? 0) > 0,
    currency: answers.currency || "USD",
    paymentTerms: "Net 30",
    overrides,
    includeAlternatesInBase: false,
  };
}
