/**
 * Vendor-Specific Quote Request Sheets
 *
 * Generates targeted Excel sheets for specific subcontractor types:
 * - Electrician: circuit counts, power, voltage, display locations
 * - Installer: structural specs, rigging, weights, mounting, crew needs
 * - LED Supplier: panel counts, pixel pitch, cabinet specs, quantities
 *
 * Each sheet includes project context + a clear "fill in" section.
 */

import ExcelJS from "exceljs";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";

export type VendorType = "electrician" | "installer" | "led_supplier";

export interface VendorQuoteOptions {
  project: ExtractedProjectInfo;
  specs: ExtractedLEDSpec[];
  vendorType: VendorType;
  requestedBy?: string;
  dueDate?: string;
  notes?: string;
  /** Optional pricing data for enriched sheets */
  pricingDisplays?: Array<{
    name: string;
    areaSqFt: number;
    matchedProduct?: {
      manufacturer: string;
      model: string;
      pitch: number;
      totalModules?: number;
      totalWeightLbs?: number;
      totalMaxPowerW?: number;
      maxPowerWPerCab?: number;
      nits?: number;
    } | null;
  }>;
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  ANC_BLUE: "FF0A52EF",
  DARK_HEADER: "FF1F2937",
  WHITE: "FFFFFFFF",
  LIGHT_GRAY: "FFF8F9FA",
  AMBER_BG: "FFFFF8E1",
  AMBER_HEADER: "FFCC8800",
  ELECTRIC_YELLOW: "FFFFD600",
  INSTALL_GREEN: "FF28A745",
  LED_BLUE: "FF1976D2",
};

const VENDOR_COLORS: Record<VendorType, { accent: string; label: string }> = {
  electrician: { accent: COLORS.ELECTRIC_YELLOW, label: "ELECTRICAL" },
  installer: { accent: COLORS.INSTALL_GREEN, label: "INSTALLATION / STRUCTURAL" },
  led_supplier: { accent: COLORS.LED_BLUE, label: "LED SUPPLY" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function styleHeader(cell: ExcelJS.Cell, bg: string = COLORS.DARK_HEADER) {
  cell.font = { bold: true, color: { argb: COLORS.WHITE }, size: 11, name: "Calibri" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
}

function styleInput(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.AMBER_BG } };
  cell.border = {
    top: { style: "thin", color: { argb: "FFCCCCCC" } },
    bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    left: { style: "thin", color: { argb: "FFCCCCCC" } },
    right: { style: "thin", color: { argb: "FFCCCCCC" } },
  };
}

function stripe(row: ExcelJS.Row, colCount: number, isEven: boolean) {
  if (isEven) {
    for (let i = 1; i <= colCount; i++) {
      row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.LIGHT_GRAY } };
    }
  }
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export async function generateVendorQuoteSheet(opts: VendorQuoteOptions): Promise<Buffer> {
  const { vendorType } = opts;

  switch (vendorType) {
    case "electrician":
      return generateElectricianSheet(opts);
    case "installer":
      return generateInstallerSheet(opts);
    case "led_supplier":
      return generateLedSupplierSheet(opts);
  }
}

// ─── Title Block (shared) ───────────────────────────────────────────────────

