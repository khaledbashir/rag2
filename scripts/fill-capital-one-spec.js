/**
 * Capital One Arena — Product Data Form Generator
 * Fills WJHW/AJP Product Data Form template for all 42 displays
 * Using: LG LSCC spec data + Jeremy's universal rules
 */
const ExcelJS = require("exceljs");
const path = require("path");

// ============================================================================
// LG SPEC DATA (from LGE-466 PDF pages 24-26)
// ============================================================================
const LG_SPECS = {
  // Standard Cabinets (-GZ)
  "LSCC012": {
    pitch: 1.25, model: "LSCC012-GZ", cabType: "Standard Cabinet",
    moduleRes: [240, 135], moduleDim: "11.8 x 6.6 in / 300 x 168.75 mm",
    weightPerModule: 0.7, modulesPerCab: [2, 2],
    cabRes: [480, 270], cabSurface_ft2: 2.2, cabSurface_m2: 0.2,
    weightPerCab_lbs: 11.0, weightPerSqFt: 5.1, weightPerSqM: 24.69,
    pixelDensity_m2: 640000,
    brightness: 800,
    maxPowerPerCab_W: 112, avgPowerPerCab_W: 37,
    maxPowerDensity_Wm2: 553,
    maxBtuPerCab: 382, avgBtuPerCab: 127, maxBtuPerM2: 1887,
    colorTemp: "3500-9000K (default: 6500K)",
    viewingAngleH: 160, viewingAngleV: 160,
  },
  "LSCC015": {
    pitch: 1.56, model: "LSCC015-GZ", cabType: "Standard Cabinet",
    moduleRes: [192, 108],
    weightPerCab_lbs: 11.0, weightPerSqFt: 5.1, weightPerSqM: 24.69,
    cabRes: [384, 216], cabSurface_ft2: 2.2, cabSurface_m2: 0.2,
    pixelDensity_m2: 409600,
    brightness: 800,
    maxPowerPerCab_W: 112, avgPowerPerCab_W: 37,
    maxPowerDensity_Wm2: 553,
    maxBtuPerCab: 382, avgBtuPerCab: 127, maxBtuPerM2: 1887,
    viewingAngleH: 160, viewingAngleV: 160,
  },
  "LSCC018": {
    pitch: 1.88, model: "LSCC018-GZ", cabType: "Standard Cabinet",
    moduleRes: [160, 90],
    weightPerCab_lbs: 11.0, weightPerSqFt: 5.1, weightPerSqM: 24.69,
    cabRes: [320, 180], cabSurface_ft2: 2.2, cabSurface_m2: 0.2,
    pixelDensity_m2: 284444,
    brightness: 800,
    maxPowerPerCab_W: 96, avgPowerPerCab_W: 32,
    maxPowerDensity_Wm2: 474,
    maxBtuPerCab: 328, avgBtuPerCab: 109, maxBtuPerM2: 1618,
    viewingAngleH: 160, viewingAngleV: 160,
  },
  "LSCC025": {
    pitch: 2.50, model: "LSCC025-GZ", cabType: "Standard Cabinet",
    moduleRes: [120, 135],
    weightPerCab_lbs: 11.0, weightPerSqFt: 5.1, weightPerSqM: 24.69,
    cabRes: [240, 135], cabSurface_ft2: 2.2, cabSurface_m2: 0.2,
    pixelDensity_m2: 160000,
    brightness: 800,
    maxPowerPerCab_W: 84, avgPowerPerCab_W: 28,
    maxPowerDensity_Wm2: 415,
    maxBtuPerCab: 287, avgBtuPerCab: 96, maxBtuPerM2: 1415,
    viewingAngleH: 160, viewingAngleV: 160,
  },
  // 8mm outdoor (GSQA series) — not in LSCC PDF, estimated from catalog
  "GSQA083": {
    pitch: 8.0, model: "GSQA083", cabType: "Outdoor Cabinet",
    moduleRes: [40, 40],
    weightPerSqFt: 8.5, weightPerSqM: 91.5,
    pixelDensity_m2: 15625,
    brightness: 7000, // outdoor
    maxPowerDensity_Wm2: 850,
    maxBtuPerM2: 2900,
    viewingAngleH: 160, viewingAngleV: 160,
  },
  // 3.9mm Mesh (Mesh P10 FM1921) — from Eric Gruner's spec sheet (3/5/2026)
  // Physical specs from "Mesh P10 FM1921 - Product Specification - R1.pdf"
  // Eric: "Use all the spec in the attached for the mesh screens, its just 3.9mm"
  "MESH_P10": {
    pitch: 3.9, model: "Mesh P10 FM1921", cabType: "Mesh Panel",
    moduleRes: [256, 128], // 1000mm/3.9mm × 500mm/3.9mm
    panelWidthMm: 1000, panelHeightMm: 500,
    weightPerSqFt: 3.07, // 16.5 lbs / 5.38 sqft per panel
    weightPerSqM: 15.0, // 7.5 kg / 0.5 sqm per panel
    pixelDensity_m2: 65746, // (1000/3.9)^2
    brightness: 6000, // Mesh P10 spec: 6,000 nits
    maxPowerDensity_Wm2: 600, // Mesh P10 spec: 600 W/sqm
    maxBtuPerM2: 2047, // 600 × 3.412
    viewingAngleH: 140, // ±70° per spec
    viewingAngleVUp: 65, // +65° per spec
    viewingAngleVDown: 70, // -70° per spec
    transparency: 65, // 65% open area
    isMesh: true,
    lampType: "NationStar FM1921", // from spec PDF
    manufacturer: "LG/Yaham",
    colorTemp: "6,500K",
  },
};

