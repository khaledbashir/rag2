/**
 * exportEstimatorExcel — Client-side Excel export with full formatting.
 *
 * Takes the ExcelPreviewData (exactly what the user sees) and produces
 * a formatted .xlsx using ExcelJS. What you see is what you get —
 * PLUS live Excel formulas on totals, margins, and sell prices so
 * users can adjust numbers and see recalculated results.
 */

import ExcelJS from "exceljs";
import type { ExcelPreviewData, SheetTab, SheetRow, SheetCell } from "./EstimatorBridge";

const ANC_BLUE = "0A52EF";
const HEADER_BG = "0A52EF";
const HEADER_FG = "FFFFFF";
const TOTAL_BG = "E8F5E9";
const HIGHLIGHT_BG = "FFF9C4";
const BORDER_COLOR = "D0D0D0";

const thinBorder: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const allBorders: Partial<ExcelJS.Borders> = {
    top: thinBorder,
    bottom: thinBorder,
    left: thinBorder,
    right: thinBorder,
};

/** Column letter from 0-based index (A, B, ... Z, AA, AB, ...) */
function colLetter(idx: number): string {
    let result = "";
    let n = idx;
    while (n >= 0) {
        result = String.fromCharCode(65 + (n % 26)) + result;
        n = Math.floor(n / 26) - 1;
    }
    return result;
}

export async function exportEstimatorExcel(data: ExcelPreviewData): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ANC Proposal Engine";
    workbook.created = new Date();
    workbook.calcProperties = { fullCalcOnLoad: true };

    for (const sheet of data.sheets) {
        const ws = workbook.addWorksheet(sheet.name, {
            properties: { tabColor: { argb: sheet.color.replace("#", "") } },
        });

        // Set column widths based on header names
        ws.columns = sheet.columns.map((col, i) => ({
            width: getColumnWidth(col, i, sheet),
        }));

        // Track data row ranges for formula generation
        // dataRowStart: first data row after a header row
        // We'll collect these per section for SUM formulas
        let sectionStart = 0;
        const dataRanges: { start: number; end: number }[] = [];
        let inDataSection = false;

        // Write rows
        for (let ri = 0; ri < sheet.rows.length; ri++) {
            const row = sheet.rows[ri];

            if (row.isSeparator) {
                // Don't reset section tracking — separators are visual, not data boundaries
                const exRow = ws.addRow(Array(sheet.columns.length).fill(""));
                exRow.height = 8;
                continue;
            }

            // Handle spanned rows (section headers like "1.0 LED HARDWARE")
            const firstCell = row.cells[0];
            if (firstCell?.span && firstCell.span > 1) {
                // Don't reset section tracking — spanned rows are category labels, not data boundaries
                const exRow = ws.addRow([firstCell.value]);
                ws.mergeCells(exRow.number, 1, exRow.number, sheet.columns.length);
                const cell = exRow.getCell(1);
                applyCellStyle(cell, firstCell, row);
                continue;
            }

            // Regular row — write values first
            const values = sheet.columns.map((_, ci) => {
                const c = row.cells[ci];
                return c ? c.value : "";
            });
            const exRow = ws.addRow(values);

            // Inject ROW_SUM formulas (e.g., TOTAL COST = SUM of preceding columns)
            for (let ci = 0; ci < sheet.columns.length; ci++) {
                const sc = row.cells[ci];
                if (sc?.formula === "ROW_SUM" && typeof sc.value === "number") {
                    // Sum columns B through G (indices 1-6, Excel cols B-G)
                    const startCol = colLetter(1); // B
                    const endCol = colLetter(ci - 1); // column before this one
                    const rn = exRow.number;
                    exRow.getCell(ci + 1).value = {
                        formula: `SUM(${startCol}${rn}:${endCol}${rn})`,
                        result: sc.value as number,
                    };
                }
            }

            // Track data rows for SUM formulas
            if (row.isHeader) {
                if (inDataSection && sectionStart > 0) {
                    dataRanges.push({ start: sectionStart, end: ws.rowCount - 1 });
                }
                sectionStart = exRow.number + 1;
                inDataSection = false;
            } else if (row.isTotal) {
                // For total rows, inject SUM formulas for numeric columns
                if (inDataSection && sectionStart > 0) {
                    const rangeStart = sectionStart;
                    const rangeEnd = exRow.number - 1;

                    for (let ci = 0; ci < sheet.columns.length; ci++) {
                        const sc = row.cells[ci];
                        // Skip cells with ROW_SUM — they already have a row-wise formula
                        if (sc?.formula === "ROW_SUM") continue;
                        if (sc && (sc.currency || sc.percent) && typeof sc.value === "number" && sc.value !== 0) {
                            const col = colLetter(ci);
                            const cell = exRow.getCell(ci + 1);
                            if (sc.percent) {
                                // For percent totals, use AVERAGE instead of SUM
                                // But only if there are actual data rows
                                if (rangeEnd >= rangeStart) {
                                    cell.value = { formula: `AVERAGE(${col}${rangeStart}:${col}${rangeEnd})`, result: sc.value as number };
                                }
                            } else {
                                // SUM for currency totals
                                if (rangeEnd >= rangeStart) {
                                    cell.value = { formula: `SUM(${col}${rangeStart}:${col}${rangeEnd})`, result: sc.value as number };
                                }
                            }
                        }
                    }
                }
                inDataSection = false;
                sectionStart = 0;
            } else if (!row.isHeader && sectionStart > 0) {
                // Regular data row
                if (!inDataSection) {
                    sectionStart = exRow.number;
                    inDataSection = true;
                }

                // Add margin formulas: MARGIN $ = SELL - COST, MARGIN % = 1 - COST/SELL
                addMarginFormulas(exRow, row, sheet, ci => row.cells[ci]);
            }

            // Style each cell
            for (let ci = 0; ci < sheet.columns.length; ci++) {
                const sc = row.cells[ci];
                const cell = exRow.getCell(ci + 1);
                if (sc) {
                    applyCellStyle(cell, sc, row);
                }
                cell.border = allBorders;
            }

            // Row-level styling
            if (row.isHeader) {
                exRow.height = 20;
                for (let ci = 1; ci <= sheet.columns.length; ci++) {
                    const cell = exRow.getCell(ci);
                    cell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: HEADER_BG },
                    };
                    cell.font = { ...cell.font, color: { argb: HEADER_FG }, bold: true, size: 10 };
                }
            }

            if (row.isTotal) {
                for (let ci = 1; ci <= sheet.columns.length; ci++) {
                    const cell = exRow.getCell(ci);
                    cell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: TOTAL_BG.replace("#", "") },
                    };
                }
            }
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

