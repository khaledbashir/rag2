/**
 * Boundary Detection — detecting where sections start/end in the spreadsheet
 */

import { RawRow } from "./rowParser";

export interface TableBoundary {
  name: string;
  startRow: number;
  endRow: number;
  alternatesStartRow: number | null;
  alternatesEndRow: number | null;
  /** True when this boundary represents a promoted alternates section */
  isAlternateSection?: boolean;
}

/**
 * Find table boundaries (each location = one table)
 *
 * @param headerRowLabel - label from the Excel header row (e.g. "TOTAL:").
 *   When the summary roll-up section shares the same row as the column headers,
 *   the data rows between the header and the first detail-section header are
 *   orphaned.  This parameter lets us recover them as a named summary table.
 */
/**
 * Quick viability check for a header row — does it have real line items after it?
 * Used before the full isViableSectionStart (which needs anyPriorHeaderHasColumnHeaders context).
 */
function isViableSectionStartEarly(rows: RawRow[], headerIdx: number): boolean {
  const scanLimit = Math.min(rows.length - 1, headerIdx + 20);
  for (let j = headerIdx + 1; j <= scanLimit; j++) {
    const r = rows[j];
    if (!r || r.isEmpty) continue;
    if (r.isHeader && !r.isAlternateHeader) return false;
    if (r.isGrandTotal) return false;
    if (r.isTax || r.isBond || r.isTariff || r.isSubtotal || r.isAlternateLine || r.isAlternateHeader) continue;
    const hasLineValue = Number.isFinite(r.sell) || Number.isFinite(r.cost);
    if (r.label && hasLineValue) return true;
  }
  return false;
}

