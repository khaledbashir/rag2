/**
 * Division 11 Section Finder — P72
 *
 * Finds LED Display Systems content in large RFP documents.
 * Searches for Division 11 sections (11 06 60, 11 63 10) which contain
 * display schedules and technical specifications.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FoundSection {
    sectionId: string;       // e.g., "11 06 60"
    title: string;           // e.g., "Display Schedule"
    startPage: number;
    endPage: number;
    text: string;
    confidence: number;      // 0-1
    priority: number;        // 1 = highest
}

export interface DivisionSearchResult {
    found: boolean;
    sections: FoundSection[];
    searchTermsMatched: string[];
    totalPagesSearched: number;
}

// ============================================================================
// SEARCH PATTERNS
// ============================================================================

const DIVISION_PATTERNS = [
    { pattern: /SECTION\s+11\s*0?6\s*60/i, id: "11 06 60", title: "Display Schedule", priority: 1 },
    { pattern: /SECTION\s+11\s*63\s*10/i, id: "11 63 10", title: "LED Display Systems", priority: 2 },
    { pattern: /SECTION\s+11\s*63\s*11/i, id: "11 63 11", title: "LED Display Systems (WJHW)", priority: 2 },
    { pattern: /DIVISION\s+11.*(?:LED|Display|Video)/i, id: "div-11", title: "Division 11 — LED/Display", priority: 3 },
    { pattern: /LED\s+Display\s+(?:Systems?|Schedule)/i, id: "led-display", title: "LED Display Systems", priority: 4 },
    { pattern: /(?:Video|Digital)\s+(?:Display|Scoreboard|Board)\s+(?:Systems?|Schedule)/i, id: "video-display", title: "Video Display Systems", priority: 5 },
    { pattern: /Display\s+Schedule/i, id: "display-schedule", title: "Display Schedule", priority: 6 },
];

// ============================================================================
// FINDER
// ============================================================================

/**
 * Search through extracted RFP pages for Division 11 content.
 */
export function findDivision11Sections(
    pages: Array<{ pageNumber: number; text: string }>
): DivisionSearchResult {
    const sections: FoundSection[] = [];
    const matchedTerms = new Set<string>();

    for (const { pattern, id, title, priority } of DIVISION_PATTERNS) {
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (pattern.test(page.text)) {
                matchedTerms.add(id);

                // Find the extent of this section (look ahead up to 20 pages)
                let endPage = page.pageNumber;
                for (let j = i + 1; j < Math.min(i + 20, pages.length); j++) {
                    const nextPage = pages[j];
                    // Stop if we hit another major section header
                    if (/^SECTION\s+\d{2}\s/m.test(nextPage.text) && !pattern.test(nextPage.text)) {
                        break;
                    }
                    endPage = nextPage.pageNumber;
                }

                // Collect text from the section
                const sectionPages = pages.filter(
                    (p) => p.pageNumber >= page.pageNumber && p.pageNumber <= endPage
                );
                const sectionText = sectionPages.map((p) => p.text).join("\n\n");

                // Avoid duplicates
                if (!sections.find((s) => s.sectionId === id && s.startPage === page.pageNumber)) {
                    sections.push({
                        sectionId: id,
                        title,
                        startPage: page.pageNumber,
                        endPage,
                        text: sectionText,
                        confidence: priority <= 2 ? 0.95 : priority <= 4 ? 0.80 : 0.65,
                        priority,
                    });
                }
            }
        }
    }

    // Sort by priority (highest first)
    sections.sort((a, b) => a.priority - b.priority);

    return {
        found: sections.length > 0,
        sections,
        searchTermsMatched: Array.from(matchedTerms),
        totalPagesSearched: pages.length,
    };
}

/**
 * Get the best section text for AI analysis.
 * Returns the highest-priority section found.
 */
export function getBestSectionText(result: DivisionSearchResult): string | null {
    if (!result.found || result.sections.length === 0) return null;
    return result.sections[0].text;
}
