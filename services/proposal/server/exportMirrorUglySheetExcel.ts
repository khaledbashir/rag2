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
  row.values = [null, ...labels];
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

export async function generateMirrorUglySheetExcelBuffer(args: {
  clientName?: string | null;
  projectName?: string | null;
  screens: Array<{ name: string; pixelPitch: number; width: number; height: number }>;
  internalAudit: InternalAuditLike | null;
  currency?: string;
  pricingDocument?: any;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Studio";
  workbook.created = new Date();

  const ledSheet = workbook.addWorksheet("LED Sheet");
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
    ledSheet.getCell(`P${r}`).value = powerW > 0 ? Math.round(powerW * 3.412) : null;
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

  const moneyFmt = excelCurrencyFmt(args.currency);
  const percentFmt = "0.00%";

  const totals = args.internalAudit?.totals || {};
  const pricingTables: any[] = args.pricingDocument?.tables || [];

  // ─── Per-section layout (when pricingDocument with line items is available) ───
  if (pricingTables.length > 0 && pricingTables.some((t: any) => t.items?.length > 0)) {
    let r = 5; // current row cursor

    for (const table of pricingTables) {
      const items: any[] = table.items || [];
      if (items.length === 0) continue;

      // Section header row — only section name + "Selling Price" (clean, client-facing)
      const headerRow = marginSheet.getRow(r);
      marginSheet.getCell(`A${r}`).value = table.name || "Section";
      marginSheet.getCell(`B${r}`).value = "Selling Price";
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      marginSheet.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "left" };
      r++;

      // Line items — description + selling price only (no cost/margin per item)
      let sectionCostSum = 0;
      let sectionSellSum = 0;
      for (const item of items) {
        if (item.isHidden) continue;
        const sell = toNumber(item.sellingPrice);
        const cost = item.cost != null ? toNumber(item.cost) : null;
        if (cost != null) sectionCostSum += cost;

        marginSheet.getCell(`A${r}`).value = item.description || "";
        marginSheet.getCell(`B${r}`).value = sell;
        marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
        sectionSellSum += sell;
        r++;
      }

      // Subtotal row — expand to show Cost | Selling | Margin $ | Margin %
      const sectionSubtotal = toNumber(table.subtotal) || sectionSellSum;
      const sectionMargin = sectionCostSum > 0 ? sectionSubtotal - sectionCostSum : null;
      marginSheet.getCell(`A${r}`).value = "SUBTOTAL";
      if (sectionCostSum > 0) {
        marginSheet.getCell(`B${r}`).value = sectionCostSum;
        marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
      }
      marginSheet.getCell(`C${r}`).value = sectionSubtotal;
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      if (sectionMargin != null) {
        marginSheet.getCell(`D${r}`).value = sectionMargin;
        marginSheet.getCell(`D${r}`).numFmt = moneyFmt;
        marginSheet.getCell(`E${r}`).value = sectionSubtotal > 0 ? sectionMargin / sectionSubtotal : 0;
        marginSheet.getCell(`E${r}`).numFmt = percentFmt;
      }
      marginSheet.getRow(r).font = { bold: true };
      r++;

      // Tax row
      const taxAmount = toNumber(table.tax?.amount);
      marginSheet.getCell(`A${r}`).value = table.tax?.label || "TAX";
      marginSheet.getCell(`C${r}`).value = taxAmount;
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      r++;

      // Bond row
      const bondAmount = toNumber(table.bond);
      marginSheet.getCell(`A${r}`).value = "BOND";
      marginSheet.getCell(`C${r}`).value = bondAmount;
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      r++;

      // Grand Total row — full cost/margin summary
      const sectionGrandTotal = toNumber(table.grandTotal) || (sectionSubtotal + taxAmount + bondAmount);
      marginSheet.getCell(`A${r}`).value = "SUB TOTAL (BID FORM)";
      if (sectionCostSum > 0) {
        marginSheet.getCell(`B${r}`).value = sectionCostSum;
        marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
      }
      marginSheet.getCell(`C${r}`).value = sectionGrandTotal;
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      if (sectionMargin != null) {
        marginSheet.getCell(`D${r}`).value = sectionMargin;
        marginSheet.getCell(`D${r}`).numFmt = moneyFmt;
        marginSheet.getCell(`E${r}`).value = sectionGrandTotal > 0 ? sectionMargin / sectionGrandTotal : 0;
        marginSheet.getCell(`E${r}`).numFmt = percentFmt;
      }
      marginSheet.getRow(r).font = { bold: true };
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

    // Document total at the end
    const docTotal = toNumber(args.pricingDocument?.documentTotal) || toNumber(totals.finalClientTotal || totals.sellPrice);
    if (docTotal > 0) {
      marginSheet.getCell(`A${r}`).value = "DOCUMENT TOTAL";
      marginSheet.getCell(`C${r}`).value = docTotal;
      marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
      const totalCostAll = toNumber(totals.totalCost);
      if (totalCostAll > 0) {
        marginSheet.getCell(`B${r}`).value = totalCostAll;
        marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
        const totalMargin = docTotal - totalCostAll;
        marginSheet.getCell(`D${r}`).value = totalMargin;
        marginSheet.getCell(`D${r}`).numFmt = moneyFmt;
        marginSheet.getCell(`E${r}`).value = docTotal > 0 ? totalMargin / docTotal : 0;
        marginSheet.getCell(`E${r}`).numFmt = percentFmt;
      }
      marginSheet.getRow(r).font = { bold: true, size: 12 };
    }
  } else {
    // ─── Fallback: flat layout (no pricingDocument) ───
    setHeaderRow(marginSheet, 5, ["Item Name / Category", "Cost", "Selling Price", "Margin $", "Margin %"]);

    args.screens.forEach((screen, idx) => {
      const audit = perScreen?.[idx] || null;
      const b = audit?.breakdown || {};

      const cost = toNumber(b.totalCost);
      const sell = toNumber(b.sellPrice || b.finalClientTotal);
      const margin = toNumber(b.ancMargin || b.marginAmount);
      const marginPct = sell > 0 ? margin / sell : 0;

      const row = 6 + idx;
      marginSheet.getCell(`A${row}`).value = screen.name || "Unnamed Screen";
      marginSheet.getCell(`B${row}`).value = cost || 0;
      marginSheet.getCell(`C${row}`).value = sell || 0;
      marginSheet.getCell(`D${row}`).value = margin || 0;
      marginSheet.getCell(`E${row}`).value = marginPct || 0;

      marginSheet.getCell(`B${row}`).numFmt = moneyFmt;
      marginSheet.getCell(`C${row}`).numFmt = moneyFmt;
      marginSheet.getCell(`D${row}`).numFmt = moneyFmt;
      marginSheet.getCell(`E${row}`).numFmt = percentFmt;
    });

    const endRow = 6 + args.screens.length;
    marginSheet.getCell(`A${endRow}`).value = "";
    marginSheet.getCell(`B${endRow}`).value = toNumber(totals.totalCost);
    marginSheet.getCell(`C${endRow}`).value = toNumber(totals.sellPrice || totals.finalClientTotal);
    marginSheet.getCell(`D${endRow}`).value = toNumber(totals.ancMargin || totals.margin);
    marginSheet.getCell(`E${endRow}`).value = toNumber(totals.sellPrice || totals.finalClientTotal) > 0
      ? toNumber(totals.ancMargin || totals.margin) / toNumber(totals.sellPrice || totals.finalClientTotal)
      : 0;
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
    marginSheet.getCell(`A${subtotalRow}`).value = "SUB TOTAL (BID FORM)";
    marginSheet.getCell(`C${subtotalRow}`).value = toNumber(totals.finalClientTotal || totals.sellPrice);
    marginSheet.getCell(`D${subtotalRow}`).value = toNumber(totals.ancMargin || totals.margin);
    marginSheet.getCell(`E${subtotalRow}`).value = toNumber(totals.sellPrice || totals.finalClientTotal) > 0
      ? toNumber(totals.ancMargin || totals.margin) / toNumber(totals.sellPrice || totals.finalClientTotal)
      : 0;
    marginSheet.getCell(`C${subtotalRow}`).numFmt = moneyFmt;
    marginSheet.getCell(`D${subtotalRow}`).numFmt = moneyFmt;
    marginSheet.getCell(`E${subtotalRow}`).numFmt = percentFmt;
    marginSheet.getRow(subtotalRow).font = { bold: true };
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
    techSheet.getCell(`C${r}`).value = pitch || null;
    techSheet.getCell(`D${r}`).value = heightFt || null;
    techSheet.getCell(`E${r}`).value = widthFt || null;
    techSheet.getCell(`F${r}`).value = pixelsH;
    techSheet.getCell(`G${r}`).value = pixelsW;
    techSheet.getCell(`H${r}`).value = sqFt > 0 ? Math.round(sqFt * 100) / 100 : null;
    techSheet.getCell(`I${r}`).value = audit?.brightnessNits ?? null;
    techSheet.getCell(`J${r}`).value = null;
    techSheet.getCell(`K${r}`).value = null;
    techSheet.getCell(`L${r}`).value = audit?.estimatedWeightLbs ?? null;
    techSheet.getCell(`M${r}`).value = audit?.totalMaxPowerW ?? null;
    const techPowerW = toNumber(audit?.totalMaxPowerW);
    techSheet.getCell(`N${r}`).value = techPowerW > 0 ? Math.round(techPowerW * 3.412) : null;
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

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

