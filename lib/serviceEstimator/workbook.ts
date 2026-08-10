import ExcelJS from "exceljs";

import { calculateServiceEstimateOptions, listOptions, resolveFlatAmount } from "./engine";
import type {
  BundleDiscountMode,
  ServiceEstimatorCurrency,
  ServiceEstimatorInput,
  ServiceEstimatorOption,
  ServiceEstimatorOptionResult,
  ServiceEstimatorResult,
  ServiceFlatAmount,
  ServiceSectionLabels,
} from "./types";
import { DEFAULT_SECTION_LABELS } from "./types";

const BRAND_BLUE = "FF0A52EF";
const BRAND_NAVY = "FF071A3D";
const LIGHT_BLUE = "FFEAF0FF";
const INPUT_BLUE = "FFDDEBFF";
const LINKED_GREEN = "FFE2F0D9";
const STATIC_GRAY = "FFF2F3F5";
const CAUTION_ORANGE = "FFFFE2B8";
const WHITE = "FFFFFFFF";
const BLACK = "FF111827";

const bundleModeLabel = (mode: BundleDiscountMode): string => {
  if (mode === "apply-to-subtotal") return "Apply to subtotal";
  if (mode === "included-in-rates") return "Included in entered rates";
  return "No bundle discount";
};

const currencyFormat = (currency: ServiceEstimatorCurrency): string => {
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `[${symbol}-en-US]#,##0.00;[Red]([${symbol}-en-US]#,##0.00);-`;
};

const percentFormat = "0.0%;[Red](0.0%);-";

function styleSectionHeader(row: ExcelJS.Row, startColumn: number, endColumn: number) {
  for (let column = startColumn; column <= endColumn; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.alignment = { vertical: "middle" };
  }
  row.height = 21;
}

function styleColumnHeader(row: ExcelJS.Row, startColumn: number, endColumn: number) {
  for (let column = startColumn; column <= endColumn; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: column === startColumn ? "left" : "right" };
  }
  row.height = 20;
}

function styleInputCell(cell: ExcelJS.Cell, source: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_BLUE } };
  cell.font = { color: { argb: BRAND_BLUE } };
  cell.protection = { locked: false };
  cell.note = `Editable input. Initial reference: ${source}`;
}

function styleLinkedCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LINKED_GREEN } };
  cell.font = { color: { argb: BLACK } };
}

/**
 * A typed "type my number" value. Written as a literal so it stays editable in
 * Excel and is never recomputed. An "Included" year writes the word instead of
 * a number — SUM ignores text, so the client is billed nothing for it while the
 * coverage stays visible (Alexis, 2026-07-30).
 */
function writeFlatCell(cell: ExcelJS.Cell, amount: ServiceFlatAmount, numFmt: string) {
  if (amount === "included") {
    cell.value = "Included";
    cell.alignment = { horizontal: "right" };
  } else {
    cell.value = amount;
    cell.numFmt = numFmt;
  }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_BLUE } };
  cell.font = { color: { argb: BRAND_BLUE } };
  cell.protection = { locked: false };
  cell.note = "Typed value — no calculation is applied. Enter a number or the word Included.";
}

/** Author-editable section headings, falling back to the platform defaults. */
function resolveSectionLabels(input: ServiceEstimatorInput): ServiceSectionLabels {
  return { ...DEFAULT_SECTION_LABELS, ...(input.sectionLabels || {}) };
}

function setFormula(
  cell: ExcelJS.Cell,
  formula: string,
  result: number,
  numFmt: string,
) {
  cell.value = { formula, result };
  cell.numFmt = numFmt;
  cell.font = { color: { argb: BLACK } };
}

interface CalculationMatrixRows {
  eventRevenueRows: number[];
  breakFixRevenueRow: number;
  bundleDiscountRow: number | null;
  totalIncomeRow: number;
  operatingExpenseRow: number;
  totalProfitRow: number;
  cashCapexRow: number;
}

