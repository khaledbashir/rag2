/**
 * The ANC house document template — the single look every exported document wears.
 *
 * Natalia Kovaleva, 2026-08-11, attaching the M&T Bank Stadium recap:
 * "We all started using crm ai and asking it to export some info. Can the file
 * attached be a template globally for everyone — font size, color, header,
 * footer etc etc"
 *
 * So the tokens below are not a fresh design: they are measured off that
 * document. Page is US Letter with 0.7in side margins; the wordmark sits top
 * left with the document title set right in ANC blue small caps and the date
 * under it; a hairline closes the header band; every page carries a rule,
 * `www.anc.com` and "Page N of M"; the body closes with the company sign-off.
 *
 * Point sizes are the one deliberate departure. The reference PDF was rendered
 * on Linux, where the body fell back to DejaVu Sans at 9pt. DejaVu carries a
 * much larger x-height than Calibri, which is what an ANC reader actually has
 * installed, so the sizes here are set one step up: 10pt body, 11pt headings.
 * On screen and on paper that reproduces the reference, rather than shrinking
 * every document by a size.
 *
 * `docx` sizes are half-points, spacing and positions are twips (1pt = 20).
 */
import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  ImageRun,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

import { ancWordmarkBlue } from "./ancLogo";

/** Brand blue (#0A52EF), navy, and the neutrals the reference document uses. */
export const ANC_DOC_COLOR = {
  blue: "0A52EF",
  navy: "071A3D",
  ink: "111827",
  muted: "6B7280",
  faint: "505864",
  rule: "D1D5DB",
  footerRule: "E5E7EB",
  zebra: "F5F7FA",
  tableBorder: "111827",
  white: "FFFFFF",
} as const;

/** Half-points, so 20 = 10pt. */
export const ANC_DOC_SIZE = {
  title: 20,
  date: 16,
  body: 20,
  h2: 22,
  h3: 22,
  h4: 20,
  table: 18,
  tableHeader: 18,
  footer: 15,
  closing: 17,
  code: 17,
} as const;

export const ANC_DOC_FONT = "Calibri";
export const ANC_DOC_MONO_FONT = "Consolas";

/** Letter page, 0.7in sides, with room reserved for the header band and footer. */
export const ANC_DOC_PAGE = {
  margin: {
    top: 1000,
    bottom: 1080,
    left: 1000,
    right: 1000,
    header: 700,
    footer: 560,
  },
  /** Printable width in twips — 8.5in less the two 0.7in margins. */
  contentWidth: 10240,
} as const;

/** The wordmark column: the mark is 63pt wide, the rest is breathing room. */
const HEADER_LOGO_WIDTH = 1800;

const RIGHT_TAB = { type: TabStopType.RIGHT, position: ANC_DOC_PAGE.contentWidth } as const;

/**
 * The wordmark at its native 3.91:1 ratio, sized to the reference document's
 * 63x16pt (docx takes pixels at 96dpi).
 */
const wordmarkRun = (): ImageRun =>
  new ImageRun({
    type: "png",
    data: ancWordmarkBlue(),
    transformation: { width: 84, height: 21 },
    altText: {
      title: "ANC",
      description: "ANC Sports Enterprises",
      name: "ANC wordmark",
    },
  });

/** "August 10, 2026" — the date format on the reference document. */
export const formatDocumentDate = (date: Date = new Date()): string =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export interface AncHeaderOptions {
  /** Set right of the wordmark, in blue small caps. */
  title: string;
  /** The line under the title — the document date unless told otherwise. */
  date?: string;
}

/**
 * The first-page header band: wordmark left, title and date right, hairline under.
 *
 * A borderless two-cell table rather than a tab stop, so a long title wraps
 * inside its own column instead of colliding with the wordmark.
 */
