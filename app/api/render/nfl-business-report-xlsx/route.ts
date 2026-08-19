/**
 * GET /api/render/nfl-business-report-xlsx
 *
 * Won and Future NFL Business (Jireh, 2026-08-18) — every NFL deal ANC has
 * banked or is still chasing, by team.
 *
 * He first built this by asking the CRM assistant, and the workbook came back
 * with every figure multiplied by a thousand: a $9,000 graphics package for the
 * Giants read as $9,000,000. Currency leaves the CRM in millionths of a dollar,
 * and the assistant had scaled them by hand. That same run also returned 139 of
 * the 163 qualifying deals. Both faults are of a kind — the arithmetic and the
 * paging were being improvised per request — so the report is a route now, and
 * the conversion happens once, here, in `dollars()`.
 *
 * Two sheets:
 *   By Team      — each team's won book and open pursuits, with subtotals,
 *                  biggest book first.
 *   Deal Detail  — the flat list with every field, for pivoting.
 *
 * `?format=json` returns the same figures for agents and dashboards.
 *
 * Auth-exempt via the /api/render/* allowlist — openable as a direct link.
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { renderCorsHeaders, withRenderCors } from "@/lib/http/renderCors";
import {
  EXCLUDED_STATUSES,
  buildNflBusinessReport,
  marginPercent,
  type NflBusinessReport,
  type NflDealInput,
} from "@/services/reports/nflBusiness";
import { humanizeStatus } from "@/services/reports/lgAlliance";
import {
  BAND,
  BAND_STRONG,
  FONT,
  GUTTER,
  INK,
  INK_SOFT,
  PERCENT,
  bandRow,
  dataRow,
  writeSheetHeader,
  writeTableHeader,
  type ColumnSpec,
} from "@/services/reports/workbookStyle";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: renderCorsHeaders(req) });
}

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

/**
 * The one place a CRM currency becomes a number of dollars. Everything
 * downstream — subtotals, the workbook, the JSON — reads this output, so there
 * is no second place for the scale to be got wrong.
 */
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
 * Every NFL opportunity that has not been lost or no-bid. Ordered by `id`
 * because a paged cursor on a non-unique column skips and repeats rows, and
 * paged to exhaustion — the assistant's run stopped at 139 of 163.
 */
