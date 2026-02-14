/**
 * Table Extraction — converts raw rows within a boundary into PricingTable objects.
 * Also handles synthetic roll-up table prepending.
 */

import type { RawRow, TableBoundary } from "./types";
import { parseNumber } from "./rowParser";
import {
  PricingTable,
  PricingLineItem,
  AlternateItem,
  TaxInfo,
  createTableId,
} from "@/types/pricing";

/**
 * Extract a PricingTable from rows within a boundary
 */
export function extractTable(
  rows: RawRow[],
  boundary: TableBoundary,
  index: number,
  currency: "CAD" | "USD"
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

    // Skip header row
    if (row.isHeader) continue;

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
      const rate = parseNumber(row.cells[row.cells.findIndex((c: any) =>
        String(c).includes("0.") || String(c).includes("%")
      )]) || 0;
      tax = {
        label: row.label || "Tax",
        rate: rate > 1 ? rate / 100 : rate,
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

    // Regular line item
    if (row.isAlternateLine) {
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

    if (row.label && Number.isFinite(row.sell)) {
      items.push({
        description: row.label,
        sellingPrice: row.sell,
        isIncluded: row.sell === 0,
        sourceRow: row.rowIndex,
      });
    }
  }

  // Extract alternates
  if (boundary.alternatesStartRow !== null) {
    const endRow = boundary.alternatesEndRow ?? rows.length - 1;
    for (let i = boundary.alternatesStartRow; i <= endRow; i++) {
      const row = rows[i];
      if (!row) continue;

      if (row.isAlternateLine && row.label && Number.isFinite(row.sell)) {
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

  return {
    id: createTableId(boundary.name, index),
    name: boundary.name,
    currency,
    items,
    subtotal,
    tax,
    bond,
    grandTotal,
    alternates,
    sourceStartRow: boundary.startRow,
    sourceEndRow: boundary.endRow,
  };
}

/**
 * If the workbook has a document-level total row but no explicit roll-up section,
 * synthesize one so UI auto-detection can select a master summary table.
 */
export function prependSyntheticRollupTable(
  tables: PricingTable[],
  globalTotal: number | null,
  currency: "CAD" | "USD"
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
