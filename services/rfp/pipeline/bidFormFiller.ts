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
  };
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

export async function fillBidForm(
  bidFormBuffer: Buffer,
  screens: ExtractedLEDSpec[]
): Promise<BidFormFillResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bidFormBuffer);

  // Step 1: Detect all spec blocks across all sheets
  const blocks = detectSpecBlocks(workbook);

  // Step 2: Match each block to an extracted screen
  const usedScreens = new Set<number>();
  const matches: BidFormMatch[] = [];
  const unmatchedBlocks: string[] = [];

  for (const block of blocks) {
    const match = findBestMatch(block, screens, usedScreens);
    if (match) {
      usedScreens.add(match.screenIndex);
      const fieldsFilled = fillBlockCells(workbook, block, match.screen);
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
        };

        // Search within a 30-row window for each field
        for (let r = rowNumber + 1; r <= rowNumber + 30; r++) {
          const rowObj = sheet.getRow(r);
          if (!rowObj) break;
          const label = getCellText(rowObj.getCell(1));

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
        }

        // Only add if we found the core fields
        if (cells.quantity && cells.pixelHeight && cells.pixelLength) {
          blocks.push({
            sheetName,
            displayName: headerA || `Display at row ${headerRow}`,
            headerRow,
            cells,
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
  usedScreens: Set<number>
): MatchCandidate | null {
  const candidates: MatchCandidate[] = [];

  for (let i = 0; i < screens.length; i++) {
    if (usedScreens.has(i)) continue;

    const screen = screens[i];
    const score = computeMatchScore(block, screen);

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
  screen: ExtractedLEDSpec
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
