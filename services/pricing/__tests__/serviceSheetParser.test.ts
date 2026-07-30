/**
 * Characterization tests for the service-sheet Mirror parser against the real
 * Carolina Panthers 2026-2028 Service Contract workbook (Natalia 2026-07-14).
 *
 * The Panthers file is the reference shape: "26-28 w Break fix" (live) + "old"
 * (stale copy), Income: at A9, Expenses: at A19, year columns F/G labeled
 * 26/27 + 27/28, four client-facing fee lines + TOTAL INCOME + a
 * "*20% Bundle Discount Added" note row.
 */
import { describe, it, expect } from "vitest";
import path from "path";
import * as xlsx from "xlsx";

import {
  detectServiceSheet,
  isServiceSheetWorkbook,
  listServiceSheets,
  parseServiceSheet,
} from "@/services/pricing/serviceSheetParser";

const PANTHERS_FIXTURE = path.resolve(
  process.cwd(),
  "test-fixtures/service/Carolina Panthers 2026-2028 Service Contract.xlsx",
);
const PANTHERS_FILENAME = "Carolina Panthers 2026-2028 Service Contract (1).xlsx";

const LED_FIXTURE = path.resolve(
  process.cwd(),
  "test-fixtures/pricing/Cost Analysis - Indiana Fever - 2026-01-22 (2).xlsx",
);

function loadWorkbook(file: string) {
  return xlsx.readFile(file, { cellStyles: true });
}

describe("detectServiceSheet", () => {
  it("recognizes the Panthers workbook as a service sheet and prefers the live tab over 'old'", () => {
    const wb = loadWorkbook(PANTHERS_FIXTURE);
    const structure = detectServiceSheet(wb);
    expect(structure).not.toBeNull();
    expect(structure!.sheetName).toBe("26-28 w Break fix");
    expect(structure!.yearLabels).toEqual(["26/27", "27/28"]);
  });

  it("does NOT flag an LED margin-analysis workbook as a service sheet", () => {
    const wb = loadWorkbook(LED_FIXTURE);
    expect(isServiceSheetWorkbook(wb)).toBe(false);
  });
});

describe("parseServiceSheet — Panthers reference file", () => {
  const wb = loadWorkbook(PANTHERS_FIXTURE);
  const { document, prefill } = parseServiceSheet(wb, PANTHERS_FILENAME);

  it("extracts exactly the client-facing column-B lines between Income and Expenses", () => {
    const lines = document.rows.filter((r) => r.kind === "line");
    expect(lines.map((r) => r.label)).toEqual([
      "Pre Event Hardware Support",
      "MLS Event Hardware Support",
      "Panthers Event Hardware Support",
      "Break/Fix Hardware Maintenance",
    ]);
  });

  it("keeps the bundle-discount note as a note row, not a fee line", () => {
    const notes = document.rows.filter((r) => r.kind === "note");
    expect(notes.map((r) => r.label)).toEqual(["*20% Bundle Discount Added"]);
  });

  it("mirrors the Excel values exactly (cached formula results, both years)", () => {
    const lines = document.rows.filter((r) => r.kind === "line");
    // Income lines: Pre Event = 26.5*2*850, MLS = 15.5*2*850, Panthers = 11*3*850,
    // Break/Fix = expenses*1.62 — mirrored from Excel's cached values, never recomputed.
    const rawByLabel = Object.fromEntries(lines.map((r) => [r.label, r.cells.map((c) => c.raw)]));
    expect(rawByLabel["Pre Event Hardware Support"]).toEqual([45050, 45050]);
    expect(rawByLabel["MLS Event Hardware Support"]).toEqual([26350, 26350]);
    expect(rawByLabel["Panthers Event Hardware Support"]).toEqual([28050, 28050]);
    // Break/Fix mirrors whatever Excel cached — assert it's numeric and equal across years.
    const breakFix = rawByLabel["Break/Fix Hardware Maintenance"];
    expect(typeof breakFix[0]).toBe("number");
    expect(breakFix[0]).toBe(breakFix[1]);
  });

  it("captures the TOTAL INCOME row as the yearly total, matching the sum Excel cached", () => {
    expect(document.totalRow).not.toBeNull();
    expect(document.totalRow!.label).toBe("TOTAL INCOME");
    const total = document.totalRow!.cells[0].raw;
    expect(typeof total).toBe("number");
    // Trust-the-source check: the mirrored total equals Excel's own cached sum
    // of the mirrored line values (we never recompute, only cross-check).
    const lines = document.rows.filter((r) => r.kind === "line");
    const sum = lines.reduce((acc, r) => acc + Number(r.cells[0].raw ?? 0), 0);
    expect(total).toBeCloseTo(sum, 2);
  });

  it("recognizes term + client + venue (bonus prefill)", () => {
    expect(document.termYears).toBe(2);
    expect(document.termStartYear).toBe(2026);
    expect(document.termEndYear).toBe(2028);
    expect(prefill.clientName).toBe("Carolina Panthers");
    expect(prefill.venueName).toBe("Bank of America Stadium");
    expect(prefill.venueAddress).toContain("Charlotte");
    expect(prefill.league).toBe("NFL");
    expect(document.currency).toBe("USD");
  });

  it("throws a clear error for non-service workbooks", () => {
    const wb2 = loadWorkbook(LED_FIXTURE);
    expect(() => parseServiceSheet(wb2, "led.xlsx")).toThrow(/not a recognized service sheet/i);
  });
});

