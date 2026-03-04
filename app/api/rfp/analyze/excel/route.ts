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
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

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
      parseLedCostSheetSpecs(ledSheet, screens, project, warnings);
    } else if (marginSheet) {
      parseMarginAnalysisSpecs(marginSheet, screens, warnings);
    } else {
      // Try first sheet as fallback — scan for display-like rows
      const firstSheet = workbook.worksheets[0];
      if (firstSheet) {
        parseGenericSheet(firstSheet, screens, project, warnings);
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

    // Create analysis record
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
    };

    console.log(`[analyze-excel] Parsed ${screens.length} displays from ${file.name} in ${Date.now() - startTime}ms`);

    return NextResponse.json({ result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to analyze Excel";
    console.error("[analyze-excel] Error:", err);
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

  if (headerRow === 0) {
    warnings.push("LED Cost Sheet: Could not find header row");
    return;
  }

  const nameCol = colMap["name"] || 1;

  for (let ri = headerRow + 1; ri <= sheet.rowCount; ri++) {
    const row = sheet.getRow(ri);
    const name = String(row.getCell(nameCol).value || "").trim();
    if (!name || name.toLowerCase().startsWith("total") || name.startsWith("+")) break;

    const pitchStr = colMap["pitch"] ? String(row.getCell(colMap["pitch"]).value || "") : "";
    const pitchMatch = pitchStr.match(/([\d.]+)/);
    const pitch = pitchMatch ? parseFloat(pitchMatch[1]) : null;

    const spec: ExtractedLEDSpec = {
      name,
      quantity: parseNum(colMap["qty"] ? row.getCell(colMap["qty"]).value : null) || 1,
      pixelPitchMm: pitch,
      widthFt: parseNum(colMap["width"] ? row.getCell(colMap["width"]).value : null) || undefined,
      heightFt: parseNum(colMap["height"] ? row.getCell(colMap["height"]).value : null) || undefined,
      widthPx: parseNum(colMap["widthPx"] ? row.getCell(colMap["widthPx"]).value : null) || undefined,
      heightPx: parseNum(colMap["heightPx"] ? row.getCell(colMap["heightPx"]).value : null) || undefined,
      brightnessNits: parseNum(colMap["nits"] ? row.getCell(colMap["nits"]).value : null) || undefined,
      serviceType: colMap["service"] ? String(row.getCell(colMap["service"]).value || "") || undefined : undefined,
      environment: project.isOutdoor ? "outdoor" : "indoor",
      confidence: 0.9,
      sourcePages: [],
    };

    screens.push(spec);
  }
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
