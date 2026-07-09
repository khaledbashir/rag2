import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { fillBidForm } from "./bidFormFiller";
import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";

/**
 * UNC Kenan Stadium bid form — block↔screen matching (Natalia 2026-07-09).
 *
 * She reported "still a lot of missed info and errors" on the generated form.
 * Three of seven blocks came out empty and two were filled with the wrong
 * display, because matching scored pitch heaviest and assigned greedily:
 *
 *   - Column B carries the RFP's *requested* pitch, 10mm for every block here,
 *     so pitch cannot discriminate at all. ANC proposes 10.41mm for the video
 *     displays, which made the correct screen score *lower* than a 10mm ribbon.
 *   - Blocks were matched in order, each consuming the best remaining screen, so
 *     one bad early match cascaded into empty blocks downstream.
 *
 * Column B's physical dimensions do discriminate — they're the RFP's requested
 * size, and the vendor's proposal is within a few percent of it. Expected
 * mapping below is taken from the "BID FORM (BAFO)" sheet of
 * "UNC - Kenan Stadium RFP - Cost Analysis - JSR - 2026-03-06.xlsx", which a
 * human filled in.
 */

const UNC_SCREENS: ExtractedLEDSpec[] = [
  mk("Blue Zone Led Video Display - 32' H x 106' W - 10mm", 10.41, 106.63, 32.81, 1),
  mk("Alternate #1: Blue Zone Led Video Display - 32' H x 106' W - 8mm", 8.333, 106.63, 32.81, 1),
  mk("East End Zone LED Video Display - 32' H x 106' W - 10mm", 10.41, 106.63, 32.81, 1),
  mk("Alternate #2: East End Zone LED Video Display - 32' H x 106' W - 8mm", 8.333, 106.63, 32.81, 1),
  mk("Sideline Ribbon Displays - Two (2) - 3' H x 252' W - 10mm", 10, 251.97, 2.95, 2),
  mk("Monster Ribbon Display - Two (2) - 5' H x 130' W - 10mm", 10.41, 129.59, 5.47, 2),
  mk("Blue Zone Lower Tunnel Ribbons - Two (2) - 3' H x 19' W - 10mm", 10, 18.37, 2.95, 2),
  mk("Blue Zone Lower Center Ribbons - Two (2) - 3' H x 73' W - 10mm", 10, 73.49, 2.95, 2),
  mk("Blue Zone Upper Center Ribbon - 3' H x 244' W - 10mm", 10, 244.09, 2.95, 1),
];

function mk(
  name: string,
  pixelPitchMm: number,
  widthFt: number,
  heightFt: number,
  quantity: number,
): ExtractedLEDSpec {
  return {
    name,
    location: null,
    widthFt,
    heightFt,
    widthPx: null,
    heightPx: null,
    pixelPitchMm,
    brightnessNits: null,
    environment: "outdoor",
    quantity,
    serviceType: null,
    mountingType: null,
    maxPowerW: null,
    weightLbs: null,
    specialRequirements: [],
    confidence: 0.9,
    sourcePages: [],
    sourceType: "table",
    citation: "UNC LED Cost Sheet",
    notes: null,
  } as ExtractedLEDSpec;
}

/**
 * Block header (as it appears in Column A) → substring of the screen that belongs in it.
 * Seven base-bid blocks plus the two increased-resolution alternate blocks.
 */
const EXPECTED: Array<[string, string]> = [
  ["BLUE ZONE LED VIDEO DISPLAY", "Blue Zone Led Video Display"],
  ["EAST END ZONE LED VIDEO DISPLAY", "East End Zone LED Video Display"],
  ["SIDELINE RIBBON DISPLAYS", "Sideline Ribbon Displays"],
  ["MONSTER RIBBON LDISPLAYS", "Monster Ribbon Display"],
  ["BLUE ZONE LOWER RIBBON DISPLAYS", "Blue Zone Lower Center Ribbons"],
  ["BLUE ZONE TUNNEL RIBBON DISPLAYS", "Blue Zone Lower Tunnel Ribbons"],
  ["BLUE ZONE RIBBON DISPLAY", "Blue Zone Upper Center Ribbon"],
  ["ALTERNATE 1A: INCREASED RESOLUTION BLUE ZONE LED VIDEO DISPLAY", "Alternate #1: Blue Zone"],
  ["ALTERNATE 1B: INCREASE RESOLUTION EAST END ZONE LED VIDEO DISPLAY", "Alternate #2: East End Zone"],
];

/** Blocks that must carry a base-bid screen, never an alternate. */
const BASE_BID_BLOCKS = EXPECTED.slice(0, 7).map(([name]) => name);

describe("UNC Kenan Stadium bid form matching", () => {
  it("maps every display block to the correct screen", async () => {
    const buffer = fs.readFileSync(
      path.join(process.cwd(), "test-fixtures/rfp/unc-bid-form.xlsx"),
    );
    const result = await fillBidForm(buffer, UNC_SCREENS);

    expect(result.matches.length).toBe(EXPECTED.length);

    for (const [blockName, expectedScreen] of EXPECTED) {
      const match = result.matches.find((m) => m.displayName.trim() === blockName);
      expect(match, `no match for block "${blockName}"`).toBeTruthy();
      expect(match!.matchedScreen, `block "${blockName}" got the wrong screen`).toContain(expectedScreen);
    }

    expect(result.unmatchedBlocks).toEqual([]);
    expect(result.unmatchedScreens).toEqual([]);
  });

  it("never assigns an alternate screen to a base-bid block", async () => {
    const buffer = fs.readFileSync(
      path.join(process.cwd(), "test-fixtures/rfp/unc-bid-form.xlsx"),
    );
    const result = await fillBidForm(buffer, UNC_SCREENS);

    for (const blockName of BASE_BID_BLOCKS) {
      const match = result.matches.find((m) => m.displayName.trim() === blockName);
      expect(match!.matchedScreen, `alternate leaked into "${blockName}"`).not.toMatch(/^Alternate #/);
    }
  });

  it("assigns each screen to at most one block", async () => {
    const buffer = fs.readFileSync(
      path.join(process.cwd(), "test-fixtures/rfp/unc-bid-form.xlsx"),
    );
    const result = await fillBidForm(buffer, UNC_SCREENS);

    const used = result.matches.map((m) => m.matchedScreen);
    expect(new Set(used).size).toBe(used.length);
  });
});
