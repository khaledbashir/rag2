import ExcelJS from "exceljs";
import { excelCurrencyFmt } from "@/services/pricing/currencyService";

type InternalAuditLike = {
  perScreen?: any[];
  totals?: any;
};

function toNumber(val: any): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function tryParseMatrix(value: any): { h: number; w: number } | null {
  const s = (value ?? "").toString();
  const m = s.match(/(\d+)\s*x\s*(\d+)/i);
  if (!m) return null;
  const h = Number(m[1]);
  const w = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(w)) return null;
  return { h, w };
}

function setHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number, labels: string[]) {
  const row = sheet.getRow(rowNumber);
  row.values = labels;
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

export interface ProjectSummaryInfo {
  projectName?: string;
  clientName?: string;
  createdAt?: string;
  updatedAt?: string;
  documentMode?: string;
  displayCount?: number;
}

export function buildProjectSummary(
  sheet: ExcelJS.Worksheet,
  info: ProjectSummaryInfo,
  currency?: string,
  documentTotal?: number,
) {
  const moneyFmt = excelCurrencyFmt(currency);
  const projectName = info.projectName || info.clientName || "Untitled Project";

  // Title row
  sheet.mergeCells("A1:C1");
  sheet.getCell("A1").value = projectName;
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 30;

  // Subtitle
  sheet.mergeCells("A2:C2");
  sheet.getCell("A2").value = "ANC LED Display Proposal";
  sheet.getCell("A2").font = { size: 11, italic: true, color: { argb: "FF6C757D" } };

  // Summary fields starting at row 4
  const fields: [string, any][] = [
    ["Project Name", projectName],
    ["Client", info.clientName || "—"],
    ["Document Type", (info.documentMode || "BUDGET").replace(/_/g, " ")],
    ["Number of Displays", info.displayCount ?? 0],
    ["Created", info.createdAt || new Date().toLocaleDateString()],
    ["Revision Date", info.updatedAt || new Date().toLocaleDateString()],
    ["Revised By", "ANC Studio"],
  ];

  let r = 4;
  for (const [label, value] of fields) {
    sheet.getCell(`A${r}`).value = label;
    sheet.getCell(`A${r}`).font = { bold: true, color: { argb: "FF374151" } };
    sheet.getCell(`B${r}`).value = value;
    r++;
  }

  // Document total (if available)
  if (documentTotal && Number.isFinite(documentTotal) && documentTotal > 0) {
    r++; // blank row
    sheet.getCell(`A${r}`).value = "Document Total";
    sheet.getCell(`A${r}`).font = { bold: true, size: 12 };
    sheet.getCell(`B${r}`).value = documentTotal;
    sheet.getCell(`B${r}`).numFmt = moneyFmt;
    sheet.getCell(`B${r}`).font = { bold: true, size: 12 };
  }

  // Column widths
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 45;
  sheet.getColumn(3).width = 20;
}

export async function generateMirrorUglySheetExcelBuffer(args: {
  clientName?: string | null;
  projectName?: string | null;
  screens: Array<{ name: string; pixelPitch: number; width: number; height: number }>;
  internalAudit: InternalAuditLike | null;
  currency?: string;
  pricingDocument?: any;
  summaryInfo?: ProjectSummaryInfo;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Studio";
  workbook.created = new Date();

  // Project Summary as first tab (total filled in after Margin Analysis calculates base-only sum)
  const summarySheet = workbook.addWorksheet("Project Summary");
  buildProjectSummary(summarySheet, args.summaryInfo || {
    projectName: args.projectName || undefined,
    clientName: args.clientName || undefined,
    displayCount: args.screens.length,
  }, args.currency);

  const ledSheet = workbook.addWorksheet("LED Cost Sheet");
  const marginSheet = workbook.addWorksheet("Margin Analysis");

  ledSheet.getCell("A1").value = `Project Name: ${args.projectName || args.clientName || ""}`.trim();
  ledSheet.getCell("A2").value = `Generated: ${new Date().toLocaleDateString()}`;

  setHeaderRow(ledSheet, 4, [
    "Display Name",
    "",
    "Quantity",
    "",
    "MM Pitch",
    "Active Height (ft.)",
    "Active Width (ft.)",
    "Pixel Resolution (H)",
    "",
    "Pixel Resolution (W)",
    "",
    "",
    "Brightness",
    "Weight (lbs)",
    "Total Power (W)",
    "BTU/hr",
  ]);

  ledSheet.getColumn(1).width = 45;
  ledSheet.getColumn(3).width = 10;
  ledSheet.getColumn(5).width = 10;
  ledSheet.getColumn(6).width = 16;
  ledSheet.getColumn(7).width = 16;
  ledSheet.getColumn(8).width = 18;
  ledSheet.getColumn(10).width = 18;
  ledSheet.getColumn(13).width = 12;
  ledSheet.getColumn(14).width = 14;
  ledSheet.getColumn(15).width = 16;
  ledSheet.getColumn(16).width = 12;

  const perScreen = Array.isArray(args.internalAudit?.perScreen) ? args.internalAudit?.perScreen : [];

  args.screens.forEach((screen, idx) => {
    const audit = perScreen?.[idx] || null;
    const qty = toNumber(audit?.quantity) || 1;
    const matrix = tryParseMatrix(audit?.pixelMatrix) || tryParseMatrix(audit?.pixelResolution) || null;
    const resH = matrix?.h ?? null;
    const resW = matrix?.w ?? null;

    const r = 5 + idx;
    ledSheet.getCell(`A${r}`).value = screen.name || "Unnamed Screen";
    ledSheet.getCell(`C${r}`).value = qty;
    ledSheet.getCell(`E${r}`).value = toNumber(screen.pixelPitch) || null;
    ledSheet.getCell(`F${r}`).value = toNumber(screen.height) || null;
    ledSheet.getCell(`G${r}`).value = toNumber(screen.width) || null;
    ledSheet.getCell(`H${r}`).value = resH;
    ledSheet.getCell(`J${r}`).value = resW;
    ledSheet.getCell(`M${r}`).value = audit?.brightnessNits ?? null;
    ledSheet.getCell(`N${r}`).value = audit?.estimatedWeightLbs ?? null;
    ledSheet.getCell(`O${r}`).value = audit?.totalMaxPowerW ?? null;
    const powerW = toNumber(audit?.totalMaxPowerW);
    if (powerW > 0) {
      ledSheet.getCell(`P${r}`).value = { formula: `O${r}*3.412`, result: Math.round(powerW * 3.412) };
    }
  });

  marginSheet.getCell("A1").value = `Project Name: ${args.projectName || args.clientName || ""}`.trim();
  marginSheet.getCell("A2").value = `Revision Date: ${new Date().toLocaleDateString()}`;
  marginSheet.getCell("A3").value = `Revised By: ANC Studio`;

  marginSheet.getCell("A4").value = `${args.projectName || args.clientName || "Project"} Margin Analysis`;

  marginSheet.getColumn(1).width = 55;
  marginSheet.getColumn(2).width = 16;
  marginSheet.getColumn(3).width = 16;
  marginSheet.getColumn(4).width = 16;
  marginSheet.getColumn(5).width = 12;
  marginSheet.getColumn(6).hidden = true; // Hidden col F: per-item cost data for SUM formulas

  const moneyFmt = excelCurrencyFmt(args.currency);
  const percentFmt = "0.00%";

  const totals = args.internalAudit?.totals || {};
  const pricingTables: any[] = args.pricingDocument?.tables || [];

  // Processor & Equipment grouping — only for system-generated exports (not Mirror Mode uploads)
  // NOTE: Spare parts is NOT in this list — it rolls into LED Hardware instead
  const EQUIPMENT_PATTERNS = [
    /\bsending\s+card\b/i,
    /\bsignal\s+cable\s+kit\b/i,
    /\bbackup\s+video\s+processor\b/i,
    /\bweatherproof\s+enclosure\b/i,
    /\bvideo\s+processor\b/i,
    /\bmedia\s+player\b/i,
    /\breceiver\b/i,
    /\bpower\s+supply\b/i,
    /\bmount\b/i,
    /\bcable\b/i,
  ];
  // Spare parts pattern — rolled into LED Hardware, NOT Processor & Equipment
  const SPARE_PARTS_PATTERN = /\bspare\s+parts\b/i;
  
  const isSystemGenerated = args.pricingDocument?.mode !== "MIRROR";
  function isEquipmentItem(desc: string): boolean {
    return EQUIPMENT_PATTERNS.some((re) => re.test(desc));
  }
  function isSpareParts(desc: string): boolean {
    return SPARE_PARTS_PATTERN.test(desc);
  }

  // Track base-only document total for Project Summary (set in both branches below)
  let finalDocSellSum = 0;
  let marginDocTotalRow = 0; // Row number of DOCUMENT TOTAL in Margin Analysis (for cross-sheet ref)

  // ─── Per-section layout (when pricingDocument with line items is available) ───
  if (pricingTables.length > 0 && pricingTables.some((t: any) => t.items?.length > 0)) {
    let r = 5; // current row cursor
    let docCostSum = 0;
    let docSellSum = 0;

    // Track row positions for DOCUMENT TOTAL formulas
    const subtotalCostRows: number[] = []; // Col B subtotal rows (base sections only)
    const grandTotalSellRows: number[] = []; // Col C grand total rows (base sections only)

    for (const table of pricingTables) {
      let items: any[] = table.items || [];
      if (items.length === 0) continue;

      // === SPARE PARTS ROLL-IN: Add to LED Hardware, remove from list ===
      let sparePartsCost = 0;
      let sparePartsSell = 0;
      const nonSpareItems: any[] = [];
      for (const item of items) {
        if (!item.isHidden && isSpareParts(item.description || "")) {
          sparePartsCost += toNumber(item.cost) || 0;
          sparePartsSell += toNumber(item.sellingPrice) || 0;
        } else {
          nonSpareItems.push(item);
        }
      }
      items = nonSpareItems;
      
      // Find LED Hardware line and add spare parts cost/sell to it
      if (sparePartsCost > 0 || sparePartsSell > 0) {
        const ledItem = items.find((it: any) => 
          !it.isHidden && /LED|Display|Hardware/i.test(it.description || "")
        );
        if (ledItem) {
          ledItem.cost = (toNumber(ledItem.cost) || 0) + sparePartsCost;
          ledItem.sellingPrice = (toNumber(ledItem.sellingPrice) || 0) + sparePartsSell;
        }
      }

      // Group Processor & Equipment items (system-generated only)
      let equipmentGroupItem: { description: string; sellingPrice: number; cost: number | null } | null = null;
      if (isSystemGenerated) {
        const equipItems: any[] = [];
        const regularItems: any[] = [];
        for (const item of items) {
          if (!item.isHidden && isEquipmentItem(item.description || "")) {
            equipItems.push(item);
          } else {
            regularItems.push(item);
          }
        }
        if (equipItems.length > 0) {
          let groupSell = 0;
          let groupCost: number | null = null;
          for (const eq of equipItems) {
            groupSell += toNumber(eq.sellingPrice);
            if (eq.cost != null) {
              groupCost = (groupCost ?? 0) + toNumber(eq.cost);
            }
          }
          equipmentGroupItem = { description: "Processor and Equipment", sellingPrice: groupSell, cost: groupCost };
          items = regularItems;
        }
      }

      // Section header row — only section name + "Selling Price" (clean, client-facing)
      const headerRow = marginSheet.getRow(r);
      marginSheet.getCell(`A${r}`).value = table.name || "Section";
      marginSheet.getCell(`B${r}`).value = "Selling Price";
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      marginSheet.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left" };
      r++;

      // Build combined line items list (regular + grouped equipment if applicable)
      const exportItems = equipmentGroupItem ? [...items, equipmentGroupItem] : items;

      // Line items — A=description, B=selling price, F=cost (hidden column for SUM formulas)
      const firstItemRow = r;
      let sectionCostSum = 0;
      let sectionSellSum = 0;
      let hasCostData = false;
      for (const item of exportItems) {
        if (item.isHidden) continue;
        const sell = toNumber(item.sellingPrice);
        const cost = item.cost != null ? toNumber(item.cost) : null;
        if (cost != null) { sectionCostSum += cost; hasCostData = true; }

        marginSheet.getCell(`A${r}`).value = item.description || "";
        marginSheet.getCell(`B${r}`).value = sell;
        marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
        // Write cost to hidden column F for SUM formulas
        if (cost != null) {
          marginSheet.getCell(`F${r}`).value = cost;
          marginSheet.getCell(`F${r}`).numFmt = moneyFmt;
        }
        sectionSellSum += sell;
        r++;
      }
      const lastItemRow = r - 1;

      // Subtotal row — expand to show Cost | Selling | Margin $ | Margin %
      const sectionSubtotal = toNumber(table.subtotal) || sectionSellSum;
      const sectionMargin = sectionCostSum > 0 ? sectionSubtotal - sectionCostSum : null;
      // Alternates are optional add-ons — exclude from document total
      const isAlternateSection = table.isAlternateSection === true
        || /\balternate/i.test(table.name || "");
      if (!isAlternateSection) {
        docCostSum += sectionCostSum;
        docSellSum += sectionSubtotal;
      }
      const subtotalRow = r;
      marginSheet.getCell(`A${r}`).value = "SUBTOTAL";
      if (hasCostData) {
        // SUBTOTAL Col B (Cost): =SUM(F{first}:F{last}) — sums hidden cost column
        marginSheet.getCell(`B${r}`).value = { formula: `SUM(F${firstItemRow}:F${lastItemRow})`, result: sectionCostSum };
        marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
      }
      // SUBTOTAL Col C (Selling): =SUM(B{first}:B{last}) — sums selling price column
      marginSheet.getCell(`C${r}`).value = { formula: `SUM(B${firstItemRow}:B${lastItemRow})`, result: sectionSubtotal };
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      if (sectionMargin != null) {
        // Margin $: =C{row}-B{row}
        marginSheet.getCell(`D${r}`).value = { formula: `C${r}-B${r}`, result: sectionMargin };
        marginSheet.getCell(`D${r}`).numFmt = moneyFmt;
        // Margin %: =IF(C{row}=0,0,D{row}/C{row})
        marginSheet.getCell(`E${r}`).value = { formula: `IF(C${r}=0,0,D${r}/C${r})`, result: sectionSubtotal > 0 ? sectionMargin / sectionSubtotal : 0 };
        marginSheet.getCell(`E${r}`).numFmt = percentFmt;
      }
      marginSheet.getRow(r).font = { bold: true };
      r++;

      // Tax row
      const taxAmount = toNumber(table.tax?.amount);
      const taxRow = r;
      marginSheet.getCell(`A${r}`).value = table.tax?.label || "TAX";
      marginSheet.getCell(`C${r}`).value = taxAmount;
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      r++;

      // Bond row
      const bondAmount = toNumber(table.bond);
      const bondRow = r;
      marginSheet.getCell(`A${r}`).value = "BOND";
      marginSheet.getCell(`C${r}`).value = bondAmount;
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      r++;

      // Tariff row
      const tariffAmount = toNumber((table as any).tariff);
      const tariffRow = r;
      if (tariffAmount > 0) {
        marginSheet.getCell(`A${r}`).value = "TARIFF";
        marginSheet.getCell(`C${r}`).value = tariffAmount;
        marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
        r++;
      }

      // Grand Total row — full cost/margin summary
      const sectionGrandTotal = toNumber(table.grandTotal) || (sectionSubtotal + taxAmount + bondAmount + tariffAmount);
      const grandTotalRow = r;
      marginSheet.getCell(`A${r}`).value = "SUB TOTAL (BID FORM)";
      if (hasCostData) {
        // GRAND TOTAL Col B (Cost): =B{subtotal} (cost doesn't include tax/bond)
        marginSheet.getCell(`B${r}`).value = { formula: `B${subtotalRow}`, result: sectionCostSum };
        marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
      }
      // GRAND TOTAL Col C: =C{subtotal}+C{tax}+C{bond}+C{tariff}
      const gtFormula = tariffAmount > 0
        ? `C${subtotalRow}+C${taxRow}+C${bondRow}+C${tariffRow}`
        : `C${subtotalRow}+C${taxRow}+C${bondRow}`;
      marginSheet.getCell(`C${r}`).value = { formula: gtFormula, result: sectionGrandTotal };
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      if (sectionMargin != null) {
        // Margin $: =C{row}-B{row}
        marginSheet.getCell(`D${r}`).value = { formula: `C${r}-B${r}`, result: sectionMargin };
        marginSheet.getCell(`D${r}`).numFmt = moneyFmt;
        // Margin %: =IF(C{row}=0,0,D{row}/C{row})
        marginSheet.getCell(`E${r}`).value = { formula: `IF(C${r}=0,0,D${r}/C${r})`, result: sectionGrandTotal > 0 ? sectionMargin / sectionGrandTotal : 0 };
        marginSheet.getCell(`E${r}`).numFmt = percentFmt;
      }
      marginSheet.getRow(r).font = { bold: true };

      // Track rows for DOCUMENT TOTAL formulas (base sections only)
      if (!isAlternateSection) {
        if (hasCostData) subtotalCostRows.push(subtotalRow);
        grandTotalSellRows.push(grandTotalRow);
      }
      r++;

      // Alternates (if any)
      const alternates: any[] = table.alternates || [];
      if (alternates.length > 0) {
        marginSheet.getCell(`A${r}`).value = "Alternates - Add to Cost Above";
        marginSheet.getCell(`B${r}`).value = "Selling Price";
        const altHeaderRow = marginSheet.getRow(r);
        altHeaderRow.font = { bold: true, italic: true };
        altHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDEE2E6" } };
        r++;

        for (const alt of alternates) {
          marginSheet.getCell(`A${r}`).value = alt.description || "";
          marginSheet.getCell(`B${r}`).value = toNumber(alt.priceDifference);
          marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
          r++;
        }
      }

      // Blank separator row between sections
      r++;
    }

    // Document total at the end — formulas reference individual section rows
    if (docSellSum > 0) {
      marginDocTotalRow = r;
      marginSheet.getCell(`A${r}`).value = "DOCUMENT TOTAL";
      // DOCUMENT TOTAL Col C: =SUM of all grand total C cells (base sections only)
      const sellFormula = grandTotalSellRows.map(row => `C${row}`).join("+");
      marginSheet.getCell(`C${r}`).value = { formula: sellFormula, result: docSellSum };
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      if (docCostSum > 0 && subtotalCostRows.length > 0) {
        // DOCUMENT TOTAL Col B: =SUM of all subtotal B cells (cost)
        const costFormula = subtotalCostRows.map(row => `B${row}`).join("+");
        marginSheet.getCell(`B${r}`).value = { formula: costFormula, result: docCostSum };
        marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
        const totalMargin = docSellSum - docCostSum;
        // Margin $: =C{row}-B{row}
        marginSheet.getCell(`D${r}`).value = { formula: `C${r}-B${r}`, result: totalMargin };
        marginSheet.getCell(`D${r}`).numFmt = moneyFmt;
        // Margin %: =IF(C{row}=0,0,D{row}/C{row})
        marginSheet.getCell(`E${r}`).value = { formula: `IF(C${r}=0,0,D${r}/C${r})`, result: docSellSum > 0 ? totalMargin / docSellSum : 0 };
        marginSheet.getCell(`E${r}`).numFmt = percentFmt;
      }
      marginSheet.getRow(r).font = { bold: true, size: 12 };
    }
    finalDocSellSum = docSellSum;
  } else {
    // ─── Fallback: flat layout (no pricingDocument) ───
    // NOTE: This fallback only shows LED display screens (from estimator).
    // Non-LED items (structural, electrical, labor, PM, etc.) are NOT included.
    // To get full per-section Margin Analysis, re-upload the source Excel.
    console.warn("[MIRROR EXPORT] pricingDocument missing — using flat fallback (screens only, no per-section breakdown)");
    setHeaderRow(marginSheet, 5, ["Item Name / Category", "Cost", "Selling Price", "Margin $", "Margin %"]);

    let sumCost = 0;
    let sumSell = 0;
    let sumMargin = 0;

    args.screens.forEach((screen, idx) => {
      const audit = perScreen?.[idx] || null;
      const b = audit?.breakdown || {};

      const cost = toNumber(b.totalCost);
      const sell = toNumber(b.sellPrice || b.finalClientTotal);
      const margin = toNumber(b.ancMargin || b.marginAmount);
      const marginPct = sell > 0 ? margin / sell : 0;

      sumCost += cost;
      sumSell += sell;
      sumMargin += margin;

      const row = 6 + idx;
      marginSheet.getCell(`A${row}`).value = screen.name || "Unnamed Screen";
      marginSheet.getCell(`B${row}`).value = cost || 0;
      marginSheet.getCell(`C${row}`).value = sell || 0;
      marginSheet.getCell(`D${row}`).value = margin || 0;
      // Margin %: =IF(C{row}=0,0,D{row}/C{row})
      marginSheet.getCell(`E${row}`).value = { formula: `IF(C${row}=0,0,D${row}/C${row})`, result: marginPct || 0 };

      marginSheet.getCell(`B${row}`).numFmt = moneyFmt;
      marginSheet.getCell(`C${row}`).numFmt = moneyFmt;
      marginSheet.getCell(`D${row}`).numFmt = moneyFmt;
      marginSheet.getCell(`E${row}`).numFmt = percentFmt;
    });

    const lastDataRow = 5 + args.screens.length; // last screen data row (row 6 = first screen when 0-indexed from row 5+1)
    const endRow = lastDataRow + 1; // totals row
    marginSheet.getCell(`A${endRow}`).value = "";
    // Totals: =SUM(B6:B{last}), =SUM(C6:C{last}), =SUM(D6:D{last})
    marginSheet.getCell(`B${endRow}`).value = { formula: `SUM(B6:B${lastDataRow})`, result: sumCost };
    marginSheet.getCell(`C${endRow}`).value = { formula: `SUM(C6:C${lastDataRow})`, result: sumSell };
    marginSheet.getCell(`D${endRow}`).value = { formula: `SUM(D6:D${lastDataRow})`, result: sumMargin };
    // Margin %: =IF(C{row}=0,0,D{row}/C{row})
    marginSheet.getCell(`E${endRow}`).value = { formula: `IF(C${endRow}=0,0,D${endRow}/C${endRow})`, result: sumSell > 0 ? sumMargin / sumSell : 0 };
    marginSheet.getRow(endRow).font = { bold: true };
    ["B", "C", "D"].forEach((col) => {
      marginSheet.getCell(`${col}${endRow}`).numFmt = moneyFmt;
    });
    marginSheet.getCell(`E${endRow}`).numFmt = percentFmt;

    const taxRow = endRow + 1;
    marginSheet.getCell(`A${taxRow}`).value = "TAX";
    marginSheet.getCell(`B${taxRow}`).value = 0;
    marginSheet.getCell(`C${taxRow}`).value = 0;

    const bondRow = endRow + 2;
    marginSheet.getCell(`A${bondRow}`).value = "BOND";
    marginSheet.getCell(`B${bondRow}`).value = 0;
    marginSheet.getCell(`C${bondRow}`).value = 0;

    const subtotalRow = endRow + 3;
    marginDocTotalRow = subtotalRow;
    marginSheet.getCell(`A${subtotalRow}`).value = "SUB TOTAL (BID FORM)";
    // SUB TOTAL Col C: =C{totals}+C{tax}+C{bond}
    marginSheet.getCell(`C${subtotalRow}`).value = { formula: `C${endRow}+C${taxRow}+C${bondRow}`, result: sumSell };
    // Margin $: =D{totals} (margin doesn't include tax/bond)
    marginSheet.getCell(`D${subtotalRow}`).value = { formula: `D${endRow}`, result: sumMargin };
    // Margin %: =IF(C{row}=0,0,D{row}/C{row})
    marginSheet.getCell(`E${subtotalRow}`).value = { formula: `IF(C${subtotalRow}=0,0,D${subtotalRow}/C${subtotalRow})`, result: sumSell > 0 ? sumMargin / sumSell : 0 };
    marginSheet.getCell(`C${subtotalRow}`).numFmt = moneyFmt;
    marginSheet.getCell(`D${subtotalRow}`).numFmt = moneyFmt;
    marginSheet.getCell(`E${subtotalRow}`).numFmt = percentFmt;
    marginSheet.getRow(subtotalRow).font = { bold: true };
    finalDocSellSum = sumSell;
  }

  // Backfill document total on Project Summary — cross-sheet ref to Margin Analysis
  if (finalDocSellSum > 0) {
    summarySheet.getCell("A12").value = "Document Total";
    summarySheet.getCell("A12").font = { bold: true, size: 12 };
    if (marginDocTotalRow > 0) {
      // Cross-sheet formula: ='Margin Analysis'!C{docTotalRow}
      summarySheet.getCell("B12").value = { formula: `'Margin Analysis'!C${marginDocTotalRow}`, result: finalDocSellSum };
    } else {
      summarySheet.getCell("B12").value = finalDocSellSum;
    }
    summarySheet.getCell("B12").numFmt = moneyFmt;
    summarySheet.getCell("B12").font = { bold: true, size: 12 };
  }

  // Tech Specs Only — no pricing, for installers/subs
  const techSheet = workbook.addWorksheet("Tech Specs (Installers)");
  techSheet.getCell("A1").value = `Project Name: ${args.projectName || args.clientName || ""}`.trim();
  techSheet.getCell("A2").value = `Generated: ${new Date().toLocaleDateString()}`;
  techSheet.getCell("A3").value = "Technical specifications only — no pricing data.";
  techSheet.getCell("A3").font = { italic: true, color: { argb: "FF6C757D" } };

  setHeaderRow(techSheet, 4, [
    "Display Name", "Qty", "Pixel Pitch (mm)", "Height (ft)", "Width (ft)",
    "Pixels H", "Pixels W", "Sq Ft", "Brightness (nits)", "Service", "Environment",
    "Weight (lbs)", "Total Power (W)", "BTU/hr",
  ]);

  args.screens.forEach((screen, idx) => {
    const audit = perScreen?.[idx] || null;
    const qty = toNumber(audit?.quantity) || 1;
    const heightFt = toNumber(screen.height);
    const widthFt = toNumber(screen.width);
    const pitch = toNumber(screen.pixelPitch);
    const sqFt = heightFt * widthFt;
    const matrix = tryParseMatrix(audit?.pixelMatrix) || tryParseMatrix(audit?.pixelResolution) || null;
    const pixelsH = matrix?.h ?? (pitch > 0 ? Math.round((heightFt * 304.8) / pitch) : null);
    const pixelsW = matrix?.w ?? (pitch > 0 ? Math.round((widthFt * 304.8) / pitch) : null);

    const r = 5 + idx;
    techSheet.getCell(`A${r}`).value = screen.name || "Unnamed Display";
    techSheet.getCell(`B${r}`).value = qty;
    // Cross-sheet refs: Pitch, Height, Width from LED Sheet
    techSheet.getCell(`C${r}`).value = pitch ? { formula: `'LED Cost Sheet'!E${r}`, result: pitch } : null;
    techSheet.getCell(`D${r}`).value = heightFt ? { formula: `'LED Cost Sheet'!F${r}`, result: heightFt } : null;
    techSheet.getCell(`E${r}`).value = widthFt ? { formula: `'LED Cost Sheet'!G${r}`, result: widthFt } : null;
    // Pixels H: =ROUND(D{r}*304.8/C{r},0) — only if pitch > 0, else use parsed matrix
    if (matrix?.h != null) {
      techSheet.getCell(`F${r}`).value = pixelsH;
    } else if (pitch > 0) {
      techSheet.getCell(`F${r}`).value = { formula: `ROUND(D${r}*304.8/C${r},0)`, result: pixelsH ?? 0 };
    }
    // Pixels W: =ROUND(E{r}*304.8/C{r},0)
    if (matrix?.w != null) {
      techSheet.getCell(`G${r}`).value = pixelsW;
    } else if (pitch > 0) {
      techSheet.getCell(`G${r}`).value = { formula: `ROUND(E${r}*304.8/C${r},0)`, result: pixelsW ?? 0 };
    }
    // Sq Ft: =D{r}*E{r}
    if (heightFt > 0 && widthFt > 0) {
      techSheet.getCell(`H${r}`).value = { formula: `D${r}*E${r}`, result: Math.round(sqFt * 100) / 100 };
    }
    techSheet.getCell(`I${r}`).value = audit?.brightnessNits ?? null;
    techSheet.getCell(`J${r}`).value = null;
    techSheet.getCell(`K${r}`).value = null;
    // Cross-sheet refs: Weight and Power always reference LED Sheet (formula resolves even if source is empty)
    techSheet.getCell(`L${r}`).value = { formula: `'LED Cost Sheet'!N${r}`, result: toNumber(audit?.estimatedWeightLbs) || 0 };
    techSheet.getCell(`M${r}`).value = { formula: `'LED Cost Sheet'!O${r}`, result: toNumber(audit?.totalMaxPowerW) || 0 };
    // BTU/hr: =M{r}*3.412
    const techPowerW = toNumber(audit?.totalMaxPowerW);
    if (techPowerW > 0) {
      techSheet.getCell(`N${r}`).value = { formula: `M${r}*3.412`, result: Math.round(techPowerW * 3.412) };
    }
  });

  techSheet.getColumn(1).width = 45;
  techSheet.getColumn(2).width = 8;
  techSheet.getColumn(3).width = 16;
  techSheet.getColumn(4).width = 12;
  techSheet.getColumn(5).width = 12;
  techSheet.getColumn(6).width = 12;
  techSheet.getColumn(7).width = 12;
  techSheet.getColumn(8).width = 10;
  techSheet.getColumn(9).width = 16;
  techSheet.getColumn(10).width = 14;
  techSheet.getColumn(11).width = 12;
  techSheet.getColumn(12).width = 14;
  techSheet.getColumn(13).width = 16;
  techSheet.getColumn(14).width = 12;

  // Bundle Equipment sheet — Processor & Equipment component breakdown
  const bundleSheet = workbook.addWorksheet("Bundle Equipment", {
    properties: { tabColor: { argb: "FF17A2B8" } },
  });
  bundleSheet.mergeCells("A1:D1");
  bundleSheet.getCell("A1").value = `${args.projectName || "Project"} — Processor & Equipment Bundle`;
  bundleSheet.getCell("A1").font = { size: 14, bold: true, color: { argb: "FF0A52EF" } };
  bundleSheet.getCell("A2").value = "Individual components for Processor & Equipment line on Margin Analysis. Edit costs below.";
  bundleSheet.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF6C757D" } };

  setHeaderRow(bundleSheet, 4, ["Component", "Qty", "Unit Cost", "Total Cost"]);

  const defaultBundleItems = [
    { name: "Video Processor", qty: 1, cost: 2500 },
    { name: "Sending Card", qty: 1, cost: 800 },
    { name: "Media Player", qty: 1, cost: 1500 },
    { name: "Signal Cable Kit", qty: 1, cost: 350 },
    { name: "Power Supply Unit", qty: 1, cost: 600 },
  ];

  let beRow = 5;
  for (const item of defaultBundleItems) {
    bundleSheet.getCell(`A${beRow}`).value = item.name;
    bundleSheet.getCell(`B${beRow}`).value = item.qty;
    bundleSheet.getCell(`B${beRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    bundleSheet.getCell(`C${beRow}`).value = item.cost;
    bundleSheet.getCell(`C${beRow}`).numFmt = moneyFmt;
    bundleSheet.getCell(`C${beRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    bundleSheet.getCell(`D${beRow}`).value = { formula: `B${beRow}*C${beRow}` };
    bundleSheet.getCell(`D${beRow}`).numFmt = moneyFmt;
    beRow++;
  }

  const beTotalRow = beRow;
  bundleSheet.getCell(`A${beTotalRow}`).value = "TOTAL";
  bundleSheet.getCell(`A${beTotalRow}`).font = { bold: true };
  bundleSheet.getCell(`D${beTotalRow}`).value = { formula: `SUM(D5:D${beTotalRow - 1})` };
  bundleSheet.getCell(`D${beTotalRow}`).numFmt = moneyFmt;
  bundleSheet.getCell(`D${beTotalRow}`).font = { bold: true };
  bundleSheet.getCell(`D${beTotalRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4EDDA" } };

  bundleSheet.getColumn(1).width = 35;
  bundleSheet.getColumn(2).width = 8;
  bundleSheet.getColumn(3).width = 14;
  bundleSheet.getColumn(4).width = 14;

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

