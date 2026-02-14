/**
 * Table Boundary Detection — identifies where pricing tables start/end in the row stream.
 * Also finds the global document total across all sections.
 */

import type { RawRow, TableBoundary } from "./types";

/**
 * Find table boundaries (each location = one table)
 *
 * @param headerRowLabel - label from the Excel header row (e.g. "TOTAL:").
 *   When the summary roll-up section shares the same row as the column headers,
 *   the data rows between the header and the first detail-section header are
 *   orphaned.  This parameter lets us recover them as a named summary table.
 */
export function findTableBoundaries(rows: RawRow[], headerRowLabel?: string): TableBoundary[] {
  const boundaries: TableBoundary[] = [];

  // --- Detect orphaned summary rows before the first section header ----------
  // In many ANC Excels the "TOTAL:" row doubles as the column-header row.
  // Data rows that follow (section roll-ups, subtotal, tax, bond, grand total)
  // have no preceding isHeader row and would otherwise be lost.
  const firstHeaderIdx = rows.findIndex(
    (r) => !r.isEmpty && r.isHeader && !r.isAlternateHeader
  );

  if (firstHeaderIdx > 0) {
    // There are rows before the first section header
    const orphanSlice = rows.slice(0, firstHeaderIdx);
    const hasData = orphanSlice.some(
      (r) => !r.isEmpty && (Number.isFinite(r.sell) || Number.isFinite(r.cost))
    );
    if (hasData) {
      // Split orphan range into sub-boundaries at each isGrandTotal row.
      // This prevents multiple sub-sections (e.g. HOE base + Film Room) from
      // being lumped into one boundary where the last grandTotal overwrites
      // earlier ones.
      const grandTotalIndices: number[] = [];
      for (let j = 0; j < firstHeaderIdx; j++) {
        if (rows[j].isGrandTotal) grandTotalIndices.push(j);
      }

      if (grandTotalIndices.length <= 1) {
        // Single or no grandTotal — original behaviour: one boundary
        const name =
          (headerRowLabel || "").replace(/:$/, "").trim() || "Project Summary";
        let endRow = firstHeaderIdx - 1;
        for (let j = firstHeaderIdx - 1; j >= 0; j--) {
          if (!rows[j].isEmpty) { endRow = j; break; }
        }
        boundaries.push({
          name,
          startRow: 0,
          endRow,
          alternatesStartRow: null,
          alternatesEndRow: null,
        });
        console.log(
          `[PRICING PARSER] Summary section "${name}" detected: rows 0–${endRow} (orphaned before first header at ${firstHeaderIdx})`
        );
      } else {
        // Multiple grandTotal rows — split into sub-boundaries
        let subStart = 0;
        const defaultName = (headerRowLabel || "").replace(/:$/, "").trim() || "Project Summary";
        for (let g = 0; g < grandTotalIndices.length; g++) {
          const gtIdx = grandTotalIndices[g];
          // Find a name: look for the nearest preceding header-like row or
          // alternateHeader row within this sub-range.  Fall back to the
          // headerRowLabel for the first sub-section.
          let subName = g === 0 ? defaultName : "";
          if (g > 0) {
            for (let j = subStart; j <= gtIdx; j++) {
              if (rows[j].isAlternateHeader || (rows[j].isHeader && !rows[j].isEmpty)) {
                subName = rows[j].label;
                break;
              }
            }
            if (!subName) subName = `Section ${g + 1}`;
          }
          // Find alternates within this sub-range
          let altStart: number | null = null;
          let altEnd: number | null = null;
          for (let j = subStart; j <= gtIdx; j++) {
            if (rows[j].isAlternateHeader) altStart = j;
            if (rows[j].isAlternateLine && altStart !== null) altEnd = j;
          }
          // endRow: extend past grandTotal to include TAX/BOND/empty rows
          // up to the next sub-section start or orphan range end
          let endRow = gtIdx;
          const nextStart = g < grandTotalIndices.length - 1
            ? grandTotalIndices[g] + 1
            : firstHeaderIdx;
          // Extend to include trailing TAX/BOND rows after grandTotal
          for (let j = gtIdx + 1; j < nextStart; j++) {
            if (!rows[j].isEmpty) endRow = j;
            else break;
          }
          boundaries.push({
            name: subName,
            startRow: subStart,
            endRow,
            alternatesStartRow: altStart,
            alternatesEndRow: altEnd,
          });
          console.log(
            `[PRICING PARSER] Orphan sub-section "${subName}" detected: rows ${subStart}–${endRow}`
          );
          // Next sub-section starts after this grandTotal's trailing rows
          subStart = endRow + 1;
          // Skip empty rows to find real start of next sub-section
          while (subStart < firstHeaderIdx && rows[subStart]?.isEmpty) subStart++;
        }
      }
    }
  }

  // --- Standard section-header detection ------------------------------------
  // Only treat a header row as a real section start if it is followed by at
  // least one regular numeric line item before another header or grand total.
  // This prevents sheet-summary labels (e.g. rebate banners) from creating
  // ghost tables.
  const isViableSectionStart = (headerIdx: number): boolean => {
    const scanLimit = Math.min(rows.length - 1, headerIdx + 40);
    for (let j = headerIdx + 1; j <= scanLimit; j++) {
      const candidate = rows[j];
      if (!candidate || candidate.isEmpty) continue;
      if (candidate.isHeader && !candidate.isAlternateHeader) return false;
      if (candidate.isGrandTotal) return false;
      if (candidate.isTax || candidate.isBond || candidate.isSubtotal || candidate.isAlternateLine || candidate.isAlternateHeader) continue;
      const hasLineValue = Number.isFinite(candidate.sell) || Number.isFinite(candidate.cost);
      if (candidate.label && hasLineValue) return true;
    }
    return false;
  };

  let currentTable: Partial<TableBoundary> | null = null;
  let inAlternates = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Skip empty rows
    if (row.isEmpty) continue;

    // New section header starts a new table
    if (row.isHeader && !row.isAlternateHeader) {
      if (!isViableSectionStart(i)) {
        continue;
      }
      // Close previous table
      if (currentTable && currentTable.name) {
        if (currentTable.endRow === -1) {
          currentTable.endRow = i - 1;
        }
        boundaries.push(currentTable as TableBoundary);
      }

      // Start new table
      currentTable = {
        name: row.label,
        startRow: i,
        endRow: -1,
        alternatesStartRow: null,
        alternatesEndRow: null,
      };
      inAlternates = false;
      continue;
    }

    // Alternates header
    if (row.isAlternateHeader && currentTable) {
      currentTable.alternatesStartRow = i;
      inAlternates = true;
      continue;
    }

    // Grand total marks end of main section
    if (row.isGrandTotal && currentTable && !inAlternates) {
      currentTable.endRow = i;
    }

    // Track alternates end
    if (inAlternates && currentTable && row.isAlternateLine) {
      currentTable.alternatesEndRow = i;
    }
  }

  // Close final table
  if (currentTable && currentTable.name) {
    if (currentTable.endRow === -1) {
      currentTable.endRow = rows.length - 1;
    }
    boundaries.push(currentTable as TableBoundary);
  }

  return boundaries;
}

