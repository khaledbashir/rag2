import { describe, expect, it } from "vitest";
import { newColumn, newRow, newTable, normalizeTable } from "./resolve";
import type { FreeformTable } from "./types";

async function renderFreeform(tables: FreeformTable[]): Promise<string> {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const Module = (await import("../../app/components/templates/proposal-pdf/sections/PdfFreeformTables")).default;
  const colors = {
    primary: "#0A52EF",
    primaryDark: "#003b8f",
    primaryLight: "#e6efff",
    text: "#1f2937",
    textMuted: "#6b7280",
    borderLight: "#e5e7eb",
  } as any;
  return renderToStaticMarkup(React.createElement(Module, { colors, tables }));
}

function buildManualTable(): FreeformTable {
  const description = newColumn("Editor description", "left");
  const pricing = newColumn("Editor pricing", "right");
  const table: FreeformTable = { ...newTable("DESCRIPTION OF WORK"), columns: [description, pricing], rows: [] };
  table.rows = [
    { id: "r1", style: "header", cells: { [description.id]: "LFC GANTRY DEMO", [pricing.id]: "PRICING" } },
    { id: "r2", style: "normal", cells: { [description.id]: "Gantry Demo, Walking Deck and Bracket Removal", [pricing.id]: "£11,250" } },
    { id: "r3", style: "normal", cells: { [description.id]: "Project Management, General Conditions, Travel & Expenses", [pricing.id]: "£350" } },
    { id: "r4", style: "subtotal", cells: { [description.id]: "SUBTOTAL", [pricing.id]: "£11,600" } },
    { id: "r5", style: "tax", cells: { [description.id]: "VAT (20%)", [pricing.id]: "£2,320" } },
    { id: "r6", style: "bond", cells: { [description.id]: "BOND (1.5%)", [pricing.id]: "£174" } },
    { id: "r7", style: "grand-total", cells: { [description.id]: "GRAND TOTAL", [pricing.id]: "£13,920" } },
  ];
  return table;
}

describe("manual table helpers", () => {
  it("creates text-only columns and visual row roles", () => {
    const column = newColumn("Pricing", "right");
    expect(column).toMatchObject({ label: "Pricing", align: "right" });
    expect(column).not.toHaveProperty("type");

    const row = newRow([column], "grand-total");
    expect(row.style).toBe("grand-total");
    expect(row.cells[column.id]).toBe("");
  });

  it("normalizes legacy numeric columns without changing cell text or calculating", () => {
    const legacy = {
      id: "legacy",
      name: "Legacy",
      columns: [{ id: "c1", label: "Price", type: "number" as const }],
      rows: [{ id: "r1", cells: { c1: "1111" } }],
      showTotalsRow: true,
    };
    const normalized = normalizeTable(legacy);
    expect(normalized.columns[0].align).toBe("right");
    expect(normalized.rows[0].cells.c1).toBe("1111");
    expect(normalized.rows[0].style).toBe("normal");
    expect(normalized.showTotalsRow).toBe(false);
  });

  it("preserves tax and bond row roles without calculating them", () => {
    const price = newColumn("Pricing", "right");
    const normalized = normalizeTable({
      id: "t",
      name: "Adjustments",
      columns: [price],
      rows: [
        { id: "r1", style: "tax", cells: { [price.id]: "£2,320" } },
        { id: "r2", style: "bond", cells: { [price.id]: "£174" } },
        { id: "r3", style: "vat" as any, cells: { [price.id]: "£1" } },
      ],
    });
    expect(normalized.rows[0].style).toBe("tax");
    expect(normalized.rows[1].style).toBe("bond");
    // Unknown roles fall back to normal rather than throwing away the row.
    expect(normalized.rows[2].style).toBe("normal");
    expect(normalized.rows[0].cells[price.id]).toBe("£2,320");
  });

  it("backfills added columns and removes deleted cells", () => {
    const table = buildManualTable();
    const firstColumnId = table.columns[0].id;
    const normalized = normalizeTable({
      ...table,
      columns: [table.columns[0]],
      rows: table.rows.map((row) => ({ ...row, cells: { ...row.cells, ghost: "keep out" } })),
    });
    expect(normalized.rows[0].cells).toEqual({ [firstColumnId]: "LFC GANTRY DEMO" });

    const added = newColumn("Notes");
    const withAddedColumn = normalizeTable({ ...normalized, columns: [...normalized.columns, added] });
    expect(withAddedColumn.rows[0].cells[added.id]).toBe("");
  });
});

describe("PdfFreeformTables", () => {
  it("renders exact typed text and visual row roles without currency formatting or totals", async () => {
    const html = await renderFreeform([buildManualTable()]);
    expect(html).toContain("DESCRIPTION OF WORK");
    expect(html).toContain("LFC GANTRY DEMO");
    expect(html).toContain("VAT (20%)");
    expect(html).toContain("£11,250");
    expect(html).toContain("£13,920");
    expect(html).toContain('data-row-style="header"');
    expect(html).toContain('data-row-style="subtotal"');
    expect(html).toContain('data-row-style="tax"');
    expect(html).toContain('data-row-style="bond"');
    expect(html).toContain('data-row-style="grand-total"');
    expect(html).not.toContain("$11,250.00");
    expect(html).not.toContain("Editor description");
    expect(html).not.toContain("Editor pricing");
  });

  it("renders legacy totals as typed rows only and never generates a total", async () => {
    const html = await renderFreeform([{
      id: "legacy",
      name: "Legacy",
      columns: [{ id: "c1", label: "Item", type: "text" }, { id: "c2", label: "Price", type: "number" }],
      rows: [{ id: "r1", cells: { c1: "Manual value", c2: "1111" } }],
      showTotalsRow: true,
    }]);
    expect(html).toContain("1111");
    expect(html).not.toContain("$1,111.00");
    expect(html).not.toContain(">Total<");
  });

  it("renders nothing for empty tables", async () => {
    expect(await renderFreeform([])).toBe("");
    expect(await renderFreeform([{ ...newTable("Empty"), columns: [], rows: [] }])).toBe("");
  });
});
