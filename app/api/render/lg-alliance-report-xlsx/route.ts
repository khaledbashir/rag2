/**
 * GET /api/render/lg-alliance-report-xlsx
 *
 * The detailed LG report (Jireh, 2026-08-14) — his "LG ANC Marketing Breakdown
 * Tier Detail" workbook rebuilt from live CRM data instead of by hand.
 *
 * Scoped to Technology deals only, per Jireh: the LG alliance is a Technology
 * partnership, so a Venue Services deal that happens to name LG as the vendor
 * does not belong in the rollup.
 *
 * Three sheets:
 *   Alliance Rollup — every LG opportunity grouped by tier, with the PO,
 *                     cost, 8% alliance fee and LG margin columns from his
 *                     sheet, plus the LG description / business units / notes.
 *   By Fiscal Year  — the money phased across FY2025-FY2032, split open vs won.
 *   Deal Detail     — the flat list with every field, for pivoting.
 *
 * Query params: `?scope=open|won|active|all` (default active = open + won),
 * `?rate=0.08`,
 * `?format=json` for agents and dashboards.
 *
 * Auth-exempt via the /api/render/* allowlist — openable as a direct link.
 */
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { renderCorsHeaders, withRenderCors } from "@/lib/http/renderCors";
import {
  ALLIANCE_RATE_DEFAULT,
  FISCAL_YEARS,
  buildLgAllianceReport,
  businessUnitLabel,
  fiscalYearLabel,
  humanizeStatus,
  normalizeFiscalYears,
  winConfidenceLabel,
  type LgDealInput,
  type LgAllianceReport,
  type ReportScope,
} from "@/services/reports/lgAlliance";
import {
  buildSelection,
  cellValue,
  isRenderable,
  toMirrorColumn,
  type MirrorColumn,
  type ViewColumn,
} from "@/services/reports/viewMirror";
import {
  BAND_STRONG,
  FONT,
  GUTTER,
  INK,
  INK_SOFT,
  LINE,
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

/** Twenty stores currency as micros. */
function dollars(field: any): number | null {
  const micros = field?.amountMicros;
  if (micros === null || micros === undefined) return null;
  return Number(micros) / 1_000_000;
}

/**
 * The saved view the report mirrors. Jireh edits its columns directly, and the
 * Deal Detail sheet follows whatever he leaves there.
 */
const LG_VIEW_ID = "ee5690f5-c80c-4f8c-b0f5-53f5e664eba0";
const OPPORTUNITY_OBJECT_ID = "c779922d-cf25-4a5e-9382-23eb1c02199e";

async function metaGql<T = any>(query: string): Promise<T> {
  const res = await fetch(`${TWENTY_BASE}/metadata`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TWENTY_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e: any) => e.message).join("; "));
  return body.data;
}

export type MirroredColumns = {
  columns: MirrorColumn[];
  /** Columns on the view whose type the sheet cannot render. */
  skipped: string[];
};

/**
 * Reads the view's visible columns, in his order.
 *
 * A failure here must not take the export down — the report is still useful
 * with its own column set — so the caller falls back to no mirroring.
 */
async function fetchViewColumns(): Promise<MirroredColumns> {
  const data = await metaGql<any>(`query {
    getViewFields(viewId: "${LG_VIEW_ID}") { fieldMetadataId position isVisible }
    object(id: "${OPPORTUNITY_OBJECT_ID}") {
      fields(paging: { first: 300 }) { edges { node { id name label type isActive } } }
    }
  }`);

  const fields = new Map<string, any>(
    data.object.fields.edges
      .map((e: any) => e.node)
      .filter((f: any) => f.isActive)
      .map((f: any) => [f.id, f]),
  );

  const columns: MirrorColumn[] = [];
  const skipped: string[] = [];
  const visible = data.getViewFields
    .filter((v: any) => v.isVisible)
    .sort((a: any, b: any) => a.position - b.position);

  for (const viewField of visible) {
    const field = fields.get(viewField.fieldMetadataId);
    if (!field) continue;
    const column: ViewColumn = { fieldName: field.name, label: field.label, type: field.type };
    if (!isRenderable(column)) {
      skipped.push(field.label);
      continue;
    }
    columns.push(toMirrorColumn(column));
  }
  return { columns, skipped };
}

