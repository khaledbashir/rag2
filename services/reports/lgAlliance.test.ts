import { describe, expect, it } from "vitest";
import {
  ALLIANCE_RATE_DEFAULT,
  buildLgAllianceReport,
  businessUnitLabel,
  fiscalYearLabel,
  humanizeStatus,
  normalizeFiscalYears,
  outcomeFor,
  toDealRow,
  winConfidenceLabel,
  type LgDealInput,
} from "./lgAlliance";

function deal(over: Partial<LgDealInput> = {}): LgDealInput {
  return {
    id: over.id || "id-1",
    name: "Deal",
    opportunityNumber: "100001",
    account: "Account",
    bidStatus: "WON",
    league: "NFL",
    winConfidence: null,
    awardDate: null,
    tier: null,
    fiscalYears: [],
    businessUnits: [],
    description: null,
    notes: null,
    poValue: null,
    sponsorshipValue: null,
    sponsorshipByYear: {},
    revenue: 0,
    margin: 0,
    revenueByYear: {},
    marginByYear: {},
    ...over,
  };
}

describe("Jireh's tier-detail arithmetic", () => {
  // The LA Dodgers row of "LG ANC Marketing Breakdown 2027-2028 Tier Detail":
  // PO 2,612,154 · cost 1,960,000 · 8% fee 208,972.32 · LG margin 443,181.68.
  it("reproduces the LA Dodgers row from his workbook", () => {
    const row = toDealRow(
      deal({ poValue: 2_612_154, revenue: 2_612_154, margin: 652_154 }),
      ALLIANCE_RATE_DEFAULT,
    );
    expect(row.cost).toBeCloseTo(1_960_000, 2);
    expect(row.allianceFee).toBeCloseTo(208_972.32, 2);
    expect(row.lgMargin).toBeCloseTo(443_181.68, 2);
  });

  // Monumental Sports GMP2: PO 8,142,109.02 · cost 5,900,079 · fee 651,368.72.
  it("reproduces the Monumental Sports row", () => {
    const row = toDealRow(
      deal({ poValue: 8_142_109.02, revenue: 8_142_109.02, margin: 2_242_030.02 }),
      ALLIANCE_RATE_DEFAULT,
    );
    expect(row.cost).toBeCloseTo(5_900_079, 2);
    expect(row.allianceFee).toBeCloseTo(651_368.72, 2);
    expect(row.lgMargin).toBeCloseTo(1_590_661.3, 2);
  });

  it("honours a non-default alliance rate", () => {
    const row = toDealRow(deal({ poValue: 1_000_000, revenue: 1_000_000, margin: 200_000 }), 0.05);
    expect(row.allianceFee).toBe(50_000);
    expect(row.lgMargin).toBe(150_000);
  });
});

describe("PO basis", () => {
  it("uses the PO value when the team has entered one", () => {
    const row = toDealRow(deal({ poValue: 900_000, revenue: 1_000_000 }), 0.08);
    expect(row.po).toBe(900_000);
    expect(row.poBasis).toBe("po");
  });

  it("falls back to total project revenue and says so", () => {
    const row = toDealRow(deal({ poValue: null, revenue: 1_000_000 }), 0.08);
    expect(row.po).toBe(1_000_000);
    expect(row.poBasis).toBe("revenue");
  });

  it("treats a zero PO as not yet entered rather than a real zero", () => {
    const row = toDealRow(deal({ poValue: 0, revenue: 500_000 }), 0.08);
    expect(row.po).toBe(500_000);
    expect(row.poBasis).toBe("revenue");
  });
});

describe("outcome buckets", () => {
  it("counts the dashboard's open statuses as pipeline", () => {
    for (const s of ["PROSPECTING", "RFP_RECEIVED", "SCOPING", "BID_SUBMITTED",
                     "SHORTLISTED", "VERBAL_AGREEMENT", "ON_HOLD"]) {
      expect(outcomeFor(s)).toBe("open");
    }
  });

  it("keeps lost, no-bid and blank statuses out of pipeline and won", () => {
    for (const s of ["LOST", "NO_BID", "NO_OPPORTUNITY_STATUS", null]) {
      expect(outcomeFor(s)).toBe("closed");
    }
  });
});

