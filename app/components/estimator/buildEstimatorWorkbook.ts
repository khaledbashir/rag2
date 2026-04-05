/**
 * buildEstimatorWorkbook — Converts server-generated Univer preview data
 * into WorkbookShell format with in-cell product dropdowns.
 *
 * This is the estimator's own builder. It does NOT import any RFP code.
 * It reads the Univer JSON that /api/estimator/preview-univer returns
 * and converts it to WorkbookData for WorkbookShell rendering.
 */

import type { WorkbookData, SheetTab, SheetRow, SheetCell } from "@/app/components/reusables/workbookTypes";

// ─── Types ──────────────────────────────────────────────────────────────────

interface UniverCell {
  v?: string | number | boolean;
  f?: string;
  s?: Record<string, any> | null;
  t?: number;
}

interface UniverSheet {
  name: string;
  tabColor?: string;
  cellData: Record<number, Record<number, UniverCell>>;
}

interface UniverWorkbook {
  sheetOrder: string[];
  sheets: Record<string, UniverSheet>;
}

interface ProductOption {
  id: string;
  label: string;
  name: string;
  pitch: number;
  manufacturer?: string;
  nits?: number;
}

/** Per-display cost breakdown from client-side calculateDisplay() */
interface DisplayCalc {
  name: string;
  heightFt: number;
  widthFt: number;
  areaSqFt: number;
  pixelPitch: number;
  pixelsW: number;
  pixelsH: number;
  costPerSqFt: number;
  hardwareCost: number;
  spareParts: number;
  processorCost: number;
  equipmentCost: number;
  shippingCost: number;
  totalCost: number;
  marginPct: number;
  ledMarginPct: number;
  sellPrice: number;
  cabinetLayout?: {
    actualWidthFt: number;
    actualHeightFt: number;
    actualAreaSqFt: number;
    actualResolutionW: number;
    actualResolutionH: number;
  } | null;
}

