/**
 * LG Alliance report engine (Jireh, 2026-08-14).
 *
 * Jireh's "LG ANC Marketing Breakdown — Tier Detail" workbook rolls the LG
 * partnership up by priority tier and phases the money by fiscal year. This
 * module reproduces that arithmetic from live CRM opportunities so the sheet
 * stops being hand-maintained.
 *
 * The four money columns in his sheet relate like this (verified against his
 * own rows — LA Dodgers: PO 2,612,154 · cost 1,960,000 · 8% 208,972 · LG
 * margin 443,182):
 *
 *   Alliance fee = allianceRate x ANC LG PO
 *   ANC margin   = PO - cost
 *   LG margin    = ANC margin - Alliance fee
 *
 * "ANC LG PO" is the `poValue` field when the team has entered one. Until PO
 * numbers are being captured it falls back to Revenue — Total Project, and the
 * row says which basis it used rather than silently mixing the two.
 */

export const ALLIANCE_RATE_DEFAULT = 0.08;

/** Statuses that count as live pipeline, mirroring the LG Pipeline dashboard. */
export const OPEN_STATUSES = [
  "PROSPECTING",
  "RFP_RECEIVED",
  "SCOPING",
  "BID_SUBMITTED",
  "SHORTLISTED",
  "VERBAL_AGREEMENT",
  "ON_HOLD",
] as const;

export const WON_STATUS = "WON";

/** Fiscal years the CRM carries per-year revenue and margin columns for. */
export const FISCAL_YEARS = [
  2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032,
] as const;

export type DealOutcome = "open" | "won" | "closed";

export type PoBasis = "po" | "revenue";

export type LgDealInput = {
  id: string;
  name: string;
  opportunityNumber: string | null;
  account: string | null;
  bidStatus: string | null;
  league: string | null;
  winConfidence: string | null;
  awardDate: string | null;
  /** LG section fields on the opportunity. */
  tier: string | null;
  /**
   * The fiscal years the LG PO spans. Jireh asked for more than one after the
   * first version shipped — a deal that phases across 2027 and 2028 has to say
   * so — so this is a list, and the single-value form is still accepted.
   */
  fiscalYears: string[];
  businessUnits: string[];
  description: string | null;
  notes: string | null;
  /** Money, already converted to whole dollars. */
  poValue: number | null;
  /**
   * Sponsorship value carried alongside the PO (Jireh, 2026-08-14). It sits
   * next to the PO rather than inside it — the alliance fee and LG margin
   * columns are still calculated from the PO alone.
   */
  sponsorshipValue: number | null;
  /**
   * Sponsorship phased by fiscal year, keyed by year — Jireh's Monumental deal
   * is $750k in each of four years rather than one $3m figure. Only the years
   * the LG picklist offers are carried.
   */
  sponsorshipByYear: Record<number, number>;
  revenue: number | null;
  margin: number | null;
  /** Per-fiscal-year revenue and margin, keyed by year. */
  revenueByYear: Record<number, number>;
  marginByYear: Record<number, number>;
};

export type LgDealRow = Omit<LgDealInput, "tier"> & {
  /** Normalised: a recognised tier key, or "" when the deal has not been tiered. */
  tier: string;
  outcome: DealOutcome;
  tierLabel: string;
  tierRank: number;
  /** ANC LG PO — poValue when present, else total project revenue. */
  po: number;
  poBasis: PoBasis;
  cost: number;
  allianceFee: number;
  lgMargin: number;
};

export type MoneyTotals = {
  deals: number;
  po: number;
  /**
   * PO coverage, split out because Jireh tracks the PO rather than the project
   * economics (2026-08-17): `poEntered` is the part of `po` that comes from a
   * Technology Vendor PO Value someone actually typed, `poEstimated` the part
   * still standing in from Revenue — Total Project.
   */
  poEntered: number;
  poEstimated: number;
  dealsWithPo: number;
  sponsorship: number;
  revenue: number;
  cost: number;
  allianceFee: number;
  ancMargin: number;
  lgMargin: number;
};

export type TierGroup = {
  tier: string;
  label: string;
  rank: number;
  rows: LgDealRow[];
  totals: MoneyTotals;
};

export type FiscalYearRow = {
  year: number;
  /** Sponsorship booked or forecast in this year, split the same way. */
  openSponsorship: number;
  wonSponsorship: number;
  sponsorship: number;
  openRevenue: number;
  openMargin: number;
  wonRevenue: number;
  wonMargin: number;
  revenue: number;
  cost: number;
  allianceFee: number;
  lgMargin: number;
};

export type BreakdownRow = {
  key: string;
  label: string;
  deals: number;
  po: number;
  lgMargin: number;
};