describe("tier grouping", () => {
  const deals = [
    deal({ id: "a", tier: "TIER_1", account: "Panthers", revenue: 10_000_000, margin: 2_000_000 }),
    deal({ id: "b", tier: "TIER_1", account: "Dodgers", revenue: 4_000_000, margin: 800_000 }),
    deal({ id: "c", tier: "TIER_3", account: "Rockets", revenue: 900_000, margin: 200_000 }),
    deal({ id: "d", tier: null, account: "Unknown", revenue: 500_000, margin: 100_000 }),
  ];

  it("orders tiers 1 → 3 and puts untiered deals last", () => {
    const report = buildLgAllianceReport(deals);
    expect(report.tiers.map((t) => t.label)).toEqual([
      "Tier 1", "Tier 3", "Not yet tiered",
    ]);
  });

  it("sorts deals inside a tier by size", () => {
    const report = buildLgAllianceReport(deals);
    expect(report.tiers[0].rows.map((r) => r.account)).toEqual(["Panthers", "Dodgers"]);
  });

  it("subtotals each tier and the whole sheet", () => {
    const report = buildLgAllianceReport(deals);
    expect(report.tiers[0].totals.po).toBe(14_000_000);
    expect(report.tiers[0].totals.deals).toBe(2);
    expect(report.totals.po).toBe(15_400_000);
    expect(report.totals.deals).toBe(4);
  });

  it("reports how much of the sheet still needs tiering", () => {
    expect(buildLgAllianceReport(deals).rowsUntiered).toBe(1);
  });

  // Jireh, 2026-08-18 — a new LG Tier option. A deal marked No Sponsorship is
  // a decision, so it bands below the three tiers but above the rows nobody
  // has tiered yet, and does not count as untiered.
  it("bands No Sponsorship deals after Tier 3 and before the untiered", () => {
    const report = buildLgAllianceReport([
      ...deals,
      deal({ id: "e", tier: "NO_SPONSORSHIP", account: "Bears", revenue: 2_000_000, margin: 300_000 }),
    ]);
    expect(report.tiers.map((t) => t.label)).toEqual([
      "Tier 1", "Tier 3", "No Sponsorship", "Not yet tiered",
    ]);
    expect(report.rowsUntiered).toBe(1);
  });

  // The two further sections he asked for the same afternoon, in his order.
  it("bands Needs Review and the sponsorship-led technology work in turn", () => {
    const report = buildLgAllianceReport([
      ...deals,
      deal({ id: "e", tier: "NO_SPONSORSHIP", account: "Bears", revenue: 2_000_000, margin: 300_000 }),
      deal({ id: "f", tier: "NEEDS_REVIEW", account: "Mets", revenue: 1_000_000, margin: 150_000 }),
      deal({
        id: "g",
        tier: "ADDITIONAL_TECHNOLOGY_FROM_SPONSORSHIP",
        account: "Suns",
        revenue: 800_000,
        margin: 120_000,
      }),
    ]);
    expect(report.tiers.map((t) => t.label)).toEqual([
      "Tier 1",
      "Tier 3",
      "No Sponsorship",
      "Needs Review",
      "Additional Technology Opportunities from Sponsorship",
      "Not yet tiered",
    ]);
    expect(report.rowsUntiered).toBe(1);
  });
});

