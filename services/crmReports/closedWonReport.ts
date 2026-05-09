import { Pool } from "pg";

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const DASHBOARD_URL =
  "https://crm.ancsports.net/object/dashboard/e6459a59-3e4e-4810-a34a-5ef15142e69d";

const PIPELINE_BID_STATUSES = [
  "VERBAL_AGREEMENT",
  "PROSPECTING",
  "RFP_RECEIVED",
  "SCOPING",
  "BID_SUBMITTED",
  "SHORTLISTED",
] as const;

const NON_WON_BID_STATUSES = [
  ...PIPELINE_BID_STATUSES,
  "LOST",
  "NO_BID",
] as const;

type ConnectedEmailAccount = {
  id: string;
  handle: string | null;
  provider: string;
  authFailedAt: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

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
    `select "databaseSchema" from core.workspace where "deletedAt" is null and "databaseSchema" is not null order by "createdAt" asc limit 1`,
  );
  const schema = result.rows[0]?.databaseSchema;
  if (!schema || !/^workspace_[a-z0-9_]+$/i.test(schema)) {
    throw new Error("Could not resolve Twenty workspace database schema");
  }
  workspaceSchemaCache = schema;
  return schema;
}

export type ClosedWonReportPeriod = "last7" | "monthToDate";

export type ClosedWonReportRow = {
  id: string;
  opportunityNumber: string;
  owner: string;
  department: string;
  accountName: string;
  opportunityName: string;
  bidStatus: string;
  revenue: number;
  costs: number;
  margin: number;
  totalProjectRevenue: number;
  totalProjectMargin: number;
  substantialCompletionDate: string | null;
  awardDate: string | null;
  createdDate: string | null;
  statusUpdate: string;
};

type ReportTotals = {
  records: number;
  revenue: number;
  costs: number;
  margin: number;
};

type DepartmentGroup = {
  department: string;
  rows: ClosedWonReportRow[];
  totals: ReportTotals;
};

type SectionData = {
  rows: ClosedWonReportRow[];
  totals: ReportTotals;
  departmentGroups: DepartmentGroup[];
};

export type RevertedFromWonRow = {
  id: string;
  opportunityNumber: string;
  owner: string;
  department: string;
  accountName: string;
  opportunityName: string;
  currentBidStatus: string;
  flippedToWonAt: string | null;
  revertedAt: string;
  revertedTo: string;
  totalProjectRevenue: number;
};

export type ClosedWonReport = {
  period: ClosedWonReportPeriod;
  title: string;
  subtitle: string;
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  fyYear: number;
  dashboardUrl: string;
  won2026: SectionData;
  recent: SectionData & {
    title: string;
    rangeStart: string;
    rangeEnd: string;
  };
  revertedFromWon: RevertedFromWonRow[];
};

let reportEmailAccountPool: Pool | null = null;

function getReportEmailAccountPool() {
  if (!reportEmailAccountPool) {
    const url = process.env.TWENTY_CORE_DATABASE_URL?.trim();
    if (!url) throw new Error("TWENTY_CORE_DATABASE_URL is not configured");
    reportEmailAccountPool = new Pool({ connectionString: url });
  }
  return reportEmailAccountPool;
}

async function getReportEmailAccount() {
  const handle = process.env.CRM_REPORT_MICROSOFT_HANDLE?.trim() || "support@anc.com";
  const accountId = process.env.CRM_REPORT_MICROSOFT_CONNECTED_ACCOUNT_ID?.trim();
  const result = await getReportEmailAccountPool().query<ConnectedEmailAccount>(
    `
      select id, handle, provider, "authFailedAt", "accessToken", "refreshToken"
      from core."connectedAccount"
      where ${accountId ? `id = $1` : `lower(handle) = lower($1) and provider = 'microsoft'`}
        and "accessToken" is not null
        and "refreshToken" is not null
      order by "lastCredentialsRefreshedAt" desc nulls last, "updatedAt" desc
      limit 1
    `,
    [accountId || handle],
  );

  const account = result.rows[0];
  if (!account) throw new Error(`No connected Microsoft report mailbox found for ${handle}`);
  if (account.authFailedAt) throw new Error(`CRM email account ${account.handle} has an auth failure`);
  if (!account.accessToken || !account.refreshToken) throw new Error(`CRM email account ${account.handle} is missing Microsoft tokens`);
  return account;
}