function buildOverviewSheet(
  workbook: ExcelJS.Workbook,
  input: ServiceEstimatorInput,
  result: ServiceEstimatorResult,
) {
  const sheet = workbook.addWorksheet("Project Overview");
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: 3 }];
  sheet.mergeCells("B1:F1");
  sheet.getCell("B1").value = "ANC SERVICE ESTIMATOR";
  sheet.getCell("B1").font = { bold: true, color: { argb: WHITE }, size: 18 };
  sheet.getCell("B1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
  sheet.getCell("B1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 32;
  sheet.mergeCells("B2:F2");
  sheet.getCell("B2").value = "Project inputs, contract controls, and live linked totals";
  sheet.getCell("B2").font = { italic: true, color: { argb: "FF526078" } };

  const projectHeader = sheet.getRow(4);
  projectHeader.getCell(2).value = "PROJECT";
  styleSectionHeader(projectHeader, 2, 6);

  const inputRows: Array<[number, string, string | number, string]> = [
    [5, "Client / Team", input.clientName, "Natalia service-estimator brief (2026-07-14)"],
    [6, "Venue / Stadium", input.venueName, "Deal-specific input"],
    [7, "Location", input.location, "Deal-specific input"],
  ];
  for (const [rowNumber, label, value, source] of inputRows) {
    sheet.getCell(rowNumber, 2).value = label;
    sheet.getCell(rowNumber, 3).value = value;
    styleInputCell(sheet.getCell(rowNumber, 3), source);
  }

  const contractHeader = sheet.getRow(9);
  contractHeader.getCell(2).value = "CONTRACT";
  styleSectionHeader(contractHeader, 2, 6);
  const contractRows: Array<[number, string, string | number, string]> = [
    [10, "Term Start", input.contractStart, "Deal-specific input"],
    [11, "Term End", input.contractEnd, "Deal-specific input"],
    [12, "First Contract Year", input.termStartYear, "Deal-specific input"],
    [13, "Term Length (Years)", input.termYears, "Natalia: variable 2/3/5/10-year terms"],
    [14, "Payment Terms", input.paymentTerms, "Deal-specific input"],
    [15, "Currency", input.currency, "Deal-specific input"],
  ];
  for (const [rowNumber, label, value, source] of contractRows) {
    sheet.getCell(rowNumber, 2).value = label;
    sheet.getCell(rowNumber, 3).value = value;
    styleInputCell(sheet.getCell(rowNumber, 3), source);
  }

  const controlsHeader = sheet.getRow(17);
  controlsHeader.getCell(2).value = "PRICING CONTROLS";
  styleSectionHeader(controlsHeader, 2, 6);
  const controlRows: Array<[number, string, string | number, string]> = [
    [18, "Client Revenue Escalation", input.revenueEscalationPct / 100, "Editable pending Alexis rate-card confirmation"],
    [19, "Technician Cost Escalation", input.costEscalationPct / 100, "Editable pending Alexis rate-card confirmation"],
    [20, "Bundle Discount", input.bundleDiscountPct / 100, "Panthers reference workbook note"],
    [21, "Bundle Discount Treatment", bundleModeLabel(input.bundleDiscountMode), "Explicit control; no hidden discount math"],
    [22, "Break/Fix Price Multiplier", input.breakFix.priceMultiplier, "Panthers source formula: expense × 1.62"],
    [23, "Marketing Opportunity Value", input.marketingOpportunityValue, "Optional internal input"],
    [24, "ANC Marketing Share", input.marketingSharePct / 100, "Panthers source workbook uses 20%"],
  ];
  for (const [rowNumber, label, value, source] of controlRows) {
    sheet.getCell(rowNumber, 2).value = label;
    sheet.getCell(rowNumber, 3).value = value;
    styleInputCell(sheet.getCell(rowNumber, 3), source);
  }
  for (const row of [18, 19, 20, 24]) sheet.getCell(row, 3).numFmt = percentFormat;
  for (const row of [23]) sheet.getCell(row, 3).numFmt = currencyFormat(input.currency);

  const summaryHeader = sheet.getRow(26);
  summaryHeader.getCell(2).value = "CONTRACT SUMMARY";
  styleSectionHeader(summaryHeader, 2, 6);
  const summaryRows: Array<[number, string, number, string]> = [
    [27, "Total Contract Income", result.totalContractIncome, currencyFormat(input.currency)],
    [28, "Total Operating Expenses", result.totalContractOperatingExpenses, currencyFormat(input.currency)],
    [29, "Total Contract Profit", result.totalContractProfit, currencyFormat(input.currency)],
    [30, "Upfront Capital Expenditures", result.totalCapex, currencyFormat(input.currency)],
  ];
  for (const [rowNumber, label, value, format] of summaryRows) {
    sheet.getCell(rowNumber, 2).value = label;
    sheet.getCell(rowNumber, 3).value = value;
    sheet.getCell(rowNumber, 3).numFmt = format;
    styleLinkedCell(sheet.getCell(rowNumber, 3));
  }

  sheet.mergeCells("B32:F32");
  sheet.getCell("B32").value =
    "Source reference: Carolina Panthers 2026-2028 Service Contract workbook supplied by Natalia on 2026-07-14. Blue cells are editable inputs; formulas remain live in the Calculation Detail sheet.";
  sheet.getCell("B32").alignment = { wrapText: true, vertical: "top" };
  sheet.getCell("B32").font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };
  sheet.getRow(32).height = 34;

  sheet.getColumn("A").width = 3;
  sheet.getColumn("B").width = 33;
  sheet.getColumn("C").width = 34;
  sheet.getColumn("D").width = 16;
  sheet.getColumn("E").width = 16;
  sheet.getColumn("F").width = 16;
  sheet.getColumn("C").alignment = { wrapText: true, vertical: "top" };
}

