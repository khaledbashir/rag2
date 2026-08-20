/**
 * Decide where the ANC mark goes on a sheet, from what is actually printed on it.
 *
 * Jireh Billings, 2026-08-20, on a branded OKC Thunder LED drawing: *"something
 * that looks more professional and that's embedded in the bottom right with the
 * actual ANC logo"*. Bottom right is where a drafter puts it — but on a real
 * drawing the bottom-right *corner* is the title block's date row, and stamping
 * there covers someone's work. The professional answer is the blank field a
 * drafter would have left for the logo: nearest the bottom-right corner, but
 * on paper that is empty.
 *
 * So the corner is a *preference*, not an instruction. This walks outward from it
 * and returns the closest genuinely blank spot, which on the Thunder sheet is the
 * open lower panel of the title block and on a spec sheet is the page margin.
 *
 * Pure geometry over a PageInk — no rendering, no drawing, so the whole decision
 * is testable against a synthetic page.
 */
import { PageInk, inkPixelsIn, isClear, visualRectToPixels } from "./pageInk";

export type BrandPdfPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** 1060x271 — the wordmark's ratio, which no placement may distort. */
export const WORDMARK_RATIO = 1060 / 271;

/** The block that gets drawn: wordmark, a brand rule under it, one line of type. */
export interface StampBlock {
  width: number;
  height: number;
  logoWidth: number;
  logoHeight: number;
  ruleHeight: number;
  ruleGap: number;
  metaSize: number;
  metaGap: number;
  /** Null when no caption fits the mark's width — the mark alone is still correct. */
  meta: string | null;
}

