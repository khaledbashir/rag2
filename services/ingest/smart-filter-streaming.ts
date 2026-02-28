/**
 * Smart Filter Streaming Parser
 * Handles 2,500+ page PDFs by processing in chunks and keeping best pages
 * 
 * Strategy: Tournament-style parsing
 * - Process 300 pages at a time
 - Score each page in chunk
 * - Keep top 50 from each chunk
 * - Final round: Keep best 150 overall
 */

import { smartFilterPdf, FilterResult } from "./smart-filter";

export interface StreamingFilterOptions {
  chunkSize?: number;      // Pages per chunk (default: 300)
  topPerChunk?: number;    // Pages to keep from each chunk (default: 50)
  finalMaxPages?: number;  // Final output size (default: 150)
  maxChars?: number;       // Max characters in output (default: 450k)
}

interface PageScore {
  pageNumber: number;
  text: string;
  score: number;
  isDrawingCandidate: boolean;
  isMustKeep: boolean;
  chunkIndex: number;
}

/**
 * Parse PDF in chunks and extract text for specific page ranges
 * Uses pdf-parse with page range options if available, falls back to estimation
 */
async function parsePdfChunk(
  fullText: string,
  startPage: number,
  endPage: number,
  totalPages: number
): Promise<string> {
  const estimatedTotalPages = totalPages || Math.max(1, Math.ceil(fullText.length / 3000));
  const charsPerPage = Math.ceil(fullText.length / estimatedTotalPages);

  const startChar = (startPage - 1) * charsPerPage;
  const endChar = Math.min(endPage * charsPerPage, fullText.length);

  return fullText.slice(startChar, endChar);
}

/**
 * Score a single page of text
 */
function scorePage(
  text: string,
  pageNumber: number,
  chunkIndex: number
): PageScore {
  const lowerText = text.toLowerCase();
  let score = 0;
  let isMustKeep = false;

  // MUST_KEEP phrases (+25, auto-keep)
  const mustKeepPhrases = [
    "11 06 60", "11.06.60", "110660",
    "11 63 10", "11.63.10", "116310",
    "11 63 11", "11.63.11", "116311",
    "section 11", "division 11",
    "led display schedule", "display schedule",
    "schedule of displays", "av schedule",
    "exhibit b", "cost schedule", "bid form",
    "exhibit a",
    "thornton tomasetti", "tte",
    "division 26", "26 51", "sports lighting",
    "division 27", "27 41", "sound system"
  ];

  for (const phrase of mustKeepPhrases) {
    if (lowerText.includes(phrase)) {
      score += 25;
      isMustKeep = true;
      break;
    }
  }

  // Signal keywords (+6 each)
  const signalKeywords = [
    "schedule", "pricing", "bid form", "display", "led", "specification",
    "technical", "qty", "quantity", "pixel pitch", "resolution", "nits", "brightness",
    "cabinet", "module", "diode", "refresh rate", "viewing angle", "warranty",
    "spare parts", "maintenance", "structural", "steel", "weight", "lbs", "kg",
    "power", "voltage", "amps", "circuit", "data", "fiber", "cat6",
    "division 27", "division 26", "section 11", "active area", "dimensions"
  ];

  for (const kw of signalKeywords) {
    if (lowerText.includes(kw)) score += 6;
  }

  // Noise keywords (-3 each)
  const noiseKeywords = [
    "indemnification", "insurance", "liability", "termination", "arbitration",
    "force majeure", "governing law", "jurisdiction", "severability", "waiver",
    "confidentiality", "intellectual property", "compliance", "equal opportunity",
    "harassment", "drug-free", "background check"
  ];

  for (const kw of noiseKeywords) {
    if (lowerText.includes(kw)) score -= 3;
  }

  // Measurements detected (+8)
  const hasMeasurements =
    /\b\d+(\.\d+)?\s?(ft|feet|in|inch|inches|mm|cm|m|v|vac|amp|amps|hz|w|kw)\b/i.test(text) ||
    /\b\d{2,4}\s?x\s?\d{2,4}\b/i.test(text) ||
    /\b\d+(\.\d+)?\s?'\s?[x×]\s?\d+(\.\d+)?\s?'\b/i.test(text);
  if (hasMeasurements) score += 8;

  // Drawing detection (+15)
  const looksLikeDrawing =
    text.trim().length < 350 &&
    (lowerText.includes("scale") ||
      lowerText.includes("detail") ||
      lowerText.includes("elevation") ||
      lowerText.includes("section") ||
      lowerText.includes("plan") ||
      lowerText.includes("drawing") ||
      lowerText.includes("dwg") ||
      /\bav-\d+/i.test(text) ||
      (lowerText.includes("sheet") && (lowerText.includes("of") || /\d+/.test(text))));

  const isDrawingCandidate = looksLikeDrawing;
  if (isDrawingCandidate) score += 15;

  return {
    pageNumber,
    text,
    score,
    isDrawingCandidate,
    isMustKeep,
    chunkIndex
  };
}