const YEAR_FIELDS = FISCAL_YEARS.map(
  (y) => `revenue${y} { amountMicros } margin${y} { amountMicros }`,
).join(" ");

/** The years the LG FY picklist — and so the sponsorship fields — cover. */
const SPONSORSHIP_YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032] as const;
const SPONSORSHIP_YEAR_FIELDS = SPONSORSHIP_YEARS.map(
  (y) => `sponsorship${y} { amountMicros }`,
).join(" ");

/**
 * Pages the LG opportunities.
 *
 * The cursor orders by `id`, not `createdAt` — ordering on a non-unique column
 * made the cursor skip and repeat pages (203 records came back as 143 rows with
 * 90 unique ids). Any paged read here must order by something unique.
 */
type LgDeal = LgDealInput & { raw: Record<string, any> };

async function fetchLgDeals(mirrored: MirrorColumn[]): Promise<LgDeal[]> {
  // Fields the query already names by hand; the mirror adds only what is new.
  const HAND_SELECTED = [
    "id", "name", "opportunityNumber", "bidStatus", "league", "winConfidence",
    "closeDate", "lgTier", "lgFiscalYear", "lgBusinessUnits", "lgDescription",
    "lgNotes", "poValue", "sponsorshipValue", "totalProjectRevenue",
    "totalProjectMargin", "company",
  ];
  const mirroredSelection = buildSelection(mirrored, HAND_SELECTED);

  const query = `query LgDeals($after: String) {
    opportunities(
      filter: {
        technologyVendorPartner: { eq: "LG" }
        businessUnit: { eq: "TECHNOLOGY" }
      }
      orderBy: { id: AscNullsLast }
      first: 60
      after: $after
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name opportunityNumber bidStatus league winConfidence closeDate
        lgTier lgFiscalYear lgBusinessUnits lgDescription lgNotes
        poValue { amountMicros }
        sponsorshipValue { amountMicros }
        totalProjectRevenue { amountMicros }
        totalProjectMargin { amountMicros }
        ${YEAR_FIELDS}
        ${SPONSORSHIP_YEAR_FIELDS}
        company { name }
        ${mirroredSelection}
      } }
    }
  }`;

  const deals: LgDeal[] = [];
  let after: string | null = null;
  // Bounded so a cursor that ever stops advancing cannot spin forever.
  for (let page = 0; page < 100; page++) {
    const data: any = await gql(query, { after });
    const conn = data.opportunities;
    for (const edge of conn.edges) {
      const n = edge.node;
      const revenueByYear: Record<number, number> = {};
      const marginByYear: Record<number, number> = {};
      const sponsorshipByYear: Record<number, number> = {};
      for (const y of SPONSORSHIP_YEARS) {
        const s = dollars(n[`sponsorship${y}`]);
        if (s) sponsorshipByYear[y] = s;
      }
      for (const y of FISCAL_YEARS) {
        const r = dollars(n[`revenue${y}`]);
        const m = dollars(n[`margin${y}`]);
        if (r) revenueByYear[y] = r;
        if (m) marginByYear[y] = m;
      }
      deals.push({
        id: n.id,
        name: n.name || "(unnamed)",
        opportunityNumber: n.opportunityNumber || null,
        account: n.company?.name || null,
        bidStatus: n.bidStatus || null,
        league: n.league || null,
        winConfidence: n.winConfidence || null,
        awardDate: n.closeDate || null,
        tier: n.lgTier || null,
        fiscalYears: normalizeFiscalYears(n.lgFiscalYear),
        businessUnits: Array.isArray(n.lgBusinessUnits) ? n.lgBusinessUnits : [],
        description: n.lgDescription || null,
        notes: n.lgNotes || null,
        poValue: dollars(n.poValue),
        sponsorshipValue: dollars(n.sponsorshipValue),
        revenue: dollars(n.totalProjectRevenue),
        margin: dollars(n.totalProjectMargin),
        revenueByYear,
        marginByYear,
        sponsorshipByYear,
        raw: n,
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
  // Award dates are stored at midnight UTC; formatting in UTC keeps a
  // March 15 value from rendering as March 14 for a US reader.
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`;
}

function buildWorkbook(
  report: LgAllianceReport,
  scope: ReportScope,
  mirror: MirroredColumns,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ANC";
  const rate = report.allianceRate;
  const asOf = new Date(report.generatedAt).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const scopeLabel =
    scope === "open"
      ? "Open pipeline only"
      : scope === "won"
        ? "Won deals only"
        : scope === "all"
          ? "All LG deals, including lost and no-bid"
          : "Open pipeline and won deals";

  // ---------------------------------------------------------------- sheet 1
  const roll = wb.addWorksheet("Alliance Rollup");
  roll.properties.defaultRowHeight = 16;

  const rollCols: ColumnSpec[] = [
    { header: "Tier", width: 11 },
    { header: "Account", width: 26 },
    { header: "Opportunity", width: 34, wrap: true },
    { header: "FY", width: 16, wrap: true },
    { header: "Status", width: 16 },
    { header: "LG Business Units", width: 22, wrap: true },
    { header: "ANC LG PO", width: 15, money: true },
    { header: "Sponsorship Value", width: 16, money: true },
    { header: "Cost", width: 14, money: true },
    { header: `Alliance ${pct(rate)}`, width: 14, money: true },
    { header: "LG Margin", width: 14, money: true },
    { header: "Description", width: 42, wrap: true },
    { header: "Notes", width: 42, wrap: true },
  ];

  const headRow = writeSheetHeader(roll, {
    title: "LG Alliance — Tier Detail",
    subtitle: `As of ${asOf} · Technology · ${scopeLabel} · alliance rate ${pct(rate)}`,
    headline:
      `${report.totals.deals} LG deals · PO ${usd(report.totals.po)} · ` +
      (report.totals.sponsorship ? `sponsorship ${usd(report.totals.sponsorship)} · ` : "") +
      `alliance ${usd(report.totals.allianceFee)} · LG margin ${usd(report.totals.lgMargin)}`,
    note:
      "LG Margin = ANC margin less the alliance contribution. Cost is revenue less margin. " +
      "Sponsorship Value is reported alongside the PO and is not part of the alliance fee. " +
      (report.rowsWithoutPo
        ? `${report.rowsWithoutPo} of ${report.totals.deals} rows have no Technology Vendor PO Value entered yet and use Revenue — Total Project instead.`
        : "Every row uses an entered Technology Vendor PO Value."),
  });

  writeTableHeader(roll, rollCols, headRow);

  for (const tier of report.tiers) {
    bandRow(roll, rollCols, [
      tier.label,
      `${tier.rows.length} ${tier.rows.length === 1 ? "deal" : "deals"}`,
      null, null, null, null,
      tier.totals.po, tier.totals.sponsorship,
      tier.totals.cost, tier.totals.allianceFee, tier.totals.lgMargin,
      null, null,
    ], { fill: BAND_STRONG });

    tier.rows.forEach((r, i) => {
      const row = dataRow(roll, rollCols, [
        r.tierLabel,
        r.account || "",
        r.opportunityNumber ? `${r.name}  (#${r.opportunityNumber})` : r.name,
        fiscalYearLabel(r.fiscalYears),
        humanizeStatus(r.bidStatus),
        r.businessUnits.map(businessUnitLabel).join(", "),
        r.po,
        r.sponsorshipValue,
        r.cost,
        r.allianceFee,
        r.lgMargin,
        r.description || "",
        r.notes || "",
      ], i);
      if (r.poBasis === "revenue") {
        const cell = row.getCell(7 + GUTTER);
        cell.note = "No Technology Vendor PO Value entered — this is Revenue — Total Project.";
        cell.font = { name: FONT, size: 10, color: { argb: INK_SOFT }, italic: true };
      }
    });
  }

  bandRow(roll, rollCols, [
    "TOTAL", `${report.totals.deals} deals`, null, null, null, null,
    report.totals.po, report.totals.sponsorship,
    report.totals.cost, report.totals.allianceFee, report.totals.lgMargin,
    null, null,
  ], { fill: BAND_STRONG, height: 22 });

  // ---------------------------------------------------------------- sheet 2
  const fy = wb.addWorksheet("By Fiscal Year");
  fy.properties.defaultRowHeight = 16;

  const fyCols: ColumnSpec[] = [
    { header: "Fiscal Year", width: 14 },
    { header: "Open Revenue", width: 16, money: true },
    { header: "Open Margin", width: 15, money: true },
    { header: "Won Revenue", width: 16, money: true },
    { header: "Won Margin", width: 15, money: true },
    { header: "Open Sponsorship", width: 17, money: true },
    { header: "Won Sponsorship", width: 17, money: true },
    { header: "Total Revenue", width: 16, money: true },
    { header: "Cost", width: 15, money: true },
    { header: `Alliance ${pct(rate)}`, width: 15, money: true },
    { header: "LG Margin", width: 15, money: true },
  ];

  const fyHead = writeSheetHeader(fy, {
    title: "LG Alliance — Fiscal Year Phasing",
    subtitle: `As of ${asOf} · ${scopeLabel}`,
    note:
      "Phased from the per-year revenue, margin and sponsorship carried on each deal. " +
      "Sponsorship splits open vs won the same way the project money does.",
  });
  writeTableHeader(fy, fyCols, fyHead);

  const fyRows = report.byFiscalYear.filter(
    (r) => r.revenue !== 0 || r.cost !== 0 || r.sponsorship !== 0,
  );
  fyRows.forEach((r, i) => {
    dataRow(fy, fyCols, [
      `FY${r.year}`,
      r.openRevenue, r.openMargin, r.wonRevenue, r.wonMargin,
      r.openSponsorship, r.wonSponsorship,
      r.revenue, r.cost, r.allianceFee, r.lgMargin,
    ], i);
  });
  const fyTotal = (pick: (r: (typeof fyRows)[number]) => number) =>
    fyRows.reduce((sum, r) => sum + pick(r), 0);
  bandRow(fy, fyCols, [
    "TOTAL",
    fyTotal((r) => r.openRevenue), fyTotal((r) => r.openMargin),
    fyTotal((r) => r.wonRevenue), fyTotal((r) => r.wonMargin),
    fyTotal((r) => r.openSponsorship), fyTotal((r) => r.wonSponsorship),
    fyTotal((r) => r.revenue), fyTotal((r) => r.cost),
    fyTotal((r) => r.allianceFee), fyTotal((r) => r.lgMargin),
  ], { fill: BAND_STRONG, height: 22 });

  // Two supporting breakdowns beneath the year table.
  const sub = (title: string, rows: { label: string; deals: number; po: number; lgMargin: number }[]) => {
    fy.addRow({});
    const h = fy.addRow({});
    h.getCell(1 + GUTTER).value = title;
    h.getCell(1 + GUTTER).font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
    h.height = 20;
    const cols: ColumnSpec[] = [
      { header: "", width: 24 },
      { header: "Deals", width: 10, align: "right" },
      { header: "ANC LG PO", width: 16, money: true },
      { header: "LG Margin", width: 15, money: true },
    ];
    const hr = fy.addRow({});
    cols.forEach((c, i) => {
      const cell = hr.getCell(i + 1 + GUTTER);
      cell.value = c.header;
      cell.font = { name: FONT, bold: true, size: 9, color: { argb: INK_SOFT } };
      cell.alignment = { horizontal: c.align || (c.money ? "right" : "left") };
      cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
    });
    rows.forEach((r, i) => dataRow(fy, cols, [r.label, r.deals, r.po, r.lgMargin], i));
  };
  sub("By LG business unit", report.byBusinessUnit);
  sub("By league", report.byLeague);

  // ---------------------------------------------------------------- sheet 3
  const detail = wb.addWorksheet("Deal Detail");
  detail.properties.defaultRowHeight = 16;

  // The Deal Detail sheet mirrors the saved view: his columns, his order. The
  // report's own arithmetic (the alliance fee and LG margin) is appended, since
  // those are calculated here rather than stored on the opportunity.
  const mirrored = mirror.columns;
  const detailCols: ColumnSpec[] = mirrored.length
    ? [
        { header: "Opp #", width: 11 },
        ...mirrored.map((c) => ({
          header: c.label,
          width: c.width,
          money: c.money,
          wrap: c.wrap,
        })),
        { header: `Alliance ${pct(rate)}`, width: 14, money: true },
        { header: "LG Margin", width: 14, money: true },
      ]
    : LEGACY_DETAIL_COLS(rate);

  const dHead = writeSheetHeader(detail, {
    title: "LG Alliance — Deal Detail",
    subtitle: `As of ${asOf} · ${scopeLabel} · ${report.rows.length} deals`,
    note: mirrored.length
      ? "Mirrors the LG Alliance Detail list in the CRM — the same columns, in the same order, so anything added there lands here. " +
        `Alliance ${pct(rate)} and LG Margin are calculated by this report.` +
        (mirror.skipped.length
          ? ` Not carried across: ${mirror.skipped.join(", ")}.`
          : "")
      : "One row per LG opportunity, straight from the CRM. Technology Vendor PO Value is blank where none has been entered.",
  });
  writeTableHeader(detail, detailCols, dHead);

  report.rows.forEach((r, i) => {
    const raw = (r as unknown as { raw?: Record<string, any> }).raw || {};
    const values = mirrored.length
      ? [
          r.opportunityNumber || "",
          ...mirrored.map((c) => cellValue(c, raw, fmtDate)),
          r.allianceFee,
          r.lgMargin,
        ]
      : LEGACY_DETAIL_VALUES(r);
    dataRow(detail, detailCols, values, i);
  });

  detail.autoFilter = {
    from: { row: dHead, column: 1 + GUTTER },
    to: { row: dHead + report.rows.length, column: detailCols.length + GUTTER },
  };

  return wb;
}