async function fetchNflDeals(): Promise<NflDealInput[]> {
  const query = `query NflBusiness($after: String) {
    opportunities(
      filter: {
        league: { eq: "NFL" }
        not: { bidStatus: { in: ${JSON.stringify(EXCLUDED_STATUSES)} } }
      }
      orderBy: { id: AscNullsLast }
      first: 60
      after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name opportunityNumber bidStatus closeDate businessUnit
        totalProjectRevenue { amountMicros }
        totalProjectMargin { amountMicros }
        company { name }
        owner { name { firstName lastName } userEmail }
      } }
    }
  }`;

  const deals: NflDealInput[] = [];
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const data: any = await gql(query, { after });
    const conn = data.opportunities;
    for (const edge of conn.edges) {
      const n = edge.node;
      deals.push({
        id: n.id,
        name: n.name || "(unnamed)",
        team: n.company?.name || null,
        opportunityNumber: n.opportunityNumber || null,
        businessUnit: n.businessUnit || null,
        bidStatus: n.bidStatus || null,
        closeDate: n.closeDate || null,
        owner: personName(n.owner),
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

const BOOK_LABEL = { won: "Won", future: "In play" } as const;

function buildWorkbook(report: NflBusinessReport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ANC";

  const asOf = new Date(report.generatedAt).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const scopeNote =
    "Every opportunity tagged NFL in the CRM that has not been lost or no-bid. " +
    "Won is business already awarded; In play is everything still open. " +
    "Figures are Revenue and Margin — Total Project, exactly as recorded on each deal.";

  // ---- By Team -----------------------------------------------------------
  const team = wb.addWorksheet("By Team");
  team.properties.defaultRowHeight = 16;

  const teamCols: ColumnSpec[] = [
    { header: "Team", width: 34, wrap: true },
    { header: "Opportunity", width: 42, wrap: true },
    { header: "Opp #", width: 10 },
    { header: "Business Unit", width: 18 },
    { header: "Status", width: 17 },
    { header: "Close Date", width: 14 },
    { header: "Owner", width: 20 },
    { header: "Revenue — Total Project", width: 19, money: true },
    { header: "Margin — Total Project", width: 19, money: true },
    { header: "Margin %", width: 10, align: "right" },
  ];

  const teamHead = writeSheetHeader(team, {
    title: "Won and Future NFL Business",
    subtitle: `As of ${asOf}`,
    headline:
      `${report.total.deals} deals across ${report.teams.length} teams · ` +
      `${usd(report.won.revenue)} won · ${usd(report.future.revenue)} in play · ` +
      `${usd(report.total.margin)} margin`,
    note: scopeNote,
  });
  writeTableHeader(team, teamCols, teamHead, 1);

  for (const group of report.teams) {
    bandRow(team, teamCols, [
      group.team,
      `${group.won.deals} won · ${group.future.deals} in play`,
      null, null, null, null, null,
      group.total.revenue,
      group.total.margin,
      null,
    ], { fill: BAND_STRONG });

    group.rows.forEach((r, i) => {
      const pct = marginPercent(r.revenue, r.margin);
      const row = dataRow(team, teamCols, [
        "",
        r.name,
        r.opportunityNumber || "",
        r.businessUnit ? humanizeStatus(r.businessUnit) : "",
        humanizeStatus(r.bidStatus),
        fmtDate(r.closeDate),
        r.owner || "",
        r.revenue,
        r.margin,
        pct,
      ], i);
      if (pct !== null) row.getCell(10 + GUTTER).numFmt = PERCENT;
    });

    bandRow(team, teamCols, [
      "",
      `${group.team} — won`,
      null, null, null, null, null,
      group.won.revenue,
      group.won.margin,
      null,
    ], { fill: BAND, height: 18 });

    bandRow(team, teamCols, [
      "",
      `${group.team} — in play`,
      null, null, null, null, null,
      group.future.revenue,
      group.future.margin,
      null,
    ], { fill: BAND, height: 18 });
  }

  bandRow(team, teamCols, [
    "TOTAL",
    `${report.won.deals} won · ${report.future.deals} in play`,
    null, null, null, null, null,
    report.total.revenue,
    report.total.margin,
    null,
  ], { fill: BAND_STRONG, height: 22 });

  team.getRow(teamHead).getCell(1 + GUTTER).font = {
    name: FONT, bold: true, size: 10, color: { argb: INK },
  };

  // ---- Deal Detail -------------------------------------------------------
  const detail = wb.addWorksheet("Deal Detail");
  detail.properties.defaultRowHeight = 16;

  const detailCols: ColumnSpec[] = [
    { header: "Team", width: 34, wrap: true },
    { header: "Opportunity", width: 42, wrap: true },
    { header: "Opp #", width: 10 },
    { header: "Book", width: 10 },
    { header: "Status", width: 17 },
    { header: "Business Unit", width: 18 },
    { header: "Close Date", width: 14 },
    { header: "Owner", width: 20 },
    { header: "Revenue — Total Project", width: 19, money: true },
    { header: "Margin — Total Project", width: 19, money: true },
  ];

  const detailHead = writeSheetHeader(detail, {
    title: "Won and Future NFL Business — Deal Detail",
    subtitle: `As of ${asOf}`,
    headline: `${report.total.deals} deals · one row each, for pivoting`,
    note: scopeNote,
  });
  writeTableHeader(detail, detailCols, detailHead, 1);

  report.rows.forEach((r, i) => {
    dataRow(detail, detailCols, [
      r.team,
      r.name,
      r.opportunityNumber || "",
      BOOK_LABEL[r.book],
      humanizeStatus(r.bidStatus),
      r.businessUnit ? humanizeStatus(r.businessUnit) : "",
      fmtDate(r.closeDate),
      r.owner || "",
      r.revenue,
      r.margin,
    ], i);
  });

  const legend = detail.addRow({});
  legend.getCell(1 + GUTTER).value =
    "A blank Revenue or Margin means the CRM holds no figure for that deal — it is not a zero.";
  legend.getCell(1 + GUTTER).font = { name: FONT, size: 9, italic: true, color: { argb: INK_SOFT } };

  return wb;
}

export async function GET(request: NextRequest) {
  try {
    const deals = await fetchNflDeals();
    const report = buildNflBusinessReport(deals);

    if (new URL(request.url).searchParams.get("format") === "json") {
      return withRenderCors(NextResponse.json(report), request);
    }

    const wb = buildWorkbook(report);
    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    return withRenderCors(new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ANC_NFL_Business_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    }), request);
  } catch (error: any) {
    console.error("[nfl-business-report] failed", error);
    return withRenderCors(
      NextResponse.json({ error: error?.message || "Failed to build the NFL business report" }, { status: 500 }),
      request,
    );
  }
}
