/**
 * The placement decision, tested against pages whose ink we control exactly.
 *
 * These are the cases that made the old told-a-corner behaviour wrong on real
 * files: a corner that is occupied, a corner that is occupied on one whole side,
 * and a sheet with nothing free at all.
 */
import { describe, expect, it } from "vitest";

import {
  cornerOrder,
  decidePlacement,
  findClearSpot,
  stampBlock,
  WORDMARK_RATIO,
} from "./brandPlacement";
import { PageInk, inkMapFromRgba, isClear } from "./pageInk";

/** Helvetica is roughly half an em per character — close enough to size a caption. */
const measure = (text: string, size: number) => text.length * size * 0.5;

interface Rect {
  vx: number;
  vy: number;
  width: number;
  height: number;
}

/**
 * A page with black rectangles on white, given in visual points, rasterized the
 * same way a real sheet is so the map under test is the map used in production.
 */
function pageWith(
  visualWidth: number,
  visualHeight: number,
  rects: Rect[],
  paperLuma = 255,
): PageInk {
  const scale = 0.5;
  const cols = Math.round(visualWidth * scale);
  const rows = Math.round(visualHeight * scale);
  const rgba = new Uint8Array(cols * rows * 4);

  for (let i = 0; i < cols * rows; i += 1) {
    rgba[i * 4] = paperLuma;
    rgba[i * 4 + 1] = paperLuma;
    rgba[i * 4 + 2] = paperLuma;
    rgba[i * 4 + 3] = 255;
  }

  for (const rect of rects) {
    const left = Math.round(rect.vx * scale);
    const right = Math.round((rect.vx + rect.width) * scale);
    // Visual y runs up from the bottom; raster rows run down from the top.
    const top = Math.round((visualHeight - (rect.vy + rect.height)) * scale);
    const bottom = Math.round((visualHeight - rect.vy) * scale);
    for (let y = Math.max(0, top); y < Math.min(rows, bottom); y += 1) {
      for (let x = Math.max(0, left); x < Math.min(cols, right); x += 1) {
        const o = (y * cols + x) * 4;
        rgba[o] = 0;
        rgba[o + 1] = 0;
        rgba[o + 2] = 0;
      }
    }
  }

  return inkMapFromRgba(rgba, cols, rows, visualWidth, visualHeight);
}

describe("inkMapFromRgba", () => {
  it("reads untouched canvas as paper, not as solid ink", () => {
    // pdf.js paints onto a transparent canvas, so blank paper arrives as alpha 0.
    // Read naively that is black, and every page looks completely covered.
    const rgba = new Uint8Array(40 * 40 * 4); // all zeroes: transparent black
    const map = inkMapFromRgba(rgba, 40, 40, 400, 400);

    expect(map.paper).toBe(255);
    expect(map.coverage).toBe(0);
    expect(map.darkPaper).toBe(false);
    expect(isClear(map, 0, 0, 400, 400)).toBe(true);
  });

  it("finds ink where it was put and nowhere else", () => {
    const map = pageWith(400, 400, [{ vx: 0, vy: 0, width: 400, height: 100 }]);

    expect(isClear(map, 10, 10, 100, 40)).toBe(false);
    expect(isClear(map, 10, 150, 100, 40)).toBe(true);
    expect(map.coverage).toBeCloseTo(0.25, 1);
  });

  it("measures ink against the paper it is on, so a grey scan is not all ink", () => {
    const scan = pageWith(400, 400, [{ vx: 0, vy: 0, width: 400, height: 100 }], 232);

    expect(scan.paper).toBe(232);
    expect(scan.darkPaper).toBe(false);
    expect(isClear(scan, 10, 150, 100, 40)).toBe(true);
    expect(isClear(scan, 10, 10, 100, 40)).toBe(false);
  });

  it("calls a dark sheet dark, because a blue-on-white mark does not belong there", () => {
    const dark = pageWith(400, 400, [], 20);
    expect(dark.darkPaper).toBe(true);
    expect(decidePlacement(dark, "bottom-right", 1, "www.anc.com", measure)).toBeNull();
  });
});

describe("stampBlock", () => {
  it("keeps the wordmark's ratio and never lets the caption set the width", () => {
    const block = stampBlock(1191, 888, 1, "ANC | A Very Long Document Title Indeed | www.anc.com", measure);

    expect(block.logoWidth / block.logoHeight).toBeCloseTo(WORDMARK_RATIO, 3);
    expect(block.width).toBe(block.logoWidth);
    // The long footer cannot fit under the mark, so it gives way to the address
    // rather than sticking out past the artwork.
    expect(block.meta).toBe("www.anc.com");
    expect(measure(block.meta as string, block.metaSize)).toBeLessThanOrEqual(block.logoWidth);
  });

  it("keeps a caption that does fit", () => {
    const block = stampBlock(2400, 1600, 1, "ANC | www.anc.com", measure);
    expect(block.meta).toBe("ANC | www.anc.com");
  });

  it("drops the caption entirely rather than overflowing the mark", () => {
    // A tiny sheet: even the address is wider than the mark it would sit under.
    const block = stampBlock(120, 90, 0.5, "www.anc.com", (text, size) => text.length * size);
    expect(block.meta).toBeNull();
    expect(block.height).toBeCloseTo(block.logoHeight + block.ruleGap + block.ruleHeight, 5);
  });
});

