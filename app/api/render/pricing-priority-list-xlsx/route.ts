/**
 * GET /api/render/pricing-priority-list-xlsx
 *
 * The Active Pricing Priority List (Jireh, 2026-08-14) as a one-click branded
 * workbook — the same records and columns as the CRM view of that name, but
 * grouped by how close the proposal due date is so the urgent work reads first.
 *
 * `?format=json` returns the same figures for agents and dashboards.
 *
 * Auth-exempt via the /api/render/* allowlist — openable as a direct link.
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  EXCLUDED_STATUSES,
  buildPricingPriorityReport,
  type PricingDealInput,
  type PricingPriorityReport,
} from "@/services/reports/pricingPriority";
import { humanizeStatus } from "@/services/reports/lgAlliance";
import {
  BAND_STRONG,
  FONT,
  GUTTER,
  INK,
  INK_SOFT,
  bandRow,
  dataRow,
  writeSheetHeader,
  writeTableHeader,
  type ColumnSpec,
} from "@/services/reports/workbookStyle";

export const runtime = "nodejs";
export const maxDuration = 60;

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

async function gql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TWENTY_BASE}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TWENTY_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: any) => e.message).join("; "));
  return body.data;
}

function dollars(field: any): number | null {
  const micros = field?.amountMicros;
  if (micros === null || micros === undefined) return null;
  return Number(micros) / 1_000_000;
}

function personName(node: any): string | null {
  if (!node) return null;
  const n = [node.name?.firstName, node.name?.lastName].filter(Boolean).join(" ").trim();
  return n || node.userEmail || null;
}

/**
 * The CRM view's filter set, restated as an API filter. Ordered by `id` because
 * a paged cursor on a non-unique column skips and repeats rows.
 */
async function fetchPricingDeals(): Promise<PricingDealInput[]> {
  const query = `query PricingPriority($after: String) {
    opportunities(
      filter: {
        businessUnit: { eq: "TECHNOLOGY" }
        pricingComplete: { eq: "NO" }
        closeDate: { gt: "2025-12-31T00:00:00.000Z" }
        not: { bidStatus: { in: ${JSON.stringify(EXCLUDED_STATUSES)} } }
      }
      orderBy: { id: AscNullsLast }
      first: 60
      after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name proposalStage bidStatus proposalDueDate pricingComplete
        closeDate substantialCompletionDate businessUnit manufacturer league
        totalProjectRevenue { amountMicros }
        totalProjectMargin { amountMicros }
        company { name }
        assignedEstimator { name { firstName lastName } userEmail }
        owner { name { firstName lastName } userEmail }
      } }
    }
  }`;

  const deals: PricingDealInput[] = [];
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const data: any = await gql(query, { after });
    const conn = data.opportunities;
    for (const edge of conn.edges) {
      const n = edge.node;
      deals.push({
        id: n.id,
        name: n.name || "(unnamed)",
        account: n.company?.name || null,
        proposalStage: n.proposalStage || null,
        bidStatus: n.bidStatus || null,
        proposalDueDate: n.proposalDueDate || null,
        pricingComplete: n.pricingComplete || null,
        assignedEstimator: personName(n.assignedEstimator),
        owner: personName(n.owner),
        awardDate: n.closeDate || null,
        completionDate: n.substantialCompletionDate || null,
        businessUnit: n.businessUnit || null,
        manufacturer: n.manufacturer || null,
        league: n.league || null,
        revenue: dollars(n.totalProjectRevenue),
        margin: dollars(n.totalProjectMargin),
      });
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return deals;
}

function fmtDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // Dates are stored at midnight UTC — format in UTC so they don't slip a day.
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function usd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function buildWorkbook(report: PricingPriorityReport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ANC";
  const ws = wb.addWorksheet("Pricing Priority");
  ws.properties.defaultRowHeight = 16;

  const cols: ColumnSpec[] = [
    { header: "Proposal Due", width: 14 },
    { header: "Days", width: 8, align: "right" },
    { header: "Account", width: 26 },
    { header: "Opportunity", width: 40, wrap: true },
    { header: "Proposal Stage", width: 18 },
    { header: "Status", width: 16 },
    { header: "Assigned Estimator", width: 20 },
    { header: "Owner", width: 20 },
    { header: "Award Date", width: 14 },
    { header: "Contract Completion", width: 16 },
    { header: "Manufacturer", width: 15 },
    { header: "League", width: 14 },
    { header: "Revenue — Total Project", width: 18, money: true },
    { header: "Margin — Total Project", width: 18, money: true },
  ];

  const asOf = new Date(report.generatedAt).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  const headRow = writeSheetHeader(ws, {
    title: "Active Pricing Priority List",
    subtitle: `As of ${asOf}`,
    headline:
      `${report.totals.deals} deals awaiting pricing · ${usd(report.totals.revenue)} revenue · ` +
      `${usd(report.totals.margin)} margin · ${report.counts.overdue} past due`,
    note:
      "Technology deals with pricing not complete, awarding 2026 or later, excluding lost and no-bid. " +
      "Ordered by proposal due date.",
  });
  writeTableHeader(ws, cols, headRow);

  for (const group of report.buckets) {
    bandRow(ws, cols, [
      group.label,
      null,
      `${group.rows.length} ${group.rows.length === 1 ? "deal" : "deals"}`,
      null, null, null, null, null, null, null, null, null,
      group.rows.reduce((s, r) => s + (r.revenue || 0), 0),
      group.rows.reduce((s, r) => s + (r.margin || 0), 0),
    ], { fill: BAND_STRONG });

    group.rows.forEach((r, i) => {
      dataRow(ws, cols, [
        fmtDate(r.proposalDueDate),
        r.daysUntilDue === null ? "" : r.daysUntilDue,
        r.account || "",
        r.name,
        r.proposalStage ? humanizeStatus(r.proposalStage) : "",
        humanizeStatus(r.bidStatus),
        r.assignedEstimator || "",
        r.owner || "",
        fmtDate(r.awardDate),
        fmtDate(r.completionDate),
        r.manufacturer ? humanizeStatus(r.manufacturer) : "",
        r.league ? humanizeStatus(r.league) : "",
        r.revenue,
        r.margin,
      ], i);
    });
  }

  bandRow(ws, cols, [
    "TOTAL", null, `${report.totals.deals} deals`,
    null, null, null, null, null, null, null, null, null,
    report.totals.revenue, report.totals.margin,
  ], { fill: BAND_STRONG, height: 22 });

  const legend = ws.addRow({});
  legend.getCell(1 + GUTTER).value =
    "Days is whole days to the proposal due date; negative means the date has passed.";
  legend.getCell(1 + GUTTER).font = { name: FONT, size: 9, italic: true, color: { argb: INK_SOFT } };

  ws.getRow(headRow).getCell(1 + GUTTER).font = {
    name: FONT, bold: true, size: 10, color: { argb: INK },
  };

  return wb;
}

export async function GET(request: NextRequest) {
  try {
    const deals = await fetchPricingDeals();
    const report = buildPricingPriorityReport(deals);

    if (new URL(request.url).searchParams.get("format") === "json") {
      return NextResponse.json(report);
    }

    const wb = buildWorkbook(report);
    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ANC_Active_Pricing_Priority_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("[pricing-priority-list] failed", error);
    return NextResponse.json(
      { error: error?.message || "Failed to build the pricing priority list" },
      { status: 500 },
    );
  }
}