export interface EstimatorWorkbookOptions {
  /** Available products for dropdown */
  products: ProductOption[];
  /** Current product ID per display (indexed by display order) */
  displayProductIds: string[];
  /** Maps LED Cost Sheet row index (0-based, workbook view) to display index */
  displayRowMap?: Record<number, number>;
  /** Called when user picks a product from the dropdown */
  onProductSelect: (displayIndex: number, productId: string) => void;
  /** Client-side cost calculations — used to update LED Cost Sheet instantly */
  calcs?: DisplayCalc[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isBold(cell: UniverCell): boolean {
  return cell.s?.bl === 1;
}

function hasWhiteFont(cell: UniverCell): boolean {
  const rgb = cell.s?.cl?.rgb;
  return rgb && (rgb.toLowerCase() === "#ffffff" || rgb.toLowerCase() === "#fff");
}

function hasDarkBg(cell: UniverCell): boolean {
  const bg = cell.s?.bg?.rgb?.toLowerCase();
  if (!bg) return false;
  return bg.includes("1f29") || bg.includes("0a52") || bg === "#1f2937" || bg === "#0a52ef";
}

function isHeaderRow(rowData: Record<number, UniverCell>): boolean {
  let dark = 0;
  let total = 0;
  for (const c of Object.values(rowData)) {
    if (c?.v == null && !c?.f) continue;
    total++;
    if (hasDarkBg(c) || (isBold(c) && hasWhiteFont(c))) dark++;
  }
  return total > 2 && dark >= total * 0.4;
}

function isTotalRow(rowData: Record<number, UniverCell>): boolean {
  for (const c of Object.values(rowData)) {
    const v = String(c?.v || "").toUpperCase();
    if (v.includes("GRAND TOTAL") || v.includes("SUBTOTAL") || v.includes("BASE BID")) return true;
  }
  return false;
}

function getCellAlign(cell: UniverCell): "left" | "center" | "right" | undefined {
  const ht = cell.s?.ht;
  if (ht === 2) return "center";
  if (ht === 3) return "right";
  return undefined;
}

function hasYellowBg(cell: UniverCell): boolean {
  const bg = cell.s?.bg?.rgb?.toLowerCase();
  if (!bg) return false;
  return bg.includes("ffff00") || bg.includes("fff200") || bg.includes("ffc000");
}

function hasCurrencyFormat(cell: UniverCell): boolean {
  const p = cell.s?.n?.pattern;
  return p ? (p.includes("$") || p.includes("#,##0.00")) : false;
}

function hasPercentFormat(cell: UniverCell): boolean {
  const p = cell.s?.n?.pattern;
  return p ? p.includes("%") : false;
}

function cellValue(cell: UniverCell): string | number {
  if (cell.v == null) return "";
  if (typeof cell.v === "boolean") return cell.v ? "TRUE" : "FALSE";
  return cell.v;
}

function collapseAdjacentDuplicateLabels(cells: SheetCell[]): SheetCell[] {
  let lastVisibleText = "";
  return cells.map((cell) => {
    const text = String(cell.value || "").trim();
    const isDuplicateLabel = !cell.highlight && !!text && text === lastVisibleText;
    if (isDuplicateLabel) {
      return { ...cell, value: "" };
    }
    if (text) lastVisibleText = text;
    return cell;
  });
}

// ─── Builder ────────────────────────────────────────────────────────────────

export function buildEstimatorWorkbook(
  data: UniverWorkbook,
  options?: EstimatorWorkbookOptions,
): WorkbookData {
  const sheets: SheetTab[] = [];

  // Pre-sort products for dropdown
  const dropdownOpts = options
    ? [...options.products].sort((a, b) => a.label.localeCompare(b.label)).map((p) => ({ value: p.id, label: p.label }))
    : [];

  // Qty is free-type editable via editableColumns — no dropdown

  for (const sheetId of data.sheetOrder) {
    const sheet = data.sheets[sheetId];
    if (!sheet || sheet.name.startsWith("_")) continue;

    const rowNums = Object.keys(sheet.cellData).map(Number).sort((a, b) => a - b);
    if (!rowNums.length) {
      sheets.push({ name: sheet.name, color: sheet.tabColor || "#666", columns: [], rows: [] });
      continue;
    }

    // Find max column
    let maxCol = 0;
    for (const r of rowNums) {
      const cols = Object.keys(sheet.cellData[r] || {}).map(Number);
      if (cols.length) maxCol = Math.max(maxCol, ...cols);
    }

    // Find header row — first row with dark background styling
    let headerRowIdx = -1;
    const columns: string[] = Array.from({ length: maxCol + 1 }, (_, i) => String.fromCharCode(65 + (i % 26)));
    for (const r of rowNums) {
      if (sheet.cellData[r] && isHeaderRow(sheet.cellData[r])) {
        headerRowIdx = r;
        for (let c = 0; c <= maxCol; c++) {
          const cell = sheet.cellData[r]?.[c];
          if (cell?.v != null) columns[c] = String(cell.v);
        }
        break;
      }
    }

    // Is this the LED Cost Sheet? (for product dropdown injection)
    const isLedCostSheet = sheet.name === "LED Cost Sheet";
    // LED Cost Sheet data starts at 0-based row 3 (Excel row 4)
    // Product is col 5 (F), Qty is col 11 (L)
    const LED_DATA_START = 3;
    const LED_PRODUCT_COL = 5;

    // Build rows
    const rows: SheetRow[] = [];
    for (const r of rowNums) {
      const rowData = sheet.cellData[r];
      if (!rowData) continue;

      // Skip rows before header (title rows) — except rows with yellow cells (margin override)
      if (headerRowIdx >= 0 && r <= headerRowIdx) {
        if (r < headerRowIdx) {
          let hasYellow = false;
          for (const c of Object.values(rowData)) {
            if (c && hasYellowBg(c)) { hasYellow = true; break; }
          }
          if (hasYellow) {
            // Render this pre-header row but mark it as a special non-data row
            const specialCells: SheetCell[] = [];
            for (let c = 0; c <= maxCol; c++) {
              const cell = rowData[c];
              if (!cell) { specialCells.push({ value: "" }); continue; }
              specialCells.push({
                value: cellValue(cell),
                bold: isBold(cell),
                currency: hasCurrencyFormat(cell),
                percent: hasPercentFormat(cell),
                align: getCellAlign(cell),
                highlight: hasYellowBg(cell),
              });
            }
            rows.push({ cells: collapseAdjacentDuplicateLabels(specialCells), isHeader: true, sourceRow: r });
          }
        }
        continue;
      }

      const isHdr = isHeaderRow(rowData);
      const isTotal = isTotalRow(rowData);

      const cells: SheetCell[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const cell = rowData[c];
        if (!cell) { cells.push({ value: "" }); continue; }

        const sc: SheetCell = {
          value: cellValue(cell),
          bold: isBold(cell),
          currency: hasCurrencyFormat(cell),
          percent: hasPercentFormat(cell),
          align: getCellAlign(cell),
          highlight: hasYellowBg(cell),
        };

        // Header rows get header styling
        if (isHdr) {
          sc.header = true;
          sc.bold = true;
        }

        // LED Cost Sheet data rows: inject product dropdown only.
        // All displayed numbers should come from the server-generated workbook.
        if (isLedCostSheet && r >= LED_DATA_START && options) {
          const displayIdx = options.displayRowMap?.[r] ?? (r - LED_DATA_START);
          if (displayIdx >= 0 && displayIdx < options.displayProductIds.length) {
            // Product dropdown (col 5 = F)
            if (c === LED_PRODUCT_COL && dropdownOpts.length > 0) {
              const currentProductId = options.displayProductIds[displayIdx] || "";
              if (currentProductId) {
                sc.value = currentProductId;
              } else {
                const workbookProductName = String(cellValue(cell) || "").trim();
                const resolvedOption = options.products.find((p) =>
                  p.name.trim().toLowerCase() === workbookProductName.toLowerCase()
                  || p.label.trim().toLowerCase() === workbookProductName.toLowerCase()
                );
                sc.value = resolvedOption?.id || "";
              }
              sc.dropdown = dropdownOpts;
              sc.onDropdownChange = (val: string) => options.onProductSelect(displayIdx, val);
            }
          }
        }

        cells.push(sc);
      }

      rows.push({ cells, isHeader: isHdr, isTotal, sourceRow: r });
    }

    const tab: SheetTab = {
      name: sheet.name,
      color: sheet.tabColor || "#666",
      columns,
      rows,
    };
    // LED Cost Sheet: H(ft)=7, W(ft)=8, Qty=11, Margin Override=21
    if (isLedCostSheet) {
      tab.editableColumns = [7, 8, 11, 21];
    }
    sheets.push(tab);
  }

  return { fileName: "Cost Analysis", sheets };
}
