import { Pool } from "pg";

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";

type CurrencyValue = {
  amountMicros?: number | null;
  currencyCode?: string | null;
} | null;

type TwentyOpportunity = {
  id: string;
  name: string | null;
  bidStatus: string | null;
  stage: string | null;
  businessUnit: string | null;
  closeDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  substantialCompletionDate: string | null;
  accountExecutive: string | null;
  accountExecutiveEmail: string | null;
  winLossReason: string | null;
  totalProjectRevenue: CurrencyValue;
  totalProjectMargin: CurrencyValue;
  dealValue: CurrencyValue;
  salePrice: CurrencyValue;
  amount: CurrencyValue;
  margin: CurrencyValue;
  company: { id: string; name: string | null } | null;
  owner: {
    id: string;
    userEmail: string | null;
    name: { firstName?: string | null; lastName?: string | null } | null;
  } | null;
};

export type ClosedWonReportPeriod = "last7" | "monthToDate";

export type ClosedWonReportRow = {
  id: string;
  owner: string;
  department: string;
  accountName: string;
  opportunityName: string;
  revenue: number;
  costs: number;
  margin: number;
  substantialCompletionDate: string | null;
  awardDate: string | null;
  createdDate: string | null;
  statusUpdate: string;
};

export type ClosedWonReport = {
  period: ClosedWonReportPeriod;
  title: string;
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  rows: ClosedWonReportRow[];
  totals: {
    records: number;
    revenue: number;
    costs: number;
    margin: number;
  };
  ownerGroups: Array<{
    owner: string;
    rows: ClosedWonReportRow[];
    totals: {
      records: number;
      revenue: number;
      costs: number;
      margin: number;
    };
  }>;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type ClosedWonQueryData = {
  opportunities: {
    edges: Array<{ node: TwentyOpportunity }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type ConnectedEmailAccount = {
  id: string;
  handle: string | null;
  provider: string;
  authFailedAt: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

let reportEmailAccountPool: Pool | null = null;

function getTwentyApiKey() {
  const key = process.env.TWENTY_API_KEY?.trim();
  if (!key) {
    throw new Error("TWENTY_API_KEY is not configured");
  }
  return key;
}

async function twentyGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TWENTY_BASE}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getTwentyApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await res.json().catch(() => ({}))) as GraphqlResponse<T>;
  if (!res.ok || body.errors?.length) {
    const err = body.errors?.map((entry) => entry.message).filter(Boolean).join(", ");
    throw new Error(err || `Twenty GraphQL ${res.status}`);
  }
  if (!body.data) throw new Error("Twenty GraphQL returned no data");
  return body.data;
}

function getTwentyCoreDatabaseUrl() {
  const url = process.env.TWENTY_CORE_DATABASE_URL?.trim();
  if (!url) throw new Error("TWENTY_CORE_DATABASE_URL is not configured");
  return url;
}

function getReportEmailAccountPool() {
  if (!reportEmailAccountPool) {
    reportEmailAccountPool = new Pool({ connectionString: getTwentyCoreDatabaseUrl() });
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

function dollars(value: CurrencyValue) {
  return Number(value?.amountMicros || 0) / 1_000_000;
}

function firstNonZero(...values: number[]) {
  return values.find((value) => Number.isFinite(value) && value !== 0) || 0;
}

function ownerName(opp: TwentyOpportunity) {
  const accountExecutive = opp.accountExecutive?.trim();
  if (accountExecutive) return accountExecutive;

  const first = opp.owner?.name?.firstName?.trim() || "";
  const last = opp.owner?.name?.lastName?.trim() || "";
  const fullName = `${first} ${last}`.trim();
  return fullName || opp.owner?.userEmail || "Unassigned";
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
      title: "Opportunities Closed Won Month-to-Date",
    };
  }

  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);
  start.setUTCHours(0, 0, 0, 0);
  return {
    start,
    end,
    title: "Opportunities Closed Won Last 7 Days",
  };
}

