/**
 * Performance Standards Form Renderer — produces the industry-standard
 * "PERFORMANCE STANDARDS" form layout matching RFP spec sheet format.
 *
 * Reference: Jacksonville Jaguars spec sheet (HOK/WJHW format)
 *            Panthers spec sheets combined (Populous/WJHW format)
 *
 * This renders the EXACT form that architects/clients require as part of
 * RFP responses. One page per display, form-style bordered layout,
 * filled from Excel FORM sheet data.
 */

import type { FormSheetResult, DisplaySpec } from "./formSheetParser";
import { getRateSync } from "@/services/rfp/rateCardLoader";

// ---------------------------------------------------------------------------
// Project metadata — passed from the proposal context
// ---------------------------------------------------------------------------

export interface SpecSheetProjectMeta {
  venueName?: string;       // e.g. "Stadium of the Future"
  clientName?: string;      // e.g. "Jacksonville Jaguars, LLC"
  clientAddress?: string;   // e.g. "1 EverBank Field Drive, Jacksonville, FL 62202"
}

const ANC_PROPOSER = "ANC Sports Enterprises, LLC";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fN(v: number | null | undefined, dec = 2): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fI(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function s(v: string | null | undefined): string {
  return v?.trim() || "";
}

function withUnit(formatted: string, unit: string): string {
  return formatted ? `${formatted} <span class="u">${unit}</span>` : "";
}

// ---------------------------------------------------------------------------
// Per-display form page — matches Jacksonville Jaguars / Panthers format
// ---------------------------------------------------------------------------

function renderDisplayForm(
  d: DisplaySpec,
  meta: SpecSheetProjectMeta,
  pageIndex: number
): string {
  const pb = pageIndex > 0 ? ' style="page-break-before:always;"' : "";
  const displayLabel = s(d.displayName) || `Display ${d.index + 1}`;
  const displayId = s(d.configRef) || `AV-${d.index + 1}`;

  const headerLines: string[] = [];
  if (meta.venueName) headerLines.push(`<div class="proj-name">${esc(meta.venueName)}</div>`);
  if (meta.clientName) headerLines.push(`<div class="proj-client">${esc(meta.clientName)}</div>`);
  if (meta.clientAddress) headerLines.push(`<div class="proj-addr">${esc(meta.clientAddress)}</div>`);
  if (headerLines.length === 0) headerLines.push(`<div class="proj-name">Project</div>`);

  return `
<div class="form-page"${pb}>

  <!-- Project Header -->
  <div class="proj-header">
    <div class="proj-left">
      ${headerLines.join("\n      ")}
    </div>
  </div>

  <!-- Form Title -->
  <div class="form-title">PERFORMANCE STANDARDS (PROVIDE FOR EACH DISPLAY PROPOSED)</div>

  <!-- Display ID Tag -->
  <div class="display-id">
    <span class="display-tag">${esc(displayId)}</span>
    <span class="display-label">${esc(displayLabel)}</span>
  </div>

  <!-- Main Form Table -->
  <table class="pf">

    <!-- Row: Base Proposal / Location -->
    <tr>
      <td class="lbl" style="width:40%">Base Proposal or Alternate Number:</td>
      <td class="val" style="width:10%">${esc(s(d.configRef))}</td>
      <td class="lbl" style="width:18%">Location:</td>
      <td class="val" style="width:32%">${esc(displayLabel)}</td>
    </tr>

    <!-- Row: Proposer / Model -->
    <tr>
      <td class="lbl">Proposer:</td>
      <td class="val">${esc(ANC_PROPOSER)}</td>
      <td class="lbl">Model:</td>
      <td class="val">${esc(s(d.model))}</td>
    </tr>

    <!-- SECTION: Overall Display Size -->
    <tr>
      <td class="lbl sec" rowspan="3">
        Overall Display Size
        <span class="note">(measured from physical pixel to physical pixel; not including cabinet)</span>
      </td>
      <td class="sub-lbl" colspan="2" style="text-align:right;font-style:italic;font-size:8px;border-bottom:none;">Fractional Units (e.g. 18.5 ft.)</td>
      <td class="val" style="border-bottom:none;"></td>
    </tr>
    <tr>
      <td class="sub-lbl">Vertical:</td>
      <td class="val num">${withUnit(esc(fN(d.actualHeightFt ?? d.specHeightFt)), "ft")}</td>
      <td class="val num">${withUnit(esc(fI(d.totalResolutionH ?? d.specResolutionH)), "pixels")}</td>
    </tr>
    <tr>
      <td class="sub-lbl">Horizontal:</td>
      <td class="val num">${withUnit(esc(fN(d.actualWidthFt ?? d.specWidthFt)), "ft")}</td>
      <td class="val num">${withUnit(esc(fI(d.totalResolutionW ?? d.specResolutionW)), "pixels")}</td>
    </tr>

    <!-- OEM LED Module -->
    <tr>
      <td class="lbl" colspan="2">OEM LED Module and Processor manufacturer(s)</td>
      <td class="val" colspan="2">${esc(s(d.manufacturer))}</td>
    </tr>

    <!-- LED Lamp Die -->
    <tr>
      <td class="lbl" colspan="2">LED Lamp Die and Packager Make and Model</td>
      <td class="val" colspan="2">${esc(s(d.ledLampModel))}</td>
    </tr>

    <!-- SECTION: Physical Display Size -->
    <tr>
      <td class="lbl sec" rowspan="2">
        Physical Display Size
        <span class="note">(including cabinet)</span>
      </td>
      <td class="sub-lbl">Vertical:</td>
      <td class="val num" colspan="2">${withUnit(esc(fN(d.actualHeightFt)), "ft")}</td>
    </tr>
    <tr>
      <td class="sub-lbl">Horizontal:</td>
      <td class="val num" colspan="2">${withUnit(esc(fN(d.actualWidthFt)), "ft")}</td>
    </tr>

    <!-- SECTION: Physical Pixel Pitch -->
    <tr>
      <td class="lbl sec" rowspan="2">
        Physical Pixel Pitch
        <span class="note">(not "lines")</span>
      </td>
      <td class="sub-lbl">Vertical/Vertical:</td>
      <td class="val num" colspan="2">${withUnit(d.pixelPitch != null ? esc(fN(d.pixelPitch, 1)) : "", "mm")}</td>
    </tr>
    <tr>
      <td class="sub-lbl">Horizontal/Horizontal:</td>
      <td class="val num" colspan="2">${withUnit(d.pixelPitch != null ? esc(fN(d.pixelPitch, 1)) : "", "mm")}</td>
    </tr>

    <!-- Physical Pixel Density -->
    <tr>
      <td class="lbl" colspan="2">Physical Pixel Density <span class="note">(not "lines")</span></td>
      <td class="val num" colspan="2">${withUnit(esc(fN(d.pixelDensityPerSqFt, 2)), "pixels/sqft")}</td>
    </tr>

    <!-- Virtual Pixel Pitch -->
    <tr>
      <td class="lbl" colspan="1">Virtual Pixel Pitch</td>
      <td class="sub-lbl" colspan="1">"claimed" pixel pitch:</td>
      <td class="val num" colspan="2">${withUnit(esc(s(d.virtualPixelPitch)), "mm")}</td>
    </tr>

    <!-- 3-in-1 SMD LED -->
    <tr>
      <td class="lbl" colspan="2">3 in 1 SMD LED or discrete lamp make and model</td>
      <td class="val" colspan="2">${esc(s(d.smdLedModel))}</td>
    </tr>

    <!-- Brightness -->
    <tr>
      <td class="lbl" colspan="2">Brightness</td>
      <td class="val num" colspan="1">${esc(fI(d.brightnessNits))}</td>
      <td class="val" style="text-align:left">${fI(d.brightnessNits) ? '<span class="u">nits</span>' : ""}</td>
    </tr>

    <!-- Brightness Level adjustment -->
    <tr>
      <td class="lbl" colspan="2">Brightness Level adjustment</td>
      <td class="val" colspan="2">${esc(s(d.brightnessAdjustment))}</td>
    </tr>

    <!-- Gradation Method -->
    <tr>
      <td class="lbl" colspan="2">Gradation Method</td>
      <td class="val" colspan="2">${esc(s(d.gradationMethod))}</td>
    </tr>

    <!-- Tonal Gradation -->
    <tr>
      <td class="lbl" colspan="2">Tonal Gradation</td>
      <td class="val" colspan="2">${esc(s(d.tonalGradation))}</td>
    </tr>

    <!-- Color Temperature -->
    <tr>
      <td class="lbl" colspan="2">Color Temperature</td>
      <td class="val num" colspan="1">${esc(s(d.colorTemperatureK))}</td>
      <td class="val" style="text-align:left">${s(d.colorTemperatureK) ? '<span class="u">°K</span>' : ""}</td>
    </tr>

    <!-- Color Temperature adjustability -->
    <tr>
      <td class="lbl" colspan="2">Color Temperature adjustability</td>
      <td class="val" colspan="2">${esc(s(d.colorTempAdjustability))}</td>
    </tr>

    <!-- Power Consumption -->
    <tr>
      <td class="lbl sec" rowspan="2">Power Consumption</td>
      <td class="sub-lbl">Avg (entire display):</td>
      <td class="val num" colspan="2">${withUnit(esc(fI(d.typicalPowerW)), "Watts")}</td>
    </tr>
    <tr>
      <td class="sub-lbl">Max (entire display):</td>
      <td class="val num" colspan="2">${withUnit(esc(fI(d.maxPowerW)), "Watts")}</td>
    </tr>

    <!-- Normal Power requirements + Ventilation -->
    <tr>
      <td class="lbl" colspan="2">
        Normal Power requirements(Voltage, Service, Ø)
        <br/><span class="note">Include any ventilation requirements for entire Display</span>
      </td>
      <td class="val" colspan="2">
        ${esc(s(d.voltageService))}
        ${s(d.ventilationRequirements) ? "<br/>" + esc(s(d.ventilationRequirements)) : ""}
      </td>
    </tr>

    <!-- Entire Display Assembly Weight (×1.25 to account for structure) -->
    <tr>
      <td class="lbl" colspan="2">Entire Display Assembly (ie; total center hung) Weight</td>
      <td class="val num" colspan="2">
        ${d.panelWeightLbs != null ? esc(fI(Math.round(d.panelWeightLbs * getRateSync("spec.weight_multiplier")))) : (d.totalWeightLbs != null ? esc(fI(Math.round(d.totalWeightLbs * getRateSync("spec.weight_multiplier")))) : "")}
        ${(d.panelWeightLbs != null || d.totalWeightLbs != null) ? '<span class="u">lbs</span>' : ""}
      </td>
    </tr>

  </table>

  <!-- Schedule Reference -->
  <div class="schedule-ref">
    <div class="schedule-title">LED DISPLAY SYSTEMS SCHEDULE OF DISPLAYS</div>
  </div>

</div>`;
}

// ---------------------------------------------------------------------------
// Full document
// ---------------------------------------------------------------------------

export function renderPerformanceStandardsHtml(
  result: FormSheetResult,
  _origin: string,
  meta?: SpecSheetProjectMeta
): string {
  const effectiveMeta: SpecSheetProjectMeta = meta || {};
  if (!effectiveMeta.venueName && !effectiveMeta.clientName) {
    effectiveMeta.venueName = result.projectName || "Project";
  }

  const pages = result.displays
    .filter((d) => {
      // Skip placeholder displays where all critical data is zero/null (e.g. Alt configs never filled in FORM)
      const hasSize = (d.actualWidthFt ?? d.specWidthFt ?? 0) !== 0 || (d.actualHeightFt ?? d.specHeightFt ?? 0) !== 0;
      const hasResolution = (d.totalResolutionW ?? d.specResolutionW ?? 0) !== 0 || (d.totalResolutionH ?? d.specResolutionH ?? 0) !== 0;
      const hasWeight = (d.totalWeightLbs ?? d.panelWeightLbs ?? 0) !== 0;
      const hasPower = (d.maxPowerW ?? d.typicalPowerW ?? 0) !== 0;
      return hasSize || hasResolution || hasWeight || hasPower;
    })
    .map((d, i) => renderDisplayForm(d, effectiveMeta, i))
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @page {
      size: 8.5in 11in;
      margin: 0.6in 0.5in 0.5in 0.5in;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 10px;
      line-height: 1.35;
      color: #000;
    }

    .form-page {
      width: 100%;
    }

    /* --- Project Header --- */
    .proj-header {
      margin-bottom: 14px;
    }
    .proj-name {
      font-size: 13px;
      font-weight: bold;
    }
    .proj-client {
      font-size: 11px;
      font-weight: normal;
    }
    .proj-addr {
      font-size: 10px;
      font-weight: normal;
      color: #333;
    }

    /* --- Form Title --- */
    .form-title {
      font-size: 12px;
      font-weight: bold;
      text-align: left;
      padding-bottom: 4px;
      border-bottom: 2px solid #000;
      margin-bottom: 8px;
      letter-spacing: 0.3px;
    }

    /* --- Display ID --- */
    .display-id {
      margin-bottom: 6px;
    }
    .display-tag {
      font-weight: bold;
      font-size: 11px;
      margin-right: 12px;
    }
    .display-label {
      font-size: 11px;
      font-weight: bold;
    }

    /* --- Main Form Table --- */
    .pf {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
      table-layout: fixed;
    }
    .pf td {
      border: 1px solid #888;
      padding: 3px 6px;
      font-size: 9.5px;
      vertical-align: middle;
    }

    /* Label cells */
    .lbl {
      font-weight: normal;
      background: transparent;
      vertical-align: middle;
    }
    .lbl.sec {
      vertical-align: top;
      padding-top: 5px;
    }

    /* Sub-label (Vertical:/Horizontal:) */
    .sub-lbl {
      font-size: 9px;
      color: #333;
      text-align: right;
      padding-right: 8px;
    }

    /* Value cells */
    .val {
      background: transparent;
      min-height: 16px;
    }
    .val.num {
      text-align: right;
      padding-right: 8px;
      font-weight: bold;
    }

    /* Unit labels */
    .u {
      font-weight: normal;
      font-size: 8px;
      color: #444;
      margin-left: 3px;
    }

    /* Notes / hints */
    .note {
      font-weight: normal;
      font-style: italic;
      font-size: 8px;
      color: #555;
    }

    /* Empty value cells show a thin underline */
    .val:empty::after {
      content: "";
      display: block;
      border-bottom: 1px solid #ccc;
      width: 80%;
      margin: 6px auto 2px auto;
    }

    /* --- Schedule Reference --- */
    .schedule-ref {
      margin-top: 20px;
      padding-top: 4px;
      border-top: 2px solid #000;
    }
    .schedule-title {
      font-size: 11px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
${pages}
</body>
</html>`;
}
