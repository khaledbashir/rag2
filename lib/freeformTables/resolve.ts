/**
 * Free-form table pure helpers — factories, totals, normalization.
 *
 * No React, no DB — pure functions so they test cleanly and a future DOCX
 * generator can reuse them.
 */
import type { FreeformColumn, FreeformRow, FreeformTable, FreeformColumnType } from "./types";

let idCounter = 0;
/** Monotonic-ish unique id (test-safe: no Date.now/random). */
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

export function newColumn(label: string, type: FreeformColumnType = "text"): FreeformColumn {
  return { id: uid("c"), label, type };
}

export function newRow(columns: FreeformColumn[]): FreeformRow {
  const cells: Record<string, string> = {};
  for (const c of columns) cells[c.id] = "";
  return { id: uid("r"), cells };
}

export function newTable(name = "Pricing Table"): FreeformTable {
  return { id: uid("t"), name, columns: [], rows: [], showTotalsRow: false };
}

/**
 * Sum the numeric cells of a `number` column. Parses floats, ignores blank and
 * non-numeric values. Returns 0 for text columns / empty tables.
 */
export function columnTotal(table: FreeformTable, columnId: string): number {
  const col = table.columns.find((c) => c.id === columnId);
  if (!col || col.type !== "number") return 0;
  let sum = 0;
  for (const row of table.rows) {
    const raw = (row.cells?.[columnId] ?? "").toString().trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

/**
 * Backfill missing cells when columns are added; drop cells for removed columns.
 * Keeps the row.cells map in sync with the table's current columns.
 */
export function normalizeTable(table: FreeformTable): FreeformTable {
  const colIds = table.columns.map((c) => c.id);
  const rows = table.rows.map((row) => {
    const cells: Record<string, string> = {};
    for (const id of colIds) {
      cells[id] = (row.cells?.[id] ?? "").toString();
    }
    return { id: row.id, cells };
  });
  return { ...table, rows };
}

/** Format a numeric total as USD currency (matches the proposal PDF convention). */
export function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}