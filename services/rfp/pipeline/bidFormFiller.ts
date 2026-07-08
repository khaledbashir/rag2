/**
 * Bid Form Filler — Auto-populate vendor column in AJP-style bid forms
 *
 * Parses an uploaded bid form Excel (.xlsx), detects display spec blocks,
 * matches them to extracted RFP specs, and fills Column C (vendor response).
 *
 * Supports any AJP-format bid form with the standard pattern:
 *   Column A = labels, Column B = RFP spec values, Column C = vendor fill-in
 *   Spec blocks identified by "PIXEL PITCH" label in Column A
 */

import ExcelJS from "exceljs";
import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";
import { preloadRateCard, getRateSync } from "@/services/rfp/rateCardLoader";

// ============================================================================
// TYPES
// ============================================================================

/** A detected spec block in the bid form */
interface SpecBlock {
  sheetName: string;
  displayName: string;
  headerRow: number; // Row with display name + "SPEC."
  cells: {
    pixelPitch: number; // Row number
    quantity: number;
    pixelHeight: number;
    pixelLength: number;
    systemHeight: number;
    systemLength: number;
    brightness: number | null;
    viewAngleH: number | null;
    viewAngleV: number | null;
    powerDraw: number | null;
    // Pricing fields (for vendor fill)
    totalDisplayPrice: number | null;
    processingController: number | null;
    shippingHandling: number | null;
    totalSystemPrice: number | null;
    // Installation fields (AJP format: "INSTALLATION SUB-TOTAL: LED", individual line items)
    installationSubtotal: number | null;
    structuralSteel: number | null;
    heavyEquipment: number | null;
    componentInstallation: number | null;
    removalDisposal: number | null;
    hoistInstallation: number | null;
    claddingTrim: number | null;
    electricalData: number | null;
    chainMotors: number | null;
    secondarySteel: number | null;
    // Computed/derived fields
    totalPixels: number | null;
    totalSqFt: number | null;
    pixelDensity: number | null;
    // Manufacturer fields
    ledManufacturer: number | null;
    chipManufacturer: number | null;
  };
  /** Column B pitch value (for single-sheet matching) */
  colBPitch: number | null;
  labelCol: number;
  specCol: number;
  fillCol: number;
}

interface ProductDataField {
  row: number;
  col: number;
}

interface ProductDataBlock {
  sheetName: string;
  displayName: string;
  fields: Record<string, ProductDataField>;
}

/** Header/summary fields detected above the spec blocks */
interface HeaderFields {
  sheetName: string;
  vendorName: number | null;
  ledPrice: number | null;           // "LED" + price-like label
  installationPrice: number | null;  // "INSTALLATION" in summary section
  generalConditions: number | null;  // "GENERAL CONDITIONS"
  installSubcontractor: number | null; // "INSTALLATION SUBCONTRACTOR"
  ledManufacturer: number | null;    // "LED MANUFACTURER" in header area
}

/** Result of matching a spec block to an extracted screen */
export interface BidFormMatch {
  sheetName: string;
  displayName: string;
  matchedScreen: string; // Name of the matched ExtractedLEDSpec
  confidence: number; // 0-1
  fieldsFilled: string[];
  fieldsSkipped: string[];
}

export interface BidFormFillResult {
  buffer: Buffer;
  matches: BidFormMatch[];
  unmatchedBlocks: string[];
  unmatchedScreens: string[];
  totalBlocks: number;
  totalScreens: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/** Optional pricing data for filling cost/price cells */
export interface PricingData {
  name: string;
  hardwareCost: number;
  processingCost?: number;
  shippingCost?: number;
  installCost?: number;
  pmCost?: number;           // Project management / general conditions
  totalCost: number;
  // Selling prices (with margin applied) — these are what the client sees
  hardwareSellingPrice: number;
  servicesSellingPrice: number;
  totalSellingPrice: number;
  /** Matched ANC product specs — actual dimensions/resolution from catalog */
  matchedProduct?: {
    manufacturer: string;
    model: string;
    pitch: number;
    nits?: number;
    totalMaxPowerW?: number;
    activeWidthFt?: number;
    activeHeightFt?: number;
    resolutionX?: number;
    resolutionY?: number;
  } | null;
}

/**
 * Compute selling prices for individual service line items.
 * Distributes the services margin proportionally across processing, shipping,
 * install, and PM costs so individual bid form cells include margin.
 */
function computeSellingPrices(pricing: PricingData) {
  const serviceCostTotal =
    (pricing.processingCost || 0) +
    (pricing.shippingCost || 0) +
    (pricing.installCost || 0) +
    (pricing.pmCost || 0);

  // Markup factor for services (selling / cost). Falls back to 1.0 if no cost.
  const serviceMarkup = serviceCostTotal > 0
    ? (pricing.servicesSellingPrice || 0) / serviceCostTotal
    : 1;

  return {
    displayPrice: Math.round(pricing.hardwareSellingPrice || pricing.hardwareCost),
    processingPrice: Math.round((pricing.processingCost || 0) * serviceMarkup),
    shippingPrice: Math.round((pricing.shippingCost || 0) * serviceMarkup),
    installPrice: Math.round((pricing.installCost || 0) * serviceMarkup),
    gcPrice: Math.round((pricing.pmCost || 0) * serviceMarkup),
    totalPrice: Math.round(pricing.totalSellingPrice),
  };
}

export async function fillBidForm(
  bidFormBuffer: Buffer,
  screens: ExtractedLEDSpec[],
  pricing?: PricingData[]
): Promise<BidFormFillResult> {
  // Pre-warm rate card cache for viewing angle lookups
  await preloadRateCard();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bidFormBuffer);

  // Step 1: Detect all spec blocks across all sheets
  const blocks = detectSpecBlocks(workbook);

  if (blocks.length === 0) {
    const productDataBlocks = detectProductDataBlocks(workbook);
    if (productDataBlocks.length > 0) {
      const result = fillProductDataFormWorkbook(workbook, productDataBlocks, screens, pricing);
      const outputBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return { ...result, buffer: outputBuffer };
    }
  }

  // Detect single-sheet mode for matching strategy
  const uniqueSheets = new Set(blocks.map((b) => b.sheetName));
  const isSingleSheet = uniqueSheets.size === 1;

  // Step 2: Match each block to an extracted screen
  const usedScreens = new Set<number>();
  const matches: BidFormMatch[] = [];
  const unmatchedBlocks: string[] = [];

  for (const block of blocks) {
    const match = findBestMatch(block, screens, usedScreens, isSingleSheet);
    if (match) {
      usedScreens.add(match.screenIndex);
      // Find pricing data for this screen (match by name)
      const pricingForScreen = pricing?.find(
        (p) => p.name.toLowerCase() === match.screen.name.toLowerCase()
      );
      const { filled, skipped } = fillBlockCells(workbook, block, match.screen, pricingForScreen);
      matches.push({
        sheetName: block.sheetName,
        displayName: block.displayName,
        matchedScreen: match.screen.name,
        confidence: match.confidence,
        fieldsFilled: filled,
        fieldsSkipped: skipped,
      });
    } else {
      unmatchedBlocks.push(`${block.sheetName}: ${block.displayName}`);
    }
  }

  // Find unmatched screens
  const unmatchedScreens = screens
    .filter((_, i) => !usedScreens.has(i))
    .map((s) => s.name);

