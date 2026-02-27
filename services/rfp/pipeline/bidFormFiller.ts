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
    installationLabor: number | null;
    installationStructural: number | null;
    installationElectrical: number | null;
  };
  /** Column B pitch value (for single-sheet matching) */
  colBPitch: number | null;
}

/** Result of matching a spec block to an extracted screen */
export interface BidFormMatch {
  sheetName: string;
  displayName: string;
  matchedScreen: string; // Name of the matched ExtractedLEDSpec
  confidence: number; // 0-1
  fieldsFilled: string[];
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
  installCost?: number;
  totalCost: number;
  totalSellingPrice: number;
}

export async function fillBidForm(
  bidFormBuffer: Buffer,
  screens: ExtractedLEDSpec[],
  pricing?: PricingData[]
): Promise<BidFormFillResult> {
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
      const fieldsFilled = fillBlockCells(workbook, block, match.screen, pricingForScreen);
      matches.push({
        sheetName: block.sheetName,
        displayName: block.displayName,
        matchedScreen: match.screen.name,
        confidence: match.confidence,
        fieldsFilled,
      });
    } else {
      unmatchedBlocks.push(`${block.sheetName}: ${block.displayName}`);
    }
  }

  // Find unmatched screens
  const unmatchedScreens = screens
    .filter((_, i) => !usedScreens.has(i))
    .map((s) => s.name);

  // Step 3: Write the filled workbook
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
          installationLabor: null as number | null,
          installationStructural: null as number | null,
          installationElectrical: null as number | null,
        };

        // Read Column B pitch value for matching
        const colBPitchRaw = getCellText(sheet.getRow(rowNumber).getCell(2));
        const pitchMatch = colBPitchRaw.match(/([\d.]+)\s*(?:mm)?/);
        const colBPitch = pitchMatch ? parseFloat(pitchMatch[1]) : null;

        // Search within a 30-row window for each field
        // Stop early if we hit the next PIXEL PITCH anchor (next block boundary)
        for (let r = rowNumber + 1; r <= rowNumber + 30; r++) {
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
          // Pricing fields
          else if (/total\s*display\s*price/i.test(label)) {
            cells.totalDisplayPrice = r;
          } else if (/processing|controller/i.test(label) && !/power/i.test(label)) {
            cells.processingController = r;
          } else if (/shipping|handling/i.test(label)) {
            cells.shippingHandling = r;
          } else if (/total\s*system\s*price/i.test(label)) {
            cells.totalSystemPrice = r;
          } else if (/installation.*labor/i.test(label) || /labor.*install/i.test(label)) {
            cells.installationLabor = r;
          } else if (/installation.*structural/i.test(label) || /structural.*install/i.test(label)) {
            cells.installationStructural = r;
          } else if (/installation.*electrical/i.test(label) || /electrical.*install/i.test(label)) {
            cells.installationElectrical = r;
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

    if (score > 0.3) {
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
// CELL FILLING
// ============================================================================

function fillBlockCells(
  workbook: ExcelJS.Workbook,
  block: SpecBlock,
  screen: ExtractedLEDSpec,
  pricing?: PricingData
): string[] {
  const sheet = workbook.getWorksheet(block.sheetName);
  if (!sheet) return [];

  const filled: string[] = [];

  // Helper: set cell value while preserving existing formatting
  const setCell = (row: number, col: number, value: number | string | null, fieldName: string) => {
    if (value == null) return;
    const cell = sheet.getRow(row).getCell(col);
    // Don't overwrite formulas
    if (cell.type === ExcelJS.ValueType.Formula) return;
    cell.value = value;
    filled.push(fieldName);
  };

  // Column C = 3
  const C = 3;

  // Core spec fields
  if (screen.pixelPitchMm != null) {
    setCell(block.cells.pixelPitch, C, screen.pixelPitchMm, "Pixel Pitch");
  }

  setCell(block.cells.quantity, C, screen.quantity, "Quantity");

  if (screen.heightPx != null) {
    setCell(block.cells.pixelHeight, C, screen.heightPx, "Pixel Height");
  }

  if (screen.widthPx != null) {
    setCell(block.cells.pixelLength, C, screen.widthPx, "Pixel Length");
  }

  if (screen.heightFt != null) {
    setCell(block.cells.systemHeight, C, screen.heightFt, "System Height (ft)");
  }

  if (screen.widthFt != null) {
    setCell(block.cells.systemLength, C, screen.widthFt, "System Length (ft)");
  }

  // Extended spec fields
  if (screen.brightnessNits != null && block.cells.brightness) {
    setCell(block.cells.brightness, C, screen.brightnessNits, "Brightness (nits)");
  }

  if (screen.maxPowerW != null && block.cells.powerDraw) {
    setCell(block.cells.powerDraw, C, screen.maxPowerW, "Power Draw");
  }

  // Pricing fields — only fill if pricing data is available
  if (pricing) {
    if (block.cells.totalDisplayPrice) {
      setCell(block.cells.totalDisplayPrice, C, pricing.hardwareCost, "Total Display Price");
    }
    if (block.cells.totalSystemPrice) {
      setCell(block.cells.totalSystemPrice, C, pricing.totalCost, "Total System Price");
    }
    if (block.cells.installationLabor && pricing.installCost) {
      setCell(block.cells.installationLabor, C, pricing.installCost, "Installation Labor");
    }
  }

  return filled;
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
    return (cell.value as any).richText
      .map((rt: any) => rt.text)
      .join("");
  }
  return String(cell.value);
}
