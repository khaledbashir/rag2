/**
 * Column Detection — finds pricing column headers and header row index.
 * Handles dynamic column mapping and shifted-column fallback.
 */

import type { ColumnMap } from "./types";
import { parseNumber } from "./rowParser";

/**
 * Find column headers dynamically
 */
export function findColumnHeaders(data: any[][]): ColumnMap | null {
  const norm = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

  // Search first 40 rows for header row
  for (let i = 0; i < Math.min(data.length, 40); i++) {
    const row = data[i] || [];
    const cells = row.map(norm);

    // Find cost column
    const costIdx = cells.findIndex((c) =>
      c === "cost" ||
      c === "budgeted cost" ||
      c === "total cost" ||
      c === "project cost"
    );

    // Find sell column
    const sellIdx = cells.findIndex((c) =>
      c === "selling price" ||
      c === "sell price" ||
      c === "revenue" ||
      c === "sell" ||
      c === "price" ||
      c === "total price" ||
      c === "amount"
    );

    if (costIdx !== -1 && sellIdx !== -1) {
      // Label is typically to the left of cost, or column 0
      const labelIdx = costIdx > 0 ? costIdx - 1 : 0;

      // Margin columns (optional)
      const marginIdx = cells.findIndex((c) =>
        c === "margin $" || c === "margin amount" || c === "margin"
      );
      const marginPctIdx = cells.findIndex((c) =>
        c === "margin %" || c === "margin percent" || c === "%"
      );

      return {
        label: labelIdx,
        cost: costIdx,
        sell: sellIdx,
        margin: marginIdx !== -1 ? marginIdx : sellIdx + 1,
        marginPct: marginPctIdx !== -1 ? marginPctIdx : sellIdx + 2,
      };
    }
  }

  return null;
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
      cells[columnMap.sell] === "revenue"
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Derive a shifted column map if data appears offset from headers.
 * Only used as a fallback when standard parsing yields no sections.
 */
export function deriveBestShiftedColumnMap(
  data: any[][],
  headerRowIdx: number,
  baseMap: ColumnMap
): ColumnMap | null {
  const shifts = [0, -1, 1, -2, 2];
  const start = Math.max(headerRowIdx + 1, 0);
  const end = Math.min(data.length, start + 40);

  const isTextLabel = (v: any) =>
    typeof v === "string" && /[a-z]/i.test(v) && v.trim().length > 0;
  const isNumeric = (v: any) => Number.isFinite(parseNumber(v));

  let bestShift = 0;
  let bestScore = -Infinity;

  for (const shift of shifts) {
    const labelIdx = baseMap.label + shift;
    const costIdx = baseMap.cost + shift;
    const sellIdx = baseMap.sell + shift;
    const marginIdx = baseMap.margin + shift;
    const marginPctIdx = baseMap.marginPct + shift;

    if (labelIdx < 0 || costIdx < 0 || sellIdx < 0 || marginIdx < 0 || marginPctIdx < 0) continue;

    let labelText = 0;
    let labelNumeric = 0;
    let costNumeric = 0;
    let sellNumeric = 0;

    for (let i = start; i < end; i++) {
      const row = data[i] || [];
      const labelVal = row[labelIdx];
      if (isTextLabel(labelVal)) labelText++;
      else if (isNumeric(labelVal)) labelNumeric++;

      if (isNumeric(row[costIdx])) costNumeric++;
      if (isNumeric(row[sellIdx])) sellNumeric++;
    }

    const score = labelText * 5 + (costNumeric + sellNumeric) - labelNumeric * 2;
    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  if (bestScore === -Infinity) return null;

  return {
    label: baseMap.label + bestShift,
    cost: baseMap.cost + bestShift,
    sell: baseMap.sell + bestShift,
    margin: baseMap.margin + bestShift,
    marginPct: baseMap.marginPct + bestShift,
  };
}