async function refreshMicrosoftAccountToken(account: ConnectedEmailAccount) {
  const clientId =
    process.env.CRM_MICROSOFT_CLIENT_ID?.trim() ||
    process.env.AUTH_MICROSOFT_CLIENT_ID?.trim();
  const clientSecret =
    process.env.CRM_MICROSOFT_CLIENT_SECRET?.trim() ||
    process.env.AUTH_MICROSOFT_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret || !account.refreshToken) {
    throw new Error("Microsoft token refresh is not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
    scope: "offline_access Mail.Send Mail.Read Mail.ReadWrite User.Read email openid profile",
  });

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await res.json().catch(() => ({}));
  if (!res.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || `Microsoft token refresh ${res.status}`);
  }

  const accessToken = String(token.access_token);
  const refreshToken = token.refresh_token ? String(token.refresh_token) : account.refreshToken;
  await getReportEmailAccountPool().query(
    `
      update core."connectedAccount"
      set "accessToken" = $1,
          "refreshToken" = $2,
          "lastCredentialsRefreshedAt" = now(),
          "updatedAt" = now()
      where id = $3
    `,
    [accessToken, refreshToken, account.id],
  );

  return { ...account, accessToken, refreshToken };
}

async function sendMicrosoftGraphMail(account: ConnectedEmailAccount, subject: string, html: string, recipients: string[]) {
  const send = (accessToken: string) =>
    fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    });

  let res = await send(account.accessToken || "");
  if (res.status === 401 || res.status === 403) {
    account = await refreshMicrosoftAccountToken(account);
    res = await send(account.accessToken || "");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Microsoft Graph sendMail ${res.status}`);
  }

  return {
    id: `${account.handle || account.id}:${Date.now()}`,
    provider: "microsoft-graph",
    from: account.handle || "support@anc.com",
  };
}

function microsToDollars(value: string | number | null | undefined) {
  return Number(value || 0) / 1_000_000;
}

function ownerName(opp: { accountExecutive: string | null; ownerFirstName: string | null; ownerLastName: string | null }) {
  const accountExecutive = opp.accountExecutive?.trim();
  if (accountExecutive) return accountExecutive;
  const fullName = `${opp.ownerFirstName?.trim() || ""} ${opp.ownerLastName?.trim() || ""}`.trim();
  return fullName || "Unassigned";
}

function departmentLabel(value: string | null) {
  switch (value) {
    case "TECHNOLOGY":
      return "Technology";
    case "VENUE_SERVICES":
      return "Service";
    case "MEDIA_SPONSORSHIP":
      return "Media/Sponsorship";
    default:
      return value || "-";
  }
}

function toDateOnly(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatShortDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}

function periodRange(period: ClosedWonReportPeriod, now = new Date()) {
  const end = now;
  if (period === "monthToDate") {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)),
      end,
      title: "Closed-Won Activity Month-to-Date",
    };
  }
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);
  start.setUTCHours(0, 0, 0, 0);
  return {
    start,
    end,
    title: "Closed-Won Activity Last 7 Days",
  };
}

function isInRange(value: string | null, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

const DEPARTMENT_ORDER = ["Technology", "Service", "Media/Sponsorship"];

function compareDepartments(a: string, b: string) {
  const ai = DEPARTMENT_ORDER.indexOf(a);
  const bi = DEPARTMENT_ORDER.indexOf(b);
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
}

type OpportunityDbRow = {
  id: string;
  name: string | null;
  opportunityNumber: string | null;
  bidStatus: string | null;
  businessUnit: string | null;
  closeDate: string | null;
  createdAt: string | null;
  substantialCompletionDate: string | null;
  accountExecutive: string | null;
  accountExecutiveEmail: string | null;
  winLossReason: string | null;
  revenue2026AmountMicros: string | null;
  margin2026AmountMicros: string | null;
  totalProjectRevenueAmountMicros: string | null;
  totalProjectMarginAmountMicros: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  companyName: string | null;
};

function buildOpportunityQuery(schema: string, whereClause: string) {
  return `
    select
      o.id,
      o.name,
      o."opportunityNumber",
      o."bidStatus",
      o."businessUnit",
      o."closeDate",
      o."createdAt",
      o."substantialCompletionDate",
      o."accountExecutive",
      o."accountExecutiveEmail",
      o."winLossReason",
      o."revenue2026AmountMicros",
      o."margin2026AmountMicros",
      o."totalProjectRevenueAmountMicros",
      o."totalProjectMarginAmountMicros",
      wm."nameFirstName" as "ownerFirstName",
      wm."nameLastName" as "ownerLastName",
      c.name as "companyName"
    from "${schema}".opportunity o
    left join "${schema}"."workspaceMember" wm on wm.id = o."ownerId"
    left join "${schema}".company c on c.id = o."companyId"
    where o."deletedAt" is null
      and ${whereClause}
  `;
}

async function fetchWon2026Opportunities(): Promise<OpportunityDbRow[]> {
  const schema = await getWorkspaceSchema();
  const query = buildOpportunityQuery(
    schema,
    `o."bidStatus" is not null
       and o."bidStatus" not in (${NON_WON_BID_STATUSES.map((_, i) => `$${i + 1}`).join(",")})
       and (o."revenue2026AmountMicros" is not null and o."revenue2026AmountMicros" <> 0
         or o."margin2026AmountMicros" is not null and o."margin2026AmountMicros" <> 0)`,
  );
  const result = await getTwentyDbPool().query<OpportunityDbRow>(query, [...NON_WON_BID_STATUSES]);
  return result.rows;
}

type RevertedDbRow = OpportunityDbRow & {
  flippedToWonAt: string | null;
  revertedAt: string;
  revertedTo: string;
};

async function fetchRevertedFromWonOpportunities(start: Date, end: Date): Promise<RevertedDbRow[]> {
  const schema = await getWorkspaceSchema();
  const query = `
    with reverted as (
      select distinct on (t."targetOpportunityId")
        t."targetOpportunityId" as opp_id,
        t."happensAt" as reverted_at,
        t.properties->'diff'->'bidStatus'->>'after' as reverted_to
      from "${schema}"."timelineActivity" t
      where t."happensAt" >= $1::timestamptz
        and t."happensAt" <= $2::timestamptz
        and t.name = 'opportunity.updated'
        and t.properties->'diff'->'bidStatus'->>'before' = 'WON'
        and t.properties->'diff'->'bidStatus'->>'after' is not null
        and t.properties->'diff'->'bidStatus'->>'after' <> 'WON'
      order by t."targetOpportunityId", t."happensAt" desc
    ),
    flipped_to_won as (
      select distinct on (t."targetOpportunityId")
        t."targetOpportunityId" as opp_id,
        t."happensAt" as flipped_at
      from "${schema}"."timelineActivity" t
      where t."happensAt" >= $1::timestamptz
        and t."happensAt" <= $2::timestamptz
        and t.name = 'opportunity.updated'
        and t.properties->'diff'->'bidStatus'->>'after' = 'WON'
      order by t."targetOpportunityId", t."happensAt" desc
    )
    select
      o.id,
      o.name,
      o."opportunityNumber",
      o."bidStatus",
      o."businessUnit",
      o."closeDate",
      o."createdAt",
      o."substantialCompletionDate",
      o."accountExecutive",
      o."accountExecutiveEmail",
      o."winLossReason",
      o."revenue2026AmountMicros",
      o."margin2026AmountMicros",
      o."totalProjectRevenueAmountMicros",
      o."totalProjectMarginAmountMicros",
      wm."nameFirstName" as "ownerFirstName",
      wm."nameLastName" as "ownerLastName",
      c.name as "companyName",
      f.flipped_at as "flippedToWonAt",
      r.reverted_at as "revertedAt",
      r.reverted_to as "revertedTo"
    from reverted r
    join "${schema}".opportunity o on o.id = r.opp_id and o."deletedAt" is null
    left join "${schema}"."workspaceMember" wm on wm.id = o."ownerId"
    left join "${schema}".company c on c.id = o."companyId"
    left join flipped_to_won f on f.opp_id = r.opp_id
    where o."bidStatus" <> 'WON'
    order by r.reverted_at desc
  `;
  const result = await getTwentyDbPool().query<RevertedDbRow>(query, [start.toISOString(), end.toISOString()]);
  return result.rows;
}

function toRevertedRow(opp: RevertedDbRow): RevertedFromWonRow {
  return {
    id: opp.id,
    opportunityNumber: opp.opportunityNumber?.trim() || "",
    owner: ownerName(opp),
    department: departmentLabel(opp.businessUnit),
    accountName: opp.companyName || "-",
    opportunityName: opp.name || "-",
    currentBidStatus: opp.bidStatus || "-",
    flippedToWonAt: opp.flippedToWonAt,
    revertedAt: opp.revertedAt,
    revertedTo: opp.revertedTo,
    totalProjectRevenue: microsToDollars(opp.totalProjectRevenueAmountMicros),
  };
}

async function fetchRecentClosedWonOpportunities(start: Date, end: Date): Promise<OpportunityDbRow[]> {
  const schema = await getWorkspaceSchema();
  const query = buildOpportunityQuery(
    schema,
    `o."bidStatus" = 'WON'
       and (
         (o."closeDate" is not null and o."closeDate" >= $1::timestamptz and o."closeDate" <= $2::timestamptz)
         or
         (o."createdAt" >= $1::timestamptz and o."createdAt" <= $2::timestamptz)
         or
         exists (
           select 1 from "${schema}"."timelineActivity" t
           where t."targetOpportunityId" = o.id
             and t."happensAt" >= $1::timestamptz
             and t."happensAt" <= $2::timestamptz
             and t.name = 'opportunity.updated'
             and t.properties->'diff'->'bidStatus'->>'after' = 'WON'
         )
       )`,
  );
  const result = await getTwentyDbPool().query<OpportunityDbRow>(query, [start.toISOString(), end.toISOString()]);
  return result.rows;
}

function toReportRow(opp: OpportunityDbRow): ClosedWonReportRow {
  const revenue = microsToDollars(opp.revenue2026AmountMicros);
  const margin = microsToDollars(opp.margin2026AmountMicros);
  const costs = revenue - margin;

  return {
    id: opp.id,
    opportunityNumber: opp.opportunityNumber?.trim() || "",
    owner: ownerName(opp),
    department: departmentLabel(opp.businessUnit),
    accountName: opp.companyName || "-",
    opportunityName: opp.name || "-",
    bidStatus: opp.bidStatus || "-",
    revenue,
    costs,
    margin,
    totalProjectRevenue: microsToDollars(opp.totalProjectRevenueAmountMicros),
    totalProjectMargin: microsToDollars(opp.totalProjectMarginAmountMicros),
    substantialCompletionDate: toDateOnly(opp.substantialCompletionDate),
    awardDate: toDateOnly(opp.closeDate),
    createdDate: toDateOnly(opp.createdAt),
    statusUpdate: opp.winLossReason?.trim() || "-",
  };
}

function sumRows(rows: ClosedWonReportRow[]): ReportTotals {
  return rows.reduce(
    (totals, row) => ({
      records: totals.records + 1,
      revenue: totals.revenue + row.revenue,
      costs: totals.costs + row.costs,
      margin: totals.margin + row.margin,
    }),
    { records: 0, revenue: 0, costs: 0, margin: 0 },
  );
}

function buildSection(rows: ClosedWonReportRow[]): SectionData {
  const sorted = [...rows].sort((a, b) => {
    const deptCompare = compareDepartments(a.department, b.department);
    if (deptCompare !== 0) return deptCompare;
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return (b.awardDate || "").localeCompare(a.awardDate || "");
  });

  const totals = sumRows(sorted);
  const groups = new Map<string, ClosedWonReportRow[]>();
  for (const row of sorted) {
    groups.set(row.department, [...(groups.get(row.department) || []), row]);
  }
  const departmentGroups = Array.from(groups.entries())
    .map(([department, groupRows]) => ({
      department,
      rows: groupRows,
      totals: sumRows(groupRows),
    }))
    .sort((a, b) => compareDepartments(a.department, b.department));

  return { rows: sorted, totals, departmentGroups };
}

export async function buildClosedWonReport(period: ClosedWonReportPeriod = "last7"): Promise<ClosedWonReport> {
  const generatedAt = new Date().toISOString();
  const now = new Date(generatedAt);
  const fyYear = now.getUTCFullYear();
  const { start, end, title: recentTitle } = periodRange(period, now);

  const [wonRaw, recentRaw, revertedRaw] = await Promise.all([
    fetchWon2026Opportunities(),
    fetchRecentClosedWonOpportunities(start, end),
    fetchRevertedFromWonOpportunities(start, end),
  ]);

  const wonRows = wonRaw.map(toReportRow);
  const recentRows = recentRaw.map(toReportRow);
  const revertedFromWon = revertedRaw.map(toRevertedRow);

  const periodLabel = period === "monthToDate" ? "Month-to-Date" : "Last 7 Days";
  const title = `${fyYear} Closed Won by Business Unit — ${periodLabel}`;
  const subtitle = `Mirrors the Closed Won widgets on the CRM dashboard "${fyYear} Won & Forecast by Business Unit". Numbers reflect ${fyYear} revenue/margin splits per opportunity.`;

  return {
    period,
    title,
    subtitle,
    generatedAt,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    fyYear,
    dashboardUrl: DASHBOARD_URL,
    won2026: buildSection(wonRows),
    recent: {
      title: recentTitle,
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      ...buildSection(recentRows),
    },
    revertedFromWon,
  };
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function summaryCell(label: string, value: string, accent: string) {
  return `
    <td style="padding:10px 14px;border:1px solid #d7dce2;background:${accent};">
      <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.03em;">${esc(label)}</div>
      <div style="font-size:18px;font-weight:700;color:#111827;margin-top:4px;">${esc(value)}</div>
    </td>
  `;
}

const OPPORTUNITY_URL_BASE = "https://crm.ancsports.net/object/opportunity";

const SECTION_COLUMNS = [
  "Opp #",
  "Account Name",
  "Opportunity Name",
  "Account Executive",
  "Bid Status",
  "Revenue (year)",
  "Costs (year)",
  "Margin (year)",
  "Total Project Revenue",
  "Total Project Margin",
  "Award Date",
  "Created Date",
  "Status Update",
];
const SECTION_COLUMN_COUNT = SECTION_COLUMNS.length;

function dataRow(row: ClosedWonReportRow, year: number) {
  const oppLink = `${OPPORTUNITY_URL_BASE}/${esc(row.id)}`;
  return `
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${esc(row.opportunityNumber || "-")}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(row.accountName)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;"><a href="${oppLink}" style="color:#2563eb;text-decoration:none;">${esc(row.opportunityName)}</a></td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(row.owner)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(row.bidStatus)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${esc(formatCurrency(row.revenue))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${esc(formatCurrency(row.costs))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${esc(formatCurrency(row.margin))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;color:#475569;">${esc(formatCurrency(row.totalProjectRevenue))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;color:#475569;">${esc(formatCurrency(row.totalProjectMargin))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(formatShortDate(row.awardDate))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(formatShortDate(row.createdDate))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(row.statusUpdate)}</td>
    </tr>
  `;
}

function subtotalRow(label: string, totals: ReportTotals) {
  return `
    <tr>
      <td colspan="5" style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;font-weight:700;">${esc(label)}</td>
      <td style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;text-align:right;font-weight:700;">${esc(formatCurrency(totals.revenue))}</td>
      <td style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;text-align:right;font-weight:700;">${esc(formatCurrency(totals.costs))}</td>
      <td style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;text-align:right;font-weight:700;">${esc(formatCurrency(totals.margin))}</td>
      <td colspan="5" style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;"></td>
    </tr>
  `;
}

function sectionTable(year: number, label: string, accent: string, section: SectionData, emptyMessage: string) {
  const headerCells = SECTION_COLUMNS.map((columnLabel) => {
    const display = columnLabel.replace("(year)", `(${year})`);
    return `<th style="padding:8px;border:1px solid #d1d5db;background:#e2e8f0;text-align:left;font-weight:700;">${esc(display)}</th>`;
  }).join("");

  const groupsHtml = section.departmentGroups.length
    ? section.departmentGroups
        .map(
          (group) => `
            <tr>
              <td colspan="${SECTION_COLUMN_COUNT}" style="padding:10px 8px;border:1px solid #cbd5e1;background:${accent};font-weight:700;">
                ${esc(group.department)} (${group.totals.records} ${group.totals.records === 1 ? "deal" : "deals"})
              </td>
            </tr>
            ${group.rows.map((row) => dataRow(row, year)).join("")}
            ${subtotalRow(`${group.department} subtotal`, group.totals)}
          `,
        )
        .join("")
    : `
        <tr>
          <td colspan="${SECTION_COLUMN_COUNT}" style="padding:18px;border:1px solid #e5e7eb;text-align:center;color:#64748b;">${esc(emptyMessage)}</td>
        </tr>
      `;

  return `
    <div style="margin-bottom:24px;">
      <div style="font-size:14px;font-weight:700;color:#111827;margin:0 0 10px 0;">${esc(label)}</div>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>
          ${groupsHtml}
          ${section.departmentGroups.length ? subtotalRow(`Grand total (${section.totals.records} ${section.totals.records === 1 ? "deal" : "deals"})`, section.totals) : ""}
        </tbody>
      </table>
    </div>
  `;
}

function summaryByBusinessUnit(year: number, label: string, accent: string, section: SectionData) {
  const headerCells = `
    <th style="padding:8px;border:1px solid #c7d2fe;background:${accent};text-align:left;font-weight:700;">Business Unit</th>
    <th style="padding:8px;border:1px solid #c7d2fe;background:${accent};text-align:right;font-weight:700;">Deals</th>
    <th style="padding:8px;border:1px solid #c7d2fe;background:${accent};text-align:right;font-weight:700;">${year} Revenue</th>
    <th style="padding:8px;border:1px solid #c7d2fe;background:${accent};text-align:right;font-weight:700;">${year} Margin</th>
  `;
  const departmentRows = section.departmentGroups
    .map(
      (entry) => `
        <tr>
          <td style="padding:8px;border:1px solid #e0e7ff;">${esc(entry.department)}</td>
          <td style="padding:8px;border:1px solid #e0e7ff;text-align:right;">${entry.totals.records}</td>
          <td style="padding:8px;border:1px solid #e0e7ff;text-align:right;">${esc(formatCurrency(entry.totals.revenue))}</td>
          <td style="padding:8px;border:1px solid #e0e7ff;text-align:right;">${esc(formatCurrency(entry.totals.margin))}</td>
        </tr>
      `,
    )
    .join("") ||
    `<tr><td colspan="4" style="padding:12px;border:1px solid #e0e7ff;text-align:center;color:#64748b;">No deals match this section.</td></tr>`;

  return `
    <div style="margin-bottom:18px;">
      <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:8px;">${esc(label)}</div>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>
          ${departmentRows}
          <tr>
            <td style="padding:8px;border:1px solid #c7d2fe;background:${accent};font-weight:700;">Total</td>
            <td style="padding:8px;border:1px solid #c7d2fe;background:${accent};text-align:right;font-weight:700;">${section.totals.records}</td>
            <td style="padding:8px;border:1px solid #c7d2fe;background:${accent};text-align:right;font-weight:700;">${esc(formatCurrency(section.totals.revenue))}</td>
            <td style="padding:8px;border:1px solid #c7d2fe;background:${accent};text-align:right;font-weight:700;">${esc(formatCurrency(section.totals.margin))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function revertedFromWonSection(rows: RevertedFromWonRow[]) {
  if (!rows.length) return "";

  const headerCells = [
    "Opp #",
    "Account",
    "Opportunity",
    "Account Executive",
    "Flipped to WON",
    "Reverted to",
    "Reverted at",
    "Total Project Revenue",
  ]
    .map(
      (label) =>
        `<th style="padding:8px;border:1px solid #fecaca;background:#fee2e2;text-align:left;font-weight:700;">${esc(label)}</th>`,
    )
    .join("");

  const dataRows = rows
    .map((row) => {
      const oppLink = `${OPPORTUNITY_URL_BASE}/${esc(row.id)}`;
      return `
        <tr>
          <td style="padding:8px;border:1px solid #fecaca;font-family:monospace;">${esc(row.opportunityNumber || "-")}</td>
          <td style="padding:8px;border:1px solid #fecaca;">${esc(row.accountName)}</td>
          <td style="padding:8px;border:1px solid #fecaca;"><a href="${oppLink}" style="color:#2563eb;text-decoration:none;">${esc(row.opportunityName)}</a></td>
          <td style="padding:8px;border:1px solid #fecaca;">${esc(row.owner)}</td>
          <td style="padding:8px;border:1px solid #fecaca;">${esc(formatShortDate(row.flippedToWonAt))}</td>
          <td style="padding:8px;border:1px solid #fecaca;">${esc(row.revertedTo)}</td>
          <td style="padding:8px;border:1px solid #fecaca;">${esc(formatShortDate(row.revertedAt))}</td>
          <td style="padding:8px;border:1px solid #fecaca;text-align:right;">${esc(formatCurrency(row.totalProjectRevenue))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="margin-bottom:24px;">
      <div style="font-size:14px;font-weight:700;color:#991b1b;margin:0 0 6px 0;">Reverted from WON during the window (${rows.length})</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:10px;">These opportunities flipped to WON inside the window (which fired the Slack big-win alert) and then got reverted. They are excluded from the Closed Won totals above because their current bid status is no longer WON.</div>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${dataRows}</tbody>
      </table>
    </div>
  `;
}

export function renderClosedWonReportHtml(report: ClosedWonReport) {
  const year = report.fyYear;

  const wonAccent = "#eef2ff";
  const recentAccent = "#ecfdf5";

  const summaryRow = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
      <tr>
        ${summaryCell(`Closed Won ${year} deals`, String(report.won2026.totals.records), wonAccent)}
        ${summaryCell(`Closed Won ${year} revenue`, formatCurrency(report.won2026.totals.revenue), wonAccent)}
        ${summaryCell(`Closed Won ${year} margin`, formatCurrency(report.won2026.totals.margin), wonAccent)}
      </tr>
    </table>
  `;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:1180px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #d7dce2;border-radius:8px;overflow:hidden;">
        <div style="padding:22px 24px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:22px;font-weight:700;">${esc(report.title)}</div>
          <div style="font-size:13px;color:#475569;margin-top:6px;">As of ${esc(formatGeneratedAt(report.generatedAt))} · CRM scheduled report</div>
          <div style="font-size:12px;color:#64748b;margin-top:8px;">${esc(report.subtitle)} <a href="${esc(report.dashboardUrl)}" style="color:#2563eb;text-decoration:none;">Open dashboard</a>.</div>
        </div>

        <div style="padding:18px 24px;">
          ${summaryRow}

          ${summaryByBusinessUnit(year, `${year} Closed Won by Business Unit`, wonAccent, report.won2026)}

          ${sectionTable(year, `${esc(report.recent.title)} — closed-won activity (${report.recent.totals.records})`, recentAccent, report.recent, "No closed-won activity in this window.")}

          ${revertedFromWonSection(report.revertedFromWon)}

          <div style="font-size:11px;color:#64748b;margin-top:18px;">
            Filter mirrors the CRM dashboard "${year} Won & Forecast by Business Unit" Closed Won widgets: bid status not in (verbal agreement, prospecting, RFP received, scoping, bid submitted, shortlisted, lost, no bid) with non-zero ${year} revenue or margin. Activity table = currently WON opportunities where the bid status flipped to WON in the period window, or the deal was created or its award date set in the period window. The "Reverted from WON" section lists opportunities that flipped to WON in the window and then got moved back out — these correspond to Slack big-win alerts that no longer represent a current win. Opportunity name links open the deal in the CRM.
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function getDefaultClosedWonRecipients() {
  return (process.env.CRM_CLOSED_WON_REPORT_RECIPIENTS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function sendClosedWonReportEmail(input: {
  report: ClosedWonReport;
  html: string;
  recipients: string[];
}) {
  if (!input.recipients.length) throw new Error("No report recipients configured");

  const periodLabel = input.report.period === "monthToDate" ? "Month-to-Date" : "Last 7 Days";
  const subject = `Report results (${input.report.fyYear} Closed Won by Business Unit — ${periodLabel})`;

  const account = await getReportEmailAccount();
  return sendMicrosoftGraphMail(account, subject, input.html, input.recipients);
}