// Map pitch to closest LSCC model
function findSpec(pitchMm, model) {
  // Try exact model match first
  if (model && model !== "—") {
    const key = model.replace(/-.*/, "").toUpperCase();
    if (LG_SPECS[key]) return LG_SPECS[key];
  }
  // Fallback by pitch
  if (Math.abs(pitchMm - 1.2) < 0.1 || Math.abs(pitchMm - 1.25) < 0.1) return LG_SPECS.LSCC012;
  if (Math.abs(pitchMm - 1.56) < 0.1) return LG_SPECS.LSCC015;
  if (Math.abs(pitchMm - 1.875) < 0.15 || Math.abs(pitchMm - 1.88) < 0.1) return LG_SPECS.LSCC018;
  if (Math.abs(pitchMm - 2.5) < 0.2) return LG_SPECS.LSCC025;
  if (Math.abs(pitchMm - 3.9) < 0.2 || Math.abs(pitchMm - 4.0) < 0.2) return LG_SPECS.MESH_P10;
  if (Math.abs(pitchMm - 8.0) < 1.0) return LG_SPECS.GSQA083;
  return null;
}

// Parse size string like "8.858268'H x 15.748'W"
function parseSize(sizeStr) {
  const m = sizeStr.match(/([\d.]+)'?\s*H\s*x\s*([\d.]+)'?\s*W/i);
  if (!m) return { heightFt: 0, widthFt: 0 };
  return { heightFt: parseFloat(m[1]), widthFt: parseFloat(m[2]) };
}

// ============================================================================
// JEREMY'S UNIVERSAL RULES
// ============================================================================
const JEREMY_RULES = {
  respondentName: "ANC",
  // Processor: Novastar for most, but Eric confirming correct name for tight pitches
  // For now: Novastar everywhere, Eric's correction will update tight pitches later
  processorDefault: "Novastar",
  processorTightPitch: "Novastar",
  // Factory depends on product line (Natalia correction 3/4)
  // 1.2mm, 1.9mm, 2.5mm → LG Infiled
  // 4mm Mesh, 8mm Outdoor → LG Yaham
  factoryByPitch: (pitchMm) => {
    if (pitchMm <= 2.5) return "LG Infiled, China";
    return "LG Yaham, China";
  },
  // LED Lamp Type by pitch (Natalia correction 3/4)
  // 1.2mm, 1.9mm, 2.5mm → Kinglight
  // 4mm Mesh, 8mm → Nationstar RS2727
  lampTypeByPitch: (pitchMm) => {
    if (pitchMm <= 2.5) return "Kinglight";
    return "Nationstar RS2727";
  },
  // Physical display size = same as active size (no borders distinction)
  bordersEqualActive: true,
  // Weight × 1.25 (includes internal structure, cabling, electronics)
  weightMultiplier: 1.25,
  // Color temp: 3,200K–9,300K for both native and adjustability
  colorTempNative: "3,200K–9,300K",
  colorTempAdjust: "3,200K–9,300K",
  // Color space values (standard for all pitches)
  rec709: "90% (+/-9%)",
  dciP3: "90% (+/-9%)",
  rec2020: "77% (+/-9%)",
  // Brightness level adjustment
  brightnessAdjust: "0–100%",
  // Power requirements
  powerReq: "100 to 240 Vac, Single Phase",
};

