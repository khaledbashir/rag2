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
    // LED Cost Sheet data starts at 0-based row 3 (Excel row 4), Product is col 5 (F)
    const LED_DATA_START = 3;
    const LED_PRODUCT_COL = 5;

    // Build rows
    const rows: SheetRow[] = [];
    for (const r of rowNums) {
      const rowData = sheet.cellData[r];
      if (!rowData) continue;

      // Skip rows before header (title rows)
      if (headerRowIdx >= 0 && r <= headerRowIdx) continue;

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
        };

        // Header rows get header styling
        if (isHdr) {
          sc.header = true;
          sc.bold = true;
        }

        // LED Cost Sheet data rows: inject product dropdown + overlay client-side calcs
        if (isLedCostSheet && r >= LED_DATA_START && options) {
          const displayIdx = r - LED_DATA_START;
          if (displayIdx >= 0 && displayIdx < options.displayProductIds.length) {
            // Product dropdown (col 5 = F)
            if (c === LED_PRODUCT_COL && dropdownOpts.length > 0) {
              sc.value = options.displayProductIds[displayIdx] || "";
              sc.dropdown = dropdownOpts;
              sc.onDropdownChange = (val: string) => options.onProductSelect(displayIdx, val);
            }

            // Overlay client-side calcs for instant update (no server round-trip)
            const calc = options.calcs?.[displayIdx];
            const product = options.products.find((p) => p.id === options.displayProductIds[displayIdx]);
            if (calc) {
              // LED Cost Sheet columns (0-based):
              // 4=Vendor, 6=Pitch, 7=H(ft), 8=W(ft), 9=H(px), 10=W(px),
              // 12=TotalSqFt, 13=NITs, 15=$/SqFt, 16=DisplayCost,
              // 17=Processor, 18=Shipping, 19=TotalCost,
              // 20=Margin%, 21=SellingPrice, 22=ANCMargin
              const fmt = (n: number) => Math.round(n * 100) / 100;
              // LED-only costs: Display Cost + Processor/Equipment + Shipping
              // (structural, labor, electrical, PM, engineering are in Margin Analysis, NOT here)
              const ledDisplayCost = calc.hardwareCost + calc.spareParts;
              const ledProcessorCost = calc.processorCost + calc.equipmentCost;
              const ledTotalCost = ledDisplayCost + ledProcessorCost + calc.shippingCost;
              const ledMargin = calc.ledMarginPct;
              const ledSellPrice = ledMargin < 1 ? fmt(ledTotalCost / (1 - ledMargin)) : ledTotalCost;
              const cab = calc.cabinetLayout;
              if (c === 4 && product) sc.value = product.manufacturer || "";
              if (c === 6 && product) sc.value = product.pitch;
              if (c === 7) sc.value = fmt(cab?.actualHeightFt ?? calc.heightFt);
              if (c === 8) sc.value = fmt(cab?.actualWidthFt ?? calc.widthFt);
              if (c === 9) sc.value = cab?.actualResolutionH ?? calc.pixelsH;
              if (c === 10) sc.value = cab?.actualResolutionW ?? calc.pixelsW;
              if (c === 12) sc.value = Math.round(cab?.actualAreaSqFt ?? calc.areaSqFt);
              if (c === 13 && product) sc.value = product.nits || 0;
              if (c === 15) { sc.value = fmt(calc.costPerSqFt); sc.currency = true; }
              if (c === 16) { sc.value = fmt(ledDisplayCost); sc.currency = true; }
              if (c === 17) { sc.value = fmt(ledProcessorCost); sc.currency = true; }
              if (c === 18) { sc.value = fmt(calc.shippingCost); sc.currency = true; }
              if (c === 19) { sc.value = fmt(ledTotalCost); sc.currency = true; sc.bold = true; }
              if (c === 20) { sc.value = ledMargin; sc.percent = true; }
              if (c === 21) { sc.value = ledSellPrice; sc.currency = true; sc.bold = true; }
              if (c === 22) { sc.value = fmt(ledSellPrice - ledTotalCost); sc.currency = true; }
            }
          }
        }

        // LED Cost Sheet TOTAL row: overlay with summed client-side calcs
        // so TOTAL matches overlaid data rows (both use LED-only values)
        if (isLedCostSheet && options?.calcs && options.calcs.length > 0) {
          const cellStr = String(rowData[0]?.v || "").toUpperCase();
          if (cellStr.startsWith("TOTAL")) {
            const fmt = (n: number) => Math.round(n * 100) / 100;
            const allCalcs = options.calcs;
            const sumDisplayCost = allCalcs.reduce((s, calc) => s + calc.hardwareCost + calc.spareParts, 0);
            const sumProcessorCost = allCalcs.reduce((s, calc) => s + calc.processorCost + calc.equipmentCost, 0);
            const sumShippingCost = allCalcs.reduce((s, calc) => s + calc.shippingCost, 0);
            const sumLedTotal = sumDisplayCost + sumProcessorCost + sumShippingCost;
            const avgLedMargin = allCalcs.length > 0 ? allCalcs[0].ledMarginPct : 0.15;
            const sumLedSell = allCalcs.reduce((s, calc) => {
              const lt = (calc.hardwareCost + calc.spareParts) + (calc.processorCost + calc.equipmentCost) + calc.shippingCost;
              const m = calc.ledMarginPct;
              return s + (m < 1 ? lt / (1 - m) : lt);
            }, 0);
            const blendedMargin = sumLedSell > 0 ? 1 - (sumLedTotal / sumLedSell) : avgLedMargin;
            if (c === 16) { sc.value = fmt(sumDisplayCost); sc.currency = true; sc.bold = true; }
            if (c === 17) { sc.value = fmt(sumProcessorCost); sc.currency = true; sc.bold = true; }
            if (c === 18) { sc.value = fmt(sumShippingCost); sc.currency = true; sc.bold = true; }
            if (c === 19) { sc.value = fmt(sumLedTotal); sc.currency = true; sc.bold = true; }
            if (c === 20) { sc.value = blendedMargin; sc.percent = true; sc.bold = true; }
            if (c === 21) { sc.value = fmt(sumLedSell); sc.currency = true; sc.bold = true; }
            if (c === 22) { sc.value = fmt(sumLedSell - sumLedTotal); sc.currency = true; sc.bold = true; }
          }
        }

        cells.push(sc);
      }

      rows.push({ cells, isHeader: isHdr, isTotal });
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
