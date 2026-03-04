/**
 * Cost Analysis Parser — extracts LED display rows from the "LED Cost Sheet" tab.
 *
 * Used by the Spec Generator tool to read display data from ANC cost analysis
 * workbooks. Uses header-row detection (not hardcoded column indices) so it
 * works across different cost analysis formats.
 *
 * Each display row starts with "LED-" in column A. Non-LED rows (headers,
 * bid package labels, totals, blanks) are skipped.
 */

import * as xlsx from "xlsx";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostAnalysisDisplay {
  shortId: string;         // "LED-GPL2-01"
  fullName: string;        // Full text from column A
  location: string;
  vendor: string;
  model: string;
  pixelPitch: number;
  heightFt: number;
  widthFt: number;
  pixelsH: number;
  pixelsW: number;
  sqFt: number;
  nitRequirement: number;
  serviceType: string;
  isOutdoor: boolean;
  isAlternate: boolean;
  quantity: number;
}

export interface CostAnalysisResult {
  displays: CostAnalysisDisplay[];
  projectName: string;
  warnings: string[];
}

// ─── Header patterns for column detection ───────────────────────────────────

interface ColumnMap {
  fullName: number;
  location: number;
  vendor: number;
  model: number;
  pixelPitch: number;
  heightFt: number;
  widthFt: number;
  pixelsH: number;
  pixelsW: number;
  sqFt: number;
  nitRequirement: number;
  serviceType: number;
  quantity: number;
}

