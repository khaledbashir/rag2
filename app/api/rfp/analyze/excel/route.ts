/**
 * POST /api/rfp/analyze/excel
 *
 * Analyze an Excel file (scoping workbook, cost sheet, or proposal)
 * and create an RfpAnalysis record — same output as the PDF pipeline.
 *
 * Body: FormData with 'file' (Excel)
 * Returns: AnalysisResult JSON (same shape as SSE "complete" event)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import * as xlsx from "xlsx";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";
import { parsePricingTablesWithValidation } from "@/services/pricing/pricingTableParser";
import { log } from "@/lib/logger";
import { auth } from "@/auth";
import type { PricingData } from "@/services/rfp/pipeline/bidFormFiller";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const session = await auth();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const warnings: string[] = [];
    const screens: ExtractedLEDSpec[] = [];

    // Try to find LED Cost Sheet, Margin Analysis, or any sheet with display data
    const ledSheet = findSheet(workbook, ["LED Cost Sheet", "LED_Cost_Sheet", "LED Cost"]);
    const marginSheet = findSheet(workbook, ["Margin Analysis", "Margin-Analysis", "MarginAnalysis"]);

    // ─── Parse pricing tables for Mirror Mode files ───
    // This extracts actual costs from Margin Analysis instead of re-estimating
    let pricingDocument: any = null;
    let mirrorModePricing: any[] = []; // Per-display pricing extracted from Excel
    const xlsxWorkbook = xlsx.read(buffer, { type: "buffer" });
    try {
      const pricingResult = parsePricingTablesWithValidation(xlsxWorkbook, file.name, { strict: false });
      pricingDocument = pricingResult.document;
      if (pricingDocument?.tables?.length > 0) {
        log.info(`[analyze-excel] Found ${pricingDocument.tables.length} pricing tables, document total: ${pricingDocument.documentTotal}`);
        // Extract per-display pricing from tables
        for (const table of pricingDocument.tables) {
          for (const item of (table.items || [])) {
            if (item.description && !item.isHidden) {
              mirrorModePricing.push({
                name: item.description,
                sellingPrice: item.sellingPrice || 0,
                cost: item.cost ?? null,
                section: table.name,
              });
            }
          }
        }
      }
    } catch (pricingErr) {
      log.warn("[analyze-excel] Pricing table parse failed:", pricingErr);
    }

    // Extract project info from Project Info sheet if available
    const projectInfoSheet = findSheet(workbook, ["Project Info", "ProjectInfo"]);
    const project: ExtractedProjectInfo = {
      clientName: null,
      projectName: null,
      venue: null,
      location: null,
      isOutdoor: false,
      isUnionLabor: false,
      bondRequired: false,
      specialRequirements: [],
    };

    if (projectInfoSheet) {
      extractProjectInfo(projectInfoSheet, project);
    }

    // Parse screens from LED Cost Sheet (preferred) or Margin Analysis
    if (ledSheet) {
      parseLedCostSheetSpecs(ledSheet, screens, project, warnings, xlsxWorkbook.Sheets[ledSheet.name]);
    } else if (marginSheet) {
      parseMarginAnalysisSpecs(marginSheet, screens, warnings);
    } else {
      // Try consultant LED schedule format (WJHW, etc.) first, then generic fallback
      const firstSheet = workbook.worksheets[0];
      if (firstSheet) {
        const consultantParsed = parseConsultantLedSchedule(firstSheet, screens, project, warnings);
        if (!consultantParsed) {
          parseGenericSheet(firstSheet, screens, project, warnings);
        }
      }
    }

    if (screens.length === 0) {
      return NextResponse.json({
        error: "No LED display data found in this Excel file. Expected sheets: 'LED Cost Sheet', 'Margin Analysis', or columns with Display/Screen names.",
      }, { status: 400 });
    }

    // Infer project name from filename if not found in sheets
    if (!project.projectName) {
      project.projectName = file.name
        .replace(/\.(xlsx|xls)$/i, "")
        .replace(/^(Scoping_Workbook_|ANC_)/i, "")
        .replace(/_/g, " ")
        .trim();
    }

    const bidFormPricing = ledSheet ? parseBidFormPricingFromLedCostSheet(ledSheet) : [];

    // Create analysis record (persist pricing data for reload survival)
    const analysis = await prisma.rfpAnalysis.create({
      data: {
        projectName: project.projectName,
        clientName: project.clientName,
        venue: project.venue,
        location: project.location,
        filename: file.name,
        fileSize: file.size,
        pageCount: 0,
        relevantPages: 0,
        noisePages: 0,
        drawingPages: 0,
        specsFound: screens.length,
        processingTimeMs: Date.now() - startTime,
        visionPages: 0,
        screens: JSON.parse(JSON.stringify(screens)),
        requirements: [],
        project: JSON.parse(JSON.stringify(project)),
        triage: [],
        pages: [],
        pricingDocument: pricingDocument ? JSON.parse(JSON.stringify(pricingDocument)) : undefined,
        mirrorModePricing: mirrorModePricing.length > 0 ? JSON.parse(JSON.stringify(mirrorModePricing)) : undefined,
        createdBy: session?.user?.name || session?.user?.email || null,
      },
    });

    const result = {
      id: analysis.id,
      screens,
      requirements: [],
      project,
      pages: [],
      stats: {
        totalPages: 0,
        relevantPages: 0,
        noisePages: 0,
        drawingPages: 0,
        specsFound: screens.length,
        processingTimeMs: Date.now() - startTime,
      },
      triage: [],
      aiWorkspaceSlug: null,
      warnings: warnings.length > 0 ? warnings : undefined,
      hasMarginAnalysis: !!marginSheet,
      hasLedCostSheet: !!ledSheet,
      // Mirror Mode pricing extracted from Excel
      pricingDocument,
      mirrorModePricing,
      bidFormPricing,
    };

    log.info(`[analyze-excel] Parsed ${screens.length} displays from ${file.name} in ${Date.now() - startTime}ms`);

    return NextResponse.json({ result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to analyze Excel";
    log.error("[analyze-excel] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findSheet(workbook: ExcelJS.Workbook, names: string[]): ExcelJS.Worksheet | null {
  for (const name of names) {
    const sheet = workbook.worksheets.find(
      (ws) => ws.name.toLowerCase().replace(/[\s_-]/g, "") === name.toLowerCase().replace(/[\s_-]/g, ""),
    );
    if (sheet) return sheet;
  }
  return null;
}

function parseNum(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,€£\s%]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  if (typeof value === "object" && "result" in (value as Record<string, unknown>)) {
    return parseNum((value as Record<string, unknown>).result);
  }
  return null;
}

function readNumericCell(sheet: ExcelJS.Worksheet, row: number, col: number): number | null {
  return parseNum(sheet.getRow(row).getCell(col).value);
}

function parseBidFormPricingFromLedCostSheet(sheet: ExcelJS.Worksheet): PricingData[] {
  const pricing: PricingData[] = [];

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const name = String(row.getCell(1).value || "").trim();
    if (!name || /^option$/i.test(name) || /^total/i.test(name) || name.startsWith("+")) continue;

    const hardwareCost = readNumericCell(sheet, rowNumber, 17); // Q: Display Cost
    const processingCost = readNumericCell(sheet, rowNumber, 19); // S: Processor
    const shippingCost = readNumericCell(sheet, rowNumber, 20); // T: Shipping
    const totalCost = readNumericCell(sheet, rowNumber, 21); // U: Total Cost
    const totalSellingPrice = readNumericCell(sheet, rowNumber, 23); // W: Price

    if (hardwareCost == null && totalSellingPrice == null) continue;

    const splitRowNumber = rowNumber + 1;
    const bidFormDisplaySellingPrice = readNumericCell(sheet, splitRowNumber, 17);
    const bidFormProcessingSellingPrice = readNumericCell(sheet, splitRowNumber, 19);
    const bidFormShippingSellingPrice = readNumericCell(sheet, splitRowNumber, 20);

    pricing.push({
      name,
      hardwareCost: hardwareCost ?? 0,
      processingCost: processingCost ?? 0,
      shippingCost: shippingCost ?? 0,
      totalCost: totalCost ?? hardwareCost ?? 0,
      hardwareSellingPrice: bidFormDisplaySellingPrice ?? totalSellingPrice ?? hardwareCost ?? 0,
      servicesSellingPrice: (bidFormProcessingSellingPrice ?? 0) + (bidFormShippingSellingPrice ?? 0),
      totalSellingPrice:
        totalSellingPrice ??
        (bidFormDisplaySellingPrice ?? 0) +
          (bidFormProcessingSellingPrice ?? 0) +
          (bidFormShippingSellingPrice ?? 0),
      bidFormDisplaySellingPrice: bidFormDisplaySellingPrice ?? undefined,
      bidFormProcessingSellingPrice: bidFormProcessingSellingPrice ?? undefined,
      bidFormShippingSellingPrice: bidFormShippingSellingPrice ?? undefined,
    });
  }

  return pricing;
}

function extractProjectInfo(sheet: ExcelJS.Worksheet, project: ExtractedProjectInfo) {
  sheet.eachRow((row) => {
    const label = String(row.getCell(1).value || "").toLowerCase().trim();
    const value = String(row.getCell(2).value || "").trim();
    if (!value || value === "—") return;

    if (label.includes("client")) project.clientName = value;
    else if (label.includes("project name") || label === "project") project.projectName = value;
    else if (label.includes("venue")) project.venue = value;
    else if (label.includes("location")) project.location = value;
    else if (label.includes("environment")) project.isOutdoor = value.toLowerCase().includes("outdoor");
    else if (label.includes("union")) project.isUnionLabor = value.toLowerCase() === "yes";
    else if (label.includes("bond")) project.bondRequired = value.toLowerCase() === "yes";
  });
}

function parseLedCostSheetSpecs(
  sheet: ExcelJS.Worksheet,
  screens: ExtractedLEDSpec[],
  project: ExtractedProjectInfo,
  warnings: string[],
  valueSheet?: xlsx.WorkSheet,
) {
  // Find header row
  let headerRow = 0;
  const colMap: Record<string, number> = {};

  sheet.eachRow((row, rowNumber) => {
    if (headerRow > 0) return;
    const vals: string[] = [];
    row.eachCell((cell) => vals.push(String(cell.value || "").toLowerCase().trim()));
    const joined = vals.join(" ");
    if (joined.includes("display") && (joined.includes("pitch") || joined.includes("vendor") || joined.includes("sqft"))) {
      headerRow = rowNumber;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || "").toLowerCase().trim();
        if (val === "display" || val === "display name") colMap["name"] = colNumber;
        if (val.includes("vendor")) colMap["vendor"] = colNumber;
        if (val.includes("pitch")) colMap["pitch"] = colNumber;
        if (val.includes("h (ft)") || val.includes("h(ft)") || val === "height") colMap["height"] = colNumber;
        if (val.includes("w (ft)") || val.includes("w(ft)") || val === "width") colMap["width"] = colNumber;
        if (val.includes("h (px)") || val.includes("h(px)")) colMap["heightPx"] = colNumber;
        if (val.includes("w (px)") || val.includes("w(px)")) colMap["widthPx"] = colNumber;
        if (val === "qty" || val === "quantity") colMap["qty"] = colNumber;
        if (val.includes("nit")) colMap["nits"] = colNumber;
        if (val.includes("service")) colMap["service"] = colNumber;
      });
    }
  });

  const usesAncLedCostLayout = (() => {
    const row5 = Array.from({ length: 15 }, (_, index) =>
      String(sheet.getRow(5).getCell(index + 1).value || "").toLowerCase().trim()
    ).join(" ");
    const row6 = Array.from({ length: 15 }, (_, index) =>
      String(sheet.getRow(6).getCell(index + 1).value || "").toLowerCase().trim()
    ).join(" ");
    return (
      row5.includes("active display size") &&
      row5.includes("pixel count") &&
      row6.includes("pitch")
    );
  })();

  if (usesAncLedCostLayout) {
    headerRow = headerRow || 6;
    colMap["name"] ??= 1;
    colMap["pitch"] ??= 5;
    colMap["height"] ??= 6;
    colMap["width"] ??= 7;
    colMap["heightPx"] ??= 8;
    colMap["widthPx"] ??= 10;
    colMap["qty"] ??= 12;
    colMap["nits"] ??= 14;
    colMap["service"] ??= 15;
  }

  if (headerRow === 0) {
    warnings.push("LED Cost Sheet: Could not find header row");
    return;
  }

  const nameCol = colMap["name"] || 1;
  const readValue = (row: ExcelJS.Row, col: number | undefined) => {
    if (!col) return null;
    if (valueSheet) {
      const address = xlsx.utils.encode_cell({ r: row.number - 1, c: col - 1 });
      const valueCell = valueSheet[address];
      if (valueCell && valueCell.v != null) return valueCell.v;
    }
    return row.getCell(col).value;
  };

  for (let ri = headerRow + 1; ri <= sheet.rowCount; ri++) {
    const row = sheet.getRow(ri);
    const name = String(readValue(row, nameCol) || "").trim();
    if (!name || name.toLowerCase().startsWith("total") || name.startsWith("+")) break;

    const nameFallback = parseDisplaySpecsFromName(name);
    const pitch =
      parseNum(readValue(row, colMap["pitch"])) ??
      nameFallback.pixelPitchMm;
    const heightFt =
      parseNum(readValue(row, colMap["height"])) ??
      nameFallback.heightFt;
    const widthFt =
      parseNum(readValue(row, colMap["width"])) ??
      nameFallback.widthFt;
    const heightPx =
      parseNum(readValue(row, colMap["heightPx"])) ??
      (heightFt != null && pitch != null ? Math.round((heightFt * 304.8) / pitch) : null);
    const widthPx =
      parseNum(readValue(row, colMap["widthPx"])) ??
      (widthFt != null && pitch != null ? Math.round((widthFt * 304.8) / pitch) : null);

    const spec: ExtractedLEDSpec = {
      name,
      quantity: parseNum(readValue(row, colMap["qty"])) || 1,
      pixelPitchMm: pitch,
      widthFt: widthFt ?? undefined,
      heightFt: heightFt ?? undefined,
      widthPx: widthPx ?? undefined,
      heightPx: heightPx ?? undefined,
      brightnessNits: parseNum(readValue(row, colMap["nits"])) || undefined,
      serviceType: colMap["service"] ? String(readValue(row, colMap["service"]) || "") || undefined : undefined,
      environment: project.isOutdoor ? "outdoor" : "indoor",
      confidence: 0.9,
      sourcePages: [],
    };

    screens.push(spec);
  }
}

function parseDisplaySpecsFromName(name: string): {
  pixelPitchMm: number | null;
  heightFt: number | null;
  widthFt: number | null;
} {
  const pitchMatch = name.match(/([\d.]+)\s*mm/i);
  const dimensionMatch = name.match(/([\d.]+)\s*'\s*H\s*x\s*([\d.]+)\s*'\s*W/i)
    || name.match(/([\d.]+)\s*H\s*x\s*([\d.]+)\s*W/i);

  return {
    pixelPitchMm: pitchMatch ? parseFloat(pitchMatch[1]) : null,
    heightFt: dimensionMatch ? parseFloat(dimensionMatch[1]) : null,
    widthFt: dimensionMatch ? parseFloat(dimensionMatch[2]) : null,
  };
}

function parseMarginAnalysisSpecs(
  sheet: ExcelJS.Worksheet,
  screens: ExtractedLEDSpec[],
  warnings: string[],
) {
  // Margin Analysis: zone name rows are display names
  let headerRow = 0;
  let nameCol = 2; // Default: column B

  sheet.eachRow((row, rowNumber) => {
    if (headerRow > 0) return;
    const vals: string[] = [];
    row.eachCell((cell) => vals.push(String(cell.value || "").toLowerCase().trim()));
    const joined = vals.join(" ");
    if (joined.includes("zone") || joined.includes("line item") || joined.includes("cost")) {
      headerRow = rowNumber;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || "").toLowerCase().trim();
        if (val.includes("zone") || val.includes("line item")) nameCol = colNumber;
      });
    }
  });

  if (headerRow === 0) {
    warnings.push("Margin Analysis: Could not find header row");
    return;
  }

  for (let ri = headerRow + 1; ri <= sheet.rowCount; ri++) {
    const row = sheet.getRow(ri);
    const name = String(row.getCell(nameCol).value || "").trim();
    if (!name || name.startsWith("    ") || name.startsWith("\t")) continue;
    if (name.toUpperCase().startsWith("SUBTOTAL") || name.toUpperCase().startsWith("GRAND TOTAL")) break;
    if (name.toUpperCase() === "TAX" || name.toUpperCase() === "BOND") continue;

    // Check if this looks like a display name (not a service category)
    const isDisplay = /display|screen|board|ribbon|hung|video|led|scoreboard/i.test(name)
      || !/(structural|installation|labor|pm|engineering|electrical|travel)/i.test(name);

    if (isDisplay) {
      screens.push({
        name,
        quantity: 1,
        pixelPitchMm: null,
        environment: "indoor",
        confidence: 0.7,
        sourcePages: [],
      });
    }
  }
}

/**
 * Parse consultant-supplied LED schedule spreadsheets (WJHW, etc.)
 *
 * These have columns like: ID, Location, Image Height (ft+in), Image Width (ft+in),
 * Pixel Pitch, Indoor/Outdoor, Brightness (nits), Service Type.
 *
 * Returns true if it detected and parsed the consultant format, false otherwise.
 */
