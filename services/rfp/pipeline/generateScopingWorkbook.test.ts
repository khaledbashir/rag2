import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { generateScopingWorkbook } from "./generateScopingWorkbook";

describe("generateScopingWorkbook", () => {
  it("wires product-dependent LED Cost Sheet fields as live formulas", async () => {
    const { buffer } = await generateScopingWorkbook({
      project: {
        clientName: "Test Client",
        projectName: "Dropdown Regression",
        venue: null,
        location: null,
        isOutdoor: true,
        isUnionLabor: false,
        bondRequired: false,
        specialRequirements: [],
        schedulePhases: [],
      },
      specs: [
        {
          name: "Ribbon",
          location: "wall",
          widthFt: 33,
          heightFt: 3,
          widthPx: null,
          heightPx: null,
          pixelPitchMm: 2.5,
          brightnessNits: 3000,
          environment: "outdoor",
          quantity: 1,
          serviceType: "front",
          mountingType: "Wall Mounted",
          maxPowerW: null,
          weightLbs: null,
          specialRequirements: [],
          confidence: 1,
          sourcePages: [],
          sourceType: "text",
          citation: "test",
          notes: null,
          selectedProductName: "Yaham Radiance R2.5-MIP Outdoor (2.5mm, 3000 nits)",
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
    const sheet = workbook.getWorksheet("LED Cost Sheet");
    expect(sheet).toBeTruthy();

    const cellFormula = (col: number) => {
      const value = sheet!.getCell(4, col).value as { formula?: string } | null;
      return value?.formula ?? "";
    };

    expect(cellFormula(8)).toContain("VLOOKUP(F4");
    expect(cellFormula(9)).toContain("VLOOKUP(F4");
    expect(cellFormula(10)).toBe("IFERROR(ROUND(H4*304.8/G4,0),0)");
    expect(cellFormula(11)).toBe("IFERROR(ROUND(I4*304.8/G4,0),0)");
    expect(cellFormula(14)).toBe("IFERROR(VLOOKUP(F4,'_Products'!$A$1:$K$23,5,FALSE),0)");
    expect(cellFormula(16)).toBe("IFERROR(VLOOKUP(F4,'_Products'!$A$1:$K$23,4,FALSE),0)");
    expect(cellFormula(17)).toBe("P4*M4");
    expect(cellFormula(20)).toBe("Q4+R4+S4");
  });
});
