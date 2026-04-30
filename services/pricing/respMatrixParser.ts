/**
 * RespMatrixParser - Parses "Resp Matrix" sheet from ANC Excel workbooks
 *
 * Extracts Statement of Work data in two formats:
 * - Short/paragraph: "Include Statement" items → category headers + paragraph text
 * - Long/table: "X" marks → DESCRIPTION | ANC | PURCHASER table
 * - Hybrid: mix of both
 *
 * Only ~10% of Excel files contain this sheet.
 */

import {
  RespMatrix,
  RespMatrixCategory,
  RespMatrixItem,
} from "@/types/pricing";

export interface RespMatrixParseResult {
  matrix: RespMatrix | null;
  sheetCandidates: string[];
  usedSheet: string | null;
  errors: string[];
}

/**
 * Find the responsibility matrix sheet in a workbook.
 * Supports real-world naming variants:
 * - "Resp Matrix"
 * - "Resp Matrix-NBCU"
 * - "Resp Matrix - XXX"
 * Prioritizes non-example sheets when multiple candidates exist.
 */
export function findRespMatrixSheetCandidates(workbook: any): string[] {
  const names: string[] = workbook.SheetNames || [];
  if (names.length === 0) return [];

  const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

  const candidates = names.filter((name) => {
    const n = normalize(name);
    return /^resp(?:onsibility)?\s*matrix\b/.test(n);
  });

  if (candidates.length === 0) return [];

  // Prefer non-example sheets. Only filter out "Example" tabs if real alternatives exist.
  // If ALL candidates have "Example" in the name, they are the real project matrices
  // (just poorly named) — use them rather than returning nothing.
  const nonExample = candidates.filter((name) => !/\bexample\b/i.test(name));
  return nonExample.length > 0 ? nonExample : candidates;
}

function countXMarks(workbook: any, sheetName: string): number {
  const xlsx = require("xlsx");
  const data: any[][] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
  let count = 0;
  for (const row of data) {
    for (const cell of row) {
      if (String(cell ?? "").trim() === "X" || String(cell ?? "").trim() === "x") count++;
    }
  }
  return count;
}

/**
 * Extract the project name from the top rows of a resp matrix sheet.
 * Standard ANC format: row 0 = "Project: | <name>", row 1 = "Date: | <date>"
 */
function getSheetProjectName(workbook: any, sheetName: string): string {
  const xlsx = require("xlsx");
  const data: any[][] = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
  for (let i = 0; i < Math.min(data.length, 5); i++) {
    const row = data[i] || [];
    const label = String(row[0] ?? "").trim().toLowerCase();
    if (label === "project:" || label === "project") {
      return String(row[1] ?? "").trim().toLowerCase();
    }
  }
  return "";
}

/**
 * Extract the project name from the workbook itself.
 * Checks the Margin Analysis sheet header row label (e.g. "Union Station LED Displays")
 * and the LED Cost Sheet project name row.
 */
function getWorkbookProjectName(workbook: any): string {
  const xlsx = require("xlsx");
  // Try Margin Analysis sheet (any variant name)
  const marginName = (workbook.SheetNames || []).find((s: string) =>
    /margin\s*analysis/i.test(s)
  );
  if (marginName) {
    const data: any[][] = xlsx.utils.sheet_to_json(workbook.Sheets[marginName], { header: 1, defval: "" });
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const row = data[i] || [];
      const cell0 = String(row[0] ?? "").trim();
      const cell0Low = cell0.toLowerCase();
      // "Project Name: Union Station" or "Project: Union Station"
      if (/^project\s*(name)?\s*:/i.test(cell0)) {
        const afterColon = cell0.replace(/^project\s*(name)?\s*:\s*/i, "").trim();
        if (afterColon.length > 2) return afterColon.toLowerCase();
      }
      // Header row label like "Union Station LED Displays" — non-metadata text row
      if (cell0.length > 3 && !/^(project|date|revised|cost|selling|margin|aia|budget|po|cash|install|travel)/i.test(cell0Low)) {
        return cell0Low;
      }
    }
  }
  return "";
}

