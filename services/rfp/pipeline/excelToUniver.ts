/**
 * ExcelJS → Univer IWorkbookData converter.
 *
 * Shared utility used by both the Estimator preview-univer and
 * RFP Analyzer preview-univer endpoints. Ensures both render
 * the EXACT same workbook the export downloads.
 */

import ExcelJS from "exceljs";

// ─── Univer types ────────────────────────────────────────────────────────────

export interface UniverCell {
  v?: string | number | boolean;
  f?: string;
  s?: Record<string, any> | null;
  /** Cell value type: 1=String, 2=Number, 3=Boolean */
  t?: number;
}

export interface UniverSheet {
  id: string;
  name: string;
  tabColor?: string;
  rowCount: number;
  columnCount: number;
  defaultColumnWidth: number;
  defaultRowHeight: number;
  cellData: Record<number, Record<number, UniverCell>>;
  columnData: Record<number, { w: number }>;
  rowData: Record<number, { h: number }>;
  mergeData: { startRow: number; endRow: number; startColumn: number; endColumn: number }[];
  showGridlines: number;
  freeze?: { xSplit: number; ySplit: number; startRow: number; startColumn: number };
}

export interface UniverWorkbookData {
  id: string;
  name: string;
  appVersion: string;
  locale: string;
  styles: Record<string, any>;
  sheetOrder: string[];
  sheets: Record<string, UniverSheet>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractArgb(argb: string | undefined): string | undefined {
  if (!argb) return undefined;
  if (argb.length === 8) return `#${argb.substring(2)}`;
  if (argb.length === 6) return `#${argb}`;
  return `#${argb}`;
}

function convertCell(cell: ExcelJS.Cell): UniverCell | null {
  const result: UniverCell = {};
  const style: Record<string, any> = {};
  let hasStyle = false;

  const cellValue = cell.value;
  if (cellValue === null || cellValue === undefined) return null;

  // Formula cell — use cached result as display value
  if (typeof cellValue === "object" && cellValue !== null && "formula" in cellValue) {
    const fObj = cellValue as { formula: string; result?: any };
    if (fObj.result != null && typeof fObj.result === "number" && isFinite(fObj.result)) {
      result.v = fObj.result;
      result.t = 2;
    } else if (fObj.result != null) {
      const parsed = typeof fObj.result === "string" ? parseFloat(fObj.result) : NaN;
      if (!isNaN(parsed) && isFinite(parsed)) {
        result.v = parsed;
        result.t = 2;
      } else {
        result.v = fObj.result;
      }
    } else {
      result.f = `=${fObj.formula}`;
    }
  } else if (typeof cellValue === "object" && cellValue !== null && "richText" in cellValue) {
    const rt = cellValue as { richText: { text: string }[] };
    result.v = rt.richText.map((r) => r.text).join("");
  } else if (cellValue instanceof Date) {
    const epoch = new Date(1899, 11, 30).getTime();
    result.v = (cellValue.getTime() - epoch) / 86400000;
  } else {
    result.v = cellValue as string | number | boolean;
  }

  // Type hints
  if (typeof result.v === "number") {
    result.t = 2;
  } else if (typeof result.v === "boolean") {
    result.t = 3;
  } else if (typeof result.v === "string") {
    const numFmt = cell.numFmt;
    if (numFmt && (numFmt.includes("%") || numFmt.includes("#") || numFmt.includes("0"))) {
      const parsed = parseFloat(result.v);
      if (!isNaN(parsed) && isFinite(parsed) && String(parsed) === result.v.trim()) {
        result.v = parsed;
        result.t = 2;
      } else {
        result.t = 1;
      }
    } else {
      result.t = 1;
    }
  }

  // Number format
  if (cell.numFmt) { style.n = { pattern: cell.numFmt }; hasStyle = true; }

  // Font
  const font = cell.font;
  if (font) {
    if (font.bold) { style.bl = 1; hasStyle = true; }
    if (font.italic) { style.it = 1; hasStyle = true; }
    if (font.underline) { style.ul = { s: 1 }; hasStyle = true; }
    if (font.size) { style.fs = font.size; hasStyle = true; }
    if (font.name) { style.ff = font.name; hasStyle = true; }
    if (font.color?.argb) {
      const rgb = extractArgb(font.color.argb);
      if (rgb) { style.cl = { rgb }; hasStyle = true; }
    }
  }

  // Fill
  const fill = cell.fill;
  if (fill && fill.type === "pattern" && (fill as any).fgColor?.argb) {
    const rgb = extractArgb((fill as any).fgColor.argb);
    if (rgb) { style.bg = { rgb }; hasStyle = true; }
  }

  // Alignment
  const alignment = cell.alignment;
  if (alignment) {
    if (alignment.horizontal === "center") { style.ht = 2; hasStyle = true; }
    else if (alignment.horizontal === "right") { style.ht = 3; hasStyle = true; }
    else if (alignment.horizontal === "left") { style.ht = 1; hasStyle = true; }
    if (alignment.vertical === "middle") { style.vt = 2; hasStyle = true; }
    else if (alignment.vertical === "bottom") { style.vt = 3; hasStyle = true; }
    else if (alignment.vertical === "top") { style.vt = 1; hasStyle = true; }
    if (alignment.wrapText) { style.tb = 3; hasStyle = true; }
  }

  // Border
  const border = cell.border;
  if (border) {
    const borderStyle: Record<string, any> = {};
    const mapSide = (side: any) => {
      if (!side?.style) return undefined;
      const s: Record<string, any> = { s: side.style === "thin" ? 1 : side.style === "medium" ? 2 : 3 };
      if (side.color?.argb) { const rgb = extractArgb(side.color.argb); if (rgb) s.cl = { rgb }; }
      return s;
    };
    if (border.top) borderStyle.t = mapSide(border.top);
    if (border.bottom) borderStyle.b = mapSide(border.bottom);
    if (border.left) borderStyle.l = mapSide(border.left);
    if (border.right) borderStyle.r = mapSide(border.right);
    if (Object.keys(borderStyle).length) { style.bd = borderStyle; hasStyle = true; }
  }

  result.s = hasStyle ? style : null;
  return result;
}

export function convertWorksheet(ws: ExcelJS.Worksheet, sheetId: string): UniverSheet {
  const cellData: Record<number, Record<number, UniverCell>> = {};
  const columnData: Record<number, { w: number }> = {};
  const rowData: Record<number, { h: number }> = {};
  let maxRow = 0;
  let maxCol = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const r = rowNumber - 1;
    if (r > maxRow) maxRow = r;
    if (row.height) rowData[r] = { h: row.height };
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const c = colNumber - 1;
      if (c > maxCol) maxCol = c;
      const univerCell = convertCell(cell);
      if (univerCell) {
        if (!cellData[r]) cellData[r] = {};
        cellData[r][c] = univerCell;
      }
    });
  });

  for (let c = 1; c <= maxCol + 1; c++) {
    const col = ws.getColumn(c);
    if (col.width) columnData[c - 1] = { w: Math.round(col.width * 8) };
  }

  const mergeData: UniverSheet["mergeData"] = [];
  const mergeModel = (ws as any)._merges || {};
  for (const key of Object.keys(mergeModel)) {
    const merge = mergeModel[key];
    if (merge?.model) {
      const m = merge.model;
      mergeData.push({ startRow: m.top - 1, endRow: m.bottom - 1, startColumn: m.left - 1, endColumn: m.right - 1 });
    }
  }

  let tabColor: string | undefined;
  const props = ws.properties as any;
  if (props?.tabColor?.argb) tabColor = extractArgb(props.tabColor.argb);

  return {
    id: sheetId,
    name: ws.name,
    tabColor,
    rowCount: maxRow + 50,
    columnCount: maxCol + 10,
    defaultColumnWidth: 100,
    defaultRowHeight: 24,
    cellData,
    columnData,
    rowData,
    mergeData,
    showGridlines: 1,
    freeze: { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 },
  };
}

/** Convert an entire ExcelJS workbook to Univer IWorkbookData */
export function convertWorkbook(wb: ExcelJS.Workbook, id: string, name: string): UniverWorkbookData {
  const sheetOrder: string[] = [];
  const sheets: Record<string, UniverSheet> = {};

  wb.eachSheet((ws, sheetIndex) => {
    const sheetId = `sheet-${sheetIndex - 1}`;
    sheetOrder.push(sheetId);
    sheets[sheetId] = convertWorksheet(ws, sheetId);
  });

  return {
    id,
    name,
    appVersion: "1.0.0",
    locale: "EN_US",
    styles: {},
    sheetOrder,
    sheets,
  };
}