/**
 * Streaming Smart Filter
 * Processes large PDFs in chunks, keeps best pages tournament-style
 */
export async function smartFilterStreaming(
  fileBuffer: Buffer,
  totalPages: number,
  options: StreamingFilterOptions = {}
): Promise<FilterResult> {
  const {
    chunkSize = 300,
    topPerChunk = 50,
    finalMaxPages = 150,
    maxChars = 450_000
  } = options;

  console.log(`[StreamingFilter] Starting tournament parse: ${totalPages} pages, chunk size ${chunkSize}`);

  // Phase 1: Parse full text via Kreuzberg
  const { extractText } = await import("@/services/kreuzberg/kreuzbergClient");
  const result = await extractText(fileBuffer, "document.pdf");
  const fullText = result.text;

  // Calculate actual page count
  const actualTotalPages = totalPages || Math.max(1, Math.ceil(fullText.length / 3000));
  const charsPerPage = Math.ceil(fullText.length / actualTotalPages);

  console.log(`[StreamingFilter] Total chars: ${fullText.length}, Estimated chars/page: ${charsPerPage}`);

  // Phase 2: Process in chunks (tournament rounds)
  const allScoredPages: PageScore[] = [];
  const numChunks = Math.ceil(actualTotalPages / chunkSize);

  for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
    const startPage = chunkIndex * chunkSize + 1;
    const endPage = Math.min((chunkIndex + 1) * chunkSize, actualTotalPages);
    
    console.log(`[StreamingFilter] Processing chunk ${chunkIndex + 1}/${numChunks}: pages ${startPage}-${endPage}`);

    // Extract text for this chunk
    const startChar = (startPage - 1) * charsPerPage;
    const endChar = Math.min(endPage * charsPerPage, fullText.length);
    const chunkText = fullText.slice(startChar, endChar);
    const chunkCharsPerPage = Math.ceil(chunkText.length / (endPage - startPage + 1));

    // Score each page in chunk
    const chunkPages: PageScore[] = [];
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const pageStart = (pageNum - startPage) * chunkCharsPerPage;
      const pageEnd = Math.min(pageStart + chunkCharsPerPage, chunkText.length);
      const pageText = chunkText.slice(pageStart, pageEnd);
      
      const scored = scorePage(pageText, pageNum, chunkIndex);
      chunkPages.push(scored);
    }

    // Keep top pages from this chunk
    const topPages = chunkPages
      .sort((a, b) => b.score - a.score)
      .slice(0, topPerChunk);

    console.log(`[StreamingFilter] Chunk ${chunkIndex + 1}: Top score ${topPages[0]?.score || 0}, keeping ${topPages.length} pages`);
    
    allScoredPages.push(...topPages);
  }

  // Phase 3: Final tournament - keep best pages overall
  console.log(`[StreamingFilter] Final round: ${allScoredPages.length} candidates, keeping top ${finalMaxPages}`);

  // Separate must-keep and scored pages
  const mustKeepPages = allScoredPages.filter(p => p.isMustKeep);
  const restPages = allScoredPages.filter(p => !p.isMustKeep);

  // Sort by score and take top pages
  const sortedRest = restPages.sort((a, b) => b.score - a.score);
  const restSlots = Math.max(0, finalMaxPages - mustKeepPages.length);
  
  const finalPages = [
    ...mustKeepPages,
    ...sortedRest.slice(0, restSlots)
  ].sort((a, b) => a.pageNumber - b.pageNumber);

  // Build filtered text
  const drawingCandidates = finalPages
    .filter(p => p.isDrawingCandidate)
    .map(p => p.pageNumber);

  let filteredContent = `SMART_FILTER_STREAMING\nTOTAL_PAGES=${actualTotalPages}\nRETAINED_PAGES=${finalPages.length}\nCHUNKS_PROCESSED=${numChunks}\nPAGES=${finalPages.map(p => p.pageNumber).join(",")}\n\n`;
  let used = filteredContent.length;

  for (const p of finalPages) {
    const block = `--- PAGE ${p.pageNumber} (Score: ${p.score}, Chunk: ${p.chunkIndex + 1}) ---\n${p.text}\n\n`;
    if (used + block.length > maxChars) break;
    filteredContent += block;
    used += block.length;
  }

  console.log(`[StreamingFilter] Complete: Retained ${finalPages.length} pages, ${drawingCandidates.length} drawing candidates`);

  return {
    fullText,
    filteredText: filteredContent,
    retainedPages: finalPages.length,
    totalPages: actualTotalPages,
    drawingCandidates
  };
}

/**
 * Auto-detect if streaming is needed based on page count
 */
export function shouldUseStreaming(totalPages: number): boolean {
  return totalPages > 300;
}
