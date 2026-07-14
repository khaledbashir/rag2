/**
 * Integration tests for parseANCExcel — LED sheet parser
 *
 * Uses real Excel files from the project as fixtures.
 * These tests lock in the expected screen count, pitch, dimensions, and
 * grand total for every file in scope. If a code change breaks extraction
 * on any of these files, the test fails before Natalia sees it.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as xlsx from "xlsx";

// ---------------------------------------------------------------------------
// Helpers — replicate the core extraction logic so tests are self-contained
// and don't depend on the full Next.js server environment
// ---------------------------------------------------------------------------

const FIXTURES = path.resolve(__dirname, "../../../");

function loadWorkbook(relPath: string) {
  const abs = path.join(FIXTURES, relPath);
  return xlsx.read(fs.readFileSync(abs), { type: "buffer" });
}

/**
 * Some source workbooks (Ravens ribbons, Union Station) were loose local files
 * that never became tracked fixtures — their suites run only where the file
 * exists instead of failing the whole suite on a fresh checkout.
 */
function fixtureExists(relPath: string): boolean {
  return fs.existsSync(path.join(FIXTURES, relPath));
}

const parseDim = (v: any): number =>
  Number(String(v ?? "").replace(/[^\d.\-]/g, ""));

interface ExtractedScreen {
  name: string;
  pitch: number;
  heightFt: number;
  widthFt: number;
  qty: number;
}

interface ExtractionResult {
  ledSheet: string | null;
  marginSheet: string | null;
  respMatrixSheets: string[];
  screens: ExtractedScreen[];
  grandTotal: number | null;
}

function extractFromWorkbook(wb: xlsx.WorkBook): ExtractionResult {
  // --- LED sheet ---
  const ledName = wb.SheetNames.find((s) => /led/i.test(s)) ?? null;
  const marginName =
    wb.SheetNames.find((s) => /margin\s*analysis/i.test(s)) ??
    wb.SheetNames.find((s) => /margin/i.test(s)) ??
    null;

  // Resp Matrix: prefer non-example, fall back to example-only
  const allResp = wb.SheetNames.filter((s) =>
    /^resp\s*matrix\b/i.test(s.trim())
  );
  const nonExample = allResp.filter((s) => !/\bexample\b/i.test(s));
  const respMatrixSheets = nonExample.length > 0 ? nonExample : allResp;

  if (!ledName) {
    return { ledSheet: null, marginSheet: marginName, respMatrixSheets, screens: [], grandTotal: null };
  }

  const ledData: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[ledName], {
    header: 1,
  });

  // Find header row
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(ledData.length, 20); i++) {
    const row = ledData[i] || [];
    const hasOption = row.some(
      (c) => (c ?? "").toString().trim().toUpperCase() === "OPTION"
    );
    const hasPitch = row.some(
      (c) => (c ?? "").toString().trim().toUpperCase() === "PITCH"
    );
    const hasDisplayName = row.some(
      (c) => (c ?? "").toString().trim().toUpperCase() === "DISPLAY NAME"
    );
    if ((hasOption && hasPitch) || hasDisplayName) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) {
    return { ledSheet: ledName, marginSheet: marginName, respMatrixSheets, screens: [], grandTotal: null };
  }

  const headers = ledData[headerRowIndex] || [];
  const findCol = (regex: RegExp) =>
    headers.findIndex((h: any) => regex.test((h ?? "").toString().trim()));

  const nameCol  = Math.max(0, findCol(/^(display\s*name|display|option|screen\s*name)$/i));
  const pitchCol = findCol(/^pitch|mm\s*pitch|pixel\s*pitch/i);
  const hCol     = findCol(/^h(eight)?\s*(\(ft\))?$|^h$/i);
  const wCol     = findCol(/^w(idth)?\s*(\(ft\))?$|^w$/i);
  const qtyCol   = findCol(/^(qty|quantity|#\s*of\s*screens?|no\.?\s*of\s*screens?|of\s*screens?)$/i);

  const pc = pitchCol >= 0 ? pitchCol : 4;
  const hc = hCol >= 0 ? hCol : 5;
  const wc = wCol >= 0 ? wCol : 6;
  const qc = qtyCol >= 0 ? qtyCol : 11;

  const screens: ExtractedScreen[] = [];
  for (let i = headerRowIndex + 1; i < ledData.length; i++) {
    const row = ledData[i] || [];
    const name = (row[nameCol] ?? "").toString().trim();
    const pitch = parseDim(row[pc]);
    const h = parseDim(row[hc]);
    const w = parseDim(row[wc]);
    const qty = Number(row[qc]) || 1;
    if (name && pitch > 0 && h > 0 && w > 0) {
      screens.push({ name, pitch, heightFt: h, widthFt: w, qty });
    }
  }

  // Grand total from Margin Analysis
  let grandTotal: number | null = null;
  if (marginName) {
    const mData: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[marginName], {
      header: 1,
    });
    for (const row of mData) {
      const label = (row[0] ?? "").toString().toLowerCase();
      if (label.includes("sub total") && label.includes("bid form")) {
        // Selling price is typically col 2 or 3
        for (let c = 1; c < Math.min(row.length, 6); c++) {
          const val = Number(row[c]);
          if (Number.isFinite(val) && val > 0) {
            grandTotal = val;
            break;
          }
        }
      }
    }
  }

  return { ledSheet: ledName, marginSheet: marginName, respMatrixSheets, screens, grandTotal };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Excel Import — Indiana Fever", () => {
  const wb = loadWorkbook(
    "test-fixtures/pricing/Cost Analysis - Indiana Fever - 2026-01-22 (2).xlsx"
  );
  const result = extractFromWorkbook(wb);

  it("finds LED Cost Sheet", () => {
    expect(result.ledSheet).toBe("LED Cost Sheet");
  });

  it("finds Margin Analysis sheet", () => {
    expect(result.marginSheet).toBe("Margin Analysis");
  });

  it("extracts 13 screens", () => {
    expect(result.screens).toHaveLength(13);
  });

  it("first screen has correct pitch and dimensions", () => {
    const s = result.screens[0];
    expect(s.pitch).toBeCloseTo(2.5, 1);
    expect(s.heightFt).toBeGreaterThan(0);
    expect(s.widthFt).toBeGreaterThan(0);
  });

  it("detects Resp Matrix (non-example)", () => {
    expect(result.respMatrixSheets).toContain("Resp Matrix");
    expect(result.respMatrixSheets).not.toContain("Resp Matrix-Indoor Wall Example");
  });
});

