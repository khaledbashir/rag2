/**
 * Cost Analysis Parser — extracts LED display rows from the "LED Cost Sheet" tab.
 *
 * Used by the Spec Generator tool to read display data from ANC cost analysis
 * workbooks. Uses header-row detection (not hardcoded column indices) so it
 * works across different cost analysis formats.
 *
 * Each display row starts with "LED-" in column A. Non-LED rows (headers,
 * bid package labels, totals, blanks) are skipped.
 */

import * as xlsx from "xlsx";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CostAnalysisDisplay {
  shortId: string;         // "LED-GPL2-01"
  fullName: string;        // Full text from column A
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
}

export interface CostAnalysisResult {
  displays: CostAnalysisDisplay[];
  projectName: string;
  warnings: string[];
}

// ─── Header patterns for column detection ───────────────────────────────────

interface ColumnMap {
  fullName: number;
  location: number;
  vendor: number;
  model: number;
  pixelPitch: number;
  heightFt: number;
  widthFt: number;
  pixelsH: number;
  pixelsW: number;
  sqFt: number;
  nitRequirement: number;
  serviceType: number;
  quantity: number;
}

/** Regex patterns to match header labels → column roles */
const HEADER_PATTERNS: [keyof ColumnMap, RegExp][] = [
  ["location",       /^(location|display\s*location|loc\.?|area|zone|room|wall)\s*$/i],
  ["vendor",         /^(vendor|manufacturer|mfg\.?|mfr\.?|brand|make)\s*$/i],
  ["model",          /^(model|product\s*model|product|sku|model\s*#?|part\s*#?)\s*$/i],
  ["pixelPitch",     /^(pixel\s*pitch|pitch|pp|p\.?p\.?|pitch\s*\(mm\))\s*$/i],
  ["heightFt",       /^(height|h|h\s*\(ft\)|height\s*\(ft\)|ht|h[''])\s*$/i],
  ["widthFt",        /^(width|w|w\s*\(ft\)|width\s*\(ft\)|wd|w[''])\s*$/i],
  ["pixelsH",        /^(pixels?\s*h|px\s*h|res\.?\s*h|height\s*px|v(?:ert)?\s*px|vert\s*res)\s*$/i],
  ["pixelsW",        /^(pixels?\s*w|px\s*w|res\.?\s*w|width\s*px|h(?:oriz)?\s*px|horiz\s*res)\s*$/i],
  ["sqFt",           /^(sq\s*ft|area|sqft|square\s*feet?|sq\s*ft\s*per\s*screen|total\s*sf|sf)\s*$/i],
  ["nitRequirement", /^(nit|nits|nit\s*req|brightness|nit\s*requirement|nit\s*rating)\s*$/i],
  ["serviceType",    /^(service|service\s*type|svc|access|front\/?rear)\s*$/i],
  ["quantity",       /^(qty|quantity|count|#|num|screens?)\s*$/i],
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function toStr(v: any): string {
  if (v == null) return "";
  return String(v).trim();
}

function toNum(v: any): number {
  if (v == null) return 0;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Find the "LED Cost Sheet" tab (fuzzy match).
 */
function findLedCostSheet(workbook: xlsx.WorkBook): string | null {
  const names = workbook.SheetNames;
  // Exact match first
  const exact = names.find((n) => /^led\s*cost\s*sheet$/i.test(n.trim()));
  if (exact) return exact;
  // Fuzzy — contains "LED" and "Cost"
  const fuzzy = names.find((n) => /led/i.test(n) && /cost/i.test(n));
  if (fuzzy) return fuzzy;
  // Contains "LED Cost"
  const partial = names.find((n) => /led\s*cost/i.test(n));
  if (partial) return partial;
  return null;
}

/**
 * Detect header row and build column map.
 * Scans first 30 rows looking for a row that matches 3+ header patterns.
 */
function detectColumns(data: any[][]): { headerRow: number; columns: ColumnMap } | null {
  for (let i = 0; i < Math.min(data.length, 30); i++) {
    const row = data[i] || [];
    const matched: Partial<ColumnMap> = {};
    let matchCount = 0;

    for (let col = 0; col < row.length; col++) {
      const cellText = toStr(row[col]);
      if (!cellText) continue;

      for (const [field, pattern] of HEADER_PATTERNS) {
        if (pattern.test(cellText) && !(field in matched)) {
          matched[field] = col;
          matchCount++;
          break;
        }
      }
    }

    // Need at least 3 matches to be confident this is the header row
    if (matchCount >= 3) {
      // Column A (index 0) is always the display name/full name
      const columns: ColumnMap = {
        fullName: 0,
        location: matched.location ?? -1,
        vendor: matched.vendor ?? -1,
        model: matched.model ?? -1,
        pixelPitch: matched.pixelPitch ?? -1,
        heightFt: matched.heightFt ?? -1,
        widthFt: matched.widthFt ?? -1,
        pixelsH: matched.pixelsH ?? -1,
        pixelsW: matched.pixelsW ?? -1,
        sqFt: matched.sqFt ?? -1,
        nitRequirement: matched.nitRequirement ?? -1,
        serviceType: matched.serviceType ?? -1,
        quantity: matched.quantity ?? -1,
      };

      return { headerRow: i, columns };
    }
  }

  return null;
}

/**
 * Extract the short ID from the full display name.
 * "LED-GPL2-01 - LED Display (2026) - 9' H x 16' W - 1.2mm (Indoor)" → "LED-GPL2-01"
 */
function extractShortId(fullName: string): string {
  // Take everything before the first " - " separator
  const dashIdx = fullName.indexOf(" - ");
  if (dashIdx > 0) return fullName.substring(0, dashIdx).trim();
  // Fallback: take first whitespace-separated token if it starts with LED-
  const first = fullName.split(/\s+/)[0];
  return first || fullName;
}

/**
 * Infer indoor/outdoor from the display full name and NIT requirement.
 */
function inferOutdoor(fullName: string, nits: number): boolean {
  const lower = fullName.toLowerCase();
  if (lower.includes("outdoor")) return true;
  if (lower.includes("ext")) return true;
  if (lower.includes("indoor")) return false;
  // High NITs suggest outdoor
  if (nits >= 5000) return true;
  return false;
}

/**
 * Infer whether this is an alternate bid.
 */
function inferAlternate(fullName: string): boolean {
  return /\balt(?:ernate)?\b/i.test(fullName);
}

/**
 * Parse pixel pitch from the full name if not available from the column.
 * "LED-GPL2-01 - LED Display - 1.2mm (Indoor)" → 1.2
 */
function parsePitchFromName(fullName: string): number {
  const match = fullName.match(/(\d+\.?\d*)\s*mm/i);
  return match ? parseFloat(match[1]) : 0;
}

// ─── Per-Display Sheet Parser (fallback) ────────────────────────────────────

/**
 * Regex patterns to extract spec values from vertical label-value sheets.
 * Each entry: [CostAnalysisDisplay field, label regex, value type].
 */
const VERTICAL_LABEL_PATTERNS: [keyof CostAnalysisDisplay, RegExp][] = [
  ["vendor",       /manufacturer|vendor|mfg|brand/i],
  ["model",        /model|product\s*(?:name|model|#)|sku/i],
  ["pixelPitch",   /pixel\s*pitch|pitch/i],
  ["heightFt",     /(?:active\s*)?(?:display\s*)?height|overall.*height/i],
  ["widthFt",      /(?:active\s*)?(?:display\s*)?width|overall.*width/i],
  ["pixelsH",      /pixel.*(?:height|vertical|v\b)|vertical.*(?:pixel|resolution)|resolution.*(?:h|height|vertical)/i],
  ["pixelsW",      /pixel.*(?:width|horizontal|h\b)|horizontal.*(?:pixel|resolution)|resolution.*(?:w|width|horizontal)/i],
  ["sqFt",         /(?:sq|square)\s*(?:ft|feet)|total.*(?:display\s*)?area|active.*area/i],
  ["nitRequirement", /nit|brightness|luminance/i],
  ["serviceType",  /service\s*(?:type|access)|front.*rear|access/i],
  ["location",     /location|area|zone|room/i],
];

/**
 * Parse workbooks where each sheet is a per-display vertical spec form.
 * Extracts basic display info from label-value pairs on each LED-* tab.
 */
function parsePerDisplaySheets(workbook: xlsx.WorkBook, ledSheets: string[]): CostAnalysisResult {
  const warnings: string[] = [];
  const displays: CostAnalysisDisplay[] = [];

  warnings.push(`No single LED Cost Sheet found — parsing ${ledSheets.length} per-display tabs`);

  for (const sheetName of ledSheets) {
    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });

    // Build a label→value map by scanning all rows
    const extracted: Partial<Record<keyof CostAnalysisDisplay, string>> = {};

    for (let r = 0; r < data.length; r++) {
      const row = data[r] || [];
      // Try each cell as a potential label
      for (let c = 0; c < Math.min(row.length, 6); c++) {
        const cellText = toStr(row[c]);
        if (!cellText || cellText.length < 3 || cellText.length > 150) continue;

        for (const [field, pattern] of VERTICAL_LABEL_PATTERNS) {
          if (extracted[field]) continue; // already found
          if (!pattern.test(cellText)) continue;

          // Look for value in adjacent cells (same row, right of label) or next row
          let value = "";

          // Check cells to the right on same row
          for (let vc = c + 1; vc < Math.min(row.length, c + 5); vc++) {
            const v = toStr(row[vc]);
            if (v && v !== cellText && !/^[\s\-—:]+$/.test(v)) {
              value = v;
              break;
            }
          }

          // If nothing found, check the cell directly below the label
          if (!value && r + 1 < data.length) {
            const below = toStr(data[r + 1]?.[c]);
            if (below && below.length < 100 && !/^[\s\-—:]+$/.test(below)) {
              value = below;
            }
          }

          if (value) {
            extracted[field] = value;
          }
          break;
        }
      }
    }

    // Build display from extracted data
    const shortId = sheetName.trim();
    let pixelPitch = toNum(extracted.pixelPitch);
    if (!pixelPitch) pixelPitch = parsePitchFromName(shortId);

    const heightFt = toNum(extracted.heightFt);
    const widthFt = toNum(extracted.widthFt);
    let sqFt = toNum(extracted.sqFt);
    if (!sqFt && heightFt && widthFt) sqFt = heightFt * widthFt;

    const nitRequirement = toNum(extracted.nitRequirement);
    const vendor = extracted.vendor || "";
    const model = extracted.model || "";

    if (!vendor && !model && !pixelPitch) {
      warnings.push(`${shortId}: Could not extract vendor, model, or pitch from spec sheet`);
    }

    displays.push({
      shortId,
      fullName: shortId,
      location: extracted.location || "",
      vendor,
      model,
      pixelPitch,
      heightFt,
      widthFt,
      pixelsH: toNum(extracted.pixelsH),
      pixelsW: toNum(extracted.pixelsW),
      sqFt,
      nitRequirement,
      serviceType: extracted.serviceType || "",
      isOutdoor: inferOutdoor(shortId, nitRequirement),
      isAlternate: inferAlternate(shortId),
      quantity: 1,
    });
  }

  // Vendor/model inference from siblings (same logic as main parser)
  if (displays.length > 1) {
    const vendorCounts: Record<string, number> = {};
    for (const d of displays) {
      if (d.vendor) {
        const v = d.vendor.toLowerCase();
        vendorCounts[v] = (vendorCounts[v] || 0) + 1;
      }
    }
    const displaysWithVendor = Object.values(vendorCounts).reduce((a, b) => a + b, 0);
    let majorityVendor = "";
    if (displaysWithVendor > 0) {
      const sorted = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]);
      if (sorted[0][1] / displays.length > 0.5) {
        majorityVendor = displays.find(d => d.vendor.toLowerCase() === sorted[0][0])?.vendor || sorted[0][0];
      }
    }
    for (const d of displays) {
      if (!d.vendor && majorityVendor) {
        d.vendor = majorityVendor;
        warnings.push(`${d.shortId}: Vendor inferred from project majority (${majorityVendor})`);
      }
    }
  }

  console.log(`[COST PARSER] Parsed ${displays.length} per-display spec sheets`);
  return { displays, projectName: "", warnings };
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export function parseCostAnalysis(buffer: Buffer): CostAnalysisResult {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const warnings: string[] = [];

  // Find LED Cost Sheet
  const sheetName = findLedCostSheet(workbook);
  if (!sheetName) {
    // Fallback: check if sheets are per-display spec tabs (e.g., "LED-GPL2-01", "LED-C1-02")
    const ledSheets = workbook.SheetNames.filter((n) => /^LED-/i.test(n.trim()));
    if (ledSheets.length > 0) {
      return parsePerDisplaySheets(workbook, ledSheets);
    }
    return {
      displays: [],
      projectName: "",
      warnings: ["No 'LED Cost Sheet' tab found in workbook. Available sheets: " + workbook.SheetNames.join(", ")],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const data: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });

  // Detect header row and column mapping
  const detection = detectColumns(data);
  if (!detection) {
    warnings.push("Could not auto-detect column headers — using default ANC layout. Verify column order matches: A=Name, B=Location, C=Vendor, D=Model, F=Pitch, G=Height, H=Width, I=PxH, K=PxW, L=SqFt, O=NITs, P=Service");
  } else {
    // Warn about any critical columns that weren't detected
    const critical: [keyof ColumnMap, string][] = [
      ["vendor", "Vendor/Manufacturer"], ["model", "Model"], ["pixelPitch", "Pixel Pitch"],
      ["heightFt", "Height"], ["widthFt", "Width"],
    ];
    for (const [key, label] of critical) {
      if (detection.columns[key] < 0) {
        warnings.push(`Column "${label}" not detected in header row — values may be missing`);
      }
    }
  }

  const cols = detection?.columns ?? {
    fullName: 0,
    location: 1,
    vendor: 2,
    model: 3,
    pixelPitch: 5,
    heightFt: 6,
    widthFt: 7,
    pixelsH: 8,
    pixelsW: 10,
    sqFt: 11,
    nitRequirement: 14,
    serviceType: 15,
    quantity: -1,
  };

  const startRow = detection ? detection.headerRow + 1 : 0;

  // Try to extract project name from filename or sheet metadata
  let projectName = "";
  // Check first few rows for project name before the header
  for (let i = 0; i < Math.min(startRow, 10); i++) {
    const cellA = toStr(data[i]?.[0]);
    if (cellA && !cellA.toLowerCase().includes("led") && cellA.length > 5 && cellA.length < 100) {
      // Likely a project name or header
      if (/arena|stadium|center|field|park|university|college|school/i.test(cellA)) {
        projectName = cellA;
        break;
      }
    }
  }

  // Parse display rows
  const displays: CostAnalysisDisplay[] = [];

  for (let i = startRow; i < data.length; i++) {
    const row = data[i] || [];
    const cellA = toStr(row[cols.fullName]);

    // Skip non-LED rows
    if (!cellA.startsWith("LED-")) continue;

    const fullName = cellA;
    const shortId = extractShortId(fullName);
    const location = cols.location >= 0 ? toStr(row[cols.location]) : "";
    const vendor = cols.vendor >= 0 ? toStr(row[cols.vendor]) : "";
    const model = cols.model >= 0 ? toStr(row[cols.model]) : "";

    let pixelPitch = cols.pixelPitch >= 0 ? toNum(row[cols.pixelPitch]) : 0;
    if (!pixelPitch) pixelPitch = parsePitchFromName(fullName);

    const heightFt = cols.heightFt >= 0 ? toNum(row[cols.heightFt]) : 0;
    const widthFt = cols.widthFt >= 0 ? toNum(row[cols.widthFt]) : 0;
    const pixelsH = cols.pixelsH >= 0 ? toNum(row[cols.pixelsH]) : 0;
    const pixelsW = cols.pixelsW >= 0 ? toNum(row[cols.pixelsW]) : 0;

    let sqFt = cols.sqFt >= 0 ? toNum(row[cols.sqFt]) : 0;
    if (!sqFt && heightFt && widthFt) sqFt = heightFt * widthFt;

    const nitRequirement = cols.nitRequirement >= 0 ? toNum(row[cols.nitRequirement]) : 0;
    const serviceType = cols.serviceType >= 0 ? toStr(row[cols.serviceType]) : "";
    const quantity = cols.quantity >= 0 ? (toNum(row[cols.quantity]) || 1) : 1;

    const isOutdoor = inferOutdoor(fullName, nitRequirement);
    const isAlternate = inferAlternate(fullName);

    // Per-display data quality warnings
    if (!vendor && !model) {
      warnings.push(`${shortId}: Missing both vendor and model — product matching will fail`);
    }
    if (!heightFt && !widthFt && !sqFt) {
      warnings.push(`${shortId}: No display dimensions found — calculations will use defaults`);
    }

    displays.push({
      shortId,
      fullName,
      location,
      vendor,
      model,
      pixelPitch,
      heightFt,
      widthFt,
      pixelsH,
      pixelsW,
      sqFt,
      nitRequirement,
      serviceType,
      isOutdoor,
      isAlternate,
      quantity,
    });
  }

  if (displays.length === 0) {
    warnings.push("No LED- display rows found in '" + sheetName + "'. Make sure display names start with 'LED-'.");
  }

  // ─── Vendor/Model Inference ──────────────────────────────────────────────
  // Fill in missing vendor/model from sibling displays
  if (displays.length > 1) {
    // Vendor inference: majority vote
    const vendorCounts: Record<string, number> = {};
    for (const d of displays) {
      if (d.vendor) {
        const v = d.vendor.toLowerCase();
        vendorCounts[v] = (vendorCounts[v] || 0) + 1;
      }
    }
    const displaysWithVendor = Object.values(vendorCounts).reduce((a, b) => a + b, 0);
    let majorityVendorOriginal = "";
    if (displaysWithVendor > 0) {
      const sorted = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]);
      const [topVendor, topCount] = sorted[0];
      if (topCount / displays.length > 0.5) {
        // Find original casing from a display that has this vendor
        majorityVendorOriginal = displays.find(
          (d) => d.vendor.toLowerCase() === topVendor
        )?.vendor || topVendor;
      }
    }

    for (const d of displays) {
      if (!d.vendor && majorityVendorOriginal) {
        d.vendor = majorityVendorOriginal;
        warnings.push(`${d.shortId}: Vendor inferred from project majority (${majorityVendorOriginal})`);
      }
    }

    // Model inference: match by same vendor + closest pixel pitch
    const displaysWithModel = displays.filter((d) => d.vendor && d.model);
    for (const d of displays) {
      if (d.vendor && !d.model && d.pixelPitch > 0) {
        // Find sibling with same vendor and closest pitch that has a model
        const candidates = displaysWithModel.filter(
          (s) => s.vendor.toLowerCase() === d.vendor.toLowerCase()
        );
        if (candidates.length > 0) {
          const byPitch = candidates.sort(
            (a, b) => Math.abs(a.pixelPitch - d.pixelPitch) - Math.abs(b.pixelPitch - d.pixelPitch)
          );
          const best = byPitch[0];
          if (Math.abs(best.pixelPitch - d.pixelPitch) <= 0.5) {
            d.model = best.model;
            warnings.push(`${d.shortId}: Model inferred from similar display ${best.shortId} (${best.model})`);
          }
        }
      }
    }
  }

  console.log(`[COST PARSER] Found ${displays.length} displays in "${sheetName}"`);

  return { displays, projectName, warnings };
}