function addTitleBlock(
  sheet: ExcelJS.Worksheet,
  opts: VendorQuoteOptions,
  colCount: number,
): number {
  const { project, vendorType, requestedBy, dueDate, notes } = opts;
  const vc = VENDOR_COLORS[vendorType];
  const projectName = project.projectName || project.venue || "Untitled Project";

  // Title
  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell("A1");
  titleCell.value = `${vc.label} QUOTE REQUEST — ${projectName.toUpperCase()}`;
  titleCell.font = { size: 16, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: vc.accent } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 36;

  // Meta
  const metaParts: string[] = [];
  if (project.clientName) metaParts.push(`Client: ${project.clientName}`);
  if (project.venue) metaParts.push(`Venue: ${project.venue}`);
  if (project.location) metaParts.push(`Location: ${project.location}`);
  if (project.isOutdoor) metaParts.push("Environment: Outdoor");
  if (project.isUnionLabor) metaParts.push("Union Labor: Yes");
  if (dueDate) metaParts.push(`Quote Due: ${dueDate}`);

  sheet.mergeCells(2, 1, 2, colCount);
  const metaCell = sheet.getCell("A2");
  metaCell.value = metaParts.join("  |  ") || "ANC LED Display Integration";
  metaCell.font = { size: 10, italic: true, color: { argb: "FF666666" }, name: "Calibri" };
  metaCell.alignment = { horizontal: "center" };

  let row = 3;
  if (requestedBy) {
    sheet.mergeCells(row, 1, row, colCount);
    sheet.getCell(`A${row}`).value = `Requested by: ${requestedBy}`;
    sheet.getCell(`A${row}`).font = { size: 10, color: { argb: "FF666666" }, name: "Calibri" };
    sheet.getCell(`A${row}`).alignment = { horizontal: "center" };
    row++;
  }
  if (notes) {
    sheet.mergeCells(row, 1, row, colCount);
    sheet.getCell(`A${row}`).value = `Notes: ${notes}`;
    sheet.getCell(`A${row}`).font = { size: 10, color: { argb: "FF666666" }, name: "Calibri" };
    sheet.getCell(`A${row}`).alignment = { horizontal: "center" };
    row++;
  }

  return row + 1; // skip blank row
}

// ─── Electrician Sheet ──────────────────────────────────────────────────────

