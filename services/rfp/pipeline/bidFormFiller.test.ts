import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { extractSpecsFromBidForm, fillBidForm } from "./bidFormFiller";
import type { ExtractedLEDSpec } from "@/services/rfp/unified/types";

const repoRoot = process.cwd();

function fixture(name: string) {
  return path.join(repoRoot, name);
}

describe("bidFormFiller product data forms", () => {
  it("extracts one screen per sheet from generated product data forms", async () => {
    const buffer = fs.readFileSync(
      fixture("docs/Capital One Arena - Bid Package 4_Product_Data_Forms.xlsx")
    );

    const result = await extractSpecsFromBidForm(buffer);

    expect(result.blockCount).toBe(42);
    expect(result.specs).toHaveLength(42);
    expect(result.specs[0]).toMatchObject({
      name: "LED-GPL2-01",
      pixelPitchMm: 1.2,
      widthFt: 15.748,
      heightFt: 8.858268,
    });
  });

  it("fills the blank COAT product data form template", async () => {
    const buffer = fs.readFileSync(
      fixture("docs/11 63 10 PRODUCT DATA FORM - COAT PHASES 3-7 (2).xlsx")
    );
    const screen: ExtractedLEDSpec = {
      name: "Test Display",
      location: "Main Bowl",
      widthFt: 16,
      heightFt: 9,
      widthPx: 4096,
      heightPx: 2304,
      pixelPitchMm: 2.5,
      brightnessNits: 7500,
      environment: "outdoor",
      quantity: 1,
      serviceType: null,
      mountingType: null,
      maxPowerW: 12000,
      weightLbs: 2500,
      specialRequirements: [],
      confidence: 0.9,
      sourcePages: [],
      sourceType: "table",
      citation: "test",
      notes: null,
    };

    const result = await fillBidForm(buffer, [screen]);

    expect(result.matches).toHaveLength(1);
    expect(result.unmatchedBlocks).toEqual([]);
    expect(result.unmatchedScreens).toEqual([]);
    expect(result.matches[0].fieldsFilled).toContain("pixelPitchH");
    expect(result.matches[0].fieldsFilled).toContain("powerAt100");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const sheet = workbook.worksheets[0];

    expect(sheet.getCell("F1").value).toBe("ANC Sports Enterprises");
    expect(sheet.getCell("B5").value).toBe("Test Display");
    expect(sheet.getCell("G5").value).toBe("Main Bowl");
    expect(sheet.getCell("I16").value).toBe(2.5);
    expect(sheet.getCell("I17").value).toBe(2.5);
    expect(sheet.getCell("G35").value).toBe(12);
  });
});