export type LgAllianceReport = {
  generatedAt: string;
  allianceRate: number;
  rows: LgDealRow[];
  tiers: TierGroup[];
  totals: MoneyTotals;
  open: MoneyTotals;
  won: MoneyTotals;
  byFiscalYear: FiscalYearRow[];
  byBusinessUnit: BreakdownRow[];
  byLeague: BreakdownRow[];
  /** How many rows fell back to revenue because no PO value is recorded. */
  rowsWithoutPo: number;
  /** How many rows carry no LG tier yet. */
  rowsUntiered: number;
  /** How many rows have a sponsorship value entered. */
  rowsWithSponsorship: number;
};

const TIER_LABELS: Record<string, { label: string; rank: number }> = {
  TIER_1: { label: "Tier 1", rank: 1 },
  TIER_2: { label: "Tier 2", rank: 2 },
  TIER_3: { label: "Tier 3", rank: 3 },
  // Jireh, 2026-08-18: a deal can be a live LG deal and carry no sponsorship at
  // all, which is a decision — not the same thing as nobody having tiered it
  // yet. It bands below the three tiers and above the untiered rows.
  NO_SPONSORSHIP: { label: "No Sponsorship", rank: 4 },
  // Two more sections he asked for the same afternoon: a triage state, and the
  // technology work that comes out of a sponsorship rather than a tier deal.
  NEEDS_REVIEW: { label: "Needs Review", rank: 5 },
  ADDITIONAL_TECHNOLOGY_FROM_SPONSORSHIP: {
    label: "Additional Technology Opportunities from Sponsorship",
    rank: 6,
  },
};

const UNTIERED = { label: "Not yet tiered", rank: 9 };

const BUSINESS_UNIT_LABELS: Record<string, string> = {
  LED: "LED",
  LCD: "LCD",
  SKS_APPLIANCE: "SKS / Appliance",
  AIR_SOLUTIONS: "Air Solutions",
  IT_PRODUCTS: "IT Products",
  OTHER: "Other",
};

/**
 * Enum values that must survive title-casing intact — a league or product
 * acronym rendered as "Nfl" or "Led" reads as a typo on a client-facing sheet.
 */
const ACRONYMS = new Set([
  "NFL", "NBA", "MLB", "NHL", "MLS", "NCAA", "NWSL", "WNBA", "MILB", "USL",
  "AHL", "ECHL", "CFL", "NASCAR", "RFP", "LED", "LCD", "OOH", "IT", "SKS",
  "LG", "PO", "ANC", "TV", "AV",
]);

export function humanizeStatus(status: string | null): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

export function businessUnitLabel(value: string): string {
  return BUSINESS_UNIT_LABELS[value] || humanizeStatus(value);
}

/** Accepts the single-select legacy shape as well as the multi-select list. */
export function normalizeFiscalYears(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

/** "FY2027, FY2028" — sorted so the sheet reads chronologically. */
export function fiscalYearLabel(years: string[]): string {
  return [...years].sort().join(", ");
}

export function winConfidenceLabel(value: string | null): string {
  if (!value) return "";
  const m = /^P_(\d+)$/.exec(value);
  return m ? `${m[1]}%` : value;
}

export function outcomeFor(status: string | null): DealOutcome {
  if (status === WON_STATUS) return "won";
  if (status && (OPEN_STATUSES as readonly string[]).includes(status)) return "open";
  return "closed";
}

function emptyTotals(): MoneyTotals {
  return {
    deals: 0,
    po: 0,
    poEntered: 0,
    poEstimated: 0,
    dealsWithPo: 0,
    sponsorship: 0,
    revenue: 0,
    cost: 0,
    allianceFee: 0,
    ancMargin: 0,
    lgMargin: 0,
  };
}

function addTo(totals: MoneyTotals, row: LgDealRow): void {
  totals.deals += 1;
  totals.po += row.po;
  if (row.poBasis === "po") {
    totals.poEntered += row.po;
    totals.dealsWithPo += 1;
  } else {
    totals.poEstimated += row.po;
  }
  totals.sponsorship += row.sponsorshipValue || 0;
  totals.revenue += row.revenue || 0;
  totals.cost += row.cost;
  totals.allianceFee += row.allianceFee;
  totals.ancMargin += row.margin || 0;
  totals.lgMargin += row.lgMargin;
}

/**
 * Turns one CRM opportunity into a rollup row.
 *
 * Cost is derived (revenue - margin) because the CRM stores revenue and margin
 * but no cost column; when the PO basis is `po` the cost still comes from the
 * revenue/margin pair, which is the only cost ANC has recorded.
 */
export function toDealRow(deal: LgDealInput, allianceRate: number): LgDealRow {
  const revenue = deal.revenue || 0;
  const margin = deal.margin || 0;
  const hasPo = deal.poValue !== null && deal.poValue !== undefined && deal.poValue !== 0;
  const po = hasPo ? (deal.poValue as number) : revenue;
  const cost = revenue - margin;
  const allianceFee = po * allianceRate;
  const tier = deal.tier && TIER_LABELS[deal.tier] ? deal.tier : "";
  const meta = tier ? TIER_LABELS[tier] : UNTIERED;

  return {
    ...deal,
    outcome: outcomeFor(deal.bidStatus),
    tier,
    tierLabel: meta.label,
    tierRank: meta.rank,
    po,
    poBasis: hasPo ? "po" : "revenue",
    cost,
    allianceFee,
    // LG's margin is what ANC keeps after the alliance contribution comes out.
    lgMargin: margin - allianceFee,
  };
}

function breakdown(
  rows: LgDealRow[],
  keyOf: (row: LgDealRow) => string[],
  labelOf: (key: string) => string,
): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const row of rows) {
    for (const key of keyOf(row)) {
      const entry = map.get(key) || { key, label: labelOf(key), deals: 0, po: 0, lgMargin: 0 };
      entry.deals += 1;
      entry.po += row.po;
      entry.lgMargin += row.lgMargin;
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.po - a.po || a.label.localeCompare(b.label));
}

