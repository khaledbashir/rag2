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

// --- View-filter replication: export exactly what a given saved view shows ---
async function meta<T = any>(query: string): Promise<T> {
  const r = await fetch(`${TWENTY_BASE}/metadata`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TWENTY_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const b = await r.json();
  if (b.errors?.length) throw new Error(b.errors.map((e: any) => e.message).join("; "));
  return b.data;
}
async function fetchView(viewId: string): Promise<any> {
  const d: any = await meta(
    `query{ getView(id:"${viewId}"){ id name
       viewFilters{ fieldMetadataId operand value viewFilterGroupId }
       viewFilterGroups{ id logicalOperator parentViewFilterGroupId } } }`,
  );
  return d.getView;
}
const OPPORTUNITY_OBJECT_ID = "c779922d-cf25-4a5e-9382-23eb1c02199e";
type Field = { name: string; type: string };
let _fields: Record<string, Field> | null = null;
async function fieldMap(): Promise<Record<string, Field>> {
  if (_fields) return _fields;
  // single-object-by-id: the paginated objects{} list only returns ~10 and omits opportunity
  const d: any = await meta(`query{ object(id:"${OPPORTUNITY_OBJECT_ID}"){ fieldsList{ id name type } } }`);
  const m: Record<string, Field> = {};
  for (const f of d.object?.fieldsList || []) m[f.id] = { name: f.name, type: f.type };
  _fields = m;
  return m;
}
// Translate one viewFilter into an Opportunity filter clause — type + operand aware.
function vfClause(f: Field, operand: string, raw: string): any | null {
  const { name, type } = f;
  if (type === "RELATION" || type === "UUID" || type === "ACTOR") return null;
  let val: any = raw;
  try { val = JSON.parse(raw); } catch { /* keep raw */ }
  const arr = Array.isArray(val) ? val : null;
  const first = arr ? arr[0] : val;
  const isSelect = type === "SELECT" || type === "MULTI_SELECT" || type === "RATING";
  switch (operand) {
    case "IS":
      if (type === "BOOLEAN") return { [name]: { eq: !!first } };
      return isSelect ? { [name]: { in: arr || [first] } } : { [name]: { eq: first } };
    case "IS_NOT":
      if (type === "BOOLEAN") return { not: { [name]: { eq: !!first } } };
      return isSelect ? { not: { [name]: { in: arr || [first] } } } : { not: { [name]: { eq: first } } };
    case "IS_AFTER": return { [name]: { gt: raw } };
    case "IS_BEFORE": return { [name]: { lt: raw } };
    // CURRENCY is a composite type — comparisons must target the amountMicros
    // sub-field, and view-filter values are stored in dollars.
    case "GREATER_THAN_OR_EQUAL":
      return type === "CURRENCY"
        ? { [name]: { amountMicros: { gte: Math.round(Number(first) * 1_000_000) } } }
        : { [name]: { gte: raw } };
    case "LESS_THAN_OR_EQUAL":
      return type === "CURRENCY"
        ? { [name]: { amountMicros: { lte: Math.round(Number(first) * 1_000_000) } } }
        : { [name]: { lte: raw } };
    case "CONTAINS": return { [name]: { ilike: `%${raw}%` } };
    case "DOES_NOT_CONTAIN": return { not: { [name]: { ilike: `%${raw}%` } } };
    case "IS_EMPTY": return { [name]: { is: "NULL" } };
    case "IS_NOT_EMPTY": return { [name]: { is: "NOT_NULL" } };
    case "IS_RELATIVE": {
      try {
        const o = JSON.parse(raw);
        const ms: Record<string, number> = { DAY: 864e5, WEEK: 6048e5, MONTH: 2592e6, YEAR: 31536e6 };
        const span = (ms[o.unit] || 864e5) * (o.amount || 0);
        const past = o.direction === "PAST";
        const d = new Date(Date.now() - (past ? 1 : -1) * span).toISOString().replace(/\.\d{3}Z$/, "Z");
        return past ? { [name]: { gte: d } } : { [name]: { lte: d } };
      } catch { return null; }
    }
    default: return null;
  }
}
// Reconstruct a view's full AND/OR filter-group tree into one Opportunity filter.
function buildViewFilter(viewFilters: any[], groups: any[], fm: Record<string, Field>): any | undefined {
  const byGroup: Record<string, any[]> = {};
  const ungrouped: any[] = [];
  for (const vf of viewFilters) {
    const f = fm[vf.fieldMetadataId];
    if (!f) continue;
    const c = vfClause(f, vf.operand, vf.value);
    if (!c) continue;
    if (vf.viewFilterGroupId) (byGroup[vf.viewFilterGroupId] ||= []).push(c);
    else ungrouped.push(c);
  }
  if (!groups || !groups.length) {
    const all = [...ungrouped, ...Object.values(byGroup).flat()];
    return all.length ? { and: all } : undefined;
  }
  const build = (g: any): any | null => {
    const own = byGroup[g.id] || [];
    const kids = groups.filter((x) => x.parentViewFilterGroupId === g.id).map(build).filter(Boolean);
    const parts = [...own, ...kids];
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    return g.logicalOperator === "OR" ? { or: parts } : { and: parts };
  };
  const roots = groups.filter((g) => !g.parentViewFilterGroupId).map(build).filter(Boolean);
  const all = [...ungrouped, ...roots];
  if (!all.length) return undefined;
  return all.length === 1 ? all[0] : { and: all };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const and: any[] = [];
    let viewName = "";
    const viewId = sp.get("viewId");
    if (viewId) {
      try {
        const view = await fetchView(viewId);
        viewName = view?.name || "";
        const fm = await fieldMap();
        const vfilter = buildViewFilter(view?.viewFilters || [], view?.viewFilterGroups || [], fm);
        if (vfilter) and.push(vfilter);
      } catch { /* if the view can't be read, fall through to params/all */ }
    }
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

    // --- Salesforce-style clean report palette (off-white, calm, no heavy blue) ---
    const PAPER = "FFFAF9F6";      // off-white canvas
    const PAPER_ALT = "FFF3F1EC";  // subtle alternating row
    const BAND = "FFECE9E1";       // group band
    const INK = "FF3A3D42";        // primary text
    const INK_SOFT = "FF74777C";   // muted text
    const LINE = "FFD7D3C9";       // hairlines
    const TITLE_GREY = "FF56585B"; // SF title grey
    const FONT = "Calibri";
    const OFF = 1;                 // narrow left margin column (SF inset)

    const wb = new ExcelJS.Workbook();
    wb.creator = "ANC";
    const ws = wb.addWorksheet("Opportunities");
    ws.properties.defaultRowHeight = 16;
    ws.views = [{ showGridLines: false }];

    const cols = [
      { header: "Opp #", key: "num", width: 9 },
      { header: "Opportunity Name", key: "name", width: 48 },
      { header: "Account", key: "company", width: 30 },
      { header: "Business Unit", key: "bu", width: 16 },
      { header: "Status", key: "status", width: 15 },
      { header: "Award Date", key: "award", width: 12 },
      { header: "Contract Completion", key: "complete", width: 16 },
      { header: "Total Project Revenue", key: "rev", width: 18, money: true },
      { header: "Total Project Margin", key: "mar", width: 17, money: true },
      { header: "Revenue FY2026", key: "rev26", width: 15, money: true },
      { header: "Margin FY2026", key: "mar26", width: 14, money: true },
      { header: "Revenue FY2027", key: "rev27", width: 15, money: true },
      { header: "Margin FY2027", key: "mar27", width: 14, money: true },
      { header: "Owner", key: "owner", width: 18 },
      { header: "Last Updated", key: "updated", width: 13 },
    ];
    const NC = cols.length;
    const COL1 = 1 + OFF;                  // first data column index (B)
    const COLN = NC + OFF;                 // last data column index
    const col = (i: number) => i + 1 + OFF; // data col index for cols[i]
    ws.getColumn(1).width = 2.6;           // left margin
    cols.forEach((c, i) => { ws.getColumn(col(i)).width = c.width; });

    const moneyCols = cols.map((c, i) => (c.money ? col(i) : 0)).filter(Boolean);
    const moneyNumFmt = '#,##0;[Red](#,##0)';
    const letterOf = (c: number) => ws.getColumn(c).letter;

    // Title block
    const reportTitle =
      viewName ||
      ((sp.get("bu") ? (BU_LABEL[sp.get("bu")!] || sp.get("bu")) : "ANC") +
      " Opportunities" +
      (sp.get("status") ? ` — ${STATUS_LABEL[sp.get("status")!] || sp.get("status")}` : ""));
    const asOf = new Date().toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const tTitle = ws.getRow(2); tTitle.getCell(COL1).value = reportTitle;
    tTitle.getCell(COL1).font = { name: FONT, size: 18, color: { argb: TITLE_GREY } };
    tTitle.height = 24;
    const tSub = ws.getRow(3); tSub.getCell(COL1).value = `As of ${asOf}`;
    tSub.getCell(COL1).font = { name: FONT, size: 10, color: { argb: INK_SOFT } };

    // Header row
    const HEAD_ROW = 5;
    const head = ws.getRow(HEAD_ROW);
    cols.forEach((c, i) => {
      const cell = head.getCell(col(i));
      cell.value = c.header;
      cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: c.money ? "right" : "left", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: "FFB7B2A6" } } };
    });
    head.height = 28;
    ws.views = [{ state: "frozen", ySplit: HEAD_ROW, showGridLines: false }];

    const subtotalRowIdxs: number[] = [];

    for (const key of orderedKeys) {
      const list = groups.get(key)!;
      list.sort(byNumberDesc);

      // Calm group band — grey label, not a loud colour block
      const gh = ws.addRow({});
      gh.getCell(COL1).value = `${STATUS_LABEL[key] || key}`;
      gh.getCell(COLN).value = `${list.length} opp${list.length === 1 ? "" : "s"}`;
      gh.getCell(COLN).alignment = { horizontal: "right" };
      gh.getCell(COLN).font = { name: FONT, size: 9, color: { argb: INK_SOFT } };
      for (let c = COL1; c <= COLN; c++) {
        const cell = gh.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
        if (c === COL1) cell.font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
        cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
      }
      gh.height = 20;

      const dataStart = ws.lastRow!.number + 1;
      list.forEach((o, i) => {
        const row = ws.addRow({});
        const vals = [
          o.opportunityNumber || "", o.name || "", o.company?.name || "",
          BU_LABEL[o.businessUnit] || o.businessUnit || "",
          STATUS_LABEL[o.bidStatus] || o.bidStatus || "",
          fmtDate(o.closeDate), fmtDate(o.substantialCompletionDate),
          dollars(o.totalProjectRevenue), dollars(o.totalProjectMargin),
          dollars(o.revenue2026), dollars(o.margin2026),
          dollars(o.revenue2027), dollars(o.margin2027),
          ownerName(o), fmtDate(o.updatedAt),
        ];
        cols.forEach((c, ci) => {
          const cell = row.getCell(col(ci));
          cell.value = vals[ci] as any;
          cell.font = { name: FONT, size: 10, color: { argb: INK } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 ? PAPER_ALT : PAPER } };
          if (c.money) { cell.numFmt = moneyNumFmt; cell.alignment = { horizontal: "right" }; }
          else cell.alignment = { vertical: "middle", wrapText: false };
        });
      });
      const dataEnd = ws.lastRow!.number;

      // Per-group subtotal — light, hairline top rule
      const st = ws.addRow({});
      st.getCell(col(1)).value = `Subtotal — ${STATUS_LABEL[key] || key} (${list.length})`;
      for (const c of moneyCols) {
        const L = letterOf(c);
        st.getCell(c).value = { formula: `SUM(${L}${dataStart}:${L}${dataEnd})` } as any;
        st.getCell(c).numFmt = moneyNumFmt;
      }
      for (let c = COL1; c <= COLN; c++) {
        const cell = st.getCell(c);
        cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
        cell.border = { top: { style: "thin", color: { argb: LINE } } };
        if (moneyCols.includes(c)) cell.alignment = { horizontal: "right" };
      }
      subtotalRowIdxs.push(st.number);
      ws.addRow({}); // breathing space between groups
    }

    // Grand total — bold, single dark rule above (no blue)
    const gt = ws.addRow({});
    gt.getCell(col(1)).value = `Total — ${opps.length} opportunities`;
    gt.getCell(col(1)).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
    for (const c of moneyCols) {
      const L = letterOf(c);
      const terms = subtotalRowIdxs.map((r) => `${L}${r}`).join(",");
      gt.getCell(c).value = { formula: terms ? `SUM(${terms})` : "0" } as any;
      gt.getCell(c).numFmt = moneyNumFmt;
      gt.getCell(c).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
      gt.getCell(c).alignment = { horizontal: "right" };
    }
    for (let c = COL1; c <= COLN; c++) {
      gt.getCell(c).border = { top: { style: "medium", color: { argb: "FF8A857A" } } };
    }
    gt.height = 22;

    // Paint the whole used range off-white so it reads as one clean canvas
    const lastRow = ws.lastRow!.number;
    for (let r = 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= COLN; c++) {
        const cell = row.getCell(c);
        if (!cell.fill || (cell.fill as any).pattern === undefined) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAPER } };
        }
      }
    }
    ws.autoFilter = {
      from: { row: HEAD_ROW, column: COL1 },
      to: { row: HEAD_ROW, column: COLN },
    };

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
