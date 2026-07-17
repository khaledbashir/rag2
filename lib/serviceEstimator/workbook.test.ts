import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseServiceSheet } from "@/services/pricing/serviceSheetParser";
import { PANTHERS_SERVICE_REFERENCE } from "./engine";
import { buildServiceEstimatorWorkbook, serviceEstimatorFileName } from "./workbook";

describe("buildServiceEstimatorWorkbook", () => {
  it("creates a three-sheet formula model that round-trips through Service Mirror Mode", async () => {
    const workbook = buildServiceEstimatorWorkbook(PANTHERS_SERVICE_REFERENCE);
    const buffer = await workbook.xlsx.writeBuffer();
    const parsedWorkbook = XLSX.read(Buffer.from(buffer));

    expect(parsedWorkbook.SheetNames).toEqual([
      "Project Overview",
      "Service Fee Schedule",
      "Calculation Detail",
    ]);

    const parsed = parseServiceSheet(
      parsedWorkbook,
      serviceEstimatorFileName(PANTHERS_SERVICE_REFERENCE),
    );
    expect(parsed.document.sourceSheet).toBe("Service Fee Schedule");
    expect(parsed.document.clientName).toBe("Carolina Panthers");
    expect(parsed.document.yearLabels).toEqual(["26/27", "27/28"]);
    expect(parsed.document.rows.filter((row) => row.kind === "line").map((row) => row.label)).toEqual([
      "Pre Event Hardware Support",
      "MLS Event Hardware Support",
      "Panthers Event Hardware Support",
      "Break/Fix Hardware Maintenance",
    ]);
    expect(parsed.document.totalRow?.cells.map((cell) => cell.raw)).toEqual([193798.8, 193798.8]);
    expect(parsed.document.rows.find((row) => row.kind === "note")?.label).toContain("20% Bundle Discount");
  });

  it("writes live formulas instead of hardcoded derived totals", async () => {
    const workbook = buildServiceEstimatorWorkbook(PANTHERS_SERVICE_REFERENCE);
    const buffer = await workbook.xlsx.writeBuffer();
    const parsedWorkbook = XLSX.read(Buffer.from(buffer), { cellFormula: true });
    const calculationSheet = parsedWorkbook.Sheets["Calculation Detail"];
    const feeSheet = parsedWorkbook.Sheets["Service Fee Schedule"];
    const overviewSheet = parsedWorkbook.Sheets["Project Overview"];

    const calculationFormulaCount = Object.values(calculationSheet).filter(
      (cell: any) => cell && typeof cell === "object" && typeof cell.f === "string",
    ).length;
    const feeFormulaCount = Object.values(feeSheet).filter(
      (cell: any) => cell && typeof cell === "object" && typeof cell.f === "string",
    ).length;

    expect(calculationFormulaCount).toBeGreaterThan(30);
    expect(feeFormulaCount).toBeGreaterThan(10);
    expect(overviewSheet.C27.f).toContain("Calculation Detail");
    expect(overviewSheet.C28.f).toContain("Calculation Detail");
    expect(overviewSheet.C29.f).toContain("Calculation Detail");
    expect(overviewSheet.C30.f).toContain("Calculation Detail");
  });

  it("omits disabled break/fix coverage from the client-facing schedule", async () => {
    const workbook = buildServiceEstimatorWorkbook({
      ...PANTHERS_SERVICE_REFERENCE,
      breakFix: { ...PANTHERS_SERVICE_REFERENCE.breakFix, enabled: false },
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const parsedWorkbook = XLSX.read(Buffer.from(buffer));
    const parsed = parseServiceSheet(parsedWorkbook, "Panthers_without_break_fix.xlsx");

    expect(parsed.document.rows.map((row) => row.label)).not.toContain(
      "Break/Fix Hardware Maintenance",
    );
  });
});