export function findTableBoundaries(rows: RawRow[], headerRowLabel?: string): TableBoundary[] {
  const boundaries: TableBoundary[] = [];

  // --- Detect orphaned summary rows before the first section header ----------
  // In many ANC Excels the "TOTAL:" row doubles as the column-header row.
  // Data rows that follow (section roll-ups, subtotal, tax, bond, grand total)
  // have no preceding isHeader row and would otherwise be lost.
  let firstHeaderIdx = rows.findIndex(
    (r) => !r.isEmpty && r.isHeader && !r.isAlternateHeader
  );

  // If the first "header" is not a viable section start (e.g. a warranty row
  // with empty formula results), skip past it to the next viable header.
  // This ensures orphan boundaries include trailing subtotal/tax/bond/GT rows.
  if (firstHeaderIdx > 0 && !isViableSectionStartEarly(rows, firstHeaderIdx)) {
    const nextViable = rows.findIndex(
      (r, i) => i > firstHeaderIdx && !r.isEmpty && r.isHeader && !r.isAlternateHeader
    );
    // No viable header found — all data is one orphan block
    firstHeaderIdx = nextViable >= 0 ? nextViable : rows.length;
  }

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
          // Find alternates within this sub-range — promote to standalone boundary
          let altHeaderIdx: number | null = null;
          let altEnd: number | null = null;
          for (let j = subStart; j <= gtIdx; j++) {
            if (rows[j].isAlternateHeader) altHeaderIdx = j;
            if (rows[j].isAlternateLine && altHeaderIdx !== null) altEnd = j;
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

          // If alternates found, create main boundary WITHOUT alternates, then a standalone alternates boundary
          if (altHeaderIdx !== null) {
            // Main section ends just before alternates header (or at grandTotal if it's before)
            const mainEnd = Math.min(endRow, altHeaderIdx - 1);
            boundaries.push({
              name: subName,
              startRow: subStart,
              endRow: mainEnd,
              alternatesStartRow: null,
              alternatesEndRow: null,
            });
            console.log(
              `[PRICING PARSER] Orphan sub-section "${subName}" detected: rows ${subStart}–${mainEnd}`
            );
            // Standalone alternates boundary
            const altName = rows[altHeaderIdx].label || "Alternates";
            const altEndRow = altEnd ?? endRow;
            boundaries.push({
              name: altName,
              startRow: altHeaderIdx,
              endRow: altEndRow,
              alternatesStartRow: null,
              alternatesEndRow: null,
              isAlternateSection: true,
            });
            console.log(
              `[PRICING PARSER] Standalone alternates "${altName}" detected: rows ${altHeaderIdx}–${altEndRow}`
            );
          } else {
            boundaries.push({
              name: subName,
              startRow: subStart,
              endRow,
              alternatesStartRow: null,
              alternatesEndRow: null,
            });
            console.log(
              `[PRICING PARSER] Orphan sub-section "${subName}" detected: rows ${subStart}–${endRow}`
            );
          }
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
  // Track whether any prior header row had column headers ("Cost", "Selling Price").
  // If so, subsequent headers WITHOUT column headers are likely misclassified line items.
  const anyPriorHeaderHasColumnHeaders = rows.some(
    (r) => !r.isEmpty && r.isHeader && !r.isAlternateHeader && r.hasColumnHeaders
  );

  const isViableSectionStart = (headerIdx: number): boolean => {
    const headerRow = rows[headerIdx];
    const scanLimit = Math.min(rows.length - 1, headerIdx + 40);

    // Count data rows with prices following this header
    let dataRowCount = 0;
    for (let j = headerIdx + 1; j <= scanLimit; j++) {
      const candidate = rows[j];
      if (!candidate || candidate.isEmpty) continue;
      if (candidate.isHeader && !candidate.isAlternateHeader) break;
      if (candidate.isGrandTotal) break;
      if (candidate.isTax || candidate.isBond || candidate.isTariff || candidate.isSubtotal || candidate.isAlternateLine || candidate.isAlternateHeader) continue;
      const hasLineValue = Number.isFinite(candidate.sell) || Number.isFinite(candidate.cost);
      if (candidate.label && hasLineValue) dataRowCount++;
    }

    if (dataRowCount === 0) return false;

    // If prior headers had column headers but this one doesn't, require 2+
    // data rows to distinguish real section headers (e.g. "ADDITIONAL COST CENTERS")
    // from orphan line items (e.g. "Control System" with no price).
    if (anyPriorHeaderHasColumnHeaders && headerRow && !headerRow.hasColumnHeaders) {
      return dataRowCount >= 2;
    }

    return true;
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

    // Alternates header — promote to standalone boundary
    if (row.isAlternateHeader && currentTable) {
      // Close the current main table at the grand total (or just before alternates)
      if (currentTable.endRow === -1) {
        // Find the nearest preceding grandTotal row or use i-1
        let closeRow = i - 1;
        for (let j = i - 1; j >= (currentTable.startRow || 0); j--) {
          if (rows[j].isGrandTotal) { closeRow = j; break; }
          if (!rows[j].isEmpty) { closeRow = j; break; }
        }
        currentTable.endRow = closeRow;
      }
      // Don't nest alternates — push main table as-is (no alternatesStartRow)
      currentTable.alternatesStartRow = null;
      currentTable.alternatesEndRow = null;
      boundaries.push(currentTable as TableBoundary);

      // Start a NEW standalone boundary for the alternates section
      currentTable = {
        name: row.label || "Alternates",
        startRow: i,
        endRow: -1,
        alternatesStartRow: null,
        alternatesEndRow: null,
        isAlternateSection: true,
      };
      inAlternates = true;
      continue;
    }

    // Grand total marks end of main section
    if (row.isGrandTotal && currentTable && !inAlternates) {
      // Document-level grand totals ("BASE BID GRAND TOTAL", "PROJECT TOTAL")
      // should NOT be absorbed into the current section — close the section
      // at the last data row before this grand total instead.
      const isDocumentTotal = /base\s*bid|project\s*total|document\s*total/i.test(row.label);
      if (isDocumentTotal) {
        // Close section at last non-empty row before this document total
        if (currentTable.endRow === -1) {
          let closeRow = (currentTable.startRow || 0);
          for (let j = i - 1; j >= (currentTable.startRow || 0); j--) {
            if (!rows[j].isEmpty) { closeRow = j; break; }
          }
          currentTable.endRow = closeRow;
        }
        boundaries.push(currentTable as TableBoundary);
        currentTable = null;
      } else {
        currentTable.endRow = i;
      }
    }

    // When in alternates mode, close the alt boundary if we hit something
    // that clearly isn't part of the alternates (e.g. grand total, non-alt row)
    if (inAlternates && currentTable) {
      if (row.isGrandTotal) {
        // Grand total after alternates (e.g. "BASE BID GRAND TOTAL") — close alt boundary
        if (currentTable.endRow === -1) {
          // Find last actual alternate line before this grand total
          let closeRow = currentTable.startRow || 0;
          for (let j = i - 1; j >= (currentTable.startRow || 0); j--) {
            if (rows[j].isAlternateLine) {
              closeRow = j; break;
            }
          }
          currentTable.endRow = closeRow;
        }
        boundaries.push(currentTable as TableBoundary);
        currentTable = null;
        inAlternates = false;
      } else if (row.isAlternateLine || (!row.isEmpty && row.label)) {
        // Keep extending the standalone alternates boundary
      }
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
  const result: TableBoundary[] = [];

  // Find alternates header to split into standalone boundary
  let altHeaderIdx: number | null = null;
  let altEndIdx: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.isAlternateHeader && altHeaderIdx === null) {
      altHeaderIdx = i;
    }
    if (altHeaderIdx !== null && row.isAlternateLine) {
      altEndIdx = i;
    }
  }

  if (altHeaderIdx !== null) {
    // Main table ends just before alternates
    const mainEnd = altHeaderIdx - 1;
    result.push({
      name,
      startRow: 0,
      endRow: mainEnd >= 0 ? mainEnd : 0,
      alternatesStartRow: null,
      alternatesEndRow: null,
    });
    // Standalone alternates boundary
    const altName = rows[altHeaderIdx].label || "Alternates";
    result.push({
      name: altName,
      startRow: altHeaderIdx,
      endRow: altEndIdx ?? rows.length - 1,
      alternatesStartRow: null,
      alternatesEndRow: null,
      isAlternateSection: true,
    });
  } else {
    result.push({
      name,
      startRow: 0,
      endRow: rows.length - 1,
      alternatesStartRow: null,
      alternatesEndRow: null,
    });
  }

  return result;
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

  if (candidates.length) {
    const last = candidates[candidates.length - 1];
    return Number.isFinite(last.sell) ? last.sell : last.cost;
  }

  // Strategy 3: grand-total rows AFTER the last boundary (e.g. "BASE BID GRAND TOTAL")
  const lastBoundaryEndRowIndex = Math.max(
    ...boundaries.map((b) => {
      const row = rows[b.endRow];
      return row ? row.rowIndex : 0;
    })
  );
  if (Number.isFinite(lastBoundaryEndRowIndex)) {
    const afterCandidates = rows.filter(
      (r) =>
        r.isGrandTotal &&
        (Number.isFinite(r.sell) || Number.isFinite(r.cost)) &&
        r.rowIndex > lastBoundaryEndRowIndex
    );
    if (afterCandidates.length) {
      const last = afterCandidates[afterCandidates.length - 1];
      console.log(
        `[PRICING PARSER] Global total found AFTER boundaries at row ${last.rowIndex}: ${Number.isFinite(last.sell) ? last.sell : last.cost}`
      );
      return Number.isFinite(last.sell) ? last.sell : last.cost;
    }
  }

  return null;
}
