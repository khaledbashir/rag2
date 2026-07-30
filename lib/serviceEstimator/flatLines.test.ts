import { describe, expect, it } from "vitest";

import {
  calculateServiceEstimate,
  calculateServiceEstimateOptions,
  listOptions,
  resolveFlatAmount,
  PANTHERS_SERVICE_REFERENCE,
} from "./engine";
import { ServiceEstimatorInputSchema } from "./schema";
import type { ServiceEstimatorInput, ServiceEventInput } from "./types";

/**
 * Alexis Ventarola's real Fifth Third Park 2026-2028 workbook, rebuilt through
 * the estimator (2026-07-30 call). Every one of these lines is hand-typed in
 * her Excel today — "there's like really no formulas used. It's a lot of manual
 * entry" — which is exactly what the flat pricing mode has to reproduce.
 */
const flat = (
  id: string,
  name: string,
  flatRevenue: (number | "included")[],
  flatCost: (number | "included")[] = [],
): ServiceEventInput => ({
  id,
  name,
  pricingMode: "flat",
  days: 0,
  technicians: 0,
  clientDayRate: 0,
  technicianDayCost: 0,
  flatRevenue,
  flatCost,
  flatEscalates: false,
});

const OFF_BREAK_FIX = {
  enabled: false,
  label: "Break/Fix Hardware Maintenance",
  pricingMode: "flat" as const,
  days: 0,
  technicians: 0,
  hoursPerDay: 0,
  technicianHourlyCost: 0,
  priceMultiplier: 1,
  flatRevenue: [],
  flatCost: [],
  flatEscalates: false,
};

const OPTION_1_LINES = [
  flat("preseason", "Preseason Check", ["included", 7500, 7875], [3000, 3150, 3307.5]),
  flat("graphics", "Graphics (up to 100 hours)", [30000, 31500, 33075], [12500, 13125, 13781.25]),
  flat("vsb", "VSB License Fee", [13500, 13500, 13500]),
  flat("tech-support", "Tech Support", ["included", 10000, 10000]),
  flat("livesync", "LiveSync License", [10000, 10000, 10000]),
  flat("parts", "Parts Waranty", ["included", 9688, 15858], ["included", 7750, 12154]),
  flat("travel", "Travel", [0, 0, 0], [1000, 1000, 1000]),
  flat("misc", "Miscellaneous Exp.( postage,tech exp)", [0, 0, 0], [1000, 1050, 1102.5]),
];

const OPTION_2_LINES = [
  flat("vsb", "VSB License Fee", [13500, 13500, 13500]),
  flat("tech-support", "Tech Support", ["included", 13500, 13500]),
  flat("livesync", "LiveSync License", [10000, 10000, 10000]),
  flat("parts", "Parts Waranty", ["included", 9688, 15855], ["included", 7750, 12154]),
  flat("travel", "Travel", [0, 0, 0], [1000, 1000, 1000]),
  flat("misc", "Miscellaneous Exp.( postage,tech exp)", [0, 0, 0], [1000, 1050, 1102.5]),
];

const FIFTH_THIRD: ServiceEstimatorInput = {
  ...PANTHERS_SERVICE_REFERENCE,
  clientName: "Fifth Third Park",
  venueName: "Fifth Third Park",
  termStartYear: 2026,
  termYears: 3,
  revenueEscalationPct: 0,
  costEscalationPct: 0,
  bundleDiscountMode: "none",
  bundleDiscountPct: 0,
  events: OPTION_1_LINES,
  breakFix: OFF_BREAK_FIX,
  options: [
    { id: "option-1", name: "Option 1", events: OPTION_1_LINES, breakFix: OFF_BREAK_FIX },
    { id: "option-2", name: "Option 2", events: OPTION_2_LINES, breakFix: OFF_BREAK_FIX },
  ],
  marketingOpportunityValue: 0,
  marketingSharePct: 0,
};

describe("flat 'type my number' pricing — Fifth Third Park", () => {
  const result = calculateServiceEstimate(FIFTH_THIRD);

  it("reproduces Alexis's Option 1 TOTAL INCOME exactly, all three years", () => {
    expect(result.years.map((y) => y.totalIncome)).toEqual([53500, 82188, 90308]);
  });

  it("reproduces her OPERATING EXPENSES row exactly", () => {
    expect(result.years.map((y) => y.operatingExpenses)).toEqual([17500, 26075, 31345.25]);
  });

  it("bills nothing for an 'Included' year but keeps ANC's cost for it", () => {
    const preseasonY1 = result.years[0].eventLines.find((l) => l.id === "preseason")!;
    expect(preseasonY1.included).toBe(true);
    expect(preseasonY1.revenue).toBe(0);
    expect(preseasonY1.cost).toBe(3000);

    const preseasonY2 = result.years[1].eventLines.find((l) => l.id === "preseason")!;
    expect(preseasonY2.included).toBe(false);
    expect(preseasonY2.revenue).toBe(7500);
  });

  it("never escalates a typed number — VSB stays 13,500 across the term", () => {
    const escalating = { ...FIFTH_THIRD, revenueEscalationPct: 5 };
    const vsb = calculateServiceEstimate(escalating).years.map(
      (y) => y.eventLines.find((l) => l.id === "vsb")!.revenue,
    );
    expect(vsb).toEqual([13500, 13500, 13500]);
  });
});

