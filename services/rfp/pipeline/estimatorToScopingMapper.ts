/**
 * Maps EstimatorAnswers (Budget builder) → ScopingWorkbookOptions
 * so both Budget and RFP exports call the same generateScopingWorkbook.
 *
 * This is the unification bridge: one generator, two entry points.
 */

import type { EstimatorAnswers, DisplayAnswers } from "@/app/components/estimator/questions";
import { resolveAlternates } from "@/app/components/estimator/questions";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import type { ScopingWorkbookOptions, FinancialOverrides } from "./generateScopingWorkbook";
import { type InstallComplexity, getProduct } from "@/services/rfp/productCatalog";
import { snapDimension } from "@/services/catalog/productMatcher";

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
  const rfpWidthFt = d.rfpWidthFt || d.widthFt || null;
  const rfpHeightFt = d.rfpHeightFt || d.heightFt || null;
  const workingWidthFt = d.widthFt || null;
  const workingHeightFt = d.heightFt || null;
  let activeWidthFt = workingWidthFt;
  let activeHeightFt = workingHeightFt;
  let canPreSnap = false;

  if (workingWidthFt && workingHeightFt && d.productId) {
    const prod = getProduct(d.productId);
    if (prod?.defaultCabinet) {
      canPreSnap = true;
      const snapW = snapDimension(
        workingWidthFt * 304.8,
        prod.defaultCabinet.widthMm,
        prod.smallCabinet?.widthMm,
      );
      const snapH = snapDimension(
        workingHeightFt * 304.8,
        prod.defaultCabinet.heightMm,
        prod.smallCabinet?.heightMm,
      );
      activeWidthFt = Math.round((snapW.totalMm / 304.8) * 10000) / 10000;
      activeHeightFt = Math.round((snapH.totalMm / 304.8) * 10000) / 10000;
    }
  }

  // Courtside/stanchion: use fixed pixel specs stored on display answers; LED: formula
  // For DB-backed selected products, leave px blank here and let the shared workbook
  // generator derive them from the snapped active dims after product resolution.
  const widthPx = d.fixedWidthPx
    ?? ((!d.productId || canPreSnap) && pitch && activeWidthFt
      ? Math.round((activeWidthFt * 304.8) / pitch)
      : null);
  const heightPx = d.fixedHeightPx
    ?? ((!d.productId || canPreSnap) && pitch && activeHeightFt
      ? Math.round((activeHeightFt * 304.8) / pitch)
      : null);
  const displayLabel = d.displayName?.trim() || humanizeType(d.displayType) || "Unnamed Display";
  const mountingLabel = humanizeType(d.locationType);

  return {
    name: displayLabel,
    location: d.locationType || "",
    widthFt: rfpWidthFt,
    heightFt: rfpHeightFt,
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
    activeWidthFt,
    activeHeightFt,
    selectedProductId: d.productId || null,
    selectedProductName: d.productName || null,
  };
}

// ---------------------------------------------------------------------------
// Alternates: DisplayAnswers alternates → additional ExtractedLEDSpec[]
// An alternate may carry its own dimensions/quantity, so the scoping spec has
// to describe the size actually being bid, not the primary's.
// ---------------------------------------------------------------------------

function mapAltPitchVariants(d: DisplayAnswers, env: "indoor" | "outdoor"): ExtractedLEDSpec[] {
  const alternates = resolveAlternates(d);
  if (alternates.length === 0) return [];

  const baseName = d.displayName?.trim() || humanizeType(d.displayType) || "Unnamed Display";

  return alternates.map((alt) => {
    const widthFt = alt.widthFt && alt.widthFt > 0 ? alt.widthFt : d.widthFt;
    const heightFt = alt.heightFt && alt.heightFt > 0 ? alt.heightFt : d.heightFt;
    const quantity = alt.quantity && alt.quantity > 0 ? alt.quantity : d.quantity;
    const resized = widthFt !== d.widthFt || heightFt !== d.heightFt;

    // Clear base product — an alternate needs its own product resolution via pitch lookup
    const spec = mapDisplay(
      { ...d, pixelPitch: alt.pixelPitch, widthFt, heightFt, quantity, productId: "", productName: "" },
      env,
    );
    const suffix = alt.label?.trim()
      || (resized ? `Alt ${alt.pixelPitch}mm ${widthFt}x${heightFt}ft` : `Alt ${alt.pixelPitch}mm`);
    spec.name = `${baseName} — ${suffix}`;
    spec.isAlternate = true;
    spec.alternateDescription = resized
      ? `Alternate: ${alt.pixelPitch}mm at ${widthFt}x${heightFt} ft (base: ${d.pixelPitch}mm at ${d.widthFt}x${d.heightFt} ft)`
      : `Alternate pixel pitch: ${alt.pixelPitch}mm (base: ${d.pixelPitch}mm)`;
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
    tariffRate: answers.tariffRate != null ? answers.tariffRate / 100 : undefined,
    sponsorshipPct: answers.sponsorshipMargin != null ? answers.sponsorshipMargin / 100 : undefined,
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
  const coverAnswers = answers as EstimatorAnswers & {
    venueName?: string;
    venueAddress?: string;
    paymentTerms?: string;
    substantialCompletionDate?: string;
    changeOrders?: string;
    laborWarranty?: string;
    eventSupport?: string;
    preSeasonChecks?: string;
  };
  const warrantyYears = parseInt(coverAnswers.warrantyYears || "0", 10);

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
    coverPage: {
      venueName: coverAnswers.venueName || answers.projectName,
      venueAddress: coverAnswers.venueAddress || answers.location,
      paymentTerms: coverAnswers.paymentTerms || "50/20/20/10",
      supplyOnly: answers.servicesMargin === 0,
      substantialCompletionDate: coverAnswers.substantialCompletionDate,
      changeOrders: coverAnswers.changeOrders,
      partsWarranty: answers.includeWarranty !== "none" && Number.isFinite(warrantyYears) && warrantyYears > 0
        ? `${warrantyYears} year${warrantyYears > 1 ? "s" : ""}`
        : undefined,
      laborWarranty: coverAnswers.laborWarranty,
      eventSupport: coverAnswers.eventSupport,
      preSeasonChecks: coverAnswers.preSeasonChecks,
    },
    overrides,
    includeAlternatesInBase: false,
  };
}
