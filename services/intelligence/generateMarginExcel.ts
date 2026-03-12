/**
 * Intelligence Mode — Margin Analysis Excel Generator
 *
 * Generates a multi-sheet Excel workbook from the structured JSON
 * produced by the AnythingLLM Intelligence Mode workspace.
 *
 * Sheet 1: "Margin Analysis" — full project summary
 * Sheet 2+: One detail sheet per display group
 */

import ExcelJS from "exceljs";
import { excelCurrencyFmt, excelCurrencyText } from "@/services/pricing/currencyService";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DisplayDetail {
  [key: string]: string | number;
}

export interface DisplayGroup {
  name: string;
  cost: number;
  selling_price: number;
  margin_dollars: number;
  margin_pct: number;
  details: DisplayDetail;
}

export interface ServiceCategory {
  category: string;
  cost: number;
  selling_price: number;
  margin_dollars: number;
  margin_pct: number;
}

export interface ProjectData {
  project_name: string;
  date: string;
  estimate_type: string;
  currency: string;
  displays: DisplayGroup[];
  services: ServiceCategory[];
  subtotal_cost: number;
  subtotal_selling: number;
  tax_label: string;
  tax_amount: number;
  bond_label: string;
  bond_amount: number;
  grand_total_cost: number;
  grand_total_selling: number;
  grand_total_margin: number;
  grand_total_margin_pct: number;
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  ANC_BLUE: "FF0A52EF",
  DARK_HEADER: "FF1F2937",
  WHITE: "FFFFFFFF",
  LIGHT_GRAY: "FFF8F9FA",
  MEDIUM_GRAY: "FFDEE2E6",
  GREEN_BG: "FFD4EDDA",
  RED_BG: "FFFCE4E4",
  AMBER: "FFFFC107",
  GREEN: "FF28A745",
  CYAN: "FF17A2B8",
  ORANGE: "FFFD7E14",
  GRAY: "FF6C757D",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function currencyFormat(currency: string): string {
  return excelCurrencyFmt(currency);
}

function styleHeaderCell(cell: ExcelJS.Cell, bgColor: string = COLORS.DARK_HEADER): void {
  cell.font = { bold: true, color: { argb: COLORS.WHITE }, size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = {
    bottom: { style: "thin", color: { argb: "FF999999" } },
  };
}

function styleTotalRow(row: ExcelJS.Row, colCount: number, bgColor: string = COLORS.GREEN_BG): void {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    cell.border = {
      top: { style: "medium", color: { argb: COLORS.DARK_HEADER } },
      bottom: { style: "medium", color: { argb: COLORS.DARK_HEADER } },
    };
  }
}

function addStripeRow(row: ExcelJS.Row, colCount: number, isEven: boolean): void {
  if (isEven) {
    for (let i = 1; i <= colCount; i++) {
      row.getCell(i).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.LIGHT_GRAY },
      };
    }
  }
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export async function generateMarginAnalysisExcel(data: ProjectData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Intelligence Engine";
  workbook.created = new Date();
  workbook.calcProperties = { fullCalcOnLoad: true };

  const fmt = currencyFormat(data.currency);

  // ━━━ SHEET 1: Margin Analysis Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const summary = workbook.addWorksheet("Margin Analysis", {
    properties: { tabColor: { argb: COLORS.ANC_BLUE } },
  });

  // Title block
  summary.mergeCells("A1:E1");
  const titleCell = summary.getCell("A1");
  titleCell.value = `${data.project_name} — Margin Analysis`;
  titleCell.font = { size: 18, bold: true, color: { argb: COLORS.WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ANC_BLUE } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  summary.getRow(1).height = 36;

  summary.mergeCells("A2:E2");
  const metaCell = summary.getCell("A2");
  metaCell.value = `${data.date}  |  ${data.estimate_type}  |  ${data.currency}`;
  metaCell.font = { size: 11, italic: true, color: { argb: "FF666666" } };
  metaCell.alignment = { horizontal: "center" };

  // Column widths
  summary.getColumn(1).width = 40;
  summary.getColumn(2).width = 18;
  summary.getColumn(3).width = 18;
  summary.getColumn(4).width = 18;
  summary.getColumn(5).width = 14;

  // ── LED Displays Section ──
  let row = 4;
  summary.mergeCells(`A${row}:E${row}`);
  const ledHeader = summary.getCell(`A${row}`);
  ledHeader.value = "LED VIDEO DISPLAYS";
  ledHeader.font = { size: 13, bold: true, color: { argb: COLORS.WHITE } };
  ledHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.DARK_HEADER } };
  ledHeader.alignment = { horizontal: "left" };
  row++;

  // Table headers
  const displayHeaders = ["Display Group", "Cost", "Selling Price", "Margin $", "Margin %"];
  displayHeaders.forEach((h, i) => {
    styleHeaderCell(summary.getCell(row, i + 1), COLORS.ANC_BLUE);
    summary.getCell(row, i + 1).value = h;
  });
  row++;

  // Display rows
  let displaySubCost = 0;
  let displaySubSelling = 0;
  let displaySubMargin = 0;

  data.displays.forEach((d, idx) => {
    const r = summary.getRow(row);
    r.getCell(1).value = d.name;
    r.getCell(1).font = { bold: false };
    r.getCell(2).value = d.cost;
    r.getCell(2).numFmt = fmt;
    r.getCell(3).value = d.selling_price;
    r.getCell(3).numFmt = fmt;
    r.getCell(4).value = d.margin_dollars;
    r.getCell(4).numFmt = fmt;
    r.getCell(5).value = d.margin_pct / 100;
    r.getCell(5).numFmt = "0.0%";
    addStripeRow(r, 5, idx % 2 === 0);

    displaySubCost += d.cost;
    displaySubSelling += d.selling_price;
    displaySubMargin += d.margin_dollars;
    row++;
  });

  // Display subtotal
  const dispSubRow = summary.getRow(row);
  dispSubRow.getCell(1).value = "LED Subtotal";
  dispSubRow.getCell(2).value = displaySubCost;
  dispSubRow.getCell(2).numFmt = fmt;
  dispSubRow.getCell(3).value = displaySubSelling;
  dispSubRow.getCell(3).numFmt = fmt;
  dispSubRow.getCell(4).value = displaySubMargin;
  dispSubRow.getCell(4).numFmt = fmt;
  dispSubRow.getCell(5).value = displaySubSelling > 0 ? displaySubMargin / displaySubSelling : 0;
  dispSubRow.getCell(5).numFmt = "0.0%";
  styleTotalRow(dispSubRow, 5, COLORS.MEDIUM_GRAY);
  row += 2;

  // ── Services Section ──
  summary.mergeCells(`A${row}:E${row}`);
  const svcHeader = summary.getCell(`A${row}`);
  svcHeader.value = "SERVICES & ADDITIONAL COSTS";
  svcHeader.font = { size: 13, bold: true, color: { argb: COLORS.WHITE } };
  svcHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.DARK_HEADER } };
  svcHeader.alignment = { horizontal: "left" };
  row++;

  const svcHeaders = ["Category", "Cost", "Selling Price", "Margin $", "Margin %"];
  svcHeaders.forEach((h, i) => {
    styleHeaderCell(summary.getCell(row, i + 1), COLORS.ANC_BLUE);
    summary.getCell(row, i + 1).value = h;
  });
  row++;

  let svcSubCost = 0;
  let svcSubSelling = 0;
  let svcSubMargin = 0;

  data.services.forEach((s, idx) => {
    const r = summary.getRow(row);
    r.getCell(1).value = s.category;
    r.getCell(2).value = s.cost;
    r.getCell(2).numFmt = fmt;
    r.getCell(3).value = s.selling_price;
    r.getCell(3).numFmt = fmt;
    r.getCell(4).value = s.margin_dollars;
    r.getCell(4).numFmt = fmt;
    r.getCell(5).value = s.margin_pct / 100;
    r.getCell(5).numFmt = "0.0%";
    addStripeRow(r, 5, idx % 2 === 0);

    svcSubCost += s.cost;
    svcSubSelling += s.selling_price;
    svcSubMargin += s.margin_dollars;
    row++;
  });

  // Services subtotal
  const svcSubRow = summary.getRow(row);
  svcSubRow.getCell(1).value = "Services Subtotal";
  svcSubRow.getCell(2).value = svcSubCost;
  svcSubRow.getCell(2).numFmt = fmt;
  svcSubRow.getCell(3).value = svcSubSelling;
  svcSubRow.getCell(3).numFmt = fmt;
  svcSubRow.getCell(4).value = svcSubMargin;
  svcSubRow.getCell(4).numFmt = fmt;
  svcSubRow.getCell(5).value = svcSubSelling > 0 ? svcSubMargin / svcSubSelling : 0;
  svcSubRow.getCell(5).numFmt = "0.0%";
  styleTotalRow(svcSubRow, 5, COLORS.MEDIUM_GRAY);
  row += 2;

  // ── Project Totals ──
  summary.mergeCells(`A${row}:E${row}`);
  const totHeader = summary.getCell(`A${row}`);
  totHeader.value = "PROJECT TOTALS";
  totHeader.font = { size: 13, bold: true, color: { argb: COLORS.WHITE } };
  totHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.DARK_HEADER } };
  row++;

  // Subtotal row
  const subRow = summary.getRow(row);
  subRow.getCell(1).value = "Subtotal (before tax/bond)";
  subRow.getCell(1).font = { bold: true };
  subRow.getCell(2).value = data.subtotal_cost;
  subRow.getCell(2).numFmt = fmt;
  subRow.getCell(3).value = data.subtotal_selling;
  subRow.getCell(3).numFmt = fmt;
  row++;

  // Tax
  if (data.tax_amount > 0) {
    const taxRow = summary.getRow(row);
    taxRow.getCell(1).value = `Tax (${data.tax_label})`;
    taxRow.getCell(3).value = data.tax_amount;
    taxRow.getCell(3).numFmt = fmt;
    row++;
  }

  // Bond
  if (data.bond_amount > 0) {
    const bondRow = summary.getRow(row);
    bondRow.getCell(1).value = `Performance Bond (${data.bond_label})`;
    bondRow.getCell(3).value = data.bond_amount;
    bondRow.getCell(3).numFmt = fmt;
    row++;
  }

  // Grand Total
  row++;
  const grandRow = summary.getRow(row);
  grandRow.getCell(1).value = "GRAND TOTAL";
  grandRow.getCell(2).value = data.grand_total_cost;
  grandRow.getCell(2).numFmt = fmt;
  grandRow.getCell(3).value = data.grand_total_selling;
  grandRow.getCell(3).numFmt = fmt;
  grandRow.getCell(4).value = data.grand_total_margin;
  grandRow.getCell(4).numFmt = fmt;
  grandRow.getCell(5).value = data.grand_total_margin_pct / 100;
  grandRow.getCell(5).numFmt = "0.0%";
  grandRow.height = 28;

  for (let i = 1; i <= 5; i++) {
    const cell = grandRow.getCell(i);
    cell.font = { bold: true, size: 14, color: { argb: COLORS.WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ANC_BLUE } };
    cell.border = {
      top: { style: "medium", color: { argb: COLORS.DARK_HEADER } },
      bottom: { style: "medium", color: { argb: COLORS.DARK_HEADER } },
    };
  }

  // ━━━ SHEET 2+: Display Detail Sheets ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const detailColors = [COLORS.AMBER, COLORS.GREEN, COLORS.CYAN, COLORS.ORANGE, COLORS.GRAY];

  data.displays.forEach((display, idx) => {
    // Truncate name for sheet tab (max 31 chars, Excel limit)
    const sheetName = display.name.length > 31 ? display.name.substring(0, 28) + "..." : display.name;

    const detail = workbook.addWorksheet(sheetName, {
      properties: { tabColor: { argb: detailColors[idx % detailColors.length] } },
    });

    // Title
    detail.mergeCells("A1:C1");
    const dtTitle = detail.getCell("A1");
    dtTitle.value = display.name;
    dtTitle.font = { size: 16, bold: true, color: { argb: COLORS.WHITE } };
    dtTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.ANC_BLUE } };
    dtTitle.alignment = { horizontal: "center", vertical: "middle" };
    detail.getRow(1).height = 32;

    // Summary line
    detail.mergeCells("A2:C2");
    detail.getCell("A2").value = `Cost: ${formatCurrency(display.cost, data.currency)}  |  Selling: ${formatCurrency(display.selling_price, data.currency)}  |  Margin: ${display.margin_pct}%`;
    detail.getCell("A2").font = { size: 11, italic: true };
    detail.getCell("A2").alignment = { horizontal: "center" };

    // Column widths
    detail.getColumn(1).width = 35;
    detail.getColumn(2).width = 20;
    detail.getColumn(3).width = 20;

    // Headers
    let dRow = 4;
    const detHeaders = ["Component", "Value", "Notes"];
    detHeaders.forEach((h, i) => {
      styleHeaderCell(detail.getCell(dRow, i + 1), COLORS.DARK_HEADER);
      detail.getCell(dRow, i + 1).value = h;
    });
    dRow++;

    // Detail rows from the details object
    if (display.details) {
      let detailIdx = 0;
      for (const [key, value] of Object.entries(display.details)) {
        const r = detail.getRow(dRow);
        r.getCell(1).value = key;
        r.getCell(1).font = { bold: key.startsWith("Total") };

        if (typeof value === "number") {
          r.getCell(2).value = value;
          // Currency format for cost-related fields
          if (key.toLowerCase().includes("cost") || key.toLowerCase().includes("price") ||
              key.toLowerCase().includes("shipping") || key.toLowerCase().includes("labor") ||
              key.toLowerCase().includes("electric") || key.toLowerCase().includes("pm") ||
              key.toLowerCase().includes("travel") || key.toLowerCase().includes("engineer") ||
              key.toLowerCase().includes("warrant") || key.toLowerCase().includes("structure") ||
              key.toLowerCase().includes("sponsor") || key.toLowerCase().includes("spare") ||
              key.toLowerCase().includes("processor") || key.toLowerCase().includes("light") ||
              key.toLowerCase().includes("total")) {
            r.getCell(2).numFmt = fmt;
          }
        } else {
          r.getCell(2).value = value;
        }

        // Flag pending items
        if (typeof value === "number" && value === 0 && key.includes("PENDING")) {
          r.getCell(3).value = "PENDING — awaiting estimating team";
          r.getCell(3).font = { italic: true, color: { argb: "FFCC6600" } };
        }

        addStripeRow(r, 3, detailIdx % 2 === 0);

        // Highlight total rows
        if (key.startsWith("Total") || key === "Total LED Cost") {
          styleTotalRow(r, 3, COLORS.MEDIUM_GRAY);
        }

        dRow++;
        detailIdx++;
      }
    }
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

function formatCurrency(value: number, currency: string): string {
  return excelCurrencyText(value, currency);
}
