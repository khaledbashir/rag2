/**
 * Free-form table builder — shared types (Priority 1-tied).
 *
 * A free-form pricing/line-item table the user builds from scratch (no Excel
 * cost sheet required). User-defined columns (named, text or number) and rows
 * of cells. Numbers are stored as strings for editability; totals are computed
 * at render time. Multiple tables per proposal.
 *
 * Structured data so a future DOCX generator can consume the same model.
 */

export type FreeformColumnType = "text" | "number";

export interface FreeformColumn {
  /** Stable id, e.g. "c1". */
  id: string;
  /** User-named header, e.g. "Item", "Qty", "Price". */
  label: string;
  type: FreeformColumnType;
}

/** colId -> string cell value (numbers stored as strings for editability). */
export interface FreeformRow {
  id: string;
  cells: Record<string, string>;
}

export interface FreeformTable {
  id: string;
  /** Table title shown above the table. */
  name: string;
  columns: FreeformColumn[];
  rows: FreeformRow[];
  /** Sum `number` columns into a bold totals row. */
  showTotalsRow: boolean;
}