function buildCalculationSheet(
  workbook: ExcelJS.Workbook,
  input: ServiceEstimatorInput,
  result: ServiceEstimatorResult,
  option: ServiceEstimatorOption,
  sheetName: string,
): CalculationMatrixRows {
  const sheet = workbook.addWorksheet(sheetName);
  // The estimate's shared facts (term, escalation, capex, marketing) live on the
  // Project Overview; only the service lines vary between options.
  const events = option.events;
  const breakFix = option.breakFix;
  const moneyFormat = currencyFormat(input.currency);
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: 4 }];
  sheet.mergeCells("A1:G1");
  sheet.getCell("A1").value = "SERVICE ESTIMATOR — LIVE CALCULATION DETAIL";
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
  sheet.getCell("A1").font = { bold: true, color: { argb: WHITE }, size: 16 };
  sheet.getRow(1).height = 30;

  const labels = resolveSectionLabels(input);
  const eventHeader = sheet.getRow(3);
  eventHeader.getCell(1).value = labels.eventSupport.toUpperCase();
  styleSectionHeader(eventHeader, 1, 7);
  const eventColumnHeader = sheet.getRow(4);
  ["Service Line", "Days", "Technicians", "Client Day Rate", "Technician Day Cost", "Base Revenue", "Base Cost"].forEach(
    (label, index) => {
      eventColumnHeader.getCell(index + 1).value = label;
    },
  );
  styleColumnHeader(eventColumnHeader, 1, 7);

  const eventInputRows: number[] = [];
  events.forEach((event, index) => {
    const rowNumber = 5 + index;
    eventInputRows.push(rowNumber);
    const row = sheet.getRow(rowNumber);
    row.values = [
      event.name,
      event.days,
      event.technicians,
      event.clientDayRate,
      event.technicianDayCost,
    ];
    setFormula(row.getCell(6), `B${rowNumber}*C${rowNumber}*D${rowNumber}`, result.years[0].eventLines[index].revenue, moneyFormat);
    setFormula(row.getCell(7), `B${rowNumber}*C${rowNumber}*E${rowNumber}`, result.years[0].eventLines[index].cost, moneyFormat);
    for (let column = 1; column <= 5; column += 1) {
      styleInputCell(row.getCell(column), "Deal-specific event input; Panthers workbook provides the initial structure");
    }
    row.getCell(4).numFmt = moneyFormat;
    row.getCell(5).numFmt = moneyFormat;
  });

  const breakFixHeaderRow = 6 + events.length;
  const breakFixHeader = sheet.getRow(breakFixHeaderRow);
  breakFixHeader.getCell(1).value = labels.breakFix.toUpperCase();
  styleSectionHeader(breakFixHeader, 1, 7);
  const breakFixColumns = sheet.getRow(breakFixHeaderRow + 1);
  ["Service Line", "Enabled", "Days", "Technicians", "Hours / Day", "Hourly Cost", "Price Multiplier"].forEach(
    (label, index) => {
      breakFixColumns.getCell(index + 1).value = label;
    },
  );
  styleColumnHeader(breakFixColumns, 1, 7);
  const breakFixInputRow = breakFixHeaderRow + 2;
  const breakFixRow = sheet.getRow(breakFixInputRow);
  breakFixRow.values = [
    breakFix.label,
    breakFix.enabled,
    breakFix.days,
    breakFix.technicians,
    breakFix.hoursPerDay,
    breakFix.technicianHourlyCost,
    breakFix.priceMultiplier,
  ];
  for (let column = 1; column <= 7; column += 1) {
    styleInputCell(breakFixRow.getCell(column), "Panthers workbook reference; editable per deal");
  }
  breakFixRow.getCell(6).numFmt = moneyFormat;

  const capexHeaderRow = breakFixInputRow + 2;
  const capexHeader = sheet.getRow(capexHeaderRow);
  capexHeader.getCell(1).value = labels.capex.toUpperCase();
  styleSectionHeader(capexHeader, 1, 3);
  const capexColumns = sheet.getRow(capexHeaderRow + 1);
  ["Item", "Amount", "Useful Life (Years)"].forEach((label, index) => {
    capexColumns.getCell(index + 1).value = label;
  });
  styleColumnHeader(capexColumns, 1, 3);
  const capexInputRows: number[] = [];
  const capexRows = input.capex.length > 0
    ? input.capex
    : [{ id: "no-capex", name: "No capital expenditure", amount: 0, usefulLifeYears: 5 }];
  capexRows.forEach((item, index) => {
    const rowNumber = capexHeaderRow + 2 + index;
    capexInputRows.push(rowNumber);
    const row = sheet.getRow(rowNumber);
    row.values = [item.name, item.amount, item.usefulLifeYears];
    for (let column = 1; column <= 3; column += 1) {
      styleInputCell(row.getCell(column), "Deal-specific capital expenditure input");
    }
    row.getCell(2).numFmt = moneyFormat;
  });

  const matrixHeaderRow = capexInputRows[capexInputRows.length - 1] + 3;
  const matrixHeader = sheet.getRow(matrixHeaderRow);
  matrixHeader.getCell(1).value = labels.internalModel.toUpperCase();
  styleSectionHeader(matrixHeader, 1, input.termYears + 1);
  const yearHeaderRow = matrixHeaderRow + 1;
  sheet.getCell(yearHeaderRow, 1).value = "Line Item";
  result.yearLabels.forEach((yearLabel, yearIndex) => {
    sheet.getCell(yearHeaderRow, yearIndex + 2).value = yearLabel;
  });
  styleColumnHeader(sheet.getRow(yearHeaderRow), 1, input.termYears + 1);

  let matrixRow = yearHeaderRow + 1;
  const eventRevenueRows: number[] = [];
  events.forEach((event, eventIndex) => {
    const rowNumber = matrixRow++;
    eventRevenueRows.push(rowNumber);
    sheet.getCell(rowNumber, 1).value = `${event.name} — Revenue`;
    result.years.forEach((year, yearIndex) => {
      const cell = sheet.getCell(rowNumber, yearIndex + 2);
      if (event.pricingMode === "flat") {
        // "Type my number" — the typed value IS the cell, editable in Excel and
        // never recomputed. SUM ignores the "Included" text, so an included
        // year bills nothing while staying visible.
        writeFlatCell(cell, resolveFlatAmount(event.flatRevenue, yearIndex, event.flatEscalates, input.revenueEscalationPct), moneyFormat);
        return;
      }
      const formula = `$B$${eventInputRows[eventIndex]}*$C$${eventInputRows[eventIndex]}*$D$${eventInputRows[eventIndex]}*(1+'Project Overview'!$C$18)^${yearIndex}`;
      setFormula(cell, formula, year.eventLines[eventIndex].revenue, moneyFormat);
    });
  });

  const breakFixRevenueRow = matrixRow++;
  sheet.getCell(breakFixRevenueRow, 1).value = `${breakFix.label} — Revenue`;
  result.years.forEach((year, yearIndex) => {
    const cell = sheet.getCell(breakFixRevenueRow, yearIndex + 2);
    if (breakFix.pricingMode === "flat") {
      writeFlatCell(cell, breakFix.enabled ? resolveFlatAmount(breakFix.flatRevenue, yearIndex, breakFix.flatEscalates, input.revenueEscalationPct) : 0, moneyFormat);
      return;
    }
    const formula = `IF($B$${breakFixInputRow},$C$${breakFixInputRow}*$D$${breakFixInputRow}*$E$${breakFixInputRow}*$F$${breakFixInputRow}*$G$${breakFixInputRow}*(1+'Project Overview'!$C$18)^${yearIndex},0)`;
    setFormula(cell, formula, year.breakFixRevenue, moneyFormat);
  });

  const grossIncomeRow = matrixRow++;
  sheet.getCell(grossIncomeRow, 1).value = "Gross Service Income";
  result.years.forEach((year, yearIndex) => {
    const column = sheet.getColumn(yearIndex + 2).letter;
    setFormula(
      sheet.getCell(grossIncomeRow, yearIndex + 2),
      `SUM(${column}${eventRevenueRows[0]}:${column}${breakFixRevenueRow})`,
      year.grossServiceIncome,
      moneyFormat,
    );
  });

  let bundleDiscountRow: number | null = null;
  if (input.bundleDiscountMode === "apply-to-subtotal") {
    bundleDiscountRow = matrixRow++;
    sheet.getCell(bundleDiscountRow, 1).value = "Bundle Discount";
    result.years.forEach((year, yearIndex) => {
      const column = sheet.getColumn(yearIndex + 2).letter;
      setFormula(
        sheet.getCell(bundleDiscountRow!, yearIndex + 2),
        `${column}${grossIncomeRow}*'Project Overview'!$C$20`,
        year.bundleDiscountAmount,
        moneyFormat,
      );
    });
  }

  const totalIncomeRow = matrixRow++;
  sheet.getCell(totalIncomeRow, 1).value = "TOTAL INCOME";
  result.years.forEach((year, yearIndex) => {
    const column = sheet.getColumn(yearIndex + 2).letter;
    const formula = bundleDiscountRow
      ? `${column}${grossIncomeRow}-${column}${bundleDiscountRow}`
      : `${column}${grossIncomeRow}`;
    setFormula(sheet.getCell(totalIncomeRow, yearIndex + 2), formula, year.totalIncome, moneyFormat);
  });

  // Krissy, 2026-07-30: "Can you add a heading … like to say operating
  // expenses or something, just so that everyone knows." Everything above this
  // row is what the client sees; everything below is ANC's internal model.
  const expenseHeaderRow = sheet.getRow(matrixRow++);
  expenseHeaderRow.getCell(1).value = labels.operatingExpenses.toUpperCase();
  styleSectionHeader(expenseHeaderRow, 1, input.termYears + 1);

  const eventCostRows: number[] = [];
  events.forEach((event, eventIndex) => {
    const rowNumber = matrixRow++;
    eventCostRows.push(rowNumber);
    sheet.getCell(rowNumber, 1).value = `${event.name} — Cost`;
    result.years.forEach((year, yearIndex) => {
      const cell = sheet.getCell(rowNumber, yearIndex + 2);
      if (event.pricingMode === "flat") {
        writeFlatCell(cell, resolveFlatAmount(event.flatCost, yearIndex, event.flatEscalates, input.costEscalationPct), moneyFormat);
        return;
      }
      const formula = `$B$${eventInputRows[eventIndex]}*$C$${eventInputRows[eventIndex]}*$E$${eventInputRows[eventIndex]}*(1+'Project Overview'!$C$19)^${yearIndex}`;
      setFormula(cell, formula, year.eventLines[eventIndex].cost, moneyFormat);
    });
  });

  const breakFixCostRow = matrixRow++;
  sheet.getCell(breakFixCostRow, 1).value = `${breakFix.label} — Cost`;
  result.years.forEach((year, yearIndex) => {
    const cell = sheet.getCell(breakFixCostRow, yearIndex + 2);
    if (breakFix.pricingMode === "flat") {
      writeFlatCell(cell, breakFix.enabled ? resolveFlatAmount(breakFix.flatCost, yearIndex, breakFix.flatEscalates, input.costEscalationPct) : 0, moneyFormat);
      return;
    }
    const formula = `IF($B$${breakFixInputRow},$C$${breakFixInputRow}*$D$${breakFixInputRow}*$E$${breakFixInputRow}*$F$${breakFixInputRow}*(1+'Project Overview'!$C$19)^${yearIndex},0)`;
    setFormula(cell, formula, year.breakFixCost, moneyFormat);
  });

  const operatingExpenseRow = matrixRow++;
  sheet.getCell(operatingExpenseRow, 1).value = labels.operatingExpenses.toUpperCase();
  result.years.forEach((year, yearIndex) => {
    const column = sheet.getColumn(yearIndex + 2).letter;
    setFormula(
      sheet.getCell(operatingExpenseRow, yearIndex + 2),
      `SUM(${column}${eventCostRows[0]}:${column}${breakFixCostRow})`,
      year.operatingExpenses,
      moneyFormat,
    );
  });

  const profitabilityRows: Array<{
    label: string;
    resultValue: (yearIndex: number) => number;
    formula: (column: string, yearIndex: number) => string;
    format?: string;
  }> = [];
  const ebitdaRow = matrixRow;
  profitabilityRows.push({
    label: "EBITDA",
    resultValue: (index) => result.years[index].ebitda,
    formula: (column) => `${column}${totalIncomeRow}-${column}${operatingExpenseRow}`,
  });
  const depreciationRow = ebitdaRow + 1;
  profitabilityRows.push({
    label: "ANNUAL DEPRECIATION",
    resultValue: (index) => result.years[index].depreciation,
    formula: (_column, index) =>
      capexInputRows
        .map((rowNumber) => `IF($C$${rowNumber}>${index},$B$${rowNumber}/$C$${rowNumber},0)`)
        .join("+"),
  });
  const netProfitRow = ebitdaRow + 2;
  profitabilityRows.push({
    label: "Net Profit/Loss",
    resultValue: (index) => result.years[index].netProfit,
    formula: (column) => `${column}${ebitdaRow}-${column}${depreciationRow}`,
  });
  const returnRow = ebitdaRow + 3;
  profitabilityRows.push({
    label: "% Return",
    resultValue: (index) => result.years[index].returnPct,
    formula: (column) => `IFERROR(${column}${netProfitRow}/${column}${totalIncomeRow},0)`,
    format: percentFormat,
  });
  const marketingRow = ebitdaRow + 4;
  profitabilityRows.push({
    label: "Additional Marketing Revenue Share",
    resultValue: (index) => result.years[index].marketingRevenueShare,
    formula: () => `'Project Overview'!$C$23*'Project Overview'!$C$24`,
  });
  const totalProfitRow = ebitdaRow + 5;
  profitabilityRows.push({
    label: "Total Profit",
    resultValue: (index) => result.years[index].totalProfit,
    formula: (column) => `${column}${netProfitRow}+${column}${marketingRow}`,
  });
  const cashCapexRow = ebitdaRow + 6;
  profitabilityRows.push({
    label: "Cash Capital Expenditure",
    resultValue: (index) => result.years[index].cashCapex,
    formula: (_column, index) =>
      index === 0 ? capexInputRows.map((rowNumber) => `$B$${rowNumber}`).join("+") : "0",
  });
  const cashExpenseRow = ebitdaRow + 7;
  profitabilityRows.push({
    label: "Cash Expense",
    resultValue: (index) => result.years[index].cashExpense,
    formula: (column) => `${column}${operatingExpenseRow}+${column}${cashCapexRow}`,
  });
  const netCashRow = ebitdaRow + 8;
  profitabilityRows.push({
    label: "Net Cash",
    resultValue: (index) => result.years[index].netCash,
    formula: (column) => `${column}${totalIncomeRow}-${column}${cashExpenseRow}`,
  });
  const cumulativeCashRow = ebitdaRow + 9;
  profitabilityRows.push({
    label: "Cumulative Cash",
    resultValue: (index) => result.years[index].cumulativeCash,
    formula: (column, index) =>
      index === 0
        ? `${column}${netCashRow}`
        : `${sheet.getColumn(index + 1).letter}${cumulativeCashRow}+${column}${netCashRow}`,
  });

  profitabilityRows.forEach((definition, offset) => {
    const rowNumber = matrixRow + offset;
    sheet.getCell(rowNumber, 1).value = definition.label;
    result.years.forEach((_year, yearIndex) => {
      const column = sheet.getColumn(yearIndex + 2).letter;
      setFormula(
        sheet.getCell(rowNumber, yearIndex + 2),
        definition.formula(column, yearIndex),
        definition.resultValue(yearIndex),
        definition.format || moneyFormat,
      );
    });
  });

  [grossIncomeRow, totalIncomeRow, operatingExpenseRow, ebitdaRow, netProfitRow, totalProfitRow, cumulativeCashRow].forEach(
    (rowNumber) => {
      sheet.getRow(rowNumber).font = { bold: true, color: { argb: BLACK } };
      for (let column = 1; column <= input.termYears + 1; column += 1) {
        sheet.getCell(rowNumber, column).border = {
          top: { style: "thin", color: { argb: BRAND_BLUE } },
        };
      }
    },
  );

  sheet.getColumn(1).width = 42;
  for (let column = 2; column <= Math.max(7, input.termYears + 1); column += 1) {
    sheet.getColumn(column).width = 16;
  }
  sheet.getColumn(1).alignment = { wrapText: true, vertical: "top" };

  return {
    eventRevenueRows,
    breakFixRevenueRow,
    bundleDiscountRow,
    totalIncomeRow,
    operatingExpenseRow,
    totalProfitRow,
    cashCapexRow,
  };
}

