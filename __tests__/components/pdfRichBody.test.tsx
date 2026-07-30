/**
 * Rich body text in the editable document sections (Natalia 2026-07-30).
 *
 * The load-bearing assertion here is the regression one: every document saved
 * before this change holds plain text, and it must render exactly as it did —
 * same line breaks, no Markdown interpretation, no list markup appearing where
 * an author typed a stray hyphen mid-sentence.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PdfRichBody, { hasRichFormatting } from "@/app/components/templates/proposal-pdf/PdfRichBody";
import { toggleBold, toggleList } from "@/components/ui/rich-textarea";

const html = (text: string) => renderToStaticMarkup(<PdfRichBody text={text} />);

describe("hasRichFormatting", () => {
  it("detects bullets, numbering and bold", () => {
    expect(hasRichFormatting("- one\n- two")).toBe(true);
    expect(hasRichFormatting("* one")).toBe(true);
    expect(hasRichFormatting("1. one\n2. two")).toBe(true);
    expect(hasRichFormatting("1) one")).toBe(true);
    expect(hasRichFormatting("this is **bold** text")).toBe(true);
  });

  it("does not fire on ordinary prose", () => {
    expect(hasRichFormatting("Coverage runs game-day only.")).toBe(false);
    expect(hasRichFormatting("")).toBe(false);
    expect(hasRichFormatting("   ")).toBe(false);
    // a hyphen mid-sentence is not a list
    expect(hasRichFormatting("Non-event days are billed separately.")).toBe(false);
    // a date is not a numbered list
    expect(hasRichFormatting("2026-2027 term applies.")).toBe(false);
  });
});

describe("PdfRichBody — existing plain text is unchanged", () => {
  it("renders prose with no list or emphasis markup", () => {
    const out = html("ANC will provide on-site support.\nSecond line stays a second line.");
    expect(out).not.toContain("<ul");
    expect(out).not.toContain("<ol");
    expect(out).not.toContain("<strong");
    expect(out).toContain("ANC will provide on-site support.");
    expect(out).toContain("Second line stays a second line.");
  });

  it("keeps pre-wrap so single newlines stay line breaks", () => {
    expect(html("line one\nline two")).toContain("pre-wrap");
  });

  it("renders nothing for empty text", () => {
    expect(html("")).toBe("");
    expect(html("   ")).toBe("");
  });
});

describe("PdfRichBody — formatting Natalia asked for", () => {
  it("renders a bulleted list", () => {
    const out = html("- Game-day coverage\n- Preventative maintenance");
    expect(out).toContain("<ul");
    expect((out.match(/<li/g) || []).length).toBe(2);
    expect(out).toContain("Game-day coverage");
  });

  it("renders a numbered list", () => {
    const out = html("1. First\n2. Second\n3. Third");
    expect(out).toContain("<ol");
    expect((out.match(/<li/g) || []).length).toBe(3);
  });

  it("renders bold", () => {
    expect(html("Coverage is **not** included on dark days")).toContain("<strong");
  });

  it("carries inline styles, because the PDF pipeline can lose the stylesheet", () => {
    const out = html("- one\n- two");
    expect(out).toContain("list-style-type:disc");
    expect(out).toContain("padding-left:20px");
    expect(html("**x**")).toContain("font-weight:700");
  });

  it("never emits a heading that would compete with the section header", () => {
    const out = html("# Scope\n\n- item");
    expect(out).not.toContain("<h1");
    expect(out).not.toContain("<h2");
  });
});

describe("formatting buttons write the syntax", () => {
  it("wraps a selection in bold and keeps it selected", () => {
    const r = toggleBold("make this bold", 5, 9);
    expect(r.value).toBe("make **this** bold");
    expect(r.value.slice(r.selStart, r.selEnd)).toBe("this");
  });

  it("unwraps bold when applied twice", () => {
    const once = toggleBold("make this bold", 5, 9);
    const twice = toggleBold(once.value, once.selStart, once.selEnd);
    expect(twice.value).toBe("make this bold");
  });

  it("drops markers with the caret between them when nothing is selected", () => {
    const r = toggleBold("ab", 1, 1);
    expect(r.value).toBe("a****b");
    expect(r.selStart).toBe(3);
    expect(r.selEnd).toBe(3);
  });

  it("bullets every selected line", () => {
    const r = toggleList("one\ntwo\nthree", 0, 13, "bullet");
    expect(r.value).toBe("- one\n- two\n- three");
  });

  it("removes bullets when applied twice", () => {
    const once = toggleList("one\ntwo", 0, 7, "bullet");
    const twice = toggleList(once.value, once.selStart, once.selEnd, "bullet");
    expect(twice.value).toBe("one\ntwo");
  });

  it("numbers lines in sequence", () => {
    const r = toggleList("one\ntwo\nthree", 0, 13, "number");
    expect(r.value).toBe("1. one\n2. two\n3. three");
  });

  it("converts a bulleted block to a numbered one", () => {
    const r = toggleList("- one\n- two", 0, 11, "number");
    expect(r.value).toBe("1. one\n2. two");
  });

  it("expands a partial selection to whole lines", () => {
    const r = toggleList("alpha\nbeta", 2, 7, "bullet");
    expect(r.value).toBe("- alpha\n- beta");
  });

  it("leaves blank lines alone", () => {
    const r = toggleList("one\n\ntwo", 0, 8, "bullet");
    expect(r.value).toBe("- one\n\n- two");
  });
});