  // Step 3: Fill header/summary fields (vendor name, aggregate pricing, manufacturer)
  for (const sheetName of uniqueSheets) {
    const headerFields = detectHeaderFields(workbook, sheetName, blocks);
    if (headerFields) {
      fillHeaderFields(workbook, headerFields, screens, pricing, matches);
    }
  }

  // Step 4: Write the filled workbook
  const outputBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    buffer: outputBuffer,
    matches,
    unmatchedBlocks,
    unmatchedScreens,
    totalBlocks: blocks.length,
    totalScreens: screens.length,
  };
}

// ============================================================================
// SPEC BLOCK DETECTION
// ============================================================================

function detectSpecBlocks(workbook: ExcelJS.Workbook): SpecBlock[] {
  const blocks: SpecBlock[] = [];

  workbook.eachSheet((sheet) => {
    const sheetName = sheet.name;

    // Skip summary/overview sheets
    if (/summary|overview|cover|instructions/i.test(sheetName)) return;

    // Scan for "PIXEL PITCH" labels — that's the anchor.
    // Most AJP forms use A/B/C, but some shift to B/C/D.
    sheet.eachRow((row, rowNumber) => {
      for (const labelCol of [1, 2]) {
      const cellA = getCellText(row.getCell(labelCol));

      if (/pixel\s*pitch/i.test(cellA)) {
        const specCol = labelCol + 1;
        const fillCol = labelCol + 2;
        // Found a spec block. The header is the row above.
        const headerRow = rowNumber - 1;
        const headerA = getCellText(sheet.getRow(headerRow).getCell(labelCol));

        // Walk down from PIXEL PITCH to find all spec fields
        const cells = {
          pixelPitch: rowNumber,
          quantity: 0,
          pixelHeight: 0,
          pixelLength: 0,
          systemHeight: 0,
          systemLength: 0,
          brightness: null as number | null,
          viewAngleH: null as number | null,
          viewAngleV: null as number | null,
          powerDraw: null as number | null,
          totalDisplayPrice: null as number | null,
          processingController: null as number | null,
          shippingHandling: null as number | null,
          totalSystemPrice: null as number | null,
          installationSubtotal: null as number | null,
          structuralSteel: null as number | null,
          heavyEquipment: null as number | null,
          componentInstallation: null as number | null,
          removalDisposal: null as number | null,
          hoistInstallation: null as number | null,
          claddingTrim: null as number | null,
          electricalData: null as number | null,
          chainMotors: null as number | null,
          secondarySteel: null as number | null,
          totalPixels: null as number | null,
          totalSqFt: null as number | null,
          pixelDensity: null as number | null,
          ledManufacturer: null as number | null,
          chipManufacturer: null as number | null,
        };

        // Read Column B pitch value for matching
        const colBPitchRaw = getCellText(sheet.getRow(rowNumber).getCell(specCol));
        const pitchMatch = colBPitchRaw.match(/([\d.]+)\s*(?:mm)?/);
        const colBPitch = pitchMatch ? parseFloat(pitchMatch[1]) : null;

        // Search within a 50-row window for each field (expanded for installation rows)
        // Stop early if we hit the next PIXEL PITCH anchor (next block boundary)
        for (let r = rowNumber + 1; r <= rowNumber + 50; r++) {
          const rowObj = sheet.getRow(r);
          if (!rowObj) break;
          const label = getCellText(rowObj.getCell(labelCol));

          // Stop at next block boundary to prevent cross-contamination
          if (/pixel\s*pitch/i.test(label)) break;

          if (/^quantity$/i.test(label.trim())) {
            cells.quantity = r;
          } else if (/pixel\s*height/i.test(label)) {
            cells.pixelHeight = r;
          } else if (/pixel\s*length/i.test(label)) {
            cells.pixelLength = r;
          } else if (/system\s*height/i.test(label)) {
            cells.systemHeight = r;
          } else if (/system\s*length/i.test(label)) {
            cells.systemLength = r;
          } else if (/brightness.*nits/i.test(label) || /^brightness$/i.test(label.trim())) {
            cells.brightness = r;
          } else if (/viewing\s*angle.*horizontal/i.test(label)) {
            cells.viewAngleH = r;
          } else if (/viewing\s*angle.*vertical/i.test(label)) {
            cells.viewAngleV = r;
          } else if (/power\s*draw|total\s*power|max\s*amps/i.test(label)) {
            cells.powerDraw = r;
          }
          // Computed / derived fields
          else if (/total\s*pixels/i.test(label) && !/density/i.test(label)) {
            cells.totalPixels = r;
          } else if (/total\s*sq\.?\s*ft/i.test(label) && !/density|pixel/i.test(label)) {
            cells.totalSqFt = r;
          } else if (/pixel\s*density/i.test(label)) {
            cells.pixelDensity = r;
          }
          // Pricing fields
          else if (/total\s*display\s*price/i.test(label)) {
            cells.totalDisplayPrice = r;
          } else if (/processing|controller/i.test(label) && !/power/i.test(label)) {
            cells.processingController = r;
          } else if (/shipping|handling/i.test(label)) {
            cells.shippingHandling = r;
          } else if (/total\s*system\s*price/i.test(label)) {
            cells.totalSystemPrice = r;
          } else if (/installation\s*sub-?total/i.test(label)) {
            cells.installationSubtotal = r;
          } else if (/primary.*secondary.*steel|structural\s*steel/i.test(label)) {
            cells.structuralSteel = r;
          } else if (/heavy\s*equipment/i.test(label)) {
            cells.heavyEquipment = r;
          } else if (/component\s*installation/i.test(label) || /led\s*install/i.test(label)) {
            cells.componentInstallation = r;
          } else if (/removal.*disposal/i.test(label)) {
            cells.removalDisposal = r;
          } else if (/hoist.*install/i.test(label) || /install.*hoist/i.test(label)) {
            cells.hoistInstallation = r;
          } else if (/cladding|trim.*flash/i.test(label)) {
            cells.claddingTrim = r;
          } else if (/electrical.*data/i.test(label) || /data.*electrical/i.test(label)) {
            cells.electricalData = r;
          } else if (/chain\s*motor/i.test(label)) {
            cells.chainMotors = r;
          } else if (/secondary\s*steel/i.test(label) && !/primary/i.test(label)) {
            cells.secondarySteel = r;
          }
          // Manufacturer fields
          else if (/led\s*chip\s*manufacturer/i.test(label) || /chip\s*manufacturer/i.test(label)) {
            cells.chipManufacturer = r;
          } else if (/led\s*manufacturer/i.test(label) && !/chip/i.test(label)) {
            cells.ledManufacturer = r;
          }
        }

        // Only add if we found the core fields
        if (cells.quantity && cells.pixelHeight && cells.pixelLength) {
          blocks.push({
            sheetName,
            displayName: headerA || `Display at row ${headerRow}`,
            headerRow,
            cells,
            colBPitch,
            labelCol,
            specCol,
            fillCol,
          });
        }
      }
      }
    });
  });

  return blocks;
}

// ============================================================================
// PRODUCT DATA FORM DETECTION
// ============================================================================

