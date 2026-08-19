/**
 * Won and Future NFL Business engine (Jireh, 2026-08-18).
 *
 * He built this report by asking the CRM assistant for it, and the workbook
 * that came back multiplied every figure by a thousand — a $9,000 graphics
 * package read as $9,000,000 — because currency reaches the assistant in
 * millionths of a dollar and it scaled them by hand. It also returned 139 of
 * the 163 qualifying deals.
 *
 * So the arithmetic moves into code. Micros are converted once, at the edge,
 * and the totals here are plain sums of the converted figures. Nothing in this
 * file guesses a scale.
 *
 * The set is every NFL deal that is either won or still alive: the same
 * exclusions the CRM's own pricing view uses, so a lost or no-bid pursuit never
 * counts toward a team's book.
 */

export const EXCLUDED_STATUSES = ["LOST", "NO_BID", "NO_OPPORTUNITY_STATUS"] as const;

/** A dollar figure the CRM never recorded is absent, not zero. */
export type Money = number | null;

export type NflDealInput = {
  id: string;
  name: string;
  team: string | null;
  opportunityNumber: string | null;
  businessUnit: string | null;
  bidStatus: string | null;
  closeDate: string | null;
  owner: string | null;
  revenue: Money;
  margin: Money;
};

export type NflDealRow = NflDealInput & {
  team: string;
  /** Won business versus everything still in play — the report's two halves. */
  book: "won" | "future";
};

export type NflBookTotals = {
  deals: number;
  revenue: number;
  margin: number;
};

export type NflTeamGroup = {
  team: string;
  rows: NflDealRow[];
  won: NflBookTotals;
  future: NflBookTotals;
  total: NflBookTotals;
};

export type NflBusinessReport = {
  generatedAt: string;
  teams: NflTeamGroup[];
  rows: NflDealRow[];
  won: NflBookTotals;
  future: NflBookTotals;
  total: NflBookTotals;
};

export const UNASSIGNED_TEAM = "(no account)";

/** WON is the only status that has already banked; the rest are still pursuit. */
export function bookFor(bidStatus: string | null): "won" | "future" {
  return bidStatus === "WON" ? "won" : "future";
}

export function isExcludedStatus(bidStatus: string | null): boolean {
  if (!bidStatus) return true;
  return (EXCLUDED_STATUSES as readonly string[]).includes(bidStatus);
}

function emptyTotals(): NflBookTotals {
  return { deals: 0, revenue: 0, margin: 0 };
}

function addTo(totals: NflBookTotals, row: NflDealRow): void {
  totals.deals += 1;
  totals.revenue += row.revenue ?? 0;
  totals.margin += row.margin ?? 0;
}

/**
 * Sorted so a team reads top-down as "what we have booked, then what is still
 * open" — won first, then the nearest close date, then the name so two deals
 * closing the same day never swap places between two runs of the report.
 */
function compareRows(a: NflDealRow, b: NflDealRow): number {
  if (a.book !== b.book) return a.book === "won" ? -1 : 1;
  const at = a.closeDate ? Date.parse(a.closeDate) : NaN;
  const bt = b.closeDate ? Date.parse(b.closeDate) : NaN;
  const aValid = !Number.isNaN(at);
  const bValid = !Number.isNaN(bt);
  if (aValid && bValid && at !== bt) return at - bt;
  if (aValid !== bValid) return aValid ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function buildNflBusinessReport(
  deals: NflDealInput[],
  now: number = Date.now(),
): NflBusinessReport {
  const rows: NflDealRow[] = [];

  for (const deal of deals) {
    if (isExcludedStatus(deal.bidStatus)) continue;
    rows.push({
      ...deal,
      team: (deal.team || "").trim() || UNASSIGNED_TEAM,
      book: bookFor(deal.bidStatus),
    });
  }

  const byTeam = new Map<string, NflDealRow[]>();
  for (const row of rows) {
    const list = byTeam.get(row.team);
    if (list) list.push(row);
    else byTeam.set(row.team, [row]);
  }

  const teams: NflTeamGroup[] = [];
  for (const [team, teamRows] of byTeam) {
    const group: NflTeamGroup = {
      team,
      rows: [...teamRows].sort(compareRows),
      won: emptyTotals(),
      future: emptyTotals(),
      total: emptyTotals(),
    };
    for (const row of group.rows) {
      addTo(row.book === "won" ? group.won : group.future, row);
      addTo(group.total, row);
    }
    teams.push(group);
  }

  // Biggest book first — the reason to open this report is to see where the
  // money is, and an alphabetical list buries that under the Arizona Cardinals.
  teams.sort((a, b) => b.total.revenue - a.total.revenue || a.team.localeCompare(b.team));

  const won = emptyTotals();
  const future = emptyTotals();
  const total = emptyTotals();
  for (const group of teams) {
    for (const row of group.rows) {
      addTo(row.book === "won" ? won : future, row);
      addTo(total, row);
    }
  }

  return {
    generatedAt: new Date(now).toISOString(),
    teams,
    rows: teams.flatMap((g) => g.rows),
    won,
    future,
    total,
  };
}

/** Margin as a share of revenue, or null when there is no revenue to divide by. */
export function marginPercent(revenue: Money, margin: Money): number | null {
  if (revenue === null || margin === null) return null;
  if (revenue === 0) return null;
  return margin / revenue;
}
