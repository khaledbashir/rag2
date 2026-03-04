/**
 * POST /api/spec-generator/download
 *
 * Generates a formatted .xlsx file from the spec generator data.
 *
 * Clone-and-fill mode (preferred):
 *   Accepts the original template file via FormData, clones the template sheet
 *   per display using ExcelJS, and fills values into the correct cells.
 *   This preserves all original formatting (fonts, colors, merged cells, borders).
 *
 * Fallback mode:
 *   When no template buffer is provided, builds sheets from scratch with
 *   hardcoded ANC styling (original behavior).
 */

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import type { FilledDisplay, TemplateField } from "@/app/api/spec-generator/parse/route";

// ─── Styles (used by fallback addDisplaySheet + Summary) ─────────────────────

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
  fgColor: { argb: "FFFFF3CD" },
};

const LABEL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF7FAFC" },
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

// ─── Clone-and-fill helpers ──────────────────────────────────────────────────

/**
 * Clone a worksheet from a source workbook into a target workbook.
 * Copies column widths, row heights, merged cells, and all cell values + styles.
 */
function cloneWorksheet(
  sourceWs: ExcelJS.Worksheet,
  targetWb: ExcelJS.Workbook,
  newName: string,
): ExcelJS.Worksheet {
  const ws = targetWb.addWorksheet(newName);

  // Copy column widths
  sourceWs.columns.forEach((col, i) => {
    const targetCol = ws.getColumn(i + 1);
    if (col.width) targetCol.width = col.width;
    if (col.hidden) targetCol.hidden = col.hidden;
  });

  // Copy merged cells
  // ExcelJS exposes merges via worksheet model
  const srcModel = sourceWs.model as any;
  if (srcModel?.merges) {
    for (const merge of srcModel.merges) {
      try {
        ws.mergeCells(merge);
      } catch {
        // skip if merge range is invalid
      }
    }
  }

  // Copy rows: height + cells (value + style)
  sourceWs.eachRow({ includeEmpty: true }, (srcRow, rowNumber) => {
    const targetRow = ws.getRow(rowNumber);
    targetRow.height = srcRow.height;

    srcRow.eachCell({ includeEmpty: true }, (srcCell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);

      // Copy value (skip formulas — we'll overwrite value cells anyway)
      if (srcCell.type === ExcelJS.ValueType.Formula) {
        // Keep formula as-is
        targetCell.value = srcCell.value;
      } else {
        targetCell.value = srcCell.value;
      }

      // Copy style (font, fill, border, alignment, numFmt)
      if (srcCell.style) {
        targetCell.style = { ...srcCell.style };
      }
    });
  });

  return ws;
}

/**
 * Fill a cloned worksheet with display spec values.
 * Uses templateFields to know which row/col to write each value.
 */
function fillClonedSheet(
  ws: ExcelJS.Worksheet,
  display: FilledDisplay,
  templateFields: TemplateField[],
) {
  for (const field of templateFields) {
    if (field.type !== "field" || !field.fieldKey) continue;

    const value = display.specs[field.fieldKey];
    if (value == null) continue;

    const rowNum = field.rowIndex + 1; // ExcelJS is 1-based
    const colNum = (field.valueCol ?? 1) + 1; // ExcelJS is 1-based

    const cell = ws.getRow(rowNum).getCell(colNum);

    // Don't overwrite formula cells
    if (cell.type === ExcelJS.ValueType.Formula) continue;

    cell.value = value;
  }
}

