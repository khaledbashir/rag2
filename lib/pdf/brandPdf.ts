/**
 * Put the ANC mark on a PDF that already exists.
 *
 * The companion of `markdownToDocx` for the other file type. `generate-pdf-browserless`
 * makes a *new* branded PDF out of HTML; this brands one somebody hands us — a
 * manufacturer drawing, a vendor spec sheet, a scanned submittal — without
 * touching a single coordinate of what is already on the page.
 *
 * Why it exists: on 2026-08-20 the CRM assistant was asked to "add anc branding"
 * to an OKC Thunder LED drawing. No house path existed, so it fell through to the
 * sandbox, found it had no ANC logo, and **drew its own wordmark** — navy letters
 * with a red bar, invented on the spot and stamped onto a document heading for a
 * client. That is precisely what the ANC Visual Content Rule forbids, and the same
 * failure mode that produced Calibri-and-orange Word documents until the house
 * renderer took that path away. The fix is the same shape: make the correct thing
 * the easy thing, one call away.
 *
 * The mark is `ancWordmarkBlue()` — the canonical 2023 wordmark, byte-identical to
 * the brand asset (cksum 4090562835 6162), embedded rather than read from disk so
 * the standalone server bundle cannot lose it. There is no code path here that
 * draws letterforms.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";

import { ancWordmarkBlue } from "@/lib/docx/ancLogo";

/** 1060x271 — any placement has to keep it or the mark is distorted. */
const WORDMARK_RATIO = 1060 / 271;

/** #0A52EF, the brand blue, as pdf-lib wants it. */
const ANC_BLUE = rgb(0x0a / 255, 0x52 / 255, 0xef / 255);
const FOOTER_INK = rgb(0x50 / 255, 0x58 / 255, 0x64 / 255);
const PILL_BORDER = rgb(0xd1 / 255, 0xd5 / 255, 0xdb / 255);

export type BrandPdfPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * `band` grows the sheet and puts the mark on the new strip. `overlay` stamps it
 * onto a corner of the page as it stands.
 *
 * Band is the default because overlay can always land on something. Branding a
 * real 67-page signage set top-left put the pill straight through the word
 * SIGNAGE on the cover sheet — there is no corner that is safe on every drawing,
 * and a house endpoint cannot gamble with a document going to a client. Adding
 * paper is the drafting-table answer: nothing is covered and nothing is scaled.
 */
export type BrandPdfPlacement = "band" | "overlay";

/** Which edge of the sheet, as the reader sees it, the band is added to. */
export type BrandPdfEdge = "top" | "bottom";

export interface BrandPdfOptions {
  /** `band` (default) adds a strip; `overlay` stamps the page as-is. */
  placement?: BrandPdfPlacement;
  /** Band edge. Default `top`. */
  edge?: BrandPdfEdge;
  /** Overlay only — corner the mark sits in. Default `top-left`. */
  position?: BrandPdfPosition;
  /** Stamp every page or only the first. Default `all`. */
  pages?: "all" | "first";
  /** Draw the footer line. Default `true`. */
  footer?: boolean;
  /** Override the footer text entirely. */
  footerText?: string | null;
  /** Document name, used to build the default footer. */
  title?: string | null;
  /** Nudge the mark's size. Clamped to 0.5–2. Default 1. */
  logoScale?: number;
}

export interface BrandPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  stampedPages: number;
  placement: BrandPdfPlacement;
  position: BrandPdfPosition;
  footer: string | null;
  /** Anything the caller should mention rather than discover later. */
  warnings: string[];
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** 0, 90, 180 or 270 — whatever the page's /Rotate reduces to. */
function normalizeRotation(angle: number): 0 | 90 | 180 | 270 {
  const wrapped = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  return wrapped as 0 | 90 | 180 | 270;
}

/**
 * Where a thing goes in *user space* so that it lands where we want it in
 * *visual space* — the page as a person sees it after the viewer applies /Rotate.
 *
 * This is the whole reason a stamped drawing does not come back with the logo
 * sideways in the wrong corner. Landscape CAD exports are overwhelmingly a
 * portrait MediaBox carrying /Rotate 90, and `getWidth()`/`getHeight()` report
 * the MediaBox, not what the reader sees. Placing at raw "top-left" on one of
 * those puts the mark off the visible area, rotated a quarter turn.
 *
 * `vx`/`vy` are measured from the visual bottom-left. The returned `rotate` is
 * what pre-rotates the drawn object so it reads upright once the viewer turns
 * the page.
 */
