# Mirror Mode — Natalia's Golden Rules

## The 6 Rules (NEVER BREAK THESE)

1. **NO MATH** — Never recalculate anything. Display exactly what the Excel says.
   - If Excel says 2+2=5, we show 5
   - Parser: `pricingTableParser.ts` (preserves values exactly)

2. **EXACT SECTION ORDER** — Tables appear in the same order as Excel tabs/sections
   - Don't alphabetize, don't regroup, don't "optimize"

3. **EXACT ROW ORDER** — Line items within each table keep Excel ordering
   - Don't sort by price, don't sort by name

4. **SHOW ALTERNATES** — Alternate/optional items must be visible
   - Typically marked as "Alternate" or "ALT" in description
   - Show them in a separate section or with clear labeling

5. **SHOW TAX/BOND EVEN IF $0** — Always display tax and bond line items
   - Even if the value is zero, Natalia needs to see them
   - Clients expect to see these line items

6. **TRUST GRAND TOTAL** — The Excel's grand total is gospel
   - If our subtotals + tax + bond don't match, use Excel's number
   - The grand total displayed must match what Natalia sees in Excel

## Two Parsers — Two Modes

| | Mirror Mode (Natalia) | Intelligence Mode (Matt/Jeremy) |
|---|---|---|
| **Parser** | `pricingTableParser.ts` | `excelImportService.ts` |
| **Math** | NEVER recalculate | Recalculates everything |
| **Values** | Exact from Excel | Computed from cost + margin |
| **Margin formula** | N/A (display only) | `sellingPrice = cost / (1 - marginPercent)` |
| **Usage** | 70-75% | 25-30% |

## Mirror Mode Workflow
1. Natalia uploads Excel from estimator (Matt/Jeremy)
2. Parser extracts tables, rows, totals EXACTLY as-is
3. Preview shows identical layout to Excel
4. Natalia adjusts document mode (Budget/Proposal/LOI)
5. Generates PDF → shares link with client
