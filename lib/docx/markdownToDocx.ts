/**
 * Markdown → Word (.docx) for CRM AI answers.
 *
 * Jireh Billings, 2026-07-30: "for the CRM AI question, is there a way to
 * export to word document feature? i just asked it something and it gave a
 * great response, but looking to get better formatted."
 *
 * The assistant answers in Markdown with a few house conventions that must not
 * leak into a document someone forwards to a client or an executive:
 *   - CRM record links are written `[[company:<uuid>|Baltimore Ravens]]` —
 *     only the label belongs in the document, never the id.
 *   - Priority markers arrive as Slack emoji shortcodes (`:red_circle:`).
 *   - Tables, headings, bullets, bold/italic and `---` rules are all in play.
 *
 * Everything here is presentation only: no wording is invented, reordered, or
 * summarised. What the assistant wrote is what lands in the document.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import {
  ANC_DOC_COLOR,
  ANC_DOC_FONT,
  ANC_DOC_MONO_FONT,
  ANC_DOC_PAGE,
  ANC_DOC_SIZE,
  ancSectionProperties,
  buildAncClosingBlock,
  buildAncFooter,
  buildAncHeader,
  formatDocumentDate,
} from "./ancDocumentTemplate";

const ANC_BLUE = ANC_DOC_COLOR.blue;
const ANC_NAVY = ANC_DOC_COLOR.navy;
const MUTED = ANC_DOC_COLOR.muted;
const RULE_GRAY = ANC_DOC_COLOR.rule;

/** Slack shortcodes the assistant uses for priority markers. */
const EMOJI: Record<string, string> = {
  red_circle: "●",
  large_orange_circle: "●",
  large_yellow_circle: "●",
  large_green_circle: "●",
  large_blue_circle: "●",
  white_check_mark: "✓",
  warning: "!",
  x: "✕",
};

/**
 * Strip the house conventions down to plain prose:
 * `[[company:uuid|Label]]` → `Label`, `:red_circle:` → a bullet glyph.
 */
export function normalizeInlineText(raw: string): string {
  return raw
    .replace(/\[\[[a-z]+:[^|\]]+\|([^\]]+)\]\]/gi, "$1")
    .replace(/\[\[[a-z]+:([^\]]+)\]\]/gi, "$1")
    .replace(/:([a-z0-9_+-]+):/gi, (match, name: string) => EMOJI[name.toLowerCase()] ?? match)
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1");
}

interface InlineSpan {
  text: string;
  bold?: boolean;
  italics?: boolean;
  code?: boolean;
}

/** Split a line into bold / italic / inline-code spans. */
export function parseInline(raw: string): InlineSpan[] {
  const text = normalizeInlineText(raw);
  const spans: InlineSpan[] = [];
  // Order matters: ** before *, so bold is not mistaken for two italics.
  const pattern = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|`(.+?)`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) spans.push({ text: text.slice(cursor, match.index) });
    if (match[2] !== undefined) spans.push({ text: match[2], bold: true, italics: true });
    else if (match[3] !== undefined) spans.push({ text: match[3], bold: true });
    else if (match[4] !== undefined) spans.push({ text: match[4], bold: true });
    else if (match[5] !== undefined) spans.push({ text: match[5], italics: true });
    else if (match[6] !== undefined) spans.push({ text: match[6], italics: true });
    else if (match[7] !== undefined) spans.push({ text: match[7], code: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor) });
  return spans.length > 0 ? spans : [{ text }];
}

const runsFor = (
  raw: string,
  opts: { size?: number; color?: string; bold?: boolean; allCaps?: boolean } = {},
): TextRun[] =>
  parseInline(raw).map(
    (span) =>
      new TextRun({
        text: span.text,
        bold: span.bold || opts.bold,
        italics: span.italics,
        allCaps: opts.allCaps,
        font: span.code ? ANC_DOC_MONO_FONT : undefined,
        size: opts.size ?? ANC_DOC_SIZE.body,
        color: opts.color,
      }),
  );

/** A `| a | b |` row split into cells, tolerating missing edge pipes. */
const splitRow = (line: string): string[] =>
  line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());

const isTableDivider = (line: string): boolean => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

/**
 * Column widths proportional to the longest cell in each column, so a wide
 * "Action" column is not squeezed to the same width as "Priority". Word's
 * default even split is what made an exported table look nothing like the
 * house document.
 */