export function visualToUser(
  rotation: 0 | 90 | 180 | 270,
  boxWidth: number,
  boxHeight: number,
  vx: number,
  vy: number,
): { x: number; y: number; rotate: 0 | 90 | 180 | 270 } {
  switch (rotation) {
    case 90:
      return { x: boxWidth - vy, y: vx, rotate: 90 };
    case 180:
      return { x: boxWidth - vx, y: boxHeight - vy, rotate: 180 };
    case 270:
      return { x: vy, y: boxHeight - vx, rotate: 270 };
    default:
      return { x: vx, y: vy, rotate: 0 };
  }
}

/** The page as the reader sees it, rotation applied. */
export function visualSize(
  rotation: 0 | 90 | 180 | 270,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: boxHeight, height: boxWidth }
    : { width: boxWidth, height: boxHeight };
}

/**
 * Standard-14 fonts encode WinAnsi, and pdf-lib *throws* on a character outside
 * it rather than dropping it — so one en dash in a document title kills the whole
 * render. The same trap took out an RFP bid-form fill on 2026-08-10 (a screen
 * named "Level 400 – Grand Concourse"). Titles come from file names and CRM
 * records, so this is a matter of when, not if.
 */
export function winAnsiSafe(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●▪]/g, "-")
    .replace(/[     ]/g, " ")
    .replace(/™/g, "(TM)")
    .replace(/[®]/g, "(R)")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "13 August 2026" reads the same on both sides of the Atlantic. */
function documentDate(now: Date): string {
  return `${now.getUTCDate()} ${
    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][now.getUTCMonth()]
  } ${now.getUTCFullYear()}`;
}

function defaultFooter(title: string | null, now: Date): string {
  const parts = ["ANC"];
  if (title && title.trim()) parts.push(title.trim());
  parts.push(documentDate(now));
  parts.push("www.anc.com");
  // Single-spaced on purpose: `winAnsiSafe` collapses whitespace runs, so a wider
  // separator here would be written and then quietly narrowed on the way out.
  return parts.join(" | ");
}

interface StampGeometry {
  pill: { vx: number; vy: number; width: number; height: number };
  logo: { vx: number; vy: number; width: number; height: number };
  margin: number;
}

/**
 * Size and place the mark against the page it is going on, so an A0 drawing and a
 * Letter spec sheet both come back looking deliberate rather than one of them
 * carrying a postage stamp.
 */
export function stampGeometry(
  visualWidth: number,
  visualHeight: number,
  position: BrandPdfPosition,
  logoScale: number,
): StampGeometry {
  const shortSide = Math.min(visualWidth, visualHeight);
  const margin = clamp(shortSide * 0.03, 14, 34);
  const logoWidth = clamp(visualWidth * 0.15, 84, 190) * clamp(logoScale, 0.5, 2);
  const logoHeight = logoWidth / WORDMARK_RATIO;

  const padX = logoWidth * 0.1;
  const padY = logoHeight * 0.42;
  const pillWidth = logoWidth + padX * 2;
  const pillHeight = logoHeight + padY * 2;

  const vx = position.endsWith("left") ? margin : visualWidth - margin - pillWidth;
  const vy = position.startsWith("top") ? visualHeight - margin - pillHeight : margin;

  return {
    pill: { vx, vy, width: pillWidth, height: pillHeight },
    logo: { vx: vx + padX, vy: vy + padY, width: logoWidth, height: logoHeight },
    margin,
  };
}

/**
 * The page box grown so a band of `band` points appears at the reader's `edge`.
 *
 * Which *user-space* edge that is depends entirely on /Rotate — extending the
 * top of the MediaBox on a page carrying /Rotate 90 grows the reader's left-hand
 * side, not the top.
 */
export function bandBox(
  rotation: 0 | 90 | 180 | 270,
  box: { x: number; y: number; width: number; height: number },
  edge: BrandPdfEdge,
  band: number,
): { x: number; y: number; width: number; height: number } {
  const top = edge === "top";
  switch (rotation) {
    case 90:
      return top
        ? { x: box.x - band, y: box.y, width: box.width + band, height: box.height }
        : { x: box.x, y: box.y, width: box.width + band, height: box.height };
    case 180:
      return top
        ? { x: box.x, y: box.y - band, width: box.width, height: box.height + band }
        : { x: box.x, y: box.y, width: box.width, height: box.height + band };
    case 270:
      return top
        ? { x: box.x, y: box.y, width: box.width + band, height: box.height }
        : { x: box.x - band, y: box.y, width: box.width + band, height: box.height };
    default:
      return top
        ? { x: box.x, y: box.y, width: box.width, height: box.height + band }
        : { x: box.x, y: box.y - band, width: box.width, height: box.height + band };
  }
}

