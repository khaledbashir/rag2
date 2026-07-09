import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";

import { parsePricingTablesWithValidation } from "@/services/pricing/pricingTableParser";
import { computeTableTotals } from "@/lib/pricingMath";

/**
 * End-to-end guard for Natalia's 2026-07-09 ask: "can mirror mode type tax %?"
 *
 * Her "San Jose - CPA" sheet keeps the tax RATE in the cost column and the tax
 * AMOUNT in the selling-price column. The parser has to pick the rate out of the
 * TAX row, and pricingMath has to surface it in the label — previously the PDF
 * printed a bare "TAX" and she typed the percentage in by hand.
 *
 * Built from the xlsx lib rather than a binary fixture so the sheet layout under
 * test is readable and reviewable in the diff.
 */
function buildSanJoseWorkbook(): xlsx.WorkBook {
  const rows = [
    ["San Jose - CPA", "Cost", "Selling Price", "Margin $", "Margin %"],
    ["Generator Rental (One Month)", 9000, 9900, 900, 0.1],
    ["Genator Delivery Charge", 1250, 1375, 125, 0.1],
    ["Damage Waiver", 750, 825, 75, 0.1],
    ["Generator Connect and Disconnect", 11460, 12606, 1146, 0.1],
    ["Project Management", 0, 2000, 2000, 1.0],
    ["", 22460, 26706, 4246, 0.159],
    ["TAX", 0.1025, 2737, "", ""],
    ["BOND", 0.0, 0, "", ""],
    ["SUB TOTAL (BID FORM)", "", 29443, 4246, 0.1442],
  ];
  const ws = xlsx.utils.aoa_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  // Mirror Mode identifies an ANC cost workbook by its "Margin Analysis" tab.
  xlsx.utils.book_append_sheet(wb, ws, "Margin Analysis");
  return wb;
}

describe("San Jose - CPA sheet → tax label (Natalia 2026-07-09)", () => {
  it("parses the tax rate out of its own cell and prints it in the label", () => {
    const { document } = parsePricingTablesWithValidation(
      buildSanJoseWorkbook(),
      "san-jose-cpa.xlsx",
      { strict: false },
    );

    const table = document.tables[0];
    expect(table).toBeTruthy();

    // The parser must find 10.25% in the TAX row's cost column.
    expect(table.tax?.rate).toBeCloseTo(0.1025, 6);
    expect(table.tax?.amount).toBe(2737);

    // …and the rendered label must carry it, so the PDF needs no hand-typing.
    const totals = computeTableTotals(table);
    expect(totals.taxLabel).toBe("TAX (10.25%)");

    // Excel's own numbers still mirror exactly — only the label changed.
    expect(totals.tax).toBe(2737);
  });
});
