/**
 * Fuzzy sheet detection — never hardcode tab names.
 * Matches by keywords (e.g. "Margin", "Analysis", "Total") so variants
 * like "Margin-Analysis", "Margin Analysis (CAD)", "LED Cost Sheet" work.
 */

export type WorkbookSheets = Record<string, { [key: string]: unknown }>;
const CELL_REF_RE = /^[A-Z]+[0-9]+$/;

/**
 * Normalize a sheet name for matching: lowercase, collapse spaces/dashes/underscores.
 */
function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\s\-_]+/g, " ")
    .trim();
}

/**
 * Tokenize for keyword match (split on space, keep words).
 */
function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(/\s+/).filter(Boolean));
}

/**
 * Score a sheet name against required keywords.
 * Returns the number of required keywords found (0 = no match).
 */
function scoreSheet(sheetName: string, requiredKeywords: string[]): number {
  const nameTokens = tokens(sheetName);
  const required = requiredKeywords.map((k) => normalize(k));
  let found = 0;
  for (const r of required) {
    if (nameTokens.has(r)) found++;
    else {
      // Allow partial: e.g. "analysis" matches "margin analysis"
      const anyMatch = [...nameTokens].some((t) => t.includes(r) || r.includes(t));
      if (anyMatch) found++;
    }
  }
  return found;
}

/**
 * Find a sheet by keyword matching. Tries exact regex first, then keyword scoring.
 *
 * @param workbook - xlsx workbook (workbook.Sheets / workbook.SheetNames)
 * @param options - exact patterns (regex) and/or keyword sets (at least one set must fully match)
 * @returns First matching sheet name, or null
 */
export function findSheetByKeywords(
  workbook: { SheetNames?: string[]; Sheets?: WorkbookSheets },
  options: {
    /** Try these regexes first (e.g. /^margin\s*analysis$/i) */
    exactPatterns?: RegExp[];
    /** Require ALL of these keywords in the sheet name (e.g. ["margin", "analysis"]) */
    requireAll?: string[];
    /** Require at least one of these keyword sets (e.g. [["led", "sheet"], ["led", "cost"]]) */
    requireAnySet?: string[][];
  }
): string | null {
  const names = workbook.SheetNames ?? Object.keys(workbook.Sheets ?? {});
  if (!names.length) return null;

  // 1. Exact regex
  if (options.exactPatterns?.length) {
    for (const pattern of options.exactPatterns) {
      const match = names.find((n) => pattern.test(n));
      if (match) return match;
    }
  }

  // 2. Require all keywords
  if (options.requireAll?.length) {
    const best = names
      .map((name) => ({ name, score: scoreSheet(name, options.requireAll!) }))
      .filter((x) => x.score === options.requireAll!.length)
      .sort((a, b) => b.name.length - a.name.length)[0]; // prefer shorter (less noise)
    if (best) return best.name;
  }

  // 3. Require any set (e.g. ["led","sheet"] OR ["led","cost"])
  if (options.requireAnySet?.length) {
    for (const keywordSet of options.requireAnySet) {
      const match = names.find((name) => scoreSheet(name, keywordSet) === keywordSet.length);
      if (match) return match;
    }
  }

  return null;
}

/** Find "Margin Analysis" type sheet (Margin, Analysis, Total, etc.) */
export function findMarginAnalysisSheet(workbook: { SheetNames?: string[]; Sheets?: WorkbookSheets }): string | null {
  const names = workbook.SheetNames ?? Object.keys(workbook.Sheets ?? {});
  if (!names.length) return null;

  const getSheetSignal = (sheetName: string) => {
    const sheet = workbook.Sheets?.[sheetName] as Record<string, any> | undefined;
    if (!sheet) return { populatedCells: 0, numericCells: 0 };

    let populatedCells = 0;
    let numericCells = 0;

    for (const [cellRef, cell] of Object.entries(sheet)) {
      if (!CELL_REF_RE.test(cellRef) || !cell) continue;

      const rendered = String(cell.w ?? cell.v ?? "").trim();
      if (rendered) populatedCells++;
      if (typeof cell.v === "number") numericCells++;
    }

    return { populatedCells, numericCells };
  };

  const scoreCandidate = (sheetName: string, index: number) => {
    const norm = normalize(sheetName);
    const signal = getSheetSignal(sheetName);
    let score = 0;
    let matchedByName = false;

    if (/^margin\s*analysis(?:\s*\((usd|cad|gbp|eur)\))?(?:\s*\(v\d+\))?$/i.test(sheetName)) {
      score += 120;
      matchedByName = true;
    } else if (scoreSheet(sheetName, ["margin", "analysis"]) === 2) {
      score += 90;
      matchedByName = true;
    } else if (scoreSheet(sheetName, ["margin", "total"]) === 2) {
      score += 60;
      matchedByName = true;
    } else if (norm.includes("margin") || norm.includes("pricing") || norm.includes("bid form")) {
      score += 25;
      matchedByName = true;
    }

    if (!matchedByName) return { sheetName, score: 0, index };

    if (/^margin\s*analysis$/i.test(sheetName)) score += 15;
    if (/\((usd|cad|gbp|eur)\)/i.test(sheetName)) score += 10;
    if (/\bcms\b/.test(norm) || norm.includes("cms only")) score -= 80;
    if (/\bold\b/.test(norm) || /\barchive(d)?\b/.test(norm)) score -= 20;
    if (signal.populatedCells === 0) score -= 100;

    score += Math.min(signal.populatedCells, 25);
    score += Math.min(signal.numericCells, 10);

    return { sheetName, score, index };
  };

  const candidates = names
    .map((sheetName, index) => scoreCandidate(sheetName, index))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return candidates[0]?.sheetName ?? null;
}

/** Find "LED Sheet" / "LED Cost Sheet" type sheet */
export function findLedOrCostSheet(workbook: { SheetNames?: string[]; Sheets?: WorkbookSheets }): string | null {
  return findSheetByKeywords(workbook, {
    exactPatterns: [/^led\s*sheet$/i, /^led\s*cost\s*sheet$/i],
    requireAnySet: [
      ["led", "sheet"],
      ["led", "cost"],
      ["led", "cost", "sheet"],
    ],
  });
}