async function generateElectricianSheet(opts: VendorQuoteOptions): Promise<Buffer> {
  const { project, specs, pricingDisplays } = opts;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Proposal Engine";

  const sheet = workbook.addWorksheet("Electrical Quote Request", {
    properties: { tabColor: { argb: COLORS.ELECTRIC_YELLOW } },
  });

  const COL_COUNT = 14;
  const widths = [4, 28, 16, 10, 10, 10, 12, 12, 10, 10, 14, 14, 14, 24];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  let row = addTitleBlock(sheet, opts, COL_COUNT);

  // Section headers
  const reqCols = 10;
  sheet.mergeCells(row, 1, row, reqCols);
  const reqH = sheet.getCell(row, 1);
  reqH.value = "DISPLAY ELECTRICAL REQUIREMENTS";
  styleHeader(reqH, COLORS.DARK_HEADER);
  reqH.alignment = { horizontal: "left", vertical: "middle" };

  sheet.mergeCells(row, reqCols + 1, row, COL_COUNT);
  const respH = sheet.getCell(row, reqCols + 1);
  respH.value = "ELECTRICIAN RESPONSE (fill in)";
  styleHeader(respH, COLORS.AMBER_HEADER);
  row++;

  // Column headers
  const headers = [
    "#", "Display Name", "Location", "Qty",
    "Total Power (W)", "Voltage", "Est. Circuits (20A/208V)",
    "Cab/Circuit", "Environment", "Service Type",
    // Electrician fills:
    "Quoted Circuits", "Cost per Circuit ($)", "Total Electrical ($)", "Notes",
  ];

  headers.forEach((h, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = h;
    styleHeader(cell, i >= reqCols ? COLORS.AMBER_HEADER : COLORS.ELECTRIC_YELLOW);
    if (i < reqCols) cell.font = { ...cell.font!, color: { argb: COLORS.DARK_HEADER } };
  });
  sheet.getRow(row).height = 32;
  row++;

  // Data rows
  const WATTS_PER_CIRCUIT = 3328;

  specs.forEach((spec, idx) => {
    const pd = pricingDisplays?.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    const r = sheet.getRow(row);

    const totalPowerW = mp?.totalMaxPowerW ?? spec.maxPowerW ?? null;
    const wattsPerCab = mp?.maxPowerWPerCab ?? null;
    const totalModules = mp?.totalModules ?? null;
    const cabsPerCircuit = wattsPerCab ? Math.floor(WATTS_PER_CIRCUIT / wattsPerCab) : null;
    const estCircuits = (totalModules && cabsPerCircuit && cabsPerCircuit > 0)
      ? Math.ceil(totalModules / cabsPerCircuit) : null;

    r.getCell(1).value = idx + 1;
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(2).value = spec.name;
    r.getCell(2).font = { bold: true, name: "Calibri" };
    r.getCell(3).value = spec.location || "—";
    r.getCell(4).value = spec.quantity;
    r.getCell(4).alignment = { horizontal: "center" };
    r.getCell(5).value = totalPowerW;
    r.getCell(5).numFmt = "#,##0";
    r.getCell(6).value = "208V 2P 1PH";
    r.getCell(6).alignment = { horizontal: "center" };
    r.getCell(7).value = estCircuits;
    r.getCell(7).alignment = { horizontal: "center" };
    r.getCell(7).font = { bold: true, name: "Calibri" };
    r.getCell(8).value = cabsPerCircuit;
    r.getCell(8).alignment = { horizontal: "center" };
    r.getCell(9).value = spec.environment || "indoor";
    r.getCell(9).alignment = { horizontal: "center" };
    r.getCell(10).value = spec.serviceType || "—";
    r.getCell(10).alignment = { horizontal: "center" };

    // Input cells
    for (let c = 11; c <= 14; c++) styleInput(r.getCell(c));
    stripe(r, reqCols, idx % 2 === 0);
    r.height = 24;
    row++;
  });

  // Total row
  const totalPower = specs.reduce((s, sp) => {
    const pd = pricingDisplays?.find((d) => d.name === sp.name);
    return s + (pd?.matchedProduct?.totalMaxPowerW ?? sp.maxPowerW ?? 0);
  }, 0);
  const totalCircuits = specs.reduce((s, sp) => {
    const pd = pricingDisplays?.find((d) => d.name === sp.name);
    const mp = pd?.matchedProduct;
    if (!mp?.totalModules || !mp?.maxPowerWPerCab) return s;
    const cpc = Math.floor(WATTS_PER_CIRCUIT / mp.maxPowerWPerCab);
    return s + (cpc > 0 ? Math.ceil(mp.totalModules / cpc) : 0);
  }, 0);

  row++;
  sheet.mergeCells(row, 1, row, COL_COUNT);
  const sumCell = sheet.getCell(row, 1);
  sumCell.value = `TOTAL: ${specs.length} displays  |  ${totalPower.toLocaleString()}W total power  |  Est. ${totalCircuits} circuits (20A/208V)  |  Spec: 208V 2-Pole 1PH`;
  sumCell.font = { size: 11, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
  sumCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.DARK_HEADER } };
  sumCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(row).height = 28;

  // Instructions
  row += 2;
  sheet.mergeCells(row, 1, row, COL_COUNT);
  sheet.getCell(row, 1).value = "INSTRUCTIONS";
  sheet.getCell(row, 1).font = { size: 12, bold: true, name: "Calibri" };
  row++;

  const instructions = [
    "1. Review the estimated circuit counts — these are calculated from LED cabinet power specs (20A/208V, 80% NEC derating = 3,328W per circuit).",
    "2. Fill in your actual quoted circuits, cost per circuit, and total electrical cost.",
    `3. All displays are ${project.isOutdoor ? "OUTDOOR" : "INDOOR"}. ${project.isUnionLabor ? "UNION LABOR REQUIRED." : ""}`,
    "4. Include conduit, wiring, disconnects, and panel termination in your pricing.",
    "5. Return completed sheet to ANC for integration into the proposal.",
  ];

  instructions.forEach((inst) => {
    sheet.mergeCells(row, 1, row, COL_COUNT);
    sheet.getCell(row, 1).value = inst;
    sheet.getCell(row, 1).font = { size: 10, color: { argb: "FF666666" }, name: "Calibri" };
    row++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

// ─── Installer Sheet ────────────────────────────────────────────────────────

async function generateInstallerSheet(opts: VendorQuoteOptions): Promise<Buffer> {
  const { project, specs, pricingDisplays } = opts;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Proposal Engine";

  const sheet = workbook.addWorksheet("Install Quote Request", {
    properties: { tabColor: { argb: COLORS.INSTALL_GREEN } },
  });

  const COL_COUNT = 14;
  const widths = [4, 28, 16, 10, 10, 10, 10, 12, 12, 10, 14, 14, 14, 24];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  let row = addTitleBlock(sheet, opts, COL_COUNT);

  // Section headers
  const reqCols = 10;
  sheet.mergeCells(row, 1, row, reqCols);
  const reqH = sheet.getCell(row, 1);
  reqH.value = "DISPLAY STRUCTURAL / INSTALLATION REQUIREMENTS";
  styleHeader(reqH, COLORS.DARK_HEADER);
  reqH.alignment = { horizontal: "left", vertical: "middle" };

  sheet.mergeCells(row, reqCols + 1, row, COL_COUNT);
  const respH = sheet.getCell(row, reqCols + 1);
  respH.value = "INSTALLER RESPONSE (fill in)";
  styleHeader(respH, COLORS.AMBER_HEADER);
  row++;

  const headers = [
    "#", "Display Name", "Location",
    "Width (ft)", "Height (ft)", "Weight (lbs)", "Qty",
    "Mounting Type", "Service Access", "Environment",
    // Installer fills:
    "Structural Cost ($)", "Install Labor ($)", "Total Install ($)", "Notes / Crew Needs",
  ];

  headers.forEach((h, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = h;
    styleHeader(cell, i >= reqCols ? COLORS.AMBER_HEADER : COLORS.INSTALL_GREEN);
    if (i < reqCols) cell.font = { ...cell.font!, color: { argb: COLORS.WHITE } };
  });
  sheet.getRow(row).height = 32;
  row++;

  specs.forEach((spec, idx) => {
    const pd = pricingDisplays?.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    const r = sheet.getRow(row);

    r.getCell(1).value = idx + 1;
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(2).value = spec.name;
    r.getCell(2).font = { bold: true, name: "Calibri" };
    r.getCell(3).value = spec.location || "—";
    r.getCell(4).value = spec.widthFt ?? "TBD";
    r.getCell(4).alignment = { horizontal: "center" };
    r.getCell(5).value = spec.heightFt ?? "TBD";
    r.getCell(5).alignment = { horizontal: "center" };
    r.getCell(6).value = mp?.totalWeightLbs ?? spec.weightLbs ?? "TBD";
    r.getCell(6).numFmt = "#,##0";
    r.getCell(6).alignment = { horizontal: "center" };
    r.getCell(7).value = spec.quantity;
    r.getCell(7).alignment = { horizontal: "center" };
    r.getCell(8).value = spec.mountingType || "Wall/Flown";
    r.getCell(8).alignment = { horizontal: "center" };
    r.getCell(9).value = spec.serviceType || "Front";
    r.getCell(9).alignment = { horizontal: "center" };
    r.getCell(10).value = spec.environment || "indoor";
    r.getCell(10).alignment = { horizontal: "center" };

    for (let c = 11; c <= 14; c++) styleInput(r.getCell(c));
    stripe(r, reqCols, idx % 2 === 0);
    r.height = 24;
    row++;
  });

  // Total
  const totalWeight = specs.reduce((s, sp) => {
    const pd = pricingDisplays?.find((d) => d.name === sp.name);
    return s + (pd?.matchedProduct?.totalWeightLbs ?? sp.weightLbs ?? 0);
  }, 0);
  const totalQty = specs.reduce((s, sp) => s + sp.quantity, 0);

  row++;
  sheet.mergeCells(row, 1, row, COL_COUNT);
  const sumCell = sheet.getCell(row, 1);
  sumCell.value = `TOTAL: ${specs.length} displays (${totalQty} screens)  |  Est. ${totalWeight.toLocaleString()} lbs total weight  |  ${project.isUnionLabor ? "UNION LABOR" : "Non-union"}  |  ${project.bondRequired ? "BOND REQUIRED" : "No bond"}`;
  sumCell.font = { size: 11, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
  sumCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.DARK_HEADER } };
  sumCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(row).height = 28;

  row += 2;
  sheet.mergeCells(row, 1, row, COL_COUNT);
  sheet.getCell(row, 1).value = "INSTRUCTIONS";
  sheet.getCell(row, 1).font = { size: 12, bold: true, name: "Calibri" };
  row++;

  const instructions = [
    "1. Fill in structural material cost, installation labor cost, and total for each display.",
    "2. Weights shown are estimated from LED cabinet specs — verify against actual shipping manifests.",
    `3. Environment: ${project.isOutdoor ? "OUTDOOR — IP65+ rated structural required." : "INDOOR venue."}`,
    `4. ${project.isUnionLabor ? "UNION LABOR REQUIRED — include prevailing wage rates." : "Standard labor rates apply."}`,
    "5. Note any additional crew requirements, rigging equipment, or access constraints.",
    "6. Return completed sheet to ANC for integration into the proposal.",
  ];

  instructions.forEach((inst) => {
    sheet.mergeCells(row, 1, row, COL_COUNT);
    sheet.getCell(row, 1).value = inst;
    sheet.getCell(row, 1).font = { size: 10, color: { argb: "FF666666" }, name: "Calibri" };
    row++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

// ─── LED Supplier Sheet ─────────────────────────────────────────────────────

async function generateLedSupplierSheet(opts: VendorQuoteOptions): Promise<Buffer> {
  const { project, specs, pricingDisplays } = opts;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ANC Proposal Engine";

  const sheet = workbook.addWorksheet("LED Supply Quote Request", {
    properties: { tabColor: { argb: COLORS.LED_BLUE } },
  });

  const COL_COUNT = 16;
  const widths = [4, 28, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 14, 14, 14, 24];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  let row = addTitleBlock(sheet, opts, COL_COUNT);

  const reqCols = 12;
  sheet.mergeCells(row, 1, row, reqCols);
  const reqH = sheet.getCell(row, 1);
  reqH.value = "LED DISPLAY SPECIFICATIONS";
  styleHeader(reqH, COLORS.DARK_HEADER);
  reqH.alignment = { horizontal: "left", vertical: "middle" };

  sheet.mergeCells(row, reqCols + 1, row, COL_COUNT);
  const respH = sheet.getCell(row, reqCols + 1);
  respH.value = "SUPPLIER RESPONSE (fill in)";
  styleHeader(respH, COLORS.AMBER_HEADER);
  row++;

  const headers = [
    "#", "Display Name", "Pitch (mm)", "Width (ft)", "Height (ft)",
    "Resolution (px)", "Nits", "Environment", "Service", "Qty",
    "SqFt/Screen", "Total SqFt",
    // Supplier fills:
    "Unit Cost ($/sqft)", "Total LED Cost ($)", "Lead Time (wks)", "Notes / Alt Model",
  ];

  headers.forEach((h, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = h;
    styleHeader(cell, i >= reqCols ? COLORS.AMBER_HEADER : COLORS.LED_BLUE);
  });
  sheet.getRow(row).height = 32;
  row++;

  specs.forEach((spec, idx) => {
    const pd = pricingDisplays?.find((d) => d.name === spec.name);
    const mp = pd?.matchedProduct;
    const r = sheet.getRow(row);

    const wFt = spec.widthFt ?? 0;
    const hFt = spec.heightFt ?? 0;
    const sqFtPerScreen = wFt * hFt;
    const totalSqFt = sqFtPerScreen * (spec.quantity || 1);
    const pitch = mp?.pitch ?? spec.pixelPitchMm;
    const resPx = spec.widthPx && spec.heightPx
      ? `${spec.widthPx} x ${spec.heightPx}`
      : "TBD";

    r.getCell(1).value = idx + 1;
    r.getCell(1).alignment = { horizontal: "center" };
    r.getCell(2).value = spec.name;
    r.getCell(2).font = { bold: true, name: "Calibri" };
    r.getCell(3).value = pitch != null ? `${pitch}mm` : "TBD";
    r.getCell(3).alignment = { horizontal: "center" };
    r.getCell(4).value = wFt > 0 ? Math.round(wFt * 100) / 100 : "TBD";
    r.getCell(4).alignment = { horizontal: "center" };
    r.getCell(5).value = hFt > 0 ? Math.round(hFt * 100) / 100 : "TBD";
    r.getCell(5).alignment = { horizontal: "center" };
    r.getCell(6).value = resPx;
    r.getCell(6).alignment = { horizontal: "center" };
    r.getCell(7).value = mp?.nits ?? spec.brightnessNits ?? "TBD";
    r.getCell(7).alignment = { horizontal: "center" };
    r.getCell(8).value = spec.environment || "indoor";
    r.getCell(8).alignment = { horizontal: "center" };
    r.getCell(9).value = spec.serviceType || "Front";
    r.getCell(9).alignment = { horizontal: "center" };
    r.getCell(10).value = spec.quantity || 1;
    r.getCell(10).alignment = { horizontal: "center" };
    r.getCell(11).value = sqFtPerScreen > 0 ? Math.round(sqFtPerScreen * 100) / 100 : "TBD";
    r.getCell(11).numFmt = "#,##0.00";
    r.getCell(12).value = totalSqFt > 0 ? Math.round(totalSqFt * 100) / 100 : "TBD";
    r.getCell(12).numFmt = "#,##0.00";
    r.getCell(12).font = { bold: true, name: "Calibri" };

    for (let c = 13; c <= 16; c++) styleInput(r.getCell(c));
    stripe(r, reqCols, idx % 2 === 0);
    r.height = 24;
    row++;
  });

  // Total
  const totalSqFtAll = specs.reduce((s, sp) => {
    const w = sp.widthFt ?? 0;
    const h = sp.heightFt ?? 0;
    return s + (w * h * (sp.quantity || 1));
  }, 0);

  row++;
  sheet.mergeCells(row, 1, row, COL_COUNT);
  const sumCell = sheet.getCell(row, 1);
  sumCell.value = `TOTAL: ${specs.length} displays  |  ${Math.round(totalSqFtAll).toLocaleString()} sqft total  |  ${specs.reduce((s, sp) => s + (sp.quantity || 1), 0)} screens  |  Pricing: $/sqft landed to US port (include tariff + shipping)`;
  sumCell.font = { size: 11, bold: true, color: { argb: COLORS.WHITE }, name: "Calibri" };
  sumCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.DARK_HEADER } };
  sumCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(row).height = 28;

  row += 2;
  sheet.mergeCells(row, 1, row, COL_COUNT);
  sheet.getCell(row, 1).value = "INSTRUCTIONS";
  sheet.getCell(row, 1).font = { size: 12, bold: true, name: "Calibri" };
  row++;

  const instructions = [
    "1. Fill in unit cost ($/sqft), total LED cost, and lead time for each display.",
    "2. Unit cost should be in $/sqft, landed to US port (include tariff + shipping).",
    "3. If proposing an alternative model, note it in the 'Notes / Alt Model' column.",
    "4. For multi-quantity items, provide per-unit pricing. Total = $/sqft × Total SqFt.",
    "5. Include processors, spare parts, and cables in your pricing OR note if separate.",
    "6. Return completed sheet to ANC for integration into the proposal.",
  ];

  instructions.forEach((inst) => {
    sheet.mergeCells(row, 1, row, COL_COUNT);
    sheet.getCell(row, 1).value = inst;
    sheet.getCell(row, 1).font = { size: 10, color: { argb: "FF666666" }, name: "Calibri" };
    row++;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}