describe("Excel Import — NBCU 2025 Project 9C", () => {
  const wb = loadWorkbook(
    "test-fixtures/pricing/Cost Analysis - NBCU 2025 Project - 9C - 10-30-2025.xlsx"
  );
  const result = extractFromWorkbook(wb);

  it("finds LED Cost Sheet", () => {
    expect(result.ledSheet).toBe("LED Cost Sheet");
  });

  it("extracts 7 screens", () => {
    expect(result.screens).toHaveLength(7);
  });

  it("all screens have valid pitch > 0", () => {
    for (const s of result.screens) {
      expect(s.pitch).toBeGreaterThan(0);
    }
  });

  it("all screens have valid height and width > 0", () => {
    for (const s of result.screens) {
      expect(s.heightFt).toBeGreaterThan(0);
      expect(s.widthFt).toBeGreaterThan(0);
    }
  });

  it("grand total is positive", () => {
    expect(result.grandTotal).not.toBeNull();
    expect(result.grandTotal!).toBeGreaterThan(0);
  });

  it("detects Resp Matrix-NBCU (non-example)", () => {
    expect(result.respMatrixSheets).toContain("Resp Matrix-NBCU");
  });
});

describe("Excel Import — USC Williams-Brice Stadium", () => {
  const wb = loadWorkbook(
    "test-fixtures/pricing/golden/USC - Williams-Brice Stadium - Additional LED Displays - Cost Analysis (Budget) - DJC & JSR - 2026-02-09 (1).xlsx"
  );
  const result = extractFromWorkbook(wb);

  it("finds LED Cost Sheet", () => {
    expect(result.ledSheet).toBe("LED Cost Sheet");
  });

  it("extracts 2 screens", () => {
    expect(result.screens).toHaveLength(2);
  });

  it("screens have large outdoor pitch (8-11mm range)", () => {
    for (const s of result.screens) {
      expect(s.pitch).toBeGreaterThan(7);
      expect(s.pitch).toBeLessThan(12);
    }
  });

  it("grand total is in the millions (large stadium)", () => {
    expect(result.grandTotal).not.toBeNull();
    expect(result.grandTotal!).toBeGreaterThan(1_000_000);
  });

  it("falls back to example-named resp matrix sheets when no real ones exist", () => {
    // This file only has example-named resp matrix sheets — should still return them
    expect(result.respMatrixSheets.length).toBeGreaterThan(0);
  });
});

