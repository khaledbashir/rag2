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
