/**
 * Row Parser — row-by-row parsing and type detection
 * (header, subtotal, tax, bond, grand total, alternate)
 */

import { ColumnMap } from "./columnDetection";

export interface RawRow {
  rowIndex: number;
  cells: any[];
  label: string;
  labelNorm: string;
  cost: number;
  sell: number;
  hasTextData: boolean;
  hasIncludedText: boolean;
  hasErrorData: boolean;
  originalTextValue: string;
  margin: number;
  marginPct: number;
  isEmpty: boolean;
  isHeader: boolean;
  hasColumnHeaders: boolean;
  isSubtotal: boolean;
  isTax: boolean;
  isBond: boolean;
  isGrandTotal: boolean;
  isAlternateHeader: boolean;
  isAlternateLine: boolean;
}

// ============================================================================
// SUBTOTAL DETECTION
// ============================================================================

/**
 * Detect rows that are subtotals / sub-section totals and should NEVER
 * become line items.  Catches:
 *   - "Subtotal", "Sub Total", "Sub-Total"
 *   - Blank description with numeric data (common Excel subtotal pattern)
 *   - "5yr Total", "5 Year Total" — period roll-ups
 *   - Anything ending with "Total" (excluding grand/project totals)
 *   - "Extended Warranty 5yr Total" — warranty sub-section totals
 */
export function isSubtotalRow(labelNorm: string, hasNumericData: boolean): boolean {
  // Blank row with numbers = subtotal
  if (!labelNorm && hasNumericData) return true;
  // Explicit subtotal patterns (but NOT "sub total (bid form)" which is grand total)
  if (/sub\s*-?\s*total/.test(labelNorm) && !labelNorm.includes("bid form")) return true;
  // "Xyr Total" or "X year Total" — period subtotals
  if (/\d+\s*yr\s+total/.test(labelNorm)) return true;
  if (/\d+\s*year\s+total/.test(labelNorm)) return true;
  // Extended warranty totals
  if (/^extend(ed)?\s+warranty.*total/.test(labelNorm)) return true;
  // Ends with "total" but NOT grand total / project total / just "total"
  if (
    /total\s*$/.test(labelNorm) &&
    !labelNorm.includes("grand") &&
    !labelNorm.includes("project") &&
    !labelNorm.includes("bid form") &&
    labelNorm !== "total"
  ) return true;
  return false;
}

// ============================================================================
// ROW PARSING
// ============================================================================

/**
 * Parse all rows and add metadata
 */
