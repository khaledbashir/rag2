import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { generateScopingWorkbook, getLoadedCostPerSqFtForProduct } from "./generateScopingWorkbook";

describe("generateScopingWorkbook", () => {
  it("uses product-specific rate-card cost per square foot before generic pitch fallback", () => {
    expect(getLoadedCostPerSqFtForProduct({
      id: "lgeus-ho10t-fm",
      pitchMm: 10,
      costPerSqFt: 161.38,
    })).toBe(161.38);
  });

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
    // Sponsorship column (R) = Display Cost × $R$2 (added 2026-07-06, Natalia/Jireh).
    expect(cellFormula(18)).toBe("Q4*$R$2");
    // Processor→S, Shipping→T after the insert; Total Cost (U) = Display + Sponsorship + Processor + Shipping.
    expect(cellFormula(20)).toBe("MAX(M4*10,500)");
    expect(cellFormula(21)).toBe("Q4+R4+S4+T4");
    // Margin % (V) references the master override at W2; Selling Price (W) = Total Cost / (1 - Margin%).
    expect(cellFormula(22)).toBe("W$2");
    expect(cellFormula(23)).toBe("IFERROR(U4/(1-V4),0)");
    // ANC Margin (X) = Selling − Total Cost.
    expect(cellFormula(24)).toBe("W4-U4");
  });

  it("uses the grand total cost row for Margin Analysis margin dollars", async () => {
    const { buffer } = await generateScopingWorkbook({
      project: {
        clientName: "Test Client",
        projectName: "Margin Formula Regression",
        venue: null,
        location: null,
        isOutdoor: true,
        isUnionLabor: false,
        bondRequired: true,
        specialRequirements: [],
        schedulePhases: [],
      },
      specs: [
        {
          name: "Main Scoreboard",
          location: "scoreboard",
          widthFt: 33,
          heightFt: 18,
          widthPx: null,
          heightPx: null,
          pixelPitchMm: 10,
          brightnessNits: 6000,
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
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
    const sheet = workbook.getWorksheet("Margin Analysis");
    expect(sheet).toBeTruthy();

    const grandTotalRow = sheet!.actualRowCount >= 1
      ? Array.from({ length: sheet!.actualRowCount }, (_, index) => index + 1)
          .find(row => String(sheet!.getCell(row, 2).value ?? "").trim() === "GRAND TOTAL")
      : undefined;

    expect(grandTotalRow).toBeTruthy();
    const value = sheet!.getCell(grandTotalRow!, 5).value as { formula?: string; result?: number } | null;
    expect(value?.formula).toBe(`IFERROR(D${grandTotalRow}-C${grandTotalRow},0)`);
  });

  it("formula-links every margin cell back to Project Overview master (Natalia Apr 2026)", async () => {
    const { buffer } = await generateScopingWorkbook({
      project: {
        clientName: "Test Client",
        projectName: "Master Margin Rewire",
        venue: null,
        location: null,
        isOutdoor: false,
        isUnionLabor: false,
        bondRequired: false,
        specialRequirements: [],
        schedulePhases: [],
      },
      specs: [
        {
          name: "Display A",
          location: "north",
          widthFt: 20,
          heightFt: 10,
          widthPx: null,
          heightPx: null,
          pixelPitchMm: 3.9,
          brightnessNits: 800,
          environment: "indoor",
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
        },
        {
          name: "Display B",
          location: "south",
          widthFt: 16,
          heightFt: 9,
          widthPx: null,
          heightPx: null,
          pixelPitchMm: 3.9,
          brightnessNits: 800,
          environment: "indoor",
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
        },
      ],
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));

    // 1. Project Overview C16-C20 are plain numeric inputs (editable master cells)
    const po = wb.getWorksheet("Project Overview")!;
    for (let r = 16; r <= 20; r++) {
      const cell = po.getCell(r, 3);
      expect(typeof cell.value).toBe("number");
      expect(cell.value).toBeGreaterThan(0);
      expect(cell.value).toBeLessThan(1);
    }

    // 2. LED Cost Sheet W2 (LED Margin Override, moved from V2 after the Sponsorship insert) formula-links to Project Overview C16
    const led = wb.getWorksheet("LED Cost Sheet")!;
    const w2 = led.getCell(2, 23).value as { formula?: string };
    expect(w2.formula).toBe("'Project Overview'!$C$16");
    // Sponsorship % input lives at R2 (orange), default 0.
    expect(led.getCell(2, 18).value).toBe(0);

    // 3. Every install sheet's Linked Margin Assignment formula-links to Project Overview
    let installSheetsChecked = 0;
    wb.eachSheet((sheet) => {
      if (!sheet.name.includes(" - Install")) return;
      installSheetsChecked++;
      const expectedFormulas: Record<string, string> = {
        "Install Margin": "'Project Overview'!$C$17",
        "Electrical Margin": "'Project Overview'!$C$17",
        "ANC Margin": "'Project Overview'!$C$17",
        "Engineering and Permits": "'Project Overview'!$C$18",
      };
      for (let r = 1; r <= sheet.actualRowCount; r++) {
        const label = String(sheet.getCell(r, 3).value ?? "").trim();
        const expected = expectedFormulas[label];
        if (!expected) continue;
        const cell = sheet.getCell(r, 4).value as { formula?: string };
        expect(cell.formula).toBe(expected);
      }
    });
    expect(installSheetsChecked).toBeGreaterThanOrEqual(2); // 2 displays = 2 install sheets

    // 4. Margin Analysis per-display LED Hardware row formula-links to PO C16
    const ma = wb.getWorksheet("Margin Analysis")!;
    let ledRowsChecked = 0;
    for (let r = 1; r <= ma.actualRowCount; r++) {
      const label = String(ma.getCell(r, 2).value ?? "").trim();
      if (label === "LED Hardware") {
        const cell = ma.getCell(r, 6).value as { formula?: string };
        expect(cell.formula).toBe("'Project Overview'!$C$16");
        ledRowsChecked++;
      }
    }
    expect(ledRowsChecked).toBeGreaterThanOrEqual(2);

    // 5. Budget Summary aggregate categories formula-link
    const bs = wb.getWorksheet("Budget Summary")!;
    const expectedBSFormulas: Record<string, string> = {
      "LED Hardware (all displays)": "'Project Overview'!$C$16",
      "Structural Materials": "'Project Overview'!$C$17",
      "Engineering & Permits": "'Project Overview'!$C$18",
    };
    let bsRowsChecked = 0;
    for (let r = 1; r <= bs.actualRowCount; r++) {
      const label = String(bs.getCell(r, 2).value ?? "").trim();
      const expected = expectedBSFormulas[label];
      if (!expected) continue;
      const cell = bs.getCell(r, 6).value as { formula?: string };
      expect(cell.formula).toBe(expected);
      bsRowsChecked++;
    }
    expect(bsRowsChecked).toBe(3);
  });
});
