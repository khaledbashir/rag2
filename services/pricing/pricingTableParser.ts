/**
 * PricingTableParser - Enterprise-grade Excel to PricingTable[] converter
 *
 * Parses any Margin Analysis Excel format into normalized PricingTable[] structure.
 * Designed for Natalia's "Mirror Mode" - exact replication of Excel pricing.
 *
 * This file is the orchestrator — logic lives in ./parser/ sub-modules.
 */

import * as Sentry from "@sentry/nextjs";
import {
  PricingDocument,
  PricingValidationReport,
  detectCurrency,
} from "@/types/pricing";
import { findMarginAnalysisSheet } from "@/lib/sheetDetection";
import { parseRespMatrixDetailed } from "@/services/pricing/respMatrixParser";

import { findColumnHeaders } from "./parser/columnDetection";
import { parseAllRows, findHeaderRowIndex } from "./parser/rowParser";
import { findTableBoundaries, buildSingleTableBoundary, findGlobalDocumentTotal } from "./parser/boundaryDetection";
import { extractTable, prependSyntheticRollupTable } from "./parser/tableExtraction";
import { deriveBestShiftedColumnMap } from "./parser/columnShift";
import { buildValidationReport } from "./parser/validation";

export const PRICING_PARSER_STRICT_VERSION = "2026.02.12.strict-v1";

export interface ParsePricingOptions {
  strict?: boolean;
  sourceWorkbookHash?: string;
}

export interface ParsePricingResult {
  document: PricingDocument | null;
  validation: PricingValidationReport;
}

