/**
 * Maps EstimatorAnswers (Budget builder) → ScopingWorkbookOptions
 * so both Budget and RFP exports call the same generateScopingWorkbook.
 *
 * This is the unification bridge: one generator, two entry points.
 */

import type { EstimatorAnswers, DisplayAnswers } from "@/app/components/estimator/questions";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import type { ScopingWorkbookOptions, FinancialOverrides } from "./generateScopingWorkbook";
import type { InstallComplexity } from "@/services/rfp/productCatalog";

// ---------------------------------------------------------------------------
// Display mapping: DisplayAnswers → ExtractedLEDSpec
// ---------------------------------------------------------------------------

function mapDisplay(d: DisplayAnswers, env: "indoor" | "outdoor"): ExtractedLEDSpec {
  const pitch = parseFloat(d.pixelPitch) || null;
  const widthFt = d.widthFt || null;
  const heightFt = d.heightFt || null;

  // Compute pixel resolution from pitch + physical size
  const widthPx = pitch && widthFt ? Math.round((widthFt * 304.8) / pitch) : null;
  const heightPx = pitch && heightFt ? Math.round((heightFt * 304.8) / pitch) : null;

  return {
    name: d.displayName || d.displayType || "Unnamed Display",
    location: d.locationType || "",
    widthFt,
    heightFt,
    widthPx,
    heightPx,
    pixelPitchMm: pitch,
    brightnessNits: null,
    environment: env,
    quantity: 1,
    serviceType: (d.serviceType as "front" | "rear" | "top") || null,
    mountingType: null,
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
    const spec = mapDisplay({ ...d, pixelPitch: altPitch }, env);
    spec.name = `${d.displayName || d.displayType} — Alt ${altPitch}mm`;
    spec.isAlternate = true;
    spec.alternateDescription = `Alternate pixel pitch: ${altPitch}mm (base: ${d.pixelPitch}mm)`;
    return spec;
  });
}

// ---------------------------------------------------------------------------
// Project mapping: EstimatorAnswers → ExtractedProjectInfo
// ---------------------------------------------------------------------------

function mapProject(answers: EstimatorAnswers): ExtractedProjectInfo {
  return {
    clientName: answers.clientName || null,
    projectName: answers.projectName || null,
    venue: null,
    location: answers.location || null,
    isOutdoor: !answers.isIndoor,
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
  const env: "indoor" | "outdoor" = answers.isIndoor ? "indoor" : "outdoor";

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
  };
}
