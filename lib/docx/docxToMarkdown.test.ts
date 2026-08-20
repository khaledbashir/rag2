/**
 * The Word → markdown half of the CRM round-trip.
 *
 * The fixture `ravens-assessment.docx` is the real document Natalia Kovaleva
 * uploaded on 2026-08-20 when she reported "it did not identified bullet
 * points and threw all tables at the end of the file". It is the case that
 * matters: 35 list paragraphs written with the ListBullet STYLE and not one
 * <w:numPr> in the file, plus four tables with prose after the last one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { docxToMarkdown, readZipEntry } from "./docxToMarkdown";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "test-fixtures/docx", name));

const RAVENS = () => fixture("ravens-assessment.docx");
const TABLE = () => fixture("table.docx");
const AMP = () => fixture("amp.docx");

describe("docxToMarkdown", () => {
  it("recovers bullets written with the ListBullet style", () => {
    const markdown = docxToMarkdown(RAVENS());
    const bullets = markdown.match(/^ *- /gm) || [];

    // Her document carries no numbering properties at all, which is the shape
    // that used to come back as flat prose.
    expect(bullets.length).toBeGreaterThanOrEqual(30);
  });

  it("recovers bullets written with numbering properties", () => {
    expect(docxToMarkdown(TABLE())).toContain("- A bullet carried by numbering properties");
  });

  it("leaves a table where the document put it, not at the end", () => {
    const markdown = docxToMarkdown(TABLE());
    const firstTable = markdown.indexOf("\n|");
    const trailingProse = markdown.lastIndexOf("ANC Sports Enterprises");

    expect(firstTable).toBeGreaterThan(-1);
    expect(trailingProse).toBeGreaterThan(firstTable);
  });

  it("keeps every table of a real document in document order", () => {
    const lines = docxToMarkdown(RAVENS()).split("\n");
    const tableLines = lines.map((line, i) => (line.startsWith("|") ? i : -1)).filter((i) => i >= 0);
    const afterLastTable = lines.slice(tableLines[tableLines.length - 1] + 1).filter((l) => l.trim());

    expect(tableLines.length).toBeGreaterThanOrEqual(20);
    // Prose follows the last table in the source, so it must follow it here.
    expect(afterLastTable.length).toBeGreaterThan(0);
  });

  it("recovers headings rather than a wall of prose", () => {
    expect((docxToMarkdown(RAVENS()).match(/^#{1,6} /gm) || []).length).toBeGreaterThanOrEqual(15);
  });

  it("keeps the escaped characters a document is full of", () => {
    const markdown = docxToMarkdown(AMP());

    expect(markdown).toContain("Johnson & Johnson");
    expect(markdown).toContain("AT&T");
    expect(markdown).toContain("< 5%");
    expect(markdown).toContain("> 2%");
  });

  it("keeps M&T Bank Stadium — the name in every Ravens document", () => {
    const markdown = docxToMarkdown(RAVENS());

    expect(markdown).toContain("M&T Bank Stadium");
    expect(markdown).not.toContain("MT Bank Stadium");
  });

  it("drops the redundant emphasis from a heading that is entirely bold", () => {
    const markdown = docxToMarkdown(RAVENS());

    expect(markdown).toContain("# Executive Summary");
    expect(markdown).not.toContain("# **Executive Summary**");
  });

  it("throws on a file that is not a Word document instead of returning junk", () => {
    expect(() => docxToMarkdown(Buffer.from("this is not a zip"))).toThrow(/not a zip archive/);
  });

  it("throws when the archive has no document part", () => {
    expect(() => readZipEntry(AMP(), "word/nope.xml")).toThrow(/not found in archive/);
  });
});
