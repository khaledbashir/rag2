/**
 * TOC Scanner — Table of Contents Pre-Scan for Large PDFs
 *
 * For PDFs >100 pages (construction manuals, DD packages), scanning
 * every page is wasteful and error-prone. Instead, we do what a human
 * estimator does: read the Table of Contents, find the LED sections,
 * go directly to those pages.
 *
 * Supports two TOC formats:
 *   1. Page-number TOCs: "Section Title ............... 427"
 *   2. Date-based TOCs: "116643 - Indoor LED Videoboards    02/12/2026"
 *      (common in construction DD packages — section numbers, no page refs)
 *
 * For format 2, we extract section numbers then search all OCR'd pages
 * for those section numbers to find the actual page locations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TocEntry {
  sectionNumber: string | null;
  title: string;
  pageNumber: number | null;
  isLedRelated: boolean;
}

export interface TocScanResult {
  found: boolean;
  entries: TocEntry[];
  ledSectionNumbers: string[];
  ledPages: number[];
  /** All pages to target (LED pages + context ±3) */
  targetPages: number[];
  /** Debug info */
  strategy: "page-numbers" | "section-search" | "keyword-fallback";
}

// ---------------------------------------------------------------------------
// LED-related keywords for TOC entry matching
// ---------------------------------------------------------------------------

const LED_SECTION_PATTERNS = [
  /led/i,
  /video\s*board/i,
  /video.*display/i,
  /display\s*unit/i,
  /scoreboard/i,
  /ribbon/i,
  /fascia/i,
  /marquee/i,
  /digital\s*sign/i,
  /11\s*0?6\s*60/,        // CSI 11 06 60 — Display Schedule
  /11\s*6[0-9]\s*[0-9]/,  // CSI 11 63 XX — LED systems
  /116[0-9]{3}/,           // 6-digit CSI: 116643, 116843, etc.
  /27\s*41/,               // CSI 27 41 — AV systems
  /audio\s*video/i,
  /a\/?v\s*system/i,
  /video\s*production/i,
  /video\s*wall/i,
];

// ---------------------------------------------------------------------------
// Parse TOC text into entries
// ---------------------------------------------------------------------------