/** Height of the added strip, against the sheet it is added to. */
export function bandHeight(visualWidth: number, visualHeight: number, logoScale: number): number {
  const shortSide = Math.min(visualWidth, visualHeight);
  return clamp(shortSide * 0.055, 26, 58) * clamp(logoScale, 0.5, 2);
}

/**
 * The mark and the footer on the new strip: wordmark left, footer right, and a
 * hair of brand blue along the edge where the strip meets the drawing so the two
 * read as one sheet rather than a paste-up.
 *
 * `box` is the already-grown page box; everything is placed in visual space and
 * mapped through `visualToUser`, so rotation is handled once, here.
 */
function drawBand(
  page: PDFPage,
  wordmark: PDFImage,
  font: PDFFont,
  rotation: 0 | 90 | 180 | 270,
  box: { x: number; y: number; width: number; height: number },
  visual: { width: number; height: number },
  edge: BrandPdfEdge,
  band: number,
  footerText: string | null,
): { footerFitted: boolean } {
  const place = (vx: number, vy: number) => {
    const anchor = visualToUser(rotation, box.width, box.height, vx, vy);
    return { x: box.x + anchor.x, y: box.y + anchor.y, rotate: degrees(anchor.rotate) };
  };

  const bandBottom = edge === "top" ? visual.height - band : 0;
  const margin = clamp(visual.width * 0.02, 12, 30);

  // The strip itself. Opaque white — it is new paper, not a wash over artwork.
  const strip = place(0, bandBottom);
  page.drawRectangle({
    ...strip,
    width: visual.width,
    height: band,
    color: rgb(1, 1, 1),
  });

  // Brand rule on the inner edge, where the strip meets the drawing.
  const ruleHeight = clamp(band * 0.035, 0.6, 1.6);
  const ruleVy = edge === "top" ? bandBottom : band - ruleHeight;
  const rule = place(0, ruleVy);
  page.drawRectangle({ ...rule, width: visual.width, height: ruleHeight, color: ANC_BLUE });

  const logoWidth = clamp(band * 2.2, 70, 210);
  const logoHeight = logoWidth / WORDMARK_RATIO;
  const logo = place(margin, bandBottom + (band - logoHeight) / 2);
  page.drawImage(wordmark, { ...logo, width: logoWidth, height: logoHeight });

  if (!footerText) return { footerFitted: true };

  const size = clamp(band * 0.24, 6.5, 10);
  const textWidth = font.widthOfTextAtSize(footerText, size);
  if (textWidth > visual.width - margin * 3 - logoWidth) return { footerFitted: false };

  const text = place(
    visual.width - margin - textWidth,
    bandBottom + (band - size) / 2 + size * 0.24,
  );
  page.drawText(footerText, { ...text, size, font, color: FOOTER_INK });
  return { footerFitted: true };
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rotation: 0 | 90 | 180 | 270,
  box: { x: number; y: number; width: number; height: number },
  visual: { width: number; height: number },
  margin: number,
): boolean {
  const size = clamp(visual.width * 0.011, 6.5, 9);
  const textWidth = font.widthOfTextAtSize(text, size);
  if (textWidth > visual.width - margin * 2) return false;

  const padX = size * 0.9;
  const padY = size * 0.5;
  const baselineVy = clamp(margin * 0.36, 5, 14);

  const pill = visualToUser(
    rotation,
    box.width,
    box.height,
    (visual.width - textWidth) / 2 - padX,
    baselineVy - padY,
  );
  page.drawRectangle({
    x: box.x + pill.x,
    y: box.y + pill.y,
    width: textWidth + padX * 2,
    height: size + padY * 2,
    rotate: degrees(pill.rotate),
    color: rgb(1, 1, 1),
    opacity: 0.88,
  });

  const anchor = visualToUser(
    rotation,
    box.width,
    box.height,
    (visual.width - textWidth) / 2,
    baselineVy,
  );
  page.drawText(text, {
    x: box.x + anchor.x,
    y: box.y + anchor.y,
    size,
    font,
    color: FOOTER_INK,
    rotate: degrees(anchor.rotate),
  });
  return true;
}