/**
 * The column set the sheet used before it mirrored the view. Kept as the
 * fallback for when the view cannot be read, so a metadata hiccup degrades to
 * the old report instead of no report.
 */
function LEGACY_DETAIL_COLS(rate: number): ColumnSpec[] {
  return [
    { header: "Opp #", width: 11 },
    { header: "Account", width: 26 },
    { header: "Opportunity", width: 38, wrap: true },
    { header: "Tier", width: 11 },
    { header: "FY", width: 16, wrap: true },
    { header: "Status", width: 16 },
    { header: "Win Confidence", width: 13, align: "right" },
    { header: "League", width: 14 },
    { header: "Award Date", width: 14 },
    { header: "Technology Vendor PO Value", width: 18, money: true },
    { header: "Sponsorship Value", width: 16, money: true },
    { header: "Revenue — Total Project", width: 17, money: true },
    { header: "Margin — Total Project", width: 17, money: true },
    { header: `Alliance ${pct(rate)}`, width: 14, money: true },
    { header: "LG Margin", width: 14, money: true },
    { header: "LG Business Units", width: 22, wrap: true },
    { header: "Description", width: 42, wrap: true },
    { header: "Notes", width: 42, wrap: true },
  ];
}

function LEGACY_DETAIL_VALUES(r: LgAllianceReport["rows"][number]): (string | number | null)[] {
  return [
    r.opportunityNumber || "",
    r.account || "",
    r.name,
    r.tier ? r.tierLabel : "",
    fiscalYearLabel(r.fiscalYears),
    humanizeStatus(r.bidStatus),
    winConfidenceLabel(r.winConfidence),
    r.league ? humanizeStatus(r.league) : "",
    fmtDate(r.awardDate),
    r.poValue,
    r.sponsorshipValue,
    r.revenue,
    r.margin,
    r.allianceFee,
    r.lgMargin,
    r.businessUnits.map(businessUnitLabel).join(", "),
    r.description || "",
    r.notes || "",
  ];
}

