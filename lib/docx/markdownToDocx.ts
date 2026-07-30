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

const ANC_BLUE = "0A52EF";
const ANC_NAVY = "071A3D";
const MUTED = "6B7280";
const RULE_GRAY = "D1D5DB";

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

const runsFor = (raw: string, opts: { size?: number; color?: string; bold?: boolean } = {}): TextRun[] =>
  parseInline(raw).map(
    (span) =>
      new TextRun({
        text: span.text,
        bold: span.bold || opts.bold,
        italics: span.italics,
        font: span.code ? "Consolas" : undefined,
        size: opts.size ?? 22,
        color: opts.color,
      }),
  );

/** A `| a | b |` row split into cells, tolerating missing edge pipes. */
const splitRow = (line: string): string[] =>
  line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());

const isTableDivider = (line: string): boolean => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

function buildTable(header: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map(
      (cell) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: ANC_NAVY },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              children: runsFor(cell, { size: 20, color: "FFFFFF", bold: true }),
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
              shading:
                rowIndex % 2 === 1
                  ? { type: ShadingType.CLEAR, fill: "F5F7FA" }
                  : undefined,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: runsFor(row[columnIndex] ?? "", { size: 20 }) })],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
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
          children: [new TextRun({ text: line, font: "Consolas", size: 18 })],
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
      blocks.push(
        new Paragraph({
          heading: HEADING_LEVELS[level - 1],
          spacing: { before: level === 1 ? 0 : 240, after: 120 },
          keepNext: true,
          children: runsFor(heading[2], {
            size: level === 1 ? 32 : level === 2 ? 26 : 23,
            color: level <= 2 ? ANC_NAVY : ANC_BLUE,
            bold: true,
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
          bullet: { level: Math.min(4, Math.floor(bullet[1].length / 2)) },
          spacing: { after: 60 },
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
          children: runsFor(numbered[2]),
        }),
      );
      index += 1;
      continue;
    }

    blocks.push(new Paragraph({ spacing: { after: 120 }, children: runsFor(trimmed) }));
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
  /** Small line under the title, e.g. "Prepared for Jireh Billings". */
  subtitle?: string | null;
}

export async function markdownToDocxBuffer(
  markdown: string,
  options: MarkdownDocxOptions = {},
): Promise<Buffer> {
  const body = markdown ?? "";
  const inferred = inferTitle(body);
  const title = (options.title ?? inferred ?? "ANC Report").trim();

  // The inferred title is already the document's first heading — don't print it twice.
  const stripLeadingHeading = !options.title && inferred !== null;
  const bodyMarkdown = stripLeadingHeading
    ? body.replace(/^\s*(?:#{1,6}\s+.*|[^\n]+)\n?/, "")
    : body;

  const header: Paragraph[] = [
    new Paragraph({
      // A real Heading 1 so Word's navigation pane and any table of contents
      // pick the document up — it is forwarded to executives, not just read.
      heading: HeadingLevel.HEADING_1,
      spacing: { after: options.subtitle ? 40 : 240 },
      children: [new TextRun({ text: title, bold: true, size: 36, color: ANC_NAVY })],
    }),
  ];
  if (options.subtitle) {
    header.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({ text: options.subtitle, size: 20, color: MUTED })],
      }),
    );
  }

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
            style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22, color: "111827" } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
        children: [...header, ...markdownToBlocks(bodyMarkdown)],
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