function linkOverviewSummary(
  workbook: ExcelJS.Workbook,
  input: ServiceEstimatorInput,
  result: ServiceEstimatorResult,
  calculationRows: CalculationMatrixRows,
  calculationSheetName: string,
) {
  const overviewSheet = workbook.getWorksheet("Project Overview")!;
  const calculationSheet = workbook.getWorksheet(calculationSheetName)!;
  const firstYearColumn = calculationSheet.getColumn(2).letter;
  const lastYearColumn = calculationSheet.getColumn(input.termYears + 1).letter;
  const moneyFormat = currencyFormat(input.currency);

  const summaryLinks: Array<[number, number, number]> = [
    [27, calculationRows.totalIncomeRow, result.totalContractIncome],
    [28, calculationRows.operatingExpenseRow, result.totalContractOperatingExpenses],
    [29, calculationRows.totalProfitRow, result.totalContractProfit],
    [30, calculationRows.cashCapexRow, result.totalCapex],
  ];

  for (const [overviewRow, calculationRow, cachedResult] of summaryLinks) {
    setFormula(
      overviewSheet.getCell(overviewRow, 3),
      `SUM('${calculationSheetName}'!${firstYearColumn}${calculationRow}:${lastYearColumn}${calculationRow})`,
      cachedResult,
      moneyFormat,
    );
    styleLinkedCell(overviewSheet.getCell(overviewRow, 3));
  }
}

