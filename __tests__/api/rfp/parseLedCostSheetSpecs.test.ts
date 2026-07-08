/**
 * @vitest-environment jsdom
 *
 * Characterization test for parseLedCostSheetSpecs (RFP LED Cost Sheet parser).
 *
 * Frozen-zone guard (Natalia 2026-07-08 bug): the ANC LED Cost Sheet format pads
 * each display row with blank spacer rows. The parser used to `break` on the
 * first blank row, dropping all screens after the first. The fix skips blank
 * spacer rows and breaks only on a totals/summary row or a long blank run.
 *
 * Heavy route dependencies (next/server, auth, prisma) are mocked so the parser
 * can be imported in vitest without the Next.js server runtime. The route file
 * itself is unchanged except the `export` keyword + the loop fix.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ log: () => {} }));
vi.mock("@/services/pricing/pricingTableParser", () => ({
  parsePricingTablesWithValidation: () => ({ tables: [], validation: { status: "PASS" } }),
}));
vi.mock("@/services/rfp/pipeline/bidFormFiller", () => ({}));
vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: () => ({}) },
}));

import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { parseLedCostSheetSpecs } from "@/app/api/rfp/analyze/excel/route";
import type { ExtractedLEDSpec, ExtractedProjectInfo } from "@/services/rfp/unified/types";

async function extractScreens(file: string, sheetName: RegExp) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(process.cwd(), file));
  const sheet = wb.worksheets.find((w) => sheetName.test(w.name));
  if (!sheet) throw new Error(`Sheet ${String(sheetName)} not found; sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  const screens: ExtractedLEDSpec[] = [];
  const project: ExtractedProjectInfo = { isOutdoor: false } as any;
  const warnings: string[] = [];
  parseLedCostSheetSpecs(sheet, screens, project, warnings);
  return { screens, warnings };
}

describe("parseLedCostSheetSpecs — multi-screen (blank-padded ANC layout)", () => {
  it("extracts ALL 9 UNC Kenan Stadium displays (not just the first)", async () => {
    const { screens } = await extractScreens("test-fixtures/rfp/unc-cost-sheet.xlsx", /LED Cost Sheet/i);
    expect(screens.length).toBe(9);
    expect(screens[0].name).toContain("Blue Zone");
    const names = screens.map((s) => s.name);
    expect(names.some((n) => n.includes("East End Zone"))).toBe(true);
    expect(names.some((n) => n.includes("Alternate"))).toBe(true);
    expect(names.some((n) => n.includes("Sideline Ribbon"))).toBe(true);
    expect(names.some((n) => n.includes("Monster Ribbon"))).toBe(true);
    expect(names.some((n) => n.includes("Upper Center Ribbon"))).toBe(true);
    expect(screens[0].pixelPitchMm).toBeGreaterThan(0);
  });

  it("extracts all displays from the blank-padded Indiana Fever fixture", async () => {
    const { screens } = await extractScreens("test-fixtures/pricing/Cost Analysis - Indiana Fever - 2026-01-22 (2).xlsx", /LED Cost Sheet/i);
    // Old break-on-blank stopped after the first display group (4). The fix
    // extracts all display groups across the blank spacers.
    expect(screens.length).toBeGreaterThan(4);
    expect(screens.length).toBeLessThanOrEqual(20);
    const names = screens.map((s) => s.name);
    expect(names.some((n) => n.includes("Atrium Display"))).toBe(true);
    expect(names.some((n) => n.includes("Locker Room Ribbon"))).toBe(true);
    expect(names.some((n) => n.includes("Team Store"))).toBe(true);
  });

  it("stops at end-of-list (exactly 9 for UNC, no spurious screens)", async () => {
    const { screens } = await extractScreens("test-fixtures/rfp/unc-cost-sheet.xlsx", /LED Cost Sheet/i);
    expect(screens.length).toBe(9);
  });
});