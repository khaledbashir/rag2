import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseAjpPricingWorkbook } from "./ajpPricingWorkbookParser";

function buildModernAjpWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  const led = workbook.addWorksheet("LED Cost Sheet");
  led.getCell("A4").value = "DISPLAY ONE — BASE BID AT 10MM";
  led.getCell("Q4").value = 90;
  led.getCell("S4").value = 9;
  led.getCell("T4").value = 1;
  led.getCell("U4").value = 100;
  led.getCell("W4").value = 125;
  led.getCell("A5").value = "ALT 1A DISPLAY TWO — INCREASE RESOLUTION TO 8MM";
  led.getCell("Q5").value = 160;
  led.getCell("S5").value = 32;
  led.getCell("T5").value = 8;
  led.getCell("U5").value = 200;
  led.getCell("W5").value = 250;

  const form = workbook.addWorksheet("Form");
  form.getCell("B4").value = "DISPLAY ONE 10MM";
  form.getCell("C4").value = "ALT 1A DISPLAY TWO 8MM";
  form.getCell("B9").value = "Nitxeon";
  form.getCell("B10").value = "R10 (RS2727)";
  form.getCell("B36").value = 3600;
  form.getCell("B59").value = 7500;

  const install = workbook.addWorksheet("DISPLAY ONE");
  install.getCell("B15").value = "DISPLAY ONE — BASE BID AT 10MM";
  install.getCell("B19").value = "Structural Materials";
  install.getCell("B20").value = "NAMING SIGNAGE";
  install.getCell("K20").value = 10;
  install.getCell("B22").value = "FABRICATE SECONDARY STEEL SUBSTRUCTURE";
  install.getCell("K22").value = 20;
  install.getCell("B23").value = "FABRICATE CLADDING AND TRIM";
  install.getCell("K23").value = 30;
  install.getCell("B24").value = "SHIPPING";
  install.getCell("K24").value = 40;
  install.getCell("B28").value = "Structural Labor and LED Installation";
  install.getCell("B31").value = "INSTALL LED DISPLAYS";
  install.getCell("K31").value = 50;
  install.getCell("B33").value = "HEAVY EQUIPMENT";
  install.getCell("K33").value = 60;
  install.getCell("K44").value = 70;
  install.getCell("K52").value = 80;

  const margin = workbook.addWorksheet("Margin Analysis");
  margin.getCell("B13").value = "TAX";
  margin.getCell("D13").value = 12.5;

  const additional = workbook.addWorksheet("Additional Items");
  additional.getCell("C5").value = "PROJECT MANAGEMENT";
  additional.getCell("H5").value = 100;
  additional.getCell("C6").value = "TRAVEL AND EXPENSES";
  additional.getCell("H6").value = 40;
  additional.getCell("C7").value = "GENERAL CONDITIONS";
  additional.getCell("H7").value = 20;
  additional.getCell("C8").value = "EVENT SUPPORT";
  additional.getCell("H8").value = 30;

  const warranty = workbook.addWorksheet("Extended Warranty (ANC)");
  for (let row = 3; row <= 10; row++) {
    warranty.getRow(row).getCell(5).value = row * 10;
    warranty.getRow(row).getCell(8).value = row * 20;
  }

  return workbook;
}

describe("parseAjpPricingWorkbook", () => {
  it("keeps modern one-row display pricing aligned and parses AJP detail sheets", () => {
    const pricing = parseAjpPricingWorkbook(buildModernAjpWorkbook());

    expect(pricing).toHaveLength(2);
    expect(pricing[0].bidFormDisplaySellingPrice).toBe(112.5);
    expect(pricing[0].bidFormProcessingSellingPrice).toBe(11.25);
    expect(pricing[0].bidFormShippingSellingPrice).toBe(1.25);
    expect(pricing[1].bidFormDisplaySellingPrice).toBe(200);

    expect(pricing[0].bidFormInstallation).toEqual({
      structuralSteel: 20,
      heavyEquipment: 60,
      componentInstallation: 90,
      namingSignage: 10,
      claddingTrim: 30,
      electricalData: 70,
      total: 280,
    });
    expect(pricing[0].bidFormBrightnessNits).toBe(7500);
    expect(pricing[0].bidFormMaxPowerW).toBe(3600);
    expect(pricing[0].bidFormChipManufacturer).toBe("Nationstar");
    expect(pricing[0].bidFormChipModel).toBe("RS2727");
    expect(pricing[0].bidFormProjectSummary).toEqual({
      taxAmount: 12.5,
      projectManagement: 100,
      generalConditions: 20,
      engineeringPermitsFees: 80,
      trainingEventSupport: 30,
      travelExpenses: 40,
      warrantyPartsAndLabor: [60, 80, 100, 120, 140, 160, 180, 200],
      warrantyPartsOnly: [30, 40, 50, 60, 70, 80, 90, 100],
    });
  });
});