describe("fiscal year phasing", () => {
  const deals = [
    deal({
      id: "won", bidStatus: "WON", revenue: 3_000_000, margin: 600_000,
      revenueByYear: { 2027: 2_000_000, 2028: 1_000_000 },
      marginByYear: { 2027: 400_000, 2028: 200_000 },
    }),
    deal({
      id: "open", bidStatus: "SHORTLISTED", revenue: 1_000_000, margin: 250_000,
      revenueByYear: { 2028: 1_000_000 },
      marginByYear: { 2028: 250_000 },
    }),
  ];

  it("splits each year into open and won", () => {
    const fy = buildLgAllianceReport(deals).byFiscalYear;
    const y2028 = fy.find((r) => r.year === 2028)!;
    expect(y2028.wonRevenue).toBe(1_000_000);
    expect(y2028.openRevenue).toBe(1_000_000);
    expect(y2028.revenue).toBe(2_000_000);
  });

  it("derives cost, the alliance fee and LG margin per year", () => {
    const y2027 = buildLgAllianceReport(deals).byFiscalYear.find((r) => r.year === 2027)!;
    expect(y2027.cost).toBe(1_600_000);
    expect(y2027.allianceFee).toBeCloseTo(160_000, 6);
    expect(y2027.lgMargin).toBeCloseTo(240_000, 6);
  });

  it("leaves years with no money at zero", () => {
    const y2031 = buildLgAllianceReport(deals).byFiscalYear.find((r) => r.year === 2031)!;
    expect(y2031.revenue).toBe(0);
    expect(y2031.allianceFee).toBe(0);
  });
});

describe("breakdowns", () => {
  it("counts a deal once per LG business unit it opens", () => {
    const report = buildLgAllianceReport([
      deal({ id: "a", businessUnits: ["LED", "AIR_SOLUTIONS"], revenue: 1_000_000, margin: 100_000 }),
      deal({ id: "b", businessUnits: ["LED"], revenue: 500_000, margin: 50_000 }),
    ]);
    const led = report.byBusinessUnit.find((r) => r.label === "LED")!;
    expect(led.deals).toBe(2);
    expect(led.po).toBe(1_500_000);
    expect(report.byBusinessUnit.find((r) => r.label === "Air Solutions")!.deals).toBe(1);
  });

  it("buckets deals with no business units under a named row, not a blank", () => {
    const report = buildLgAllianceReport([deal({ businessUnits: [], revenue: 100 })]);
    expect(report.byBusinessUnit[0].label).toBe("Not yet specified");
  });

  it("ranks leagues by size", () => {
    const report = buildLgAllianceReport([
      deal({ id: "a", league: "MLB", revenue: 1_000_000 }),
      deal({ id: "b", league: "NFL", revenue: 5_000_000 }),
    ]);
    expect(report.byLeague.map((r) => r.label)).toEqual(["NFL", "MLB"]);
  });
});

describe("scope filter", () => {
  const deals = [
    deal({ id: "w", bidStatus: "WON", revenue: 1_000_000 }),
    deal({ id: "o", bidStatus: "PROSPECTING", revenue: 2_000_000 }),
    deal({ id: "l", bidStatus: "LOST", revenue: 9_000_000 }),
  ];

  it("leaves lost deals out by default so a target rollup shows live deals", () => {
    const r = buildLgAllianceReport(deals);
    expect(r.rows.map((x) => x.id).sort()).toEqual(["o", "w"]);
    expect(r.totals.po).toBe(3_000_000);
  });

  it("includes lost deals only when asked for everything", () => {
    const r = buildLgAllianceReport(deals, { scope: "all" });
    expect(r.rows).toHaveLength(3);
    expect(r.totals.po).toBe(12_000_000);
  });

  it("can narrow to live pipeline", () => {
    const r = buildLgAllianceReport(deals, { scope: "open" });
    expect(r.rows.map((x) => x.id)).toEqual(["o"]);
    expect(r.totals.po).toBe(2_000_000);
  });

  it("can narrow to won", () => {
    expect(buildLgAllianceReport(deals, { scope: "won" }).rows.map((x) => x.id)).toEqual(["w"]);
  });

  it("splits open and won totals even when reporting on everything", () => {
    const r = buildLgAllianceReport(deals, { scope: "all" });
    expect(r.open.po).toBe(2_000_000);
    expect(r.won.po).toBe(1_000_000);
    expect(r.totals.po).toBe(12_000_000);
  });
});

