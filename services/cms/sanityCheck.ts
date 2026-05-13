/**
 * CMS quote sanity check — cross-references the current proposal's CMS
 * grand subtotal against historical CMS / LiveSync deals already in the
 * CRM. Flags when the current quote falls outside the IQR by a meaningful
 * margin so the estimator can re-check before sending.
 *
 * Same shape of "pattern detection" the LED side runs against historical
 * rate cards.
 */

import { Pool } from "pg";

let twentyDbPool: Pool | null = null;
let workspaceSchemaCache: string | null = null;

function getTwentyDbPool() {
  if (!twentyDbPool) {
    const url = process.env.TWENTY_CORE_DATABASE_URL?.trim();
    if (!url) throw new Error("TWENTY_CORE_DATABASE_URL is not configured");
    twentyDbPool = new Pool({ connectionString: url });
  }
  return twentyDbPool;
}

async function getWorkspaceSchema(): Promise<string> {
  if (workspaceSchemaCache) return workspaceSchemaCache;
  const result = await getTwentyDbPool().query<{ databaseSchema: string }>(
    `select "databaseSchema" from core.workspace where "deletedAt" is null and "databaseSchema" is not null order by "createdAt" asc limit 1`
  );
  const schema = result.rows[0]?.databaseSchema;
  if (!schema || !/^workspace_[a-z0-9_]+$/i.test(schema)) {
    throw new Error("Could not resolve Twenty workspace database schema");
  }
  workspaceSchemaCache = schema;
  return schema;
}

export interface SanityCheckInput {
  quoteAmount: number; // Current CMS grandSubtotal in USD
  clientName?: string | null; // Optional: narrow to deals on this client
}

export interface SanityCheckResult {
  comparableCount: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  verdict: "OK" | "BELOW_BAND" | "ABOVE_BAND" | "NO_DATA";
  message: string;
  sampleDeals: Array<{ id: string; name: string; amount: number }>;
}

const OUTLIER_TOLERANCE = 0.25; // 25% outside IQR band triggers flag

export async function runCmsSanityCheck(input: SanityCheckInput): Promise<SanityCheckResult> {
  const schema = await getWorkspaceSchema();
  const pool = getTwentyDbPool();

  // Pull CMS/LiveSync opportunities with positive amounts.
  const sql = `
    SELECT
      id,
      name,
      ("amountAmountMicros"::bigint) / 1000000.0 AS amount_usd
    FROM ${schema}.opportunity
    WHERE "deletedAt" IS NULL
      AND "amountAmountMicros" IS NOT NULL
      AND ("amountAmountMicros"::bigint) > 0
      AND (name ILIKE '%LiveSync%' OR name ILIKE '%CMS%' OR name ILIKE '%Control System%')
    ORDER BY amount_usd ASC
  `;
  const { rows } = await pool.query<{ id: string; name: string; amount_usd: string }>(sql);
  const amounts = rows.map((r) => Number(r.amount_usd));

  if (amounts.length === 0) {
    return {
      comparableCount: 0,
      median: null,
      p25: null,
      p75: null,
      min: null,
      max: null,
      verdict: "NO_DATA",
      message: "No comparable CMS deals found in the CRM yet.",
      sampleDeals: [],
    };
  }

  const median = percentile(amounts, 0.5);
  const p25 = percentile(amounts, 0.25);
  const p75 = percentile(amounts, 0.75);
  const min = amounts[0];
  const max = amounts[amounts.length - 1];

  const sampleDeals = rows
    .slice(0, 5)
    .concat(rows.slice(-5))
    .map((r) => ({ id: r.id, name: r.name, amount: Number(r.amount_usd) }));

  // Compare current quote.
  const lowerBand = p25 * (1 - OUTLIER_TOLERANCE);
  const upperBand = p75 * (1 + OUTLIER_TOLERANCE);
  let verdict: SanityCheckResult["verdict"] = "OK";
  let message = `Quote of $${fmt(input.quoteAmount)} sits inside the typical CMS deal band ($${fmt(p25)}–$${fmt(p75)}, n=${amounts.length}).`;
  if (input.quoteAmount < lowerBand) {
    verdict = "BELOW_BAND";
    message = `Quote of $${fmt(input.quoteAmount)} is ${pct((p25 - input.quoteAmount) / p25)} below the 25th percentile of comparable CMS deals ($${fmt(p25)}, n=${amounts.length}). Worth re-checking that soft-cost lines are filled in.`;
  } else if (input.quoteAmount > upperBand) {
    verdict = "ABOVE_BAND";
    message = `Quote of $${fmt(input.quoteAmount)} is ${pct((input.quoteAmount - p75) / p75)} above the 75th percentile of comparable CMS deals ($${fmt(p75)}, n=${amounts.length}). Worth re-checking quantities and tier selection.`;
  }

  return {
    comparableCount: amounts.length,
    median,
    p25,
    p75,
    min,
    max,
    verdict,
    message,
    sampleDeals,
  };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}