function parseConsultantLedSchedule(
  sheet: ExcelJS.Worksheet,
  screens: ExtractedLEDSpec[],
  project: ExtractedProjectInfo,
  warnings: string[],
): boolean {
  // Detect header row by looking for consultant-specific column patterns
  let headerRow = 0;
  const colMap: Record<string, number> = {};

  sheet.eachRow((row, rowNumber) => {
    if (headerRow > 0) return;
    const vals: string[] = [];
    row.eachCell((cell) => vals.push(String(cell.value || "").toLowerCase().trim()));
    const joined = vals.join(" ");

    // Consultant schedules typically have ID + location + dimensions + pitch columns
    const hasId = vals.some((v) => v === "id" || v === "display id" || v === "led id");
    const hasLocation = vals.some((v) => v === "location" || v.includes("location"));
    const hasDimension = vals.some((v) => v.includes("height") || v.includes("image height"));
    const hasPitch = vals.some((v) => v.includes("pixel pitch") || v.includes("pitch"));

    if ((hasId && hasDimension) || (hasLocation && hasPitch && hasDimension)) {
      headerRow = rowNumber;
      // Track seen header names to handle merged cells (take FIRST occurrence only)
      const seen = new Set<string>();
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || "").toLowerCase().trim();
        // For merged headers like "IMAGE HEIGHT" spanning 2 cols (ft + in),
        // only map the FIRST occurrence — the second is the inches sub-column
        const mappings: Array<[string, (v: string) => boolean]> = [
          ["id", (v) => v === "id" || v === "display id" || v === "led id"],
          ["location", (v) => v === "location" || v === "display location"],
          ["level", (v) => v === "level" || v === "floor"],
          ["heightFt", (v) => v.includes("image height") || (v === "height" && !v.includes("max"))],
          ["widthFt", (v) => v.includes("image width") || v === "width"],
          ["pitch", (v) => v.includes("pixel pitch") || v === "pitch"],
          ["env", (v) => v.includes("indoor") || v.includes("outdoor") || v.includes("environment")],
          ["nits", (v) => v.includes("brightness") || v.includes("nit")],
          ["service", (v) => v === "service" || v.includes("service type") || v.includes("access")],
          ["maxHeight", (v) => v.includes("max height")],
          ["tolerance", (v) => v.includes("tolerance")],
          ["notes", (v) => v.includes("note")],
          ["phase", (v) => v === "bid package" || v === "phase"],
        ];
        for (const [key, matcher] of mappings) {
          if (!seen.has(key) && matcher(val)) {
            colMap[key] = colNumber;
            seen.add(key);
            break; // Only one mapping per cell
          }
        }
      });
    }
  });

  if (headerRow === 0 || !colMap["heightFt"]) return false;

  // Also detect the inches column (often the column right after height/width ft)
  // WJHW format: col 11 = height ft, col 12 = height inches, col 13 = width ft, col 14 = width inches
  const heightInCol = colMap["heightFt"] ? colMap["heightFt"] + 1 : 0;
  const widthInCol = colMap["widthFt"] ? colMap["widthFt"] + 1 : 0;

  // Check if the inches columns have numeric data (verify they're actually inches, not a different column)
  let hasInchesFormat = false;
  for (let ri = headerRow + 1; ri <= Math.min(headerRow + 3, sheet.rowCount); ri++) {
    const row = sheet.getRow(ri);
    const hIn = parseNum(row.getCell(heightInCol)?.value);
    if (hIn !== null && hIn >= 0 && hIn < 12) {
      hasInchesFormat = true;
      break;
    }
  }

  for (let ri = headerRow + 1; ri <= sheet.rowCount; ri++) {
    const row = sheet.getRow(ri);
    const id = colMap["id"] ? String(row.getCell(colMap["id"]).value || "").trim() : "";
    if (!id || id === "--") continue;
    // Stop at legend/notes section
    if (id.includes("LEVEL") || id.includes("NOTE") || id.includes(":")) break;

    const location = colMap["location"] ? String(row.getCell(colMap["location"]).value || "").trim() : "";
    const level = colMap["level"] ? String(row.getCell(colMap["level"]).value || "").trim() : "";

    // Parse dimensions — handle ft+inches or plain feet
    let heightFt: number | null = null;
    let widthFt: number | null = null;

    const hFtRaw = parseNum(colMap["heightFt"] ? row.getCell(colMap["heightFt"]).value : null);
    const wFtRaw = parseNum(colMap["widthFt"] ? row.getCell(colMap["widthFt"]).value : null);

    if (hFtRaw !== null && hFtRaw !== 0) {
      if (hasInchesFormat) {
        const hIn = parseNum(row.getCell(heightInCol)?.value) || 0;
        heightFt = hFtRaw + hIn / 12;
      } else {
        heightFt = hFtRaw;
      }
    }

    if (wFtRaw !== null && wFtRaw !== 0) {
      if (hasInchesFormat) {
        const wIn = parseNum(row.getCell(widthInCol)?.value) || 0;
        widthFt = wFtRaw + wIn / 12;
      } else {
        widthFt = wFtRaw;
      }
    }

    // Handle "--" or missing dimensions (e.g. VisiBowl rows that say "see notes")
    if (heightFt === null && widthFt === null) continue;

    // Parse pixel pitch — strip "MM" suffix
    const pitchRaw = colMap["pitch"] ? String(row.getCell(colMap["pitch"]).value || "") : "";
    const pitchMatch = pitchRaw.match(/([\d.]+)/);
    const pitch = pitchMatch ? parseFloat(pitchMatch[1]) : null;

    // Parse environment
    const envRaw = colMap["env"] ? String(row.getCell(colMap["env"]).value || "").toLowerCase() : "";
    const environment: "indoor" | "outdoor" = envRaw.includes("outdoor") ? "outdoor" : "indoor";

    // Parse brightness — strip "NITS" suffix
    const nitsRaw = colMap["nits"] ? String(row.getCell(colMap["nits"]).value || "") : "";
    const nitsMatch = nitsRaw.match(/([\d,]+)/);
    const nits = nitsMatch ? parseFloat(nitsMatch[1].replace(/,/g, "")) : null;

    // Parse service type
    const svcRaw = colMap["service"] ? String(row.getCell(colMap["service"]).value || "").toLowerCase() : "";
    const serviceType: "front" | "rear" | "top" | null =
      svcRaw.includes("front") ? "front" : svcRaw.includes("rear") ? "rear" : svcRaw.includes("top") ? "top" : null;

    // Notes / special requirements
    const notes = colMap["notes"] ? String(row.getCell(colMap["notes"]).value || "").trim() : "";
    const specialReqs: string[] = [];
    if (notes) {
      if (/curved|curve/i.test(notes)) specialReqs.push("curved");
      if (/mesh|transparent/i.test(notes)) specialReqs.push("LED mesh / transparent");
      if (/wrap/i.test(notes)) specialReqs.push("wrap-around corner");
    }

    // Build display name from ID + location
    const displayName = location ? `${id} — ${location}` : id;

    const spec: ExtractedLEDSpec = {
      name: displayName,
      location: [level, location].filter(Boolean).join(" — "),
      widthFt: widthFt ? Math.round(widthFt * 100) / 100 : null,
      heightFt: heightFt ? Math.round(heightFt * 100) / 100 : null,
      widthPx: null,
      heightPx: null,
      pixelPitchMm: pitch,
      brightnessNits: nits,
      environment,
      quantity: 1,
      serviceType,
      mountingType: null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: specialReqs,
      confidence: 0.95,
      sourcePages: [],
      sourceType: "table",
      citation: `Consultant LED Schedule (${sheet.name})`,
      notes: notes || null,
    };

    screens.push(spec);
  }

  if (screens.length > 0) {
    // Infer project outdoor status from majority environment
    const outdoorCount = screens.filter((s) => s.environment === "outdoor").length;
    if (outdoorCount > screens.length / 2) project.isOutdoor = true;

    warnings.push(`Parsed ${screens.length} displays from consultant LED schedule`);
    return true;
  }

  return false;
}

