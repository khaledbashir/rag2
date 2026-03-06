/**
 * Maps EstimatorAnswers (Budget builder) → ScopingWorkbookOptions
 * so both Budget and RFP exports call the same generateScopingWorkbook.
 *
 * This is the unification bridge: one generator, two entry points.
 */

import type { EstimatorAnswers, DisplayAnswers } from "@/app/components/estimator/questions";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import type { ScopingWorkbookOptions } from "./generateScopingWorkbook";
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

  // Map all displays (base + alt pitch variants)
  const specs: ExtractedLEDSpec[] = [];
  for (const d of answers.displays) {
    specs.push(mapDisplay(d, env));
    specs.push(...mapAltPitchVariants(d, env));
  }

  // Map install complexity from first display (or default)
  const firstComplexity = answers.displays[0]?.installComplexity || "standard";
  const complexityMap: Record<string, InstallComplexity> = {
    simple: "simple",
    standard: "standard",
    complex: "complex",
    heavy: "heavy",
  };
  const installComplexity: InstallComplexity = complexityMap[firstComplexity] || "standard";

  return {
    project: mapProject(answers),
    specs,
    requirements: [],
    pricedDisplays: undefined, // Will be computed by generateScopingWorkbook from specs
    zoneClass: undefined,
    installComplexity,
    includeBond: (answers.bondRate ?? 1.5) > 0,
    currency: answers.currency || "USD",
    paymentTerms: "Net 30",
  };
}
