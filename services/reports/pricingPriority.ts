/**
 * Active Pricing Priority List engine (Jireh, 2026-08-14).
 *
 * Mirrors the CRM view of the same name — Technology deals still awaiting
 * pricing, awarding this year or later, that haven't been lost or no-bid —
 * sorted by proposal due date so the most urgent work sits at the top.
 *
 * The view's own filter set, verified live:
 *   businessUnit IS TECHNOLOGY
 *   pricingComplete IS NO
 *   closeDate IS_AFTER 2025-12-31
 *   bidStatus IS_NOT LOST / NO_BID / NO_OPPORTUNITY_STATUS
 */

export const EXCLUDED_STATUSES = ["LOST", "NO_BID", "NO_OPPORTUNITY_STATUS"] as const;

export type PricingDealInput = {
  id: string;
  name: string;
  account: string | null;
  proposalStage: string | null;
  bidStatus: string | null;
  proposalDueDate: string | null;
  pricingComplete: string | null;
  assignedEstimator: string | null;
  owner: string | null;
  awardDate: string | null;
  completionDate: string | null;
  businessUnit: string | null;
  manufacturer: string | null;
  league: string | null;
  revenue: number | null;
  margin: number | null;
};

export type UrgencyBucket = "overdue" | "this_week" | "later" | "undated";

export type PricingDealRow = PricingDealInput & {
  bucket: UrgencyBucket;
  daysUntilDue: number | null;
};

export type PricingPriorityReport = {
  generatedAt: string;
  rows: PricingDealRow[];
  buckets: { bucket: UrgencyBucket; label: string; rows: PricingDealRow[] }[];
  totals: { deals: number; revenue: number; margin: number };
  counts: Record<UrgencyBucket, number>;
};

export const BUCKET_LABELS: Record<UrgencyBucket, string> = {
  overdue: "Past due",
  this_week: "Due in the next 7 days",
  later: "Due later",
  undated: "No proposal due date",
};

export const BUCKET_ORDER: UrgencyBucket[] = ["overdue", "this_week", "later", "undated"];

const DAY = 24 * 60 * 60 * 1000;

/** Whole days from now to the due date; negative once it has passed. */
export function daysUntil(due: string | null, now: number): number | null {
  if (!due) return null;
  const t = Date.parse(due);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / DAY);
}

export function bucketFor(due: string | null, now: number): UrgencyBucket {
  const days = daysUntil(due, now);
  if (days === null) return "undated";
  if (days < 0) return "overdue";
  if (days <= 7) return "this_week";
  return "later";
}

export function buildPricingPriorityReport(
  deals: PricingDealInput[],
  options: { now?: number; generatedAt?: string } = {},
): PricingPriorityReport {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const now = options.now ?? Date.parse(generatedAt);

  const rows: PricingDealRow[] = deals.map((d) => ({
    ...d,
    bucket: bucketFor(d.proposalDueDate, now),
    daysUntilDue: daysUntil(d.proposalDueDate, now),
  }));

  // Due date ascending, undated last — matching the view's sort.
  rows.sort((a, b) => {
    const at = a.proposalDueDate ? Date.parse(a.proposalDueDate) : Infinity;
    const bt = b.proposalDueDate ? Date.parse(b.proposalDueDate) : Infinity;
    if (at !== bt) return at - bt;
    return (a.account || "").localeCompare(b.account || "");
  });

  const counts: Record<UrgencyBucket, number> = {
    overdue: 0, this_week: 0, later: 0, undated: 0,
  };
  for (const r of rows) counts[r.bucket] += 1;

  return {
    generatedAt,
    rows,
    buckets: BUCKET_ORDER.map((bucket) => ({
      bucket,
      label: BUCKET_LABELS[bucket],
      rows: rows.filter((r) => r.bucket === bucket),
    })).filter((g) => g.rows.length > 0),
    totals: {
      deals: rows.length,
      revenue: rows.reduce((s, r) => s + (r.revenue || 0), 0),
      margin: rows.reduce((s, r) => s + (r.margin || 0), 0),
    },
    counts,
  };
}