function usd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const scopeParam = params.get("scope");
    const scope: ReportScope =
      scopeParam === "open" || scopeParam === "won" || scopeParam === "all"
        ? scopeParam
        : "active";
    const rateParam = Number(params.get("rate"));
    const allianceRate =
      Number.isFinite(rateParam) && rateParam > 0 && rateParam < 1
        ? rateParam
        : ALLIANCE_RATE_DEFAULT;

    // A metadata failure must not cost the whole export — fall back to the
    // report's own column set and carry on.
    let mirror: MirroredColumns = { columns: [], skipped: [] };
    try {
      mirror = await fetchViewColumns();
    } catch (error) {
      console.error("[lg-alliance-report] could not read the view columns", error);
    }

    const deals = await fetchLgDeals(mirror.columns);
    const report = buildLgAllianceReport(deals, { allianceRate, scope });

    if (params.get("format") === "json") {
      return withRenderCors(NextResponse.json(report), request);
    }

    const wb = buildWorkbook(report, scope, mirror);
    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);
    return withRenderCors(new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ANC_LG_Alliance_Report_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    }), request);
  } catch (error: any) {
    console.error("[lg-alliance-report] failed", error);
    return withRenderCors(
      NextResponse.json({ error: error?.message || "Failed to build the LG alliance report" }, { status: 500 }),
      request,
    );
  }
}