export type ReportScope = "open" | "won" | "active" | "all";

export type BuildOptions = {
  allianceRate?: number;
  generatedAt?: string;
  /**
   * Which deals the sheet covers. Defaults to `active` — open pipeline plus
   * won, the two tabs of the LG Pipeline dashboard. A target rollup that leads
   * with a lost deal reads as a live opportunity, so lost / no-bid only appear
   * under `all`.
   */
  scope?: ReportScope;
};

export function buildLgAllianceReport(
  deals: LgDealInput[],
  options: BuildOptions = {},
): LgAllianceReport {
  const allianceRate = options.allianceRate ?? ALLIANCE_RATE_DEFAULT;
  const generatedAt = options.generatedAt || new Date().toISOString();
  const scope: ReportScope = options.scope || "active";

  let rows = deals.map((d) => toDealRow(d, allianceRate));
  if (scope === "active") rows = rows.filter((r) => r.outcome !== "closed");
  else if (scope !== "all") rows = rows.filter((r) => r.outcome === scope);

  rows.sort(
    (a, b) =>
      a.tierRank - b.tierRank ||
      b.po - a.po ||
      (a.account || "").localeCompare(b.account || ""),
  );

  const tierMap = new Map<string, TierGroup>();
  const totals = emptyTotals();
  const open = emptyTotals();
  const won = emptyTotals();

  for (const row of rows) {
    const group: TierGroup =
      tierMap.get(row.tierLabel) || {
        tier: row.tier,
        label: row.tierLabel,
        rank: row.tierRank,
        rows: [] as LgDealRow[],
        totals: emptyTotals(),
      };
    group.rows.push(row);
    addTo(group.totals, row);
    tierMap.set(row.tierLabel, group);

    addTo(totals, row);
    if (row.outcome === "open") addTo(open, row);
    if (row.outcome === "won") addTo(won, row);
  }

  const byFiscalYear: FiscalYearRow[] = FISCAL_YEARS.map((year) => {
    const fy: FiscalYearRow = {
      year,
      openSponsorship: 0,
      wonSponsorship: 0,
      sponsorship: 0,
      openRevenue: 0,
      openMargin: 0,
      wonRevenue: 0,
      wonMargin: 0,
      revenue: 0,
      cost: 0,
      allianceFee: 0,
      lgMargin: 0,
    };
    for (const row of rows) {
      const revenue = row.revenueByYear[year] || 0;
      const margin = row.marginByYear[year] || 0;
      const sponsorship = row.sponsorshipByYear?.[year] || 0;
      // A year can carry sponsorship without project revenue, so the row is
      // only skipped when all three are empty.
      if (!revenue && !margin && !sponsorship) continue;
      if (row.outcome === "open") {
        fy.openRevenue += revenue;
        fy.openMargin += margin;
        fy.openSponsorship += sponsorship;
      } else if (row.outcome === "won") {
        fy.wonRevenue += revenue;
        fy.wonMargin += margin;
        fy.wonSponsorship += sponsorship;
      }
      fy.sponsorship += sponsorship;
      fy.revenue += revenue;
      fy.cost += revenue - margin;
      fy.allianceFee += revenue * allianceRate;
      fy.lgMargin += margin - revenue * allianceRate;
    }
    return fy;
  });

  return {
    generatedAt,
    allianceRate,
    rows,
    tiers: [...tierMap.values()].sort((a, b) => a.rank - b.rank),
    totals,
    open,
    won,
    byFiscalYear,
    byBusinessUnit: breakdown(
      rows,
      (r) => (r.businessUnits.length ? r.businessUnits : ["UNSPECIFIED"]),
      (k) => (k === "UNSPECIFIED" ? "Not yet specified" : businessUnitLabel(k)),
    ),
    byLeague: breakdown(
      rows,
      (r) => [r.league || "UNSPECIFIED"],
      (k) => (k === "UNSPECIFIED" ? "Not specified" : humanizeStatus(k)),
    ),
    rowsWithoutPo: rows.filter((r) => r.poBasis === "revenue").length,
    rowsUntiered: rows.filter((r) => !r.tier).length,
    rowsWithSponsorship: rows.filter((r) => !!r.sponsorshipValue).length,
  };
}