function detectProductDataBlocks(workbook: ExcelJS.Workbook): ProductDataBlock[] {
  const blocks: ProductDataBlock[] = [];

  workbook.eachSheet((sheet) => {
    const sheetText: string[] = [];
    sheet.eachRow((row) => {
      for (let c = 1; c <= Math.min(12, row.cellCount || 12); c++) {
        const text = getCellText(row.getCell(c));
        if (text) sheetText.push(text);
      }
    });

    const joined = sheetText.join(" \n ");
    const looksLikeProductDataForm =
      /respondent'?s?\s*name/i.test(joined) &&
      /display\s*name/i.test(joined) &&
      /physical\s*pixel\s*spacing|pixel\s*pitch/i.test(joined) &&
      /overall\s*active\s*display\s*size|active\s*display\s*size/i.test(joined);

    if (!looksLikeProductDataForm) return;

    const fields = detectProductDataFields(sheet);
    if (Object.keys(fields).length < 4) return;

    blocks.push({
      sheetName: sheet.name,
      displayName: inferProductDataDisplayName(sheet) || sheet.name,
      fields,
    });
  });

  return blocks;
}

function detectProductDataFields(sheet: ExcelJS.Worksheet): Record<string, ProductDataField> {
  const fields: Record<string, ProductDataField> = {};
  let group: "activeSize" | "physicalSize" | "pixelSpacing" | "viewingAngle" | "colorSpace" | "power" | null = null;

  sheet.eachRow((row, rowNumber) => {
    const rowTexts: Record<number, string> = {};
    for (let c = 1; c <= 12; c++) {
      rowTexts[c] = normalizeFormText(getCellText(row.getCell(c)));
    }

    const cellA = rowTexts[1] || "";
    if (/overall active display size|active display size/.test(cellA)) group = "activeSize";
    else if (/physical display size|including borders|shrouding/.test(cellA)) group = "physicalSize";
    else if (/physical pixel spacing|pixel pitch/.test(cellA)) group = "pixelSpacing";
    else if (/viewing angle/.test(cellA)) group = "viewingAngle";
    else if (/color space|rec 709|cie 1931/.test(cellA)) group = "colorSpace";
    else if (/power consumption|heat load/.test(cellA)) group = "power";
    else if (/^[a-z\s&/()-]+$/.test(cellA) && /manufacturing|physical characteristics|display and electrical/.test(cellA)) group = null;

    for (let c = 1; c <= 10; c++) {
      const text = rowTexts[c];
      if (!text) continue;

      const key = productDataFieldKey(text, group);
      if (!key || fields[key]) continue;

      const targetCol = findProductDataValueColumn(sheet, rowNumber, c);
      if (targetCol) fields[key] = { row: rowNumber, col: targetCol };
    }
  });

  return fields;
}

function productDataFieldKey(text: string, group: ProductDataBlockContext): string | null {
  if (/respondent/.test(text)) return "respondent";
  if (/base proposal|alternate number|bid type/.test(text)) return "bidType";
  if (/spec\.?\s*led type|led type/.test(text)) return "ledType";
  if (/^model/.test(text)) return "model";
  if (/display name/.test(text)) return "displayName";
  if (/display location|location/.test(text)) return "displayLocation";
  if (/oem led module manufacturer|led module manufacturer/.test(text)) return "oemLedModuleMfr";
  if (/oem processor manufacturer|processor manufacturer/.test(text)) return "oemProcessorMfr";
  if (/factory producing|country of origin|place of manufacture/.test(text)) return "factory";
  if (/led lamp type|die\/package|die package/.test(text)) return "ledLampType";
  if (/virtual|claimed/.test(text)) return "virtualPixelPitch";
  if (/pixel density/.test(text)) return "pixelDensity";
  if (/pixel fill factor/.test(text)) return "pixelFillFactor";
  if (/open area|transparent/.test(text)) return "openArea";
  if (/post-calibration|uniform brightness|brightness level$/.test(text)) return "postCalibrationBrightness";
  if (/brightness level adjustment/.test(text)) return "brightnessAdjustment";
  if (/native color temperature/.test(text)) return "nativeColorTemperature";
  if (/color temperature adjustability/.test(text)) return "colorTempAdjustability";
  if (/power requirements|voltage|phase/.test(text)) return "powerRequirements";
  if (/total display assembly weight|total weight|weight in lbs/.test(text)) return "totalWeight";

  if (group === "activeSize" && /vertical/.test(text)) return "activeHeightFt";
  if (group === "activeSize" && /horizontal/.test(text)) return "activeWidthFt";
  if (group === "physicalSize" && /vertical/.test(text)) return "physicalHeightFt";
  if (group === "physicalSize" && /horizontal/.test(text)) return "physicalWidthFt";
  if (group === "pixelSpacing" && /vertical/.test(text)) return "pixelPitchV";
  if (group === "pixelSpacing" && /horizontal/.test(text)) return "pixelPitchH";
  if (group === "viewingAngle" && /horizontal/.test(text)) return "viewingAngleH";
  if (group === "viewingAngle" && /vertical.*up/.test(text)) return "viewingAngleUp";
  if (group === "viewingAngle" && /vertical.*down/.test(text)) return "viewingAngleDown";
  if (group === "colorSpace" && /rec\s*709/.test(text)) return "colorSpaceRec709";
  if (group === "colorSpace" && /dci.?p3/.test(text)) return "colorSpaceDciP3";
  if (group === "colorSpace" && /rec\s*2020/.test(text)) return "colorSpaceRec2020";
  if (group === "power" && /(?:^|\D)0\s*%|black screen/.test(text)) return "powerAt0";
  if (group === "power" && /avg|typ/.test(text)) return "powerAvg";
  if (group === "power" && /100\s*%|white screen/.test(text)) return "powerAt100";

  return null;
}

type ProductDataBlockContext = "activeSize" | "physicalSize" | "pixelSpacing" | "viewingAngle" | "colorSpace" | "power" | null;

function findProductDataValueColumn(sheet: ExcelJS.Worksheet, rowNumber: number, labelCol: number): number | null {
  const row = sheet.getRow(rowNumber);
  const mergedEnd = mergedCellEndColumn(sheet, rowNumber, labelCol);
  const start = Math.max(labelCol + 1, mergedEnd ? mergedEnd + 1 : labelCol + 1);

  for (let c = start; c <= Math.min(start + 4, 12); c++) {
    const text = normalizeFormText(getCellText(row.getCell(c)));
    if (!text || /^(enter|n\/a|tbd|—|-)$/.test(text)) return c;
    if (/^(ft|px|mm|deg|kw|btu|nits|k|%)$/.test(text)) continue;
    if (productDataFieldKey(text, null)) break;
  }

  return start <= 12 ? start : null;
}

function mergedCellEndColumn(sheet: ExcelJS.Worksheet, rowNumber: number, colNumber: number): number | null {
  const model = sheet.model as any;
  const merges = model?.merges || [];
  for (const merge of merges) {
    const match = String(merge).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;
    const startCol = columnLettersToNumber(match[1]);
    const startRow = parseInt(match[2], 10);
    const endCol = columnLettersToNumber(match[3]);
    const endRow = parseInt(match[4], 10);
    if (rowNumber >= startRow && rowNumber <= endRow && colNumber >= startCol && colNumber <= endCol) {
      return endCol;
    }
  }
  return null;
}

function columnLettersToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

function normalizeFormText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[：:]+$/g, "").trim();
}

function inferProductDataDisplayName(sheet: ExcelJS.Worksheet): string {
  for (let r = 1; r <= Math.min(6, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= 6; c++) {
      const text = getCellText(row.getCell(c)).trim();
      if (/LED[-\w.]+/i.test(text) || /\d+\.?\d*\s*mm/i.test(text)) return text;
    }
  }
  return "";
}

