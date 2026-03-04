/**
 * POST /api/spec-generator/download
 *
 * Generates a formatted .xlsx file from the spec generator data.
 * Each display gets its own worksheet, matching the template layout.
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { FilledDisplay, TemplateField } from "@/app/api/spec-generator/parse/route";

// ─── Styles ─────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};

const SECTION_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2C5282" },
};

const HIGHLIGHT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF3CD" }, // Light amber
};

const LABEL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF7FAFC" }, // Light gray
};

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: "Work Sans",
  size: 12,
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const SECTION_FONT: Partial<ExcelJS.Font> = {
  name: "Work Sans",
  size: 10,
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const LABEL_FONT: Partial<ExcelJS.Font> = {
  name: "Work Sans",
  size: 9,
  bold: true,
  color: { argb: "FF374151" },
};

const VALUE_FONT: Partial<ExcelJS.Font> = {
  name: "Work Sans",
  size: 9,
  color: { argb: "FF111827" },
};

// ─── Build worksheet per display ────────────────────────────────────────────

function addDisplaySheet(
  workbook: ExcelJS.Workbook,
  display: FilledDisplay,
  templateFields: TemplateField[],
) {
  const ws = workbook.addWorksheet(display.shortId, {
    properties: {
      tabColor: { argb: display.isOutdoor ? "FFF59E0B" : "FF3B82F6" },
    },
  });

  // Column widths
  ws.getColumn(1).width = 40; // Label
  ws.getColumn(2).width = 35; // Value

  let rowNum = 1;

  // Title row
  const titleRow = ws.getRow(rowNum++);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 2);
  const titleCell = titleRow.getCell(1);
  titleCell.value = `${display.shortId} — ${display.location || display.fullName}`;
  titleCell.font = HEADER_FONT;
  titleCell.fill = HEADER_FILL;
  titleCell.border = BORDER;
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 28;

  // Match status row
  const statusRow = ws.getRow(rowNum++);
  ws.mergeCells(statusRow.number, 1, statusRow.number, 2);
  const statusCell = statusRow.getCell(1);
  if (display.matchStatus === "defaults") {
    statusCell.value = `Defaults used — "${display.model || "Unknown"}" not in product catalog`;
    statusCell.fill = HIGHLIGHT_FILL;
    statusCell.font = { ...VALUE_FONT, color: { argb: "FF92400E" } };
  } else if (display.matchedProductName) {
    statusCell.value = `Matched: ${display.matchedProductName}`;
    statusCell.font = { ...VALUE_FONT, color: { argb: "FF166534" } };
  } else {
    statusCell.value = "";
  }
  statusCell.border = BORDER;

  rowNum++; // Blank row

  // Use template fields if available, else use default layout
  if (templateFields.length > 0) {
    for (const field of templateFields) {
      if (field.type === "separator") {
        rowNum++;
        continue;
      }

      const row = ws.getRow(rowNum++);

      if (field.type === "section") {
        ws.mergeCells(row.number, 1, row.number, 2);
        const cell = row.getCell(1);
        cell.value = field.label;
        cell.font = SECTION_FONT;
        cell.fill = SECTION_FILL;
        cell.border = BORDER;
        cell.alignment = { horizontal: "center", vertical: "middle" };
        row.height = 22;
        continue;
      }

      // Field row
      const value = field.fieldKey ? display.specs[field.fieldKey] : "";
      const isDefault = display.matchStatus === "defaults" && field.fieldKey &&
        !["respondent", "displayName", "manufacturer", "model", "bidType", "indoorOutdoor",
          "pixelPitch", "specWidthFt", "specHeightFt", "totalResolutionW", "totalResolutionH",
          "areaSqFt", "numberOfScreens", "serviceType"].includes(field.fieldKey);

      const labelCell = row.getCell(1);
      labelCell.value = field.label;
      labelCell.font = LABEL_FONT;
      labelCell.fill = LABEL_FILL;
      labelCell.border = BORDER;

      const valueCell = row.getCell(2);
      valueCell.value = value ?? "—";
      valueCell.font = VALUE_FONT;
      valueCell.border = BORDER;
      if (isDefault) {
        valueCell.fill = HIGHLIGHT_FILL;
      }
    }
  } else {
    // Default layout
    const addSection = (label: string) => {
      const row = ws.getRow(rowNum++);
      ws.mergeCells(row.number, 1, row.number, 2);
      const cell = row.getCell(1);
      cell.value = label;
      cell.font = SECTION_FONT;
      cell.fill = SECTION_FILL;
      cell.border = BORDER;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      row.height = 22;
    };

    const addField = (label: string, value: any, highlight = false) => {
      const row = ws.getRow(rowNum++);
      const labelCell = row.getCell(1);
      labelCell.value = label;
      labelCell.font = LABEL_FONT;
      labelCell.fill = LABEL_FILL;
      labelCell.border = BORDER;

      const valueCell = row.getCell(2);
      valueCell.value = value ?? "—";
      valueCell.font = VALUE_FONT;
      valueCell.border = BORDER;
      if (highlight) {
        valueCell.fill = HIGHLIGHT_FILL;
      }
    };

    const s = display.specs;
    const isDef = display.matchStatus === "defaults";

    addSection("GENERAL INFORMATION");
    addField("Respondent's Name", "ANC");
    addField("Display Name / Location", s.displayName);
    addField("Manufacturer", s.manufacturer);
    addField("Model", s.model);
    addField("Base or Alternate", s.bidType);
    rowNum++;

    addSection("DISPLAY SPECIFICATIONS");
    addField("Physical Pixel Pitch (mm)", s.pixelPitch);
    addField("Indoor / Outdoor", s.indoorOutdoor);
    addField("Panel Resolution (W)", s.panelResolutionW, isDef);
    addField("Panel Resolution (H)", s.panelResolutionH, isDef);
    addField("Specified Display Width (ft)", s.specWidthFt);
    addField("Specified Display Height (ft)", s.specHeightFt);
    addField("Physical Size with Borders Width (ft)", s.physicalWidthWithBorder, isDef);
    addField("Physical Size with Borders Height (ft)", s.physicalHeightWithBorder, isDef);
    addField("Total Resolution (W)", s.totalResolutionW);
    addField("Total Resolution (H)", s.totalResolutionH);
    addField("Area Per Screen (sq ft)", s.areaSqFt);
    addField("Number of Screens", s.numberOfScreens);
    addField("Pixel Density (pixels/sq ft)", s.pixelDensity);
    rowNum++;

    addSection("OEM INFORMATION");
    addField("OEM LED Module Manufacturer", s.oemLedModuleMfr, isDef);
    addField("OEM Processor Manufacturer", s.oemProcessorMfr, isDef);
    addField("Factory / Country of Origin", s.factory, isDef);
    addField("LED Lamp Type", s.ledLampType, isDef);
    rowNum++;

    addSection("OPTICAL SPECIFICATIONS");
    addField("Maximum Brightness (NITs)", s.maxBrightness, isDef);
    addField("Viewing Angle — Horizontal", s.viewingAngleH, isDef);
    addField("Viewing Angle — Vertical Up", s.viewingAngleUp, isDef);
    addField("Viewing Angle — Vertical Down", s.viewingAngleDown, isDef);
    addField("Pixel Fill Factor %", s.pixelFillFactor, isDef);
    addField("Brightness Level Adjustment", s.brightnessAdjustment, isDef);
    addField("Color Temperature (K)", s.colorTemperatureK, isDef);
    addField("Color Temperature Adjustability", s.colorTempAdjustability, isDef);
    addField("Color Space — Rec 709 %", s.colorSpaceRec709, isDef);
    addField("Color Space — DCI-P3 %", s.colorSpaceDciP3, isDef);
    addField("Color Space — Rec 2020 %", s.colorSpaceRec2020, isDef);
    rowNum++;

    addSection("ELECTRICAL SPECIFICATIONS");
    addField("Power at 0% (Black) — KW", s.powerAt0, isDef);
    addField("Power Average — KW", s.powerAvg, isDef);
    addField("Power at 100% (White) — KW", s.powerAt100, isDef);
    addField("BTU at 0% (Black)", s.btuAt0, isDef);
    addField("BTU Average", s.btuAvg, isDef);
    addField("BTU at 100% (White)", s.btuAt100, isDef);
    addField("Power Requirements", s.powerRequirements, isDef);
    rowNum++;

    addSection("WEIGHT");
    addField("Total Display Weight", s.totalWeight, isDef);
    addField("Cabinet Count", display.cabinetCount, isDef);
  }
}

// ─── Summary sheet ──────────────────────────────────────────────────────────

function addSummarySheet(workbook: ExcelJS.Workbook, displays: FilledDisplay[]) {
  const ws = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: "FF1E3A5F" } },
  });

  const headers = ["#", "Display ID", "Location", "Vendor", "Model", "Pitch (mm)", "Size", "Indoor/Outdoor", "Match Status"];
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 25;
  ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 18;
  ws.getColumn(8).width = 14;
  ws.getColumn(9).width = 16;

  const headerRow = ws.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  headerRow.height = 24;

  displays.forEach((d, i) => {
    const row = ws.getRow(i + 2);
    const matchLabel = d.matchStatus === "exact" ? "Matched" :
      d.matchStatus === "close" ? "Close Match" : "Defaults Used";

    const values = [
      i + 1,
      d.shortId,
      d.location || "—",
      d.vendor || "—",
      d.model || "—",
      d.pixelPitch || "—",
      d.heightFt && d.widthFt ? `${d.heightFt}'H x ${d.widthFt}'W` : "—",
      d.isOutdoor ? "Outdoor" : "Indoor",
      matchLabel,
    ];

    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = VALUE_FONT;
      cell.border = BORDER;
      if (ci === 8) {
        cell.font = {
          ...VALUE_FONT,
          bold: true,
          color: {
            argb: d.matchStatus === "exact" ? "FF166534" :
              d.matchStatus === "close" ? "FF92400E" : "FFDC2626",
          },
        };
      }
    });
  });
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { displays, templateFields, projectName, editedCells } = body as {
      displays: FilledDisplay[];
      templateFields: TemplateField[];
      projectName: string;
      editedCells?: Record<string, string>;
    };

    if (!displays || displays.length === 0) {
      return NextResponse.json({ error: "No displays provided" }, { status: 400 });
    }

    // Apply user edits to display specs
    // editedCells format: { "displayIdx:fieldKey": "new value" }
    // OR legacy format: { "sheetIdx-rowIdx-colIdx": "value" } with templateFields lookup
    if (editedCells) {
      for (const [key, value] of Object.entries(editedCells)) {
        // New format: "displayIdx:fieldKey"
        if (key.includes(":")) {
          const [idxStr, fieldKey] = key.split(":");
          const idx = parseInt(idxStr);
          if (idx >= 0 && idx < displays.length && fieldKey) {
            displays[idx].specs[fieldKey] = value;
          }
          continue;
        }
        // Legacy format: "sheetIdx-rowIdx-colIdx"
        const parts = key.split("-");
        if (parts.length >= 2) {
          const sheetIdx = parseInt(parts[0]);
          const rowIdx = parseInt(parts[1]);
          const displayIdx = sheetIdx - 1; // 0 = summary, 1+ = displays
          if (displayIdx >= 0 && displayIdx < displays.length && templateFields?.length > 0) {
            // Find the field key from templateFields at this row position
            const field = templateFields[rowIdx];
            if (field?.fieldKey) {
              displays[displayIdx].specs[field.fieldKey] = value;
            }
          }
        }
      }
    }

    // Generate workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ANC Spec Generator";
    workbook.created = new Date();

    // Summary first
    addSummarySheet(workbook, displays);

    // One sheet per display
    for (const display of displays) {
      addDisplaySheet(workbook, display, templateFields);
    }

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${projectName || "ANC"}_Product_Data_Forms.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    console.error("[SPEC GEN] Download error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate Excel file" },
      { status: 500 }
    );
  }
}
