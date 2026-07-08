import { describe, expect, it } from "vitest";
import { columnTotal, formatCurrency, newColumn, newRow, newTable, normalizeTable } from "./resolve";
import type { FreeformTable } from "./types";

async function renderFreeform(tables: FreeformTable[]): Promise<string> {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const Mod = (await import("../../app/components/templates/proposal-pdf/sections/PdfFreeformTables")).default;
  const colors = {
    primary: "#1f4e79", primaryDark: "#1f4e79", primaryLight: "#dbe5f1", text: "#1f2937", textMuted: "#6b7280",
  } as any;
  return renderToStaticMarkup(React.createElement(Mod, { colors, tables }));
}

function buildTable(): FreeformTable {
  const item = newColumn("Item", "text");
  const price = newColumn("Price", "number");
  const t = { ...newTable("Pricing"), columns: [item, price], rows: [], showTotalsRow: true };
  t.rows = [
    { id: "r1", cells: { [item.id]: "Install labor", [price.id]: "5000" } },
    { id: "r2", cells: { [item.id]: "Parts", [price.id]: "1500.50" } },
    { id: "r3", cells: { [item.id]: "N/A", [price.id]: "" } },
  ];
  return t;
}

describe("freeform table helpers", () => {
  it("factories produce stable shapes", () => {
    const t = newTable("My Table");
    expect(t.name).toBe("My Table");
    expect(t.columns).toEqual([]);
    expect(t.rows).toEqual([]);
    expect(t.showTotalsRow).toBe(false);

    const col = newColumn("Qty", "number");
    expect(col.type).toBe("number");
    const row = newRow([col]);
    expect(row.cells[col.id]).toBe("");
  });

  it("columnTotal sums number columns and ignores blanks/non-numeric", () => {
    const t = buildTable();
    const priceCol = t.columns[1].id;
    expect(columnTotal(t, priceCol)).toBeCloseTo(6500.5, 2);
    // text columns total to 0
    expect(columnTotal(t, t.columns[0].id)).toBe(0);
    // unknown column total to 0
    expect(columnTotal(t, "nope")).toBe(0);
  });

  it("normalizeTable backfills missing cells and drops removed columns", () => {
    const t = buildTable();
    const itemCol = t.columns[0].id;
    const priceCol = t.columns[1].id;
    // remove the price column; add a stray cell for a non-existent column
    const cols = t.columns.filter((c) => c.id !== priceCol);
    const rows = t.rows.map((r) => ({ id: r.id, cells: { ...r.cells, ghost: "x" } }));
    const norm = normalizeTable({ ...t, columns: cols, rows });
    // ghost cell dropped, price cell dropped, item cell retained
    expect(norm.rows[0].cells).toEqual({ [itemCol]: "Install labor" });
    // adding a new column: cells backfilled to ""
    const withNew = normalizeTable({ ...norm, columns: [...cols, newColumn("Notes", "text")] });
    const newId = withNew.columns[1].id;
    expect(withNew.rows[0].cells[newId]).toBe("");
  });

  it("formatCurrency formats USD with 2 decimals", () => {
    expect(formatCurrency(6500.5)).toBe("$6,500.50");
    expect(formatCurrency(0)).toBe("$0.00");
  });
});

describe("PdfFreeformTables render", () => {
  it("renders column headers, rows, and a summed totals row", async () => {
    const html = await renderFreeform([buildTable()]);
    // Table title
    expect(html).toContain("Pricing");
    // Column headers
    expect(html).toContain("Item");
    expect(html).toContain("Price");
    // Row content (text cell)
    expect(html).toContain("Install labor");
    expect(html).toContain("Parts");
    // Numeric cells formatted as currency
    expect(html).toContain("$5,000.00");
    expect(html).toContain("$1,500.50");
    // Totals row sums the number column (5000 + 1500.50)
    expect(html).toContain("Total");
    expect(html).toContain("$6,500.50");
  });

  it("renders nothing for empty tables / no columns", async () => {
    expect(await renderFreeform([])).toBe("");
    const empty = { ...newTable("Empty"), columns: [], rows: [] };
    expect(await renderFreeform([empty])).toBe("");
  });
});