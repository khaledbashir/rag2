import { Pool } from "pg";
import { resolveAncWorkspaceSchema } from "@/services/twenty/workspaceSchema";

let twentyDbPool: Pool | null = null;

export type ForecastExportScope = "all" | "forecast";

type ForecastExportRow = {
  opportunityName: string | null;
  companyName: string | null;
  opportunityOwner: string | null;
  businessUnit: string | null;
  opportunityStatus: string | null;
  awardDate: string | null;
  contractCompletionDate: string | null;
  totalProjectRevenue: string | null;
  totalProjectMargin: string | null;
  revenueFy2026: string | null;
  marginFy2026: string | null;
  revenueFy2027: string | null;
  marginFy2027: string | null;
  opportunityNumber: string | null;
  lastUpdate: string | null;
};

const HEADERS = [
  "Opportunity Name",
  "Company",
  "Opportunity Owner",
  "Business Unit",
  "Opportunity Status",
  "Award Date",
  "Contract Completion Date",
  "Total Project Revenue / Amount",
  "Total Project Margin / Amount",
  "Revenue FY2026 / Amount",
  "Margin FY2026 / Amount",
  "Revenue FY2027 / Amount",
  "Margin FY2027 / Amount",
  "Opportunity Number",
  "Last Update",
];

function getTwentyDbPool() {
  if (!twentyDbPool) {
    const url = process.env.TWENTY_CORE_DATABASE_URL?.trim();
    if (!url) throw new Error("TWENTY_CORE_DATABASE_URL is not configured");
    twentyDbPool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
  }
  return twentyDbPool;
}

async function getWorkspaceSchema(): Promise<string> {
  return resolveAncWorkspaceSchema(getTwentyDbPool());
}

function centsFromMicros(value: string | number | null) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value) / 1_000_000;
}

function formatMoney(value: string | number | null) {
  const amount = centsFromMicros(value);
  if (!Number.isFinite(amount) || amount === 0) return "$-";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: ForecastExportRow[]) {
  const body = rows.map((row) => [
    row.opportunityName,
    row.companyName,
    row.opportunityOwner,
    row.businessUnit,
    row.opportunityStatus,
    row.awardDate,
    row.contractCompletionDate,
    row.totalProjectRevenue,
    row.totalProjectMargin,
    row.revenueFy2026,
    row.marginFy2026,
    row.revenueFy2027,
    row.marginFy2027,
    row.opportunityNumber,
    row.lastUpdate,
  ]);

  return [HEADERS, ...body].map((line) => line.map(csvCell).join(",")).join("\n") + "\n";
}

export async function buildForecastExportCsv(scope: ForecastExportScope = "all") {
  const schema = await getWorkspaceSchema();
  const scopeClause = scope === "forecast"
    ? `and (
        coalesce(o."totalProjectRevenueAmountMicros", 0) <> 0
        or coalesce(o."totalProjectMarginAmountMicros", 0) <> 0
        or coalesce(o."revenue2026AmountMicros", 0) <> 0
        or coalesce(o."margin2026AmountMicros", 0) <> 0
        or coalesce(o."revenue2027AmountMicros", 0) <> 0
        or coalesce(o."margin2027AmountMicros", 0) <> 0
      )`
    : "";

  const result = await getTwentyDbPool().query<{
    name: string | null;
    companyName: string | null;
    ownerFirstName: string | null;
    ownerLastName: string | null;
    ownerEmail: string | null;
    businessUnit: string | null;
    bidStatus: string | null;
    closeDate: string | null;
    contractEndDate: string | null;
    totalProjectRevenueAmountMicros: string | null;
    totalProjectMarginAmountMicros: string | null;
    revenue2026AmountMicros: string | null;
    margin2026AmountMicros: string | null;
    revenue2027AmountMicros: string | null;
    margin2027AmountMicros: string | null;
    opportunityNumber: string | null;
    updatedAt: string | null;
  }>(
    `
      select
        o.name,
        c.name as "companyName",
        wm."nameFirstName" as "ownerFirstName",
        wm."nameLastName" as "ownerLastName",
        wm."userEmail" as "ownerEmail",
        o."businessUnit",
        o."bidStatus",
        o."closeDate",
        o."contractEndDate",
        o."totalProjectRevenueAmountMicros",
        o."totalProjectMarginAmountMicros",
        o."revenue2026AmountMicros",
        o."margin2026AmountMicros",
        o."revenue2027AmountMicros",
        o."margin2027AmountMicros",
        o."opportunityNumber",
        o."updatedAt"
      from "${schema}".opportunity o
      left join "${schema}".company c on c.id = o."companyId"
      left join "${schema}"."workspaceMember" wm on wm.id = o."ownerId"
      where o."deletedAt" is null
        and nullif(trim(coalesce(o.name, '')), '') is not null
        ${scopeClause}
      order by o."updatedAt" desc nulls last, o."opportunityNumber" desc nulls last
    `,
  );

  const rows: ForecastExportRow[] = result.rows.map((row) => {
    const owner = [row.ownerFirstName, row.ownerLastName].filter(Boolean).join(" ").trim() || row.ownerEmail || "";

    return {
      opportunityName: row.name || "",
      companyName: row.companyName || "",
      opportunityOwner: owner,
      businessUnit: row.businessUnit || "",
      opportunityStatus: row.bidStatus || "",
      awardDate: formatDate(row.closeDate),
      contractCompletionDate: formatDate(row.contractEndDate),
      totalProjectRevenue: formatMoney(row.totalProjectRevenueAmountMicros),
      totalProjectMargin: formatMoney(row.totalProjectMarginAmountMicros),
      revenueFy2026: formatMoney(row.revenue2026AmountMicros),
      marginFy2026: formatMoney(row.margin2026AmountMicros),
      revenueFy2027: formatMoney(row.revenue2027AmountMicros),
      marginFy2027: formatMoney(row.margin2027AmountMicros),
      opportunityNumber: row.opportunityNumber || "",
      lastUpdate: formatDate(row.updatedAt),
    };
  });

  return {
    csv: toCsv(rows),
    rowCount: rows.length,
    scope,
  };
}