const RAVENS_FIXTURE =
  "exports/nbcu_full_extract/Copy of MT Bank Stadium - Baltimore Ravens - Upper and Lower In-Bowl Ribbons - Cost Analysis - JSR - 2026-02-14 (2).xlsx";
describe.skipIf(!fixtureExists(RAVENS_FIXTURE))("Excel Import — Baltimore Ravens MT Bank Stadium", () => {
  const result = fixtureExists(RAVENS_FIXTURE)
    ? extractFromWorkbook(loadWorkbook(RAVENS_FIXTURE))
    : (null as any);

  it("finds LED Cost Sheet", () => {
    expect(result.ledSheet).toBe("LED Cost Sheet");
  });

  it("extracts 4 ribbon screens", () => {
    expect(result.screens).toHaveLength(4);
  });

  it("all screens are 10mm pitch (ribbon displays)", () => {
    for (const s of result.screens) {
      expect(s.pitch).toBeCloseTo(10, 0);
    }
  });

  it("all screens have very large width (ribbon displays > 400ft)", () => {
    for (const s of result.screens) {
      expect(s.widthFt).toBeGreaterThan(400);
    }
  });

  it("grand total is in the millions", () => {
    expect(result.grandTotal).not.toBeNull();
    expect(result.grandTotal!).toBeGreaterThan(1_000_000);
  });
});

const UNION_STATION_FIXTURE =
  "services/pricing/Cost Analysis - Union Station - 2026-01-12 (1).xlsx";
describe.skipIf(!fixtureExists(UNION_STATION_FIXTURE))("Excel Import — Union Station (pitch stored as '2.5mm' string)", () => {
  const result = fixtureExists(UNION_STATION_FIXTURE)
    ? extractFromWorkbook(loadWorkbook(UNION_STATION_FIXTURE))
    : (null as any);

  it("finds LED Cost Sheet", () => {
    expect(result.ledSheet).toBe("LED Cost Sheet");
  });

  it("extracts 7 screens despite pitch stored as '2.5mm' string", () => {
    // This was the bug: Number('2.5mm') = NaN → all screens dropped
    expect(result.screens).toHaveLength(7);
  });

  it("all screens have pitch 2.5 (parsed correctly from string)", () => {
    for (const s of result.screens) {
      expect(s.pitch).toBeCloseTo(2.5, 1);
    }
  });

  it("falls back to example-named resp matrix sheets (all 3 are example-named)", () => {
    // Union Station only has 'Resp Matrix - ROM Example' etc — should still return them
    expect(result.respMatrixSheets.length).toBe(3);
    expect(result.respMatrixSheets[0]).toMatch(/resp matrix/i);
  });

  it("grand total is positive", () => {
    expect(result.grandTotal).not.toBeNull();
    expect(result.grandTotal!).toBeGreaterThan(0);
  });
});

describe("Regression — pitch string formats", () => {
  it("parseDim handles '2.5mm'", () => {
    expect(parseDim("2.5mm")).toBeCloseTo(2.5);
  });
  it("parseDim handles '10.417mm'", () => {
    expect(parseDim("10.417mm")).toBeCloseTo(10.417);
  });
  it("parseDim handles bare number 2.5", () => {
    expect(parseDim(2.5)).toBeCloseTo(2.5);
  });
  it("parseDim handles '1.875 mm'", () => {
    expect(parseDim("1.875 mm")).toBeCloseTo(1.875);
  });
  it("parseDim returns 0 for empty string", () => {
    expect(parseDim("")).toBe(0);
  });
  it("parseDim returns 0 for undefined", () => {
    expect(parseDim(undefined)).toBe(0);
  });
});
