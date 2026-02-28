/**
 * Unified RFP Analysis Pipeline — Orchestrator
 *
 * Single entry point. Replaces pdf-triage, pdf-filter, and rfp/process.
 *
 * Flow:
 *   1. Upload PDF → Mistral OCR (structured markdown per page)
 *   2. Classify every page (text heuristics on clean markdown)
 *   3. Drawing pages → render thumbnails + Gemini vision analysis
 *   4. Text pages with LED relevance → Gemini spec extraction
 *   5. Merge all specs, deduplicate, return unified result
 */

import { extractWithMistral, type MistralOcrPage } from "./mistralOcrClient";
import { classifyAllPages, getPagesNeedingVision } from "./pageClassifier";
import { analyzeDrawings, extractSpecsFromText } from "./geminiVision";
import { isLlamaVisionAvailable, extractSpecsWithLlama } from "./llamaVision";
import type {
  RFPAnalysisResult,
  AnalyzedPage,
  ExtractedLEDSpec,
  ExtractedProjectInfo,
  AnalysisPipelineOptions,
} from "./types";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function analyzeRfp(
  files: Array<{ buffer: Buffer; filename: string }>,
  options: AnalysisPipelineOptions = {},
): Promise<RFPAnalysisResult> {
  const startTime = Date.now();
  const {
    skipVision = false,
    relevanceThreshold = 0,
    maxPages,
    generateThumbnails = true,
    onProgress,
  } = options;

  const allPages: AnalyzedPage[] = [];
  const fileStats: RFPAnalysisResult["files"] = [];
  let totalMistralPages = 0;
  let totalGeminiPages = 0;

  // =========================================================================
  // STEP 1: Mistral OCR — extract structured markdown from all files
  // =========================================================================

  onProgress?.({
    stage: "ocr",
    percent: 10,
    message: "Extracting text with Mistral OCR...",
  });

  let globalPageOffset = 0;

  for (const file of files) {
    try {
      const ocrResult = await extractWithMistral(file.buffer, file.filename);

      let pages = ocrResult.pages;
      if (maxPages) {
        pages = pages.slice(0, maxPages - globalPageOffset);
      }

      totalMistralPages += pages.length;
      fileStats.push({
        filename: file.filename,
        pageCount: pages.length,
        sizeBytes: file.buffer.length,
      });

      // Classify each page
      const classified = classifyAllPages(pages);

      // Offset page numbers for multi-file
      for (const page of classified) {
        page.pageNumber += globalPageOffset;
        page.index += globalPageOffset;
        allPages.push(page);
      }

      globalPageOffset += pages.length;
    } catch (err) {
      console.error(`[AnalyzeRFP] Failed to process ${file.filename}:`, err);
      fileStats.push({
        filename: file.filename,
        pageCount: 0,
        sizeBytes: file.buffer.length,
      });
    }
  }

  onProgress?.({
    stage: "classifying",
    percent: 40,
    message: `Classified ${allPages.length} pages`,
    totalPages: allPages.length,
  });

  // =========================================================================
  // STEP 2: Generate thumbnails for drawing pages (if needed for vision)
  // =========================================================================

  const drawingPages = getPagesNeedingVision(allPages);
  let pageImages: Map<number, string> = new Map();

  if (!skipVision && drawingPages.length > 0 && generateThumbnails) {
    onProgress?.({
      stage: "vision",
      percent: 50,
      message: `Analyzing ${drawingPages.length} drawing pages with AI vision...`,
    });

    // Render drawing pages to images for Gemini
    // We use pdfjs-dist on the client side, but server-side we need
    // the images passed in. For the API route, the client will render
    // and send base64 images for drawing pages.
    // If no images provided, skip vision (text-only analysis).
  }

  // =========================================================================
  // STEP 3: Gemini vision analysis for drawing pages
  // =========================================================================

  let analyzedDrawings: AnalyzedPage[] = [];
  if (!skipVision && drawingPages.length > 0 && pageImages.size > 0) {
    analyzedDrawings = await analyzeDrawings(drawingPages, pageImages);
    totalGeminiPages = analyzedDrawings.filter((p) => p.visionAnalyzed).length;

    // Merge vision results back into allPages
    for (const analyzed of analyzedDrawings) {
      const idx = allPages.findIndex((p) => p.index === analyzed.index);
      if (idx !== -1) {
        allPages[idx] = analyzed;
      }
    }
  }

  // =========================================================================
  // STEP 4: Extract LED specs from text-heavy relevant pages
  // =========================================================================

  onProgress?.({
    stage: "extracting",
    percent: 70,
    message: "Extracting LED display specifications...",
  });

  // Get all pages with relevance above threshold
  const relevantTextPages = allPages.filter(
    (p) =>
      p.relevance >= Math.max(relevanceThreshold, 30) &&
      p.category !== "drawing" &&
      p.category !== "legal" &&
      p.category !== "boilerplate" &&
      p.markdown.trim().length > 50,
  );

  let textSpecs: ExtractedLEDSpec[] = [];
  let projectInfo: any = null;

  if (relevantTextPages.length > 0) {
    // Primary: Gemini spec extraction
    try {
      const textResult = await extractSpecsFromText(relevantTextPages);
      textSpecs = textResult.screens;
      projectInfo = textResult.project;
    } catch (geminiErr) {
      console.error("[AnalyzeRFP] Gemini spec extraction failed:", geminiErr);
    }

    // Fallback: If Gemini returned nothing and Llama Vision is available, try Llama
    if (textSpecs.length === 0 && isLlamaVisionAvailable()) {
      console.log("[AnalyzeRFP] Gemini returned 0 specs — falling back to Llama Vision");
      onProgress?.({
        stage: "extracting",
        percent: 75,
        message: "Retrying extraction with Llama Vision fallback...",
      });
      try {
        const llamaResult = await extractSpecsWithLlama(relevantTextPages);
        textSpecs = llamaResult.screens;
        if (!projectInfo) projectInfo = llamaResult.project;
        if (textSpecs.length > 0) {
          console.log(`[AnalyzeRFP] Llama Vision fallback found ${textSpecs.length} specs`);
        }
      } catch (llamaErr) {
        console.error("[AnalyzeRFP] Llama Vision fallback also failed:", llamaErr);
      }
    }
  }

  // =========================================================================
  // STEP 5: Merge specs from drawings + text, deduplicate
  // =========================================================================

  onProgress?.({
    stage: "extracting",
    percent: 90,
    message: "Merging and deduplicating specs...",
  });

  // Collect specs from vision-analyzed drawing pages
  const drawingSpecs: ExtractedLEDSpec[] = allPages
    .filter((p) => p.extractedSpecs && p.extractedSpecs.length > 0)
    .flatMap((p) => p.extractedSpecs!);

  // Filter ghost entries (section headers with no specs), then deduplicate
  const filteredSpecs = [...textSpecs, ...drawingSpecs].filter((s) => {
    const hasSpec = s.widthFt != null || s.heightFt != null ||
      s.pixelPitchMm != null || s.brightnessNits != null ||
      s.widthPx != null || s.heightPx != null;
    if (!hasSpec) console.log(`[analyzeRfp] Dropping "${s.name}" — no physical specs`);
    return hasSpec;
  });
  const allSpecs = deduplicateSpecs(filteredSpecs);

  // =========================================================================
  // STEP 6: Build project info
  // =========================================================================

  const project = buildProjectInfo(projectInfo, allPages);

  // =========================================================================
  // STEP 7: Compute accuracy and return
  // =========================================================================

  const highConfidence = allSpecs.filter((s) => s.confidence >= 0.8).length;
  const accuracy: "High" | "Standard" | "Low" =
    allSpecs.length === 0
      ? "Low"
      : highConfidence / allSpecs.length >= 0.7
        ? "High"
        : highConfidence / allSpecs.length >= 0.4
          ? "Standard"
          : "Low";

  onProgress?.({
    stage: "complete",
    percent: 100,
    message: `Found ${allSpecs.length} LED displays across ${allPages.length} pages`,
    totalPages: allPages.length,
  });

  return {
    pages: relevanceThreshold > 0
      ? allPages.filter((p) => p.relevance >= relevanceThreshold)
      : allPages,
    screens: allSpecs,
    project,
    stats: {
      totalPages: allPages.length,
      relevantPages: allPages.filter((p) => p.relevance >= 50).length,
      drawingPages: allPages.filter((p) => p.category === "drawing").length,
      specsFound: allSpecs.length,
      extractionAccuracy: accuracy,
      processingTimeMs: Date.now() - startTime,
      mistralPagesProcessed: totalMistralPages,
      geminiPagesProcessed: totalGeminiPages,
    },
    files: fileStats,
  };
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicateSpecs(specs: ExtractedLEDSpec[]): ExtractedLEDSpec[] {
  if (specs.length === 0) return [];

  const deduped: ExtractedLEDSpec[] = [];

  for (const spec of specs) {
    // Check if we already have a spec with the same name
    const existing = deduped.find(
      (d) =>
        normalizeName(d.name) === normalizeName(spec.name) &&
        d.environment === spec.environment,
    );

    if (existing) {
      // Merge: keep the higher-confidence version, fill in missing fields
      if (spec.confidence > existing.confidence) {
        // New spec is better — use it as base, fill from existing
        const merged = { ...spec };
        merged.widthFt ??= existing.widthFt;
        merged.heightFt ??= existing.heightFt;
        merged.widthPx ??= existing.widthPx;
        merged.heightPx ??= existing.heightPx;
        merged.pixelPitchMm ??= existing.pixelPitchMm;
        merged.brightnessNits ??= existing.brightnessNits;
        merged.serviceType ??= existing.serviceType;
        merged.mountingType ??= existing.mountingType;
        merged.maxPowerW ??= existing.maxPowerW;
        merged.weightLbs ??= existing.weightLbs;
        merged.sourcePages = [
          ...new Set([...merged.sourcePages, ...existing.sourcePages]),
        ];
        // Replace existing
        const idx = deduped.indexOf(existing);
        deduped[idx] = merged;
      } else {
        // Existing is better — fill missing from new
        existing.widthFt ??= spec.widthFt;
        existing.heightFt ??= spec.heightFt;
        existing.widthPx ??= spec.widthPx;
        existing.heightPx ??= spec.heightPx;
        existing.pixelPitchMm ??= spec.pixelPitchMm;
        existing.brightnessNits ??= spec.brightnessNits;
        existing.serviceType ??= spec.serviceType;
        existing.mountingType ??= spec.mountingType;
        existing.maxPowerW ??= spec.maxPowerW;
        existing.weightLbs ??= spec.weightLbs;
        existing.sourcePages = [
          ...new Set([...existing.sourcePages, ...spec.sourcePages]),
        ];
      }
    } else {
      deduped.push({ ...spec });
    }
  }

  return deduped;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Project info builder
// ---------------------------------------------------------------------------

function buildProjectInfo(
  aiProject: any,
  pages: AnalyzedPage[],
): ExtractedProjectInfo {
  if (aiProject) {
    return {
      clientName: aiProject.client_name ?? null,
      projectName: aiProject.project_name ?? null,
      venue: aiProject.venue ?? null,
      location: aiProject.location ?? null,
      isOutdoor: aiProject.is_outdoor ?? false,
      isUnionLabor: aiProject.is_union ?? false,
      bondRequired: aiProject.bond_required ?? false,
      specialRequirements: aiProject.special_requirements || [],
      schedulePhases: [],
    };
  }

  // Fallback: try to extract from page content
  return {
    clientName: null,
    projectName: null,
    venue: null,
    location: null,
    isOutdoor: false,
    isUnionLabor: false,
    bondRequired: false,
    specialRequirements: [],
    schedulePhases: [],
  };
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export type { RFPAnalysisResult, AnalyzedPage, ExtractedLEDSpec } from "./types";
