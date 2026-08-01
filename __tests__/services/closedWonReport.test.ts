import { describe, expect, it } from "vitest";
import {
  WON_BID_STATUS,
  buildWon2026WhereClause,
  renderClosedWonReportHtml,
  verticalSummaryLabel,
  type ClosedWonReport,
  type ClosedWonReportRow,
} from "@/services/crmReports/closedWonReport";

function row(overrides: Partial<ClosedWonReportRow>): ClosedWonReportRow {
  return {
    id: "opp-1",
    opportunityNumber: "100001",
    owner: "Alexis Ventarola",
    department: "Technology",
    accountName: "Some Account",
    opportunityName: "Some Deal",
    bidStatus: "WON",
    revenue: 100,
    costs: 60,
    margin: 40,
    totalProjectRevenue: 100,
    totalProjectMargin: 40,
    substantialCompletionDate: null,
    awardDate: "2026-07-30",
    createdDate: "2026-07-01",
    statusUpdate: "-",
    ...overrides,
  };
}

function totals(rows: ClosedWonReportRow[]) {
  return rows.reduce(
    (acc, r) => ({
      records: acc.records + 1,
      revenue: acc.revenue + r.revenue,
      costs: acc.costs + r.costs,
      margin: acc.margin + r.margin,
    }),
    { records: 0, revenue: 0, costs: 0, margin: 0 },
  );
}

function section(rows: ClosedWonReportRow[], groupBy: (r: ClosedWonReportRow) => string) {
  const groups = new Map<string, ClosedWonReportRow[]>();
  for (const r of rows) groups.set(groupBy(r), [...(groups.get(groupBy(r)) || []), r]);
  return {
    rows,
    totals: totals(rows),
    departmentGroups: Array.from(groups.entries()).map(([department, groupRows]) => ({
      department,
      rows: groupRows,
      totals: totals(groupRows),
    })),
  };
}

const TECH = row({ id: "a", department: "Technology", owner: "Alexis Ventarola", revenue: 500_000, costs: 300_000, margin: 200_000 });
const SERVICE = row({ id: "b", department: "Service", owner: "Jeremy Riley", revenue: 250_000, costs: 100_000, margin: 150_000 });

function fixture(period: ClosedWonReport["period"] = "last7"): ClosedWonReport {
  const recentRows = [TECH, SERVICE];
  return {
    period,
    title: "2026 Closed Won by Business Unit — Last 7 Days",
    subtitle: "",
    generatedAt: "2026-08-01T12:00:00.000Z",
    rangeStart: "2026-07-25T00:00:00.000Z",
    rangeEnd: "2026-08-01T12:00:00.000Z",
    fyYear: 2026,
    dashboardUrl: "https://crm.ancsports.net/object/dashboard/x",
    won2026: section([TECH, SERVICE], (r) => r.department),
    topWins: [],
    recent: {
      title: "Closed-Won Activity Last 7 Days",
      rangeStart: "2026-07-25T00:00:00.000Z",
      rangeEnd: "2026-08-01T12:00:00.000Z",
      ...section(recentRows, (r) => r.owner),
    },
    recentByVertical: section(recentRows, (r) => r.department),
    revertedFromWon: [],
  };
}

describe("Closed Won section counts WON and nothing else", () => {
  // Regression guard for the 2026-08-01 defect: the section was built from a
  // blocklist of non-won statuses, so ON_HOLD ($162.8M across 27 deals) and
  // NO_OPPORTUNITY_STATUS ($3.1M) were reported to leadership as Closed Won,
  // inflating the 2026 total from $100.2M to $266.1M.
  it("filters on equality with WON, not a blocklist", () => {
    const clause = buildWon2026WhereClause();
    expect(WON_BID_STATUS).toBe("WON");
    expect(clause).toContain(`o."bidStatus" = $1`);
    expect(clause).not.toContain("not in");
  });

  it("never enumerates statuses that a new CRM status could slip past", () => {
    const clause = buildWon2026WhereClause();
    for (const leaked of ["ON_HOLD", "NO_OPPORTUNITY_STATUS", "LOST", "NO_BID", "SCOPING"]) {
      expect(clause).not.toContain(leaked);
    }
  });
});

describe("wins for the week by vertical", () => {
  it("labels the summary per period", () => {
    expect(verticalSummaryLabel("last7")).toBe("Wins This Week by Vertical");
    expect(verticalSummaryLabel("monthToDate")).toBe("Wins Month-to-Date by Vertical");
  });

  it("renders a vertical summary of the window alongside the account executive detail", () => {
    const html = renderClosedWonReportHtml(fixture());

    expect(html).toContain("Wins This Week by Vertical");
    expect(html).toContain("grouped by Account Executive");

    // Both verticals present, with their own revenue and margin.
    expect(html).toContain("Technology");
    expect(html).toContain("Service");
    expect(html).toContain("$500,000.00");
    expect(html).toContain("$250,000.00");
    expect(html).toContain("$150,000.00");
  });

  it("uses the month-to-date label on the monthly send", () => {
    expect(renderClosedWonReportHtml(fixture("monthToDate"))).toContain("Wins Month-to-Date by Vertical");
  });

  it("still renders when the window has no wins", () => {
    const empty = fixture();
    empty.recentByVertical = section([], (r) => r.department);
    empty.recent = { ...empty.recent, ...section([], (r) => r.owner) };
    const html = renderClosedWonReportHtml(empty);
    expect(html).toContain("Wins This Week by Vertical");
    expect(html).toContain("No closed-won activity in this window.");
  });
});
