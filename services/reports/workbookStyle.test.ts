import { describe, expect, it } from "vitest";
import { contentDisposition } from "./workbookStyle";

const isByteString = (s: string) => [...s].every((ch) => ch.charCodeAt(0) <= 255);

describe("contentDisposition", () => {
  // "Renewals — Next 90 Days" 500'd the export: a header value must be a
  // ByteString and U+2014 is not one.
  it("survives an em dash in the report name", () => {
    const h = contentDisposition("Renewals — Next 90 Days 2026-08-21.xlsx");
    expect(isByteString(h)).toBe(true);
    expect(h).toContain('filename="Renewals - Next 90 Days 2026-08-21.xlsx"');
  });

  it("carries the real name in the RFC 8187 parameter", () => {
    const h = contentDisposition("Renewals — Next 90 Days.xlsx");
    expect(h).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(h.split("filename*=UTF-8''")[1])).toBe("Renewals — Next 90 Days.xlsx");
  });

  it("folds smart quotes and strips characters a filesystem rejects", () => {
    const h = contentDisposition('Jireh’s "Q4" / 2026 report.xlsx');
    expect(isByteString(h)).toBe(true);
    expect(h).toContain("Jireh's");
    expect(h.split(";")[1]).not.toContain("/");
  });

  it("never yields an empty filename", () => {
    const h = contentDisposition("——");
    expect(isByteString(h)).toBe(true);
    expect(h).toMatch(/filename="[^"]+"/);
  });

  it("leaves a plain ASCII name alone", () => {
    expect(contentDisposition("Backlog 2026-08-21.xlsx")).toContain('filename="Backlog 2026-08-21.xlsx"');
  });
});