function buildClientFeeSchedule(
  workbook: ExcelJS.Workbook,
  input: ServiceEstimatorInput,
  result: ServiceEstimatorResult,
  calculationRows: CalculationMatrixRows,
  option: ServiceEstimatorOption,
  sheetName: string,
  calculationSheetName: string,
) {
  const sheet = workbook.getWorksheet(sheetName)
    ?? workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: BRAND_BLUE } } });
  const events = option.events;
  const breakFix = option.breakFix;
  const calculationRef = `'${calculationSheetName}'`;
  const moneyFormat = currencyFormat(input.currency);
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: 6 }];
  sheet.mergeCells("A1:D1");
  sheet.getCell("A1").value = "ANC Sports Enterprises, LLC";
  sheet.getCell("A1").font = { bold: true, color: { argb: BRAND_BLUE }, size: 17 };
  sheet.mergeCells("A2:D2");
  sheet.getCell("A2").value = "Property/Event Budget Overview";
  sheet.getCell("A2").font = { bold: true, color: { argb: BRAND_NAVY }, size: 12 };
  sheet.getCell("A4").value = "Venue:";
  sheet.getCell("B4").value = input.venueName;
  sheet.getCell("A5").value = "Location:";
  sheet.getCell("B5").value = input.location;
  sheet.getCell("A6").value = "Team:";
  sheet.getCell("B6").value = input.clientName;

  result.yearLabels.forEach((label, yearIndex) => {
    const column = 6 + yearIndex;
    sheet.getCell(6, column).value = label;
    sheet.getCell(6, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
    sheet.getCell(6, column).font = { bold: true, color: { argb: WHITE } };
    sheet.getCell(6, column).alignment = { horizontal: "right" };
  });
  const totalColumn = 6 + input.termYears;
  sheet.getCell(6, totalColumn).value = "CONTRACT TOTAL";
  sheet.getCell(6, totalColumn).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
  sheet.getCell(6, totalColumn).font = { bold: true, color: { argb: WHITE } };
  sheet.getCell(6, totalColumn).alignment = { horizontal: "right" };

  sheet.getCell("A9").value = "Income:";
  sheet.getCell("A9").font = { bold: true, color: { argb: BRAND_BLUE } };

  let rowNumber = 10;
  calculationRows.eventRevenueRows.forEach((calculationRow, eventIndex) => {
    const clientRow = rowNumber++;
    sheet.getCell(clientRow, 2).value = events[eventIndex].name;
    result.years.forEach((year, yearIndex) => {
      const column = 6 + yearIndex;
      const calculationColumn = workbook.getWorksheet(calculationSheetName)!.getColumn(yearIndex + 2).letter;
      setFormula(
        sheet.getCell(clientRow, column),
        `${calculationRef}!${calculationColumn}${calculationRow}`,
        year.eventLines[eventIndex].revenue,
        moneyFormat,
      );
      styleLinkedCell(sheet.getCell(clientRow, column));
    });
    const firstYearColumn = sheet.getColumn(6).letter;
    const lastYearColumn = sheet.getColumn(5 + input.termYears).letter;
    setFormula(
      sheet.getCell(clientRow, totalColumn),
      `SUM(${firstYearColumn}${clientRow}:${lastYearColumn}${clientRow})`,
      result.years.reduce((sum, year) => sum + year.eventLines[eventIndex].revenue, 0),
      moneyFormat,
    );
  });

  if (breakFix.enabled) {
    const breakFixClientRow = rowNumber++;
    sheet.getCell(breakFixClientRow, 2).value = breakFix.label;
    result.years.forEach((year, yearIndex) => {
      const column = 6 + yearIndex;
      const calculationColumn = workbook.getWorksheet(calculationSheetName)!.getColumn(yearIndex + 2).letter;
      setFormula(
        sheet.getCell(breakFixClientRow, column),
        `${calculationRef}!${calculationColumn}${calculationRows.breakFixRevenueRow}`,
        year.breakFixRevenue,
        moneyFormat,
      );
      styleLinkedCell(sheet.getCell(breakFixClientRow, column));
    });
    setFormula(
      sheet.getCell(breakFixClientRow, totalColumn),
      `SUM(${sheet.getColumn(6).letter}${breakFixClientRow}:${sheet.getColumn(5 + input.termYears).letter}${breakFixClientRow})`,
      result.years.reduce((sum, year) => sum + year.breakFixRevenue, 0),
      moneyFormat,
    );
  }

  if (calculationRows.bundleDiscountRow) {
    const discountClientRow = rowNumber++;
    sheet.getCell(discountClientRow, 2).value = "Bundle Discount";
    result.years.forEach((year, yearIndex) => {
      const column = 6 + yearIndex;
      const calculationColumn = workbook.getWorksheet(calculationSheetName)!.getColumn(yearIndex + 2).letter;
      setFormula(
        sheet.getCell(discountClientRow, column),
        `-${calculationRef}!${calculationColumn}${calculationRows.bundleDiscountRow}`,
        -year.bundleDiscountAmount,
        moneyFormat,
      );
    });
    setFormula(
      sheet.getCell(discountClientRow, totalColumn),
      `SUM(${sheet.getColumn(6).letter}${discountClientRow}:${sheet.getColumn(5 + input.termYears).letter}${discountClientRow})`,
      -result.years.reduce((sum, year) => sum + year.bundleDiscountAmount, 0),
      moneyFormat,
    );
  }

  const totalRow = rowNumber++;
  sheet.getCell(totalRow, 2).value = "TOTAL INCOME";
  result.years.forEach((year, yearIndex) => {
    const column = 6 + yearIndex;
    const calculationColumn = workbook.getWorksheet(calculationSheetName)!.getColumn(yearIndex + 2).letter;
    setFormula(
      sheet.getCell(totalRow, column),
      `${calculationRef}!${calculationColumn}${calculationRows.totalIncomeRow}`,
      year.totalIncome,
      moneyFormat,
    );
  });
  setFormula(
    sheet.getCell(totalRow, totalColumn),
    `SUM(${sheet.getColumn(6).letter}${totalRow}:${sheet.getColumn(5 + input.termYears).letter}${totalRow})`,
    result.totalContractIncome,
    moneyFormat,
  );
  for (let column = 2; column <= totalColumn; column += 1) {
    sheet.getCell(totalRow, column).font = { bold: true, color: { argb: BRAND_NAVY } };
    sheet.getCell(totalRow, column).border = { top: { style: "thin", color: { argb: BRAND_BLUE } } };
  }

  if (input.bundleDiscountMode === "included-in-rates" && input.bundleDiscountPct > 0) {
    const noteRow = rowNumber++;
    sheet.getCell(noteRow, 2).value = `*${input.bundleDiscountPct}% Bundle Discount Included in Entered Rates`;
    sheet.getCell(noteRow, 2).font = { italic: true, color: { argb: "FF526078" }, size: 9 };
  }

  rowNumber += 1;
  sheet.getCell(rowNumber, 1).value = "Expenses:";
  sheet.getCell(rowNumber, 1).font = { bold: true, color: { argb: "FF9A3412" } };
  sheet.getCell(rowNumber, 2).value = "Internal costs continue in the Calculation Detail sheet and are not client-facing.";
  sheet.getCell(rowNumber, 2).font = { italic: true, color: { argb: "FF9A3412" }, size: 9 };
  sheet.getCell(rowNumber, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CAUTION_ORANGE } };

  sheet.getColumn("A").width = 14;
  sheet.getColumn("B").width = 42;
  sheet.getColumn("C").width = 4;
  sheet.getColumn("D").width = 4;
  sheet.getColumn("E").width = 4;
  for (let column = 6; column <= totalColumn; column += 1) sheet.getColumn(column).width = 17;
  sheet.getColumn("B").alignment = { wrapText: true, vertical: "top" };
}