/**
 * For data rows, add formulas for MARGIN $ and MARGIN % columns.
 * Detects column layout by looking at headers: COST + SELL PRICE → MARGIN % = 1-COST/SELL, MARGIN $ = SELL-COST
 */
function addMarginFormulas(
    exRow: ExcelJS.Row,
    row: SheetRow,
    sheet: SheetTab,
    getCell: (ci: number) => SheetCell | undefined,
) {
    const cols = sheet.columns.map((c) => c.toUpperCase());

    // Find COST and SELL/SELLING PRICE column indices
    let costCol = -1;
    let sellCol = -1;
    let marginPctCol = -1;
    let marginDollarCol = -1;

    for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if ((c.includes("COST") && !c.includes("UNIT") && !c.includes("TOTAL")) || c === "COST" || c === "LED COST") costCol = i;
        if (c.includes("TOTAL COST")) costCol = i; // prefer TOTAL COST if it exists
        if (c.includes("SELL") || c.includes("SALE")) sellCol = i;
        if (c === "MARGIN %" || c === "MARGIN%") marginPctCol = i;
        if (c === "MARGIN $" || c === "MARGIN$") marginDollarCol = i;
    }

    const rowNum = exRow.number;

    // Margin % stays as a HARD VALUE — it's the user-configured input margin.
    // Writing a formula here (=1-COST/SELL) creates a circular ref with SELL PRICE (=COST/(1-MARGIN%)).

    // Margin $ formula: =SELL-COST
    if (marginDollarCol >= 0 && costCol >= 0 && sellCol >= 0) {
        const sc = getCell(marginDollarCol);
        if (sc && sc.currency && typeof sc.value === "number") {
            const costRef = `${colLetter(costCol)}${rowNum}`;
            const sellRef = `${colLetter(sellCol)}${rowNum}`;
            exRow.getCell(marginDollarCol + 1).value = {
                formula: `${sellRef}-${costRef}`,
                result: sc.value as number,
            };
        }
    }

    // Sell Price formula when there's a COST and MARGIN % column: =COST/(1-MARGIN%)
    if (sellCol >= 0 && costCol >= 0 && marginPctCol >= 0) {
        const sc = getCell(sellCol);
        if (sc && sc.currency && typeof sc.value === "number") {
            const costRef = `${colLetter(costCol)}${rowNum}`;
            const pctRef = `${colLetter(marginPctCol)}${rowNum}`;
            exRow.getCell(sellCol + 1).value = {
                formula: `IF(${pctRef}>=1,${costRef},${costRef}/(1-${pctRef}))`,
                result: sc.value as number,
            };
        }
    }
}

function applyCellStyle(cell: ExcelJS.Cell, sc: SheetCell, row: SheetRow) {
    // Font
    cell.font = {
        name: "Calibri",
        size: 10,
        bold: sc.bold || sc.header || false,
        color: sc.header && !row.isHeader ? { argb: ANC_BLUE } : undefined,
    };

    // Alignment
    cell.alignment = {
        horizontal: sc.align || "left",
        vertical: "middle",
        wrapText: false,
    };

    // Number formatting
    if (sc.currency && typeof sc.value === "number") {
        cell.numFmt = "$#,##0.00";
    }
    if (sc.percent && typeof sc.value === "number") {
        cell.numFmt = "0.0%";
    }

    // Highlight
    if (sc.highlight) {
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: HIGHLIGHT_BG.replace("#", "") },
        };
    }
}

function getColumnWidth(colName: string, _index: number, _sheet: SheetTab): number {
    const name = colName.toUpperCase();
    if (name === "CATEGORY" || name === "DISPLAY" || name === "DESCRIPTION" || name === "MODEL") return 30;
    if (name.includes("PRICE") || name.includes("COST") || name.includes("TOTAL") || name.includes("SALE")) return 18;
    if (name === "QTY" || name === "UNIT" || name === "PITCH") return 10;
    if (name.includes("MARGIN")) return 14;
    if (name.includes("BTU") || name.includes("CIRCUIT") || name.includes("CAB/") || name.includes("W/CAB")) return 14;
    return 16;
}