function parseGenericSheet(
  sheet: ExcelJS.Worksheet,
  screens: ExtractedLEDSpec[],
  project: ExtractedProjectInfo,
  warnings: string[],
) {
  // Scan for rows with display-like names
  let headerRow = 0;
  let nameCol = 1;

  sheet.eachRow((row, rowNumber) => {
    if (headerRow > 0) return;
    const vals: string[] = [];
    row.eachCell((cell) => vals.push(String(cell.value || "").toLowerCase().trim()));
    const joined = vals.join(" ");
    if (joined.includes("display") || joined.includes("screen") || joined.includes("led")) {
      headerRow = rowNumber;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || "").toLowerCase().trim();
        if (val === "display" || val.includes("display name") || val === "screen") nameCol = colNumber;
      });
    }
  });

  if (headerRow === 0) {
    warnings.push(`Sheet "${sheet.name}": No display/screen headers found`);
    return;
  }

  for (let ri = headerRow + 1; ri <= sheet.rowCount; ri++) {
    const row = sheet.getRow(ri);
    const name = String(row.getCell(nameCol).value || "").trim();
    if (!name || name.toLowerCase().startsWith("total")) break;

    screens.push({
      name,
      quantity: 1,
      pixelPitchMm: null,
      environment: "indoor",
      confidence: 0.6,
      sourcePages: [],
    });
  }

  if (screens.length > 0) {
    warnings.push(`Parsed ${screens.length} displays from "${sheet.name}" — verify specs are correct`);
  }
}