function parseTocEntries(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const lines = markdown.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5) continue;
    // Skip pure header lines
    if (/^(DIVISION|VOLUME|TABLE OF CONTENTS|Section\s+Title|END OF)/i.test(trimmed)) continue;

    // --- Try to extract page number (format 1) ---
    // "Section Title ... 427"
    const pageMatch = trimmed.match(/^(.+?)[\s.·_\-]{3,}(\d{1,4})\s*$/);

    // --- Try to extract section number + title + date (format 2) ---
    // "116643 - Indoor LED Videoboards   02/12/2026"
    const sectionDateMatch = trimmed.match(/^(\d{5,6}(?:\.\d+)?)\s*[-–—]\s*(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s*$/);

    // --- Try section number + title without date ---
    // "116643 - Indoor LED Videoboards - OT"
    const sectionMatch = trimmed.match(/^(\d{5,6}(?:\.\d+)?)\s*[-–—]\s*(.+?)(?:\s*[-–—]\s*OT)?\s*$/);

    if (pageMatch) {
      const title = pageMatch[1].trim().replace(/[\s.·_\-]+$/, "").trim();
      const pageNum = parseInt(pageMatch[2], 10);
      if (pageNum >= 1 && title.length >= 3) {
        const sectionNumMatch = title.match(/^([\d]+[\s.]*[\d]*(?:[\s.]*[\d]+)?)/);
        const isLedRelated = LED_SECTION_PATTERNS.some((p) => p.test(title));
        entries.push({
          sectionNumber: sectionNumMatch ? sectionNumMatch[1].trim() : null,
          title,
          pageNumber: pageNum,
          isLedRelated,
        });
      }
    } else if (sectionDateMatch) {
      const sectionNum = sectionDateMatch[1];
      const title = sectionDateMatch[2].trim();
      const fullLine = `${sectionNum} ${title}`;
      const isLedRelated = LED_SECTION_PATTERNS.some((p) => p.test(fullLine));
      entries.push({
        sectionNumber: sectionNum,
        title: `${sectionNum} - ${title}`,
        pageNumber: null, // No page number in date-based TOCs
        isLedRelated,
      });
    } else if (sectionMatch && !trimmed.match(/\d{2}\/\d{2}\/\d{4}/)) {
      // Only use this pattern if no date was found (avoid double-matching)
      const sectionNum = sectionMatch[1];
      const title = sectionMatch[2].trim();
      const fullLine = `${sectionNum} ${title}`;
      const isLedRelated = LED_SECTION_PATTERNS.some((p) => p.test(fullLine));
      entries.push({
        sectionNumber: sectionNum,
        title: `${sectionNum} - ${title}`,
        pageNumber: null,
        isLedRelated,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Search OCR pages for section numbers
// ---------------------------------------------------------------------------

/**
 * Given section numbers from the TOC, find which pages contain those sections.
 * Searches all OCR'd page text for the section number string.
 */
function findPagesForSections(
  sectionNumbers: string[],
  allPages: Array<{ markdown: string; index: number }>,
): number[] {
  const foundPages: Set<number> = new Set();

  for (const secNum of sectionNumbers) {
    // Build regex that matches the section number with flexible spacing
    // "116643" should match "116643", "11 66 43", "SECTION 116643", etc.
    const digits = secNum.replace(/[\s.]/g, "");
    // Create pattern with optional spaces between digit groups
    const patterns = [
      new RegExp(digits.replace(/(\d{2})(\d{2})(\d{2})/, "$1\\s*$2\\s*$3"), "i"),
      new RegExp(secNum.replace(/\./g, "\\."), "i"),
      new RegExp(digits, "i"),
    ];

    for (let i = 0; i < allPages.length; i++) {
      const text = allPages[i].markdown;
      if (patterns.some((p) => p.test(text))) {
        // Page numbers are 1-indexed
        foundPages.add(i + 1);
      }
    }
  }

  return [...foundPages].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Keyword fallback for pages without TOC
// ---------------------------------------------------------------------------

/**
 * When no TOC is found, scan all pages for LED-related table structures.
 * A page with "Pixel Pitch" + "Brightness" + dimensions columns is almost
 * certainly a display schedule.
 */
function findLedTablePages(
  allPages: Array<{ markdown: string }>,
): number[] {
  const ledPages: number[] = [];
  const TABLE_INDICATORS = [
    /pixel\s*pitch/i,
    /brightness.*nit/i,
    /width.*height|height.*width/i,
    /display.*schedule/i,
    /led.*video/i,
    /scoreboard/i,
  ];

  for (let i = 0; i < allPages.length; i++) {
    const text = allPages[i].markdown.toLowerCase();
    const matchCount = TABLE_INDICATORS.filter((p) => p.test(text)).length;
    // If 3+ indicators match, this page likely has a display spec table
    if (matchCount >= 3) {
      ledPages.push(i + 1); // 1-indexed
    }
  }

  return ledPages;
}

// ---------------------------------------------------------------------------
// Expand page ranges with context
// ---------------------------------------------------------------------------

function expandWithContext(pages: number[], totalPages: number, contextPages: number = 3): number[] {
  const expanded = new Set<number>();
  for (const p of pages) {
    for (let i = p - contextPages; i <= p + contextPages; i++) {
      if (i >= 1 && i <= totalPages) {
        expanded.add(i);
      }
    }
  }
  return [...expanded].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

/**
 * Scans OCR'd pages for Table of Contents and identifies LED-related pages.
 *
 * Strategy priority:
 * 1. TOC with page numbers → direct targeting
 * 2. TOC with section numbers → search all pages for those sections
 * 3. No TOC → keyword/table-structure fallback on all pages
 */
export function scanTocFromOcrPages(
  ocrPages: Array<{ markdown: string; index: number }>,
  totalPages: number,
  tocPageCount: number = 20,
): TocScanResult {
  // Combine text from first N pages (where TOC typically lives)
  const tocText = ocrPages
    .slice(0, Math.min(tocPageCount, ocrPages.length))
    .map((p) => p.markdown)
    .join("\n\n");

  const entries = parseTocEntries(tocText);

  // Strategy 1: TOC with page numbers
  const entriesWithPages = entries.filter((e) => e.pageNumber != null && e.isLedRelated);
  if (entriesWithPages.length > 0) {
    const ledPages = [...new Set(entriesWithPages.map((e) => e.pageNumber!))];
    console.log(`[TOCScanner] Strategy: page-numbers — found ${ledPages.length} LED pages: ${ledPages.join(", ")}`);
    return {
      found: true,
      entries,
      ledSectionNumbers: entriesWithPages.map((e) => e.sectionNumber).filter(Boolean) as string[],
      ledPages,
      targetPages: expandWithContext(ledPages, totalPages),
      strategy: "page-numbers",
    };
  }

  // Strategy 2: TOC with section numbers (no page numbers) → search all pages
  const ledEntries = entries.filter((e) => e.isLedRelated && e.sectionNumber);
  if (ledEntries.length > 0) {
    const sectionNumbers = ledEntries.map((e) => e.sectionNumber!);
    console.log(`[TOCScanner] Strategy: section-search — LED sections: ${sectionNumbers.join(", ")}`);
    const ledPages = findPagesForSections(sectionNumbers, ocrPages);
    console.log(`[TOCScanner] Found sections on pages: ${ledPages.join(", ")}`);
    return {
      found: true,
      entries,
      ledSectionNumbers: sectionNumbers,
      ledPages,
      targetPages: expandWithContext(ledPages, totalPages),
      strategy: "section-search",
    };
  }

  // Strategy 3: No TOC or no LED entries → keyword/table fallback
  console.log(`[TOCScanner] Strategy: keyword-fallback — scanning all pages for LED table structures`);
  const ledPages = findLedTablePages(ocrPages);
  if (ledPages.length > 0) {
    console.log(`[TOCScanner] Found LED table structures on pages: ${ledPages.join(", ")}`);
  }

  return {
    found: entries.length > 0,
    entries,
    ledSectionNumbers: [],
    ledPages,
    targetPages: ledPages.length > 0 ? expandWithContext(ledPages, totalPages) : [],
    strategy: "keyword-fallback",
  };
}
