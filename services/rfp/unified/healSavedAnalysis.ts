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
  project?: unknown;
}

export function needsWestfieldReextract(analysis: SavedAnalysisLike): boolean {
  const signature = [analysis.filename, analysis.projectName, analysis.venue].filter(Boolean).join(" ");
  if (!/rise_wtc|westfield|world trade center/i.test(signature)) return false;

  // Don't re-extract if already healed — prevents the re-extraction loop
  // that overwrites correct pitch values with AI-extracted wrong values
  const project = (typeof analysis.project === "object" && analysis.project) ? analysis.project as Record<string, unknown> : {};
  if (project._healedAt) return false;

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

/**
 * Preserve known-good pitch values from existing screens into re-extracted screens.
 * The AI extraction sometimes confuses mesh pitch (3.9mm) with LED pixel pitch (2.5mm).
 * For screens that match by name, keep the original pitch if the new one differs.
 */
export function preservePitchFromOriginal(
  newScreens: ExtractedLEDSpec[],
  originalScreens: ExtractedLEDSpec[],
): ExtractedLEDSpec[] {
  const originalByName = new Map<string, ExtractedLEDSpec>();
  for (const s of originalScreens) {
    const key = s.name.toLowerCase().trim();
    if (key && s.pixelPitchMm && s.pixelPitchMm > 0) {
      originalByName.set(key, s);
    }
  }

  return newScreens.map((s) => {
    const key = s.name.toLowerCase().trim();
    const original = originalByName.get(key);
    if (original && original.pixelPitchMm && original.pixelPitchMm > 0) {
      // Keep original pitch — it was validated by the user/system
      return { ...s, pixelPitchMm: original.pixelPitchMm };
    }
    return s;
  });
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
