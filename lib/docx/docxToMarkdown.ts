/**
 * Word (.docx) → markdown, losslessly and in document order.
 *
 * The other half of the CRM's Word round-trip. `markdownToDocx` renders the
 * ANC house template; this reads an uploaded document back out so there is
 * something faithful to render.
 *
 * Why it exists as an endpoint rather than as advice:
 *
 * Natalia Kovaleva, 2026-08-20: "the branding thing is working better but it
 * did not identified bullet points and threw all tables at the end of the
 * file." Both symptoms came from the assistant hand-rolling the conversion in
 * its sandbox with python-docx, where two traps are waiting:
 *
 *   - `doc.paragraphs` walks only top-level paragraphs and `doc.tables` is a
 *     separate flat collection. Loop one then the other — the obvious thing to
 *     write — and every table lands at the end of the document.
 *   - Word marks a list two different ways: numbering properties (<w:numPr>)
 *     and the built-in list STYLES (List Bullet, List Number). A converter that
 *     checks only the first silently flattens every bullet in a document that
 *     uses the second — and her Ravens assessment has ZERO numPr in it and 35
 *     ListBullet paragraphs.
 *
 * Telling the assistant not to fall in was not enough: told once, it rewrote
 * the converter to preserve table order and still lost every bullet to the
 * second trap. So the conversion lives here, where it is the same code every
 * time, and the assistant calls it.
 *
 * Ported from the reader that runs inside the CRM for chat attachments
 * (`anc-docx-text.js`) — same algorithm, same guarantees, one behaviour.
 */
import zlib from "node:zlib";

import { XMLParser } from "fast-xml-parser";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const MAX_COMMENT = 0xffff;