export function parseAllRows(
  data: any[][],
  columnMap: ColumnMap,
  headerRowIdxOverride?: number
): RawRow[] {
  const norm = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const rows: RawRow[] = [];

  // Find header row index
  const headerRowIdx =
    typeof headerRowIdxOverride === "number"
      ? headerRowIdxOverride
      : findHeaderRowIndex(data, columnMap);

  // Parse rows after header
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i] || [];
    const label = String(row[columnMap.label] ?? "").trim();
    const labelNorm = norm(label);

    const cost = parseNumber(row[columnMap.cost]);
    const sell = parseNumber(row[columnMap.sell]);
    const margin = parseNumber(row[columnMap.margin]);
    const marginPct = parseNumber(row[columnMap.marginPct]);

    const costRaw = norm(row[columnMap.cost]);
    const sellRaw = norm(row[columnMap.sell]);
    const hasTextData = /^(excluded|included|n\/a|tbd|see above|see below)$/i.test(costRaw) || /^(excluded|included|n\/a|tbd|see above|see below)$/i.test(sellRaw);
    const hasIncludedText = /^(included)$/i.test(costRaw) || /^(included)$/i.test(sellRaw);
    const hasErrorData = /^#(value!|ref!|n\/a|div\/0!|name\?|null!)$/i.test(costRaw) || /^#(value!|ref!|n\/a|div\/0!|name\?|null!)$/i.test(sellRaw);
    // Capture the original text value from the sell column (fallback to cost) for display in PDF
    const originalTextValue = hasTextData
      ? (/^(excluded|included|n\/a|tbd|see above|see below)$/i.test(sellRaw) ? String(row[columnMap.sell] ?? "").trim() : String(row[columnMap.cost] ?? "").trim())
      : "";
    const isEmpty = !label && !Number.isFinite(sell);
    const hasNumericData = Number.isFinite(cost) || Number.isFinite(sell) || hasTextData || hasErrorData;

    // Detect row types
    // A row with "alternate" in its label is an alternate header ONLY if it
    // matches the "alternates - add to cost" pattern.  Rows like
    // "Alternate - Film Room - 163\" All-In-One Display | Cost | Selling Price"
    // are real section headers that happen to contain the word "alternate".
    const costCellNorm = costRaw;
    const sellCellNorm = sellRaw;
    const hasColumnHeaders = costCellNorm === "cost" || costCellNorm === "budgeted cost"
      || sellCellNorm === "selling price" || sellCellNorm === "sell price"
      || sellCellNorm === "sale price" || sellCellNorm === "sales price"
      || sellCellNorm === "revenue" || sellCellNorm === "price";
    const isAlternateAddToCost = /alternate[s]?\s*[-–—]?\s*add\s+to\s+cost/i.test(label);
    const isAlternateDeduct = /alternate[s]?\s*[-–—]?\s*deduct(\s+cost(\s+above)?)?/i.test(label);
    const looksLikeAlternateHeader = labelNorm.includes("alternate") && !hasNumericData && !hasColumnHeaders;
    const isHeader = !isEmpty && !hasNumericData && label.length > 0
      && (!labelNorm.includes("alternate") || hasColumnHeaders)
      && !isAlternateAddToCost
      && !isAlternateDeduct;
    const isSubtotal = isSubtotalRow(labelNorm, hasNumericData);
    const isTax = labelNorm === "tax" || labelNorm.startsWith("tax ")
      || labelNorm === "hst" || labelNorm.startsWith("hst ")
      || labelNorm === "gst" || labelNorm.startsWith("gst ")
      || labelNorm === "vat" || labelNorm.startsWith("vat ")
      || labelNorm === "sales tax" || labelNorm.startsWith("sales tax ");
    const isBond = labelNorm === "bond" || labelNorm === "bond cost" || labelNorm === "performance bond";
    const isGrandTotal = labelNorm.includes("grand total") || labelNorm.includes("sub total (bid form)") || labelNorm === "total" || labelNorm === "project total";
    const isAlternateHeader = isAlternateAddToCost || isAlternateDeduct || (looksLikeAlternateHeader && !hasColumnHeaders);
    const isAlternateLine = labelNorm.startsWith("alt ") || labelNorm.startsWith("alt-") || labelNorm.includes("alternate");

    rows.push({
      rowIndex: i,
      cells: row,
      label,
      labelNorm,
      cost,
      sell,
      hasTextData,
      hasIncludedText,
      hasErrorData,
      originalTextValue,
      margin,
      marginPct,
      isEmpty,
      isHeader,
      hasColumnHeaders,
      isSubtotal,
      isTax,
      isBond,
      isGrandTotal,
      isAlternateHeader,
      isAlternateLine: isAlternateLine && hasNumericData,
    });
  }

  return rows;
}

/**
 * Locate header row index for the given column map.
 */
export function findHeaderRowIndex(data: any[][], columnMap: ColumnMap): number {
  const norm = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < Math.min(data.length, 40); i++) {
    const row = data[i] || [];
    const cells = row.map(norm);
    if (
      cells[columnMap.cost] === "cost" ||
      cells[columnMap.cost] === "budgeted cost" ||
      cells[columnMap.sell] === "selling price" ||
      cells[columnMap.sell] === "sell price" ||
      cells[columnMap.sell] === "sale price" ||
      cells[columnMap.sell] === "sales price" ||
      cells[columnMap.sell] === "revenue"
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse number from cell (handles currency formatting)
 * Defensive: never throws. Returns NaN for unparseable values.
 */
export function parseNumber(value: any): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return isNaN(value) ? NaN : value;
  try {
    const str = String(value).replace(/[$£€C,\s]/g, "").replace(/[()]/g, "-").trim();
    if (!str || str === "-" || str.toUpperCase() === "N/A" || str.toUpperCase() === "INCLUDED") return NaN;
    const result = parseFloat(str);
    return isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}