function extractProductDataFormSpecs(workbook: ExcelJS.Workbook): ExtractedLEDSpec[] {
  const summary = extractProductDataSummarySpecs(workbook);
  if (summary.length > 0) return summary;

  const specs: ExtractedLEDSpec[] = [];
  const blocks = detectProductDataBlocks(workbook);
  for (const block of blocks) {
    const parsed = parseSpecFromProductDataTitle(block.displayName || block.sheetName, block.sheetName);
    if (parsed) specs.push(parsed);
  }
  return specs;
}

function extractProductDataSummarySpecs(workbook: ExcelJS.Workbook): ExtractedLEDSpec[] {
  const summarySheet = workbook.worksheets.find((sheet) => /summary/i.test(sheet.name));
  if (!summarySheet) return [];

  let headerRow = 0;
  const colByName: Record<string, number> = {};
  summarySheet.eachRow((row, rowNumber) => {
    if (headerRow) return;
    for (let c = 1; c <= Math.min(12, row.cellCount || 12); c++) {
      const text = normalizeFormText(getCellText(row.getCell(c)));
      if (/display id|display name/.test(text)) colByName.displayId = c;
      else if (/vendor|manufacturer/.test(text)) colByName.vendor = c;
      else if (/model/.test(text)) colByName.model = c;
      else if (/pitch/.test(text)) colByName.pitch = c;
      else if (/size/.test(text)) colByName.size = c;
      else if (/indoor|outdoor/.test(text)) colByName.environment = c;
    }
    if (colByName.displayId && colByName.pitch && colByName.size) headerRow = rowNumber;
  });

  if (!headerRow) return [];

  const specs: ExtractedLEDSpec[] = [];
  for (let r = headerRow + 1; r <= summarySheet.rowCount; r++) {
    const row = summarySheet.getRow(r);
    const name = getCellText(row.getCell(colByName.displayId)).trim();
    if (!name) continue;

    const pitch = parseFirstNumber(getCellText(row.getCell(colByName.pitch)));
    const size = getCellText(row.getCell(colByName.size));
    const dims = parseDimensions(size);
    const envText = colByName.environment ? getCellText(row.getCell(colByName.environment)) : "";
    const vendor = colByName.vendor ? getCellText(row.getCell(colByName.vendor)).trim() : "";
    const model = colByName.model ? getCellText(row.getCell(colByName.model)).trim() : "";

    specs.push(buildExtractedSpec({
      name,
      location: name,
      pitch,
      widthFt: dims?.widthFt ?? null,
      heightFt: dims?.heightFt ?? null,
      environment: /outdoor/i.test(envText) ? "outdoor" : "indoor",
      notes: [vendor, model].filter(Boolean).join(" "),
      citation: `Bid form summary: ${summarySheet.name}, row ${r}`,
    }));
  }

  return specs;
}

function parseSpecFromProductDataTitle(title: string, sheetName: string): ExtractedLEDSpec | null {
  const pitch = parseFirstNumber(title.match(/(\d+\.?\d*)\s*mm/i)?.[0] || "");
  const dims = parseDimensions(title);
  if (pitch == null && !dims) return null;

  return buildExtractedSpec({
    name: sheetName,
    location: sheetName,
    pitch,
    widthFt: dims?.widthFt ?? null,
    heightFt: dims?.heightFt ?? null,
    environment: /outdoor/i.test(title) ? "outdoor" : "indoor",
    notes: title,
    citation: `Bid form sheet title: ${sheetName}`,
  });
}

function buildExtractedSpec(input: {
  name: string;
  location: string;
  pitch: number | null;
  widthFt: number | null;
  heightFt: number | null;
  environment: "indoor" | "outdoor";
  notes: string | null;
  citation: string;
}): ExtractedLEDSpec {
  const widthPx = input.widthFt != null && input.pitch != null
    ? Math.round((input.widthFt * 304.8) / input.pitch)
    : null;
  const heightPx = input.heightFt != null && input.pitch != null
    ? Math.round((input.heightFt * 304.8) / input.pitch)
    : null;

  return {
    name: input.name,
    location: input.location,
    widthFt: input.widthFt,
    heightFt: input.heightFt,
    widthPx,
    heightPx,
    pixelPitchMm: input.pitch,
    brightnessNits: null,
    environment: input.environment,
    quantity: 1,
    serviceType: null,
    mountingType: null,
    maxPowerW: null,
    weightLbs: null,
    specialRequirements: [],
    confidence: 0.85,
    sourcePages: [],
    sourceType: "table",
    citation: input.citation,
    notes: input.notes,
  };
}

// ============================================================================
// BID FORM → EXTRACTED SPECS (use bid form as spec source)
// ============================================================================

/**
 * Extract LED specs directly from the bid form's Column B values.
 * When the RFP technical spec document isn't uploaded, the bid form
 * itself contains all display specs (pixel pitch, dimensions, qty, etc.)
 * in Column B. This converts those into ExtractedLEDSpec[] that can
 * supplement or replace PDF-extracted specs.
 */
export async function extractSpecsFromBidForm(
  bidFormBuffer: Buffer
): Promise<{ specs: ExtractedLEDSpec[]; blockCount: number }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bidFormBuffer);

  const blocks = detectSpecBlocks(workbook);
  if (blocks.length === 0) {
    const productDataSpecs = extractProductDataFormSpecs(workbook);
    if (productDataSpecs.length > 0) {
      return { specs: productDataSpecs, blockCount: productDataSpecs.length };
    }
  }

  const specs: ExtractedLEDSpec[] = [];

  for (const block of blocks) {
    const sheet = workbook.getWorksheet(block.sheetName);
    if (!sheet) continue;

    // Read all spec-column values for this block
    const readSpecCol = (rowNum: number | null): number | null => {
      if (!rowNum) return null;
      const raw = getCellText(sheet.getRow(rowNum).getCell(block.specCol));
      const m = raw.match(/([\d,.]+)/);
      return m ? parseFloat(m[1].replace(/,/g, "")) : null;
    };

    const pitch = block.colBPitch;
    const qty = readSpecCol(block.cells.quantity) ?? 1;
    const pixelH = readSpecCol(block.cells.pixelHeight);
    const pixelL = readSpecCol(block.cells.pixelLength);
    const sysH = readSpecCol(block.cells.systemHeight);
    const sysL = readSpecCol(block.cells.systemLength);
    const nits = readSpecCol(block.cells.brightness);

    // Determine environment from name hints
    const nameLower = block.displayName.toLowerCase();
    const isOutdoor =
      /outdoor|exterior|stadium|field|ribbon|monster|tunnel|zone/i.test(nameLower);

    // Detect alternates
    const isAlternate = /alternate|alt\s*\d/i.test(block.displayName);
    const altMatch = block.displayName.match(/alternate\s*(\d+\w?)|alt\s*(\d+\w?)/i);
    const alternateId = altMatch ? (altMatch[1] || altMatch[2]) : null;

    specs.push({
      name: block.displayName,
      location: block.sheetName !== "BID FORM" ? block.sheetName : "",
      widthFt: sysL,
      heightFt: sysH,
      widthPx: pixelL ? Math.round(pixelL) : null,
      heightPx: pixelH ? Math.round(pixelH) : null,
      pixelPitchMm: pitch,
      brightnessNits: nits,
      environment: isOutdoor ? "outdoor" : "indoor",
      quantity: qty,
      serviceType: null,
      mountingType: null,
      maxPowerW: readSpecCol(block.cells.powerDraw),
      weightLbs: null,
      specialRequirements: [],
      confidence: 0.9, // bid form data is high confidence
      sourcePages: [],
      sourceType: "table",
      citation: `Bid form: ${block.sheetName}, row ${block.headerRow}`,
      notes: "Extracted from bid form Column B (RFP spec values)",
      isAlternate,
      alternateId,
    });
  }

  return { specs, blockCount: blocks.length };
}

