/**
 * Validation — builds the PricingValidationReport from parser results.
 */

import { PricingValidationReport } from "@/types/pricing";

export function buildValidationReport(input: {
  strict: boolean;
  errors: string[];
  warnings: string[];
  marginSheetDetected: string | null;
  headerRowIndex: number | null;
  sectionCount: number;
  respMatrixSheetCandidates: string[];
  respMatrixSheetUsed: string | null;
  respMatrixCategoryCount: number;
}): PricingValidationReport {
  return {
    status: input.errors.length > 0 ? "FAIL" : "PASS",
    strict: input.strict,
    errors: input.errors,
    warnings: input.warnings,
    evidence: {
      marginSheetDetected: input.marginSheetDetected,
      headerRowIndex: input.headerRowIndex,
      sectionCount: input.sectionCount,
      respMatrixSheetCandidates: input.respMatrixSheetCandidates,
      respMatrixSheetUsed: input.respMatrixSheetUsed,
      respMatrixCategoryCount: input.respMatrixCategoryCount,
    },
  };
}
