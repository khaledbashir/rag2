/**
 * POST /api/estimator/preview-univer
 *
 * Generates the canonical scoping workbook via ExcelJS, then converts
 * it to Univer IWorkbookData JSON format for live in-browser rendering
 * with real formula recalculation.
 *
 * Body: { answers: EstimatorAnswers }
 * Returns: IWorkbookData JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { mapEstimatorToScoping } from "@/services/rfp/pipeline/estimatorToScopingMapper";
import { generateScopingWorkbook } from "@/services/rfp/pipeline/generateScopingWorkbook";
import type { EstimatorAnswers } from "@/app/components/estimator/questions";
import { log } from "@/lib/logger";
import ExcelJS from "exceljs";

// ─── ExcelJS → Univer conversion helpers ─────────────────────────────────────

interface UniverCell {
  v?: string | number | boolean;
  f?: string;
  s?: Record<string, any> | null;
}

interface UniverSheet {
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

function extractArgb(argb: string | undefined): string | undefined {
  if (!argb) return undefined;
  // ExcelJS ARGB is "FFRRGGBB" (8 chars) or "RRGGBB" (6 chars)
  if (argb.length === 8) return `#${argb.substring(2)}`;
  if (argb.length === 6) return `#${argb}`;
  return `#${argb}`;
}

function convertCell(cell: ExcelJS.Cell): UniverCell | null {
  const result: UniverCell = {};
  const style: Record<string, any> = {};
  let hasStyle = false;

  // Value & formula
  const cellValue = cell.value;
  if (cellValue === null || cellValue === undefined) return null;

  if (typeof cellValue === "object" && cellValue !== null && "formula" in cellValue) {
    // Formula cell — only pass `f`, NOT `v`. Univer skips recalculation
    // if a cached `v` is present. Let the formula engine compute values live.
    const fObj = cellValue as { formula: string; result?: any };
    result.f = `=${fObj.formula}`;
  } else if (typeof cellValue === "object" && cellValue !== null && "richText" in cellValue) {
    // Rich text — flatten to plain string
    const rt = cellValue as { richText: { text: string }[] };
    result.v = rt.richText.map((r) => r.text).join("");
  } else if (cellValue instanceof Date) {
    // Date — convert to serial number (Excel epoch: 1900-01-01, with the 1900 bug)
    const epoch = new Date(1899, 11, 30).getTime();
    result.v = (cellValue.getTime() - epoch) / 86400000;
  } else {
    result.v = cellValue as string | number | boolean;
  }

  // Number format
  const numFmt = cell.numFmt;
  if (numFmt) {
    style.n = { pattern: numFmt };
    hasStyle = true;
  }

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

  // Fill (background)
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
    const mapBorderSide = (side: any) => {
      if (!side || !side.style) return undefined;
      const s: Record<string, any> = { s: side.style === "thin" ? 1 : side.style === "medium" ? 2 : side.style === "thick" ? 3 : 1 };
      if (side.color?.argb) {
        const rgb = extractArgb(side.color.argb);
        if (rgb) s.cl = { rgb };
      }
      return s;
    };
    if (border.top) borderStyle.t = mapBorderSide(border.top);
    if (border.bottom) borderStyle.b = mapBorderSide(border.bottom);
    if (border.left) borderStyle.l = mapBorderSide(border.left);
    if (border.right) borderStyle.r = mapBorderSide(border.right);
    if (Object.keys(borderStyle).length) {
      style.bd = borderStyle;
      hasStyle = true;
    }
  }

  result.s = hasStyle ? style : null;
  return result;
}

function convertWorksheet(ws: ExcelJS.Worksheet, sheetId: string): UniverSheet {
  const cellData: Record<number, Record<number, UniverCell>> = {};
  const columnData: Record<number, { w: number }> = {};
  const rowData: Record<number, { h: number }> = {};

  let maxRow = 0;
  let maxCol = 0;

  // Iterate rows
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const r = rowNumber - 1; // 0-based
    if (r > maxRow) maxRow = r;

    // Row height
    if (row.height) {
      rowData[r] = { h: row.height };
    }

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const c = colNumber - 1; // 0-based
      if (c > maxCol) maxCol = c;

      const univerCell = convertCell(cell);
      if (univerCell) {
        if (!cellData[r]) cellData[r] = {};
        cellData[r][c] = univerCell;
      }
    });
  });

  // Column widths
  for (let c = 1; c <= maxCol + 1; c++) {
    const col = ws.getColumn(c);
    if (col.width) {
      // ExcelJS width is in characters (~7px each), Univer wants pixels
      columnData[c - 1] = { w: Math.round(col.width * 8) };
    }
  }

  // Merged cells
  const mergeData: UniverSheet["mergeData"] = [];
  const mergeModel = (ws as any)._merges || {};
  // ExcelJS stores merges as a dict keyed by top-left cell ref
  for (const key of Object.keys(mergeModel)) {
    const merge = mergeModel[key];
    if (merge && merge.model) {
      const m = merge.model;
      mergeData.push({
        startRow: m.top - 1,
        endRow: m.bottom - 1,
        startColumn: m.left - 1,
        endColumn: m.right - 1,
      });
    }
  }

  // Tab color
  let tabColor: string | undefined;
  const props = ws.properties as any;
  if (props?.tabColor?.argb) {
    tabColor = extractArgb(props.tabColor.argb);
  }

  return {
    id: sheetId,
    name: ws.name,
    tabColor,
    rowCount: maxRow + 50, // Add buffer
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const answers: EstimatorAnswers = body.answers;

    if (!answers || !answers.displays?.length) {
      return NextResponse.json(
        { error: "answers with at least one display is required" },
        { status: 400 },
      );
    }

    // Map Budget estimator data → scoping workbook options
    const options = mapEstimatorToScoping(answers);

    // Generate the canonical workbook (returns workbook object directly)
    const { workbook: wb, displays: computedDisplays } = await generateScopingWorkbook(options);

    // Compute project total for list page display
    const projectTotal = computedDisplays.reduce((s, d) => s + (d.sellingPrice || 0), 0);

    // Convert each worksheet to Univer format
    const sheetOrder: string[] = [];
    const sheets: Record<string, UniverSheet> = {};

    wb.eachSheet((ws, sheetIndex) => {
      const sheetId = `sheet-${sheetIndex - 1}`;
      sheetOrder.push(sheetId);
      sheets[sheetId] = convertWorksheet(ws, sheetId);
    });

    const workbookData = {
      id: "estimator-workbook",
      name: "Cost Analysis",
      appVersion: "1.0.0",
      locale: "EN_US",
      styles: {},
      sheetOrder,
      sheets,
    };

    return NextResponse.json({ ...workbookData, projectTotal });
  } catch (err) {
    log.error("[preview-univer] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