// ============================================================================
// MATCHING — Map bid form blocks to extracted RFP screens
// ============================================================================

interface MatchCandidate {
  screen: ExtractedLEDSpec;
  screenIndex: number;
  confidence: number;
}

function findBestMatch(
  block: SpecBlock,
  screens: ExtractedLEDSpec[],
  usedScreens: Set<number>,
  isSingleSheet: boolean = false
): MatchCandidate | null {
  if (isSingleSheet && screens.length === 1 && !usedScreens.has(0)) {
    return { screen: screens[0], screenIndex: 0, confidence: 1 };
  }

  const candidates: MatchCandidate[] = [];

  for (let i = 0; i < screens.length; i++) {
    if (usedScreens.has(i)) continue;

    const screen = screens[i];
    const score = isSingleSheet
      ? computeSingleSheetMatchScore(block, screen)
      : computeMatchScore(block, screen);

    if (score > 0.5) {
      candidates.push({ screen, screenIndex: i, confidence: score });
    }
  }

  if (candidates.length === 0) return null;

  // Return highest confidence
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0];
}

function computeMatchScore(block: SpecBlock, screen: ExtractedLEDSpec): number {
  let score = 0;
  let maxScore = 0;

  // 1. Venue name match (sheet name vs screen location) — heavy weight
  maxScore += 40;
  const venueScore = fuzzyVenueMatch(block.sheetName, screen.location, screen.name);
  score += venueScore * 40;

  // 2. Display name match (block display name vs screen name)
  maxScore += 30;
  const nameScore = fuzzyNameMatch(block.displayName, screen.name);
  score += nameScore * 30;

  // 3. Pixel pitch match
  maxScore += 15;
  if (screen.pixelPitchMm != null) {
    // Read Column B of the pixel pitch row to compare
    // We can't access the workbook here, so compare by name hints
    const blockNameLower = block.displayName.toLowerCase();
    const pitchStr = `${screen.pixelPitchMm}mm`;
    if (blockNameLower.includes(pitchStr) || blockNameLower.includes(`${screen.pixelPitchMm} mm`)) {
      score += 15;
    } else {
      // Partial credit for being in the same venue
      score += venueScore > 0.5 ? 5 : 0;
    }
  }

  // 4. Alternate flag match
  maxScore += 15;
  const isBlockAlternate = /alternate|alt\s*\d/i.test(block.displayName);
  const isScreenAlternate = screen.isAlternate === true;
  if (isBlockAlternate === isScreenAlternate) {
    score += 15;
  } else if (!isBlockAlternate && !isScreenAlternate) {
    score += 15;
  }

  return maxScore > 0 ? score / maxScore : 0;
}

/**
 * Single-sheet matching — for forms like AJP where all blocks are on one sheet.
 * Relies on Column B pitch values and display name tokens instead of venue/sheet matching.
 */
function computeSingleSheetMatchScore(block: SpecBlock, screen: ExtractedLEDSpec): number {
  let score = 0;
  let maxScore = 0;

  // 1. Pixel pitch match from Column B — strongest signal
  maxScore += 35;
  if (block.colBPitch != null && screen.pixelPitchMm != null) {
    if (Math.abs(block.colBPitch - screen.pixelPitchMm) < 0.1) {
      score += 35;
    } else if (Math.abs(block.colBPitch - screen.pixelPitchMm) < 0.5) {
      score += 15;
    }
  }

  // 2. Display name match (block header vs screen name)
  maxScore += 30;
  const nameScore = fuzzyNameMatch(block.displayName, screen.name);
  score += nameScore * 30;

  // 3. Dimension match — compare block displayName hints with screen dimensions
  maxScore += 25;
  const blockNameLower = block.displayName.toLowerCase();
  // Check if dimensions appear in display name (e.g., "32' x 106'")
  const dimMatch = blockNameLower.match(/([\d.]+)['']\s*(?:x|by)\s*([\d.]+)/);
  if (dimMatch && screen.heightFt != null && screen.widthFt != null) {
    const d1 = parseFloat(dimMatch[1]);
    const d2 = parseFloat(dimMatch[2]);
    // Dimensions could be in either order
    if ((Math.abs(d1 - screen.heightFt) < 1 && Math.abs(d2 - screen.widthFt) < 1) ||
        (Math.abs(d1 - screen.widthFt) < 1 && Math.abs(d2 - screen.heightFt) < 1)) {
      score += 25;
    }
  } else {
    // Partial credit if name includes location keywords matching the screen
    const locScore = screen.location
      ? fuzzyNameMatch(block.displayName, screen.location) * 0.5
      : 0;
    score += locScore * 25;
  }

  // 4. Alternate flag match
  maxScore += 10;
  const isBlockAlternate = /alternate|alt\s*\d/i.test(block.displayName);
  const isScreenAlternate = screen.isAlternate === true;
  if (isBlockAlternate === isScreenAlternate) {
    score += 10;
  }

  return maxScore > 0 ? score / maxScore : 0;
}

function fuzzyVenueMatch(sheetName: string, screenLocation: string, screenName: string): number {
  const sheet = sheetName.toLowerCase().replace(/[^a-z]/g, "");
  const loc = screenLocation.toLowerCase().replace(/[^a-z]/g, "");
  const name = screenName.toLowerCase().replace(/[^a-z]/g, "");

  // Direct keywords
  const venueKeywords: Array<[RegExp, string[]]> = [
    [/gersten/i, ["gersten", "pavilion", "centerhung", "baseline", "entrance", "courtside", "concession", "trophy"]],
    [/page|baseball/i, ["page", "baseball", "stadium"]],
    [/smith|softball/i, ["smith", "softball", "field"]],
    [/burns|volleyball|beach/i, ["burns", "volleyball", "beach"]],
    [/tennis/i, ["tennis", "center"]],
  ];

  for (const [sheetPattern, keywords] of venueKeywords) {
    if (sheetPattern.test(sheetName)) {
      // Check if screen location or name contains any keyword from this venue
      for (const kw of keywords) {
        if (loc.includes(kw) || name.includes(kw)) {
          return 1.0;
        }
      }
    }
  }

  // Generic substring match
  if (sheet.length > 3 && (loc.includes(sheet) || name.includes(sheet))) return 0.8;
  if (loc.length > 3 && sheet.includes(loc)) return 0.7;

  return 0;
}

function fuzzyNameMatch(blockName: string, screenName: string): number {
  const a = blockName.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  const b = screenName.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();

  if (a === b) return 1.0;

  // Token overlap
  const tokensA = new Set(a.split(/\s+/).filter((t) => t.length > 2));
  const tokensB = new Set(b.split(/\s+/).filter((t) => t.length > 2));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
    // Partial: check if any token in B contains this token
    else {
      for (const tb of tokensB) {
        if (tb.includes(t) || t.includes(tb)) {
          overlap += 0.5;
          break;
        }
      }
    }
  }

  return overlap / Math.max(tokensA.size, tokensB.size);
}