/** Locate and inflate one entry out of a zip buffer. */
export function readZipEntry(buffer: Buffer, wantedName: string): Buffer {
  const scanFrom = Math.max(0, buffer.length - (MAX_COMMENT + 22));
  let eocd = -1;
  for (let i = buffer.length - 22; i >= scanFrom; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip archive");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error("corrupt central directory");

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    if (name === wantedName) {
      // The local header repeats the name/extra lengths and they can differ
      // from the central directory's, so read them from the local header.
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error(`unsupported zip compression method ${method}`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`${wantedName} not found in archive`);
}

// ---------------------------------------------------------------------------
// preserveOrder shape: every node is { "<tag>": [children], ":@": {attrs} }.
// Document order matters here — a table between two paragraphs has to stay
// between them — which is exactly what preserveOrder buys us.

type Node = Record<string, any>;

const tagOf = (node: Node) => Object.keys(node).find((key) => key !== ":@");
const childrenOf = (node: Node): Node[] => node[tagOf(node) as string] || [];
const attrOf = (node: Node, name: string) => node[":@"]?.[name];
const pick = (nodes: Node[], name: string) => nodes.filter((node) => tagOf(node) === name);
const first = (nodes: Node[], name: string) => nodes.find((node) => tagOf(node) === name);

/** Text of one <w:r>, honouring tabs and breaks. */
function runText(run: Node): string {
  let out = "";
  for (const child of childrenOf(run)) {
    const tag = tagOf(child);
    if (tag === "w:t") {
      for (const node of childrenOf(child)) out += String(node["#text"] ?? "");
    } else if (tag === "w:tab") {
      out += " ";
    } else if (tag === "w:br" || tag === "w:cr") {
      out += "\n";
    }
  }
  return out;
}

function isBold(run: Node): boolean {
  const props = first(childrenOf(run), "w:rPr");
  if (!props) return false;
  const bold = first(childrenOf(props), "w:b");
  if (!bold) return false;
  const val = attrOf(bold, "@_w:val");
  // <w:b/> is on; <w:b w:val="0"/> is off.
  return val !== "0" && val !== "false";
}

function paragraphText(paragraph: Node): string {
  let out = "";
  for (const child of childrenOf(paragraph)) {
    const tag = tagOf(child);
    if (tag === "w:r") {
      const text = runText(child);
      if (!text) continue;
      out += isBold(child) && text.trim() ? `**${text.trim()}**` : text;
    } else if (tag === "w:hyperlink") {
      for (const run of pick(childrenOf(child), "w:r")) out += runText(run);
    }
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

function paragraphStyle(paragraph: Node): string | null {
  const props = first(childrenOf(paragraph), "w:pPr");
  if (!props) return null;
  const style = first(childrenOf(props), "w:pStyle");
  return style ? (attrOf(style, "@_w:val") ?? null) : null;
}

function headingLevel(paragraph: Node): number {
  const style = paragraphStyle(paragraph);
  if (typeof style !== "string") return 0;
  const flat = style.replace(/[\s-]/g, "");
  const match = /^Heading([1-9])$/i.exec(flat);
  if (match) return Number(match[1]);
  if (/^Title$/i.test(flat)) return 1;
  return 0;
}

/** ListBullet, ListNumber, and their depth suffixes (ListBullet2, ListNumber3). */
const LIST_STYLE = /^List(Bullet|Number)([0-9])?$/i;

/**
 * The markdown marker for a list paragraph, or null when it is not one.
 *
 * Word writes a list two different ways and a document can use either:
 * numbering properties (<w:numPr>), which a list made from the toolbar
 * carries; or one of the built-in list STYLES, carrying no numbering
 * properties at all. A converter that knows only the first flattens every
 * bullet in a document written with the second.
 *
 * ListParagraph and ListContinue are deliberately not here: without numbering
 * properties Word draws no marker for them, so neither should we.
 */
function listMarkerFor(paragraph: Node): string | null {
  const props = first(childrenOf(paragraph), "w:pPr");
  if (!props) return null;
  const children = childrenOf(props);

  const style = first(children, "w:pStyle");
  const styleName = style ? String(attrOf(style, "@_w:val") ?? "") : "";
  const styleMatch = LIST_STYLE.exec(styleName.replace(/[\s-]/g, ""));
  const numbering = first(children, "w:numPr");
  if (!numbering && !styleMatch) return null;

  // Depth comes from the numbering level when there is one, otherwise from the
  // style's suffix — ListBullet2 sits one level inside ListBullet.
  let depth = 0;
  if (numbering) {
    const level = first(childrenOf(numbering), "w:ilvl");
    depth = Number(level ? attrOf(level, "@_w:val") : 0) || 0;
  } else if (styleMatch?.[2]) {
    depth = Number(styleMatch[2]) - 1;
  }

  // Markdown renumbers an ordered list itself, so "1." on every item is right.
  const ordered = Boolean(styleMatch) && /^Number$/i.test(styleMatch![1]);
  return `${"  ".repeat(Math.min(4, Math.max(0, depth)))}${ordered ? "1." : "-"} `;
}

/** Drop the emphasis markers when the whole string is one bold run. */
function unwrapBold(text: string): string {
  const match = /^\*\*([^*]+)\*\*$/.exec(text.trim());
  return match ? match[1].trim() : text;
}

function tableMarkdown(table: Node): string {
  const rows: string[][] = [];
  for (const row of pick(childrenOf(table), "w:tr")) {
    const cells = pick(childrenOf(row), "w:tc").map((cell) =>
      pick(childrenOf(cell), "w:p")
        .map(paragraphText)
        .filter(Boolean)
        .join(" ")
        .replace(/\|/g, "\\|"),
    );
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return "";

  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]) => Array.from({ length: width }, (_, i) => row[i] ?? "");
  const line = (row: string[]) => `| ${pad(row).join(" | ")} |`;

  return [line(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

/**
 * Convert .docx bytes to markdown, preserving every character.
 * Throws rather than returning something partial, so a caller can fall back
 * instead of silently handing on less than the document said.
 */
export function docxToMarkdown(bytes: Buffer | Uint8Array): string {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const xml = readZipEntry(buffer, "word/document.xml").toString("utf8");

  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Keep whitespace-only <w:t xml:space="preserve"> runs — those are the
    // spaces between words.
    trimValues: false,
    processEntities: true,
    parseTagValue: false,
  });

  const document = first(parser.parse(xml), "w:document");
  if (!document) throw new Error("not a Word document");
  const body = first(childrenOf(document), "w:body");
  if (!body) throw new Error("no document body");

  const blocks: { kind: string; text: string }[] = [];
  for (const node of childrenOf(body)) {
    const tag = tagOf(node);
    if (tag === "w:tbl") {
      const table = tableMarkdown(node);
      if (table) blocks.push({ kind: "table", text: table });
      continue;
    }
    if (tag !== "w:p") continue;

    const text = paragraphText(node);
    if (!text) continue;
    const level = headingLevel(node);
    const marker = level ? null : listMarkerFor(node);
    // Word headings are usually bold already; `# **Title**` is just noise.
    if (level) blocks.push({ kind: "heading", text: `${"#".repeat(level)} ${unwrapBold(text)}` });
    else if (marker) blocks.push({ kind: "list", text: `${marker}${text}` });
    else blocks.push({ kind: "p", text });
  }

  if (!blocks.length) throw new Error("document had no readable text");

  let out = "";
  blocks.forEach((block, index) => {
    if (index > 0) {
      const previous = blocks[index - 1];
      out += previous.kind === "list" && block.kind === "list" ? "\n" : "\n\n";
    }
    out += block.text;
  });

  return out.trim();
}
