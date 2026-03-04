/**
 * Spec Sheet HTML Renderer — generates the HTML for Puppeteer PDF generation.
 *
 * Matches the Jacksonville Jaguars "PERFORMANCE STANDARDS" format:
 *   - One page per display
 *   - ANC branded header
 *   - Two-column spec table (Field | Value)
 *   - Work Sans typography, French Blue accents
 */

import type { FormSheetResult, DisplaySpec } from "./formSheetParser";
import { getRateSync } from "@/services/rfp/rateCardLoader";

const ANC_BLUE = "#0A52EF";
const ANC_DARK = "#002C73";
const TEXT_COLOR = "#1F2937";
const TEXT_MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const SURFACE = "#F9FAFB";

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtStr(v: string | null | undefined): string {
  return v?.trim() || "—";
}

interface SpecField {
  label: string;
  value: string;
  unit?: string;
  indent?: boolean;
  bold?: boolean;
  section?: boolean;
}

function buildSpecFields(d: DisplaySpec): SpecField[] {
  const fields: SpecField[] = [];

  fields.push({ label: "PERFORMANCE STANDARDS", value: "", section: true });

  fields.push({ label: "Location / Display Name", value: fmtStr(d.displayName), bold: true });
  fields.push({ label: "Manufacturer", value: fmtStr(d.manufacturer) });
  fields.push({ label: "Model", value: fmtStr(d.model) });

  fields.push({ label: "DISPLAY DIMENSIONS", value: "", section: true });

  fields.push({ label: "Overall Display Size — Horizontal", value: d.specWidthFt != null ? fmt(d.specWidthFt) : "—", unit: "ft" });
  fields.push({ label: "Overall Display Size — Horizontal (pixels)", value: d.specResolutionW != null ? fmtInt(d.specResolutionW) : "—", unit: "pixels" });
  fields.push({ label: "Overall Display Size — Vertical", value: d.specHeightFt != null ? fmt(d.specHeightFt) : "—", unit: "ft" });
  fields.push({ label: "Overall Display Size — Vertical (pixels)", value: d.specResolutionH != null ? fmtInt(d.specResolutionH) : "—", unit: "pixels" });

  fields.push({ label: "Physical Display Size — Horizontal", value: d.actualWidthFt != null ? fmt(d.actualWidthFt) : "—", unit: "ft" });
  fields.push({ label: "Physical Display Size — Vertical", value: d.actualHeightFt != null ? fmt(d.actualHeightFt) : "—", unit: "ft" });

  fields.push({ label: "PIXEL SPECIFICATIONS", value: "", section: true });

  fields.push({ label: "Physical Pixel Pitch — Horizontal", value: d.pixelPitch != null ? fmt(d.pixelPitch, 2) : "—", unit: "mm" });
  fields.push({ label: "Physical Pixel Pitch — Vertical", value: d.pixelPitch != null ? fmt(d.pixelPitch, 2) : "—", unit: "mm" });
  fields.push({ label: "Virtual Pixel Pitch", value: fmtStr(d.virtualPixelPitch), unit: d.virtualPixelPitch && d.virtualPixelPitch !== "N/A" ? "mm" : "" });
  fields.push({ label: "Physical Pixel Density", value: d.pixelDensityPerSqFt != null ? fmtInt(d.pixelDensityPerSqFt) : "—", unit: "pixels/sqft" });
  fields.push({ label: "Total Resolution (W × H)", value: d.totalResolutionW && d.totalResolutionH ? `${fmtInt(d.totalResolutionW)} × ${fmtInt(d.totalResolutionH)}` : "—", unit: "pixels" });

  fields.push({ label: "LED PANEL", value: "", section: true });

  fields.push({ label: "Panel Resolution (W × H)", value: d.panelResolutionW && d.panelResolutionH ? `${fmtInt(d.panelResolutionW)} × ${fmtInt(d.panelResolutionH)}` : "—", unit: "pixels" });
  fields.push({ label: "Panel Size (W × H)", value: d.panelSizeW_mm && d.panelSizeH_mm ? `${fmtInt(d.panelSizeW_mm)} × ${fmtInt(d.panelSizeH_mm)}` : "—", unit: "mm" });

  fields.push({ label: "OPTICAL", value: "", section: true });

  fields.push({ label: "Brightness (after calibration)", value: d.brightnessNits != null ? fmtInt(d.brightnessNits) : "—", unit: "nits" });
  fields.push({ label: "Brightness Level Adjustment", value: fmtStr(d.brightnessAdjustment) || "0–100%" });
  fields.push({ label: "Color Temperature", value: fmtStr(d.colorTemperatureK), unit: d.colorTemperatureK ? "°K" : "" });
  const tMin = getRateSync("spec.color_temp.min");
  const tMax = getRateSync("spec.color_temp.max");
  fields.push({ label: "Color Temperature Adjustability", value: fmtStr(d.colorTempAdjustability) || `${tMin.toLocaleString()}K–${tMax.toLocaleString()}K` });
  fields.push({ label: "Gradation Method", value: fmtStr(d.gradationMethod) });
  fields.push({ label: "Tonal Gradation", value: fmtStr(d.tonalGradation) });

  fields.push({ label: "LED MODULE", value: "", section: true });

  fields.push({ label: "LED Lamp / Die Make & Model", value: fmtStr(d.ledLampModel) });
  fields.push({ label: "3-in-1 SMD LED Make & Model", value: fmtStr(d.smdLedModel) });

  fields.push({ label: "ELECTRICAL & PHYSICAL", value: "", section: true });

  fields.push({ label: "Power Consumption — Typical (entire display)", value: d.typicalPowerW != null ? fmtInt(d.typicalPowerW) : "—", unit: "W" });
  fields.push({ label: "Power Consumption — Max (entire display)", value: d.maxPowerW != null ? fmtInt(d.maxPowerW) : "—", unit: "W" });
  fields.push({ label: "Normal Power Requirements", value: fmtStr(d.voltageService) });
  fields.push({ label: "Ventilation Requirements", value: fmtStr(d.ventilationRequirements) });
  fields.push({ label: "Display Assembly Weight", value: d.panelWeightLbs != null ? fmtInt(Math.round(d.panelWeightLbs * getRateSync("spec.weight_multiplier"))) : "—", unit: "lbs" });

  return fields;
}

