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
  ]);

  ledSheet.getColumn(1).width = 45;
  ledSheet.getColumn(3).width = 10;
  ledSheet.getColumn(5).width = 10;
  ledSheet.getColumn(6).width = 16;
  ledSheet.getColumn(7).width = 16;
  ledSheet.getColumn(8).width = 18;
  ledSheet.getColumn(10).width = 18;
  ledSheet.getColumn(13).width = 12;

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
    ledSheet.getCell(`M${r}`).value = null;
  });

  marginSheet.getCell("A1").value = `Project Name: ${args.projectName || args.clientName || ""}`.trim();
  marginSheet.getCell("A2").value = `Revision Date: ${new Date().toLocaleDateString()}`;
  marginSheet.getCell("A3").value = `Revised By: ANC Studio`;

  marginSheet.getCell("A4").value = `${args.projectName || args.clientName || "Project"} Margin Analysis`;

  setHeaderRow(marginSheet, 5, ["Item Name / Category", "Cost", "Selling Price", "Margin $", "Margin %"]);
  marginSheet.getColumn(1).width = 55;
  marginSheet.getColumn(2).width = 16;
  marginSheet.getColumn(3).width = 16;
  marginSheet.getColumn(4).width = 16;
  marginSheet.getColumn(5).width = 12;

  const moneyFmt = excelCurrencyFmt(args.currency);
  const percentFmt = "0.00%";

  const totals = args.internalAudit?.totals || {};

  args.screens.forEach((screen, idx) => {
    const audit = perScreen?.[idx] || null;
    const b = audit?.breakdown || {};

    const cost = toNumber(b.totalCost);
    const sell = toNumber(b.sellPrice || b.finalClientTotal);
    const margin = toNumber(b.ancMargin || b.marginAmount);
    const marginPct = sell > 0 ? margin / sell : 0;

    const r = 6 + idx;
    marginSheet.getCell(`A${r}`).value = screen.name || "Unnamed Screen";
    marginSheet.getCell(`B${r}`).value = cost || 0;
    marginSheet.getCell(`C${r}`).value = sell || 0;
    marginSheet.getCell(`D${r}`).value = margin || 0;
    marginSheet.getCell(`E${r}`).value = marginPct || 0;

    marginSheet.getCell(`B${r}`).numFmt = moneyFmt;
    marginSheet.getCell(`C${r}`).numFmt = moneyFmt;
    marginSheet.getCell(`D${r}`).numFmt = moneyFmt;
    marginSheet.getCell(`E${r}`).numFmt = percentFmt;
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

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