/**
 * Fifth Third Park 2026-2028 (Natalia 2026-07-30: "service excel format is not
 * being recognized"). Same Property/Event Budget Overview shape as the Panthers
 * file, but the contract-year columns are labelled with a bare year on the
 * "Team:" row — 2026 | 2026 | 2026 — instead of a season range, so the
 * range-only header regex found no year columns and the workbook fell through
 * to the LED column-mapper path.
 */
const FIFTH_THIRD_FIXTURE = path.resolve(
  process.cwd(),
  "test-fixtures/service/Fifth Third Park 2026-2028 Service.xlsx",
);
const FIFTH_THIRD_FILENAME = "Fifth Third Park 2026-2028 Service (1).xlsx";

describe("Fifth Third Park — bare-year column headers", () => {
  const wb = loadWorkbook(FIFTH_THIRD_FIXTURE);

  it("recognizes the workbook as a service sheet", () => {
    expect(isServiceSheetWorkbook(wb)).toBe(true);
    const structure = detectServiceSheet(wb);
    expect(structure!.sheetName).toBe("Option 1");
    expect(structure!.yearCols).toEqual([5, 6, 7]);
  });

  const { document, prefill } = parseServiceSheet(wb, FIFTH_THIRD_FILENAME);

  it("extracts the client-facing fee lines between Income and Expenses", () => {
    const lines = document.rows.filter((r) => r.kind === "line");
    expect(lines.map((r) => r.label)).toEqual([
      "Preseason Check",
      "Graphics (up to 100 hours)",
      "VSB License Fee",
      "Tech Support",
      "LiveSync License",
      "Parts Waranty",
    ]);
  });

  it("mirrors Excel values exactly, including 'Included' text cells", () => {
    const byLabel = Object.fromEntries(
      document.rows.filter((r) => r.kind === "line").map((r) => [r.label, r.cells]),
    );
    expect(byLabel["Preseason Check"].map((c) => c.raw)).toEqual(["Included", 7500, 7875]);
    expect(byLabel["Preseason Check"][0].display).toBe("Included");
    expect(byLabel["VSB License Fee"].map((c) => c.raw)).toEqual([13500, 13500, 13500]);
  });

  it("captures TOTAL INCOME as the yearly total", () => {
    expect(document.totalRow!.label).toBe("TOTAL INCOME");
    expect(document.totalRow!.cells.map((c) => c.raw)).toEqual([53500, 82188, 90308]);
  });

  it("numbers repeated year headers across the term and records the substitution", () => {
    expect(document.yearLabels).toEqual(["2026", "2027", "2028"]);
    expect(document.termYears).toBe(3);
    expect(document.termStartYear).toBe(2026);
    expect(document.termEndYear).toBe(2028);
    expect(document.metadata.warnings.join(" ")).toMatch(/all read "2026".*numbered them 2026, 2027, 2028/i);
  });

  it("still prefills the client from the file name", () => {
    expect(prefill.clientName).toBe("Fifth Third Park");
    expect(prefill.termYears).toBe(3);
  });
});

describe("Fifth Third Park — priced option tabs", () => {
  const wb = loadWorkbook(FIFTH_THIRD_FIXTURE);

  it("lists every priced option tab, best candidate first", () => {
    expect(listServiceSheets(wb).map((s) => s.sheetName)).toEqual(["Option 1", "Option 2"]);
  });

  it("keeps the 'Option 1' variant label out of the client name", () => {
    const structure = detectServiceSheet(wb)!;
    expect(structure.variantLabel).toBe("Option 1");
    expect(structure.teamName).toBeNull();
    const { prefill } = parseServiceSheet(wb, FIFTH_THIRD_FILENAME);
    expect(prefill.clientName).toBe("Fifth Third Park");
  });

  it("warns that other priced options exist rather than dropping them silently", () => {
    const { document } = parseServiceSheet(wb, FIFTH_THIRD_FILENAME);
    expect(document.metadata.warnings.join(" ")).toMatch(/2 priced options \(Option 1, Option 2\).*Imported "Option 1"/);
  });

  it("imports a named option tab on request", () => {
    const { document } = parseServiceSheet(wb, FIFTH_THIRD_FILENAME, "Option 2");
    expect(document.sourceSheet).toBe("Option 2");
    expect(document.rows.filter((r) => r.kind === "line").map((r) => r.label)).toEqual([
      "VSB License Fee",
      "Tech Support",
      "LiveSync License",
      "Parts Waranty",
    ]);
    expect(document.totalRow!.cells.map((c) => c.raw)).toEqual([23500, 46688, 52855]);
  });
});
