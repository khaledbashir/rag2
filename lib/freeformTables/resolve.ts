/** Pure factories and normalization for manual proposal tables. */
import type {
  FreeformColumn,
  FreeformColumnAlignment,
  FreeformRow,
  FreeformRowStyle,
  FreeformTable,
} from "./types";

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

export function newColumn(
  label: string,
  align: FreeformColumnAlignment = "left",
): FreeformColumn {
  return { id: uid("c"), label, align };
}

export function newRow(
  columns: FreeformColumn[],
  style: FreeformRowStyle = "normal",
): FreeformRow {
  const cells: Record<string, string> = {};
  for (const column of columns) cells[column.id] = "";
  return { id: uid("r"), cells, style };
}

export function newTable(name = "DESCRIPTION OF WORK"): FreeformTable {
  return { id: uid("t"), name, columns: [], rows: [] };
}

export function normalizeRowStyle(value: unknown): FreeformRowStyle {
  return value === "header" || value === "subtotal" || value === "grand-total"
    ? value
    : "normal";
}

/**
 * Backfill missing cells when columns are added and remove cells for deleted
 * columns. Existing text is preserved exactly. Legacy numeric columns become
 * right-aligned text columns, with no formatting or calculation.
 */
export function normalizeTable(table: FreeformTable): FreeformTable {
  const columns = table.columns.map((column) => ({
    ...column,
    align: column.align ?? (column.type === "number" ? "right" : "left"),
  }));
  const columnIds = columns.map((column) => column.id);
  const rows = table.rows.map((row) => {
    const cells: Record<string, string> = {};
    for (const id of columnIds) {
      cells[id] = (row.cells?.[id] ?? "").toString();
    }
    return { id: row.id, cells, style: normalizeRowStyle(row.style) };
  });
  return { ...table, columns, rows, showTotalsRow: false };
}
