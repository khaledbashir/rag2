// Master Truth: pages containing these are ALWAYS kept
const MUST_KEEP_PHRASES = [
  "11 06 60", "11.06.60", "110660",           // Display Schedule
  "11 63 10", "11.63.10", "116310",           // LED Display Systems
  "11 63 11", "11.63.11", "116311",           // LED Display Systems (WJHW format)
  "section 11", "division 11",
  "led display schedule", "display schedule",
  "schedule of displays", "av schedule",
  "exhibit b", "cost schedule", "bid form",   // WVU: pricing in Exhibit B - Cost Schedule
  "exhibit a",                                // Statement of Work / SOW (secondary target)
  "thornton tomasetti", "tte",                // Structural steel tonnage (Thornton Tomasetti / TTE)
  "division 26", "26 51", "sports lighting",  // ANC scope: Division 26 Sports Lighting
  "division 27", "27 41", "sound system"      // ANC scope: Division 27 Sound/Comms (e.g. 27 41 16.64)
];

// High-value signal (technical / pricing)
const SIGNAL_KEYWORDS = [
  "schedule", "pricing", "bid form", "display", "led", "specification",
  "technical", "qty", "quantity", "pixel pitch", "resolution", "nits", "brightness",
  "cabinet", "module", "diode", "refresh rate", "viewing angle", "warranty",
  "spare parts", "maintenance", "structural", "steel", "weight", "lbs", "kg",
  "power", "voltage", "amps", "circuit", "data", "fiber", "cat6",
  "division 27", "division 26", "section 11", "active area", "dimensions"
];

// Noise (legal/boilerplate) — still penalize so non-master-truth pages rank lower
const NOISE_KEYWORDS = [
  "indemnification", "insurance", "liability", "termination", "arbitration",
  "force majeure", "governing law", "jurisdiction", "severability", "waiver",
  "confidentiality", "intellectual property", "compliance", "equal opportunity",
  "harassment", "drug-free", "background check"
];

interface PageContent {
  pageNumber: number;
  text: string;
  score: number;
  isDrawingCandidate: boolean;
  isMustKeep?: boolean;
}

export interface FilterResult {
  fullText: string;
  filteredText: string;
  retainedPages: number;
  totalPages: number;
  drawingCandidates: number[];
}

/**
 * Smart Filter Service
 * Analyzes PDF content and filters out "noise" pages (legal, boilerplate)
 * while retaining "signal" pages (specs, pricing, drawings).
 */
/** Max pages to parse in one run; avoids OOM/timeouts on very large PDFs */
const MAX_PAGES_TO_PARSE = 300;

function buildPartialPages(totalPages: number, maxPages: number): number[] | undefined {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return undefined;
  if (totalPages <= maxPages) return undefined;

  const pages = new Set<number>();
  const clamp = (n: number) => Math.max(1, Math.min(totalPages, n));

  const startCount = Math.min(60, totalPages);
  const endCount = Math.min(60, totalPages);
  const midCount = Math.min(60, totalPages);

  for (let i = 1; i <= startCount; i++) pages.add(i);
  for (let i = totalPages - endCount + 1; i <= totalPages; i++) pages.add(clamp(i));

  const mid = Math.floor(totalPages / 2);
  const midStart = clamp(mid - Math.floor(midCount / 2));
  const midEnd = clamp(midStart + midCount - 1);
  for (let i = midStart; i <= midEnd; i++) pages.add(i);

  const target = Math.min(maxPages, totalPages);
  if (pages.size < target) {
    const stride = (totalPages - 1) / (target - 1);
    for (let k = 0; pages.size < target && k < target * 5; k++) {
      const p = clamp(1 + Math.round(k * stride));
      pages.add(p);
    }
  }

  return Array.from(pages).sort((a, b) => a - b).slice(0, Math.min(maxPages, totalPages));
}

export async function smartFilterPdf(fileBuffer: Buffer): Promise<FilterResult> {
  try {
    const { extractText } = await import("@/services/kreuzberg/kreuzbergClient");
    const result = await extractText(fileBuffer, "document.pdf");

    const totalPagesFromDoc = result.totalPages || 0;
    const fullText = result.text;

    const estimatedPages = totalPagesFromDoc || Math.max(1, Math.ceil(fullText.length / 3000));
    const charsPerPage = Math.ceil(fullText.length / estimatedPages);
    
    // Split text into page-like chunks
    const pages: PageContent[] = [];
    for (let i = 0; i < estimatedPages; i++) {
      const start = i * charsPerPage;
      const end = Math.min(start + charsPerPage, fullText.length);
      const text = fullText.slice(start, end);
      const pageNumber = i + 1;
      
      const lowerText = text.toLowerCase();
      let score = 0;
      let isMustKeep = false;

      for (const phrase of MUST_KEEP_PHRASES) {
        if (lowerText.includes(phrase)) {
          score += 25;
          isMustKeep = true;
          break;
        }
      }

      for (const kw of SIGNAL_KEYWORDS) {
        if (lowerText.includes(kw)) score += 6;
      }
      for (const kw of NOISE_KEYWORDS) {
        if (lowerText.includes(kw)) score -= 3;
      }

      const hasMeasurements =
        /\b\d+(\.\d+)?\s?(ft|feet|in|inch|inches|mm|cm|m|v|vac|amp|amps|hz|w|kw)\b/i.test(text) ||
        /\b\d{2,4}\s?x\s?\d{2,4}\b/i.test(text) ||
        /\b\d+(\.\d+)?\s?'\s?[x×]\s?\d+(\.\d+)?\s?'\b/i.test(text);
      if (hasMeasurements) score += 8;

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

      pages.push({ pageNumber, text, score, isDrawingCandidate, isMustKeep });
    }

    const totalPages = totalPagesFromDoc || pages.length;

    const drawingCandidates = pages
      .filter((p) => p.isDrawingCandidate)
      .map((p) => p.pageNumber);

    const MIN_SCORE_TO_KEEP = 8;
    // Cap how much we send to embedding (2,500-page RFP → keep only best ~100–150 pages + 450k chars)
    const MAX_PAGES_TO_KEEP = totalPages > 250 ? 100 : 150;
    const MAX_CHARS_TO_KEEP = 450_000;

    const mustKeepPages = pages.filter((p) => p.isMustKeep === true);
    const rest = pages.filter((p) => !p.isMustKeep && (p.isDrawingCandidate || p.score >= MIN_SCORE_TO_KEEP));
    const restSorted = rest.sort((a, b) => b.score - a.score);
    const restSlots = Math.max(0, MAX_PAGES_TO_KEEP - mustKeepPages.length);
    const retained = [
      ...mustKeepPages,
      ...restSorted.slice(0, restSlots)
    ].sort((a, b) => a.pageNumber - b.pageNumber);

    let filteredContent = `SMART_FILTER\nTOTAL_PAGES=${totalPages}\nRETAINED_PAGES=${retained.length}\nPAGES=${retained.map((p) => p.pageNumber).join(",")}\n\n`;
    let used = filteredContent.length;

    for (const p of retained) {
      const block = `--- PAGE ${p.pageNumber} (Score: ${p.score}) ---\n${p.text}\n\n`;
      if (used + block.length > MAX_CHARS_TO_KEEP) break;
      filteredContent += block;
      used += block.length;
    }

    return {
      fullText: fullText,
      filteredText: filteredContent,
      retainedPages: retained.length,
      totalPages,
      drawingCandidates,
    };
  } catch (error) {
    console.error("Smart Filter Error:", error);
    throw error;
  }
}
