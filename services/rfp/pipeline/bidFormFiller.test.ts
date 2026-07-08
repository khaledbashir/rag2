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
  it("matches a one-block AJP bid form to a one-screen priced/spec extraction", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("BidForm");

    sheet.getCell("A5").value = "LED DISPLAYS AND INSTALLATION";
    sheet.getCell("A6").value = "LED TUNNEL DISPLAY";
    sheet.getCell("A7").value = "PIXEL PITCH";
    sheet.getCell("B7").value = "1.5mm";
    sheet.getCell("C7").value = " ";
    sheet.getCell("A8").value = "QUANTITY";
    sheet.getCell("B8").value = 1;
    sheet.getCell("A9").value = "PIXEL HEIGHT";
    sheet.getCell("B9").value = 812;
    sheet.getCell("A10").value = "PIXEL LENGTH";
    sheet.getCell("B10").value = 8003;
    sheet.getCell("A11").value = "SYSTEM HEIGHT";
    sheet.getCell("B11").value = 4;
    sheet.getCell("A12").value = "SYSTEM LENGTH";
    sheet.getCell("B12").value = 39.4;

    const bidFormBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const screen: ExtractedLEDSpec = {
      name: "SEZ - LED Tunnel Display - 4' H x 39.4' W - 1.5mm (Yaham - MIP)",
      location: "South End Zone",
      widthFt: 39.4,
      heightFt: 4,
      widthPx: 8003,
      heightPx: 812,
      pixelPitchMm: 1.5,
      brightnessNits: null,
      environment: "indoor",
      quantity: 1,
      serviceType: null,
      mountingType: null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: [],
      confidence: 0.9,
      sourcePages: [],
      sourceType: "table",
      citation: "Rose Bowl priced/spec workbook",
      notes: null,
    };

    const result = await fillBidForm(bidFormBuffer, [screen]);

    expect(result.matches).toHaveLength(1);
    expect(result.unmatchedBlocks).toEqual([]);
    expect(result.unmatchedScreens).toEqual([]);
    expect(result.matches[0]).toMatchObject({
      sheetName: "BidForm",
      displayName: "LED TUNNEL DISPLAY",
      matchedScreen: screen.name,
      confidence: 1,
    });

    const filledWorkbook = new ExcelJS.Workbook();
    await filledWorkbook.xlsx.load(result.buffer);
    const filledSheet = filledWorkbook.getWorksheet("BidForm")!;
    expect(filledSheet.getCell("C7").value).toBe(1.5);
    expect(filledSheet.getCell("C8").value).toBe(1);
    expect(filledSheet.getCell("C9").value).toBe(812);
    expect(filledSheet.getCell("C10").value).toBe(8003);
  });

  it("preserves formula cells while filling an AJP bid form block", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("BidForm");

    sheet.getCell("C6").value = "VENDOR NAME";
    sheet.getCell("A56").value = "LED DISPLAYS AND INSTALLATION";
    sheet.getCell("A57").value = "LED TUNNEL DISPLAY";
    sheet.getCell("C57").value = { formula: "C$6", result: "VENDOR NAME" };
    sheet.getCell("A58").value = "PIXEL PITCH";
    sheet.getCell("B58").value = "1.5625mm";
    sheet.getCell("C58").value = " ";
    sheet.getCell("A59").value = "QUANTITY";
    sheet.getCell("B59").value = 1;
    sheet.getCell("A60").value = "PIXEL HEIGHT";
    sheet.getCell("B60").value = 780;
    sheet.getCell("A61").value = "PIXEL LENGTH";
    sheet.getCell("B61").value = 7680;
    sheet.getCell("A62").value = "TOTAL PIXELS";
    sheet.getCell("B62").value = { formula: "B61*B60", result: 5990400 };
    sheet.getCell("C62").value = { formula: "C61*C60", result: 0 };
    sheet.getCell("A63").value = "SYSTEM HEIGHT";
    sheet.getCell("B63").value = { formula: "B60*B58/25.4/12", result: 4 };
    sheet.getCell("C63").value = { formula: "C60*C58/25.4/12", result: 0 };
    sheet.getCell("A64").value = "SYSTEM LENGTH";
    sheet.getCell("B64").value = 39.4;

    const bidFormBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const screen: ExtractedLEDSpec = {
      name: "LED Tunnel Display",
      location: "Rose Bowl",
      widthFt: 39.4,
      heightFt: 4,
      widthPx: 7686,
      heightPx: 780,
      pixelPitchMm: 1.5625,
      brightnessNits: null,
      environment: "outdoor",
      quantity: 1,
      serviceType: null,
      mountingType: null,
      maxPowerW: null,
      weightLbs: null,
      specialRequirements: [],
      confidence: 0.9,
      sourcePages: [],
      sourceType: "table",
      citation: "Rose Bowl priced/spec workbook",
      notes: null,
    };

    const result = await fillBidForm(bidFormBuffer, [screen]);

    expect(result.matches).toHaveLength(1);

    const filledWorkbook = new ExcelJS.Workbook();
    await filledWorkbook.xlsx.load(result.buffer);
    const filledSheet = filledWorkbook.getWorksheet("BidForm")!;

    expect(filledSheet.getCell("C57").value).toMatchObject({ formula: "C$6" });
    expect(filledSheet.getCell("C58").value).toBe(1.5625);
    expect(filledSheet.getCell("C61").value).toBe(7686);
    expect(filledSheet.getCell("C62").value).toMatchObject({ formula: "C61*C60" });
    expect(filledSheet.getCell("C63").value).toMatchObject({ formula: "C60*C58/25.4/12" });
  });

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