describe("labels", () => {
  it("renders win confidence as a percentage", () => {
    expect(winConfidenceLabel("P_75")).toBe("75%");
    expect(winConfidenceLabel(null)).toBe("");
  });

  it("spells the LG business units the way LG does", () => {
    expect(businessUnitLabel("SKS_APPLIANCE")).toBe("SKS / Appliance");
    expect(businessUnitLabel("AIR_SOLUTIONS")).toBe("Air Solutions");
  });
});

describe("acronym handling", () => {
  it("keeps league acronyms upper-case", () => {
    expect(humanizeStatus("NFL")).toBe("NFL");
    expect(humanizeStatus("NCAA")).toBe("NCAA");
  });

  it("still title-cases ordinary enum words", () => {
    expect(humanizeStatus("VERBAL_AGREEMENT")).toBe("Verbal Agreement");
    expect(humanizeStatus("NO_BID")).toBe("No Bid");
  });

  it("title-cases the words around an acronym", () => {
    expect(humanizeStatus("RFP_RECEIVED")).toBe("RFP Received");
  });
});

describe("multiple fiscal years", () => {
  it("accepts the multi-select list", () => {
    expect(normalizeFiscalYears(["FY2027", "FY2028"])).toEqual(["FY2027", "FY2028"]);
  });

  it("still accepts the single-select shape it replaced", () => {
    expect(normalizeFiscalYears("FY2027")).toEqual(["FY2027"]);
  });

  it("treats null and empty as no years, not a blank entry", () => {
    expect(normalizeFiscalYears(null)).toEqual([]);
    expect(normalizeFiscalYears(undefined)).toEqual([]);
    expect(normalizeFiscalYears([])).toEqual([]);
  });

  it("renders several years chronologically on one line", () => {
    expect(fiscalYearLabel(["FY2028", "FY2027"])).toBe("FY2027, FY2028");
  });

  it("renders nothing when a deal has no year set", () => {
    expect(fiscalYearLabel([])).toBe("");
  });
});

describe("sponsorship value (Jireh, 2026-08-14)", () => {
  it("totals sponsorship across the rollup and per tier", () => {
    const report = buildLgAllianceReport([
      deal({ id: "a", tier: "TIER_1", poValue: 1_000_000, sponsorshipValue: 250_000, revenue: 1_000_000, margin: 200_000 }),
      deal({ id: "b", tier: "TIER_1", poValue: 500_000, sponsorshipValue: 100_000, revenue: 500_000, margin: 100_000 }),
      deal({ id: "c", tier: "TIER_2", poValue: 400_000, sponsorshipValue: null, revenue: 400_000, margin: 80_000 }),
    ]);
    expect(report.totals.sponsorship).toBe(350_000);
    expect(report.tiers[0].totals.sponsorship).toBe(350_000);
    expect(report.tiers[1].totals.sponsorship).toBe(0);
    expect(report.rowsWithSponsorship).toBe(2);
  });

  // Sponsorship sits beside the PO — folding it into the fee would change every
  // number in the workbook Jireh reconciles against by hand.
  it("leaves the alliance fee and LG margin calculated from the PO alone", () => {
    const withSponsorship = toDealRow(
      deal({ poValue: 1_000_000, sponsorshipValue: 750_000, revenue: 1_000_000, margin: 200_000 }),
      ALLIANCE_RATE_DEFAULT,
    );
    const without = toDealRow(
      deal({ poValue: 1_000_000, sponsorshipValue: null, revenue: 1_000_000, margin: 200_000 }),
      ALLIANCE_RATE_DEFAULT,
    );
    expect(withSponsorship.po).toBe(1_000_000);
    expect(withSponsorship.allianceFee).toBe(without.allianceFee);
    expect(withSponsorship.lgMargin).toBe(without.lgMargin);
    expect(withSponsorship.sponsorshipValue).toBe(750_000);
  });

  it("does not treat a missing sponsorship value as a zero-dollar entry", () => {
    const report = buildLgAllianceReport([deal({ poValue: 100_000, revenue: 100_000 })]);
    expect(report.totals.sponsorship).toBe(0);
    expect(report.rowsWithSponsorship).toBe(0);
    expect(report.rows[0].sponsorshipValue).toBeNull();
  });
});

