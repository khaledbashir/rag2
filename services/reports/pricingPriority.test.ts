import { describe, expect, it } from "vitest";
import {
  bucketFor,
  buildPricingPriorityReport,
  daysUntil,
  type PricingDealInput,
} from "./pricingPriority";

const NOW = Date.parse("2026-08-14T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function at(offsetDays: number): string {
  return new Date(NOW + offsetDays * DAY).toISOString();
}

function deal(over: Partial<PricingDealInput> = {}): PricingDealInput {
  return {
    id: "id", name: "Deal", account: "Account", proposalStage: null,
    bidStatus: "PROSPECTING", proposalDueDate: null, pricingComplete: "NO",
    assignedEstimator: null, owner: null, awardDate: null, completionDate: null,
    businessUnit: "TECHNOLOGY", manufacturer: null, league: null,
    revenue: 0, margin: 0, ...over,
  };
}

describe("urgency buckets", () => {
  it("marks a due date that has passed as past due", () => {
    expect(bucketFor(at(-1), NOW)).toBe("overdue");
  });

  it("puts a date inside the next seven days in the week bucket", () => {
    expect(bucketFor(at(3), NOW)).toBe("this_week");
    expect(bucketFor(at(7), NOW)).toBe("this_week");
  });

  it("pushes day eight into later", () => {
    expect(bucketFor(at(8), NOW)).toBe("later");
  });

  it("treats a missing date as undated rather than overdue", () => {
    expect(bucketFor(null, NOW)).toBe("undated");
  });

  it("treats an unparseable date as undated rather than crashing", () => {
    expect(bucketFor("not a date", NOW)).toBe("undated");
    expect(daysUntil("not a date", NOW)).toBeNull();
  });
});

describe("ordering", () => {
  it("sorts by proposal due date ascending, matching the CRM view", () => {
    const report = buildPricingPriorityReport([
      deal({ id: "c", proposalDueDate: at(10) }),
      deal({ id: "a", proposalDueDate: at(-5) }),
      deal({ id: "b", proposalDueDate: at(2) }),
    ], { now: NOW });
    expect(report.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps undated deals at the bottom instead of sorting them first", () => {
    const report = buildPricingPriorityReport([
      deal({ id: "undated", proposalDueDate: null }),
      deal({ id: "dated", proposalDueDate: at(30) }),
    ], { now: NOW });
    expect(report.rows.map((r) => r.id)).toEqual(["dated", "undated"]);
  });
});

describe("report shape", () => {
  const deals = [
    deal({ id: "a", proposalDueDate: at(-2), revenue: 1_000_000, margin: 200_000 }),
    deal({ id: "b", proposalDueDate: at(3), revenue: 500_000, margin: 100_000 }),
    deal({ id: "c", proposalDueDate: null, revenue: 250_000, margin: 50_000 }),
  ];

  it("totals revenue and margin across the list", () => {
    const r = buildPricingPriorityReport(deals, { now: NOW });
    expect(r.totals.deals).toBe(3);
    expect(r.totals.revenue).toBe(1_750_000);
    expect(r.totals.margin).toBe(350_000);
  });

  it("counts each urgency bucket", () => {
    const r = buildPricingPriorityReport(deals, { now: NOW });
    expect(r.counts).toEqual({ overdue: 1, this_week: 1, later: 0, undated: 1 });
  });

  it("reports days until due, negative once past", () => {
    const r = buildPricingPriorityReport(deals, { now: NOW });
    expect(r.rows[0].daysUntilDue).toBe(-2);
    expect(r.rows[1].daysUntilDue).toBe(3);
    expect(r.rows[2].daysUntilDue).toBeNull();
  });

  it("handles an empty list without dividing by anything", () => {
    const r = buildPricingPriorityReport([], { now: NOW });
    expect(r.rows).toEqual([]);
    expect(r.groups).toEqual([]);
    expect(r.totals).toEqual({ deals: 0, revenue: 0, margin: 0 });
  });
});

describe("grouping matches the CRM view", () => {
  const deals = [
    deal({ id: "a", proposalStage: "CONTRACT", proposalDueDate: at(1), revenue: 100 }),
    deal({ id: "b", proposalStage: "RFP", proposalDueDate: at(5), revenue: 200 }),
    deal({ id: "c", proposalStage: "RFP", proposalDueDate: at(2), revenue: 300 }),
    deal({ id: "d", proposalStage: null, proposalDueDate: at(3), revenue: 400 }),
  ];

  it("orders stages the way the view orders them, not alphabetically", () => {
    const r = buildPricingPriorityReport(deals, { now: NOW });
    expect(r.groups.map((g) => g.label)).toEqual(["RFP", "Contract", "No proposal stage"]);
  });

  it("keeps the due-date sort inside a stage", () => {
    const r = buildPricingPriorityReport(deals, { now: NOW });
    expect(r.groups[0].rows.map((x) => x.id)).toEqual(["c", "b"]);
  });

  it("subtotals each stage", () => {
    const r = buildPricingPriorityReport(deals, { now: NOW });
    expect(r.groups[0].revenue).toBe(500);
  });

  it("gives deals with no stage a named group rather than a blank header", () => {
    const r = buildPricingPriorityReport(deals, { now: NOW });
    expect(r.groups.at(-1)!.label).toBe("No proposal stage");
  });
});