describe("cornerOrder", () => {
  it("tries the other end of the same edge before crossing the sheet", () => {
    // Sliding along the bottom still reads as bottom-of-sheet branding; jumping to
    // the top reads as a different decision entirely.
    expect(cornerOrder("bottom-right")).toEqual([
      "bottom-right",
      "bottom-left",
      "top-right",
      "top-left",
    ]);
    expect(cornerOrder("top-left")).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
  });
});

describe("findClearSpot", () => {
  const block = stampBlock(1191, 888, 1, "www.anc.com", measure);

  it("takes the corner itself when the corner is empty", () => {
    const map = pageWith(1191, 888, []);
    const spot = findClearSpot(map, block, "bottom-right", { margin: 20, clearance: 12 });

    expect(spot).not.toBeNull();
    expect(spot?.position).toBe("bottom-right");
    expect(spot?.inset).toBe(0);
    expect(spot?.vx).toBeCloseTo(1191 - 20 - block.width, 1);
    expect(spot?.vy).toBeCloseTo(20, 1);
  });

  it("walks up out of an occupied corner instead of stamping over it", () => {
    // The shape of a real title block: the bottom strip of the sheet is full.
    const map = pageWith(1191, 888, [{ vx: 0, vy: 0, width: 1191, height: 200 }]);
    const spot = findClearSpot(map, block, "bottom-right", { margin: 20, clearance: 12 });

    expect(spot).not.toBeNull();
    expect(spot?.position).toBe("bottom-right");
    expect(spot?.vy).toBeGreaterThanOrEqual(200);
    // Still hugging the right-hand edge — it moved only as far as it had to.
    expect(spot?.vx).toBeCloseTo(1191 - 20 - block.width, 1);
    expect(isClear(map, spot!.vx, spot!.vy, block.width, block.height)).toBe(true);
  });

  it("crosses to the other end of the same edge when a whole side is busy", () => {
    const map = pageWith(1191, 888, [{ vx: 500, vy: 0, width: 691, height: 888 }]);
    const spot = findClearSpot(map, block, "bottom-right", { margin: 20, clearance: 12 });

    expect(spot?.position).toBe("bottom-left");
    expect(spot?.vx).toBeCloseTo(20, 1);
  });

  it("returns nothing when the sheet is full, rather than covering work", () => {
    const map = pageWith(1191, 888, [{ vx: 0, vy: 0, width: 1191, height: 888 }]);
    expect(findClearSpot(map, block, "bottom-right", { margin: 20, clearance: 12 })).toBeNull();
  });

  it("declines a sheet too small to carry the mark at all", () => {
    const map = pageWith(90, 60, []);
    const small = stampBlock(90, 60, 1, "www.anc.com", measure);
    expect(findClearSpot(map, small, "bottom-right", { margin: 20, clearance: 30 })).toBeNull();
  });
});

describe("decidePlacement", () => {
  it("gives up clearance before it gives up the corner", () => {
    // A panel with just enough room for the mark and a thin keep-out, and none
    // for a generous one. A drawing like this still deserves its logo in the
    // title block rather than a strip bolted onto the sheet.
    const block = stampBlock(1191, 888, 1, "www.anc.com", measure);
    const panelHeight = block.height + 14;
    const map = pageWith(1191, 888, [
      { vx: 0, vy: 0, width: 1191, height: 120 },
      { vx: 0, vy: 120 + panelHeight, width: 1191, height: 888 - 120 - panelHeight },
      { vx: 0, vy: 0, width: 900, height: 888 },
    ]);

    const spot = decidePlacement(map, "bottom-right", 1, "www.anc.com", measure);

    expect(spot).not.toBeNull();
    expect(spot?.position).toBe("bottom-right");
    expect(spot?.vy).toBeGreaterThanOrEqual(120);
    expect(spot?.vy).toBeLessThan(120 + panelHeight);
  });

  it("returns nothing on a sheet with no blank paper, so the caller adds some", () => {
    const map = pageWith(1191, 888, [{ vx: 0, vy: 0, width: 1191, height: 888 }]);
    expect(decidePlacement(map, "bottom-right", 1, "www.anc.com", measure)).toBeNull();
  });
});
