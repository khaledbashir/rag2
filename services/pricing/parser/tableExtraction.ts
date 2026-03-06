/**
 * Table Extraction — converts raw rows within a boundary into PricingTable objects
 */

import {
  PricingTable,
  PricingLineItem,
  AlternateItem,
  TaxInfo,
  createTableId,
} from "@/types/pricing";
import { RawRow, parseNumber } from "./rowParser";
import { TableBoundary } from "./boundaryDetection";

/**
 * Extract a PricingTable from rows within a boundary
 */
export function extractTable(
  rows: RawRow[],
  boundary: TableBoundary,
  index: number,
  currency: "CAD" | "USD" | "GBP" | "EUR"
): PricingTable {
  const items: PricingLineItem[] = [];
  let subtotal = 0;
  let tax: TaxInfo | null = null;
  let bond = 0;
  let grandTotal = 0;
  const alternates: AlternateItem[] = [];

  // Extract main items
  for (let i = boundary.startRow; i <= boundary.endRow; i++) {
    const row = rows[i];
    if (!row) continue;

    // Skip the boundary's own header row (the section start).
    // Other isHeader rows within this boundary were rejected by isViableSectionStart
    // and should be treated as line items (e.g. "Control System" with no price).
    if (row.isHeader && i === boundary.startRow) continue;
    // Also skip alternate header at startRow (for standalone alternate boundaries)
    if (row.isAlternateHeader && i === boundary.startRow) continue;

    // Subtotal rows — ALWAYS skip (never become line items)
    if (row.isSubtotal) {
      // Capture the subtotal value if this is a pure subtotal row
      if (Number.isFinite(row.sell) && (!row.label || /sub\s*-?\s*total/.test(row.labelNorm))) {
        subtotal = row.sell;
      }
      continue;
    }

    // Capture tax
    if (row.isTax) {
      // Find a cell that looks like a tax rate — must be a bare decimal (0.08875)
      // or explicit percentage (8.875%). Exclude dollar amounts ($10,500.00) which
      // falsely match "0." patterns.
      const rateCellIdx = row.cells.findIndex((c: any) => {
        const s = String(c ?? "").trim();
        if (/[$£€]/.test(s)) return false; // skip currency values
        if (/^\d{1,3}(\.\d+)?%$/.test(s)) return true; // "8.875%", "13%"
        if (/^0\.\d+$/.test(s)) return true; // "0.08875"
        return false;
      });
      const rawRate = rateCellIdx >= 0 ? (parseNumber(row.cells[rateCellIdx]) || 0) : 0;
      let computedRate = rawRate > 1 ? rawRate / 100 : rawRate;
      // Sanity clamp: tax rates above 50% are clearly misparsed dollar amounts
      if (computedRate > 0.50) computedRate = 0;
      tax = {
        label: row.label || "Tax",
        rate: computedRate,
        amount: row.sell || 0,
      };
      continue;
    }

    // Capture bond
    if (row.isBond) {
      bond = Number.isFinite(row.sell) ? row.sell : 0;
      continue;
    }

    // Capture grand total — try sell column first, fall back to cost column
    if (row.isGrandTotal) {
      grandTotal = Number.isFinite(row.sell) ? row.sell
        : Number.isFinite(row.cost) ? row.cost
        : 0;
      continue;
    }

    // Alternate line items
    if (row.isAlternateLine) {
      // If this boundary IS an alternate section (promoted to standalone),
      // treat alternate lines as regular line items, not nested alternates
      if (boundary.isAlternateSection && row.label && (Number.isFinite(row.sell) || Number.isFinite(row.cost))) {
        const effectiveSell = Number.isFinite(row.sell) ? row.sell
          : Number.isFinite(row.cost) ? row.cost : 0;
        items.push({
          description: row.label,
          sellingPrice: effectiveSell,
          cost: Number.isFinite(row.cost) ? row.cost : undefined,
          isIncluded: false,
          sourceRow: row.rowIndex,
          isHidden: row.isHidden || undefined,
        });
        continue;
      }
      // If no explicit alternates section, still preserve alternates
      if (boundary.alternatesStartRow === null && row.label && Number.isFinite(row.sell)) {
        alternates.push({
          description: row.label,
          priceDifference: row.sell,
          sourceRow: row.rowIndex,
        });
      }
      continue;
    }

    if (row.label && (Number.isFinite(row.sell) || Number.isFinite(row.cost) || row.hasTextData)) {
      const effectiveSell = Number.isFinite(row.sell)
        ? row.sell
        : Number.isFinite(row.cost)
          ? row.cost
          : 0;
      // Determine isIncluded: only true when Excel literally says "Included" or
      // when the row has a real $0 price with no text override
      const isIncluded = row.hasIncludedText || (effectiveSell === 0 && !row.hasTextData);
      const isExcluded = /^excluded$/i.test(row.originalTextValue);
      const textValue = row.originalTextValue || undefined;
      items.push({
        description: row.label,
        sellingPrice: effectiveSell,
        cost: Number.isFinite(row.cost) ? row.cost : undefined,
        isIncluded,
        isExcluded,
        textValue,
        sourceRow: row.rowIndex,
        isHidden: row.isHidden || undefined,
      });
    } else if (row.label && !row.isEmpty && !row.isSubtotal && !row.isTax && !row.isBond && !row.isGrandTotal && !row.isAlternateHeader) {
      // Text-only rows (e.g. "Control System") with no price data — include as $0 line items
      items.push({
        description: row.label,
        sellingPrice: 0,
        cost: Number.isFinite(row.cost) ? row.cost : undefined,
        isIncluded: true,
        sourceRow: row.rowIndex,
        isHidden: row.isHidden || undefined,
      });
    }
  }

  // Extract alternates
  if (boundary.alternatesStartRow !== null) {
    const endRow = boundary.alternatesEndRow ?? rows.length - 1;
    for (let i = boundary.alternatesStartRow; i <= endRow; i++) {
      const row = rows[i];
      if (!row) continue;

      // Only include alternates with actual descriptions and non-zero prices
      // Skip blank/total rows in the alternates section (e.g., sum rows with £ - or #DIV/0!)
      if (row.isAlternateLine && row.label && Number.isFinite(row.sell) && row.sell !== 0) {
        alternates.push({
          description: row.label,
          priceDifference: row.sell, // Already negative in Excel
          sourceRow: row.rowIndex,
        });
      }
    }
  }

  // If no subtotal found, calculate it
  if (subtotal === 0) {
    subtotal = items.reduce((sum, item) => sum + item.sellingPrice, 0);
  }

  // If no grand total found, calculate it
  if (grandTotal === 0) {
    grandTotal = subtotal + (tax?.amount || 0) + bond;
  }

  // If grandTotal equals subtotal exactly but tax/bond exist separately,
  // the "Total" row was likely a subtotal — recalculate to include tax/bond.
  if (grandTotal > 0 && grandTotal === subtotal && (tax || bond > 0)) {
    grandTotal = subtotal + (tax?.amount || 0) + bond;
  }

  const sanitizedName = boundary.name.replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ').trim();

  return {
    id: createTableId(sanitizedName, index),
    name: sanitizedName,
    currency,
    items,
    subtotal,
    tax,
    bond,
    grandTotal,
    alternates,
    sourceStartRow: boundary.startRow,
    sourceEndRow: boundary.endRow,
    isAlternateSection: boundary.isAlternateSection || false,
  };
}