/**
 * A side-by-side read of what each option costs the client — the question
 * "three cost sheets for one thing" was really being asked to answer. Every
 * figure links to that option's own calculation sheet, so editing an input in
 * Excel moves the comparison with it.
 */
function buildOptionComparison(
  workbook: ExcelJS.Workbook,
  input: ServiceEstimatorInput,
  pricedOptions: ServiceEstimatorOptionResult[],
  sheetNames: Array<{ fees: string; detail: string }>,
  optionRows: CalculationMatrixRows[],
) {
  const sheet = workbook.addWorksheet("Options Summary", {
    properties: { tabColor: { argb: BRAND_NAVY } },
  });
  const moneyFormat = currencyFormat(input.currency);
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: 4 }];

  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = "OPTIONS — CLIENT TOTALS";
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
  sheet.getCell("A1").font = { bold: true, color: { argb: WHITE }, size: 16 };
  sheet.getRow(1).height = 30;
  sheet.getCell("A2").value = `${input.clientName}${input.venueName ? ` — ${input.venueName}` : ""}`;
  sheet.getCell("A2").font = { bold: true, color: { argb: BRAND_NAVY }, size: 11 };

  const headerRow = sheet.getRow(4);
  headerRow.getCell(1).value = "Option";
  pricedOptions[0].result.yearLabels.forEach((label, yearIndex) => {
    headerRow.getCell(yearIndex + 2).value = label;
  });
  const totalColumn = input.termYears + 2;
  headerRow.getCell(totalColumn).value = "CONTRACT TOTAL";
  styleColumnHeader(headerRow, 1, totalColumn);

  pricedOptions.forEach((priced, index) => {
    const rowNumber = 5 + index;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = priced.name;
    const detailRef = `'${sheetNames[index].detail}'`;
    const detailSheet = workbook.getWorksheet(sheetNames[index].detail)!;
    priced.result.years.forEach((year, yearIndex) => {
      const detailColumn = detailSheet.getColumn(yearIndex + 2).letter;
      setFormula(
        row.getCell(yearIndex + 2),
        `${detailRef}!${detailColumn}${optionRows[index].totalIncomeRow}`,
        year.totalIncome,
        moneyFormat,
      );
      styleLinkedCell(row.getCell(yearIndex + 2));
    });
    setFormula(
      row.getCell(totalColumn),
      `SUM(${sheet.getColumn(2).letter}${rowNumber}:${sheet.getColumn(totalColumn - 1).letter}${rowNumber})`,
      priced.result.totalContractIncome,
      moneyFormat,
    );
    row.getCell(totalColumn).font = { bold: true, color: { argb: BRAND_NAVY } };
  });

  const noteRow = 6 + pricedOptions.length;
  sheet.mergeCells(noteRow, 1, noteRow, totalColumn);
  sheet.getCell(noteRow, 1).value =
    "Each option is priced on its own tab. Client-facing figures only — technician cost, capital expenditure and profit stay on the matching detail sheet.";
  sheet.getCell(noteRow, 1).font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };
  sheet.getCell(noteRow, 1).alignment = { wrapText: true, vertical: "top" };

  sheet.getColumn(1).width = 34;
  for (let column = 2; column <= totalColumn; column += 1) sheet.getColumn(column).width = 17;
}