// ============================================================================
// HEADER / SUMMARY FIELD DETECTION
// ============================================================================

/**
 * Detect header/summary fields above the first spec block on a sheet.
 * These are aggregate-level fields like Vendor Name, LED Price, Installation,
 * General Conditions, LED Manufacturer — not per-display spec fields.
 */
function detectHeaderFields(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  blocks: SpecBlock[]
): HeaderFields | null {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return null;

  // Find the first spec block row on this sheet to bound our scan
  const blocksOnSheet = blocks.filter((b) => b.sheetName === sheetName);
  const firstBlockRow = blocksOnSheet.length > 0
    ? Math.min(...blocksOnSheet.map((b) => b.headerRow))
    : 200; // scan up to row 200 if no spec blocks

  const header: HeaderFields = {
    sheetName,
    vendorName: null,
    ledPrice: null,
    installationPrice: null,
    generalConditions: null,
    installSubcontractor: null,
    ledManufacturer: null,
  };

  // Scan rows above the first spec block
  for (let r = 1; r < firstBlockRow; r++) {
    const row = sheet.getRow(r);
    if (!row) continue;
    const label = getCellText(row.getCell(1));
    if (!label.trim()) continue;

    // Vendor Name
    if (/vendor\s*name/i.test(label) && !/spec/i.test(label)) {
      header.vendorName = r;
    }
    // LED price line (e.g. "LED Tunnel Display", "LED Display", "LED System")
    else if (/^led\b/i.test(label.trim()) && /display|tunnel|system|price/i.test(label)) {
      header.ledPrice = r;
    }
    // Installation price (summary line, not "installation subcontractor")
    else if (/^installation$/i.test(label.trim()) || /^installation\s*price/i.test(label.trim())) {
      header.installationPrice = r;
    }
    // General Conditions
    else if (/general\s*conditions/i.test(label)) {
      header.generalConditions = r;
    }
    // Installation Subcontractor
    else if (/installation\s*subcontractor/i.test(label)) {
      header.installSubcontractor = r;
    }
    // LED Manufacturer (in header, not in spec block)
    else if (/led\s*manufacturer/i.test(label) && !/chip/i.test(label)) {
      header.ledManufacturer = r;
    }
  }

  // Only return if we found at least one header field
  const hasAny = Object.entries(header).some(([k, v]) => k !== "sheetName" && v !== null);
  return hasAny ? header : null;
}

/**
 * Fill header/summary fields with aggregate pricing data and vendor info.
 */
function fillHeaderFields(
  workbook: ExcelJS.Workbook,
  header: HeaderFields,
  screens: ExtractedLEDSpec[],
  pricing?: PricingData[],
  matches?: BidFormMatch[]
): void {
  const sheet = workbook.getWorksheet(header.sheetName);
  if (!sheet) return;

  const C = 3;

  const setHeaderCell = (row: number | null, value: number | string | null) => {
    if (row == null || value == null) return;
    const cell = sheet.getRow(row).getCell(C);
    // Don't overwrite formulas or existing values
    if (cell.type === ExcelJS.ValueType.Formula) return;
    if (cell.value != null && cell.value !== "" && cell.value !== 0) return;
    cell.value = value;
  };

  // Vendor Name → always "ANC Sports Enterprises"
  setHeaderCell(header.vendorName, "ANC Sports Enterprises");

  // Installation Subcontractor → "ANC Sports Enterprises"
  setHeaderCell(header.installSubcontractor, "ANC Sports Enterprises");

  // LED Manufacturer → from the first matched product
  if (header.ledManufacturer && pricing) {
    const firstManuf = pricing.find((p) => p.matchedProduct?.manufacturer)?.matchedProduct?.manufacturer;
    if (firstManuf) {
      setHeaderCell(header.ledManufacturer, firstManuf);
    }
  }

  // Aggregate pricing for summary rows — use SELLING PRICES (with margin)
  if (pricing && pricing.length > 0) {
    // Compute selling prices for each display, then aggregate
    const allSP = pricing.map((p) => computeSellingPrices(p));

    // LED Price → sum of hardware selling prices
    const totalDisplay = allSP.reduce((s, sp) => s + sp.displayPrice, 0);
    setHeaderCell(header.ledPrice, totalDisplay);

    // Installation Price → sum of install selling prices
    const totalInstall = allSP.reduce((s, sp) => s + sp.installPrice, 0);
    setHeaderCell(header.installationPrice, totalInstall);

    // General Conditions → sum of PM/GC selling prices
    const totalGC = allSP.reduce((s, sp) => s + sp.gcPrice, 0);
    setHeaderCell(header.generalConditions, totalGC);
  }
}

// ============================================================================
// CELL FILLING
// ============================================================================

