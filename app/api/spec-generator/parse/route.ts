/**
 * POST /api/spec-generator/parse
 *
 * Accepts two Excel files (template + cost analysis), parses them,
 * matches products from the database, auto-fills spec fields, and
 * returns filled display data ready for WorkbookShell preview.
 */

import { NextRequest, NextResponse } from "next/server";
import * as xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";
import { parseCostAnalysis, type CostAnalysisDisplay } from "@/services/specsheet/costAnalysisParser";
import { generateFingerprint } from "@/services/import/excelNormalizer";
import { preloadRateCard, getRateSync } from "@/services/rfp/rateCardLoader";
import { extractText } from "@/services/kreuzberg/kreuzbergClient";
import { analyzeTemplateWithAI, mergeWithRegexFallback, type AIFieldMapping } from "@/services/specsheet/aiTemplateAnalyzer";

const prisma = new PrismaClient();

// ─── Vendor PDF specs mapping ───────────────────────────────────────────────

/** Vendor specs keyed by fieldKey, extracted from vendor PDF */
export type VendorSpecsMap = Record<string, string | number>;

/**
 * Map VendorExtractedSpec (from /api/vendor/parse) to our spec fieldKeys.
 */
function mapVendorSpecs(raw: any): VendorSpecsMap {
  const mapped: VendorSpecsMap = {};
  if (!raw) return mapped;

  if (raw.maxNits) mapped.maxBrightness = raw.maxNits;
  if (raw.refreshRate) mapped.refreshRate = String(raw.refreshRate);
  if (raw.ipRating) mapped.ipRating = raw.ipRating;
  if (raw.resolutionW) mapped.vendorResolutionW = raw.resolutionW;
  if (raw.resolutionH) mapped.vendorResolutionH = raw.resolutionH;

  // Weight — convert to per-cabinet if available
  if (raw.weightKgPerCabinet) mapped.vendorWeightKgPerCab = raw.weightKgPerCabinet;

  // Power
  if (raw.maxPowerWPerCabinet) mapped.vendorMaxPowerWPerCab = raw.maxPowerWPerCabinet;
  if (raw.typicalPowerWPerCabinet) mapped.vendorTypPowerWPerCab = raw.typicalPowerWPerCabinet;

  // Cabinet dimensions
  if (raw.cabinetWidthMm) mapped.vendorCabWidthMm = raw.cabinetWidthMm;
  if (raw.cabinetHeightMm) mapped.vendorCabHeightMm = raw.cabinetHeightMm;

  // Environment
  if (raw.environment) mapped.vendorEnvironment = raw.environment;

  return mapped;
}

// ─── SpecFieldMemory recall helper ──────────────────────────────────────────

