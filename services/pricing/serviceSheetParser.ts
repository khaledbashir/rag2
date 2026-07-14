/**
 * serviceSheetParser — recognizes and mirrors ANC service-contract budget
 * workbooks ("Property/Event Budget Overview" shape) into a
 * ServicePricingDocument.
 *
 * Natalia's rules (2026-07-14):
 *  - This sheet type IS a service sheet: recognize it automatically.
 *  - Client-facing = whatever is in column B from the Income: section down to
 *    the Expenses row. Everything below Expenses (costs, EBITDA, capex,
 *    depreciation, % return) is internal and never rendered.
 *  - Year columns (F/G in the Panthers file) are variable — 2, 3, 5, 10 years.
 *  - Bonus: recognize how many years, who the client is, what stadium they
 *    play in, and prefill the Service Proposal/Contract setup.
 *
 * Mirror rule: values are carried exactly as Excel displays them (cached
 * formula results / formatted text). No math is performed here.
 */

import type {
  ServicePricingCell,
  ServicePricingDocument,
  ServicePricingRow,
  ServicePricingTotalRow,
  ServiceSheetParseResult,
  ServiceSheetPrefill,
} from "@/types/servicePricing";
import { detectCurrency, formatPricingCurrency } from "@/types/pricing";
import { matchTeamVenue } from "@/lib/serviceContracts/teamVenues";

// ============================================================================
// Detection
// ============================================================================

const INCOME_RE = /^income:?\s*$/i;
const EXPENSE_RE = /^(cash\s+)?expenses?:?\s*$/i;
const TEAM_RE = /^team:?\s*$/i;
const TOTAL_RE = /^total\b/i;

/** Year-column header: "26/27", "26-27", "2026/27", "2026-2027", "Year 1". */
const YEAR_LABEL_RE = /^\s*(?:'?\d{2}|20\d{2})\s*[/\-–]\s*(?:'?\d{2}|20\d{2})\s*$|^\s*year\s*\d+\s*$/i;

/** How deep we scan a sheet for structure markers. */
const MAX_SCAN_ROWS = 300;
/** Label columns considered for the Income/Expenses section markers (A..C). */
const MARKER_COLS = [0, 1, 2];

/** Sheets that should lose detection ties (superseded working copies). */
const STALE_SHEET_RE = /\b(old|archive|copy|backup|draft)\b/i;

interface SheetStructure {
  sheetName: string;
  incomeRow: number;
  expenseRow: number;
  yearHeaderRow: number;
  /** Column indexes holding year values, aligned with yearLabels. */
  yearCols: number[];
  yearLabels: string[];
  /** Raw "Team:" row client value, when the sheet carries one. */
  teamName: string | null;
}

const cellText = (v: unknown): string => String(v ?? "").trim();

function findSheetStructure(sheetName: string, data: any[][]): SheetStructure | null {
  const rowCount = Math.min(data.length, MAX_SCAN_ROWS);

  let incomeRow = -1;
  for (let r = 0; r < rowCount; r++) {
    if (MARKER_COLS.some((c) => INCOME_RE.test(cellText(data[r]?.[c])))) {
      incomeRow = r;
      break;
    }
  }
  if (incomeRow < 0) return null;

  let expenseRow = -1;
  for (let r = incomeRow + 1; r < rowCount; r++) {
    if (MARKER_COLS.some((c) => EXPENSE_RE.test(cellText(data[r]?.[c])))) {
      expenseRow = r;
      break;
    }
  }
  if (expenseRow < 0) return null;

  // Year header row: at/above the Income row, holding year-shaped labels to the
  // right of the label column (col B). The Panthers file keeps them on the
  // "Team:" row; other files may use a dedicated header row.
  let yearHeaderRow = -1;
  let yearCols: number[] = [];
  let yearLabels: string[] = [];
  for (let r = incomeRow; r >= 0; r--) {
    const row = data[r] || [];
    const cols: number[] = [];
    const labels: string[] = [];
    for (let c = 2; c < row.length; c++) {
      const text = cellText(row[c]);
      if (text && YEAR_LABEL_RE.test(text)) {
        cols.push(c);
        labels.push(text);
      }
    }
    if (cols.length > 0) {
      yearHeaderRow = r;
      yearCols = cols;
      yearLabels = labels;
      break;
    }
  }
  if (yearCols.length === 0) return null;

  // Optional "Team:" marker → client name from the same row.
  let teamName: string | null = null;
  for (let r = 0; r < rowCount; r++) {
    const row = data[r] || [];
    const markerCol = MARKER_COLS.find((c) => TEAM_RE.test(cellText(row[c])));
    if (markerCol === undefined) continue;
    for (let c = markerCol + 1; c < Math.min(row.length, yearCols[0]); c++) {
      const text = cellText(row[c]);
      if (text) {
        teamName = text;
        break;
      }
    }
    break;
  }

  return { sheetName, incomeRow, expenseRow, yearHeaderRow, yearCols, yearLabels, teamName };
}

/**
 * Returns the best service-sheet candidate in the workbook, or null when the
 * workbook is not a service sheet. Ties prefer non-stale names ("old",
 * "archive", …) and earlier workbook order.
 */
export function detectServiceSheet(workbook: any): SheetStructure | null {
  const xlsx = require("xlsx");
  const candidates: Array<{ structure: SheetStructure; order: number; stale: boolean }> = [];

  (workbook.SheetNames as string[]).forEach((sheetName, order) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const structure = findSheetStructure(sheetName, data);
    if (structure) {
      candidates.push({ structure, order, stale: STALE_SHEET_RE.test(sheetName) });
    }
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Number(a.stale) - Number(b.stale) || a.order - b.order);
  return candidates[0].structure;
}

