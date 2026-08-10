import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseServiceSheet } from "@/services/pricing/serviceSheetParser";
import { PANTHERS_SERVICE_REFERENCE } from "./engine";
import { addOption, patchOption, renameOption, resolveSelectedOption } from "./options";
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

describe("workbook — typed lines, Included, and the operating-expenses divider", () => {
  const flat = (id: string, name: string, rev: (number | "included")[], cost: (number | "included")[] = []) => ({
    id, name, pricingMode: "flat" as const,
    days: 0, technicians: 0, clientDayRate: 0, technicianDayCost: 0,
    flatRevenue: rev, flatCost: cost, flatEscalates: false,
  });

  const input = {
    ...PANTHERS_SERVICE_REFERENCE,
    clientName: "Fifth Third Park",
    termYears: 3,
    termStartYear: 2026,
    bundleDiscountMode: "none" as const,
    events: [
      flat("preseason", "Preseason Check", ["included", 7500, 7875], [3000, 3150, 3307.5]),
      flat("vsb", "VSB License Fee", [13500, 13500, 13500]),
    ],
    breakFix: { ...PANTHERS_SERVICE_REFERENCE.breakFix, enabled: false },
    sectionLabels: { ...PANTHERS_SERVICE_REFERENCE.sectionLabels, operatingExpenses: "Operating Expenses" },
  };

  it("writes typed values as literal editable cells, never formulas", async () => {
    const wb = buildServiceEstimatorWorkbook(input as never);
    const sheet = wb.getWorksheet("Calculation Detail")!;
    const cells: unknown[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.value)));
    // The typed 13,500 appears as a plain number, not { formula }.
    const plain = cells.filter((v) => v === 13500);
    expect(plain.length).toBeGreaterThanOrEqual(3);
  });

  it("writes 'Included' as text so SUM bills the client nothing for that year", async () => {
    const wb = buildServiceEstimatorWorkbook(input as never);
    const sheet = wb.getWorksheet("Calculation Detail")!;
    let found = false;
    sheet.eachRow((row) => row.eachCell((cell) => { if (cell.value === "Included") found = true; }));
    expect(found).toBe(true);
  });

  it("carries Krissy's operating-expenses heading into the sheet", async () => {
    const wb = buildServiceEstimatorWorkbook(input as never);
    const sheet = wb.getWorksheet("Calculation Detail")!;
    const headings: string[] = [];
    sheet.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string") headings.push(v);
    });
    expect(headings).toContain("OPERATING EXPENSES");
  });

  it("renames a section heading when the author edits it", async () => {
    const renamed = { ...input, sectionLabels: { ...input.sectionLabels, operatingExpenses: "ANC Internal Costs" } };
    const wb = buildServiceEstimatorWorkbook(renamed as never);
    const sheet = wb.getWorksheet("Calculation Detail")!;
    const headings: string[] = [];
    sheet.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string") headings.push(v);
    });
    expect(headings).toContain("ANC INTERNAL COSTS");
    expect(headings).not.toContain("OPERATING EXPENSES");
  });
});

describe("workbook — options inside one file", () => {
  /**
   * Natalia, 2026-08-11: "we have now 3 cost sheet going for one thing … also
   * has to be options — option 1,2,3 … all within one project aka excel."
   */
  const withOptions = () => {
    const { input: two, addedId } = addOption(PANTHERS_SERVICE_REFERENCE);
    const named = renameOption(two, addedId, "Option 2 — With Event Support");
    return patchOption(named, addedId, {
      events: [
        ...resolveSelectedOption(named, addedId).events,
        {
          id: "add-on",
          name: "Optional Add-On — Extra Event Days",
          pricingMode: "calculated" as const,
          days: 12,
          technicians: 3,
          clientDayRate: 1200,
          technicianDayCost: 400,
          flatRevenue: [],
          flatCost: [],
          flatEscalates: false,
        },
      ],
    });
  };

  it("leaves a single-option estimate on exactly the sheets it always had", async () => {
    const workbook = buildServiceEstimatorWorkbook(PANTHERS_SERVICE_REFERENCE);
    const parsed = XLSX.read(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.SheetNames).toEqual([
      "Project Overview",
      "Service Fee Schedule",
      "Calculation Detail",
    ]);
  });

  it("gives every option its own client tab and its own calculation tab", async () => {
    const workbook = buildServiceEstimatorWorkbook(withOptions());
    const parsed = XLSX.read(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(parsed.SheetNames).toEqual([
      "Project Overview",
      "Option 1",
      "Option 2 — With Event Support",
      "Option 1 Detail",
      "Option 2 — With Event Su Detail",
      "Options Summary",
    ]);
  });

  it("prices the added service into the second option only", async () => {
    const input = withOptions();
    const workbook = buildServiceEstimatorWorkbook(input);
    const parsed = XLSX.read(Buffer.from(await workbook.xlsx.writeBuffer()));

    const optionOne = parseServiceSheet(parsed, "options.xlsx", "Option 1");
    const optionTwo = parseServiceSheet(parsed, "options.xlsx", "Option 2 — With Event Support");

    const labels = (doc: typeof optionOne) =>
      doc.document.rows.filter((row) => row.kind === "line").map((row) => row.label);

    expect(labels(optionOne)).not.toContain("Optional Add-On — Extra Event Days");
    expect(labels(optionTwo)).toContain("Optional Add-On — Extra Event Days");

    const total = (doc: typeof optionOne) =>
      (doc.document.totalRow?.cells[0].raw as number) ?? 0;
    expect(total(optionTwo)).toBeGreaterThan(total(optionOne));
  });

  it("summarises the options against each other with live links", async () => {
    const workbook = buildServiceEstimatorWorkbook(withOptions());
    const parsed = XLSX.read(Buffer.from(await workbook.xlsx.writeBuffer()), { cellFormula: true });
    const summary = parsed.Sheets["Options Summary"];

    expect(summary.A5.v).toBe("Option 1");
    expect(summary.A6.v).toBe("Option 2 — With Event Support");
    expect(summary.B5.f).toContain("Option 1 Detail");
    expect(summary.B6.f).toContain("Option 2 — With Event Su Detail");
  });

  it("keeps the Project Overview reporting the first option", async () => {
    const workbook = buildServiceEstimatorWorkbook(withOptions());
    const parsed = XLSX.read(Buffer.from(await workbook.xlsx.writeBuffer()), { cellFormula: true });

    expect(parsed.Sheets["Project Overview"].C27.f).toContain("Option 1 Detail");
  });

  it("keeps a tab name Excel will accept when an author types a long one", async () => {
    const { input: two, addedId } = addOption(PANTHERS_SERVICE_REFERENCE);
    const awkward = renameOption(two, addedId, "Option 2: full coverage / all events [best]");
    const workbook = buildServiceEstimatorWorkbook(awkward);
    const parsed = XLSX.read(Buffer.from(await workbook.xlsx.writeBuffer()));

    for (const name of parsed.SheetNames) {
      expect(name.length).toBeLessThanOrEqual(31);
      expect(name).not.toMatch(/[:\\/?*[\]]/);
    }
    expect(parsed.SheetNames).toContain("Option 2 full coverage all even");
  });
});
