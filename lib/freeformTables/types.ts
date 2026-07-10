/**
 * Manual proposal table model.
 *
 * This is deliberately presentation-only. Every value is stored and rendered
 * as text; the proposal engine never parses, formats, or calculates a cell.
 */

export type FreeformColumnAlignment = "left" | "center" | "right";
export type FreeformRowStyle =
  | "normal"
  | "header"
  | "subtotal"
  | "tax"
  | "bond"
  | "grand-total";

export interface FreeformColumn {
  /** Stable id, e.g. "c1". */
  id: string;
  /** Editor label used to identify the column; not rendered automatically. */
  label: string;
  /** Visual alignment only. */
  align?: FreeformColumnAlignment;
  /** @deprecated Legacy field accepted for saved drafts; never used for math. */
  type?: "text" | "number";
}

/** colId -> exact text typed by the user. */
export interface FreeformRow {
  id: string;
  cells: Record<string, string>;
  /** Visual role only; it never changes or calculates cell values. */
  style?: FreeformRowStyle;
}

export interface FreeformTable {
  id: string;
  /** Section title shown above the table. */
  name: string;
  columns: FreeformColumn[];
  rows: FreeformRow[];
  /** @deprecated Kept only so old drafts load; automatic totals are disabled. */
  showTotalsRow?: boolean;
}