function fillBlockCells(
  workbook: ExcelJS.Workbook,
  block: SpecBlock,
  screen: ExtractedLEDSpec,
  pricing?: PricingData
): { filled: string[]; skipped: string[] } {
  const sheet = workbook.getWorksheet(block.sheetName);
  if (!sheet) return { filled: [], skipped: [] };

  const filled: string[] = [];
  const skipped: string[] = [];

  const setCell = (row: number, col: number, value: number | string | null, fieldName: string) => {
    if (value == null) return;
    const cell = sheet.getRow(row).getCell(col);
    if (cell.type === ExcelJS.ValueType.Formula) return;
    // Never silently overwrite non-empty cells — skip and flag as conflict
    const existingText = typeof cell.value === "string" ? cell.value.trim() : null;
    if (cell.value != null && existingText !== "" && cell.value !== 0) {
      skipped.push(fieldName);
      return;
    }
    cell.value = value;
    filled.push(fieldName);
  };

  const fillCol = block.fillCol;
  const mp = pricing?.matchedProduct;

  // Rename header: "VENDOR NAME" → "ANC" in Column C of the header row
  const headerCell = sheet.getRow(block.headerRow).getCell(fillCol);
  const headerText = getCellText(headerCell);
  if (/vendor\s*name/i.test(headerText)) {
    headerCell.value = "ANC";
  }

  // ─── Column C should contain ACTUAL ANC PRODUCT specs (not RFP specs) ───
  // If we have a matched product, use its real dimensions/resolution.
  // Fall back to RFP specs only if no product match exists.

  // Pixel Pitch — use matched product pitch if available
  const ancPitch = mp?.pitch ?? screen.pixelPitchMm;
  if (ancPitch != null) {
    setCell(block.cells.pixelPitch, fillCol, ancPitch, "Pixel Pitch");
  }

  // Quantity stays the same (ANC proposes same qty as requested)
  setCell(block.cells.quantity, fillCol, screen.quantity, "Quantity");

  // Resolution — use matched product resolution, fall back to RFP
  const ancHeightPx = mp?.resolutionY ?? screen.heightPx;
  const ancWidthPx = mp?.resolutionX ?? screen.widthPx;
  if (ancHeightPx != null) {
    setCell(block.cells.pixelHeight, fillCol, ancHeightPx, "Pixel Height");
  }
  if (ancWidthPx != null) {
    setCell(block.cells.pixelLength, fillCol, ancWidthPx, "Pixel Length");
  }

  // Physical dimensions — use matched product active dimensions, fall back to RFP
  const ancHeightFt = mp?.activeHeightFt ?? screen.heightFt;
  const ancWidthFt = mp?.activeWidthFt ?? screen.widthFt;
  if (ancHeightFt != null) {
    setCell(block.cells.systemHeight, fillCol, Math.round(ancHeightFt * 100) / 100, "System Height (ft)");
  }
  if (ancWidthFt != null) {
    setCell(block.cells.systemLength, fillCol, Math.round(ancWidthFt * 100) / 100, "System Length (ft)");
  }

  // Computed derived fields from ANC specs
  if (ancHeightPx != null && ancWidthPx != null && block.cells.totalPixels) {
    setCell(block.cells.totalPixels, fillCol, ancHeightPx * ancWidthPx, "Total Pixels");
  }
  if (ancHeightFt != null && ancWidthFt != null && block.cells.totalSqFt) {
    const totalSqFt = Math.round(ancHeightFt * ancWidthFt);
    setCell(block.cells.totalSqFt, fillCol, totalSqFt, "Total Sq. Ft");
  }
  if (ancHeightPx != null && ancWidthPx != null && ancHeightFt != null && ancWidthFt != null && block.cells.pixelDensity) {
    const totalPx = ancHeightPx * ancWidthPx;
    const totalSqFt = ancHeightFt * ancWidthFt;
    const density = totalSqFt > 0 ? Math.round(totalPx / totalSqFt) : 0;
    setCell(block.cells.pixelDensity, fillCol, density, "Pixel Density Sq. Ft");
  }

  // Extended spec fields — prefer matched product data, fall back to RFP data
  if (block.cells.brightness) {
    const nits = mp?.nits ?? screen.brightnessNits;
    if (nits != null) {
      setCell(block.cells.brightness, fillCol, nits, "Brightness (nits)");
    }
  }

  if (block.cells.powerDraw) {
    const power = mp?.totalMaxPowerW ?? screen.maxPowerW;
    if (power != null) {
      setCell(block.cells.powerDraw, fillCol, Math.round(power), "Power Draw");
    }
  }

  // Manufacturer fields
  if (block.cells.ledManufacturer && mp?.manufacturer) {
    setCell(block.cells.ledManufacturer, fillCol, mp.manufacturer, "LED Manufacturer");
  }
  if (block.cells.chipManufacturer) {
    // Chip manufacturer is a sub-component detail — not in our catalog
    // Common defaults: NationStar for most Chinese LED panels
    // Only fill if we have a matched product (so we know it's real data)
    // For now, leave blank — will fill when catalog has this field
  }

  // Viewing angles — from rate card (Natalia/Jeremy rules)
  const isOutdoor = screen.environment === "outdoor";
  if (block.cells.viewAngleH) {
    const viewH = isOutdoor
      ? getRateSync("spec.viewing_angle.outdoor_h")
      : getRateSync("spec.viewing_angle.indoor_h");
    setCell(block.cells.viewAngleH, fillCol, viewH, "Viewing Angle H");
  }
  if (block.cells.viewAngleV) {
    const viewV = isOutdoor
      ? getRateSync("spec.viewing_angle.outdoor_v_up")
      : getRateSync("spec.viewing_angle.indoor_v");
    setCell(block.cells.viewAngleV, fillCol, viewV, "Viewing Angle V");
  }

  // Pricing fields — use SELLING PRICES (with margin), not internal costs
  if (pricing) {
    const sp = computeSellingPrices(pricing);
    if (block.cells.totalDisplayPrice) {
      setCell(block.cells.totalDisplayPrice, fillCol, sp.displayPrice, "Total Display Price");
    }
    if (block.cells.processingController && sp.processingPrice) {
      setCell(block.cells.processingController, fillCol, sp.processingPrice, "Processing/Controller");
    }
    if (block.cells.shippingHandling && sp.shippingPrice) {
      setCell(block.cells.shippingHandling, fillCol, sp.shippingPrice, "Shipping & Handling");
    }
    if (block.cells.totalSystemPrice) {
      setCell(block.cells.totalSystemPrice, fillCol, sp.totalPrice, "Total System Price");
    }
    if (block.cells.installationSubtotal && sp.installPrice) {
      setCell(block.cells.installationSubtotal, fillCol, sp.installPrice, "Installation Sub-Total");
    }
  }

  return { filled, skipped };
}

function fillProductDataFormWorkbook(
  workbook: ExcelJS.Workbook,
  blocks: ProductDataBlock[],
  screens: ExtractedLEDSpec[],
  pricing?: PricingData[]
): Omit<BidFormFillResult, "buffer"> {
  const matches: BidFormMatch[] = [];
  const unmatchedBlocks: string[] = [];
  const usedScreens = new Set<number>();

  const templateOnly =
    blocks.length === 1 &&
    screens.length > 1 &&
    /product\s*data\s*form|template/i.test(blocks[0].sheetName);

  if (templateOnly) {
    const templateSheet = workbook.getWorksheet(blocks[0].sheetName);
    if (templateSheet) {
      for (let i = 1; i < screens.length; i++) {
        const name = safeWorksheetName(screens[i].name || `Display ${i + 1}`);
        cloneWorksheet(templateSheet, workbook, name);
      }
      const firstName = safeWorksheetName(screens[0].name || "Display 1");
      templateSheet.name = firstName;
    }
    blocks = detectProductDataBlocks(workbook);
  }

  const isSingleSheet = new Set(blocks.map((b) => b.sheetName)).size === 1;

  for (const block of blocks) {
    const match = findBestProductDataMatch(block, screens, usedScreens, isSingleSheet);
    if (!match) {
      unmatchedBlocks.push(`${block.sheetName}: ${block.displayName}`);
      continue;
    }

    usedScreens.add(match.screenIndex);
    const pricingForScreen = pricing?.find(
      (p) => p.name.toLowerCase() === match.screen.name.toLowerCase()
    );
    const { filled, skipped } = fillProductDataBlock(workbook, block, match.screen, pricingForScreen);

    matches.push({
      sheetName: block.sheetName,
      displayName: block.displayName,
      matchedScreen: match.screen.name,
      confidence: match.confidence,
      fieldsFilled: filled,
      fieldsSkipped: skipped,
    });
  }

  const unmatchedScreens = screens
    .filter((_, i) => !usedScreens.has(i))
    .map((s) => s.name);

  return {
    matches,
    unmatchedBlocks,
    unmatchedScreens,
    totalBlocks: blocks.length,
    totalScreens: screens.length,
  };
}

function findBestProductDataMatch(
  block: ProductDataBlock,
  screens: ExtractedLEDSpec[],
  usedScreens: Set<number>,
  isSingleSheet: boolean
): MatchCandidate | null {
  if (isSingleSheet && screens.length === 1 && !usedScreens.has(0)) {
    return { screen: screens[0], screenIndex: 0, confidence: 1 };
  }

  const candidates: MatchCandidate[] = [];
  for (let i = 0; i < screens.length; i++) {
    if (usedScreens.has(i)) continue;
    const screen = screens[i];
    const nameScore = Math.max(
      fuzzyNameMatch(block.sheetName, screen.name),
      fuzzyNameMatch(block.displayName, screen.name),
      screen.location ? fuzzyNameMatch(block.sheetName, screen.location) : 0
    );
    if (nameScore > 0.35) candidates.push({ screen, screenIndex: i, confidence: nameScore });
  }

  if (candidates.length === 0) {
    const nextIndex = screens.findIndex((_, i) => !usedScreens.has(i));
    return nextIndex >= 0 ? { screen: screens[nextIndex], screenIndex: nextIndex, confidence: 0.55 } : null;
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0];
}