async function recallSpecMemory(
  manufacturer: string,
  model: string,
  pitchMm: number,
): Promise<Record<string, string>> {
  try {
    const records = await prisma.specFieldMemory.findMany({
      where: {
        manufacturer: { equals: manufacturer, mode: "insensitive" },
        model: { equals: model, mode: "insensitive" },
        pitchMm: { in: [pitchMm, 0] }, // 0 = applies to all pitches
      },
    });
    const map: Record<string, string> = {};
    for (const r of records) {
      map[r.fieldKey] = r.fieldValue;
    }
    return map;
  } catch {
    return {};
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateField {
  type: "section" | "field" | "separator";
  label: string;
  fieldKey: string | null;
  rowIndex: number;
  /** 0-based column index where values should be written (auto-detected) */
  valueCol: number;
}

export interface FilledDisplay {
  shortId: string;
  fullName: string;
  location: string;
  vendor: string;
  model: string;
  pixelPitch: number;
  heightFt: number;
  widthFt: number;
  pixelsH: number;
  pixelsW: number;
  sqFt: number;
  nitRequirement: number;
  serviceType: string;
  isOutdoor: boolean;
  isAlternate: boolean;
  quantity: number;
  matchStatus: "exact" | "close" | "defaults";
  matchedProductName: string | null;

  // All spec fields (fieldKey → value)
  specs: Record<string, string | number>;

  // Fields that couldn't be filled (still "—")
  unknownFields: string[];

  // Calculated values
  cabinetCount: number;
  powerAt0_KW: number;
  powerAvg_KW: number;
  powerAt100_KW: number;
  btuAt0: number;
  btuAvg: number;
  btuAt100: number;
  totalWeightLbs: number;
  pixelDensity: number;
}

interface ParseResponse {
  displays: FilledDisplay[];
  templateFields: TemplateField[];
  stats: {
    total: number;
    matched: number;
    defaults: number;
    warnings: string[];
  };
  projectName: string;
  /** Name of the first sheet in the template (used for cloning) */
  sheetName: string;
  /** Template profile info if fingerprint was recognized */
  templateProfile?: { id: string; name: string; usageCount: number } | null;
}

// ─── Template parser ────────────────────────────────────────────────────────

// Field key patterns — maps template row labels to spec field keys.
// Similar to LABEL_MAP in formSheetParser but oriented for Product Data Forms.
const FIELD_KEY_PATTERNS: [RegExp, string][] = [
  [/respondent/i, "respondent"],
  [/display\s*name/i, "displayName"],
  [/display\s*location|location.*display/i, "displayLocation"],
  [/^manufactur/i, "manufacturer"],
  [/^model\b/i, "model"],
  [/base\s*or\s*alternate|bid\s*type|base\s*proposal/i, "bidType"],
  [/spec\.\s*led\s*type|led\s*type/i, "ledType"],
  [/physical\s*pixel\s*(pitch|spacing)/i, "pixelPitch"],
  [/virtual.*pixel\s*pitch|claimed.*pixel/i, "virtualPixelPitch"],
  [/indoor.*outdoor|outdoor.*indoor/i, "indoorOutdoor"],
  [/panel\s*res.*w/i, "panelResolutionW"],
  [/panel\s*res.*h/i, "panelResolutionH"],
  // Active display size (AJP/WJHW: "OVERALL ACTIVE DISPLAY SIZE...NOT INCLUDING BORDERS")
  [/active\s*display\s*size|not\s*including\s*borders/i, "activeDisplaySize"],
  [/spec.*width|display\s*width|width.*ft/i, "specWidthFt"],
  [/spec.*height|display\s*height|height.*ft/i, "specHeightFt"],
  // Physical size with borders (AJP/WJHW: "PHYSICAL DISPLAY SIZE (INCLUDING BORDERS AND/OR SHROUDING)")
  [/physical.*display.*size.*(?:incl|border|shroud)/i, "physicalSizeWithBorders"],
  [/physical.*size.*width.*border/i, "physicalWidthWithBorder"],
  [/physical.*size.*height.*border/i, "physicalHeightWithBorder"],
  [/actual.*width/i, "actualWidthFt"],
  [/actual.*height/i, "actualHeightFt"],
  [/total\s*res.*w/i, "totalResolutionW"],
  [/total\s*res.*h/i, "totalResolutionH"],
  [/area\s*per\s*screen|sq.*ft/i, "areaSqFt"],
  [/number\s*of\s*screen|qty|quantity/i, "numberOfScreens"],
  [/pixel\s*density/i, "pixelDensity"],
  // Viewing angle — generic catch for AJP/WJHW "VIEWING ANGLE (AT 50% BRIGHTNESS...)"
  [/horizontal\s*view|viewing.*horiz/i, "viewingAngleH"],
  [/vertical\s*up|viewing.*up/i, "viewingAngleUp"],
  [/vertical\s*down|viewing.*down/i, "viewingAngleDown"],
  [/viewing\s*angle/i, "viewingAngleH"],
  [/pixel\s*fill\s*factor/i, "pixelFillFactor"],
  [/%\s*open\s*area|transparent\s*display/i, "openArea"],
  [/oem\s*led\s*module\s*mfr|led\s*module\s*manu/i, "oemLedModuleMfr"],
  [/oem\s*processor\s*mfr|processor\s*manu/i, "oemProcessorMfr"],
  [/factory\s*produc|(?:led\s*)?factory|country.*origin|place.*manu/i, "factory"],
  [/led\s*lamp\s*type|lamp\s*type|die.*package/i, "ledLampType"],
  [/max.*brightness|brightness.*nit/i, "maxBrightness"],
  [/post.*calibrat.*brightness|uniform.*brightness/i, "postCalibrationBrightness"],
  [/brightness.*level.*adj|brightness.*adj/i, "brightnessAdjustment"],
  [/native\s*color\s*temp/i, "nativeColorTemperature"],
  [/color\s*temp.*k|color\s*temp.*kelvin/i, "colorTemperatureK"],
  [/color\s*temp.*adj/i, "colorTempAdjustability"],
  // Color space — AJP/WJHW uses "INCLUSION RATIO (%) OF COLOR SPACE REPRODUCIBLE..."
  [/inclusion\s*ratio.*color\s*space|color\s*space.*reproducib/i, "colorSpaceRec709"],
  [/rec\s*709|color\s*space.*709/i, "colorSpaceRec709"],
  [/dci.*p3|color\s*space.*p3/i, "colorSpaceDciP3"],
  [/rec\s*2020|color\s*space.*2020/i, "colorSpaceRec2020"],
  // Power — AJP/WJHW uses "POWER CONSUMPTION AND ANTICIPATED HEAT LOAD...FULL WHITE IMAGE"
  [/power.*consumption.*heat\s*load|anticipated\s*heat/i, "powerAt100"],
  [/power.*0\s*%|power.*black|power.*idle/i, "powerAt0"],
  [/power.*avg|power.*average|power.*typical/i, "powerAvg"],
  [/power.*100\s*%|power.*full|power.*max|power.*white/i, "powerAt100"],
  [/btu.*0\s*%|btu.*black|btu.*idle/i, "btuAt0"],
  [/btu.*avg|btu.*average|btu.*typical/i, "btuAvg"],
  [/btu.*100\s*%|btu.*full|btu.*max|btu.*white/i, "btuAt100"],
  [/power\s*req|voltage.*phase|electrical\s*req/i, "powerRequirements"],
  [/total\s*display\s*assembly\s*weight/i, "totalWeight"],
  [/total\s*(?:display\s*)?weight|weight.*total|weight.*lbs/i, "totalWeight"],
  [/smd\s*led\s*model|led\s*model/i, "smdLedModel"],
  [/gradation\s*method/i, "gradationMethod"],
  [/tonal\s*gradation/i, "tonalGradation"],
  [/ventilation|cooling/i, "ventilationRequirements"],
  [/refresh\s*rate/i, "refreshRate"],
  [/contrast\s*ratio/i, "contrastRatio"],
  [/ip\s*rat|ingress\s*protect/i, "ipRating"],
  [/service\s*access|front.*rear.*service/i, "serviceAccess"],
];

/**
 * Sub-label patterns for multi-row fields (column F labels in AJP/WJHW templates).
 * These appear on rows where column A is empty — the label is in col F instead.
 */
const SUB_LABEL_PATTERNS: [RegExp, string][] = [
  // Display size sub-rows
  [/^vertical\s*:?\s*$/i, "specHeightFt"],
  [/^horizontal\s*:?\s*$/i, "specWidthFt"],
  // Pixel spacing sub-rows
  [/vertical\s*to\s*vertical/i, "pixelPitchV"],
  [/horizontal\s*to\s*horizontal/i, "pixelPitchH"],
  // Viewing angle sub-rows
  [/vertical\s*\(?\s*up\s*\)?/i, "viewingAngleUp"],
  [/vertical\s*\(?\s*down\s*\)?/i, "viewingAngleDown"],
  // Color space sub-rows
  [/rec\s*709|of\s*rec\s*709/i, "colorSpaceRec709"],
  [/dci.?p3|of\s*dci/i, "colorSpaceDciP3"],
  [/rec\s*2020|of\s*rec\s*2020/i, "colorSpaceRec2020"],
  // Power sub-rows
  [/at\s*0\s*%|black\s*screen/i, "powerAt0"],
  [/avg|typ.*content/i, "powerAvg"],
  [/at\s*100\s*%|white\s*screen/i, "powerAt100"],
];

/**
 * Detect the value column for a row using merge information.
 * In multi-column templates (AJP/WJHW), labels merge A:E and values go in F:J.
 */
function detectValueCol(
  rowIndex: number,
  row: any[],
  merges: any[],
): number {
  // Check if column A is part of a wide merge (A:E pattern)
  const rowMerge = merges.find(
    (m: any) => m.s.r === rowIndex && m.s.c === 0 && m.e.c >= 3
  );
  if (rowMerge) {
    // Label spans A:E (or wider), value starts after the merge
    const valueStart = rowMerge.e.c + 1;
    // Find first empty cell from valueStart onward
    for (let c = valueStart; c < Math.max(row.length, valueStart + 3); c++) {
      const cellVal = String(row[c] || "").trim();
      if (!cellVal || /^(enter|n\/a|tbd|—|-)$/i.test(cellVal)) {
        return c;
      }
    }
    return valueStart;
  }

  // Simple 2-column layout: scan from col B for first empty cell
  for (let c = 1; c < Math.max(row.length, 5); c++) {
    const cellVal = String(row[c] || "").trim();
    if (!cellVal || /^(enter|n\/a|tbd|—|-)$/i.test(cellVal)) {
      return c;
    }
  }
  return 1;
}

async function parseTemplate(buffer: Buffer): Promise<{ fields: TemplateField[]; sheetName: string }> {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  const merges = sheet["!merges"] || [];

  // ── Try AI analysis first ──
  try {
    const aiResult = await analyzeTemplateWithAI(data, merges);
    if (aiResult && aiResult.confidence >= 0.4) {
      // Run regex as backup, then merge
      const regexFields = parseTemplateWithRegex(data, merges);
      const merged = mergeWithRegexFallback(aiResult.fields, regexFields);
      const fields: TemplateField[] = merged.map(f => ({
        type: f.type,
        label: f.label,
        fieldKey: f.fieldKey,
        rowIndex: f.rowIndex,
        valueCol: f.valueCol,
      }));
      console.log(`[SPEC GEN] AI template analysis: ${aiResult.templateType}, ${fields.length} fields, ${(aiResult.confidence * 100).toFixed(0)}% confidence`);
      return { fields, sheetName };
    }
  } catch (err: any) {
    console.warn(`[SPEC GEN] AI template analysis failed, using regex: ${err.message}`);
  }

  // ── Fallback: regex-based parsing ──
  const fields: TemplateField[] = parseTemplateWithRegex(data, merges);
  return { fields, sheetName };
}

/**
 * Regex-based template parser (original logic, used as fallback when AI is unavailable).
 */
function parseTemplateWithRegex(data: any[][], merges: any[]): TemplateField[] {
  const fields: TemplateField[] = [];

  // Detect if this is a multi-column template (AJP/WJHW style: merges spanning A:E)
  const hasWideLabels = merges.some(
    (m: any) => m.s.c === 0 && m.e.c >= 3 && m.e.r === m.s.r
  );

  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const cellA = String(row[0] || "").trim();

    // ── Sub-row detection: col A empty but col F (or B-F) has a sub-label ──
    if (!cellA) {
      // In multi-column templates, check cols 1-6 for sub-labels
      let subLabel = "";
      let subCol = -1;
      for (let c = 1; c <= 6 && c < row.length; c++) {
        const v = String(row[c] || "").trim();
        if (v && v.length >= 3 && !/^[A-Z]{1,2}$/.test(v) && !/^(FT|PX|MM|DEG|KW|BTU|NITS|%)$/i.test(v)) {
          subLabel = v;
          subCol = c;
          break;
        }
      }

      if (subLabel) {
        // Try to match sub-label to a field key
        let fieldKey: string | null = null;
        for (const [pattern, key] of SUB_LABEL_PATTERNS) {
          if (pattern.test(subLabel)) {
            fieldKey = key;
            break;
          }
        }
        if (!fieldKey) {
          // Also try main patterns
          for (const [pattern, key] of FIELD_KEY_PATTERNS) {
            if (pattern.test(subLabel)) {
              fieldKey = key;
              break;
            }
          }
        }

        if (fieldKey) {
          // Find value column: first empty/placeholder cell after the sub-label
          let valueCol = subCol + 1;
          for (let c = subCol + 1; c < Math.max(row.length, subCol + 5); c++) {
            const v = String(row[c] || "").trim();
            if (!v || /^(enter|n\/a|tbd|—|-)$/i.test(v)) {
              valueCol = c;
              break;
            }
          }
          fields.push({ type: "field", label: subLabel, fieldKey, rowIndex: i, valueCol });
          continue;
        }
      }

      fields.push({ type: "separator", label: "", fieldKey: null, rowIndex: i, valueCol: 1 });
      continue;
    }

    // ── Section header detection ──
    const isFullRowMerge = merges.some(
      (m: any) => m.s.r === i && m.s.c === 0 && m.e.c >= 8
    );
    const isAllCaps = cellA === cellA.toUpperCase() && cellA.length > 3 && /^[A-Z\s\-&\/()]+$/.test(cellA);

    if (isFullRowMerge || isAllCaps) {
      const matchesField = FIELD_KEY_PATTERNS.some(([pattern]) => pattern.test(cellA));
      if (!matchesField) {
        fields.push({ type: "section", label: cellA, fieldKey: null, rowIndex: i, valueCol: 1 });
        continue;
      }
    }

    // ── Main field row ──
    const valueCol = detectValueCol(i, row, merges);

    // Match label to field key
    let fieldKey: string | null = null;
    for (const [pattern, key] of FIELD_KEY_PATTERNS) {
      if (pattern.test(cellA)) {
        fieldKey = key;
        break;
      }
    }

    fields.push({ type: "field", label: cellA, fieldKey, rowIndex: i, valueCol });

    // ── Dual-field rows: check if col F also has a label (e.g., "MODEL:", "DISPLAY LOCATION:") ──
    if (hasWideLabels) {
      const colF = String(row[5] || "").trim();
      if (colF && colF.length >= 3 && /[a-zA-Z]/.test(colF)) {
        let subFieldKey: string | null = null;
        for (const [pattern, key] of FIELD_KEY_PATTERNS) {
          if (pattern.test(colF) && key !== fieldKey) {
            subFieldKey = key;
            break;
          }
        }
        // Also check sub-label patterns
        if (!subFieldKey) {
          for (const [pattern, key] of SUB_LABEL_PATTERNS) {
            if (pattern.test(colF)) {
              subFieldKey = key;
              break;
            }
          }
        }
        if (subFieldKey) {
          // Value for the dual field is in col G onward
          let dualValueCol = 6;
          for (let c = 6; c < Math.max(row.length, 10); c++) {
            const v = String(row[c] || "").trim();
            if (!v || /^(enter|n\/a|tbd|—|-)$/i.test(v)) {
              dualValueCol = c;
              break;
            }
          }
          fields.push({ type: "field", label: colF, fieldKey: subFieldKey, rowIndex: i, valueCol: dualValueCol });
        }
      }
    }
  }

  return fields;
}

/**
 * Parse a template from extracted text (PDF or Word).
 * Splits text into lines and matches against the same FIELD_KEY_PATTERNS.
 * Since there's no Excel structure, valueCol is always 1 (col B in generated output).
 */
function parseTemplateFromText(text: string): { fields: TemplateField[]; sheetName: string } {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const fields: TemplateField[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip very short lines or lines that are just numbers/punctuation
    if (line.length < 3) continue;
    if (/^[\d\s.,;:$%\-—]+$/.test(line)) continue;

    // Check if this is a section header (all caps, no colon/value separator)
    const isAllCaps = line === line.toUpperCase() && line.length > 5 && /^[A-Z\s\-&\/()]+$/.test(line);
    if (isAllCaps) {
      fields.push({ type: "section", label: line, fieldKey: null, rowIndex: i, valueCol: 1 });
      continue;
    }

    // Strip trailing colon/dash for matching
    const labelPart = line.replace(/[:;\-—]\s*$/, "").trim();
    if (!labelPart || labelPart.length < 3) continue;

    // Try to match to a field key
    let fieldKey: string | null = null;
    for (const [pattern, key] of FIELD_KEY_PATTERNS) {
      if (pattern.test(labelPart) && !seenKeys.has(key)) {
        fieldKey = key;
        seenKeys.add(key);
        break;
      }
    }

    // Only add if it looks like a form label (matched a key, or has certain characteristics)
    if (fieldKey || /[:?]\s*$/.test(line) || /\b(display|pixel|power|weight|brightness|color|resolution|manufacturer|model)\b/i.test(line)) {
      fields.push({ type: "field", label: labelPart, fieldKey, rowIndex: i, valueCol: 1 });
    }
  }

  return { fields, sheetName: "Product Data Form" };
}

// ─── Product matching from DB ───────────────────────────────────────────────

interface MatchedProduct {
  manufacturer: string;
  modelNumber: string;
  displayName: string;
  pixelPitch: number;
  cabinetWidthMm: number;
  cabinetHeightMm: number;
  weightKgPerCabinet: number;
  maxNits: number;
  maxPowerWattsPerCab: number;
  typicalPowerWattsPerCab: number | null;
  environment: string;
  serviceType: string;
  extendedSpecs: any;
  matchType: "exact" | "close";
}

async function matchProductFromDB(
  vendor: string,
  model: string,
  pitch: number,
  isOutdoor: boolean,
): Promise<MatchedProduct | null> {
  const normalizedVendor = vendor.trim().toLowerCase();

  // Pass 1: exact model match
  if (model) {
    const exact = await prisma.manufacturerProduct.findFirst({
      where: {
        OR: [
          { modelNumber: { equals: model, mode: "insensitive" } },
          { displayName: { contains: model, mode: "insensitive" } },
        ],
      },
    });
    if (exact) {
      return {
        manufacturer: exact.manufacturer,
        modelNumber: exact.modelNumber,
        displayName: exact.displayName,
        pixelPitch: exact.pixelPitch,
        cabinetWidthMm: exact.cabinetWidthMm,
        cabinetHeightMm: exact.cabinetHeightMm,
        weightKgPerCabinet: exact.weightKgPerCabinet,
        maxNits: exact.maxNits,
        maxPowerWattsPerCab: exact.maxPowerWattsPerCab,
        typicalPowerWattsPerCab: exact.typicalPowerWattsPerCab,
        environment: exact.environment,
        serviceType: exact.serviceType ?? "",
        extendedSpecs: exact.extendedSpecs,
        matchType: "exact",
      };
    }
  }

  // Pass 2: vendor + closest pitch match
  if (normalizedVendor && pitch > 0) {
    const sameVendor = await prisma.manufacturerProduct.findMany({
      where: {
        manufacturer: { equals: vendor, mode: "insensitive" },
        isActive: true,
      },
    });

    if (sameVendor.length > 0) {
      // Find closest pitch within 2mm
      const sorted = sameVendor.sort(
        (a, b) => Math.abs(a.pixelPitch - pitch) - Math.abs(b.pixelPitch - pitch)
      );
      const closest = sorted[0];
      if (Math.abs(closest.pixelPitch - pitch) <= 2) {
        return {
          manufacturer: closest.manufacturer,
          modelNumber: closest.modelNumber,
          displayName: closest.displayName,
          pixelPitch: closest.pixelPitch,
          cabinetWidthMm: closest.cabinetWidthMm,
          cabinetHeightMm: closest.cabinetHeightMm,
          weightKgPerCabinet: closest.weightKgPerCabinet,
          maxNits: closest.maxNits,
          maxPowerWattsPerCab: closest.maxPowerWattsPerCab,
          typicalPowerWattsPerCab: closest.typicalPowerWattsPerCab,
          environment: closest.environment,
          serviceType: closest.serviceType ?? "",
          extendedSpecs: closest.extendedSpecs,
          matchType: "close",
        };
      }
    }
  }

  return null;
}

// ─── Spec defaults ──────────────────────────────────────────────────────────

function getDefaults(isOutdoor: boolean, vendor: string) {
  const isLG = /\blg\b/i.test(vendor);

  // Viewing angles from rate card
  const viewH = isOutdoor
    ? String(getRateSync("spec.viewing_angle.outdoor_h"))
    : String(getRateSync("spec.viewing_angle.indoor_h"));
  const viewUp = isOutdoor
    ? String(getRateSync("spec.viewing_angle.outdoor_v_up"))
    : String(getRateSync("spec.viewing_angle.indoor_v"));
  const viewDown = isOutdoor
    ? String(getRateSync("spec.viewing_angle.outdoor_v_down"))
    : String(getRateSync("spec.viewing_angle.indoor_v"));

  // Color space from rate card
  const tol = getRateSync("spec.color_space.tolerance");
  const rec709 = getRateSync("spec.color_space.rec709");
  const dciP3 = getRateSync("spec.color_space.dci_p3");
  const rec2020 = getRateSync("spec.color_space.rec2020");

  // Color temp from rate card
  const tMin = getRateSync("spec.color_temp.min");
  const tMax = getRateSync("spec.color_temp.max");
  const colorTempRange = `${tMin.toLocaleString()}K–${tMax.toLocaleString()}K`;

  return {
    oemLedModuleMfr: vendor || "—",
    oemProcessorMfr: isLG ? "Novastar" : "—",
    factory: isLG ? "LG Electronics, South Korea" : `${vendor || "Unknown"}, China`,
    ledLampType: isOutdoor
      ? "SMD (Surface-Mount Device) — IP65 Rated Package"
      : "SMD (Surface-Mount Device) — Single SMD Package",
    viewingAngleH: viewH,
    viewingAngleUp: viewUp,
    viewingAngleDown: viewDown,
    brightnessAdjustment: "0–100% (256 steps)",
    colorTemperatureK: colorTempRange,
    colorTempAdjustability: colorTempRange,
    pixelFillFactor: `${getRateSync("spec.pixel_fill_factor")}%`,
    colorSpaceRec709: `${rec709} (+/- ${tol}%)`,
    colorSpaceDciP3: `${dciP3} (+/- ${tol}%)`,
    colorSpaceRec2020: `${rec2020} (+/- ${tol}%)`,
    powerRequirements: "AC 100–240V, 50/60Hz, Single Phase",
    gradationMethod: "16-bit",
    tonalGradation: "281 trillion colors",
    ventilationRequirements: isOutdoor ? "Forced air cooling (IP66 rated)" : "Fanless convection cooling",
    smdLedModel: "—",
  };
}

// ─── LG spec database (from KB) ────────────────────────────────────────────

// LG LSCC data from official spec sheets (LGE-466 PDF pages 24-26)
const LG_SPECS: Record<string, Record<string, string | number>> = {
  // Standard cabinets — 600×337.5mm, 5.0kg
  LSCC012: {
    oemProcessorMfr: "Novastar",
    factory: "LG Electronics, South Korea",
    ledLampType: "Single SMD",
    viewingAngleH: "160", viewingAngleUp: "160", viewingAngleDown: "160",
    maxBrightness: 800,
    colorTemperatureK: "3,200K–9,300K",
    cabinetWidthMm: 600, cabinetHeightMm: 337.5,
    maxPowerWPerCab: 112, avgPowerWPerCab: 37,
    maxBtuPerCab: 382, avgBtuPerCab: 127,
    weightKgPerCab: 5.0,
    cabinetResW: 480, cabinetResH: 270,
    ipRating: "IP30", serviceAccess: "Front",
    contrastRatio: "5,000:1", refreshRate: "3,840",
    processingDepth: "14-bit (HDR10, HDR10 Pro)",
  },
  LSCC015: {
    oemProcessorMfr: "Novastar",
    factory: "LG Electronics, South Korea",
    ledLampType: "Single SMD",
    viewingAngleH: "160", viewingAngleUp: "160", viewingAngleDown: "160",
    maxBrightness: 800,
    colorTemperatureK: "3,200K–9,300K",
    cabinetWidthMm: 600, cabinetHeightMm: 337.5,
    maxPowerWPerCab: 112, avgPowerWPerCab: 37,
    maxBtuPerCab: 382, avgBtuPerCab: 127,
    weightKgPerCab: 5.0,
    cabinetResW: 384, cabinetResH: 216,
    ipRating: "IP30", serviceAccess: "Front",
    contrastRatio: "5,000:1", refreshRate: "3,840",
    processingDepth: "14-bit (HDR10, HDR10 Pro)",
  },
  LSCC018: {
    oemProcessorMfr: "Novastar",
    factory: "LG Electronics, South Korea",
    ledLampType: "Single SMD",
    viewingAngleH: "160", viewingAngleUp: "160", viewingAngleDown: "160",
    maxBrightness: 800,
    colorTemperatureK: "3,200K–9,300K",
    cabinetWidthMm: 600, cabinetHeightMm: 337.5,
    maxPowerWPerCab: 96, avgPowerWPerCab: 32,
    maxBtuPerCab: 328, avgBtuPerCab: 109,
    weightKgPerCab: 5.0,
    cabinetResW: 320, cabinetResH: 180,
    ipRating: "IP30", serviceAccess: "Front",
    contrastRatio: "5,000:1", refreshRate: "3,840",
    processingDepth: "14-bit (HDR10, HDR10 Pro)",
  },
  LSCC025: {
    oemProcessorMfr: "Novastar",
    factory: "LG Electronics, South Korea",
    ledLampType: "Single SMD",
    viewingAngleH: "160", viewingAngleUp: "160", viewingAngleDown: "160",
    maxBrightness: 800,
    colorTemperatureK: "3,200K–9,300K",
    cabinetWidthMm: 600, cabinetHeightMm: 337.5,
    maxPowerWPerCab: 84, avgPowerWPerCab: 28,
    maxBtuPerCab: 287, avgBtuPerCab: 96,
    weightKgPerCab: 5.0,
    cabinetResW: 240, cabinetResH: 135,
    ipRating: "IP30", serviceAccess: "Front",
    contrastRatio: "5,000:1", refreshRate: "3,840",
    processingDepth: "14-bit (HDR10, HDR10 Pro)",
  },
  // Outdoor series
  GSQA039: {
    oemProcessorMfr: "Novastar",
    factory: "LG Electronics, South Korea",
    ledLampType: "SMD (Surface-Mount Device) — IP30 Rated Package",
    viewingAngleH: "160", viewingAngleUp: "80", viewingAngleDown: "80",
    maxBrightness: 7500,
    colorTemperatureK: "3,200K–9,300K",
  },
  GSQA083: {
    oemProcessorMfr: "Novastar",
    factory: "LG Electronics, South Korea",
    ledLampType: "SMD (Surface-Mount Device) — IP65 Rated Package",
    viewingAngleH: "140", viewingAngleUp: "70", viewingAngleDown: "70",
    maxBrightness: 8000,
    colorTemperatureK: "3,200K–9,300K",
  },
};

function lookupLgSpecs(model: string): Record<string, string | number> | null {
  const normalized = model.replace(/[-\s]/g, "").toUpperCase();
  for (const [key, specs] of Object.entries(LG_SPECS)) {
    if (normalized.includes(key)) return specs;
  }
  return null;
}

// ─── Fill a single display ──────────────────────────────────────────────────

async function fillDisplay(
  display: CostAnalysisDisplay,
  templateFields: TemplateField[],
  warnings: string[],
  vendorSpecs?: VendorSpecsMap | null,
): Promise<FilledDisplay> {
  // Match product from database
  const dbMatch = await matchProductFromDB(
    display.vendor, display.model, display.pixelPitch, display.isOutdoor
  );

  // Look up LG specs from KB
  const lgSpecs = /\blg\b/i.test(display.vendor) ? lookupLgSpecs(display.model) : null;

  // Recall spec memory (user-verified values from previous projects)
  const memory = await recallSpecMemory(
    display.vendor || dbMatch?.manufacturer || "",
    display.model || dbMatch?.modelNumber || "",
    display.pixelPitch,
  );

  // LSCC018 correction: cost analysis often says 1.9mm, actual is 1.875mm
  let correctedPitch = display.pixelPitch;
  if (/LSCC018/i.test(display.model) && Math.abs(display.pixelPitch - 1.9) < 0.1) {
    correctedPitch = 1.875;
  }

  // Warn about missing critical data
  if (!display.vendor) warnings.push(`${display.shortId}: No vendor/manufacturer found`);
  if (!display.model) warnings.push(`${display.shortId}: No product model found`);
  if (!display.widthFt || !display.heightFt) warnings.push(`${display.shortId}: Missing display dimensions`);
  if (!display.pixelPitch) warnings.push(`${display.shortId}: No pixel pitch detected`);

  // Mapped vendor PDF specs (for cabinet fallback)
  const vpsMapped = vendorSpecs || {};

  // Get cabinet specs for calculations — DB > vendor PDF > rate card defaults
  const cabWidthMm = dbMatch?.cabinetWidthMm ?? (vpsMapped.vendorCabWidthMm as number | undefined) ?? (display.isOutdoor ? getRateSync("spec.cabinet.outdoor_width_mm") : getRateSync("spec.cabinet.indoor_width_mm"));
  const cabHeightMm = dbMatch?.cabinetHeightMm ?? (vpsMapped.vendorCabHeightMm as number | undefined) ?? (display.isOutdoor ? getRateSync("spec.cabinet.outdoor_height_mm") : getRateSync("spec.cabinet.indoor_height_mm"));
  const maxWPerCab = dbMatch?.maxPowerWattsPerCab ?? (vpsMapped.vendorMaxPowerWPerCab as number | undefined) ?? (display.isOutdoor ? getRateSync("spec.cabinet.outdoor_max_power_w") : getRateSync("spec.cabinet.indoor_max_power_w"));
  const avgWPerCab = dbMatch?.typicalPowerWattsPerCab ?? (vpsMapped.vendorTypPowerWPerCab as number | undefined) ?? maxWPerCab * getRateSync("spec.power_avg_ratio");
  const kgPerCab = dbMatch?.weightKgPerCabinet ?? (vpsMapped.vendorWeightKgPerCab as number | undefined) ?? (display.isOutdoor ? getRateSync("spec.cabinet.outdoor_weight_kg") : getRateSync("spec.cabinet.indoor_weight_kg"));

  if (!dbMatch) {
    warnings.push(`${display.shortId}: No product match in catalog — using estimated cabinet defaults for power/weight`);
  }

  // Calculate cabinet count
  const cabAreaM2 = (cabWidthMm * cabHeightMm) / 1_000_000;
  const displayAreaM2 = display.sqFt * 0.0929;
  const cabinetCount = cabAreaM2 > 0 && displayAreaM2 > 0 ? Math.ceil(displayAreaM2 / cabAreaM2) : 0;

  if (cabinetCount === 0 && display.sqFt > 0) {
    warnings.push(`${display.shortId}: Cabinet count calculated as 0 — power/weight values will be zero`);
  }

  // Power calculations
  const powerAt100_KW = (maxWPerCab * cabinetCount) / 1000;
  const powerAvg_KW = (avgWPerCab * cabinetCount) / 1000;
  const powerAt0_KW = powerAt100_KW * getRateSync("spec.power_idle_ratio");
  const btuAt0 = Math.round(powerAt0_KW * 3412);
  const btuAvg = Math.round(powerAvg_KW * 3412);
  const btuAt100 = Math.round(powerAt100_KW * 3412);
  // Weight × multiplier per Natalia/Jeremy — includes internal structure, cabling, electronics
  const totalWeightLbs = Math.round(kgPerCab * 2.205 * cabinetCount * getRateSync("spec.weight_multiplier"));

  // Pixel density
  const pixelDensity = display.sqFt > 0
    ? Math.round((display.pixelsH * display.pixelsW) / display.sqFt)
    : 0;

  // Border allowance — per Natalia/Jeremy: physical size with borders = active size (no extra border)
  const borderAllowance = 0;

  // Get defaults
  const defaults = getDefaults(display.isOutdoor, display.vendor);
  const ext = dbMatch?.extendedSpecs as Record<string, any> || {};

  // Mapped vendor PDF specs (if provided)
  const vps = vendorSpecs || {};

  // Priority chain: memory > extendedSpecs > LG KB > vendorPdfSpecs > defaults
  // Helper to resolve a spec value through the priority chain
  const resolve = (fieldKey: string, ...sources: (string | number | undefined | null)[]): string | number => {
    // Memory first (user-verified from previous projects)
    if (memory[fieldKey]) return memory[fieldKey];
    // Then try each source in order
    for (const src of sources) {
      if (src != null && src !== "" && src !== "—") return src;
    }
    // Vendor PDF specs as second-to-last fallback
    const vpVal = vps[fieldKey];
    if (vpVal != null && vpVal !== "" && vpVal !== "—") return vpVal;
    return "—";
  };

  // Build specs map — fill every field
  const specs: Record<string, string | number> = {
    respondent: "ANC",
    displayName: display.location || display.shortId,
    manufacturer: display.vendor || dbMatch?.manufacturer || "—",
    model: display.model || dbMatch?.modelNumber || "—",
    bidType: display.isAlternate ? "ALTERNATE" : "BASE",
    pixelPitch: correctedPitch,
    virtualPixelPitch: "N/A",
    indoorOutdoor: display.isOutdoor ? "Outdoor" : "Indoor",
    panelResolutionW: cabWidthMm > 0 && correctedPitch > 0 ? Math.round(cabWidthMm / correctedPitch) : "—",
    panelResolutionH: cabHeightMm > 0 && correctedPitch > 0 ? Math.round(cabHeightMm / correctedPitch) : "—",
    specWidthFt: display.widthFt || "—",
    specHeightFt: display.heightFt || "—",
    physicalWidthWithBorder: display.widthFt ? +(display.widthFt + borderAllowance).toFixed(2) : "—",
    physicalHeightWithBorder: display.heightFt ? +(display.heightFt + borderAllowance).toFixed(2) : "—",
    actualWidthFt: display.widthFt || "—",
    actualHeightFt: display.heightFt || "—",
    totalResolutionW: display.pixelsW || "—",
    totalResolutionH: display.pixelsH || "—",
    areaSqFt: display.sqFt ? +display.sqFt.toFixed(1) : "—",
    numberOfScreens: display.quantity,
    pixelDensity: pixelDensity || "—",

    // Optical specs — priority: memory > extendedSpecs > LG KB > defaults
    viewingAngleH: resolve("viewingAngleH", ext.viewingAngleH, lgSpecs?.viewingAngleH as string | undefined, defaults.viewingAngleH),
    viewingAngleUp: resolve("viewingAngleUp", ext.viewingAngleUp, lgSpecs?.viewingAngleUp as string | undefined, defaults.viewingAngleUp),
    viewingAngleDown: resolve("viewingAngleDown", ext.viewingAngleDown, lgSpecs?.viewingAngleDown as string | undefined, defaults.viewingAngleDown),
    pixelFillFactor: resolve("pixelFillFactor", ext.pixelFillFactor, defaults.pixelFillFactor),
    maxBrightness: resolve("maxBrightness", dbMatch?.maxNits, lgSpecs?.maxBrightness as number | undefined, vps.maxBrightness, display.nitRequirement || undefined),
    postCalibrationBrightness: display.nitRequirement || resolve("postCalibrationBrightness", ext.postCalibrationBrightness),

    // OEM info — fixed: use correct field keys for lookups
    oemLedModuleMfr: resolve("oemLedModuleMfr", ext.oemLedModuleMfr, display.vendor || undefined, defaults.oemLedModuleMfr),
    oemProcessorMfr: resolve("oemProcessorMfr", ext.oemProcessorMfr, lgSpecs?.oemProcessorMfr as string | undefined, defaults.oemProcessorMfr),
    factory: resolve("factory", ext.factory, lgSpecs?.factory as string | undefined, defaults.factory),
    ledLampType: resolve("ledLampType", ext.ledLampType, lgSpecs?.ledLampType as string | undefined, defaults.ledLampType),

    // Color specs
    brightnessAdjustment: resolve("brightnessAdjustment", ext.brightnessAdjustment, defaults.brightnessAdjustment),
    nativeColorTemperature: resolve("nativeColorTemperature", ext.nativeColorTemperature, defaults.colorTemperatureK),
    colorTemperatureK: resolve("colorTemperatureK", ext.colorTemperatureK, lgSpecs?.colorTemperatureK as string | undefined, defaults.colorTemperatureK),
    colorTempAdjustability: resolve("colorTempAdjustability", ext.colorTempAdjustability, defaults.colorTempAdjustability),
    colorSpaceRec709: resolve("colorSpaceRec709", ext.colorSpaceRec709, defaults.colorSpaceRec709),
    colorSpaceDciP3: resolve("colorSpaceDciP3", ext.colorSpaceDciP3, defaults.colorSpaceDciP3),
    colorSpaceRec2020: resolve("colorSpaceRec2020", ext.colorSpaceRec2020, defaults.colorSpaceRec2020),

    // Power & weight
    powerAt0: +powerAt0_KW.toFixed(2),
    powerAvg: +powerAvg_KW.toFixed(2),
    powerAt100: +powerAt100_KW.toFixed(2),
    btuAt0,
    btuAvg,
    btuAt100,
    powerRequirements: resolve("powerRequirements", ext.powerRequirements, defaults.powerRequirements),
    totalWeight: `${totalWeightLbs} lbs`,

    // Other fields
    gradationMethod: resolve("gradationMethod", ext.gradationMethod, defaults.gradationMethod),
    tonalGradation: resolve("tonalGradation", ext.tonalGradation, defaults.tonalGradation),
    ventilationRequirements: resolve("ventilationRequirements", ext.ventilationRequirements, defaults.ventilationRequirements),
    smdLedModel: resolve("smdLedModel", ext.smdLedModel, defaults.smdLedModel),
    serviceType: display.serviceType || dbMatch?.serviceType || "—",

    // AJP/WJHW extended fields — composite values for their template format
    ledType: display.isOutdoor ? "Outdoor LED" : "Indoor LED",
    activeDisplaySize: display.widthFt && display.heightFt
      ? `${display.heightFt}' H x ${display.widthFt}' W`
      : "—",
    physicalSizeWithBorders: display.widthFt && display.heightFt
      ? `${+(display.heightFt + borderAllowance).toFixed(2)}' H x ${+(display.widthFt + borderAllowance).toFixed(2)}' W`
      : "—",
    openArea: "N/A",
    refreshRate: resolve("refreshRate", ext.refreshRate, lgSpecs?.refreshRate as string | undefined),
    contrastRatio: resolve("contrastRatio", ext.contrastRatio, lgSpecs?.contrastRatio as string | undefined),
    ipRating: resolve("ipRating", ext.ipRating, lgSpecs?.ipRating as string | undefined),
    serviceAccess: resolve("serviceAccess", ext.serviceAccess, lgSpecs?.serviceAccess as string | undefined),

    // Sub-row fields for multi-column templates (AJP/WJHW)
    displayLocation: display.location || "—",
    pixelPitchV: correctedPitch || "—",
    pixelPitchH: correctedPitch || "—",
  };

  const matchStatus: FilledDisplay["matchStatus"] =
    dbMatch?.matchType === "exact" ? "exact" :
    dbMatch?.matchType === "close" ? "close" : "defaults";

  // Detect unknown fields — specs that are still "—"
  const unknownFields = templateFields
    .filter(f => f.type === "field" && f.fieldKey && specs[f.fieldKey] === "—")
    .map(f => f.fieldKey!);

  return {
    shortId: display.shortId,
    fullName: display.fullName,
    location: display.location,
    vendor: display.vendor,
    model: display.model,
    pixelPitch: correctedPitch,
    heightFt: display.heightFt,
    widthFt: display.widthFt,
    pixelsH: display.pixelsH,
    pixelsW: display.pixelsW,
    sqFt: display.sqFt,
    nitRequirement: display.nitRequirement,
    serviceType: display.serviceType,
    isOutdoor: display.isOutdoor,
    isAlternate: display.isAlternate,
    quantity: display.quantity,
    matchStatus,
    matchedProductName: dbMatch?.displayName ?? null,
    specs,
    unknownFields,
    cabinetCount,
    powerAt0_KW,
    powerAvg_KW,
    powerAt100_KW,
    btuAt0,
    btuAvg,
    btuAt100,
    totalWeightLbs,
    pixelDensity,
  };
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Pre-warm rate card cache so getRateSync() works throughout
    await preloadRateCard();

    const formData = await request.formData();
    const templateFile = formData.get("template") as File | null;
    const costAnalysisFile = formData.get("costAnalysis") as File | null;

    if (!templateFile || !costAnalysisFile) {
      return NextResponse.json(
        { error: "Both template and cost analysis files are required" },
        { status: 400 }
      );
    }

    // Read vendor specs if provided (from /api/vendor/parse)
    const vendorSpecsJson = formData.get("vendorSpecs") as string | null;
    let vendorSpecs: VendorSpecsMap | null = null;
    if (vendorSpecsJson) {
      try {
        const raw = JSON.parse(vendorSpecsJson);
        vendorSpecs = mapVendorSpecs(raw);
      } catch {
        // Ignore invalid vendor specs — not critical
      }
    }

    // Read files into buffers
    const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
    const costBuffer = Buffer.from(await costAnalysisFile.arrayBuffer());

    // Step 1: Parse template layout (Excel, PDF, or Word)
    const templateName = templateFile.name.toLowerCase();
    const isExcelTemplate = /\.(xlsx?|xls)$/i.test(templateName);
    let templateFields: TemplateField[] = [];
    let templateSheetName: string = "Sheet1";
    let templateProfile: ParseResponse["templateProfile"] = null;

    // Step 1a: Check ImportProfile cache FIRST (skip AI + regex if cached)
    let usedCachedProfile = false;
    if (isExcelTemplate) {
      try {
        const templateWorkbook = xlsx.read(templateBuffer, { type: "buffer" });
        templateSheetName = templateWorkbook.SheetNames[0];
        const fingerprint = generateFingerprint(templateWorkbook);

        const existingProfile = await prisma.importProfile.findUnique({
          where: { fingerprint },
        });

        if (existingProfile) {
          const savedMapping = existingProfile.columnMapping as Record<string, any>;

          // Check for cached AI field list (full replay — skips both AI and regex)
          if (savedMapping._aiFieldCache && Array.isArray(savedMapping._aiFieldCache)) {
            templateFields = savedMapping._aiFieldCache as TemplateField[];
            usedCachedProfile = true;
            console.log(`[SPEC GEN] Using cached AI field mapping from profile "${existingProfile.name}" (${templateFields.length} fields)`);
          }

          // Bump usage count
          await prisma.importProfile.update({
            where: { id: existingProfile.id },
            data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
          });
          templateProfile = {
            id: existingProfile.id,
            name: existingProfile.name,
            usageCount: existingProfile.usageCount + 1,
          };
        }
      } catch {
        // Fingerprinting is best-effort — don't block the parse
      }
    }

    // Step 1b: Parse template if not cached (AI + regex for Excel, Kreuzberg for PDF/Word)
    if (!usedCachedProfile) {
      if (isExcelTemplate) {
        const parsed = await parseTemplate(templateBuffer);
        templateFields = parsed.fields;
        templateSheetName = parsed.sheetName;

      } else {
        // PDF or Word — extract text via Kreuzberg, then parse from text
        const extracted = await extractText(templateBuffer, templateFile.name);
        const parsed = parseTemplateFromText(extracted.text);
        templateFields = parsed.fields;
        templateSheetName = parsed.sheetName;
      }
    }

    // Step 2: Parse cost analysis
    const { displays: costDisplays, projectName, warnings } = parseCostAnalysis(costBuffer);

    if (costDisplays.length === 0) {
      return NextResponse.json({
        displays: [],
        templateFields,
        stats: { total: 0, matched: 0, defaults: 0, warnings },
        projectName: projectName || costAnalysisFile.name.replace(/\.(xlsx?|csv)$/i, ""),
        sheetName: templateSheetName,
      });
    }

    // Step 3-5: Match products and fill specs
    const filledDisplays = await Promise.all(
      costDisplays.map((d) => fillDisplay(d, templateFields, warnings, vendorSpecs))
    );

    const matched = filledDisplays.filter((d) => d.matchStatus !== "defaults").length;
    const defaults = filledDisplays.filter((d) => d.matchStatus === "defaults").length;

    // Save new template profile if this is a new Excel template format
    // Stores both columnMapping (for quick lookup) and full AI field mapping (for cached replay)
    if (isExcelTemplate && !templateProfile && templateFields.length > 0) {
      try {
        const templateWorkbook = xlsx.read(templateBuffer, { type: "buffer" });
        const fp = generateFingerprint(templateWorkbook);
        const columnMapping: Record<string, number> = {};
        // Also save the full field list as JSON for cached replay
        const aiFieldCache: TemplateField[] = [];
        for (const f of templateFields) {
          if (f.fieldKey) columnMapping[f.fieldKey] = f.valueCol;
          aiFieldCache.push(f);
        }
        const created = await prisma.importProfile.create({
          data: {
            name: `SpecGen-${templateFile.name.replace(/\.(xlsx?|csv)$/i, "")}`,
            fingerprint: fp,
            targetSheet: templateSheetName,
            headerRowIndex: 0,
            dataStartRowIndex: 0,
            columnMapping: { ...columnMapping, _aiFieldCache: aiFieldCache } as any,
            dataEndStrategy: "blank_row",
          },
        });
        templateProfile = { id: created.id, name: created.name, usageCount: 1 };
      } catch (e: any) {
        // Ignore duplicate fingerprint race condition
        if (!e.message?.includes("Unique constraint")) {
          console.warn("[SPEC GEN] Failed to save template profile:", e.message);
        }
      }
    }

    const response: ParseResponse = {
      displays: filledDisplays,
      templateFields,
      stats: {
        total: filledDisplays.length,
        matched,
        defaults,
        warnings,
      },
      projectName: projectName || costAnalysisFile.name.replace(/\.(xlsx?|csv)$/i, ""),
      sheetName: templateSheetName,
      templateProfile,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[SPEC GEN] Parse error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse files" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
