/**
 * Converts Univer IWorkbookData JSON (from /api/estimator/preview-univer)
 * into WorkbookData format for WorkbookShell rendering.
 *
 * This lets the estimator use the same HTML table renderer as the RFP Analyzer,
 * which supports native <select> dropdowns in cells.
 */

import type { WorkbookData, SheetTab, SheetRow, SheetCell } from "@/app/components/reusables/workbookTypes";

interface UniverCell {
  v?: string | number | boolean;
  f?: string;
  s?: Record<string, any> | null;
  t?: number; // 1=String, 2=Number, 3=Boolean
}

interface UniverSheet {
  id: string;
  name: string;
  tabColor?: string;
  cellData: Record<number, Record<number, UniverCell>>;
  columnData?: Record<number, { w: number }>;
}

interface UniverWorkbookData {
  sheetOrder: string[];
  sheets: Record<string, UniverSheet>;
}

function formatCellValue(cell: UniverCell, numFmt?: string): string | number {
  const v = cell.v;
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v;
}

function isBold(cell: UniverCell): boolean {
  return cell.s?.bl === 1;
}

function isCurrency(cell: UniverCell): boolean {
  const pat = cell.s?.n?.pattern;
  if (!pat) return false;
  return pat.includes("$") || pat.includes("#,##0.00");
}

function isPercent(cell: UniverCell): boolean {
  const pat = cell.s?.n?.pattern;
  if (!pat) return false;
  return pat.includes("%");
}

function getAlign(cell: UniverCell): "left" | "center" | "right" | undefined {
  const ht = cell.s?.ht;
  if (ht === 1) return "left";
  if (ht === 2) return "center";
  if (ht === 3) return "right";
  return undefined;
}

function isHeaderRow(row: Record<number, UniverCell>): boolean {
  // Check if most cells have dark background (header style)
  let headerCells = 0;
  let totalCells = 0;
  for (const col of Object.keys(row)) {
    const cell = row[Number(col)];
    if (!cell || cell.v == null) continue;
    totalCells++;
    const bg = cell.s?.bg?.rgb;
    if (bg && (bg === "#1F2937" || bg === "#0A52EF" || bg === "#28A745" || bg.toLowerCase().includes("1f29"))) {
      headerCells++;
    }
    if (cell.s?.bl === 1 && cell.s?.cl?.rgb && cell.s.cl.rgb.toLowerCase().includes("fff")) {
      headerCells++;
    }
  }
  return totalCells > 0 && headerCells >= totalCells * 0.5;
}

function isTotalRow(row: Record<number, UniverCell>): boolean {
  for (const col of Object.keys(row)) {
    const cell = row[Number(col)];
    const val = String(cell?.v || "").toUpperCase();
    if (val.includes("GRAND TOTAL") || val.includes("SUBTOTAL") || val.includes("BASE BID")) {
      return true;
    }
  }
  return false;
}

export function univerToWorkbook(
  data: UniverWorkbookData,
  options?: {
    productDropdowns?: {
      sheetName: string;
      column: number; // 0-based column for Product dropdown
      dataStartRow: number; // 0-based first data row
      products: { value: string; label: string }[];
      displayProductIds: string[]; // current product ID per display
      onSelect: (displayIndex: number, productId: string) => void;
    };
  },
): WorkbookData {
  const sheets: SheetTab[] = [];

  for (const sheetId of data.sheetOrder) {
    const sheet = data.sheets[sheetId];
    if (!sheet) continue;

    // Skip hidden sheets
    if (sheet.name.startsWith("_")) continue;

    // Find dimensions
    const rowNums = Object.keys(sheet.cellData).map(Number).sort((a, b) => a - b);
    if (rowNums.length === 0) {
      sheets.push({
        name: sheet.name,
        color: sheet.tabColor || "#666",
        columns: [],
        rows: [],
        placeholder: true,
        placeholderMessage: "Empty sheet",
      });
      continue;
    }

    const maxRow = rowNums[rowNums.length - 1];
    let maxCol = 0;
    for (const r of rowNums) {
      const cols = Object.keys(sheet.cellData[r] || {}).map(Number);
      if (cols.length) maxCol = Math.max(maxCol, Math.max(...cols));
    }

    // Build column headers from first header-like row, or just letters
    const columns: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      columns.push(String.fromCharCode(65 + (c % 26)));
    }

    // Find the actual header row (first row with header styling)
    let headerRowIdx = -1;
    for (const r of rowNums) {
      const rowData = sheet.cellData[r];
      if (rowData && isHeaderRow(rowData)) {
        headerRowIdx = r;
        // Use header cell values as column names
        for (let c = 0; c <= maxCol; c++) {
          const cell = rowData[c];
          if (cell?.v != null) columns[c] = String(cell.v);
        }
        break;
      }
    }

    // Build rows
    const rows: SheetRow[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const rowData = sheet.cellData[r];
      if (!rowData) continue;
      // Skip the header row we already used for columns
      if (r === headerRowIdx) continue;
      // Skip title rows (row 0-1 typically)
      if (r < (headerRowIdx >= 0 ? headerRowIdx : 2)) continue;

      const cells: SheetCell[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const cell = rowData[c];
        if (!cell) {
          cells.push({ value: "" });
          continue;
        }

        const shellCell: SheetCell = {
          value: formatCellValue(cell),
          bold: isBold(cell),
          currency: isCurrency(cell),
          percent: isPercent(cell),
          align: getAlign(cell),
        };

        // Inject product dropdown if this is the right sheet/column/row
        const pd = options?.productDropdowns;
        if (pd && sheet.name === pd.sheetName && c === pd.column && r >= pd.dataStartRow) {
          const displayIdx = r - pd.dataStartRow;
          if (displayIdx >= 0 && displayIdx < pd.displayProductIds.length) {
            shellCell.value = pd.displayProductIds[displayIdx] || "";
            shellCell.dropdown = pd.products;
            shellCell.onDropdownChange = (val: string) => pd.onSelect(displayIdx, val);
          }
        }

        cells.push(shellCell);
      }

      rows.push({
        cells,
        isHeader: isHeaderRow(rowData),
        isTotal: isTotalRow(rowData),
      });
    }

    sheets.push({
      name: sheet.name,
      color: sheet.tabColor || "#666",
      columns,
      rows,
    });
  }

  return { fileName: "Cost Analysis", sheets };
}