function fillProductDataBlock(
  workbook: ExcelJS.Workbook,
  block: ProductDataBlock,
  screen: ExtractedLEDSpec,
  pricing?: PricingData
): { filled: string[]; skipped: string[] } {
  const sheet = workbook.getWorksheet(block.sheetName);
  if (!sheet) return { filled: [], skipped: [] };

  const filled: string[] = [];
  const skipped: string[] = [];
  const mp = pricing?.matchedProduct;
  const isOutdoor = screen.environment === "outdoor";
  const activeWidthFt = mp?.activeWidthFt ?? screen.activeWidthFt ?? screen.widthFt;
  const activeHeightFt = mp?.activeHeightFt ?? screen.activeHeightFt ?? screen.heightFt;
  const widthPx = mp?.resolutionX ?? screen.widthPx;
  const heightPx = mp?.resolutionY ?? screen.heightPx;
  const pitch = mp?.pitch ?? screen.pixelPitchMm;
  const maxPowerW = mp?.totalMaxPowerW ?? screen.maxPowerW;
  const totalSqFt = activeWidthFt != null && activeHeightFt != null ? activeWidthFt * activeHeightFt : null;
  const pixelDensity = totalSqFt && widthPx != null && heightPx != null
    ? Math.round((widthPx * heightPx) / totalSqFt)
    : null;

  const values: Record<string, string | number | null | undefined> = {
    respondent: "ANC Sports Enterprises",
    bidType: screen.isAlternate ? `Alternate ${screen.alternateId || ""}`.trim() : "Base Proposal",
    ledType: pitch != null ? `${pitch}mm ${isOutdoor ? "Outdoor" : "Indoor"} LED Display` : `${isOutdoor ? "Outdoor" : "Indoor"} LED Display`,
    model: mp?.model || screen.selectedProductName || null,
    displayName: screen.name,
    displayLocation: screen.location || screen.name,
    oemLedModuleMfr: mp?.manufacturer || null,
    oemProcessorMfr: "NovaStar",
    factory: mp?.manufacturer ? `${mp.manufacturer}` : null,
    ledLampType: isOutdoor ? "SMD (Surface-Mount Device) - IP rated package" : "SMD (Surface-Mount Device)",
    activeHeightFt: round2(activeHeightFt),
    activeWidthFt: round2(activeWidthFt),
    physicalHeightFt: round2(activeHeightFt),
    physicalWidthFt: round2(activeWidthFt),
    pixelPitchV: pitch,
    pixelPitchH: pitch,
    virtualPixelPitch: "N/A",
    pixelDensity,
    viewingAngleH: isOutdoor ? getRateSync("spec.viewing_angle.outdoor_h") : getRateSync("spec.viewing_angle.indoor_h"),
    viewingAngleUp: isOutdoor ? getRateSync("spec.viewing_angle.outdoor_v_up") : getRateSync("spec.viewing_angle.indoor_v"),
    viewingAngleDown: isOutdoor ? getRateSync("spec.viewing_angle.outdoor_v_down") : getRateSync("spec.viewing_angle.indoor_v"),
    pixelFillFactor: `${getRateSync("spec.pixel_fill_factor")}%`,
    openArea: "N/A",
    postCalibrationBrightness: mp?.nits ?? screen.brightnessNits,
    brightnessAdjustment: "0-100% (256 steps)",
    nativeColorTemperature: "3,200K-9,300K",
    colorTempAdjustability: "3,200K-9,300K",
    colorSpaceRec709: `${getRateSync("spec.color_space.rec709")}%`,
    colorSpaceDciP3: `${getRateSync("spec.color_space.dci_p3")}%`,
    colorSpaceRec2020: `${getRateSync("spec.color_space.rec2020")}%`,
    powerAt0: maxPowerW != null ? round2((maxPowerW * getRateSync("spec.power_idle_ratio")) / 1000) : null,
    powerAvg: maxPowerW != null ? round2((maxPowerW * getRateSync("spec.power_avg_ratio")) / 1000) : null,
    powerAt100: maxPowerW != null ? round2(maxPowerW / 1000) : null,
    powerRequirements: "AC 100-240V, 50/60Hz, Single Phase",
    totalWeight: screen.weightLbs != null ? `${Math.round(screen.weightLbs)} lbs` : null,
  };

  for (const [fieldKey, field] of Object.entries(block.fields)) {
    const value = values[fieldKey];
    if (value == null || value === "") continue;

    const cell = sheet.getRow(field.row).getCell(field.col);
    if (cell.type === ExcelJS.ValueType.Formula) {
      skipped.push(fieldKey);
      continue;
    }
    if (cell.value != null && cell.value !== "" && cell.value !== 0) {
      skipped.push(fieldKey);
      continue;
    }
    cell.value = value;
    filled.push(fieldKey);
  }

  return { filled, skipped };
}

function cloneWorksheet(sourceWs: ExcelJS.Worksheet, workbook: ExcelJS.Workbook, newName: string): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet(newName);

  sourceWs.columns.forEach((col, i) => {
    const targetCol = ws.getColumn(i + 1);
    if (col.width) targetCol.width = col.width;
    if (col.hidden) targetCol.hidden = col.hidden;
  });

  const sourceModel = sourceWs.model as any;
  for (const merge of sourceModel?.merges || []) {
    try {
      ws.mergeCells(merge);
    } catch {
      // Ignore invalid duplicate merge metadata from malformed templates.
    }
  }

  sourceWs.eachRow({ includeEmpty: true }, (sourceRow, rowNumber) => {
    const targetRow = ws.getRow(rowNumber);
    targetRow.height = sourceRow.height;
    sourceRow.eachCell({ includeEmpty: true }, (sourceCell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.value = sourceCell.value;
      targetCell.style = { ...sourceCell.style };
    });
  });

  return ws;
}

function safeWorksheetName(name: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, " ").trim() || "Display";
  return cleaned.slice(0, 31);
}

function round2(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value * 100) / 100;
}

function parseFirstNumber(text: string): number | null {
  const match = text.match(/([\d,.]+)/);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}

function parseDimensions(text: string): { heightFt: number; widthFt: number } | null {
  const hw = text.match(/(\d+\.?\d*)\s*['′]?\s*h\s*x\s*(\d+\.?\d*)\s*['′]?\s*w/i);
  if (hw) return { heightFt: parseFloat(hw[1]), widthFt: parseFloat(hw[2]) };

  const generic = text.match(/(\d+\.?\d*)\s*['′]\s*(?:x|by)\s*(\d+\.?\d*)\s*['′]/i);
  if (generic) return { heightFt: parseFloat(generic[1]), widthFt: parseFloat(generic[2]) };

  return null;
}

// ============================================================================
// HELPERS
// ============================================================================

function getCellText(cell: ExcelJS.Cell): string {
  if (cell.value == null) return "";
  if (typeof cell.value === "string") return cell.value;
  if (typeof cell.value === "number") return String(cell.value);
  if (typeof cell.value === "object" && "result" in cell.value) {
    // Formula cell — return the cached result
    return String((cell.value as any).result ?? "");
  }
  if (typeof cell.value === "object" && "richText" in cell.value) {
    const richText = (cell.value as any).richText;
    if (Array.isArray(richText)) {
      return richText
        .map((rt: any) => rt?.text ?? "")
        .join("");
    }
  }
  return String(cell.value);
}
