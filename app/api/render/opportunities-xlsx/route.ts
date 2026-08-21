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
import { buildSelection, cellValue, selectionFor } from "@/services/reports/viewMirror";
import { buildViewFilter, type Field as FilterField } from "@/services/reports/viewFilterTranslate";
import { contentDisposition } from "@/services/reports/workbookStyle";
import {
  aggregateFormula,
  aggregateLabel,
  aggregateNumFmt,
  computeAggregate,
} from "@/services/reports/viewAggregates";
import {
  groupByViewField,
  layoutFromView,
  orderGroups,
  sortByViewSorts,
  type FieldMeta,
  type ViewSort,
} from "@/services/reports/viewExportLayout";

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

// Parse a years param into a sorted number list. Accepts a range ("2026-2031")
// or a comma list ("2026,2027,2028"). Returns [] when the param is absent so
// callers can distinguish "not provided" from a default.
function parseYears(s: string | null, fallback: number[]): number[] {
  if (!s) return fallback;
  const set = new Set<number>();
  for (const part of s.split(",")) {
    const t = part.trim();
    const m = t.match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (m) {
      const a = +m[1], b = +m[2];
      for (let y = Math.min(a, b); y <= Math.max(a, b); y++) set.add(y);
    } else if (/^\d{4}$/.test(t)) set.add(+t);
  }
  return set.size ? [...set].sort((a, b) => a - b) : fallback;
}

async function fetchOpps(
  filter: Record<string, unknown> | undefined,
  years: number[],
): Promise<any[]> {
  // Project revenue/margin for every requested year so the columns and the
  // revenue-gate filter both have data to read. Default callers pass
  // [2026, 2027] which matches the original fixed projection.
  const proj = years
    .map((y) => `revenue${y} { amountMicros }\n            margin${y}  { amountMicros }`)
    .join("\n            ");
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
            ${proj}
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
    `query{ getView(id:"${viewId}"){ id name mainGroupByFieldMetadataId
       viewFilters{ fieldMetadataId operand value viewFilterGroupId }
       viewFilterGroups{ id logicalOperator parentViewFilterGroupId }
       viewSorts{ fieldMetadataId direction }
       viewFields{ fieldMetadataId isVisible position aggregateOperation } } }`,
  );
  return d.getView;
}
const OPPORTUNITY_OBJECT_ID = "c779922d-cf25-4a5e-9382-23eb1c02199e";
type Field = FilterField & { label: string; relationTarget?: string };
let _fields: Record<string, Field> | null = null;
async function fieldMap(): Promise<Record<string, Field>> {
  if (_fields) return _fields;
  // single-object-by-id: the paginated objects{} list only returns ~10 and omits opportunity
  const d: any = await meta(
    `query{ object(id:"${OPPORTUNITY_OBJECT_ID}"){ fieldsList{ id name type label
       relation{ targetObjectMetadata{ nameSingular } } } } }`,
  );
  const m: Record<string, Field> = {};
  for (const f of d.object?.fieldsList || []) {
    m[f.id] = {
      name: f.name,
      type: f.type,
      label: f.label || f.name,
      relationTarget: f.relation?.targetObjectMetadata?.nameSingular,
    };
  }
  _fields = m;
  return m;
}
// --- Mirrored layout: the sheet IS the view ------------------------------
// Jireh, 2026-08-21: a report and its export must "agree to the dollar". They
// could not while the export carried a fixed column set — his LiveSync list
// totals revenue and margin for every year from 2025 to 2036, and the export
// showed two of them. So when a viewId is given the sheet takes the view's own
// visible columns, order, grouping, sorts and per-column totals.
// `?layout=classic` returns the previous fixed layout, so a stakeholder who
// preferred the old shape is one parameter away from it, not a redeploy.

/** Pipeline order for status sections, so an export does not open at "Bid Submitted". */
const STATUS_SECTION_ORDER = [
  "Won", "Verbal Agreement", "Shortlisted", "Bid Submitted", "Scoping",
  "RFP Received", "Prospecting", "On Hold", "No Bid", "Lost", "No Status",
];