export function tableColumnWidths(header: string[], rows: string[][]): number[] {
  /**
   * Roughly one character of 9pt DejaVu Sans, plus the two cell margins. Sized
   * for the wide sans the house template sets, so a column still holds its
   * content where a narrower substitute font is used instead.
   */
  // 120 was measured off the regular weight and left a header like "League"
  // breaking to "Leagu / e" — column headings are bold, which is wider.
  const CHAR = 145;
  const PADDING = 240;

  const columns = header.map((cell, columnIndex) => {
    const cells = [cell, ...rows.map((row) => row[columnIndex] ?? "")].map(normalizeInlineText);
    const longestCell = Math.max(...cells.map((text) => text.length));
    const longestWord = Math.max(
      ...cells.flatMap((text) => text.split(/\s+/).map((word) => word.length)),
      1,
    );
    return {
      // One very wide cell must not starve the rest, and a one-word column
      // still earns a readable share.
      weight: Math.min(60, Math.max(9, longestCell)),
      // Never so narrow that a heading like "Priority" breaks mid-word.
      floor: longestWord * CHAR + PADDING,
    };
  });

  const total = ANC_DOC_PAGE.contentWidth;
  const floorSum = columns.reduce((sum, column) => sum + column.floor, 0);
  if (floorSum >= total) {
    // Nothing fits comfortably — fall back to the floors, scaled to the page.
    return columns.map((column) => Math.floor((column.floor / floorSum) * total));
  }

  // Share the width out by weight, pinning any column that lands under its
  // floor and re-sharing what is left over the rest.
  const widths = new Array<number>(columns.length).fill(0);
  const pinned = new Array<boolean>(columns.length).fill(false);
  for (;;) {
    const free = columns.map((_, i) => i).filter((i) => !pinned[i]);
    if (free.length === 0) break;
    const remaining = total - widths.reduce((sum, width) => sum + width, 0);
    const weightSum = free.reduce((sum, i) => sum + columns[i].weight, 0);
    let pinnedAny = false;
    for (const i of free) {
      const share = Math.round((columns[i].weight / weightSum) * remaining);
      if (share < columns[i].floor) {
        widths[i] = columns[i].floor;
        pinned[i] = true;
        pinnedAny = true;
      } else {
        widths[i] = share;
      }
    }
    if (!pinnedAny) break;
  }

  // Hand any rounding remainder to the widest column.
  const widest = widths.indexOf(Math.max(...widths));
  widths[widest] += total - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}

function buildTable(header: string[], rows: string[][]): Table {
  const columnWidths = tableColumnWidths(header, rows);
  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map(
      (cell, columnIndex) =>
        new TableCell({
          width: { size: columnWidths[columnIndex], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: ANC_NAVY },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              spacing: { after: 0 },
              children: runsFor(cell, {
                size: ANC_DOC_SIZE.tableHeader,
                color: ANC_DOC_COLOR.white,
                bold: true,
              }),
            }),
          ],
        }),
    ),
  });

  const bodyRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        children: header.map(
          (_, columnIndex) =>
            new TableCell({
              width: { size: columnWidths[columnIndex], type: WidthType.DXA },
              shading:
                rowIndex % 2 === 1
                  ? { type: ShadingType.CLEAR, fill: ANC_DOC_COLOR.zebra }
                  : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  children: runsFor(row[columnIndex] ?? "", { size: ANC_DOC_SIZE.table }),
                }),
              ],
            }),
        ),
      }),
  );

  const hairline = { style: BorderStyle.SINGLE, size: 2, color: ANC_DOC_COLOR.tableBorder };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    borders: {
      top: hairline,
      bottom: hairline,
      left: hairline,
      right: hairline,
      insideHorizontal: hairline,
      insideVertical: hairline,
    },
    rows: [headerRow, ...bodyRows],
  });
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