function findRespMatrixSheet(workbook: any): string | null {
  const allCandidates = findRespMatrixSheetCandidates(workbook);
  if (allCandidates.length === 0) return null;
  if (allCandidates.length === 1) return allCandidates[0];

  // Check if we're in the example-only fallback case (all candidates have "Example" in name).
  const allAreExample = allCandidates.every((name) => /\bexample\b/i.test(name));
  if (allAreExample) {
    // Strategy 1: match by project name in the sheet's top rows.
    // ANC workbooks often have leftover resp matrix sheets from other projects.
    // The correct sheet is the one whose "Project:" row matches this workbook's project.
    const workbookProject = getWorkbookProjectName(workbook);
    if (workbookProject) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const workbookNorm = norm(workbookProject);
      for (const candidate of allCandidates) {
        const sheetProject = norm(getSheetProjectName(workbook, candidate));
        // Fuzzy match: sheet project name is contained in workbook project name or vice versa
        if (sheetProject && sheetProject.length > 3 &&
            (workbookNorm.includes(sheetProject) || sheetProject.includes(workbookNorm))) {
          return candidate;
        }
      }
    }

    // Strategy 2: fall back to most X-marks (most complete data).
    // This handles cases where no project name match is found.
    let best = allCandidates[0];
    let bestCount = countXMarks(workbook, best);
    for (let i = 1; i < allCandidates.length; i++) {
      const count = countXMarks(workbook, allCandidates[i]);
      if (count > bestCount) { bestCount = count; best = allCandidates[i]; }
    }
    return best;
  }

  return allCandidates[0];
}

/**
 * Detect if a row is a category header.
 * Category headers have text in col B and col C contains "ANC", "YES", or similar header keywords.
 */
function isCategoryHeader(row: any[], descIdx: number, ancIdx: number, purchaserIdx: number): boolean {
  const colB = String(row[descIdx] ?? "").trim();
  const colC = String(row[ancIdx] ?? "").trim().toUpperCase();
  const colD = String(row[purchaserIdx] ?? "").trim().toUpperCase();

  if (!colB) return false;

  // Category header patterns: col C has "ANC"/"YES" and col D has "PURCHASER"/"COLUMN1"/"NO"
  const ancHeaders = ["ANC", "YES", "SELLER"];
  const purchaserHeaders = ["PURCHASER", "COLUMN1", "NO", "BUYER", "OWNER", "CLIENT"];

  const cIsHeader = ancHeaders.some((h) => colC === h || colC.startsWith(h));
  const dIsHeader = purchaserHeaders.some((h) => colD === h || colD.startsWith(h));

  return cIsHeader && dIsHeader;
}

/**
 * Check if a row is an artifact/skip row
 */
function isArtifactRow(row: any[], descIdx: number): boolean {
  const colB = String(row[descIdx] ?? "").trim().toUpperCase();
  return ["COLUMN1", "COLUMN2", "COLUMN3", ""].includes(colB);
}

function detectColumns(data: any[][]): { description: number; anc: number; purchaser: number } {
  const ancHeaders = ["ANC", "YES", "SELLER"];
  const purchaserHeaders = ["PURCHASER", "COLUMN1", "NO", "BUYER", "OWNER", "CLIENT"];
  for (let i = 0; i < Math.min(data.length, 30); i++) {
    const row = data[i] || [];
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] ?? "").trim().toUpperCase();
      if (!ancHeaders.some((h) => val === h || val.startsWith(h))) continue;
      for (let p = c + 1; p < Math.min(row.length, c + 4); p++) {
        const pVal = String(row[p] ?? "").trim().toUpperCase();
        if (!purchaserHeaders.some((h) => pVal === h || pVal.startsWith(h))) continue;
        const desc = Math.max(0, c - 1);
        return { description: desc, anc: c, purchaser: p };
      }
    }
  }
  return { description: 1, anc: 2, purchaser: 3 };
}

/**
 * Detect format based on ANC column values across all items
 */
function detectFormat(categories: RespMatrixCategory[]): "short" | "long" | "hybrid" {
  let includeStatementCount = 0;
  let xCount = 0;
  let totalItems = 0;

  for (const cat of categories) {
    for (const item of cat.items) {
      totalItems++;
      const ancUpper = item.anc.toUpperCase().trim();
      if (ancUpper === "INCLUDE STATEMENT" || ancUpper === "INCLUDED STATEMENT") {
        includeStatementCount++;
      } else if (ancUpper.startsWith("X")) {
        xCount++;
      }
    }
  }

  if (totalItems === 0) return "short";
  if (includeStatementCount > 0 && xCount > 0) return "hybrid";
  if (xCount > includeStatementCount) return "long";
  return "short";
}

/**
 * Parse the Resp Matrix sheet from an Excel workbook.
 * Returns null if no "Resp Matrix" sheet is found.
 */
export function parseRespMatrix(workbook: any): RespMatrix | null {
  return parseRespMatrixDetailed(workbook).matrix;
}

