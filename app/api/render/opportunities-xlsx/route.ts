/**
 * GET /api/render/opportunities-xlsx
 *
 * One-click formatted Excel report of opportunities for the estimation/proposal
 * team (Natalia/Alexis). Pulls live from the CRM and renders a branded, styled
 * workbook — frozen header, currency formatting, autofilter, totals row — instead
 * of the raw CSV the platform exports.
 *
 * Query params (all optional):
 *   status   filter by bidStatus (e.g. WON, SCOPING). Default: all open+won.
 *   bu       filter by businessUnit (TECHNOLOGY | VENUE_SERVICES | MEDIA_SPONSORSHIP)
 *
 * Auth-exempt via the /api/render/* allowlist — openable as a direct link.
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 90;

const TWENTY_BASE = "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_TOKEN =
  process.env.TWENTY_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA";

const ANC_BLUE = "FF1E3A8A";
const ANC_BLUE_SOFT = "FFEAF0FB";

type Money = { amountMicros: string | number } | null | undefined;
const dollars = (m: Money): number => {
  const v = Number(m?.amountMicros || 0) / 1_000_000;
  return Number.isFinite(v) ? v : 0;
};
const STATUS_LABEL: Record<string, string> = {
  WON: "Won", LOST: "Lost", NO_BID: "No Bid", PROSPECTING: "Prospecting",
  RFP_RECEIVED: "RFP Received", SCOPING: "Scoping", BID_SUBMITTED: "Bid Submitted",
  SHORTLISTED: "Shortlisted", VERBAL_AGREEMENT: "Verbal Agreement",
  NO_OPPORTUNITY_STATUS: "No Status",
};
const BU_LABEL: Record<string, string> = {
  TECHNOLOGY: "Technology", VENUE_SERVICES: "Venue Services", MEDIA_SPONSORSHIP: "Media & Sponsorship",
};

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

async function fetchOpps(filter: Record<string, unknown> | undefined): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | null = null;
  while (true) {
    const d: any = await gql(
      `query Q($f: OpportunityFilterInput, $after: String) {
        opportunities(filter: $f, first: 200, after: $after, orderBy: {id: AscNullsLast}) {
          edges { node {
            opportunityNumber name businessUnit bidStatus closeDate substantialCompletionDate
            updatedAt accountExecutive
            company { name }
            owner { name { firstName lastName } }
            totalProjectRevenue { amountMicros }
            totalProjectMargin  { amountMicros }
            revenue2026 { amountMicros }
            margin2026  { amountMicros }
            revenue2027 { amountMicros }
            margin2027  { amountMicros }
          } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { f: filter, after: cursor },
    );
    for (const e of d.opportunities.edges) out.push(e.node);
    if (!d.opportunities.pageInfo.hasNextPage) break;
    cursor = d.opportunities.pageInfo.endCursor;
  }
  return out;
}

const fmtDate = (s: string | null): string => {
  if (!s) return "";
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US");
};
const ownerName = (o: any): string => {
  const n = o.owner?.name;
  const full = [n?.firstName, n?.lastName].filter(Boolean).join(" ").trim();
  return full || o.accountExecutive || "";
};

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const and: any[] = [];
    if (sp.get("status")) and.push({ bidStatus: { eq: sp.get("status") } });
    if (sp.get("bu")) and.push({ businessUnit: { eq: sp.get("bu") } });
    const filter = and.length ? { and } : undefined;

    const opps = await fetchOpps(filter);
    // Stable cursor pagination requires ordering by the unique id; present rows
    // newest-first by opportunity number for the reader.
    const byNumberDesc = (a: any, b: any) => {
      const na = Number(a.opportunityNumber), nb = Number(b.opportunityNumber);
      if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
      return String(b.opportunityNumber || "").localeCompare(String(a.opportunityNumber || ""));
    };
    opps.sort(byNumberDesc);

    // Group opportunities by status; each group gets a subtotal, then one grand
    // total at the very bottom (Alexis/Natalia request 2026-06-29).
    const groups = new Map<string, any[]>();
    for (const o of opps) {
      const k = o.bidStatus || "NO_OPPORTUNITY_STATUS";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(o);
    }
    const STATUS_ORDER = [
      "WON", "VERBAL_AGREEMENT", "SHORTLISTED", "BID_SUBMITTED", "SCOPING",
      "RFP_RECEIVED", "PROSPECTING", "NO_BID", "LOST", "NO_OPPORTUNITY_STATUS",
    ];
    const orderedKeys = [
      ...STATUS_ORDER.filter((k) => groups.has(k)),
      ...[...groups.keys()].filter((k) => !STATUS_ORDER.includes(k)).sort(),
    ];

    const wb = new ExcelJS.Workbook();
    wb.creator = "ANC";
    const ws = wb.addWorksheet("Opportunities", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const cols = [
      { header: "Opp #", key: "num", width: 11 },
      { header: "Opportunity Name", key: "name", width: 46 },
      { header: "Account", key: "company", width: 30 },
      { header: "Business Unit", key: "bu", width: 18 },
      { header: "Status", key: "status", width: 16 },
      { header: "Award Date", key: "award", width: 13 },
      { header: "Contract Completion", key: "complete", width: 18 },
      { header: "Total Project Revenue", key: "rev", width: 20, money: true },
      { header: "Total Project Margin", key: "mar", width: 19, money: true },
      { header: "Revenue FY2026", key: "rev26", width: 16, money: true },
      { header: "Margin FY2026", key: "mar26", width: 16, money: true },
      { header: "Revenue FY2027", key: "rev27", width: 16, money: true },
      { header: "Margin FY2027", key: "mar27", width: 16, money: true },
      { header: "Owner", key: "owner", width: 20 },
      { header: "Last Updated", key: "updated", width: 14 },
    ];
    ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));

    // Header row
    const head = ws.getRow(1);
    cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ANC_BLUE } };
      cell.alignment = { vertical: "middle", horizontal: c.money ? "right" : "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFB8C4DC" } } };
    });
    head.height = 26;

    const moneyCols = cols.map((c, i) => (c.money ? i + 1 : 0)).filter(Boolean);
    const moneyNumFmt = '$#,##0;[Red]-$#,##0';
    const letterOf = (c: number) => ws.getColumn(c).letter;
    const subtotalRowIdxs: number[] = [];

    for (const key of orderedKeys) {
      const list = groups.get(key)!;
      list.sort(byNumberDesc);

      // Group band header
      const gh = ws.addRow({});
      gh.getCell(1).value = `${STATUS_LABEL[key] || key}`;
      gh.getCell(cols.length).value = `${list.length} opp${list.length === 1 ? "" : "s"}`;
      gh.getCell(cols.length).alignment = { horizontal: "right" };
      for (let c = 1; c <= cols.length; c++) {
        const cell = gh.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ANC_BLUE } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      }
      gh.height = 20;

      const dataStart = ws.lastRow!.number + 1;
      list.forEach((o, i) => {
        const row = ws.addRow({
          num: o.opportunityNumber || "",
          name: o.name || "",
          company: o.company?.name || "",
          bu: BU_LABEL[o.businessUnit] || o.businessUnit || "",
          status: STATUS_LABEL[o.bidStatus] || o.bidStatus || "",
          award: fmtDate(o.closeDate),
          complete: fmtDate(o.substantialCompletionDate),
          rev: dollars(o.totalProjectRevenue),
          mar: dollars(o.totalProjectMargin),
          rev26: dollars(o.revenue2026),
          mar26: dollars(o.margin2026),
          rev27: dollars(o.revenue2027),
          mar27: dollars(o.margin2027),
          owner: ownerName(o),
          updated: fmtDate(o.updatedAt),
        });
        if (i % 2 === 1) {
          for (let c = 1; c <= cols.length; c++) {
            row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ANC_BLUE_SOFT } };
          }
        }
        for (const c of moneyCols) row.getCell(c).numFmt = moneyNumFmt;
      });
      const dataEnd = ws.lastRow!.number;

      // Per-group subtotal row
      const st = ws.addRow({});
      st.getCell(2).value = `Subtotal — ${STATUS_LABEL[key] || key} (${list.length})`;
      for (const c of moneyCols) {
        const L = letterOf(c);
        st.getCell(c).value = { formula: `SUM(${L}${dataStart}:${L}${dataEnd})` } as any;
        st.getCell(c).numFmt = '$#,##0';
      }
      for (let c = 1; c <= cols.length; c++) {
        const cell = st.getCell(c);
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ANC_BLUE_SOFT } };
        cell.border = { top: { style: "thin", color: { argb: "FFB8C4DC" } } };
      }
      subtotalRowIdxs.push(st.number);
    }

    // Grand total row — sums the per-group subtotals
    const gt = ws.addRow({});
    gt.getCell(2).value = `TOTAL  (${opps.length} opportunities)`;
    for (const c of moneyCols) {
      const L = letterOf(c);
      const terms = subtotalRowIdxs.map((r) => `${L}${r}`).join(",");
      gt.getCell(c).value = { formula: terms ? `SUM(${terms})` : "0" } as any;
      gt.getCell(c).numFmt = '$#,##0';
    }
    for (let c = 1; c <= cols.length; c++) {
      const cell = gt.getCell(c);
      cell.font = { bold: true, size: 12 };
      cell.border = { top: { style: "medium", color: { argb: ANC_BLUE } } };
    }
    gt.height = 22;

    const buf = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ANC Opportunities ${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
