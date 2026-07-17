import { describe, expect, it } from "vitest";

import { calculateServiceEstimate, PANTHERS_SERVICE_REFERENCE } from "./engine";

describe("calculateServiceEstimate", () => {
  it("reproduces Natalia's Panthers workbook economics exactly", () => {
    const result = calculateServiceEstimate(PANTHERS_SERVICE_REFERENCE);
    const firstYear = result.years[0];

    expect(firstYear.eventLines.map((line) => line.revenue)).toEqual([45050, 26350, 28050]);
    expect(firstYear.breakFixCost).toBe(58240);
    expect(firstYear.breakFixRevenue).toBe(94348.8);
    expect(firstYear.totalIncome).toBe(193798.8);
    expect(firstYear.operatingExpenses).toBe(91000);
    expect(firstYear.ebitda).toBe(102798.8);
    expect(firstYear.returnPct).toBeCloseTo(0.5304408489, 8);
    expect(result.yearLabels).toEqual(["26/27", "27/28"]);
  });

  it("only subtracts a bundle discount when the user selects apply-to-subtotal", () => {
    const result = calculateServiceEstimate({
      ...PANTHERS_SERVICE_REFERENCE,
      bundleDiscountMode: "apply-to-subtotal",
      bundleDiscountPct: 20,
    });

    expect(result.years[0].bundleDiscountAmount).toBe(38759.76);
    expect(result.years[0].totalIncome).toBe(155039.04);
  });

  it("keeps revenue and technician-cost escalation independently configurable", () => {
    const result = calculateServiceEstimate({
      ...PANTHERS_SERVICE_REFERENCE,
      termYears: 3,
      revenueEscalationPct: 5,
      costEscalationPct: 2,
    });

    expect(result.years[1].grossServiceIncome).toBe(203488.74);
    expect(result.years[1].operatingExpenses).toBe(92820);
    expect(result.years[2].grossServiceIncome).toBe(213663.19);
    expect(result.years[2].operatingExpenses).toBe(94676.41);
  });
});
