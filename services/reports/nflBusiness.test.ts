import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_TEAM,
  bookFor,
  buildNflBusinessReport,
  isExcludedStatus,
  marginPercent,
  type NflDealInput,
} from "./nflBusiness";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");

function deal(over: Partial<NflDealInput> = {}): NflDealInput {
  return {
    id: "id",
    name: "Deal",
    team: "New York Giants",
    opportunityNumber: null,
    businessUnit: "VENUE_SERVICES",
    bidStatus: "WON",
    closeDate: "2026-01-01T00:00:00.000Z",
    owner: null,
    revenue: 1000,
    margin: 400,
    ...over,
  };
}

describe("what counts as NFL business", () => {
  it("keeps won deals and live pursuits, drops lost and no-bid", () => {
    const report = buildNflBusinessReport(
      [
        deal({ id: "a", bidStatus: "WON" }),
        deal({ id: "b", bidStatus: "SHORTLISTED" }),
        deal({ id: "c", bidStatus: "LOST" }),
        deal({ id: "d", bidStatus: "NO_BID" }),
        deal({ id: "e", bidStatus: "NO_OPPORTUNITY_STATUS" }),
        deal({ id: "f", bidStatus: null }),
      ],
      NOW,
    );
    expect(report.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("splits the book into won and still-in-play", () => {
    expect(bookFor("WON")).toBe("won");
    expect(bookFor("VERBAL_AGREEMENT")).toBe("future");
    expect(bookFor("BID_SUBMITTED")).toBe("future");
    expect(isExcludedStatus("LOST")).toBe(true);
    expect(isExcludedStatus("ON_HOLD")).toBe(false);
  });
});

describe("the figures", () => {
  // Jireh's whole complaint: the numbers came back a thousand times too big.
  // The engine only ever adds up what it is handed, so a $9,000 deal stays one.
  it("totals the dollars it is given, unscaled", () => {
    const report = buildNflBusinessReport(
      [deal({ id: "a", revenue: 9000, margin: 6000, bidStatus: "SHORTLISTED" })],
      NOW,
    );
    expect(report.total.revenue).toBe(9000);
    expect(report.total.margin).toBe(6000);
    expect(report.future.revenue).toBe(9000);
    expect(report.won.revenue).toBe(0);
  });

  it("adds won and future separately and together", () => {
    const report = buildNflBusinessReport(
      [
        deal({ id: "a", bidStatus: "WON", revenue: 1000, margin: 250 }),
        deal({ id: "b", bidStatus: "WON", revenue: 500, margin: 100 }),
        deal({ id: "c", bidStatus: "RFP_RECEIVED", revenue: 2000, margin: 800 }),
      ],
      NOW,
    );
    expect(report.won).toEqual({ deals: 2, revenue: 1500, margin: 350 });
    expect(report.future).toEqual({ deals: 1, revenue: 2000, margin: 800 });
    expect(report.total).toEqual({ deals: 3, revenue: 3500, margin: 1150 });
  });

  it("treats a figure the CRM never recorded as absent, not as zero revenue", () => {
    const report = buildNflBusinessReport(
      [deal({ id: "a", revenue: null, margin: null })],
      NOW,
    );
    expect(report.total).toEqual({ deals: 1, revenue: 0, margin: 0 });
    expect(report.rows[0].revenue).toBeNull();
  });

  it("carries a negative margin through rather than flooring it", () => {
    const report = buildNflBusinessReport(
      [deal({ id: "a", revenue: 0, margin: -22500 })],
      NOW,
    );
    expect(report.total.margin).toBe(-22500);
  });
});

describe("grouping", () => {
  it("puts the biggest book first", () => {
    const report = buildNflBusinessReport(
      [
        deal({ id: "a", team: "Arizona Cardinals", revenue: 100 }),
        deal({ id: "b", team: "Baltimore Ravens", revenue: 900 }),
      ],
      NOW,
    );
    expect(report.teams.map((t) => t.team)).toEqual(["Baltimore Ravens", "Arizona Cardinals"]);
  });

  it("reads won first, then the nearest close date", () => {
    const report = buildNflBusinessReport(
      [
        deal({ id: "open-late", bidStatus: "SCOPING", closeDate: "2027-06-01T00:00:00.000Z" }),
        deal({ id: "open-soon", bidStatus: "SCOPING", closeDate: "2026-09-01T00:00:00.000Z" }),
        deal({ id: "won", bidStatus: "WON", closeDate: "2027-12-01T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(report.teams[0].rows.map((r) => r.id)).toEqual(["won", "open-soon", "open-late"]);
  });

  it("sorts two deals closing the same day by name, not by arrival", () => {
    const report = buildNflBusinessReport(
      [
        deal({ id: "b", name: "Zebra", bidStatus: "WON" }),
        deal({ id: "a", name: "Alpha", bidStatus: "WON" }),
      ],
      NOW,
    );
    expect(report.teams[0].rows.map((r) => r.name)).toEqual(["Alpha", "Zebra"]);
  });

  it("puts an undated deal after the dated ones rather than at the top", () => {
    const report = buildNflBusinessReport(
      [
        deal({ id: "undated", bidStatus: "WON", closeDate: null }),
        deal({ id: "dated", bidStatus: "WON", closeDate: "2030-01-01T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(report.teams[0].rows.map((r) => r.id)).toEqual(["dated", "undated"]);
  });

  it("does not silently drop a deal with no account on it", () => {
    const report = buildNflBusinessReport([deal({ id: "a", team: null })], NOW);
    expect(report.teams[0].team).toBe(UNASSIGNED_TEAM);
    expect(report.total.deals).toBe(1);
  });

  it("keeps every team subtotal equal to its own rows", () => {
    const report = buildNflBusinessReport(
      [
        deal({ id: "a", team: "Giants", bidStatus: "WON", revenue: 10, margin: 4 }),
        deal({ id: "b", team: "Giants", bidStatus: "ON_HOLD", revenue: 20, margin: 5 }),
        deal({ id: "c", team: "Jets", bidStatus: "WON", revenue: 30, margin: 6 }),
      ],
      NOW,
    );
    for (const group of report.teams) {
      const revenue = group.rows.reduce((sum, r) => sum + (r.revenue ?? 0), 0);
      expect(group.total.revenue).toBe(revenue);
      expect(group.won.deals + group.future.deals).toBe(group.rows.length);
    }
    expect(report.total.revenue).toBe(60);
  });
});

describe("margin percent", () => {
  it("is a share of revenue", () => {
    expect(marginPercent(1000, 250)).toBe(0.25);
  });

  it("refuses to divide by nothing", () => {
    expect(marginPercent(0, 500)).toBeNull();
    expect(marginPercent(null, 500)).toBeNull();
    expect(marginPercent(1000, null)).toBeNull();
  });
});
