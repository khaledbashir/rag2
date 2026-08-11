import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  docxFileName,
  inferTitle,
  markdownToBlocks,
  markdownToDocxBuffer,
  normalizeInlineText,
  parseInline,
  tableColumnWidths,
} from "./markdownToDocx";

/** A trimmed copy of the real answer Jireh asked to export (2026-07-30). */
const JIREH_ANSWER = `# M&T Bank Stadium — Samsung Display Replacement Recap

**Venue:** M&T Bank Stadium | **Client:** Baltimore Ravens
**Account:** [[company:794cb80f-c7dc-4061-8cee-d50dcd3e8af8|Baltimore Ravens | M&T Bank Stadium]]

---

## Executive Summary

The Samsung LED display system is approaching end-of-life.

### 1. LED Modules — Critical & Accelerating

**Current mitigation (temporary):**
- Two new repair facilities have been sourced
- One facility is specializing in modules previously deemed unrepairable

## Recommendation

| Priority | Subsystem | Action | Timing |
|----------|-----------|--------|--------|
| :red_circle: Critical | LED Modules | Full replacement | Before 2026 season |
| :large_orange_circle: High | Processors | Replace alongside modules | Same window |

*Note: The CRM tracks LG for recent deals ([[opportunity:0e5fe27a-3818-4b96-9a4c-42fe6ba5e32d|WJHW RFP]]).*`;

