import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  docxFileName,
  inferTitle,
  markdownToBlocks,
  markdownToDocxBuffer,
  normalizeInlineText,
  parseInline,
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

  it("does not print the title twice", async () => {
    const xml = await documentXml(await markdownToDocxBuffer(JIREH_ANSWER));
    const occurrences = xml.split("Samsung Display Replacement Recap").length - 1;
    expect(occurrences).toBe(1);
  });

  it("writes the real content, with no uuids or markdown syntax left in it", async () => {
    const xml = await documentXml(await markdownToDocxBuffer(JIREH_ANSWER, { subtitle: "Prepared for Jireh Billings" }));
    expect(xml).toContain("Baltimore Ravens");
    expect(xml).toContain("Prepared for Jireh Billings");
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

  it("exports an empty-ish answer without throwing", async () => {
    const buffer = await markdownToDocxBuffer("just one line");
    expect(buffer.subarray(0, 2).toString("binary")).toBe("PK");
  });
});