describe("priced options inside one estimate", () => {
  it("prices Option 1 and Option 2 from the same cover-page facts", () => {
    const options = calculateServiceEstimateOptions(FIFTH_THIRD);
    expect(options.map((o) => o.name)).toEqual(["Option 1", "Option 2"]);
    expect(options[0].result.years.map((y) => y.totalIncome)).toEqual([53500, 82188, 90308]);
    // Option 2 drops the preseason check and graphics, and prices tech support higher.
    expect(options[1].result.years.map((y) => y.totalIncome)).toEqual([23500, 46688, 52855]);
  });

  it("treats an estimate with no explicit options as a single Option 1", () => {
    const options = listOptions(PANTHERS_SERVICE_REFERENCE);
    expect(options).toHaveLength(1);
    expect(options[0].name).toBe("Option 1");
    expect(options[0].events).toBe(PANTHERS_SERVICE_REFERENCE.events);
  });
});

describe("resolveFlatAmount", () => {
  it("repeats the last typed value for years beyond the list", () => {
    expect(resolveFlatAmount([15000], 2, false, 5)).toBe(15000);
  });

  it("escalates forward only when the line opts in", () => {
    expect(resolveFlatAmount([10000], 1, true, 5)).toBe(10500);
    expect(resolveFlatAmount([10000], 2, true, 5)).toBe(11025);
  });

  it("keeps 'Included' sticky and bills nothing when no value was typed", () => {
    expect(resolveFlatAmount(["included"], 3, true, 5)).toBe("included");
    expect(resolveFlatAmount([], 0, false, 5)).toBe(0);
  });
});

describe("schema back-compatibility", () => {
  it("accepts a pre-2026-07-30 estimate with no flat fields and defaults to calculated", () => {
    const legacy = {
      clientName: "Carolina Panthers",
      termStartYear: 2026,
      termYears: 2,
      events: [{ id: "e1", name: "Pre Event Hardware Support", days: 26.5, technicians: 2, clientDayRate: 850, technicianDayCost: 280 }],
      breakFix: { enabled: true, label: "Break/Fix", days: 104, technicians: 2, hoursPerDay: 8, technicianHourlyCost: 35, priceMultiplier: 1.62 },
    };
    const parsed = ServiceEstimatorInputSchema.parse(legacy);
    expect(parsed.events[0].pricingMode).toBe("calculated");
    expect(parsed.options).toEqual([]);
    expect(parsed.sectionLabels.operatingExpenses).toBe("Operating Expenses");
    expect(calculateServiceEstimate(parsed as ServiceEstimatorInput).years[0].totalIncome).toBe(45050 + 45050 * 0 + 104 * 2 * 8 * 35 * 1.62);
  });

  it("reads 'Included' typed in any case, and money with $ and commas", () => {
    const parsed = ServiceEstimatorInputSchema.parse({
      clientName: "Fifth Third Park",
      termStartYear: 2026,
      termYears: 3,
      events: [{ id: "l1", name: "Parts Waranty", pricingMode: "flat", flatRevenue: ["INCLUDED", "$9,688", 15858] }],
      breakFix: { enabled: false, label: "Break/Fix", priceMultiplier: 1 },
    });
    expect(parsed.events[0].flatRevenue).toEqual(["included", 9688, 15858]);
  });

  it("keeps the primary option and the top-level lines in agreement", () => {
    const parsed = ServiceEstimatorInputSchema.parse({
      clientName: "Fifth Third Park",
      termStartYear: 2026,
      termYears: 3,
      events: [{ id: "stale", name: "Stale line", pricingMode: "flat", flatRevenue: [1] }],
      breakFix: { enabled: false, label: "Break/Fix", priceMultiplier: 1 },
      options: [
        { id: "option-1", name: "Option 1", events: [{ id: "real", name: "Real line", pricingMode: "flat", flatRevenue: [100] }], breakFix: { enabled: false, label: "Break/Fix", priceMultiplier: 1 } },
      ],
    });
    expect(parsed.events.map((e) => e.id)).toEqual(["real"]);
  });
});