describe("normalizeInlineText", () => {
  it("keeps the label from a CRM record link and drops the id", () => {
    expect(
      normalizeInlineText("[[company:794cb80f-c7dc-4061-8cee-d50dcd3e8af8|Baltimore Ravens | M&T Bank Stadium]]"),
    ).toBe("Baltimore Ravens | M&T Bank Stadium");
  });

  it("never leaks a raw uuid into the document", () => {
    expect(normalizeInlineText(JIREH_ANSWER)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(normalizeInlineText(JIREH_ANSWER)).not.toContain("[[");
  });

  it("renders Slack priority shortcodes as glyphs, leaving unknown ones alone", () => {
    expect(normalizeInlineText(":red_circle: Critical")).toBe("● Critical");
    expect(normalizeInlineText(":not_a_real_emoji: x")).toBe(":not_a_real_emoji: x");
  });

  it("keeps the text of a normal markdown link", () => {
    expect(normalizeInlineText("see [the report](https://example.com/a)")).toBe("see the report");
  });
});

describe("parseInline", () => {
  it("marks bold and italic spans", () => {
    const spans = parseInline("**Venue:** M&T *fast* text");
    expect(spans[0]).toEqual({ text: "Venue:", bold: true });
    expect(spans.find((s) => s.italics)?.text).toBe("fast");
  });

  it("does not mistake bold for two italics", () => {
    expect(parseInline("**bold**").every((s) => s.bold)).toBe(true);
  });
});

describe("markdownToBlocks", () => {
  it("builds a table from the recommendation grid, not paragraphs of pipes", () => {
    const blocks = markdownToBlocks(JIREH_ANSWER);
    const tables = blocks.filter((b) => b.constructor.name === "Table");
    expect(tables).toHaveLength(1);
  });

  it("treats '---' as a rule, never as a heading", () => {
    const blocks = markdownToBlocks("text\n\n---\n\nmore");
    expect(blocks).toHaveLength(3);
  });

  it("handles headings, bullets and numbered lists without dropping content", () => {
    const blocks = markdownToBlocks("# H\n\n- one\n- two\n\n1. first\n2. second");
    expect(blocks.length).toBe(5);
  });
});

describe("inferTitle / docxFileName", () => {
  it("takes the first heading as the title", () => {
    expect(inferTitle(JIREH_ANSWER)).toBe("M&T Bank Stadium — Samsung Display Replacement Recap");
  });

  it("makes a safe file name", () => {
    expect(docxFileName("M&T Bank Stadium — Recap")).toBe("M-T-Bank-Stadium-Recap.docx");
  });
});

describe("markdownToDocxBuffer", () => {
  it("produces a real .docx (a zip) for Jireh's answer", async () => {
    const buffer = await markdownToDocxBuffer(JIREH_ANSWER, { subtitle: "Prepared for Jireh Billings" });
    expect(buffer.length).toBeGreaterThan(4000);
    // Every .docx is a zip — check the local file header magic bytes.
    expect(buffer.subarray(0, 2).toString("binary")).toBe("PK");
  });

  /** Read the real document body out of the .docx zip. */
  const documentXml = async (buffer: Buffer): Promise<string> => {
    const zip = await JSZip.loadAsync(buffer);
    return zip.file("word/document.xml")!.async("string");
  };

  /** Every header part in the package, concatenated. */
  const headerXml = async (buffer: Buffer): Promise<string> => {
    const zip = await JSZip.loadAsync(buffer);
    const parts = zip.file(/word\/header\d*\.xml/);
    return (await Promise.all(parts.map((part) => part.async("string")))).join("\n");
  };

  const footerXml = async (buffer: Buffer): Promise<string> => {
    const zip = await JSZip.loadAsync(buffer);
    const parts = zip.file(/word\/footer\d*\.xml/);
    return (await Promise.all(parts.map((part) => part.async("string")))).join("\n");
  };

  it("sets the title in the header band and never repeats it in the body", async () => {
    const buffer = await markdownToDocxBuffer(JIREH_ANSWER);
    expect(await headerXml(buffer)).toContain("M&amp;T Bank Stadium — Samsung Display Replacement Recap");
    expect(await documentXml(buffer)).not.toContain("Samsung Display Replacement Recap");
  });

  it("dates the header, and lets a caller replace the date line", async () => {
    const dated = await markdownToDocxBuffer(JIREH_ANSWER, { date: new Date("2026-08-10T12:00:00Z") });
    expect(await headerXml(dated)).toContain("August 10, 2026");

    const attributed = await markdownToDocxBuffer(JIREH_ANSWER, { subtitle: "Prepared for Jireh Billings" });
    expect(await headerXml(attributed)).toContain("Prepared for Jireh Billings");
  });

  it("carries the ANC wordmark, the page footer and the sign-off", async () => {
    const buffer = await markdownToDocxBuffer(JIREH_ANSWER);
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file(/word\/media\/.*\.png/).length).toBeGreaterThan(0);

    const footer = await footerXml(buffer);
    expect(footer).toContain("www.anc.com");
    expect(footer).toContain("PAGE");
    expect(footer).toContain("NUMPAGES");

    expect(await documentXml(buffer)).toContain("ANC Sports Enterprises, LLC");
  });

  it("writes the real content, with no uuids or markdown syntax left in it", async () => {
    const xml = await documentXml(await markdownToDocxBuffer(JIREH_ANSWER, { subtitle: "Prepared for Jireh Billings" }));
    expect(xml).toContain("Baltimore Ravens");
    expect(xml).toContain("Two new repair facilities have been sourced");
    // House conventions must not survive into the document.
    expect(xml).not.toContain("[[");
    expect(xml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i);
    expect(xml).not.toContain(":red_circle:");
    expect(xml).not.toContain("**");
  });

  it("renders the recommendation grid as a Word table", async () => {
    const xml = await documentXml(await markdownToDocxBuffer(JIREH_ANSWER));
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("Before 2026 season");
    // The pipe characters of the source markdown must not appear as prose.
    expect(xml).not.toContain("|----------|");
  });

  it("keeps the first sentence of an answer that opens with prose", async () => {
    // The title falls back to that first line, which used to mean the line was
    // deleted from the body and the answer silently lost its opening.
    const buffer = await markdownToDocxBuffer("The Ravens renewal closes in March.\n\nDetails follow.");
    expect(await documentXml(buffer)).toContain("The Ravens renewal closes in March.");
  });

  it("exports an empty-ish answer without throwing", async () => {
    const buffer = await markdownToDocxBuffer("just one line");
    expect(buffer.subarray(0, 2).toString("binary")).toBe("PK");
  });
});

describe("tableColumnWidths", () => {
  const HEADER = ["Priority", "Subsystem", "Action", "Timing"];
  const ROWS = [
    [
      "Critical",
      "LED Modules",
      "Full replacement. All LED is End of Life and no longer produced. Samsung has also exited the LED display business",
      "Before 2026 season",
    ],
    ["High", "Processors / Signal Flow", "Replace alongside modules", "Same deployment window"],
  ];

  it("gives the widest column the most room and always fills the page", () => {
    const widths = tableColumnWidths(HEADER, ROWS);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(10240);
    expect(Math.max(...widths)).toBe(widths[2]);
  });

  it("never squeezes a column below its longest word", () => {
    const widths = tableColumnWidths(HEADER, ROWS);
    // "Priority" is 8 characters; anything narrower breaks the heading mid-word.
    expect(widths[0]).toBeGreaterThanOrEqual(8 * 120);
  });

  it("still returns a full-width set when every column is wordy", () => {
    const wordy = Array.from({ length: 6 }, () => "Extraordinarily-long-single-token-heading");
    const widths = tableColumnWidths(wordy, [wordy]);
    expect(widths).toHaveLength(6);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(10240);
    expect(Math.min(...widths)).toBeGreaterThan(0);
  });
});