describe("sponsorship phased by fiscal year (Jireh, 2026-08-14)", () => {
  // His Monumental example: $750k a year for four years.
  const monumental = () =>
    deal({
      id: "mse", bidStatus: "WON", revenue: 8_000_000, margin: 1_000_000,
      sponsorshipValue: 3_000_000,
      sponsorshipByYear: { 2026: 750_000, 2027: 750_000, 2028: 750_000, 2029: 750_000 },
      revenueByYear: { 2026: 8_000_000 },
      marginByYear: { 2026: 1_000_000 },
    });

  it("phases the sponsorship across the years it was entered for", () => {
    const fy = buildLgAllianceReport([monumental()]).byFiscalYear;
    for (const year of [2026, 2027, 2028, 2029]) {
      expect(fy.find((r) => r.year === year)!.sponsorship).toBe(750_000);
    }
    expect(fy.find((r) => r.year === 2030)!.sponsorship).toBe(0);
  });

  it("splits sponsorship open vs won the way the project money splits", () => {
    const fy = buildLgAllianceReport([
      monumental(),
      deal({
        id: "open", bidStatus: "SCOPING", revenue: 1_000_000,
        sponsorshipByYear: { 2027: 200_000 },
      }),
    ]).byFiscalYear;
    const y2027 = fy.find((r) => r.year === 2027)!;
    expect(y2027.wonSponsorship).toBe(750_000);
    expect(y2027.openSponsorship).toBe(200_000);
    expect(y2027.sponsorship).toBe(950_000);
  });

  // A sponsorship-only year would otherwise be filtered out of the sheet.
  it("keeps a year that carries sponsorship but no project revenue", () => {
    const fy = buildLgAllianceReport([
      deal({ bidStatus: "WON", sponsorshipByYear: { 2031: 500_000 } }),
    ]).byFiscalYear;
    expect(fy.find((r) => r.year === 2031)!.sponsorship).toBe(500_000);
  });
});

describe("PO coverage (Jireh, 2026-08-17)", () => {
  // He tracks the PO, not the project economics, so the sheet has to say how
  // much of the PO figure is real paper and how much is still standing in.
  const deals = [
    deal({ id: "a", tier: "TIER_1", poValue: 2_000_000, revenue: 2_400_000, margin: 400_000 }),
    deal({ id: "b", tier: "TIER_1", poValue: null, revenue: 1_000_000, margin: 200_000 }),
    deal({ id: "c", tier: "TIER_2", poValue: 500_000, revenue: 600_000, margin: 100_000 }),
  ];

  it("splits the PO total into entered and estimated", () => {
    const t = buildLgAllianceReport(deals).totals;
    expect(t.po).toBe(3_500_000);
    expect(t.poEntered).toBe(2_500_000);
    expect(t.poEstimated).toBe(1_000_000);
    expect(t.dealsWithPo).toBe(2);
  });

  it("counts coverage per tier as well as overall", () => {
    const tier1 = buildLgAllianceReport(deals).tiers[0].totals;
    expect(tier1.deals).toBe(2);
    expect(tier1.dealsWithPo).toBe(1);
    expect(tier1.poEntered).toBe(2_000_000);
    expect(tier1.poEstimated).toBe(1_000_000);
  });

  it("totals project revenue alongside margin so the rollup can show both", () => {
    const t = buildLgAllianceReport(deals).totals;
    expect(t.revenue).toBe(4_000_000);
    expect(t.ancMargin).toBe(700_000);
  });

  it("keeps a zero PO out of the entered count", () => {
    const t = buildLgAllianceReport([deal({ poValue: 0, revenue: 800_000 })]).totals;
    expect(t.dealsWithPo).toBe(0);
    expect(t.poEstimated).toBe(800_000);
  });
});
