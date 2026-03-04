/**
 * Spec Form Builder — transforms parsed spec data into WorkbookData
 * for WorkbookShell preview.
 *
 * Creates one SheetTab per display (named by Short ID) plus a Summary tab.
 * Each display tab mirrors the template layout: section headers + field rows.
 */

import type { WorkbookData, SheetTab, SheetRow, SheetCell } from "@/app/components/reusables/workbookTypes";
import type { FilledDisplay, TemplateField } from "@/app/api/spec-generator/parse/route";

// ─── Helpers (same pattern as rfpWorkbookBuilder) ───────────────────────────

function c(value: string | number, opts?: Partial<SheetCell>): SheetCell {
  return { value, ...opts };
}

function num(value: number | string | null | undefined, opts?: Partial<SheetCell>): SheetCell {
  return { value: value ?? "", align: "right", ...opts };
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const COLORS = {
  headerBg: "#1e3a5f",    // Dark navy
  sectionBg: "#2c5282",   // Medium blue
  matchExact: "#4CAF50",  // Green
  matchClose: "#FFA726",  // Amber
  matchDefault: "#EF5350", // Red
  indoor: "#3B82F6",      // Blue
  outdoor: "#F59E0B",     // Amber
  fieldLabel: "#F7FAFC",  // Light gray
};

// ─── Summary tab ────────────────────────────────────────────────────────────

function buildSummaryTab(displays: FilledDisplay[]): SheetTab {
  const columns = ["#", "Display ID", "Location", "Vendor", "Model", "Pitch (mm)", "Size (ft)", "Indoor/Outdoor", "Match Status"];

  const headerRow: SheetRow = {
    cells: columns.map((h) => c(h, { bold: true, header: true })),
    isHeader: true,
  };

  const dataRows: SheetRow[] = displays.map((d, i) => {
    const matchLabel =
      d.matchStatus === "exact" ? "Matched" :
      d.matchStatus === "close" ? "Close Match" :
      "Defaults Used";
    const matchClass =
      d.matchStatus === "exact" ? "text-green-600 font-semibold" :
      d.matchStatus === "close" ? "text-amber-600 font-semibold" :
      "text-red-500 font-semibold";

    return {
      cells: [
        num(i + 1),
        c(d.shortId, { bold: true }),
        c(d.location || "—"),
        c(d.vendor || "—"),
        c(d.model || "—"),
        num(d.pixelPitch || "—"),
        c(d.heightFt && d.widthFt ? `${d.heightFt}'H x ${d.widthFt}'W` : "—"),
        c(d.isOutdoor ? "Outdoor" : "Indoor"),
        c(matchLabel, { className: matchClass }),
      ],
    };
  });

  return {
    name: "Summary",
    color: COLORS.headerBg,
    columns,
    rows: [headerRow, ...dataRows],
  };
}

// ─── Per-display tab ────────────────────────────────────────────────────────

function buildDisplayTab(
  display: FilledDisplay,
  templateFields: TemplateField[],
): SheetTab {
  const columns = ["Field", "Value"];
  const rows: SheetRow[] = [];

  // Header row with display name
  rows.push({
    cells: [
      c(`${display.shortId} — ${display.location || display.fullName}`, {
        bold: true,
        header: true,
        span: 2,
      }),
    ],
    isHeader: true,
  });

  // Match status banner
  if (display.matchStatus === "defaults") {
    rows.push({
      cells: [
        c(`Defaults used — "${display.model || "Unknown"}" not in product catalog. Review highlighted fields.`, {
          span: 2,
          highlight: true,
          className: "text-amber-700",
        }),
      ],
    });
  } else if (display.matchedProductName) {
    rows.push({
      cells: [
        c(`Matched: ${display.matchedProductName}${display.matchStatus === "close" ? " (close match)" : ""}`, {
          span: 2,
          className: "text-green-700",
        }),
      ],
    });
  }

  rows.push({ cells: [c(""), c("")], isSeparator: true });

  // If we have template fields, follow that layout
  if (templateFields.length > 0) {
    for (const field of templateFields) {
      if (field.type === "separator") {
        rows.push({ cells: [c(""), c("")], isSeparator: true });
        continue;
      }

      if (field.type === "section") {
        rows.push({
          cells: [c(field.label, { bold: true, header: true, span: 2 })],
          isHeader: true,
        });
        continue;
      }

      // Field row — look up value from specs
      const value = field.fieldKey ? display.specs[field.fieldKey] : "";
      const isDefault = display.matchStatus === "defaults" && field.fieldKey &&
        !["respondent", "displayName", "manufacturer", "model", "bidType", "indoorOutdoor",
          "pixelPitch", "specWidthFt", "specHeightFt", "totalResolutionW", "totalResolutionH",
          "areaSqFt", "numberOfScreens", "serviceType"].includes(field.fieldKey);

      rows.push({
        cells: [
          c(field.label, { bold: true }),
          c(value ?? "—", { highlight: !!isDefault }),
        ],
      });
    }
  } else {
    // Fallback: generate a standard spec form layout
    buildDefaultLayout(display, rows);
  }

  return {
    name: display.shortId,
    color: display.isOutdoor ? COLORS.outdoor : COLORS.indoor,
    columns,
    rows,
    editableColumns: [1], // Only value column is editable
  };
}

/**
 * Default layout when no template is provided or template parsing returns empty.
 * Follows the standard Product Data Form structure from the Gemini prompt spec.
 */
function buildDefaultLayout(display: FilledDisplay, rows: SheetRow[]) {
  const s = display.specs;
  const section = (label: string) => {
    rows.push({
      cells: [c(label, { bold: true, header: true, span: 2 })],
      isHeader: true,
    });
  };
  const field = (label: string, value: any, highlight = false) => {
    rows.push({
      cells: [
        c(label, { bold: true }),
        c(value ?? "—", { highlight }),
      ],
    });
  };
  const sep = () => {
    rows.push({ cells: [c(""), c("")], isSeparator: true });
  };
  const isDefault = display.matchStatus === "defaults";

  // GENERAL INFORMATION
  section("GENERAL INFORMATION");
  field("Respondent's Name", "ANC");
  field("Display Name / Location", s.displayName);
  field("Manufacturer", s.manufacturer);
  field("Model", s.model);
  field("Base or Alternate", s.bidType);
  sep();

  // DISPLAY SPECIFICATIONS
  section("DISPLAY SPECIFICATIONS");
  field("Physical Pixel Pitch (mm)", s.pixelPitch);
  field("Virtual Pixel Pitch", s.virtualPixelPitch);
  field("Indoor / Outdoor", s.indoorOutdoor);
  field("Panel Resolution (W)", s.panelResolutionW, isDefault);
  field("Panel Resolution (H)", s.panelResolutionH, isDefault);
  field("Specified Display Width (ft)", s.specWidthFt);
  field("Specified Display Height (ft)", s.specHeightFt);
  field("Physical Size with Borders Width (ft)", s.physicalWidthWithBorder, isDefault);
  field("Physical Size with Borders Height (ft)", s.physicalHeightWithBorder, isDefault);
  field("Actual Display Width (ft)", s.actualWidthFt);
  field("Actual Display Height (ft)", s.actualHeightFt);
  field("Total Resolution (W)", s.totalResolutionW);
  field("Total Resolution (H)", s.totalResolutionH);
  field("Area Per Screen (sq ft)", s.areaSqFt);
  field("Number of Screens", s.numberOfScreens);
  field("Pixel Density (pixels/sq ft)", s.pixelDensity);
  sep();

  // OEM INFORMATION
  section("OEM INFORMATION");
  field("OEM LED Module Manufacturer", s.oemLedModuleMfr, isDefault);
  field("OEM Processor Manufacturer", s.oemProcessorMfr, isDefault);
  field("Factory / Country of Origin", s.factory, isDefault);
  field("LED Lamp Type", s.ledLampType, isDefault);
  sep();

  // OPTICAL SPECIFICATIONS
  section("OPTICAL SPECIFICATIONS");
  field("Maximum Brightness (NITs)", s.maxBrightness, isDefault);
  field("Viewing Angle — Horizontal", s.viewingAngleH, isDefault);
  field("Viewing Angle — Vertical Up", s.viewingAngleUp, isDefault);
  field("Viewing Angle — Vertical Down", s.viewingAngleDown, isDefault);
  field("Pixel Fill Factor %", s.pixelFillFactor, isDefault);
  field("Brightness Level Adjustment", s.brightnessAdjustment, isDefault);
  field("Color Temperature (K)", s.colorTemperatureK, isDefault);
  field("Color Temperature Adjustability", s.colorTempAdjustability, isDefault);
  field("Color Space — Rec 709 %", s.colorSpaceRec709, isDefault);
  field("Color Space — DCI-P3 %", s.colorSpaceDciP3, isDefault);
  field("Color Space — Rec 2020 %", s.colorSpaceRec2020, isDefault);
  sep();

  // ELECTRICAL SPECIFICATIONS
  section("ELECTRICAL SPECIFICATIONS");
  field("Power at 0% (Black) — KW", s.powerAt0, isDefault);
  field("Power Average — KW", s.powerAvg, isDefault);
  field("Power at 100% (White) — KW", s.powerAt100, isDefault);
  field("BTU at 0% (Black)", s.btuAt0, isDefault);
  field("BTU Average", s.btuAvg, isDefault);
  field("BTU at 100% (White)", s.btuAt100, isDefault);
  field("Power Requirements", s.powerRequirements, isDefault);
  sep();

  // WEIGHT
  section("WEIGHT");
  field("Total Display Weight", s.totalWeight, isDefault);
  field("Cabinet Count", display.cabinetCount, isDefault);
  sep();

  // OTHER
  section("OTHER");
  field("SMD LED Model", s.smdLedModel, isDefault);
  field("Gradation Method", s.gradationMethod, isDefault);
  field("Tonal Gradation", s.tonalGradation, isDefault);
  field("Ventilation / Cooling", s.ventilationRequirements, isDefault);
  field("Service Type", s.serviceType);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function buildSpecWorkbook(
  displays: FilledDisplay[],
  templateFields: TemplateField[],
  projectName: string,
): WorkbookData {
  const sheets: SheetTab[] = [];

  // Summary tab first
  sheets.push(buildSummaryTab(displays));

  // One tab per display
  for (const display of displays) {
    sheets.push(buildDisplayTab(display, templateFields));
  }

  return {
    fileName: `${projectName || "ANC"}_Product_Data_Forms.xlsx`,
    sheets,
  };
}