function isInRange(value: string | null, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

async function fetchWonOpportunities() {
  const out: TwentyOpportunity[] = [];
  let after: string | null = null;

  while (true) {
    const data: ClosedWonQueryData = await twentyGraphql<ClosedWonQueryData>(
      `
        query ClosedWonOpps($after: String) {
          opportunities(filter: { bidStatus: { eq: WON } }, first: 100, after: $after) {
            edges {
              node {
                id
                name
                bidStatus
                stage
                businessUnit
                closeDate
                createdAt
                updatedAt
                substantialCompletionDate
                accountExecutive
                accountExecutiveEmail
                winLossReason
                totalProjectRevenue { amountMicros currencyCode }
                totalProjectMargin { amountMicros currencyCode }
                dealValue { amountMicros currencyCode }
                salePrice { amountMicros currencyCode }
                amount { amountMicros currencyCode }
                margin { amountMicros currencyCode }
                company { id name }
                owner { id userEmail name { firstName lastName } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { after },
    );

    out.push(...data.opportunities.edges.map((edge: { node: TwentyOpportunity }) => edge.node));
    if (!data.opportunities.pageInfo.hasNextPage) break;
    after = data.opportunities.pageInfo.endCursor;
    if (out.length > 20000) throw new Error("Closed won query exceeded safety limit");
  }

  return out;
}

export async function buildClosedWonReport(period: ClosedWonReportPeriod = "last7") {
  const generatedAt = new Date().toISOString();
  const { start, end, title } = periodRange(period, new Date(generatedAt));
  const opportunities = await fetchWonOpportunities();

  const rows = opportunities
    .filter((opp) => isInRange(opp.closeDate, start, end) || isInRange(opp.createdAt, start, end))
    .map((opp): ClosedWonReportRow => {
      const revenue = firstNonZero(
        dollars(opp.totalProjectRevenue),
        dollars(opp.dealValue),
        dollars(opp.amount),
        dollars(opp.salePrice),
      );
      const margin = firstNonZero(dollars(opp.totalProjectMargin), dollars(opp.margin));
      const costs = revenue - margin;

      return {
        id: opp.id,
        owner: ownerName(opp),
        department: departmentLabel(opp.businessUnit),
        accountName: opp.company?.name || "-",
        opportunityName: opp.name || "-",
        revenue,
        costs,
        margin,
        substantialCompletionDate: toDateOnly(opp.substantialCompletionDate),
        awardDate: toDateOnly(opp.closeDate),
        createdDate: toDateOnly(opp.createdAt),
        statusUpdate: opp.winLossReason?.trim() || "-",
      };
    })
    .sort((a, b) => {
      const ownerCompare = a.owner.localeCompare(b.owner);
      if (ownerCompare !== 0) return ownerCompare;
      return (b.awardDate || "").localeCompare(a.awardDate || "");
    });

  const totals = sumRows(rows);
  const groups = new Map<string, ClosedWonReportRow[]>();
  for (const row of rows) {
    groups.set(row.owner, [...(groups.get(row.owner) || []), row]);
  }
  const ownerGroups = Array.from(groups.entries()).map(([owner, groupRows]) => ({
      owner,
      rows: groupRows,
      totals: sumRows(groupRows),
    }));

  return {
    period,
    title,
    generatedAt,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    rows,
    totals,
    ownerGroups,
  } satisfies ClosedWonReport;
}

function sumRows(rows: ClosedWonReportRow[]) {
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

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function summaryCell(label: string, value: string) {
  return `
    <td style="padding:10px 14px;border:1px solid #d7dce2;background:#f8fafc;">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.03em;">${esc(label)}</div>
      <div style="font-size:18px;font-weight:700;color:#111827;margin-top:4px;">${esc(value)}</div>
    </td>
  `;
}

function dataRow(row: ClosedWonReportRow) {
  return `
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(row.department)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(row.accountName)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(row.opportunityName)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${esc(formatCurrency(row.revenue))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${esc(formatCurrency(row.costs))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">${esc(formatCurrency(row.margin))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(formatShortDate(row.substantialCompletionDate))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(formatShortDate(row.awardDate))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(formatShortDate(row.createdDate))}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${esc(row.statusUpdate)}</td>
    </tr>
  `;
}

function subtotalRow(label: string, totals: ClosedWonReport["totals"]) {
  return `
    <tr>
      <td colspan="3" style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;font-weight:700;">${esc(label)}</td>
      <td style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;text-align:right;font-weight:700;">${esc(formatCurrency(totals.revenue))}</td>
      <td style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;text-align:right;font-weight:700;">${esc(formatCurrency(totals.costs))}</td>
      <td style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;text-align:right;font-weight:700;">${esc(formatCurrency(totals.margin))}</td>
      <td colspan="4" style="padding:8px;border:1px solid #d1d5db;background:#f8fafc;"></td>
    </tr>
  `;
}

export function renderClosedWonReportHtml(report: ClosedWonReport) {
  const rowsHtml =
    report.ownerGroups
      .map(
        (group) => `
          <tr>
            <td colspan="10" style="padding:10px 8px;border:1px solid #cbd5e1;background:#eef2ff;font-weight:700;">
              ${esc(group.owner)} (${group.totals.records} ${group.totals.records === 1 ? "record" : "records"})
            </td>
          </tr>
          ${group.rows.map(dataRow).join("")}
          ${subtotalRow("", group.totals)}
        `,
      )
      .join("") || `
        <tr>
          <td colspan="10" style="padding:18px;border:1px solid #e5e7eb;text-align:center;color:#64748b;">No closed won opportunities found for this period.</td>
        </tr>
      `;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:1180px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #d7dce2;border-radius:8px;overflow:hidden;">
        <div style="padding:22px 24px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:22px;font-weight:700;">${esc(report.title)}</div>
          <div style="font-size:13px;color:#64748b;margin-top:6px;">
            As of ${esc(formatGeneratedAt(report.generatedAt))} - CRM scheduled report
          </div>
        </div>

        <div style="padding:18px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
            <tr>
              ${summaryCell("Total Records", String(report.totals.records))}
              ${summaryCell("Total Project Revenue", formatCurrency(report.totals.revenue))}
              ${summaryCell("Total Project Costs", formatCurrency(report.totals.costs))}
              ${summaryCell("Total Project Margin", formatCurrency(report.totals.margin))}
            </tr>
          </table>

          <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px;">
            <thead>
              <tr>
                ${["Department", "Account Name", "Opportunity Name", "Total Project Revenue", "Total Project Costs", "Total Project Margin", "Substantial Completion Date", "Award Date", "Created Date", "Status Update"]
                  .map((label) => `<th style="padding:8px;border:1px solid #d1d5db;background:#e2e8f0;text-align:left;font-weight:700;">${esc(label)}</th>`)
                  .join("")}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              ${subtotalRow(`Grand Total (${report.totals.records} ${report.totals.records === 1 ? "record" : "records"})`, report.totals)}
            </tbody>
          </table>

          <div style="font-size:11px;color:#64748b;margin-top:18px;">
            Filter: Closed Won deals where Award Date or Created Date falls between ${esc(formatShortDate(report.rangeStart))} and ${esc(formatShortDate(report.rangeEnd))}.
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

  const subject =
    input.report.period === "monthToDate"
      ? "Report results (Opportunities Closed Won Month-to-Date)"
      : "Report results (Opportunities Closed Won Last 7 Days)";

  const account = await getReportEmailAccount();
  return sendMicrosoftGraphMail(account, subject, input.html, input.recipients);
}
