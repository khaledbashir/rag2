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
  [/display\s*name|location.*display/i, "displayName"],
  [/^manufacturer/i, "manufacturer"],
  [/^model\b/i, "model"],
  [/base\s*or\s*alternate|bid\s*type/i, "bidType"],
  [/physical\s*pixel\s*pitch/i, "pixelPitch"],
  [/virtual\s*pixel\s*pitch/i, "virtualPixelPitch"],
  [/indoor.*outdoor|outdoor.*indoor/i, "indoorOutdoor"],
  [/panel\s*res.*w/i, "panelResolutionW"],
  [/panel\s*res.*h/i, "panelResolutionH"],
  [/spec.*width|display\s*width|width.*ft/i, "specWidthFt"],
  [/spec.*height|display\s*height|height.*ft/i, "specHeightFt"],
  [/physical.*size.*width.*border/i, "physicalWidthWithBorder"],
  [/physical.*size.*height.*border/i, "physicalHeightWithBorder"],
  [/actual.*width/i, "actualWidthFt"],
  [/actual.*height/i, "actualHeightFt"],
  [/total\s*res.*w/i, "totalResolutionW"],
  [/total\s*res.*h/i, "totalResolutionH"],
  [/area\s*per\s*screen|sq.*ft/i, "areaSqFt"],
  [/number\s*of\s*screen|qty|quantity/i, "numberOfScreens"],
  [/pixel\s*density/i, "pixelDensity"],
  [/horizontal\s*view|viewing.*horiz/i, "viewingAngleH"],
  [/vertical\s*up|viewing.*up/i, "viewingAngleUp"],
  [/vertical\s*down|viewing.*down/i, "viewingAngleDown"],
  [/pixel\s*fill\s*factor/i, "pixelFillFactor"],
  [/oem\s*led\s*module\s*mfr|led\s*module\s*manu/i, "oemLedModuleMfr"],
  [/oem\s*processor\s*mfr|processor\s*manu/i, "oemProcessorMfr"],
  [/(?:led\s*)?factory|country.*origin|place.*manu/i, "factory"],
  [/led\s*lamp\s*type|lamp\s*type/i, "ledLampType"],
  [/max.*brightness|brightness.*nit/i, "maxBrightness"],
  [/post.*calibrat.*brightness|uniform.*brightness/i, "postCalibrationBrightness"],
  [/brightness.*level.*adj|brightness.*adj/i, "brightnessAdjustment"],
  [/native\s*color\s*temp/i, "nativeColorTemperature"],
  [/color\s*temp.*k|color\s*temp.*kelvin/i, "colorTemperatureK"],
  [/color\s*temp.*adj/i, "colorTempAdjustability"],
  [/rec\s*709|color\s*space.*709/i, "colorSpaceRec709"],
  [/dci.*p3|color\s*space.*p3/i, "colorSpaceDciP3"],
  [/rec\s*2020|color\s*space.*2020/i, "colorSpaceRec2020"],
  [/power.*0\s*%|power.*black|power.*idle/i, "powerAt0"],
  [/power.*avg|power.*average|power.*typical/i, "powerAvg"],
  [/power.*100\s*%|power.*full|power.*max|power.*white/i, "powerAt100"],
  [/btu.*0\s*%|btu.*black|btu.*idle/i, "btuAt0"],
  [/btu.*avg|btu.*average|btu.*typical/i, "btuAvg"],
  [/btu.*100\s*%|btu.*full|btu.*max|btu.*white/i, "btuAt100"],
  [/power\s*req|voltage|electrical\s*req/i, "powerRequirements"],
  [/total\s*display\s*assembly\s*weight/i, "totalWeight"],
  [/total\s*(?:display\s*)?weight|weight.*total|weight.*lbs/i, "totalWeight"],
  [/smd\s*led\s*model|led\s*model/i, "smdLedModel"],
  [/gradation\s*method/i, "gradationMethod"],
  [/tonal\s*gradation/i, "tonalGradation"],
  [/ventilation|cooling/i, "ventilationRequirements"],
];

function parseTemplate(buffer: Buffer): { fields: TemplateField[]; sheetName: string } {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  // Use the first sheet (the template should only have one)
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  const fields: TemplateField[] = [];
  const merges = sheet["!merges"] || [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i] || [];
    const cellA = String(row[0] || "").trim();

    if (!cellA) {
      fields.push({ type: "separator", label: "", fieldKey: null, rowIndex: i, valueCol: 1 });
      continue;
    }

    // Check if this row is a section header (merged cell or all-caps label)
    const isMerged = merges.some(
      (m: any) => m.s.r === i && m.e.c > m.s.c + 1
    );
    const isAllCaps = cellA === cellA.toUpperCase() && cellA.length > 3 && /^[A-Z\s\-&\/()]+$/.test(cellA);

    if (isMerged || isAllCaps) {
      fields.push({ type: "section", label: cellA, fieldKey: null, rowIndex: i, valueCol: 1 });
      continue;
    }

    // Auto-detect value column: scan cols B onward for the first empty/placeholder cell
    let valueCol = 1; // default = column B (0-based index 1)
    for (let c = 1; c < Math.max(row.length, 5); c++) {
      const cellVal = String(row[c] || "").trim();
      if (!cellVal || /^(enter|n\/a|tbd|\—|-)$/i.test(cellVal)) {
        valueCol = c;
        break;
      }
    }

    // Try to match this label to a field key
    let fieldKey: string | null = null;
    for (const [pattern, key] of FIELD_KEY_PATTERNS) {
      if (pattern.test(cellA)) {
        fieldKey = key;
        break;
      }
    }

    fields.push({ type: "field", label: cellA, fieldKey, rowIndex: i, valueCol });
  }

  return { fields, sheetName };
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

    // Step 1: Parse template layout
    const { fields: templateFields, sheetName: templateSheetName } = parseTemplate(templateBuffer);

    // Step 1b: Template recognition via ImportProfile fingerprinting
    const templateWorkbook = xlsx.read(templateBuffer, { type: "buffer" });
    const fingerprint = generateFingerprint(templateWorkbook);
    let templateProfile: ParseResponse["templateProfile"] = null;

    try {
      const existingProfile = await prisma.importProfile.findUnique({
        where: { fingerprint },
      });

      if (existingProfile) {
        // Apply saved column mapping — override valueCol for known fields
        const savedMapping = existingProfile.columnMapping as Record<string, number>;
        for (const field of templateFields) {
          if (field.fieldKey && savedMapping[field.fieldKey] !== undefined) {
            field.valueCol = savedMapping[field.fieldKey];
          }
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

    // Save new template profile if this is a new template format
    if (!templateProfile && templateFields.length > 0) {
      try {
        const columnMapping: Record<string, number> = {};
        for (const f of templateFields) {
          if (f.fieldKey) columnMapping[f.fieldKey] = f.valueCol;
        }
        const created = await prisma.importProfile.create({
          data: {
            name: `SpecGen-${templateFile.name.replace(/\.(xlsx?|csv)$/i, "")}`,
            fingerprint,
            targetSheet: templateSheetName,
            headerRowIndex: 0,
            dataStartRowIndex: 0,
            columnMapping,
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