// ─── Fallback: build worksheet from scratch (original behavior) ──────────────

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

  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 35;

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
    // Accept FormData (new) or JSON (legacy fallback)
    const contentType = request.headers.get("content-type") || "";

    let displays: FilledDisplay[];
    let templateFields: TemplateField[];
    let projectName: string;
    let editedCells: Record<string, string> | undefined;
    let templateBuffer: Buffer | null = null;

    if (contentType.includes("multipart/form-data")) {
      // New FormData format: template file + JSON data blob
      const formData = await request.formData();
      const templateFile = formData.get("template") as File | null;
      const dataStr = formData.get("data") as string;

      if (!dataStr) {
        return NextResponse.json({ error: "Missing data field" }, { status: 400 });
      }

      const body = JSON.parse(dataStr);
      displays = body.displays;
      templateFields = body.templateFields;
      projectName = body.projectName;
      editedCells = body.editedCells;

      // Only use clone-and-fill for Excel templates; PDF/Word templates use fallback mode
      if (templateFile && /\.(xlsx?|xls)$/i.test(templateFile.name)) {
        templateBuffer = Buffer.from(await templateFile.arrayBuffer());
      }
    } else {
      // Legacy JSON format (backward compat)
      const body = await request.json();
      displays = body.displays;
      templateFields = body.templateFields;
      projectName = body.projectName;
      editedCells = body.editedCells;
    }

    if (!displays || displays.length === 0) {
      return NextResponse.json({ error: "No displays provided" }, { status: 400 });
    }

    // Apply user edits to display specs
    if (editedCells) {
      for (const [key, value] of Object.entries(editedCells)) {
        if (key.includes(":")) {
          const [idxStr, fieldKey] = key.split(":");
          const idx = parseInt(idxStr);
          if (idx >= 0 && idx < displays.length && fieldKey) {
            displays[idx].specs[fieldKey] = value;
          }
          continue;
        }
        const parts = key.split("-");
        if (parts.length >= 2) {
          const sheetIdx = parseInt(parts[0]);
          const rowIdx = parseInt(parts[1]);
          const displayIdx = sheetIdx - 1;
          if (displayIdx >= 0 && displayIdx < displays.length && templateFields?.length > 0) {
            const field = templateFields[rowIdx];
            if (field?.fieldKey) {
              displays[displayIdx].specs[field.fieldKey] = value;
            }
          }
        }
      }
    }

    // ─── Save edited values to SpecFieldMemory (fire-and-forget) ──────────
    if (editedCells && Object.keys(editedCells).length > 0) {
      const memoryEntries = new Map<string, Record<string, string>>();
      for (const [key, value] of Object.entries(editedCells)) {
        let idx = -1;
        let fieldKey = "";
        if (key.includes(":")) {
          const [idxStr, fk] = key.split(":");
          idx = parseInt(idxStr);
          fieldKey = fk;
        }
        if (idx >= 0 && idx < displays.length && fieldKey && value) {
          const d = displays[idx];
          const modelKey = `${(d.vendor || "").toLowerCase()}|${(d.model || "").toLowerCase()}`;
          if (!memoryEntries.has(modelKey)) memoryEntries.set(modelKey, {});
          memoryEntries.get(modelKey)![fieldKey] = String(value);
        }
      }

      // Fire-and-forget save to DB
      if (memoryEntries.size > 0) {
        const entries = [...memoryEntries.entries()].map(([key, fields]) => {
          const [mfr, model] = key.split("|");
          return { manufacturer: mfr, model, pitchMm: 0, fields };
        });

        // Don't await — fire-and-forget
        (async () => {
          try {
            for (const entry of entries) {
              for (const [fieldKey, fieldValue] of Object.entries(entry.fields)) {
                const val = fieldValue.trim();
                if (!val) continue;
                await prisma.specFieldMemory.upsert({
                  where: {
                    manufacturer_model_pitchMm_fieldKey: {
                      manufacturer: entry.manufacturer,
                      model: entry.model,
                      pitchMm: entry.pitchMm,
                      fieldKey,
                    },
                  },
                  create: {
                    manufacturer: entry.manufacturer,
                    model: entry.model,
                    pitchMm: entry.pitchMm,
                    fieldKey,
                    fieldValue: val,
                    source: "user",
                  },
                  update: {
                    fieldValue: val,
                    source: "user",
                  },
                });
              }
            }
          } catch (e) {
            console.error("[SPEC GEN] Memory save error:", e);
          }
        })();
      }
    }

    // ─── Clone-and-fill mode ───────────────────────────────────────────────
    if (templateBuffer && templateFields?.length > 0) {
      const sourceWb = new ExcelJS.Workbook();
      await sourceWb.xlsx.load(templateBuffer);
      const sourceWs = sourceWb.worksheets[0];

      if (sourceWs) {
        const outputWb = new ExcelJS.Workbook();
        outputWb.creator = "ANC Spec Generator";
        outputWb.created = new Date();

        // Summary first
        addSummarySheet(outputWb, displays);

        // Clone template sheet per display, then fill values
        for (const display of displays) {
          const cloned = cloneWorksheet(sourceWs, outputWb, display.shortId);
          fillClonedSheet(cloned, display, templateFields);
        }

        const buffer = await outputWb.xlsx.writeBuffer();
        const fileName = `${projectName || "ANC"}_Product_Data_Forms.xlsx`;

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${fileName}"`,
          },
        });
      }
    }

    // ─── Fallback: build from scratch ──────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ANC Spec Generator";
    workbook.created = new Date();

    addSummarySheet(workbook, displays);

    for (const display of displays) {
      addDisplaySheet(workbook, display, templateFields);
    }

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