/** Regex patterns to match header labels → column roles */
const HEADER_PATTERNS: [keyof ColumnMap, RegExp][] = [
  ["location",       /^(location|display\s*location|loc\.?|area|zone)\s*$/i],
  ["vendor",         /^(vendor|manufacturer|mfg|mfr|brand)\s*$/i],
  ["model",          /^(model|product\s*model|product|sku)\s*$/i],
  ["pixelPitch",     /^(pixel\s*pitch|pitch|pp|p\.?p\.?)\s*$/i],
  ["heightFt",       /^(height|h|h\s*\(ft\)|height\s*\(ft\)|ht)\s*$/i],
  ["widthFt",        /^(width|w|w\s*\(ft\)|width\s*\(ft\)|wd)\s*$/i],
  ["pixelsH",        /^(pixels?\s*h|px\s*h|res\.?\s*h|height\s*px|v(?:ert)?\s*px)\s*$/i],
  ["pixelsW",        /^(pixels?\s*w|px\s*w|res\.?\s*w|width\s*px|h(?:oriz)?\s*px)\s*$/i],
  ["sqFt",           /^(sq\s*ft|area|sqft|square\s*feet?|sq\s*ft\s*per\s*screen)\s*$/i],
  ["nitRequirement", /^(nit|nits|nit\s*req|brightness|nit\s*requirement)\s*$/i],
  ["serviceType",    /^(service|service\s*type|svc|access)\s*$/i],
  ["quantity",       /^(qty|quantity|count|#|num)\s*$/i],
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function toStr(v: any): string {
  if (v == null) return "";
  return String(v).trim();
}

function toNum(v: any): number {
  if (v == null) return 0;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Find the "LED Cost Sheet" tab (fuzzy match).
 */
function findLedCostSheet(workbook: xlsx.WorkBook): string | null {
  const names = workbook.SheetNames;
  // Exact match first
  const exact = names.find((n) => /^led\s*cost\s*sheet$/i.test(n.trim()));
  if (exact) return exact;
  // Fuzzy — contains "LED" and "Cost"
  const fuzzy = names.find((n) => /led/i.test(n) && /cost/i.test(n));
  if (fuzzy) return fuzzy;
  // Contains "LED Cost"
  const partial = names.find((n) => /led\s*cost/i.test(n));
  if (partial) return partial;
  return null;
}

/**
 * Detect header row and build column map.
 * Scans first 30 rows looking for a row that matches 3+ header patterns.
 */
function detectColumns(data: any[][]): { headerRow: number; columns: ColumnMap } | null {
  for (let i = 0; i < Math.min(data.length, 30); i++) {
    const row = data[i] || [];
    const matched: Partial<ColumnMap> = {};
    let matchCount = 0;

    for (let col = 0; col < row.length; col++) {
      const cellText = toStr(row[col]);
      if (!cellText) continue;

      for (const [field, pattern] of HEADER_PATTERNS) {
        if (pattern.test(cellText) && !(field in matched)) {
          matched[field] = col;
          matchCount++;
          break;
        }
      }
    }

    // Need at least 3 matches to be confident this is the header row
    if (matchCount >= 3) {
      // Column A (index 0) is always the display name/full name
      const columns: ColumnMap = {
        fullName: 0,
        location: matched.location ?? -1,
        vendor: matched.vendor ?? -1,
        model: matched.model ?? -1,
        pixelPitch: matched.pixelPitch ?? -1,
        heightFt: matched.heightFt ?? -1,
        widthFt: matched.widthFt ?? -1,
        pixelsH: matched.pixelsH ?? -1,
        pixelsW: matched.pixelsW ?? -1,
        sqFt: matched.sqFt ?? -1,
        nitRequirement: matched.nitRequirement ?? -1,
        serviceType: matched.serviceType ?? -1,
        quantity: matched.quantity ?? -1,
      };

      return { headerRow: i, columns };
    }
  }

  return null;
}

/**
 * Extract the short ID from the full display name.
 * "LED-GPL2-01 - LED Display (2026) - 9' H x 16' W - 1.2mm (Indoor)" → "LED-GPL2-01"
 */
function extractShortId(fullName: string): string {
  // Take everything before the first " - " separator
  const dashIdx = fullName.indexOf(" - ");
  if (dashIdx > 0) return fullName.substring(0, dashIdx).trim();
  // Fallback: take first whitespace-separated token if it starts with LED-
  const first = fullName.split(/\s+/)[0];
  return first || fullName;
}

/**
 * Infer indoor/outdoor from the display full name and NIT requirement.
 */
function inferOutdoor(fullName: string, nits: number): boolean {
  const lower = fullName.toLowerCase();
  if (lower.includes("outdoor")) return true;
  if (lower.includes("ext")) return true;
  if (lower.includes("indoor")) return false;
  // High NITs suggest outdoor
  if (nits >= 5000) return true;
  return false;
}

/**
 * Infer whether this is an alternate bid.
 */
function inferAlternate(fullName: string): boolean {
  return /\balt(?:ernate)?\b/i.test(fullName);
}

/**
 * Parse pixel pitch from the full name if not available from the column.
 * "LED-GPL2-01 - LED Display - 1.2mm (Indoor)" → 1.2
 */
function parsePitchFromName(fullName: string): number {
  const match = fullName.match(/(\d+\.?\d*)\s*mm/i);
  return match ? parseFloat(match[1]) : 0;
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export function parseCostAnalysis(buffer: Buffer): CostAnalysisResult {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const warnings: string[] = [];

  // Find LED Cost Sheet
  const sheetName = findLedCostSheet(workbook);
  if (!sheetName) {
    return {
      displays: [],
      projectName: "",
      warnings: ["No 'LED Cost Sheet' tab found in workbook. Available sheets: " + workbook.SheetNames.join(", ")],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });

  // Detect header row and column mapping
  const detection = detectColumns(data);
  if (!detection) {
    // Fallback: use typical ANC column layout
    warnings.push("Could not auto-detect column headers, using default ANC layout");
  }

  const cols = detection?.columns ?? {
    fullName: 0,
    location: 1,
    vendor: 2,
    model: 3,
    pixelPitch: 5,
    heightFt: 6,
    widthFt: 7,
    pixelsH: 8,
    pixelsW: 10,
    sqFt: 11,
    nitRequirement: 14,
    serviceType: 15,
    quantity: -1,
  };

  const startRow = detection ? detection.headerRow + 1 : 0;

  // Try to extract project name from filename or sheet metadata
  let projectName = "";
  // Check first few rows for project name before the header
  for (let i = 0; i < Math.min(startRow, 10); i++) {
    const cellA = toStr(data[i]?.[0]);
    if (cellA && !cellA.toLowerCase().includes("led") && cellA.length > 5 && cellA.length < 100) {
      // Likely a project name or header
      if (/arena|stadium|center|field|park|university|college|school/i.test(cellA)) {
        projectName = cellA;
        break;
      }
    }
  }

  // Parse display rows
  const displays: CostAnalysisDisplay[] = [];

  for (let i = startRow; i < data.length; i++) {
    const row = data[i] || [];
    const cellA = toStr(row[cols.fullName]);

    // Skip non-LED rows
    if (!cellA.startsWith("LED-")) continue;

    const fullName = cellA;
    const shortId = extractShortId(fullName);
    const location = cols.location >= 0 ? toStr(row[cols.location]) : "";
    const vendor = cols.vendor >= 0 ? toStr(row[cols.vendor]) : "";
    const model = cols.model >= 0 ? toStr(row[cols.model]) : "";

    let pixelPitch = cols.pixelPitch >= 0 ? toNum(row[cols.pixelPitch]) : 0;
    if (!pixelPitch) pixelPitch = parsePitchFromName(fullName);

    const heightFt = cols.heightFt >= 0 ? toNum(row[cols.heightFt]) : 0;
    const widthFt = cols.widthFt >= 0 ? toNum(row[cols.widthFt]) : 0;
    const pixelsH = cols.pixelsH >= 0 ? toNum(row[cols.pixelsH]) : 0;
    const pixelsW = cols.pixelsW >= 0 ? toNum(row[cols.pixelsW]) : 0;

    let sqFt = cols.sqFt >= 0 ? toNum(row[cols.sqFt]) : 0;
    if (!sqFt && heightFt && widthFt) sqFt = heightFt * widthFt;

    const nitRequirement = cols.nitRequirement >= 0 ? toNum(row[cols.nitRequirement]) : 0;
    const serviceType = cols.serviceType >= 0 ? toStr(row[cols.serviceType]) : "";
    const quantity = cols.quantity >= 0 ? (toNum(row[cols.quantity]) || 1) : 1;

    const isOutdoor = inferOutdoor(fullName, nitRequirement);
    const isAlternate = inferAlternate(fullName);

    displays.push({
      shortId,
      fullName,
      location,
      vendor,
      model,
      pixelPitch,
      heightFt,
      widthFt,
      pixelsH,
      pixelsW,
      sqFt,
      nitRequirement,
      serviceType,
      isOutdoor,
      isAlternate,
      quantity,
    });
  }

  if (displays.length === 0) {
    warnings.push("No LED- display rows found in '" + sheetName + "'. Make sure display names start with 'LED-'.");
  }

  console.log(`[COST PARSER] Found ${displays.length} displays in "${sheetName}"`);

  return { displays, projectName, warnings };
}