/** Cheap boolean probe used by the import route. */
export function isServiceSheetWorkbook(workbook: any): boolean {
  return detectServiceSheet(workbook) !== null;
}

// ============================================================================
// Extraction
// ============================================================================

function readCell(
  sheet: any,
  xlsx: any,
  row: number,
  col: number,
  currency: "CAD" | "USD" | "GBP" | "EUR",
): ServicePricingCell {
  const addr = xlsx.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell || cell.v === undefined || cell.v === null || cellText(cell.v) === "") {
    return { raw: null, display: "" };
  }
  const raw: number | string = typeof cell.v === "number" ? cell.v : String(cell.v).trim();
  // Mirror what Excel shows: prefer the formatted text Excel produced.
  const formatted = typeof cell.w === "string" ? cell.w.trim() : "";
  if (formatted) return { raw, display: formatted };
  if (typeof raw === "number") return { raw, display: formatPricingCurrency(raw, currency) };
  return { raw, display: raw };
}

/** "Carolina Panthers 2026-2028 Service Contract (1).xlsx" → "Carolina Panthers". */
function clientNameFromFileName(fileName: string): string | null {
  let base = fileName.replace(/\.(xlsx?|xlsm|csv)$/i, "");
  base = base.replace(/\s*\(\d+\)\s*$/g, "");
  // Cut at the first year range or standalone year — the client name precedes it.
  const yearIdx = base.search(/\b(19|20)\d{2}\b/);
  if (yearIdx > 0) base = base.slice(0, yearIdx);
  base = base.replace(/\b(service|contract|proposal|agreement|budget|overview)\b/gi, "");
  base = base.replace(/[-–_]+/g, " ").replace(/\s+/g, " ").trim();
  return base || null;
}

/** Term years from "2026-2028" (file name) or "26-28" (sheet name). */
function termRange(fileName: string, sheetName: string): { start: number | null; end: number | null } {
  const full = fileName.match(/\b(20\d{2})\s*[-–]\s*(20\d{2})\b/);
  if (full) return { start: Number(full[1]), end: Number(full[2]) };
  const short = `${sheetName} ${fileName}`.match(/\b(\d{2})\s*[-–]\s*(\d{2})\b/);
  if (short) {
    const start = Number(short[1]);
    const end = Number(short[2]);
    if (start >= 20 && start < 100 && end > start) return { start: 2000 + start, end: 2000 + end };
  }
  return { start: null, end: null };
}

/**
 * Parse a detected service sheet into a mirrored ServicePricingDocument plus
 * setup prefill (client, venue, term). Throws if the workbook is not a service
 * sheet — call detectServiceSheet()/isServiceSheetWorkbook() first.
 */
export function parseServiceSheet(workbook: any, fileName: string = "import.xlsx"): ServiceSheetParseResult {
  const xlsx = require("xlsx");
  const structure = detectServiceSheet(workbook);
  if (!structure) {
    throw new Error("Workbook is not a recognized service sheet (no Income/Expenses budget structure found).");
  }

  const { sheetName, incomeRow, expenseRow, yearCols, yearLabels } = structure;
  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const warnings: string[] = [];

  // Currency from sheet name + formatted cell text (service sheets are almost
  // always USD, but mirror-detect like the margin parser does).
  const formattedSample = Object.keys(sheet)
    .filter((k) => /^[A-Z]+[0-9]+$/.test(k))
    .slice(0, 400)
    .map((k) => `${sheet[k]?.w ?? ""} ${sheet[k]?.z ?? ""}`)
    .join(" ");
  const currency = detectCurrency(sheetName, formattedSample);

  const rows: ServicePricingRow[] = [];
  let totalRow: ServicePricingTotalRow | null = null;

  for (let r = incomeRow + 1; r < expenseRow; r++) {
    const label = cellText(data[r]?.[1]); // column B — Natalia's client-facing column
    if (!label) continue; // blank spacer row

    const cells = yearCols.map((c) => readCell(sheet, xlsx, r, c, currency));
    const hasValues = cells.some((cell) => cell.raw !== null);

    if (TOTAL_RE.test(label)) {
      if (!totalRow) {
        totalRow = { label, cells, sourceRow: r };
      } else {
        warnings.push(`Multiple total rows found in the client-facing block; kept "${totalRow.label}" (row ${totalRow.sourceRow + 1}).`);
      }
      continue;
    }

    rows.push({
      label,
      cells,
      kind: label.startsWith("*") || !hasValues ? "note" : "line",
      sourceRow: r,
    });
  }

  if (rows.filter((row) => row.kind === "line").length === 0) {
    throw new Error("Service sheet has no client-facing fee lines between Income and Expenses.");
  }
  if (!totalRow) {
    warnings.push("No total row found between Income and Expenses — the proposal table will render without a YEARLY TOTAL row.");
  }

  const { start: termStartYear, end: termEndYear } = termRange(fileName, sheetName);
  const clientName = structure.teamName || clientNameFromFileName(fileName);
  if (!clientName) warnings.push("Could not determine the client name from the sheet or file name.");

  const teamVenue = clientName ? matchTeamVenue(clientName) : null;

  const document: ServicePricingDocument = {
    sourceSheet: sheetName,
    fileName,
    clientName,
    yearLabels,
    rows,
    totalRow,
    termYears: yearLabels.length,
    termStartYear,
    termEndYear,
    currency,
    metadata: {
      importedAt: new Date().toISOString(),
      warnings,
    },
  };

  const prefill: ServiceSheetPrefill = {
    clientName,
    venueName: teamVenue?.venue ?? null,
    venueAddress: teamVenue?.address ?? null,
    league: teamVenue?.league ?? null,
    termYears: yearLabels.length,
    termStartYear,
    termEndYear,
  };

  return { document, prefill };
}