/**
 * Excel rejects : \ / ? * [ ] in a tab name and truncates past 31 characters,
 * so an author-typed option name is cleaned before it becomes one. Duplicates
 * are numbered rather than silently dropped by ExcelJS.
 */
function toSheetName(
  rawName: string,
  taken: Set<string>,
  fallback: string,
  /** Kept whole when the name has to be shortened — a tab reading "…Support D" helps nobody. */
  suffix = "",
): string {
  const cleaned = rawName.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim();
  const base = `${(cleaned || fallback).slice(0, 31 - suffix.length).trim()}${suffix}`;
  let name = base;
  let attempt = 2;
  while (taken.has(name.toLowerCase())) {
    const tail = ` ${attempt}`;
    name = `${base.slice(0, 31 - tail.length).trim()}${tail}`;
    attempt += 1;
  }
  taken.add(name.toLowerCase());
  return name;
}

/**
 * One workbook, one tab per option — Natalia, 2026-08-11: "all within one
 * project aka excel."
 *
 * An estimate with a single option keeps the sheet names it has always had, so
 * existing workbooks and the Service Proposal import path are unaffected. Add a
 * second option and each one gets its own client fee schedule and its own
 * calculation detail, with the Project Overview reporting the first.
 */
export function buildServiceEstimatorWorkbook(input: ServiceEstimatorInput): ExcelJS.Workbook {
  const pricedOptions = calculateServiceEstimateOptions(input);
  const options = listOptions(input);
  const [primary] = pricedOptions;
  const result = primary.result;
  const multiple = pricedOptions.length > 1;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Proposal Engine";
  workbook.company = "ANC Sports Enterprises, LLC";
  workbook.subject = "Service estimator with linked client fee schedule and internal calculations";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  buildOverviewSheet(workbook, input, result);

  const taken = new Set<string>(["project overview"]);
  const sheetNames = pricedOptions.map((option, index) => {
    if (!multiple) {
      taken.add("service fee schedule");
      taken.add("calculation detail");
      return { fees: "Service Fee Schedule", detail: "Calculation Detail" };
    }
    const fees = toSheetName(option.name, taken, `Option ${index + 1}`);
    const detail = toSheetName(option.name, taken, `Option ${index + 1}`, " Detail");
    return { fees, detail };
  });

  // Client schedules first so the option tabs sit together, left to right, in
  // author order — the reading order Alexis works in.
  sheetNames.forEach(({ fees }) => {
    workbook.addWorksheet(fees, { properties: { tabColor: { argb: BRAND_BLUE } } });
  });

  const optionRows = pricedOptions.map((priced, index) => {
    const option = options[index];
    const { fees, detail } = sheetNames[index];
    const calculationRows = buildCalculationSheet(workbook, input, priced.result, option, detail);
    if (index === 0) linkOverviewSummary(workbook, input, priced.result, calculationRows, detail);
    buildClientFeeSchedule(workbook, input, priced.result, calculationRows, option, fees, detail);
    return calculationRows;
  });

  if (multiple) buildOptionComparison(workbook, input, pricedOptions, sheetNames, optionRows);

  workbook.eachSheet((sheet) => {
    sheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    };
    sheet.headerFooter.oddFooter = "ANC Sports Enterprises, LLC  •  &P of &N";
  });

  return workbook;
}

export function serviceEstimatorFileName(input: ServiceEstimatorInput): string {
  const client = input.clientName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Client";
  const endYear = input.termStartYear + input.termYears;
  return `${client}_${input.termStartYear}-${endYear}_Service_Estimate.xlsx`;
}
