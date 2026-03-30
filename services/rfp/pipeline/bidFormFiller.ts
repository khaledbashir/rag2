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

    // Scan for "PIXEL PITCH" labels in Column A — that's the anchor
    sheet.eachRow((row, rowNumber) => {
      const cellA = getCellText(row.getCell(1));

      if (/pixel\s*pitch/i.test(cellA)) {
        // Found a spec block. The header is the row above.
        const headerRow = rowNumber - 1;
        const headerA = getCellText(sheet.getRow(headerRow).getCell(1));

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
        const colBPitchRaw = getCellText(sheet.getRow(rowNumber).getCell(2));
        const pitchMatch = colBPitchRaw.match(/([\d.]+)\s*(?:mm)?/);
        const colBPitch = pitchMatch ? parseFloat(pitchMatch[1]) : null;

        // Search within a 50-row window for each field (expanded for installation rows)
        // Stop early if we hit the next PIXEL PITCH anchor (next block boundary)
        for (let r = rowNumber + 1; r <= rowNumber + 50; r++) {
          const rowObj = sheet.getRow(r);
          if (!rowObj) break;
          const label = getCellText(rowObj.getCell(1));

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
          });
        }
      }
    });
  });

  return blocks;
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
  const specs: ExtractedLEDSpec[] = [];

  for (const block of blocks) {
    const sheet = workbook.getWorksheet(block.sheetName);
    if (!sheet) continue;

    // Read all Column B values for this block
    const readColB = (rowNum: number | null): number | null => {
      if (!rowNum) return null;
      const raw = getCellText(sheet.getRow(rowNum).getCell(2));
      const m = raw.match(/([\d,.]+)/);
      return m ? parseFloat(m[1].replace(/,/g, "")) : null;
    };

    const pitch = block.colBPitch;
    const qty = readColB(block.cells.quantity) ?? 1;
    const pixelH = readColB(block.cells.pixelHeight);
    const pixelL = readColB(block.cells.pixelLength);
    const sysH = readColB(block.cells.systemHeight);
    const sysL = readColB(block.cells.systemLength);
    const nits = readColB(block.cells.brightness);

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
      maxPowerW: readColB(block.cells.powerDraw),
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

  // Aggregate pricing for summary rows
  if (pricing && pricing.length > 0) {
    // LED Price → sum of hardware selling prices (what client pays for displays)
    const totalHardware = pricing.reduce((s, p) => s + (p.hardwareCost || 0), 0);
    setHeaderCell(header.ledPrice, totalHardware);

    // Installation Price → sum of install costs
    const totalInstall = pricing.reduce((s, p) => s + (p.installCost || 0), 0);
    setHeaderCell(header.installationPrice, totalInstall);

    // General Conditions → sum of PM/GC costs
    const totalGC = pricing.reduce((s, p) => s + (p.pmCost || 0), 0);
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
    if (cell.value != null && cell.value !== "" && cell.value !== 0) {
      skipped.push(fieldName);
      return;
    }
    cell.value = value;
    filled.push(fieldName);
  };

  // Column C = 3
  const C = 3;
  const mp = pricing?.matchedProduct;

  // Rename header: "VENDOR NAME" → "ANC" in Column C of the header row
  const headerCell = sheet.getRow(block.headerRow).getCell(C);
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
    setCell(block.cells.pixelPitch, C, ancPitch, "Pixel Pitch");
  }

  // Quantity stays the same (ANC proposes same qty as requested)
  setCell(block.cells.quantity, C, screen.quantity, "Quantity");

  // Resolution — use matched product resolution, fall back to RFP
  const ancHeightPx = mp?.resolutionY ?? screen.heightPx;
  const ancWidthPx = mp?.resolutionX ?? screen.widthPx;
  if (ancHeightPx != null) {
    setCell(block.cells.pixelHeight, C, ancHeightPx, "Pixel Height");
  }
  if (ancWidthPx != null) {
    setCell(block.cells.pixelLength, C, ancWidthPx, "Pixel Length");
  }

  // Physical dimensions — use matched product active dimensions, fall back to RFP
  const ancHeightFt = mp?.activeHeightFt ?? screen.heightFt;
  const ancWidthFt = mp?.activeWidthFt ?? screen.widthFt;
  if (ancHeightFt != null) {
    setCell(block.cells.systemHeight, C, Math.round(ancHeightFt * 100) / 100, "System Height (ft)");
  }
  if (ancWidthFt != null) {
    setCell(block.cells.systemLength, C, Math.round(ancWidthFt * 100) / 100, "System Length (ft)");
  }

  // Computed derived fields from ANC specs
  if (ancHeightPx != null && ancWidthPx != null && block.cells.totalPixels) {
    setCell(block.cells.totalPixels, C, ancHeightPx * ancWidthPx, "Total Pixels");
  }
  if (ancHeightFt != null && ancWidthFt != null && block.cells.totalSqFt) {
    const totalSqFt = Math.round(ancHeightFt * ancWidthFt);
    setCell(block.cells.totalSqFt, C, totalSqFt, "Total Sq. Ft");
  }
  if (ancHeightPx != null && ancWidthPx != null && ancHeightFt != null && ancWidthFt != null && block.cells.pixelDensity) {
    const totalPx = ancHeightPx * ancWidthPx;
    const totalSqFt = ancHeightFt * ancWidthFt;
    const density = totalSqFt > 0 ? Math.round(totalPx / totalSqFt) : 0;
    setCell(block.cells.pixelDensity, C, density, "Pixel Density Sq. Ft");
  }

  // Extended spec fields — prefer matched product data, fall back to RFP data
  if (block.cells.brightness) {
    const nits = mp?.nits ?? screen.brightnessNits;
    if (nits != null) {
      setCell(block.cells.brightness, C, nits, "Brightness (nits)");
    }
  }

  if (block.cells.powerDraw) {
    const power = mp?.totalMaxPowerW ?? screen.maxPowerW;
    if (power != null) {
      setCell(block.cells.powerDraw, C, Math.round(power), "Power Draw");
    }
  }

  // Manufacturer fields
  if (block.cells.ledManufacturer && mp?.manufacturer) {
    setCell(block.cells.ledManufacturer, C, mp.manufacturer, "LED Manufacturer");
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
    setCell(block.cells.viewAngleH, C, viewH, "Viewing Angle H");
  }
  if (block.cells.viewAngleV) {
    const viewV = isOutdoor
      ? getRateSync("spec.viewing_angle.outdoor_v_up")
      : getRateSync("spec.viewing_angle.indoor_v");
    setCell(block.cells.viewAngleV, C, viewV, "Viewing Angle V");
  }

  // Pricing fields — only fill if pricing data is available
  if (pricing) {
    if (block.cells.totalDisplayPrice) {
      setCell(block.cells.totalDisplayPrice, C, pricing.hardwareCost, "Total Display Price");
    }
    if (block.cells.processingController && pricing.processingCost) {
      setCell(block.cells.processingController, C, pricing.processingCost, "Processing/Controller");
    }
    if (block.cells.shippingHandling && pricing.shippingCost) {
      setCell(block.cells.shippingHandling, C, pricing.shippingCost, "Shipping & Handling");
    }
    if (block.cells.totalSystemPrice) {
      setCell(block.cells.totalSystemPrice, C, pricing.totalSellingPrice, "Total System Price");
    }
    if (block.cells.installationSubtotal && pricing.installCost) {
      setCell(block.cells.installationSubtotal, C, pricing.installCost, "Installation Sub-Total");
    }
  }

  return { filled, skipped };
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