/**
 * If the workbook has a document-level total row but no explicit roll-up section,
 * synthesize one so UI auto-detection can select a master summary table.
 */
export function prependSyntheticRollupTable(
  tables: PricingTable[],
  globalTotal: number | null,
  currency: "CAD" | "USD" | "GBP" | "EUR"
): PricingTable[] {
  if (!tables.length || !Number.isFinite(globalTotal)) return tables;

  const rollUpRegex =
    /\b(total|roll.?up|summary|project\s+grand|grand\s+total|project\s+total|cost\s+summary|pricing\s+summary|roll.?up\s+summary)\b/i;
  if (tables.some((t) => rollUpRegex.test((t.name || "").toString()))) {
    return tables;
  }

  const summaryItems: PricingLineItem[] = tables.map((t, idx) => ({
    description: t.name || `Section ${idx + 1}`,
    sellingPrice: Number.isFinite(t.grandTotal) ? t.grandTotal : 0,
    isIncluded: false,
  }));
  const summarySubtotal = summaryItems.reduce((sum, item) => sum + item.sellingPrice, 0);
  const summaryTable: PricingTable = {
    id: createTableId("Project Grand Total", 0),
    name: "Project Grand Total",
    currency,
    items: summaryItems,
    subtotal: summarySubtotal,
    tax: null,
    bond: 0,
    grandTotal: globalTotal as number,
    alternates: [],
    sourceStartRow: -1,
    sourceEndRow: -1,
  };

  return [summaryTable, ...tables];
}
