import { readFile } from "fs/promises";
import { classifyAllPages } from "./pageClassifier";
import { extractWithMistral } from "./mistralOcrClient";
import { deduplicateScreens, extractLEDSpecsBatched } from "./specExtractor";
import type { ExtractedLEDSpec, ExtractedProjectInfo, ExtractedRequirement, IncompleteSpec } from "./types";

interface SavedAnalysisLike {
  filename?: string | null;
  projectName?: string | null;
  venue?: string | null;
  pdfFilePath?: string | null;
  screens?: unknown;
}

export function needsWestfieldReextract(analysis: SavedAnalysisLike): boolean {
  const signature = [analysis.filename, analysis.projectName, analysis.venue].filter(Boolean).join(" ");
  if (!/rise_wtc|westfield|world trade center/i.test(signature)) return false;

  const screens = Array.isArray(analysis.screens) ? analysis.screens as ExtractedLEDSpec[] : [];
  const names = screens.map((s) => `${s.name} ${s.location || ""}`.toLowerCase());
  const underpassCount = names.filter((n) => /underpass/.test(n)).length;

  return (
    screens.length < 16 ||
    underpassCount < 4 ||
    !names.some((n) => /t4-b2/.test(n)) ||
    !names.some((n) => /path hall/.test(n))
  );
}

export async function reextractSavedPdfAnalysis(analysis: SavedAnalysisLike): Promise<{
  screens: ExtractedLEDSpec[];
  project: ExtractedProjectInfo;
  requirements: ExtractedRequirement[];
  incompleteSpecs: IncompleteSpec[];
}> {
  if (!analysis.pdfFilePath) {
    throw new Error("No saved PDF path available for re-extraction");
  }

  const buffer = await readFile(analysis.pdfFilePath);
  const ocrResult = await extractWithMistral(buffer, analysis.filename || "document.pdf");
  const classifiedPages = classifyAllPages(ocrResult.pages);

  const result = await extractLEDSpecsBatched(classifiedPages);

  return {
    screens: deduplicateScreens(result.screens),
    project: result.project,
    requirements: result.requirements,
    incompleteSpecs: result.incompleteSpecs,
  };
}
