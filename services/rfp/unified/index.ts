/**
 * Unified RFP Analysis Pipeline — Public API
 */

export { analyzeRfp } from "./analyzeRfp";
export { extractWithMistral, extractSinglePage, mistralOcrHealthCheck } from "./mistralOcrClient";
export { classifyAllPages, getPagesNeedingVision } from "./pageClassifier";
export { extractLEDSpecs, extractLEDSpecsBatched } from "./specExtractor";
export { isLlamaVisionAvailable, llamaVisionHealthCheck, analyzeDrawingWithLlama, extractSpecsWithLlama } from "./llamaVision";

export type {
  RFPAnalysisResult,
  AnalyzedPage,
  ExtractedLEDSpec,
  ExtractedProjectInfo,
  ExtractedRequirement,
  RequirementCategory,
  RequirementStatus,
  AnalysisPipelineOptions,
  AnalysisProgress,
  PageCategory,
} from "./types";