export function buildSingleTableBoundary(rows: RawRow[], name: string): TableBoundary[] {
  if (!rows.length) return [];
  let alternatesStartRow: number | null = null;
  let alternatesEndRow: number | null = null;
  let inAlternates = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.isAlternateHeader) {
      alternatesStartRow = i;
      inAlternates = true;
      continue;
    }
    if (inAlternates && row.isAlternateLine) {
      alternatesEndRow = i;
    }
  }

  return [
    {
      name,
      startRow: 0,
      endRow: rows.length - 1,
      alternatesStartRow,
      alternatesEndRow,
    },
  ];
}

/**
 * Find the project-level grand total.
 *
 * Strategy (in priority order):
 * 1. If the first boundary is a summary/roll-up table, look for a grand-total
 *    row *within* that boundary (handles the "TOTAL:" header-row case).
 * 2. Otherwise fall back to grand-total rows that appear *before* the first
 *    section header (original logic).
 */
export function findGlobalDocumentTotal(
  rows: RawRow[],
  boundaries: TableBoundary[]
): number | null {
  if (!rows.length || !boundaries.length) return null;

  const rollUpRegex =
    /\b(total|roll.?up|summary|project\s+grand|grand\s+total|project\s+total|cost\s+summary|pricing\s+summary)\b/i;

  // Strategy 1: first boundary is a summary table — look inside it
  const first = boundaries[0];
  if (rollUpRegex.test(first.name || "")) {
    // Scan backwards to find the last grand-total row in the summary block
    for (let i = first.endRow; i >= first.startRow; i--) {
      const row = rows[i];
      if (row && row.isGrandTotal) {
        const val = Number.isFinite(row.sell) ? row.sell : Number.isFinite(row.cost) ? row.cost : NaN;
        if (Number.isFinite(val)) {
          console.log(
            `[PRICING PARSER] Global total found inside summary table "${first.name}" at row ${row.rowIndex}: ${val}`
          );
          return val;
        }
      }
    }
    // Fallback: use subtotal row (blank-label row with sell or cost value)
    for (let i = first.endRow; i >= first.startRow; i--) {
      const row = rows[i];
      if (row && row.isSubtotal && !row.label) {
        const val = Number.isFinite(row.sell) ? row.sell : Number.isFinite(row.cost) ? row.cost : NaN;
        if (Number.isFinite(val)) {
          console.log(
            `[PRICING PARSER] Global total from subtotal row in summary table "${first.name}" at row ${row.rowIndex}: ${val}`
          );
          return val;
        }
      }
    }
  }

  // Strategy 2: grand-total rows before the first boundary
  const firstBoundaryStartRowIndex = Math.min(
    ...boundaries.map((b) => {
      const row = rows[b.startRow];
      return row ? row.rowIndex : Number.POSITIVE_INFINITY;
    })
  );
  if (!Number.isFinite(firstBoundaryStartRowIndex)) return null;

  const candidates = rows.filter(
    (r) =>
      r.isGrandTotal &&
      (Number.isFinite(r.sell) || Number.isFinite(r.cost)) &&
      r.rowIndex < firstBoundaryStartRowIndex
  );

  if (!candidates.length) return null;
  const last = candidates[candidates.length - 1];
  return Number.isFinite(last.sell) ? last.sell : last.cost;
}
