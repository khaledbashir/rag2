import type ExcelJS from "exceljs";

/**
 * augmentCoverPage — append Natalia's requested cover-page sections to the
 * "Project Overview" sheet of an already-generated scoping workbook.
 *
 * IMPORTANT: this runs ONLY on the estimator export path
 * (app/api/estimator/export-unified/route.ts). It does NOT touch the frozen,
 * RFP-shared generator (services/rfp/pipeline/generateScopingWorkbook.ts), so
 * the RFP analyzer's output is byte-identical by construction.
 *
 * Adds, after the DOCUMENT TOTAL row:
 *   • INFORMATION NEEDED — Client / Venue / Address / Payment Terms /
 *     Statement of Work / Substantial Completion / Change Orders
 *   • WARRANTY OPTIONS — Parts / Labor / Event Support / Pre-Season Checks
 *
 * Source: Natalia's "Book1.xlsx" cover-page field spec + the 2026-06-18 call
 * ("payment terms, taxes, change orders … two or three more lines").
 */

// Match the generator's palette exactly (services/rfp/pipeline/generateScopingWorkbook.ts).
const ANC_BLUE = "FF0A52EF";
const LIGHT_GRAY = "FFF8F9FA";
const WHITE = "FFFFFFFF";

// ANC's standard warranty terms (per the Responsibility Matrix Project-Specific Notes):
// 3-year LED parts, 1-year on-site labor. Shown as defaults until captured per-deal.
const STD_PARTS_WARRANTY = "3 years (standard)";
const STD_LABOR_WARRANTY = "1 year on-site (standard)";

// ANC standard payment schedule: 50 / 20 / 20 / 10 by milestone.
const STD_PAYMENT_TERMS = [
  "50% — on Contract Signing",
  "20% — on Product Shipping",
  "20% — on Substantial Completion",
  "10% — on Final Sign-Off",
].join("\n");

export interface CoverPageData {
  clientName?: string;
  venueName?: string;
  venueAddress?: string;
  paymentTerms?: string; // override; otherwise the standard milestone schedule
  supplyOnly?: boolean; // no install → no SOW
  substantialCompletionDate?: string;
  changeOrders?: string;
  partsWarranty?: string;
  laborWarranty?: string;
  eventSupport?: string;
  preSeasonChecks?: string;
}

function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string): void {
  const r = ws.getRow(row);
  for (const col of [2, 3]) {
    const c = r.getCell(col);
    c.value = col === 2 ? text : "";
    c.font = { bold: true, color: { argb: WHITE }, size: 11, name: "Calibri" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ANC_BLUE } };
  }
}

function kvRow(ws: ExcelJS.Worksheet, row: number, label: string, value: string, shade: boolean): void {
  const r = ws.getRow(row);
  r.getCell(2).value = label;
  r.getCell(2).font = { bold: true, name: "Calibri", size: 10 };
  r.getCell(2).alignment = { vertical: "top" };
  r.getCell(3).value = value;
  r.getCell(3).font = { name: "Calibri", size: 10 };
  r.getCell(3).alignment = { wrapText: true, vertical: "top" };
  if (shade) {
    for (const col of [2, 3]) {
      r.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
    }
  }
  // Give wrapped multi-line values (payment terms) room to breathe.
  if (value.includes("\n")) r.height = 14 * (value.split("\n").length + 0.5);
}

export function augmentCoverPage(wb: ExcelJS.Workbook, data: CoverPageData): void {
  const ws = wb.getWorksheet("Project Overview");
  if (!ws) return; // safe no-op if the sheet name ever changes

  // Find the DOCUMENT TOTAL row; start two rows below it. Fall back to sheet end.
  let anchor = ws.rowCount;
  for (let i = 1; i <= ws.rowCount; i++) {
    if (String(ws.getRow(i).getCell(2).value || "").trim() === "DOCUMENT TOTAL") {
      anchor = i;
      break;
    }
  }
  let row = anchor + 2;

  // ── INFORMATION NEEDED ──
  sectionHeader(ws, row, "INFORMATION NEEDED");
  row++;
  const info: [string, string][] = [
    ["Client Name", data.clientName || "—"],
    ["Venue Name", data.venueName || "—"],
    ["Venue Address", data.venueAddress || "—"],
    ["Payment Terms", data.paymentTerms || STD_PAYMENT_TERMS],
    ["Statement of Work", data.supplyOnly ? "Not included (supply only)" : "Included — full installation scope"],
    ["Substantial Completion Date", data.substantialCompletionDate || "To be confirmed with client"],
    ["Change Orders", data.changeOrders || "None to date"],
  ];
  info.forEach(([label, value], i) => kvRow(ws, row++, label, value, i % 2 === 1));

  row++; // separator

  // ── WARRANTY OPTIONS ──
  sectionHeader(ws, row, "WARRANTY OPTIONS");
  row++;
  const warranty: [string, string][] = [
    ["Parts Warranty", data.partsWarranty || STD_PARTS_WARRANTY],
    ["Labor Warranty", data.laborWarranty || STD_LABOR_WARRANTY],
    ["Event Support", data.eventSupport || "Per agreement"],
    ["Pre-Season Checks", data.preSeasonChecks || "Per agreement"],
  ];
  warranty.forEach(([label, value], i) => kvRow(ws, row++, label, value, i % 2 === 1));
}