/**
 * Brand `input`, returning the new bytes plus what was actually done to it.
 *
 * Throws only when the bytes are not a PDF we can open. Everything softer — a
 * footer that will not fit, an encrypted document — comes back as a warning, so
 * the caller can pass it on instead of the file silently arriving different from
 * what was asked for.
 */
export async function brandPdf(
  input: Uint8Array | Buffer,
  options: BrandPdfOptions = {},
): Promise<BrandPdfResult> {
  const placement = options.placement ?? "band";
  const edge = options.edge ?? "top";
  const position = options.position ?? "top-left";
  const pagesMode = options.pages ?? "all";
  const wantFooter = options.footer !== false;
  const logoScale = clamp(options.logoScale ?? 1, 0.5, 2);
  const warnings: string[] = [];

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false });
  } catch (error) {
    throw new Error(
      `That file could not be opened as a PDF: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (doc.isEncrypted) {
    warnings.push(
      "The document is encrypted; it was branded through the encryption, which some viewers refuse to open. Ask for an unprotected copy if the result will not open.",
    );
  }

  const pages = doc.getPages();
  if (pages.length === 0) throw new Error("That PDF has no pages.");

  const wordmark = await doc.embedPng(ancWordmarkBlue());
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const footerText = wantFooter
    ? winAnsiSafe(options.footerText ?? defaultFooter(options.title ?? null, new Date()))
    : null;

  const targets = pagesMode === "first" ? pages.slice(0, 1) : pages;

  let footerClipped = false;
  let overlayFooterClipped = false;

  for (const page of targets) {
    const rotation = normalizeRotation(page.getRotation().angle);

    if (placement === "band") {
      // The CropBox is what a viewer actually shows, so it is the sheet we grow.
      const visibleBox = page.getCropBox();
      const visible = visualSize(rotation, visibleBox.width, visibleBox.height);
      const band = bandHeight(visible.width, visible.height, logoScale);
      const grown = bandBox(rotation, visibleBox, edge, band);

      // Both boxes, or a viewer honouring CropBox never shows the strip.
      page.setMediaBox(grown.x, grown.y, grown.width, grown.height);
      page.setCropBox(grown.x, grown.y, grown.width, grown.height);

      const grownVisual = visualSize(rotation, grown.width, grown.height);
      const { footerFitted } = drawBand(
        page,
        wordmark,
        font,
        rotation,
        grown,
        grownVisual,
        edge,
        band,
        footerText,
      );
      if (!footerFitted) footerClipped = true;
      continue;
    }

    const box = page.getMediaBox();
    const visual = visualSize(rotation, box.width, box.height);
    const geometry = stampGeometry(visual.width, visual.height, position, logoScale);

    // A white pill under the mark, because a drawing is line work edge to edge and
    // a transparent logo dropped straight onto it is unreadable.
    const pill = visualToUser(rotation, box.width, box.height, geometry.pill.vx, geometry.pill.vy);
    page.drawRectangle({
      x: box.x + pill.x,
      y: box.y + pill.y,
      width: geometry.pill.width,
      height: geometry.pill.height,
      rotate: degrees(pill.rotate),
      color: rgb(1, 1, 1),
      opacity: 0.92,
      borderColor: PILL_BORDER,
      borderWidth: 0.5,
      borderOpacity: 0.7,
    });

    const logo = visualToUser(rotation, box.width, box.height, geometry.logo.vx, geometry.logo.vy);
    page.drawImage(wordmark, {
      x: box.x + logo.x,
      y: box.y + logo.y,
      width: geometry.logo.width,
      height: geometry.logo.height,
      rotate: degrees(logo.rotate),
    });

    if (footerText) {
      const fitted = drawFooter(page, font, footerText, rotation, box, visual, geometry.margin);
      if (!fitted) overlayFooterClipped = true;
    }
  }

  if (footerText && (footerClipped || overlayFooterClipped)) {
    warnings.push(
      "The footer text was too long for the sheet width and was left off; the mark is still on every page.",
    );
  }

  return {
    bytes: await doc.save(),
    pageCount: pages.length,
    stampedPages: targets.length,
    placement,
    position,
    footer: footerText,
    warnings,
  };
}

/** `ANC_Thunder_Drawing.pdf` from whatever the caller had lying around. */
export function brandedFileName(title: string | null, original: string | null): string {
  const base = (title || original || "ANC Document")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);
  const named = base || "ANC_Document";
  return /^anc[_-]/i.test(named) ? `${named}.pdf` : `ANC_${named}.pdf`;
}
