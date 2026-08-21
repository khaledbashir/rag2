/**
 * House palette and chrome for the branded CRM report workbooks.
 *
 * Lifted verbatim from the invoicing / user-activity exports so every report
 * ANC hands out reads as one family. Existing routes keep their own inline
 * copies untouched; new reports import from here.
 */
import type ExcelJS from "exceljs";

export const PAPER = "FFFAF9F6";
export const PAPER_ALT = "FFF3F1EC";
export const BAND = "FFECE9E1";
export const BAND_STRONG = "FFDFDBD1";
export const INK = "FF3A3D42";
export const INK_SOFT = "FF74777C";
export const LINE = "FFD7D3C9";
export const RULE = "FFB7B2A6";
export const TITLE_GREY = "FF56585B";
export const FONT = "Calibri";

/** Every sheet is inset one narrow column so the table never hugs the edge. */
export const GUTTER = 1;

export const MONEY = '"$"#,##0;[Red]-"$"#,##0';
export const MONEY_CENTS = '"$"#,##0.00;[Red]-"$"#,##0.00';
export const PERCENT = "0.0%";

/**
 * A live Excel formula rather than a baked number. `result` is the value the
 * report already calculated, cached into the file so a reader that never
 * recalculates (Preview, Google Sheets on import, a PDF print) still shows the
 * figure.
 */
export type FormulaValue = { formula: string; result?: number };

export type SheetValue = string | number | null | FormulaValue;

export function isFormula(value: SheetValue | undefined): value is FormulaValue {
  return !!value && typeof value === "object" && "formula" in value;
}

export function money(cell: ExcelJS.Cell, value: number | FormulaValue | null | undefined) {
  if (isFormula(value)) {
    cell.value = { formula: value.formula, result: value.result } as ExcelJS.CellFormulaValue;
  } else {
    cell.value = value === null || value === undefined ? "" : value;
  }
  cell.numFmt = MONEY;
  cell.alignment = { vertical: "middle", horizontal: "right" };
}

/**
 * Title / subtitle / context block at the top of a sheet. Returns the row
 * number the caller should start its table header on.
 */
export function writeSheetHeader(
  ws: ExcelJS.Worksheet,
  opts: { title: string; subtitle?: string; headline?: string; note?: string },
): number {
  const c = 1 + GUTTER;

  const title = ws.getRow(2);
  title.getCell(c).value = opts.title;
  title.getCell(c).font = { name: FONT, size: 18, color: { argb: TITLE_GREY } };
  title.height = 24;

  let row = 3;
  if (opts.subtitle) {
    const r = ws.getRow(row++);
    r.getCell(c).value = opts.subtitle;
    r.getCell(c).font = { name: FONT, size: 10, color: { argb: INK_SOFT } };
  }
  if (opts.headline) {
    const r = ws.getRow(row++);
    r.getCell(c).value = opts.headline;
    r.getCell(c).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
  }
  if (opts.note) {
    const r = ws.getRow(row++);
    r.getCell(c).value = opts.note;
    r.getCell(c).font = { name: FONT, size: 9, italic: true, color: { argb: INK_SOFT } };
  }
  return row + 1;
}

export type ColumnSpec = {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
  money?: boolean;
  wrap?: boolean;
};

/**
 * Writes the table header band and freezes the panes above the first data row.
 *
 * `frozenColumns` additionally pins that many leading data columns, the way the
 * CRM keeps a record's name in view while the rest of the row scrolls.
 */
export function writeTableHeader(
  ws: ExcelJS.Worksheet,
  cols: ColumnSpec[],
  headRow: number,
  frozenColumns = 0,
) {
  ws.getColumn(1).width = 2.6;
  cols.forEach((col, i) => {
    ws.getColumn(i + 1 + GUTTER).width = col.width;
  });

  const head = ws.getRow(headRow);
  cols.forEach((col, i) => {
    const cell = head.getCell(i + 1 + GUTTER);
    cell.value = col.header;
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
    cell.alignment = {
      vertical: "middle",
      horizontal: col.align || (col.money ? "right" : "left"),
      wrapText: true,
    };
    cell.border = { bottom: { style: "medium", color: { argb: RULE } } };
  });
  head.height = 26;
  ws.views = [
    {
      state: "frozen",
      ySplit: headRow,
      xSplit: frozenColumns ? frozenColumns + GUTTER : 0,
      showGridLines: false,
    },
  ];
  while ((ws.lastRow?.number || 0) < headRow) ws.addRow({});
}

/** A full-width tinted band — used for group headers and subtotal rows. */
export function bandRow(
  ws: ExcelJS.Worksheet,
  cols: ColumnSpec[],
  values: SheetValue[],
  opts: { fill?: string; bold?: boolean; height?: number } = {},
): ExcelJS.Row {
  const row = ws.addRow({});
  const fill = opts.fill || BAND;
  cols.forEach((col, i) => {
    const cell = row.getCell(i + 1 + GUTTER);
    const v = values[i];
    if (col.money && (typeof v === "number" || isFormula(v))) {
      money(cell, v);
    } else {
      cell.value = (v ?? "") as ExcelJS.CellValue;
      cell.alignment = {
        vertical: "middle",
        horizontal: col.align || (col.money ? "right" : "left"),
      };
    }
    cell.font = { name: FONT, bold: opts.bold !== false, size: 10, color: { argb: INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
  });
  row.height = opts.height || 20;
  return row;
}

/** A normal data row with zebra striping. */
export function dataRow(
  ws: ExcelJS.Worksheet,
  cols: ColumnSpec[],
  values: SheetValue[],
  index: number,
): ExcelJS.Row {
  const row = ws.addRow({});
  cols.forEach((col, i) => {
    const cell = row.getCell(i + 1 + GUTTER);
    const v = values[i];
    if (col.money && (typeof v === "number" || isFormula(v))) {
      money(cell, v);
    } else {
      cell.value = (v ?? "") as ExcelJS.CellValue;
      cell.alignment = {
        vertical: "top",
        horizontal: col.align || (col.money ? "right" : "left"),
        wrapText: !!col.wrap,
      };
    }
    cell.font = { name: FONT, size: 10, color: { argb: INK } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: index % 2 ? PAPER_ALT : PAPER },
    };
    cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
  });
  return row;
}

/**
 * A Content-Disposition value that survives a view name with a dash in it.
 *
 * An HTTP header value must be a ByteString, so an em dash (U+2014) throws
 * outright — "Renewals — Next 90 Days" 500'd the whole export rather than
 * downloading with a plainer name. Same trap that killed an RFP bid-form fill
 * on an en dash (2026-08-10) and made CRM downloads save as a UUID
 * (2026-08-19). The quoted form is folded to ASCII for old clients; the
 * RFC 8187 `filename*` carries the real name for everyone else.
 */
export function contentDisposition(filename: string): string {
  const safe = filename
    .replace(/[‐-―]/g, "-")   // hyphens, en/em dashes
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "ANC Report.xlsx";
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