function renderDisplayPage(d: DisplaySpec, projectName: string, isFirst: boolean): string {
  const fields = buildSpecFields(d);

  const rows = fields.map((f) => {
    if (f.section) {
      return `
        <tr>
          <td colspan="2" style="
            padding: 6px 8px 3px 8px;
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            color: ${ANC_BLUE};
            border-bottom: 2px solid ${ANC_BLUE};
            background: transparent;
          ">${f.label}</td>
        </tr>`;
    }

    const valueStr = f.unit && f.value !== "—"
      ? `${f.value} <span style="color:${TEXT_MUTED};font-size:8px;">${f.unit}</span>`
      : f.value;

    return `
      <tr style="border-bottom: 1px solid ${BORDER};">
        <td style="
          padding: 4px 8px;
          font-size: 9px;
          color: ${TEXT_MUTED};
          width: 55%;
          vertical-align: top;
          ${f.indent ? "padding-left: 20px;" : ""}
        ">${f.label}</td>
        <td style="
          padding: 4px 8px;
          font-size: 9px;
          color: ${f.bold ? ANC_DARK : TEXT_COLOR};
          font-weight: ${f.bold ? "600" : "400"};
          text-align: right;
          vertical-align: top;
        ">${valueStr}</td>
      </tr>`;
  }).join("\n");

  const pageBreak = isFirst ? "" : 'style="page-break-before: always;"';

  return `
    <div ${pageBreak}>
      <!-- Display Header -->
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        padding-bottom: 6px;
        border-bottom: 2px solid ${ANC_BLUE};
      ">
        <div style="width: 3px; height: 18px; background: ${ANC_BLUE}; border-radius: 1px;"></div>
        <div>
          <div style="font-size: 11px; font-weight: 700; color: ${ANC_DARK}; text-transform: uppercase; letter-spacing: 0.5px;">
            ${escHtml(d.displayName || `Display ${d.index + 1}`)}
          </div>
          <div style="font-size: 8px; color: ${TEXT_MUTED}; margin-top: 1px;">
            ${escHtml(d.manufacturer)} • ${escHtml(d.model)} • ${d.pixelPitch != null ? d.pixelPitch + "mm" : "—"}
          </div>
        </div>
      </div>

      <!-- Spec Table -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 6px;">
        ${rows}
      </table>
    </div>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Render the full spec sheet HTML document for Puppeteer.
 */
export function renderSpecSheetHtml(result: FormSheetResult, origin: string): string {
  const projectName = result.projectName || "Project";

  const displayPages = result.displays.map((d, i) =>
    renderDisplayPage(d, projectName, i === 0)
  ).join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <base href="${origin}/"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"/>
  <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Work Sans', system-ui, sans-serif;
      font-size: 10px;
      line-height: 1.4;
      color: ${TEXT_COLOR};
      padding: 24px;
    }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
  </style>
</head>
<body>
  <!-- ANC Header -->
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid ${ANC_BLUE};">
    <div style="display: flex; align-items: center; gap: 8px;">
      <img src="/ANC_Logo_2023_blue.png" style="height: 28px;" alt="ANC"/>
      <div>
        <div style="font-size: 12px; font-weight: 700; color: ${ANC_DARK}; letter-spacing: 0.5px;">LED DISPLAY SYSTEMS — PERFORMANCE STANDARDS</div>
        <div style="font-size: 9px; color: ${TEXT_MUTED};">${escHtml(projectName)}</div>
      </div>
    </div>
    <div style="text-align: right; font-size: 8px; color: ${TEXT_MUTED};">
      ${result.displays.length} Display${result.displays.length !== 1 ? "s" : ""}
    </div>
  </div>

  ${displayPages}
</body>
</html>`;
}