async function fetchMirrored(
  filter: Record<string, unknown> | undefined,
  selection: string,
): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | null = null;
  while (true) {
    // orderBy id — a createdAt cursor skips and repeats rows (203 opportunities
    // once came back as 143 with 90 unique ids).
    const d: any = await gql(
      `query Q($f: OpportunityFilterInput, $after: String) {
        opportunities(filter: $f, first: 200, after: $after, orderBy: {id: AscNullsLast}) {
          edges { node { id ${selection} } }
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

async function renderMirrored(view: any, filter: any, fm: Record<string, Field>) {
  const { columns, skipped } = layoutFromView(view.viewFields || [], fm);
  if (!columns.length) return null; // nothing renderable — fall back to classic

  const groupMeta: FieldMeta | null = view.mainGroupByFieldMetadataId
    ? fm[view.mainGroupByFieldMetadataId] || null
    : null;
  const sorts: ViewSort[] = view.viewSorts || [];

  // The grouping and sort fields must be fetched even when they are not columns.
  const extra: string[] = [];
  const seen = new Set(columns.map((c) => c.fieldName));
  for (const meta of [groupMeta, ...sorts.map((s) => fm[s.fieldMetadataId])]) {
    if (!meta || seen.has(meta.name)) continue;
    const sel = selectionFor({
      fieldName: meta.name, label: meta.label, type: meta.type, relationTarget: meta.relationTarget,
    });
    if (sel) { extra.push(sel); seen.add(meta.name); }
  }
  const selection = [buildSelection(columns), ...extra].filter(Boolean).join(" ");
  const rows = await fetchMirrored(filter, selection);

  const sorted = sortByViewSorts(rows, sorts, fm);
  const groups = orderGroups(groupByViewField(sorted, groupMeta, fmtDate), STATUS_SECTION_ORDER);

  const PAPER = "FFFAF9F6", PAPER_ALT = "FFF3F1EC", BAND = "FFECE9E1";
  const INK = "FF3A3D42", INK_SOFT = "FF74777C", LINE = "FFD7D3C9", TITLE_GREY = "FF56585B";
  const FONT = "Calibri";
  const OFF = 1;
  const moneyNumFmt = '#,##0;[Red](#,##0)';

  const wb = new ExcelJS.Workbook();
  wb.creator = "ANC";
  const ws = wb.addWorksheet("Report");
  ws.properties.defaultRowHeight = 16;

  const COL1 = 1 + OFF;
  const COLN = columns.length + OFF;
  const col = (i: number) => i + 1 + OFF;
  ws.getColumn(1).width = 2.6;
  columns.forEach((c, i) => { ws.getColumn(col(i)).width = c.width; });
  const letterOf = (c: number) => ws.getColumn(c).letter;

  // Title
  const asOf = new Date().toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const t = ws.getRow(2);
  t.getCell(COL1).value = view.name || "ANC Opportunities";
  t.getCell(COL1).font = { name: FONT, size: 18, color: { argb: TITLE_GREY } };
  t.height = 24;
  const sub = ws.getRow(3);
  sub.getCell(COL1).value =
    `As of ${asOf} · ${rows.length} record${rows.length === 1 ? "" : "s"}` +
    (skipped.length ? ` · not shown: ${skipped.join(", ")}` : "");
  sub.getCell(COL1).font = { name: FONT, size: 10, color: { argb: INK_SOFT } };

  // Header + a thin legend row naming each column's total the way the CRM does,
  // so "Sum of Revenue" and "Average of Probability" are never mistaken for
  // each other further down the sheet.
  const HEAD_ROW = 5;
  const head = ws.getRow(HEAD_ROW);
  columns.forEach((c, i) => {
    const cell = head.getCell(col(i));
    cell.value = c.label;
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
    cell.alignment = { vertical: "middle", horizontal: c.money ? "right" : "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: "FFB7B2A6" } } };
  });
  head.height = 28;
  const hasAggregate = columns.some((c) => c.aggregate);
  const LEGEND_ROW = HEAD_ROW + 1;
  if (hasAggregate) {
    const legend = ws.getRow(LEGEND_ROW);
    columns.forEach((c, i) => {
      const cell = legend.getCell(col(i));
      if (c.aggregate) cell.value = aggregateLabel(c.aggregate, c.label);
      cell.font = { name: FONT, size: 8, italic: true, color: { argb: INK_SOFT } };
      cell.alignment = { horizontal: c.money ? "right" : "left" };
    });
    legend.height = 13;
  }
  ws.views = [{ state: "frozen", ySplit: hasAggregate ? LEGEND_ROW : HEAD_ROW, showGridLines: false }];
  while (ws.lastRow!.number < (hasAggregate ? LEGEND_ROW : HEAD_ROW)) ws.addRow({});

  const totalRowIdxs: number[] = [];
  const writeTotals = (
    row: ExcelJS.Row, first: number, last: number, records: any[], bold: boolean,
  ) => {
    columns.forEach((c, i) => {
      if (!c.aggregate) return;
      const cellRef = row.getCell(col(i));
      const values = records.map((r) => cellValue(c, r, fmtDate));
      const result = computeAggregate(c.aggregate, values);
      const formula = aggregateFormula(c.aggregate, letterOf(col(i)), first, last);
      // An empty section gets the computed value written flat: SUM(H9:H8) runs
      // backwards in Excel and swallows the total row itself.
      if (formula && last >= first) cellRef.value = { formula, result: result ?? undefined } as any;
      else cellRef.value = result;
      cellRef.numFmt = aggregateNumFmt(c.aggregate, c.money, moneyNumFmt);
      cellRef.font = { name: FONT, bold, size: 10, color: { argb: INK } };
      cellRef.alignment = { horizontal: "right" };
    });
  };

  for (const group of groups) {
    if (group.label) {
      const gh = ws.addRow({});
      gh.getCell(COL1).value = group.label;
      gh.getCell(COLN).value = `${group.records.length} record${group.records.length === 1 ? "" : "s"}`;
      gh.getCell(COLN).alignment = { horizontal: "right" };
      gh.getCell(COLN).font = { name: FONT, size: 9, color: { argb: INK_SOFT } };
      for (let c = COL1; c <= COLN; c++) {
        const cell = gh.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
        if (c === COL1) cell.font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
        cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
      }
      gh.height = 20;
    }

    const dataStart = ws.lastRow!.number + 1;
    group.records.forEach((record, i) => {
      const row = ws.addRow({});
      columns.forEach((c, ci) => {
        const cell = row.getCell(col(ci));
        cell.value = cellValue(c, record, fmtDate) as any;
        cell.font = { name: FONT, size: 10, color: { argb: INK } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 ? PAPER_ALT : PAPER } };
        if (c.money) { cell.numFmt = moneyNumFmt; cell.alignment = { horizontal: "right" }; }
        else cell.alignment = { vertical: "middle", wrapText: c.wrap };
      });
    });
    const dataEnd = ws.lastRow!.number;

    if (hasAggregate) {
      const st = ws.addRow({});
      // The first column usually carries "Count all", and its number belongs
      // there — that is where the CRM puts it, under the record column. Only
      // write a text label when that column has no total of its own to show,
      // otherwise the label and the count fight over one cell and the count
      // silently wins.
      const labelCol = columns.findIndex((c) => !c.aggregate);
      if (labelCol >= 0) {
        st.getCell(col(labelCol)).value = group.label
          ? `Total — ${group.label} (${group.records.length})`
          : `Total — ${group.records.length} record${group.records.length === 1 ? "" : "s"}`;
      }
      for (let c = COL1; c <= COLN; c++) {
        const cell = st.getCell(c);
        cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
        cell.border = { top: { style: "thin", color: { argb: LINE } } };
      }
      writeTotals(st, dataStart, dataEnd, group.records, true);
      totalRowIdxs.push(st.number);
    }
    ws.addRow({});
  }

  if (hasAggregate && groups.length > 1) {
    const gt = ws.addRow({});
    const grandLabelCol = columns.findIndex((c) => !c.aggregate);
    if (grandLabelCol >= 0) {
      gt.getCell(col(grandLabelCol)).value = `Total — ${rows.length} record${rows.length === 1 ? "" : "s"}`;
    }
    for (let c = COL1; c <= COLN; c++) {
      gt.getCell(c).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
      gt.getCell(c).border = { top: { style: "medium", color: { argb: "FF8A857A" } } };
    }
    // The grand total re-aggregates the RECORDS, not the section totals: summing
    // subtotals is only right for SUM and COUNT — an average of averages is
    // wrong the moment two sections hold a different number of rows.
    columns.forEach((c, i) => {
      if (!c.aggregate) return;
      const cell = gt.getCell(col(i));
      const result = computeAggregate(c.aggregate, rows.map((r) => cellValue(c, r, fmtDate)));
      const L = letterOf(col(i));
      const terms = totalRowIdxs.map((r) => `${L}${r}`).join(",");
      cell.value =
        (c.aggregate === "SUM" || c.aggregate.startsWith("COUNT")) && terms
          ? ({ formula: `SUM(${terms})`, result: result ?? undefined } as any)
          : result;
      cell.numFmt = aggregateNumFmt(c.aggregate, c.money, moneyNumFmt);
      cell.font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
      cell.alignment = { horizontal: "right" };
    });
    gt.height = 22;
  }

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
  ws.autoFilter = { from: { row: HEAD_ROW, column: COL1 }, to: { row: HEAD_ROW, column: COLN } };
  return wb;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const and: any[] = [];
    let viewName = "";
    const viewId = sp.get("viewId");
    let mirrored: ExcelJS.Workbook | null = null;
    let mirroredName = "";
    if (viewId) {
      try {
        const view = await fetchView(viewId);
        viewName = view?.name || "";
        const fm = await fieldMap();
        const vfilter = buildViewFilter(view?.viewFilters || [], view?.viewFilterGroups || [], fm);
        if (vfilter) and.push(vfilter);

        // The sheet mirrors the view unless the caller asks for the old fixed
        // layout, or adds params (status/bu/years/revYears) that only the
        // classic layout knows how to honour.
        const wantsClassic =
          sp.get("layout") === "classic" ||
          ["status", "bu", "years", "revYears"].some((p) => sp.get(p));
        if (!wantsClassic) {
          const filter = and.length ? { and } : undefined;
          mirrored = await renderMirrored(view, filter, fm);
          mirroredName = viewName;
        }
      } catch { /* if the view can't be read, fall through to params/all */ }
    }
    if (mirrored) {
      const buf = await mirrored.xlsx.writeBuffer();
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": contentDisposition(`${mirroredName || "ANC Opportunities"} ${stamp}.xlsx`),
          "Cache-Control": "no-store",
        },
      });
    }
    if (sp.get("status")) and.push({ bidStatus: { eq: sp.get("status") } });
    if (sp.get("bu")) and.push({ businessUnit: { eq: sp.get("bu") } });
    // Revenue gate: keep only deals with non-zero revenue in ANY of the given
    // years. Each year contributes two OR clauses (>= $1 and <= -$1) so signed
    // credits/adjustments still qualify, matching the Service Forecast view
    // precedent. CURRENCY comparisons target amountMicros (composite type).
    const revYears = parseYears(sp.get("revYears"), []);
    if (revYears.length) {
      const ors: any[] = [];
      for (const y of revYears) {
        ors.push({ [`revenue${y}`]: { amountMicros: { gte: 1_000_000 } } });
        ors.push({ [`revenue${y}`]: { amountMicros: { lte: -1_000_000 } } });
      }
      and.push({ or: ors });
    }
    const filter = and.length ? { and } : undefined;

    // years controls the per-year revenue/margin columns + projection. Default
    // [2026, 2027] preserves the original column set for every existing
    // viewId-based report (zero regression on the 7 shipped views).
    const years = parseYears(sp.get("years"), [2026, 2027]);
    const opps = await fetchOpps(filter, years);
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
      ...years.flatMap((y) => [
        { header: `Revenue FY${y}`, key: `rev${y}`, width: 15, money: true },
        { header: `Margin FY${y}`, key: `mar${y}`, width: 14, money: true },
      ]),
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
    const moneyValueForCol = (o: any, c: number): number => {
      const key = cols[c - COL1]?.key;
      if (key === "rev") return dollars(o.totalProjectRevenue);
      if (key === "mar") return dollars(o.totalProjectMargin);
      const rm = key?.match(/^rev(\d{4})$/); if (rm) return dollars(o[`revenue${rm[1]}`]);
      const mm = key?.match(/^mar(\d{4})$/); if (mm) return dollars(o[`margin${mm[1]}`]);
      return 0;
    };

    // Title block
    const yearSuffix = sp.get("years") ? ` (FY${years[0]}–${years[years.length - 1]})` : "";
    const reportTitle =
      viewName ||
      ((sp.get("bu") ? (BU_LABEL[sp.get("bu")!] || sp.get("bu")) : "ANC") +
      " Opportunities" +
      (sp.get("status") ? ` — ${STATUS_LABEL[sp.get("status")!] || sp.get("status")}` : "") +
      yearSuffix);
    const asOf = new Date().toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const tTitle = ws.getRow(2); tTitle.getCell(COL1).value = reportTitle;
    tTitle.getCell(COL1).font = { name: FONT, size: 18, color: { argb: TITLE_GREY } };
    tTitle.height = 24;
    const tSub = ws.getRow(3); tSub.getCell(COL1).value = `As of ${asOf}`;
    tSub.getCell(COL1).font = { name: FONT, size: 10, color: { argb: INK_SOFT } };

    // --- Precompute the whole vertical layout so the top summary block can
    // reference each group's subtotal row by formula (Alexis 2026-07-03:
    // totals must be visible on open, not buried after a 300-row group). ---
    const SUMMARY_TITLE_ROW = 5;
    const SUMMARY_FIRST = SUMMARY_TITLE_ROW + 1;                 // one row per status
    const SUMMARY_GRAND = SUMMARY_FIRST + orderedKeys.length;    // grand line in summary
    const HEAD_ROW = SUMMARY_GRAND + 2;                          // blank row, then table header
    // group layout: band, rows, subtotal, blank — per status, starting under HEAD_ROW
    const layout = new Map<string, { dataStart: number; dataEnd: number; subtotal: number }>();
    {
      let cursor = HEAD_ROW;
      for (const key of orderedKeys) {
        const n = groups.get(key)!.length;
        const band = cursor + 1;
        const dataStart = band + 1;
        const dataEnd = dataStart + n - 1;
        const subtotal = dataEnd + 1;
        layout.set(key, { dataStart, dataEnd, subtotal });
        cursor = subtotal + 1; // trailing blank row
      }
    }
    const subtotalResults = new Map<string, Map<number, number>>();
    const grandResults = new Map<number, number>();
    for (const key of orderedKeys) {
      const list = groups.get(key)!;
      const totals = new Map<number, number>();
      for (const c of moneyCols) {
        const total = list.reduce((sum, o) => sum + moneyValueForCol(o, c), 0);
        totals.set(c, total);
        grandResults.set(c, (grandResults.get(c) || 0) + total);
      }
      subtotalResults.set(key, totals);
    }

    // Header row
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

    // --- Totals by Status — the roll-up, visible on open ---
    {
      const t = ws.getRow(SUMMARY_TITLE_ROW);
      t.getCell(COL1).value = "Totals by Status";
      t.getCell(COLN).value = "full breakdown below";
      t.getCell(COLN).alignment = { horizontal: "right" };
      t.getCell(COLN).font = { name: FONT, size: 9, color: { argb: INK_SOFT } };
      for (let c = COL1; c <= COLN; c++) {
        const cell = t.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
        if (c === COL1) cell.font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
        cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
      }
      t.height = 20;
      orderedKeys.forEach((key, i) => {
        const r = ws.getRow(SUMMARY_FIRST + i);
        const { subtotal } = layout.get(key)!;
        r.getCell(COL1).value = STATUS_LABEL[key] || key;
        r.getCell(COL1).font = { name: FONT, size: 10, color: { argb: INK } };
        r.getCell(COL1 + 1).value = `${groups.get(key)!.length} opps`;
        r.getCell(COL1 + 1).font = { name: FONT, size: 9, color: { argb: INK_SOFT } };
        for (const c of moneyCols) {
          const L = letterOf(c);
          r.getCell(c).value = { formula: `${L}${subtotal}`, result: subtotalResults.get(key)?.get(c) || 0 } as any;
          r.getCell(c).numFmt = moneyNumFmt;
          r.getCell(c).font = { name: FONT, size: 10, color: { argb: INK } };
          r.getCell(c).alignment = { horizontal: "right" };
        }
      });
      const g = ws.getRow(SUMMARY_GRAND);
      g.getCell(COL1).value = `Total — ${opps.length} opportunities`;
      g.getCell(COL1).font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
      for (const c of moneyCols) {
        const L = letterOf(c);
        const terms = orderedKeys.map((k) => `${L}${layout.get(k)!.subtotal}`).join(",");
        g.getCell(c).value = { formula: terms ? `SUM(${terms})` : "0", result: grandResults.get(c) || 0 } as any;
        g.getCell(c).numFmt = moneyNumFmt;
        g.getCell(c).font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
        g.getCell(c).alignment = { horizontal: "right" };
      }
      for (let c = COL1; c <= COLN; c++) {
        g.getCell(c).border = { top: { style: "thin", color: { argb: LINE } } };
      }
    }

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
          ...years.flatMap((y) => [dollars(o[`revenue${y}`]), dollars(o[`margin${y}`])]),
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

      // Per-group total — make the dollar total row explicit at the bottom of
      // each status section so exports read clearly outside the top roll-up.
      const st = ws.addRow({});
      st.getCell(COL1).value = `Total $ — ${STATUS_LABEL[key] || key} (${list.length} opp${list.length === 1 ? "" : "s"})`;
      ws.mergeCells(st.number, COL1, st.number, col(6));
      for (const c of moneyCols) {
        const L = letterOf(c);
        st.getCell(c).value = { formula: `SUM(${L}${dataStart}:${L}${dataEnd})`, result: subtotalResults.get(key)?.get(c) || 0 } as any;
        st.getCell(c).numFmt = moneyNumFmt;
      }
      for (let c = COL1; c <= COLN; c++) {
        const cell = st.getCell(c);
        cell.font = { name: FONT, bold: true, size: 10, color: { argb: INK } };
        cell.border = { top: { style: "thin", color: { argb: LINE } } };
        if (c === COL1) cell.alignment = { horizontal: "left" };
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
      gt.getCell(c).value = { formula: terms ? `SUM(${terms})` : "0", result: grandResults.get(c) || 0 } as any;
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