export function parseRespMatrixDetailed(workbook: any): RespMatrixParseResult {
  const sheetName = findRespMatrixSheet(workbook);
  const sheetCandidates = findRespMatrixSheetCandidates(workbook);
  const errors: string[] = [];
  if (!sheetName) {
    return {
      matrix: null,
      sheetCandidates,
      usedSheet: null,
      errors,
    };
  }

  console.log(`[RESP MATRIX] Found sheet: "${sheetName}"`);

  const xlsx = require("xlsx");
  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // Build a set of hidden row indices so we can skip them during parsing.
  // Excel "hide row" doesn't delete data — xlsx still reads it — so we must filter manually.
  const hiddenRows = new Set<number>();
  const rowProps: any[] = sheet["!rows"] || [];
  rowProps.forEach((rp: any, idx: number) => {
    if (rp?.hidden) hiddenRows.add(idx);
  });
  if (hiddenRows.size > 0) {
    console.log(`[RESP MATRIX] Skipping ${hiddenRows.size} hidden rows`);
  }

  const col = detectColumns(data);

  if (data.length < 4) {
    console.warn("[RESP MATRIX] Sheet has fewer than 4 rows, skipping");
    errors.push("Resp Matrix sheet has fewer than 4 rows");
    return {
      matrix: null,
      sheetCandidates,
      usedSheet: sheetName,
      errors,
    };
  }

  // Extract project name and date from top rows (rows 0-3)
  let projectName = "";
  let date = "";
  for (let i = 0; i < Math.min(data.length, 5); i++) {
    const row = data[i] || [];
    const cellA = String(row[0] ?? "").trim();
    const cellB = String(row[1] ?? "").trim();
    const combined = `${cellA} ${cellB}`.trim();

    if (!projectName && combined.length > 3 && !/^(date|resp|matrix|anc|column)/i.test(combined)) {
      projectName = combined;
    }
    if (!date && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(combined)) {
      const match = combined.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
      if (match) date = match[0];
    }
  }

  // Parse categories and items
  const categories: RespMatrixCategory[] = [];
  let currentCategory: RespMatrixCategory | null = null;
  let categoryHeaderCount = 0;

  // Scan from row 3 onwards (skip title/date rows)
  for (let i = 2; i < data.length; i++) {
    // Skip rows hidden in Excel (user hid them but xlsx still reads the data)
    if (hiddenRows.has(i)) continue;

    const row = data[i] || [];

    // Skip artifact rows
    if (isArtifactRow(row, col.description)) continue;

    // Check for category header
    if (isCategoryHeader(row, col.description, col.anc, col.purchaser)) {
      categoryHeaderCount++;
      // Save previous category
      if (currentCategory && currentCategory.items.length > 0) {
        categories.push(currentCategory);
      }
      currentCategory = {
        name: String(row[col.description] ?? "").trim(),
        items: [],
      };
      continue;
    }

    // Regular item row
    const description = String(row[col.description] ?? "").trim();
    if (!description) continue;

    // Skip rows that look like sub-headers or repeated column labels
    const descUpper = description.toUpperCase();
    if (descUpper === "ANC" || descUpper === "PURCHASER" || descUpper === "DESCRIPTION") continue;

    const ancValue = String(row[col.anc] ?? "").trim();
    const purchaserValue = String(row[col.purchaser] ?? "").trim();

    // Skip rows with no values in either column (pure empty rows)
    if (!ancValue && !purchaserValue) continue;

    const item: RespMatrixItem = {
      description,
      anc: ancValue,
      purchaser: purchaserValue,
    };

    if (currentCategory) {
      currentCategory.items.push(item);
    } else {
      // Items before any category header — create a default category
      currentCategory = { name: "GENERAL", items: [item] };
    }
  }

  // Push final category
  if (currentCategory && currentCategory.items.length > 0) {
    categories.push(currentCategory);
  }

  if (categories.length === 0) {
    console.warn("[RESP MATRIX] No categories with items found");
    errors.push("Resp Matrix sheet has no categories with items");
    return {
      matrix: null,
      sheetCandidates,
      usedSheet: sheetName,
      errors,
    };
  }

  // Guard against template/placeholder sheets that contain stray values but no
  // real category structure. This prevents false positives where proposals pull
  // a matrix even when the workbook effectively has none.
  if (categoryHeaderCount === 0) {
    console.warn("[RESP MATRIX] No valid category headers found, skipping matrix");
    errors.push("Resp Matrix sheet has no valid category headers");
    return {
      matrix: null,
      sheetCandidates,
      usedSheet: sheetName,
      errors,
    };
  }

  const format = detectFormat(categories);
  console.log(`[RESP MATRIX] Parsed ${categories.length} categories, format: ${format}`);
  for (const cat of categories) {
    console.log(`[RESP MATRIX]   "${cat.name}": ${cat.items.length} items`);
  }

  return {
    matrix: {
    projectName,
    date,
    format,
    categories,
    },
    sheetCandidates,
    usedSheet: sheetName,
    errors,
  };
}