// ============================================================================
// BUILD THE FILLED WORKBOOK
// ============================================================================
async function main() {
  // Read summary data from Capital One Bid Package
  const srcWb = new ExcelJS.Workbook();
  await srcWb.xlsx.readFile("docs/Capital One Arena - Bid Package 4_Product_Data_Forms.xlsx");
  const summary = srcWb.getWorksheet("Summary");

  const displays = [];
  for (let r = 2; r <= summary.rowCount; r++) {
    const row = summary.getRow(r);
    const id = row.getCell(2).value;
    if (!id) continue;
    displays.push({
      num: row.getCell(1).value,
      id: String(id),
      location: String(row.getCell(3).value || "—"),
      vendor: String(row.getCell(4).value || "LG"),
      model: String(row.getCell(5).value || "—"),
      pitch: parseFloat(row.getCell(6).value) || 0,
      size: String(row.getCell(7).value || ""),
      environment: String(row.getCell(8).value || "Indoor"),
      matchStatus: String(row.getCell(9).value || ""),
    });
  }

  console.log(`Found ${displays.length} displays to fill.`);

  // Read template for formatting reference
  const tplWb = new ExcelJS.Workbook();
  await tplWb.xlsx.readFile("docs/11 63 10 PRODUCT DATA FORM - COAT PHASES 3-7 (2).xlsx");

  // Create output workbook
  const outWb = new ExcelJS.Workbook();
  outWb.creator = "ANC Studio";
  outWb.created = new Date();

  // Create Summary sheet first
  const sumSheet = outWb.addWorksheet("Summary");
  sumSheet.getCell("A1").value = "Capital One Arena — Product Data Forms (Filled)";
  sumSheet.getCell("A1").font = { bold: true, size: 14 };
  sumSheet.getCell("A2").value = `Generated: ${new Date().toLocaleDateString()} by ANC Studio`;
  sumSheet.getCell("A3").value = `Displays: ${displays.length}`;

  const sumHeaders = ["#", "Display ID", "Pitch (mm)", "Size", "Model", "Environment", "Status"];
  const sumRow = sumSheet.getRow(5);
  sumRow.values = sumHeaders;
  sumRow.font = { bold: true };

  const flagged = [];

  displays.forEach((d, idx) => {
    const r = 6 + idx;
    sumSheet.getCell(`A${r}`).value = d.num;
    sumSheet.getCell(`B${r}`).value = d.id;
    sumSheet.getCell(`C${r}`).value = d.pitch;
    sumSheet.getCell(`D${r}`).value = d.size;
    sumSheet.getCell(`E${r}`).value = d.model;
    sumSheet.getCell(`F${r}`).value = d.environment;

    const spec = findSpec(d.pitch, d.model);
    sumSheet.getCell(`G${r}`).value = spec ? "Filled" : "FLAGGED — No spec data";
    if (!spec) flagged.push(d.id);
  });

  sumSheet.getColumn(1).width = 5;
  sumSheet.getColumn(2).width = 40;
  sumSheet.getColumn(3).width = 12;
  sumSheet.getColumn(4).width = 30;
  sumSheet.getColumn(5).width = 15;
  sumSheet.getColumn(6).width = 12;
  sumSheet.getColumn(7).width = 25;

  // Styling helpers
  const darkBg = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  const whiteBold = { bold: true, color: { argb: "FFFFFFFF" } };
  const sectionBg = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  const sectionFont = { bold: true };

  // Create one sheet per display
  for (const d of displays) {
    const spec = findSpec(d.pitch, d.model);
    const { heightFt, widthFt } = parseSize(d.size);
    const pitchMm = d.pitch;

    // Truncate sheet name to 31 chars (Excel limit)
    let sheetName = d.id.substring(0, 31);
    const ws = outWb.addWorksheet(sheetName);

    // Set column widths
    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 8;
    ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 8;
    ws.getColumn(5).width = 8;
    ws.getColumn(6).width = 18;
    ws.getColumn(7).width = 12;
    ws.getColumn(8).width = 8;
    ws.getColumn(9).width = 16;
    ws.getColumn(10).width = 8;

    // Calculate derived values
    const heightMm = heightFt * 304.8;
    const widthMm = widthFt * 304.8;
    const pixelsH = pitchMm > 0 ? Math.round(heightMm / pitchMm) : 0;
    const pixelsW = pitchMm > 0 ? Math.round(widthMm / pitchMm) : 0;
    const sqFt = heightFt * widthFt;
    const sqM = sqFt * 0.0929;
    const pixelDensity = sqFt > 0 ? Math.round((pixelsH * pixelsW) / sqFt) : 0;

    // Weight: lbs/sqft × sqft × 1.25 (Jeremy rule)
    const rawWeight = spec ? spec.weightPerSqFt * sqFt : 0;
    const totalWeight = Math.round(rawWeight * JEREMY_RULES.weightMultiplier);

    // Power: W/m² × area_m² → total watts, convert to KW
    const maxPowerW = spec ? spec.maxPowerDensity_Wm2 * sqM : 0;
    const avgPowerW = spec ? maxPowerW * 0.33 : 0; // typical ~33% of max
    const maxPowerKW = maxPowerW / 1000;
    const avgPowerKW = avgPowerW / 1000;

    // BTU = watts × 3.412
    const maxBtu = Math.round(maxPowerW * 3.412);
    const avgBtu = Math.round(avgPowerW * 3.412);

    const isOutdoor = d.environment.toLowerCase().includes("outdoor");
    const brightnessVal = spec ? spec.brightness : (isOutdoor ? 7000 : 800);
    const modelName = (spec && spec.isMesh) ? `LG ${spec.model}` : (d.vendor !== "—" ? `${d.vendor} ${d.model}` : d.model);

    // ── Row 1: RESPONDENT'S NAME ──
    ws.mergeCells("A1:E1");
    ws.getCell("A1").value = "RESPONDENT'S NAME:";
    ws.getCell("A1").font = { bold: true };
    ws.mergeCells("F1:J1");
    ws.getCell("F1").value = JEREMY_RULES.respondentName;

    // ── Row 2: blank ──

    // ── Row 3: BASE PROPOSAL ──
    ws.mergeCells("A3:E3");
    ws.getCell("A3").value = "BASE PROPOSAL OR ALTERNATE NUMBER:";
    ws.getCell("A3").font = { bold: true };
    ws.mergeCells("F3:J3");
    ws.getCell("F3").value = "Base";

    // ── Row 4: SPEC LED TYPE / MODEL ──
    ws.getCell("A4").value = "SPEC. LED TYPE:";
    ws.getCell("A4").font = { bold: true };
    ws.mergeCells("B4:E4");
    ws.getCell("B4").value = `${pitchMm}mm LED ${isOutdoor ? "Outdoor" : "Indoor"}`;
    ws.getCell("F4").value = "MODEL:";
    ws.getCell("F4").font = { bold: true };
    ws.mergeCells("G4:J4");
    ws.getCell("G4").value = modelName;

    // ── Row 5: DISPLAY NAME / LOCATION ──
    ws.getCell("A5").value = "DISPLAY NAME:";
    ws.getCell("A5").font = { bold: true };
    ws.mergeCells("B5:E5");
    ws.getCell("B5").value = d.id;
    ws.getCell("F5").value = "DISPLAY LOCATION:";
    ws.getCell("F5").font = { bold: true };
    ws.mergeCells("G5:J5");
    ws.getCell("G5").value = d.location;

    // ── Row 6: MANUFACTURING (section header) ──
    ws.mergeCells("A6:J6");
    ws.getCell("A6").value = "MANUFACTURING";
    ws.getCell("A6").font = whiteBold;
    ws.getCell("A6").fill = darkBg;

    // ── Row 7: OEM LED MODULE MANUFACTURER ──
    ws.mergeCells("A7:E7");
    ws.getCell("A7").value = "OEM LED MODULE MANUFACTURER:";
    ws.mergeCells("F7:J7");
    const isMesh = spec && spec.isMesh;
    ws.getCell("F7").value = isMesh ? spec.manufacturer : (d.vendor !== "—" ? `${d.vendor} Electronics` : "—");

    // ── Row 8: OEM PROCESSOR MANUFACTURER ──
    ws.mergeCells("A8:E8");
    ws.getCell("A8").value = "OEM PROCESSOR MANUFACTURER:";
    ws.mergeCells("F8:J8");
    // Tight pitches (<=1.5mm) — Eric confirming correct name. Others → Novastar.
    ws.getCell("F8").value = JEREMY_RULES.processorDefault;

    // ── Row 9: FACTORY ──
    ws.mergeCells("A9:E9");
    ws.getCell("A9").value = "FACTORY PRODUCING LED MODULES:";
    ws.mergeCells("F9:J9");
    ws.getCell("F9").value = JEREMY_RULES.factoryByPitch(pitchMm);

    // ── Row 10: LED LAMP TYPE ──
    ws.mergeCells("A10:E10");
    ws.getCell("A10").value = "LED LAMP TYPE AND DIE/PACKAGE MAKE AND MODEL:";
    ws.mergeCells("F10:J10");
    ws.getCell("F10").value = isMesh ? spec.lampType : JEREMY_RULES.lampTypeByPitch(pitchMm);

    // ── Row 11: PHYSICAL CHARACTERISTICS (section header) ──
    ws.mergeCells("A11:J11");
    ws.getCell("A11").value = "PHYSICAL CHARACTERISTICS";
    ws.getCell("A11").font = whiteBold;
    ws.getCell("A11").fill = darkBg;

    // ── Row 12-13: ACTIVE DISPLAY SIZE ──
    ws.mergeCells("A12:E13");
    ws.getCell("A12").value = "OVERALL ACTIVE DISPLAY SIZE (MEASURED FROM PHYSICAL PIXEL TO PHYSICAL PIXEL; NOT INCLUDING BORDERS):";
    ws.getCell("A12").alignment = { wrapText: true, vertical: "middle" };
    ws.getCell("F12").value = "VERTICAL:";
    ws.getCell("G12").value = Math.round(heightFt * 100) / 100;
    ws.getCell("H12").value = "FT";
    ws.getCell("I12").value = pixelsH;
    ws.getCell("J12").value = "PX";
    ws.getCell("F13").value = "HORIZONTAL:";
    ws.getCell("G13").value = Math.round(widthFt * 100) / 100;
    ws.getCell("H13").value = "FT";
    ws.getCell("I13").value = pixelsW;
    ws.getCell("J13").value = "PX";

    // ── Row 14-15: PHYSICAL DISPLAY SIZE (borders = active per Jeremy) ──
    ws.mergeCells("A14:E15");
    ws.getCell("A14").value = "PHYSICAL DISPLAY SIZE (INCLUDING BORDERS AND/OR SHROUDING):";
    ws.getCell("A14").alignment = { wrapText: true, vertical: "middle" };
    ws.getCell("F14").value = "VERTICAL:";
    ws.getCell("G14").value = Math.round(heightFt * 100) / 100;
    ws.mergeCells("H14:J14");
    ws.getCell("H14").value = "FT";
    ws.getCell("F15").value = "HORIZONTAL:";
    ws.getCell("G15").value = Math.round(widthFt * 100) / 100;
    ws.mergeCells("H15:J15");
    ws.getCell("H15").value = "FT";

    // ── Row 16-17: PIXEL SPACING ──
    ws.mergeCells("A16:E17");
    ws.getCell("A16").value = "PHYSICAL PIXEL SPACING (NOT LINES):";
    ws.getCell("A16").alignment = { wrapText: true, vertical: "middle" };
    ws.mergeCells("F16:H16");
    ws.getCell("F16").value = "VERTICAL TO VERTICAL:";
    ws.getCell("I16").value = pitchMm;
    ws.getCell("J16").value = "MM";
    ws.mergeCells("F17:H17");
    ws.getCell("F17").value = "HORIZONTAL TO HORIZONTAL:";
    ws.getCell("I17").value = pitchMm;
    ws.getCell("J17").value = "MM";

    // ── Row 18: VIRTUAL PIXEL PITCH ──
    ws.mergeCells("A18:H18");
    ws.getCell("A18").value = "VIRTUAL / \"CLAIMED\" PIXEL PITCH:";
    ws.getCell("I18").value = pitchMm;
    ws.getCell("J18").value = "MM";

    // ── Row 19: PIXEL DENSITY ──
    ws.mergeCells("A19:E19");
    ws.getCell("A19").value = "PHYSICAL PIXEL DENSITY (NOT LINES):";
    ws.mergeCells("F19:H19");
    ws.getCell("I19").value = pixelDensity;
    ws.getCell("J19").value = "PX/SQFT";

    // ── Row 20-22: VIEWING ANGLE ──
    ws.mergeCells("A20:E22");
    ws.getCell("A20").value = "VIEWING ANGLE (AT 50% BRIGHTNESS OR COLOR SHIFT, WHICHEVER OCCURS SOONER)";
    ws.getCell("A20").alignment = { wrapText: true, vertical: "middle" };
    ws.mergeCells("F20:H20");
    ws.getCell("F20").value = "HORIZONTAL:";
    ws.getCell("I20").value = isMesh ? spec.viewingAngleH : 160;
    ws.getCell("J20").value = "DEG";
    ws.mergeCells("F21:H21");
    ws.getCell("F21").value = "VERTICAL (UP):";
    ws.getCell("I21").value = isMesh ? spec.viewingAngleVUp : 80;
    ws.getCell("J21").value = "DEG";
    ws.mergeCells("F22:H22");
    ws.getCell("F22").value = "VERTICAL (DOWN):";
    ws.getCell("I22").value = isMesh ? spec.viewingAngleVDown : 80;
    ws.getCell("J22").value = "DEG";

    // ── Row 23: PIXEL FILL FACTOR ──
    ws.mergeCells("A23:E23");
    ws.getCell("A23").value = "PIXEL FILL FACTOR (PIXEL AREA / PITCH AREA):";
    ws.getCell("I23").value = isMesh ? "SMD 3 in 1" : "N/A (SMD)";

    // ── Row 24: % OPEN AREA ──
    ws.mergeCells("A24:E24");
    ws.getCell("A24").value = "% OPEN AREA (TRANSPARENT DISPLAYS ONLY):";
    ws.getCell("I24").value = isMesh ? `${spec.transparency}%` : "N/A";

    // ── Row 25: DISPLAY AND ELECTRICAL (section header) ──
    ws.mergeCells("A25:J25");
    ws.getCell("A25").value = "DISPLAY AND ELECTRICAL CHARACTERISTICS";
    ws.getCell("A25").font = whiteBold;
    ws.getCell("A25").fill = darkBg;

    // ── Row 26: BRIGHTNESS ──
    ws.mergeCells("A26:E26");
    ws.getCell("A26").value = "POST-CALIBRATION, UNIFORM BRIGHTNESS LEVEL:";
    ws.getCell("I26").value = brightnessVal;
    ws.getCell("J26").value = "NITS";

    // ── Row 27: BRIGHTNESS ADJUSTMENT ──
    ws.mergeCells("A27:E27");
    ws.getCell("A27").value = "BRIGHTNESS LEVEL ADJUSTMENT:";
    ws.mergeCells("F27:J27");
    ws.getCell("F27").value = JEREMY_RULES.brightnessAdjust;

    // ── Row 28: NATIVE COLOR TEMP ──
    ws.mergeCells("A28:E28");
    ws.getCell("A28").value = "NATIVE COLOR TEMPERATURE:";
    ws.mergeCells("F28:H28");
    ws.getCell("I28").value = JEREMY_RULES.colorTempNative;

    // ── Row 29: COLOR TEMP ADJUSTABILITY ──
    ws.mergeCells("A29:E29");
    ws.getCell("A29").value = "COLOR TEMPERATURE ADJUSTABILITY:";
    ws.mergeCells("F29:J29");
    ws.getCell("F29").value = JEREMY_RULES.colorTempAdjust;

    // ── Row 30-32: COLOR SPACE ──
    ws.mergeCells("A30:E32");
    ws.getCell("A30").value = "INCLUSION RATIO (%) OF COLOR SPACE REPRODUCIBLE BY DISPLAY, PROCESSOR, AND SIGNAL FLOW AS PROPOSED IN CIE 1931 XY:";
    ws.getCell("A30").alignment = { wrapText: true, vertical: "middle" };
    ws.mergeCells("F30:H30");
    ws.getCell("F30").value = "OF REC 709 COLOR SPACE:";
    ws.getCell("I30").value = JEREMY_RULES.rec709;
    ws.mergeCells("F31:H31");
    ws.getCell("F31").value = "OF DCI-P3 COLOR SPACE:";
    ws.getCell("I31").value = JEREMY_RULES.dciP3;
    ws.mergeCells("F32:H32");
    ws.getCell("F32").value = "OF REC 2020 COLOR SPACE:";
    ws.getCell("I32").value = JEREMY_RULES.rec2020;

    // ── Row 33-35: POWER CONSUMPTION ──
    ws.mergeCells("A33:E35");
    ws.getCell("A33").value = "POWER CONSUMPTION AND ANTICIPATED HEAT LOAD OF ENTIRE DISPLAY AS MEASURED AT DESIGNATED BRIGHTNESS WITH A FULL WHITE IMAGE:";
    ws.getCell("A33").alignment = { wrapText: true, vertical: "middle" };

    ws.getCell("F33").value = "AT 0% (BLACK SCREEN):";
    ws.getCell("G33").value = spec ? Math.round(maxPowerKW * 0.05 * 100) / 100 : "—";
    ws.getCell("H33").value = "KW";
    ws.getCell("I33").value = spec ? Math.round(maxBtu * 0.05) : "—";
    ws.getCell("J33").value = "BTU";

    ws.getCell("F34").value = "AVG (W/ TYP. CONTENT):";
    ws.getCell("G34").value = spec ? Math.round(avgPowerKW * 100) / 100 : "—";
    ws.getCell("H34").value = "KW";
    ws.getCell("I34").value = spec ? avgBtu : "—";
    ws.getCell("J34").value = "BTU";

    ws.getCell("F35").value = "AT 100% (WHITE SCREEN):";
    ws.getCell("G35").value = spec ? Math.round(maxPowerKW * 100) / 100 : "—";
    ws.getCell("H35").value = "KW";
    ws.getCell("I35").value = spec ? maxBtu : "—";
    ws.getCell("J35").value = "BTU";

    // ── Row 36: POWER REQUIREMENTS ──
    ws.mergeCells("A36:E36");
    ws.getCell("A36").value = "POWER REQUIREMENTS (VOLTAGE, PHASE, SERVICE) FOR ENTIRE DISPLAY, INCLUDING ANY VENTILATION.\nNO AIR CONDITIONING ALLOWED.";
    ws.getCell("A36").alignment = { wrapText: true };
    ws.mergeCells("F36:J36");
    ws.getCell("F36").value = JEREMY_RULES.powerReq;

    // ── Row 37: TOTAL WEIGHT ──
    ws.mergeCells("A37:E37");
    ws.getCell("A37").value = "TOTAL DISPLAY ASSEMBLY WEIGHT IN LBS.\n(INCLUDE INTERNAL STRUCTURE, CABLING, ETC.)";
    ws.getCell("A37").alignment = { wrapText: true };
    ws.mergeCells("F37:J37");
    ws.getCell("F37").value = spec ? `${totalWeight} lbs` : "— (no spec data)";

    // Style label columns
    for (let r = 1; r <= 37; r++) {
      const cell = ws.getCell(`A${r}`);
      if (!cell.font?.bold && !cell.font?.color) {
        cell.font = { bold: false, size: 9 };
      }
    }
  }

  // Save
  const outPath = path.join(__dirname, "..", "docs", "Capital One Arena - Product Data Forms (FILLED).xlsx");
  await outWb.xlsx.writeFile(outPath);
  console.log(`\nSaved to: ${outPath}`);
  console.log(`Total displays: ${displays.length}`);
  console.log(`Filled: ${displays.length - flagged.length}`);
  if (flagged.length > 0) {
    console.log(`\nFLAGGED (no LG spec data — need manual review):`);
    flagged.forEach(id => console.log(`  - ${id}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