function buildCurrencyDetectionSample(sheet: any, data: any[][]): string {
  const textRows = data
    .slice(0, 100)
    .flat()
    .map((cell) => String(cell ?? ""))
    .join(" ");

  const formattedCells: string[] = [];
  const cellKeys = Object.keys(sheet ?? {}).filter((key) => /^[A-Z]+[0-9]+$/.test(key)).slice(0, 400);
  for (const key of cellKeys) {
    const cell = sheet[key];
    if (!cell) continue;
    if (cell.w) formattedCells.push(String(cell.w));
    if (cell.z) formattedCells.push(String(cell.z));
  }

  return `${textRows} ${formattedCells.join(" ")}`.trim();
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse Excel workbook and extract PricingDocument
 */
export function parsePricingTables(
  workbook: any,
  fileName: string = "import.xlsx",
  options: ParsePricingOptions = {}
): PricingDocument | null {
  return parsePricingTablesWithValidation(workbook, fileName, options).document;
}

export function parsePricingTablesWithValidation(
  workbook: any,
  fileName: string = "import.xlsx",
  options: ParsePricingOptions = {}
): ParsePricingResult {
  try {
    return parsePricingTablesInner(workbook, fileName, options);
  } catch (err) {
    Sentry.captureException(err, { tags: { area: "pricingTableParser" }, extra: { fileName } });
    throw err;
  }
}

function parsePricingTablesInner(
  workbook: any,
  fileName: string = "import.xlsx",
  options: ParsePricingOptions = {}
): ParsePricingResult {
  const strict = options.strict === true;
  const parserWarnings: string[] = [];
  const parserErrors: string[] = [];
  let headerRowIdx: number | null = null;
  let respMatrixCategoryCount = 0;
  let respMatrixUsedSheet: string | null = null;
  let respMatrixCandidates: string[] = [];

  const fail = (message: string, marginSheetName: string | null): ParsePricingResult => {
    parserErrors.push(message);
    return {
      document: null,
      validation: buildValidationReport({
        strict,
        errors: parserErrors,
        warnings: parserWarnings,
        marginSheetDetected: marginSheetName,
        headerRowIndex: headerRowIdx,
        sectionCount: 0,
        respMatrixSheetCandidates: respMatrixCandidates,
        respMatrixSheetUsed: respMatrixUsedSheet,
        respMatrixCategoryCount,
      }),
    };
  };

  // 1. Find Margin Analysis sheet (fuzzy: Margin-Analysis, Margin Analysis (CAD), etc.)
  const sheetName = findMarginAnalysisSheet(workbook);
  if (!sheetName) {
    return fail("No Margin Analysis tab found. This file may not be an ANC Cost Analysis workbook — expected a tab named 'Margin Analysis'.", null);
  }
  console.log(`[PRICING PARSER] Found sheet: "${sheetName}"`);

  // 2. Get sheet data as 2D array
  const xlsx = require("xlsx");
  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // 2b. Extract hidden row metadata from Excel
  const hiddenRowSet = new Set<number>();
  if (sheet['!rows']) {
    (sheet['!rows'] as any[]).forEach((rowInfo: any, idx: number) => {
      if (rowInfo?.hidden === true) hiddenRowSet.add(idx);
    });
  }
  if (hiddenRowSet.size > 0) {
    console.log(`[PRICING PARSER] Hidden rows detected: ${hiddenRowSet.size} rows`);
  }

  // 3. Detect currency from sheet name + cell content (first 20 rows)
  const currencySample = buildCurrencyDetectionSample(sheet, data);
  const currency = detectCurrency(sheetName, currencySample);
  console.log(`[PRICING PARSER] Detected currency: ${currency}`);

  // 4. Find column headers
  let columnMap = findColumnHeaders(data);
  if (!columnMap) {
    return fail("Could not find 'Cost' or 'Selling Price' columns in the Margin Analysis tab. This may be a different template format — expected standard ANC column headers.", sheetName);
  }
  console.log(`[PRICING PARSER] Column map: label@${columnMap.label}, cost@${columnMap.cost}, sell@${columnMap.sell}`);

  // 5. Parse all rows with metadata (standard detection)
  headerRowIdx = findHeaderRowIndex(data, columnMap);
  if (!Number.isFinite(headerRowIdx) || headerRowIdx < 0) {
    return fail("Could not locate header row for pricing columns", sheetName);
  }
  let rows = parseAllRows(data, columnMap, headerRowIdx, hiddenRowSet);
  console.log(`[PRICING PARSER] Parsed ${rows.length} rows (${hiddenRowSet.size} hidden)`);

  // 5b. Extract header row label (e.g. "TOTAL:") — used for summary section naming
  const headerRowLabel = String(data[headerRowIdx]?.[columnMap.label] ?? "").trim();
  console.log(`[PRICING PARSER] Header row ${headerRowIdx} label: "${headerRowLabel}"`);

  // 6. Identify table boundaries (standard)
  let boundaries = findTableBoundaries(rows, headerRowLabel);
  const hasAnyNumericPricingRows = rows.some(
    (r) =>
      !r.isEmpty &&
      !r.isHeader &&
      !r.isAlternateHeader &&
      (Number.isFinite(r.sell) || Number.isFinite(r.cost))
  );

  // Fallback: if no boundaries detected, attempt safe single-table mode first.
  // Some budget workbooks provide one continuous pricing block under one header row.
  if (boundaries.length === 0) {
    if (hasAnyNumericPricingRows) {
      const singleTableName = headerRowLabel || sheetName;
      boundaries = buildSingleTableBoundary(rows, singleTableName);
      parserWarnings.push(`No section headers detected — parsed as single table "${singleTableName}"`);
      console.warn(`[PRICING PARSER] No section headers detected; using single-table mode: "${singleTableName}"`);
    }
  }

  // Secondary fallback: if still no boundaries, attempt flexible column shift + single-table mode.
  if (boundaries.length === 0) {
    if (strict) {
      return fail("No viable pricing sections detected", sheetName);
    }
    console.warn("[PRICING PARSER] No section headers detected. Attempting fallback parsing...");
    parserWarnings.push("No section headers detected — used fallback parsing");

    const shiftedMap = deriveBestShiftedColumnMap(data, headerRowIdx, columnMap);
    if (shiftedMap) {
      const isShifted =
        shiftedMap.label !== columnMap.label ||
        shiftedMap.cost !== columnMap.cost ||
        shiftedMap.sell !== columnMap.sell;

      if (isShifted) {
        const shiftMsg = `Column shift applied: label@${shiftedMap.label}, cost@${shiftedMap.cost}, sell@${shiftedMap.sell}`;
        console.warn(`[PRICING PARSER] ${shiftMsg}`);
        parserWarnings.push(shiftMsg);
        columnMap = shiftedMap;
        rows = parseAllRows(data, columnMap, headerRowIdx, hiddenRowSet);
      }
    }

    // If still no boundaries, treat entire sheet as a single table (mirror mode)
    boundaries = findTableBoundaries(rows, headerRowLabel);
    if (boundaries.length === 0) {
      boundaries = buildSingleTableBoundary(rows, sheetName);
    }
  }

  console.log(`[PRICING PARSER] Found ${boundaries.length} table(s)`);
  if (strict && boundaries.length === 0) {
    return fail("No pricing table boundaries detected", sheetName);
  }

  // 7. Extract PricingTable for each boundary
  let tables = boundaries.map((boundary, idx) =>
    extractTable(rows, boundary, idx, currency)
  );
  if (strict && tables.length === 0) {
    return fail("No pricing tables extracted", sheetName);
  }
  // Filter out empty alternate sections (e.g. placeholder "Alternates - Add to Cost Above" with $0 lines)
  tables = tables.filter((t) => t.items.length > 0 || t.alternates.length > 0 || !t.isAlternateSection);
  if (strict && tables.some((t) => t.items.length === 0 && t.alternates.length === 0)) {
    return fail("One or more pricing sections are empty", sheetName);
  }

  // 8. Calculate document total
  // Mirror rule: trust Excel's "SUB TOTAL (BID FORM)" if present as a global total.
  const globalTotal = findGlobalDocumentTotal(rows, boundaries);
  // If the workbook has a document-level total row but no explicit roll-up section,
  // synthesize one so UI auto-detection can select a master summary table.
  tables = prependSyntheticRollupTable(tables, globalTotal, currency);
  const documentTotal = Number.isFinite(globalTotal)
    ? (globalTotal as number)
    : tables.reduce((sum, t) => sum + t.grandTotal, 0);
  if (strict && !Number.isFinite(documentTotal)) {
    return fail("Document total is not a valid number", sheetName);
  }

  // 9. Parse Resp Matrix (Statement of Work) if present
  const respMatrixResult = parseRespMatrixDetailed(workbook);
  const respMatrix = respMatrixResult.matrix;
  respMatrixCategoryCount = respMatrix?.categories?.length || 0;
  respMatrixUsedSheet = respMatrixResult.usedSheet;
  respMatrixCandidates = respMatrixResult.sheetCandidates;
  if (strict && respMatrixCandidates.length > 0 && (!respMatrix || respMatrixCategoryCount === 0)) {
    const details = respMatrixResult.errors.join("; ") || "Resp Matrix candidates were found but parsing returned no categories";
    return fail(details, sheetName);
  }

  // 10. Build metadata
  const validation = buildValidationReport({
    strict,
    errors: parserErrors,
    warnings: parserWarnings,
    marginSheetDetected: sheetName,
    headerRowIndex: headerRowIdx,
    sectionCount: tables.length,
    respMatrixSheetCandidates: respMatrixCandidates,
    respMatrixSheetUsed: respMatrixUsedSheet,
    respMatrixCategoryCount,
  });
  const metadata = {
    importedAt: new Date().toISOString(),
    fileName,
    tablesCount: tables.length,
    itemsCount: tables.reduce((sum, t) => sum + t.items.length, 0),
    alternatesCount: tables.reduce((sum, t) => sum + t.alternates.length, 0),
    warnings: parserWarnings.length > 0 ? parserWarnings : undefined,
    validation,
    parserStrictVersion: PRICING_PARSER_STRICT_VERSION,
    sourceWorkbookHash: options.sourceWorkbookHash,
  };

  // Diagnostic: log each table's breakdown
  if (tables.length > 0) {
    const t0 = tables[0];
    console.log(`[PRICING PARSER] tables[0] (summary): name="${t0.name}", items=${t0.items.length}, grandTotal=${t0.grandTotal.toFixed(2)}`);
  }
  for (const t of tables) {
    console.log(`[PRICING PARSER]   Table "${t.name}": ${t.items.length} items, subtotal=${t.subtotal.toFixed(2)}, tax=${t.tax?.amount?.toFixed(2) || '0'}, bond=${t.bond.toFixed(2)}, grandTotal=${t.grandTotal.toFixed(2)}, alternates=${t.alternates.length}`);
  }
  const globalTotalLog = Number.isFinite(globalTotal) ? (globalTotal as number).toFixed(2) : 'not found';
  console.log(`[PRICING PARSER] Global "SUB TOTAL (BID FORM)": ${globalTotalLog}`);
  console.log(`[PRICING PARSER] documentTotal: ${documentTotal.toFixed(2)} (${Number.isFinite(globalTotal) ? 'from global total row' : 'sum of table grandTotals'})`);
  console.log(`[PRICING PARSER] Complete: ${metadata.tablesCount} tables, ${metadata.itemsCount} items, ${metadata.alternatesCount} alternates`);

  return {
    document: {
      tables,
      mode: "MIRROR",
      sourceSheet: sheetName,
      currency,
      documentTotal,
      respMatrix: respMatrix ?? undefined,
      metadata,
    },
    validation,
  };
}
