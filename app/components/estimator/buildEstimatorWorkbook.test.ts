import { describe, expect, it } from "vitest";

import { buildEstimatorWorkbook } from "./buildEstimatorWorkbook";

const darkHeader = { bl: 1, cl: { rgb: "#ffffff" }, bg: { rgb: "#1f2937" } };
const yellowInput = { bl: 1, bg: { rgb: "#ffff00" }, n: { pattern: "0.0%" } };

describe("buildEstimatorWorkbook", () => {
  it("keeps estimator master workbook inputs editable in the online grid", () => {
    const workbook = buildEstimatorWorkbook({
      sheetOrder: ["project", "led"],
      sheets: {
        project: {
          name: "Project Overview",
          cellData: {
            15: { 1: { v: "FINANCIAL PARAMETERS", s: darkHeader }, 2: { v: "", s: darkHeader } },
            20: { 1: { v: "Sponsorship Margin" }, 2: { v: 0, s: yellowInput } },
          },
        },
        led: {
          name: "LED Cost Sheet",
          cellData: {
            1: {
              16: { v: "Sponsorship →", s: { bl: 1 } },
              17: { v: 0, s: yellowInput },
              21: { v: "LED Margin Override →", s: { bl: 1 } },
              22: { v: 0.15, s: yellowInput },
            },
            2: {
              0: { v: "Display", s: darkHeader },
              7: { v: "H (ft)", s: darkHeader },
              8: { v: "W (ft)", s: darkHeader },
              11: { v: "Qty", s: darkHeader },
              17: { v: "Sponsorship", s: darkHeader },
              22: { v: "Selling Price", s: darkHeader },
            },
            3: {
              0: { v: "Exterior Wall" },
              7: { v: 40 },
              8: { v: 100 },
              11: { v: 1 },
              17: { v: 0 },
              22: { v: 807388 },
            },
          },
        },
      },
    });

    const project = workbook.sheets.find((sheet) => sheet.name === "Project Overview");
    const led = workbook.sheets.find((sheet) => sheet.name === "LED Cost Sheet");

    expect(project?.editableCells?.has("20:2")).toBe(true);
    expect(project?.editableColumns).toBeUndefined();

    expect(led?.editableCells?.has("1:17")).toBe(true);
    expect(led?.editableCells?.has("1:22")).toBe(true);
    expect(led?.editableColumns).toEqual([0, 7, 8, 11]);
    expect(led?.editableColumns).not.toContain(17);
    expect(led?.editableColumns).not.toContain(22);
  });
});