export function buildAncHeader({ title, date }: AncHeaderOptions): Header {
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };

  return new Header({
    children: [
      new Table({
        width: { size: ANC_DOC_PAGE.contentWidth, type: WidthType.DXA },
        // Explicit twips, not percentages: a percentage table inside a header
        // resolves against the wrong box and squeezes the title onto two lines.
        columnWidths: [HEADER_LOGO_WIDTH, ANC_DOC_PAGE.contentWidth - HEADER_LOGO_WIDTH],
        borders: noBorders,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: HEADER_LOGO_WIDTH, type: WidthType.DXA },
                borders: noBorders,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                verticalAlign: VerticalAlign.TOP,
                children: [new Paragraph({ spacing: { after: 0 }, children: [wordmarkRun()] })],
              }),
              new TableCell({
                width: { size: ANC_DOC_PAGE.contentWidth - HEADER_LOGO_WIDTH, type: WidthType.DXA },
                borders: noBorders,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                verticalAlign: VerticalAlign.TOP,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    spacing: { after: 40 },
                    children: [
                      new TextRun({
                        text: title,
                        bold: true,
                        allCaps: true,
                        size: ANC_DOC_SIZE.title,
                        color: ANC_DOC_COLOR.blue,
                      }),
                    ],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    spacing: { after: 0 },
                    children: [
                      new TextRun({
                        text: date ?? formatDocumentDate(),
                        size: ANC_DOC_SIZE.date,
                        color: ANC_DOC_COLOR.muted,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new Paragraph({
        // The trailing space is what sets the gap between the header rule and
        // the first line of the document.
        spacing: { before: 140, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ANC_DOC_COLOR.rule } },
        children: [new TextRun({ text: "" })],
      }),
    ],
  });
}

/** Every page: hairline, `www.anc.com` left, "Page N of M" right. */
export function buildAncFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [RIGHT_TAB],
        spacing: { before: 0, after: 0 },
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: ANC_DOC_COLOR.footerRule, space: 6 } },
        children: [
          new TextRun({
            text: "www.anc.com",
            bold: true,
            size: ANC_DOC_SIZE.footer,
            color: ANC_DOC_COLOR.blue,
          }),
          new TextRun({ text: "\t", size: ANC_DOC_SIZE.footer }),
          new TextRun({ text: "Page ", size: ANC_DOC_SIZE.footer, color: ANC_DOC_COLOR.faint }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: ANC_DOC_SIZE.footer,
            color: ANC_DOC_COLOR.faint,
          }),
          new TextRun({ text: " of ", size: ANC_DOC_SIZE.footer, color: ANC_DOC_COLOR.faint }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            size: ANC_DOC_SIZE.footer,
            color: ANC_DOC_COLOR.faint,
          }),
        ],
      }),
    ],
  });
}

/**
 * The sign-off that closes the body: a blue rule on the left, `www.anc.com`,
 * and the legal entity set right.
 */
export function buildAncClosingBlock(): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 240, after: 200 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: ANC_DOC_COLOR.rule, space: 10 } },
      children: [new TextRun({ text: "" })],
    }),
    new Paragraph({
      tabStops: [RIGHT_TAB],
      spacing: { after: 0 },
      indent: { left: 120 },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: ANC_DOC_COLOR.blue, space: 8 } },
      children: [
        new TextRun({
          text: "www.anc.com",
          bold: true,
          size: ANC_DOC_SIZE.closing,
          color: ANC_DOC_COLOR.blue,
        }),
        new TextRun({ text: "\t", size: ANC_DOC_SIZE.closing }),
        new TextRun({
          text: "ANC Sports Enterprises, LLC",
          size: ANC_DOC_SIZE.closing,
          color: ANC_DOC_COLOR.muted,
        }),
      ],
    }),
  ];
}

/**
 * Section properties for an ANC document: Letter page, house margins, and a
 * header band that only prints on page one (page two onward opens straight
 * into the content, exactly like the reference).
 */
export function ancSectionProperties() {
  return {
    titlePage: true,
    page: { margin: { ...ANC_DOC_PAGE.margin } },
  };
}
