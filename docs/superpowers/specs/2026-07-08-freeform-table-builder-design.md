# P1-tied — Free-form Table Builder (Builder-from-scratch)

**Date:** 2026-07-08
**Status:** Approved (build)
**Project:** ANC Proposal Engine (rag2)
**Scope:** Priority 1 (tied) — True "builder from scratch" mode for pricing/line items

## Context

Natalia's P1-tied ask (item D): a true free-form builder for pricing/line items so service people can build a proposal without a pre-existing Excel "cost sheet." User can add any number of columns and rows, name columns/headers however they want, and it's simple text + numbers. Usable for both service proposals and LED proposals.

Today the engine has: a fixed 4-column `quoteItems` builder (`Step3Math.tsx`, location/description/price) and the Mirror-derived `PricingTable`/`PricingDocument` (fixed columns: description, sellingPrice, cost, margin, etc.). There is no user-defined column schema. So every pricing table today is either parsed from an uploaded Excel or limited to `quoteItems`'s 4 columns.

## Decisions (made, Ahmad said "go")

1. **Approach 1 storage (matches P1)** — a new `freeformTables` JSON field on `ProposalDetailsSchema`; per-instance, no new Prisma models. Same override-in-`documentConfig` pattern.
2. **Model:** a free-form table = `{ id, name, columns[], rows[], showTotalsRow }`. Columns are user-named + typed (`text` | `number`). Cell values stored as strings (numbers as strings for editability); numeric totals computed at render time. Multiple tables per proposal.
3. **Simple text + numbers** per Natalia — no formulas, no cell-type inference beyond the column type. A `number` column sums into an optional totals row.
4. **Available for all document modes** (service + LED). Rendered as a pricing section in `ProposalTemplate5`, and inside `PdfServiceContract` (service contract mode) when present — so a from-scratch service contract shows the user's pricing table while the verbatim Ravens body stays intact.
5. **Toggle** `showFreeformTables` (default on when a service contract has freeform tables and no Mirror `pricingDocument`).
6. **DOCX-future-proofed** — tables are structured data (columns + rows of typed cells), so a later DOCX generator consumes the same model.

## Architecture

### Data model (`lib/schemas.ts` + `lib/freeformTables/types.ts`)

```ts
interface FreeformColumn { id: string; label: string; type: "text" | "number"; }
interface FreeformRow { id: string; cells: Record<string, string>; } // colId -> value
interface FreeformTable {
  id: string;
  name: string;            // table title shown above the table
  columns: FreeformColumn[];
  rows: FreeformRow[];
  showTotalsRow: boolean;   // sum `number` columns
}
// Schema: freeformTables: z.array(FreeformTable).optional().default([])
//         showFreeformTables: z.boolean().optional().default(true)
```

### Pure helpers (`lib/freeformTables/resolve.ts`)
- `columnTotal(table, colId): number` — sum of numeric cells in a number column (parses floats, ignores non-numeric).
- `newColumn(label, type)`, `newRow(columns)`, `newTable(name)` — factory helpers with stable ids.
- `normalizeTable(t)` — backfill missing cells when columns are added/removed (empty string), drop cells for removed columns.

### PDF rendering (`app/components/templates/proposal-pdf/sections/PdfFreeformTables.tsx`)
- Renders each table: title bar + `<table>` with header row (column labels) + data rows + optional totals row (bold, sums numeric columns).
- Styled to match `PdfPricingTables` (Arial, blue-bar section header, 12px body, right-align numbers).
- Empty table (no columns) renders nothing.

### Builder UI (`app/components/proposal/form/wizard/steps/FreeformTableBuilder.tsx`)
- Reuses `@dnd-kit/sortable` (already a dep, used by `Step3Math` quoteItems) for row reordering.
- Per table: editable name, column manager (add/rename/remove/reorder columns, toggle text/number type), row editor (add/remove/reorder rows, edit each cell via an input), "totals row" toggle.
- Writes to `details.freeformTables` + `details.showFreeformTables` via react-hook-form (autosaved by the existing draft-save loop).
- "Add table" button for multiple tables.

### Integration
- `ProposalTemplate5.tsx`: render `<PdfFreeformTables>` in the pricing section when `showFreeformTables && freeformTables?.length` (before/alongside `PdfPricingTables`). Available in all modes.
- `PdfServiceContract.tsx`: render `<PdfFreeformTables>` after the Compensation block, before exhibits, when freeform tables are present — so a from-scratch service contract shows pricing.
- `Step3Math.tsx` (or Step4Export): render `<FreeformTableBuilder>` so users can build tables. Placed in the pricing step.

## Testing
- `lib/freeformTables/freeformTables.test.ts`: factories, `columnTotal`, `normalizeTable` (add/remove column backfills/prunes cells).
- Render test: `PdfFreeformTables` with a 2-column (Item text, Price number) table + totals row → assert headers, rows, summed total.
- Integration: `ProposalTemplate5` in BUDGET mode with `freeformTables` + `showFreeformTables` → assert table renders in pricing section.
- Byte-identical: existing `quoteItems` and Mirror `PdfPricingTables` paths unchanged (additive).

## Deferred
- Formulas, cell-type auto-inference, currency per column, Excel import of free-form tables, the P2 "show/hide total column" toggle (handled here as a per-table totals-row toggle instead) — out of scope.
- P2 (Mirror Mode for service proposals) and P3 (service estimator) — separate specs.

## Build order
1. Types + schema + pure helpers (TDD).
2. `PdfFreeformTables` renderer.
3. `FreeformTableBuilder` UI.
4. Wire into `ProposalTemplate5` + `PdfServiceContract`.
5. Tests + build + push.