/** Markdown body → docx block elements. */
export function markdownToBlocks(markdown: string): (Paragraph | Table)[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: (Paragraph | Table)[] = [];
  let index = 0;
  let inCodeFence = false;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      index += 1;
      continue;
    }

    if (inCodeFence) {
      blocks.push(
        new Paragraph({
          spacing: { after: 0 },
          children: [new TextRun({ text: line, font: ANC_DOC_MONO_FONT, size: ANC_DOC_SIZE.code })],
        }),
      );
      index += 1;
      continue;
    }

    if (trimmed === "") {
      index += 1;
      continue;
    }

    // Horizontal rule — a spacing rule, not a heading.
    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(trimmed)) {
      blocks.push(
        new Paragraph({
          spacing: { before: 120, after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_GRAY } },
          children: [new TextRun({ text: "" })],
        }),
      );
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      // Section headings are ANC blue and set in caps; the sub-sections under
      // them are navy. Anything deeper stays blue but at body size, so a long
      // answer never grows a fourth typographic voice.
      const isSection = level <= 2;
      const isSubSection = level === 3;
      blocks.push(
        new Paragraph({
          heading: HEADING_LEVELS[level - 1],
          spacing: { before: index === 0 ? 0 : isSection ? 300 : 240, after: 120 },
          alignment: AlignmentType.JUSTIFIED,
          keepNext: true,
          children: runsFor(heading[2], {
            size: isSection ? ANC_DOC_SIZE.h2 : isSubSection ? ANC_DOC_SIZE.h3 : ANC_DOC_SIZE.h4,
            color: isSubSection ? ANC_NAVY : ANC_BLUE,
            bold: true,
            allCaps: isSection,
          }),
        }),
      );
      index += 1;
      continue;
    }

    // Table: a header row followed by a --- divider.
    if (trimmed.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "") {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      blocks.push(buildTable(header, rows));
      blocks.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "" })] }));
      continue;
    }

    // Blockquote
    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push(
        new Paragraph({
          spacing: { after: 120 },
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: ANC_BLUE, space: 12 } },
          children: runsFor(quote[1], { color: MUTED }),
        }),
      );
      index += 1;
      continue;
    }

    // Bullet, at any nesting depth
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        new Paragraph({
          numbering: { reference: "anc-bullet", level: Math.min(4, Math.floor(bullet[1].length / 2)) },
          spacing: { after: 60 },
          alignment: AlignmentType.JUSTIFIED,
          children: runsFor(bullet[2]),
        }),
      );
      index += 1;
      continue;
    }

    // Numbered item
    const numbered = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (numbered) {
      blocks.push(
        new Paragraph({
          numbering: { reference: "anc-numbered", level: Math.min(4, Math.floor(numbered[1].length / 2)) },
          spacing: { after: 60 },
          alignment: AlignmentType.JUSTIFIED,
          children: runsFor(numbered[2]),
        }),
      );
      index += 1;
      continue;
    }

    blocks.push(
      new Paragraph({
        spacing: { after: 120 },
        alignment: AlignmentType.JUSTIFIED,
        children: runsFor(trimmed),
      }),
    );
    index += 1;
  }

  return blocks;
}

/** Best-effort document title: the first H1, else the first non-empty line. */
export function inferTitle(markdown: string): string | null {
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) return normalizeInlineText(heading[1]).trim() || null;
    return normalizeInlineText(trimmed).slice(0, 120).trim() || null;
  }
  return null;
}

export interface MarkdownDocxOptions {
  /** Overrides the title inferred from the Markdown. */
  title?: string | null;
  /** Fixes the header date — used by the tests, and by any dated re-export. */
  date?: Date;
}

export async function markdownToDocxBuffer(
  markdown: string,
  options: MarkdownDocxOptions = {},
): Promise<Buffer> {
  const body = markdown ?? "";
  const inferred = inferTitle(body);
  const title = (options.title ?? inferred ?? "ANC Report").trim();

  // The title is printed in the header band, so drop the heading it came from.
  // Only ever a heading line: an answer that opens with prose keeps its first
  // sentence, whatever the title turned out to be.
  const opensWithHeading = /^\s*#{1,6}\s+\S/.test(body);
  const bodyMarkdown = opensWithHeading ? body.replace(/^\s*#{1,6}\s+.*\n?/, "") : body;

  // The title is set in the header band beside the wordmark, so the body opens
  // straight into the content — printing it twice is what the old export did.
  //
  // The line under the title is the document date and nothing else. Callers
  // used to be able to put a provenance string there — the CRM's export button
  // sent "Prepared from ANC AI" — which is precisely the line Natalia expects
  // to read the date on, so the slot is no longer for rent.
  const documentHeader = buildAncHeader({
    title,
    date: formatDocumentDate(options.date ?? new Date()),
  });

  const doc = new Document({
    creator: "ANC Sports Enterprises",
    title,
    numbering: {
      config: [
        {
          reference: "anc-numbered",
          levels: Array.from({ length: 5 }, (_, level) => ({
            level,
            format: "decimal" as const,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 + 360 * level, hanging: 360 } } },
          })),
        },
        {
          // The house bullet: a small round dot indented 0.5in with the text at
          // 0.25in beyond it, matching the reference document rather than
          // Word's default heavy glyph.
          reference: "anc-bullet",
          levels: Array.from({ length: 5 }, (_, level) => ({
            level,
            format: "bullet" as const,
            text: level % 2 === 0 ? "•" : "◦",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 + 360 * level, hanging: 360 } } },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: ANC_DOC_FONT, size: ANC_DOC_SIZE.body, color: ANC_DOC_COLOR.ink },
        },
      },
    },
    sections: [
      {
        properties: ancSectionProperties(),
        headers: {
          first: documentHeader,
          // Page two onward opens straight into the content, as the house
          // template does — only the footer repeats.
          default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: "" })] })] }),
        },
        footers: { first: buildAncFooter(), default: buildAncFooter() },
        children: [...markdownToBlocks(bodyMarkdown), ...buildAncClosingBlock()],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/** "M&T Bank Stadium — Recap" → "M-T-Bank-Stadium-Recap.docx" */
export function docxFileName(title: string): string {
  const slug = title
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${slug || "ANC-Report"}.docx`;
}