export interface ClearSpot {
  vx: number;
  vy: number;
  /** The corner it ended up nearest — what the caller reports back. */
  position: BrandPdfPosition;
  /** How far it had to move inward from that corner, in points. */
  inset: number;
  block: StampBlock;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Size the block against the sheet, so an A0 drawing and a Letter spec sheet both
 * come back looking deliberate instead of one of them wearing a postage stamp.
 */
export function stampBlock(
  visualWidth: number,
  visualHeight: number,
  logoScale: number,
  footerText: string | null,
  measure: (text: string, size: number) => number,
): StampBlock {
  const logoWidth = clamp(visualWidth * 0.12, 76, 168) * clamp(logoScale, 0.5, 2);
  const logoHeight = logoWidth / WORDMARK_RATIO;

  const ruleGap = logoHeight * 0.3;
  const ruleHeight = clamp(logoHeight * 0.035, 0.5, 1.2);
  const metaSize = clamp(logoHeight * 0.22, 5.5, 8.5);
  const metaGap = metaSize * 0.62;

  // The caption never sets the block's width — a line wider than the mark reads as
  // a caption stuck under a logo rather than one piece of artwork. It gives way
  // instead: the full footer, then the address alone, then nothing.
  const candidates = [footerText, "www.anc.com"].filter(
    (text): text is string => Boolean(text && text.trim()),
  );
  const meta = candidates.find((text) => measure(text, metaSize) <= logoWidth) ?? null;

  const height = meta
    ? logoHeight + ruleGap + ruleHeight + metaGap + metaSize
    : logoHeight + ruleGap + ruleHeight;

  return {
    width: logoWidth,
    height,
    logoWidth,
    logoHeight,
    ruleHeight,
    ruleGap,
    metaSize,
    metaGap,
    meta,
  };
}

/**
 * Corners to try, nearest intent first.
 *
 * Same edge before the opposite one: a mark that slides along the bottom of a
 * sheet still reads as bottom-of-the-sheet branding, while one that jumps to the
 * top reads as a different decision.
 */
export function cornerOrder(preferred: BrandPdfPosition): BrandPdfPosition[] {
  const [edge, side] = preferred.split("-") as ["top" | "bottom", "left" | "right"];
  const otherSide = side === "left" ? "right" : "left";
  const otherEdge = edge === "top" ? "bottom" : "top";
  return [
    `${edge}-${side}`,
    `${edge}-${otherSide}`,
    `${otherEdge}-${side}`,
    `${otherEdge}-${otherSide}`,
  ] as BrandPdfPosition[];
}

export interface SearchOptions {
  /** Keep-out from the sheet edge. */
  margin: number;
  /** Blank paper required around the block, so it never crowds a border line. */
  clearance: number;
  /**
   * How far inward from a corner the mark may travel and still be that corner's
   * branding, as a fraction of the sheet. Past this it is no longer "bottom
   * right", it is "somewhere in the middle", and the other corners deserve a look
   * first.
   */
  reach?: number;
}

/**
 * The blank vertical run nearest `anchorVy` in the column of paper the block
 * would occupy at `vx`, or null if no run is tall enough.
 *
 * Stepping y on a grid the way x is stepped looks fine and is quietly wrong: a
 * title block panel only a few points taller than the mark sits *between* two
 * grid stops and comes back "no space", which sends a perfectly good drawing to
 * the fallback strip. Reading the actual runs of ink-free rows is both exact and
 * cheaper — one integral-image query per row instead of one per grid position.
 */
function bestVyInColumn(
  map: PageInk,
  vx: number,
  paddedWidth: number,
  paddedHeight: number,
  anchorVy: number,
): number | null {
  const strip = visualRectToPixels(map, vx, 0, paddedWidth, map.visualHeight);
  const left = Math.max(0, Math.floor(strip.left));
  const right = Math.min(map.cols, Math.ceil(strip.left + strip.width));
  if (right <= left) return null;

  const needRows = paddedHeight * map.scale;
  // A row is "clear" if what it carries is antialiasing rather than line work.
  const rowTolerance = Math.max(1, Math.floor((right - left) * 0.004));

  let best: number | null = null;
  let runEnd = -1; // exclusive, in raster rows

  for (let y = map.rows - 1; y >= -1; y -= 1) {
    const clearRow =
      y >= 0 && inkPixelsIn(map, { left, top: y, width: right - left, height: 1 }) <= rowTolerance;

    if (clearRow) {
      if (runEnd < 0) runEnd = y + 1;
      continue;
    }
    if (runEnd < 0) continue;

    const runStart = y + 1; // inclusive
    if (runEnd - runStart >= needRows) {
      // Raster rows run down; convert the run back to a visual y window and take
      // the point in it closest to the corner we are working outward from.
      const lowVy = map.visualHeight - runEnd / map.scale;
      const highVy = map.visualHeight - runStart / map.scale - paddedHeight;
      const candidate = clamp(anchorVy, lowVy, highVy);
      if (best === null || Math.abs(candidate - anchorVy) < Math.abs(best - anchorVy)) {
        best = candidate;
      }
    }
    runEnd = -1;
  }

  return best;
}

/**
 * The blank spot nearest `preferred`, or null if the sheet has none.
 *
 * Columns are walked outward from the corner and, in each, the nearest blank run
 * is found exactly. The result is therefore the most corner-ward blank position,
 * not merely a blank one — the difference between a logo in the title block and a
 * logo floating in the middle of a drawing.
 */
export function findClearSpot(
  map: PageInk,
  block: StampBlock,
  preferred: BrandPdfPosition,
  options: SearchOptions,
): ClearSpot | null {
  for (const position of cornerOrder(preferred)) {
    const spot = bestSpotForCorner(map, block, position, options);
    if (spot) return spot;
  }
  return null;
}

/**
 * Drifting sideways costs more than drifting up.
 *
 * Measured on the real OKC Thunder A3 sheet: straight-line distance from the
 * corner put the mark in the *middle of the drawing*, floating beside the
 * artwork, because a spot 257pt left and 301pt up is nearer the corner than the
 * title block's own logo panel 48pt left and 471pt up. Both are blank; only one
 * reads as branding. What separates them is that the panel stays flush with the
 * right-hand edge, and a mark flush to an edge reads as part of the sheet's
 * furniture while one adrift in the field reads as a sticker. Manhattan distance
 * with the side axis weighted keeps that alignment.
 */
const SIDE_DRIFT_WEIGHT = 1.5;

/** The blank spot nearest one specific corner, or null if that corner has none. */
export function bestSpotForCorner(
  map: PageInk,
  block: StampBlock,
  position: BrandPdfPosition,
  options: SearchOptions,
): ClearSpot | null {
  return spotsForCorner(map, block, position, options)[0] ?? null;
}

/** Every distinct blank spot this corner offers, nearest first. */
export function spotsForCorner(
  map: PageInk,
  block: StampBlock,
  position: BrandPdfPosition,
  options: SearchOptions,
): ClearSpot[] {
  if (map.darkPaper) return [];

  const { margin, clearance } = options;
  const reach = options.reach ?? 0.3;

  const maxVx = map.visualWidth - margin - block.width;
  const maxVy = map.visualHeight - margin - block.height;
  if (maxVx < margin || maxVy < margin) return [];

  const paddedWidth = block.width + clearance * 2;
  const paddedHeight = block.height + clearance * 2;
  const step = Math.max(4, block.width / 6);
  const reachX = map.visualWidth * reach;

  const right = position.endsWith("right");
  const top = position.startsWith("top");
  const anchorVx = right ? maxVx : margin;
  const anchorVy = top ? maxVy : margin;

  const found: ClearSpot[] = [];

  for (let dx = 0; dx <= reachX; dx += step) {
    const vx = right ? anchorVx - dx : anchorVx + dx;
    if (vx < margin || vx > maxVx) break;

    const paddedVy = bestVyInColumn(map, vx - clearance, paddedWidth, paddedHeight, anchorVy - clearance);
    if (paddedVy === null) continue;

    const vy = clamp(paddedVy + clearance, margin, maxVy);
    // The run test is per row over the same strip, so this holds by
    // construction; it stays as a guard because a placement that covers
    // someone's drawing is the one failure this endpoint must not have.
    if (!isClear(map, vx - clearance, vy - clearance, paddedWidth, paddedHeight)) continue;

    found.push({
      vx,
      vy,
      position,
      inset: dx * SIDE_DRIFT_WEIGHT + Math.abs(vy - anchorVy),
      block,
    });
  }

  found.sort((a, b) => a.inset - b.inset);
  return found;
}

/**
 * The whole decision, including what to do when the sheet is full.
 *
 * Clearance and then the mark's own size give way in turn before we give up:
 * a drawing whose title block panel is a hair too tight for a generous keep-out
 * still deserves its logo in the title block, not a strip bolted to the sheet.
 * Only a genuinely packed sheet falls through to null, and the caller adds paper.
 */
export function decidePlacement(
  map: PageInk,
  preferred: BrandPdfPosition,
  logoScale: number,
  footerText: string | null,
  measure: (text: string, size: number) => number,
): ClearSpot | null {
  return placementOptions(map, preferred, logoScale, footerText, measure)[0] ?? null;
}

/**
 * Every corner that has room, best-first — the shortlist a person (or a model
 * looking at the page) gets to choose from.
 *
 * This is the half of the decision that geometry is actually good at: proving a
 * rectangle is empty. Which of the empty rectangles *looks* like the place a
 * drafter would have put the logo is taste, and taste is what a vision model is
 * for. Handing it a shortlist rather than a blank page is deliberate — it can
 * pick the one that reads best, and it cannot pick one that covers someone's
 * work, because none of these do.
 */
export function placementOptions(
  map: PageInk,
  preferred: BrandPdfPosition,
  logoScale: number,
  footerText: string | null,
  measure: (text: string, size: number) => number,
): ClearSpot[] {
  const shortSide = Math.min(map.visualWidth, map.visualHeight);
  const margin = clamp(shortSide * 0.022, 9, 26);
  const corners = cornerOrder(preferred);

  // Size and reach step down only when nothing at all was found: a smaller mark,
  // or one further from its corner, is a concession and should not be made while
  // the full-size one still fits somewhere.
  //
  // Clearance is different — it is pooled, not laddered. Taking the first
  // clearance that yields anything trades placement quality for breathing room,
  // and on the real Thunder sheet that trade put the mark in the middle of the
  // drawing: the open field had room for a generous keep-out, the title block's
  // own logo panel only for a tight one, and generosity won a contest it should
  // never have been in. Every clearance competes on the same list now, so the
  // panel wins on being where it belongs.
  for (const reach of [0.3, 0.6]) {
    for (const scale of [logoScale, logoScale * 0.82, logoScale * 0.66]) {
      const block = stampBlock(map.visualWidth, map.visualHeight, scale, footerText, measure);
      const byCorner = new Map<BrandPdfPosition, ClearSpot[]>();

      for (const position of corners) {
        const spots: ClearSpot[] = [];
        for (const factor of [0.55, 0.32, 0.16]) {
          spots.push(
            ...spotsForCorner(map, block, position, {
              margin,
              clearance: block.logoHeight * factor,
              reach,
            }),
          );
        }
        spots.sort((a, b) => a.inset - b.inset);
        if (spots.length) byCorner.set(position, spots);
      }

      if (byCorner.size) {
        // Corner order first, then quality within a corner — so `[0]` is the
        // requested corner's best, and a judge sees that corner's options before
        // the alternatives.
        return dedupe(
          corners.flatMap((position) => byCorner.get(position) ?? []),
          MAX_OPTIONS,
        );
      }
    }
  }

  return [];
}

/** How many distinct spots a judge is offered. Enough to choose from, few enough to read. */
const MAX_OPTIONS = 5;

/**
 * Drop spots that are effectively the same piece of paper.
 *
 * Adjacent columns in one blank panel all qualify, and a shortlist of five
 * near-identical rectangles is not a choice — it is the same answer five times,
 * and it crowds out the genuinely different region on the other side of the
 * sheet.
 */
function dedupe(spots: ClearSpot[], limit: number): ClearSpot[] {
  const kept: ClearSpot[] = [];
  for (const spot of spots) {
    const apart = kept.every(
      (other) =>
        Math.abs(other.vx - spot.vx) > spot.block.width * 0.75 ||
        Math.abs(other.vy - spot.vy) > spot.block.height * 0.75,
    );
    if (apart) kept.push(spot);
    if (kept.length >= limit) break;
  }
  return kept;
}
